package com.jixu.app.cloud

import com.jixu.app.data.PrefsKeys
import com.jixu.app.sync.KVStore
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID

/**
 * CloudBase 匿名登录态（开发文档 §5.2）。
 *
 * - 首次 / 刷新失败 → `POST /auth/v1/signin/anonymously`（带持久化的 x-device-id）
 * - access_token 到期前 5 分钟，或任一请求收到 401 → `POST /auth/v1/token` 刷新
 *   （服务端会同时作废旧 refresh_token，必须覆盖保存）
 * - 「并发请求共用一次刷新」：刷新在 [mutex] 内做，且进锁后复查 token 是否已被别人换过
 * - 401 恢复顺序：先刷新重试 → 刷新也失败（或仍是 401）则重新匿名登录重试 → 仍失败抛 [CloudException]
 * - 换云环境（P7 自定义环境）时清空本机登录态，下次请求自然重新登录
 */
class CloudBaseAuth(
    private val transport: HttpTransport,
    private val kv: KVStore,
    private val clock: () -> Long = { System.currentTimeMillis() },
) {

    data class Token(val access: String, val refresh: String, val expiresAt: Long)

    private val mutex = Mutex()

    @Volatile
    private var token: Token? = null

    /** 当前内存里的登录态属于哪个环境；环境变了就必须重新登录 */
    @Volatile
    private var tokenEnv: String? = null

    /** 取一个可用的 access_token（必要时刷新或重新登录） */
    suspend fun accessToken(envId: String): String {
        prepareEnv(envId)
        currentFresh()?.let { return it }
        return mutex.withLock {
            currentFresh()?.let { return@withLock it }
            ensure(envId, token ?: loadStored())
        }
    }

    /**
     * 某个请求带着 [staleAccess] 收到了 401。返回可以重试的新 token。
     * [forceSignIn] = true 时跳过刷新，直接重新匿名登录（刷新后的 token 仍 401 的兜底）。
     */
    suspend fun recoverAfterUnauthorized(
        envId: String,
        staleAccess: String,
        forceSignIn: Boolean = false,
    ): String {
        prepareEnv(envId)
        return mutex.withLock {
            val cur = token ?: loadStored()
            // 别的协程已经刷新过了：直接用新 token，不再重复刷新
            if (!forceSignIn && cur != null && cur.access != staleAccess && clock() < cur.expiresAt - REFRESH_MARGIN_MS) {
                return@withLock cur.access
            }
            if (forceSignIn) {
                signIn(envId).access
            } else {
                renew(envId, cur)
            }
        }
    }

    /** 清空本机登录态（换环境用） */
    suspend fun clearSession() {
        mutex.withLock {
            token = null
            tokenEnv = null
            kv.remove(PrefsKeys.AUTH_ACCESS_TOKEN)
            kv.remove(PrefsKeys.AUTH_REFRESH_TOKEN)
            kv.remove(PrefsKeys.AUTH_EXPIRES_AT)
        }
    }

    // ==================== 内部 ====================

    /** 环境切换检测：旧环境的 token 立刻作废（内存 + 持久化） */
    private suspend fun prepareEnv(envId: String) {
        val previous = tokenEnv
        if (previous != null && previous != envId) {
            token = null
            kv.remove(PrefsKeys.AUTH_ACCESS_TOKEN)
            kv.remove(PrefsKeys.AUTH_REFRESH_TOKEN)
            kv.remove(PrefsKeys.AUTH_EXPIRES_AT)
        }
        tokenEnv = envId
    }

    private fun currentFresh(): String? {
        val t = token ?: return null
        return t.access.takeIf { clock() < t.expiresAt - REFRESH_MARGIN_MS }
    }

    /** 必须已持有 mutex：还有效就直接用，否则续期 */
    private suspend fun ensure(envId: String, known: Token?): String {
        if (known != null && clock() < known.expiresAt - REFRESH_MARGIN_MS) return known.access
        return renew(envId, known)
    }

    /** 必须已持有 mutex：换一个新 token（刷新失败或没有 refresh_token 就重新匿名登录） */
    private suspend fun renew(envId: String, known: Token?): String {
        if (known != null && known.refresh.isNotEmpty()) {
            // 刷新失败（含 refresh_token 已作废）→ 重新匿名登录
            runCatching { refresh(envId, known.refresh) }.onSuccess { return it.access }
        }
        return signIn(envId).access
    }

    private suspend fun signIn(envId: String): Token {
        val deviceId = kv.get(PrefsKeys.AUTH_DEVICE_ID)?.takeIf { it.isNotBlank() }
            ?: UUID.randomUUID().toString().also { kv.set(PrefsKeys.AUTH_DEVICE_ID, it) }
        val resp = transport.execute(
            HttpRequest(
                method = "POST",
                url = "${CloudEnv.gateway(envId)}/auth/v1/signin/anonymously",
                headers = mapOf(
                    "x-device-id" to deviceId,
                    "Content-Type" to JSON_TYPE,
                ),
                body = "{}",
            ),
        )
        if (resp.code !in 200..299) {
            throw CloudException("匿名登录失败：HTTP ${resp.code} ${resp.body.take(200)}")
        }
        val obj = parseJsonObjectOrNull(resp.body) ?: throw CloudException("匿名登录返回不是 JSON")
        val access = obj.stringField("access_token")?.takeIf { it.isNotEmpty() }
            ?: throw CloudException("匿名登录未返回 access_token")
        val refresh = obj.stringField("refresh_token") ?: ""
        val expiresInSec = obj.numberField("expires_in") ?: DEFAULT_EXPIRES_IN_SEC
        return save(Token(access, refresh, clock() + (expiresInSec.toLong() * 1000L)))
    }

    private suspend fun refresh(envId: String, refreshToken: String): Token {
        val resp = transport.execute(
            HttpRequest(
                method = "POST",
                url = "${CloudEnv.gateway(envId)}/auth/v1/token",
                headers = mapOf("Content-Type" to JSON_TYPE),
                body = jsonObjectOf(
                    "grant_type" to "refresh_token",
                    "refresh_token" to refreshToken,
                ).toString(),
            ),
        )
        if (resp.code !in 200..299) {
            throw CloudException("刷新登录态失败：HTTP ${resp.code} ${resp.body.take(200)}")
        }
        val obj = parseJsonObjectOrNull(resp.body) ?: throw CloudException("刷新登录态返回不是 JSON")
        val access = obj.stringField("access_token")?.takeIf { it.isNotEmpty() }
            ?: throw CloudException("刷新登录态未返回 access_token")
        // 服务端会同时下发新的 refresh_token 并作废旧值，必须覆盖
        val newRefresh = obj.stringField("refresh_token")?.takeIf { it.isNotEmpty() } ?: refreshToken
        val expiresInSec = obj.numberField("expires_in") ?: DEFAULT_EXPIRES_IN_SEC
        return save(Token(access, newRefresh, clock() + (expiresInSec.toLong() * 1000L)))
    }

    private suspend fun loadStored(): Token? {
        val access = kv.get(PrefsKeys.AUTH_ACCESS_TOKEN)?.takeIf { it.isNotEmpty() } ?: return null
        val refresh = kv.get(PrefsKeys.AUTH_REFRESH_TOKEN) ?: ""
        val expiresAt = kv.get(PrefsKeys.AUTH_EXPIRES_AT)?.toLongOrNull() ?: 0L
        return Token(access, refresh, expiresAt).also { token = it }
    }

    private suspend fun save(t: Token): Token {
        token = t
        kv.set(PrefsKeys.AUTH_ACCESS_TOKEN, t.access)
        kv.set(PrefsKeys.AUTH_REFRESH_TOKEN, t.refresh)
        kv.set(PrefsKeys.AUTH_EXPIRES_AT, t.expiresAt.toString())
        return t
    }

    private companion object {
        const val JSON_TYPE = "application/json"
        const val DEFAULT_EXPIRES_IN_SEC = 7200.0

        /** 到期前 5 分钟主动刷新（§5.2） */
        const val REFRESH_MARGIN_MS = 5 * 60 * 1000L
    }
}
