package com.jixu.app.cloud

import com.jixu.app.sync.KVStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.URLDecoder
import java.util.concurrent.CopyOnWriteArrayList

/**
 * 真云驱动的行为验证（开发文档 §5.2~§5.4）：用假传输脚本化 CloudBase 的响应，
 * 覆盖 登录 → 计数 → 双字段分页 → `_id` 去重 → EJSON 解码 → 新增 → 401 刷新/重登 → 清理删除。
 * 真实联网的联调见仪器测试 CloudBaseIT。
 */
class CloudBaseCollectionTest {

    // ==================== 假后端 ====================

    private class MapStore : KVStore {
        val map = mutableMapOf<String, String>()
        override suspend fun get(key: String): String? = map[key]
        override suspend fun set(key: String, value: String) {
            map[key] = value
        }

        override suspend fun remove(key: String) {
            map.remove(key)
        }

        override suspend fun clear() {
            map.clear()
        }
    }

    private class FakeBackend : HttpTransport {
        val requests = CopyOnWriteArrayList<HttpRequest>()
        val stored = mutableListOf<JsonObject>()
        var signinCount = 0
        var refreshCount = 0

        /** 所有数据库调用都返回 401（最终鉴权失败的场景） */
        var rejectAllDatabaseCalls = false

        var refreshBroken = false
        var addFails = false

        private var seq = 0
        private val validTokens = mutableSetOf<String>()

        override suspend fun execute(request: HttpRequest): HttpResponse {
            requests += request
            return when {
                request.url.endsWith("/auth/v1/signin/anonymously") -> {
                    signinCount++
                    json(200, authBody(issueToken()))
                }

                request.url.endsWith("/auth/v1/token") -> {
                    refreshCount++
                    if (refreshBroken) json(401, """{"code":"INVALID_CREDENTIALS"}""")
                    else json(200, authBody(issueToken()))
                }

                else -> database(request)
            }
        }

        /** 模拟服务端让已发出的 token 全部过期（真实场景：access_token 到期） */
        fun expireAllTokens() {
            validTokens.clear()
        }

        private fun issueToken(): String = "tok-${++seq}".also { validTokens += it }

        private fun authBody(token: String): String =
            """{"token_type":"Bearer","access_token":"$token","refresh_token":"ref-$token","expires_in":7200,"scope":"anonymous"}"""

        private fun database(request: HttpRequest): HttpResponse {
            val bearer = request.headers["Authorization"]?.removePrefix("Bearer ")
            if (rejectAllDatabaseCalls || bearer == null || bearer !in validTokens) {
                return json(401, """{"code":"INVALID_CREDENTIALS"}""")
            }
            val url = request.url
            val params = queryParams(url)
            return when {
                request.method == "POST" && url.endsWith("/documents") -> {
                    if (addFails) return json(500, """{"code":"INTERNAL"}""")
                    val body = Json.parseToJsonElement(request.body!!).jsonObject
                    val ids = mutableListOf<String>()
                    for (doc in body["data"]!!.jsonArray) {
                        val id = "cloud_id_${stored.size + 1}"
                        stored += JsonObject(doc.jsonObject + ("_id" to JsonPrimitive(id)))
                        ids += id
                    }
                    json(201, buildJsonObject { put("insertedIds", JsonArray(ids.map { JsonPrimitive(it) })) }.toString())
                }

                request.method == "DELETE" -> {
                    val id = URLDecoder.decode(url.substringAfterLast('/'), "UTF-8")
                    val removed = stored.removeAll { (it["_id"] as? JsonPrimitive)?.content == id }
                    json(200, """{"deleted":${if (removed) 1 else 0}}""")
                }

                params["count"] == "true" -> json(200, """{"total":${stored.size}}""")

                else -> {
                    val offset = params["offset"]?.toInt() ?: 0
                    val limit = params["limit"]?.toInt() ?: 100
                    val sorted = stored.sortedWith(compareBy({ it.updatedAtOf() }, { it.idOf() }))
                    val page = sorted.drop(offset).take(limit).toMutableList()
                    // 模拟「同一趟上传的文档 updatedAt 相同、跨页重复」
                    if (offset > 0 && sorted.isNotEmpty()) page.add(0, sorted.first())
                    json(
                        200,
                        buildJsonObject {
                            put("offset", JsonPrimitive(offset))
                            put("limit", JsonPrimitive(limit))
                            put("list", JsonArray(page.map { toEjson(it) }))
                        }.toString(),
                    )
                }
            }
        }

        private fun queryParams(url: String): Map<String, String> {
            val query = url.substringAfter('?', "")
            if (query.isEmpty()) return emptyMap()
            return query.split('&').associate {
                URLDecoder.decode(it.substringBefore('='), "UTF-8") to
                    URLDecoder.decode(it.substringAfter('=', ""), "UTF-8")
            }
        }

        /** 服务端返回强制 Strict EJSON（§5.5） */
        private fun toEjson(doc: JsonObject): JsonObject = buildJsonObject {
            for ((k, v) in doc) {
                val p = v as? JsonPrimitive
                when {
                    p == null -> put(k, v)
                    p.isString -> put(k, v)
                    p.longOrNull != null -> put(k, buildJsonObject { put("\$numberLong", p.content) })
                    else -> put(k, buildJsonObject { put("\$numberDouble", p.content) })
                }
            }
        }

        private fun json(code: Int, body: String) = HttpResponse(code, body)

        private fun JsonObject.idOf(): String = (this["_id"] as? JsonPrimitive)?.content ?: ""
        private fun JsonObject.updatedAtOf(): Long = (this["updatedAt"] as? JsonPrimitive)?.longOrNull ?: 0L
    }

    private class Harness(var now: Long = 1_790_000_000_000L) {
        val backend = FakeBackend()
        val store = MapStore()
        val auth = CloudBaseAuth(backend, store) { now }
        val collection = CloudBaseCollection(backend, auth, envIdProvider = { "daily-notes-test" })
    }

    // ==================== 用例 ====================

    @Test
    fun listAll_countThenPages_dedupesAndDecodesEjson() = runBlocking {
        val h = Harness()
        repeat(250) { i ->
            h.backend.stored += buildJsonObject {
                put("_id", "doc-$i")
                put("ownerId", "ABCD1EFG2HJK")
                put("amount", JsonPrimitive(12.5))
                put("updatedAt", JsonPrimitive(1_790_056_665_029L + i))
                put("date", "2026-11-03")
            }
        }

        val docs = h.collection.listAll("ABCD1EFG2HJK")

        assertEquals("同一 _id 跨页重复必须去重", 250, docs.size)
        assertEquals("doc-0", docs.first()["_id"]?.let { (it as JsonPrimitive).content })

        val first = docs.first()
        assertEquals(12.5, (first["amount"] as JsonPrimitive).doubleOrNull!!, 0.0)
        assertEquals(1_790_056_665_029L, (first["updatedAt"] as JsonPrimitive).longOrNull)
        assertEquals("2026-11-03", (first["date"] as JsonPrimitive).content)

        assertEquals("先 count 再翻页", 1, h.backend.requests.count { it.url.contains("count=true") })

        val pageOffsets = h.backend.requests
            .filter { it.url.contains("offset=") }
            .map { Regex("offset=(\\d+)").find(it.url)!!.groupValues[1].toInt() }
            .sorted()
        assertEquals("偏移按请求页长推进到总数", listOf(0, 100, 200), pageOffsets)

        val pageUrl = h.backend.requests.first { it.url.contains("offset=") }.url
        assertTrue("必须带 updatedAt + _id 双字段排序", pageUrl.contains("updatedAt") && pageUrl.contains("_id"))
        assertTrue("每页 100 条", pageUrl.contains("limit=100"))
        assertTrue("只拉本户", pageUrl.contains("ownerId"))
    }

    @Test
    fun listAll_zeroDocsSkipsPaging() = runBlocking {
        val h = Harness()
        assertTrue(h.collection.listAll("ABCD1EFG2HJK").isEmpty())
        assertEquals(1, h.backend.requests.count { it.url.contains("count=true") })
        assertEquals(0, h.backend.requests.count { it.url.contains("offset=") })
    }

    @Test
    fun add_returnsInsertedId_andNullWhenServerRejects() = runBlocking {
        val h = Harness()
        val doc = buildJsonObject {
            put("ownerId", "ABCD1EFG2HJK")
            put("amount", JsonPrimitive(25.0))
            put("updatedAt", JsonPrimitive(1_790_000_000_000L))
        }
        assertEquals("cloud_id_1", h.collection.add(doc))
        assertEquals("一条一条新增，不改批次", 1, h.backend.stored.size)

        h.backend.addFails = true
        assertNull("失败返回 null（引擎不计数、下次补传）", h.collection.add(doc))
    }

    @Test
    fun unauthorized_refreshesOnceAndRetries() = runBlocking {
        val h = Harness()
        h.collection.listAll("ABCD1EFG2HJK") // 登录 + count
        assertEquals(1, h.backend.signinCount)

        h.backend.expireAllTokens() // 旧 token 全部过期
        h.collection.listAll("ABCD1EFG2HJK")

        assertEquals("401 后刷新一次", 1, h.backend.refreshCount)
        assertEquals("刷新成功就不重新登录", 1, h.backend.signinCount)
        assertEquals(
            "刷新后必须覆盖保存新 refresh_token（旧值立即作废）",
            "ref-tok-2",
            h.store.map["auth_refresh_token"],
        )
    }

    @Test
    fun concurrentUnauthorizedRequests_shareSingleRefresh() = runBlocking {
        val h = Harness()
        h.collection.listAll("ABCD1EFG2HJK")
        h.backend.expireAllTokens() // 4 个并发请求都拿旧 token 撞 401
        (1..4).map { async(Dispatchers.Default) { h.collection.listAll("ABCD1EFG2HJK") } }.awaitAll()
        assertEquals("并发 401 只共用一次刷新", 1, h.backend.refreshCount)
        assertEquals(1, h.backend.signinCount)
    }

    @Test
    fun refreshFails_fallsBackToReSignIn() = runBlocking {
        val h = Harness()
        h.collection.listAll("ABCD1EFG2HJK")
        h.backend.refreshBroken = true
        h.backend.expireAllTokens()
        h.collection.listAll("ABCD1EFG2HJK")
        assertEquals("刷新失败要退回匿名登录", 2, h.backend.signinCount)
        assertEquals(1, h.backend.refreshCount)
    }

    @Test
    fun persistent401_throwsAfterOneRefreshAndOneSignIn() = runBlocking {
        val h = Harness()
        h.collection.listAll("ABCD1EFG2HJK")
        h.backend.rejectAllDatabaseCalls = true
        val error = runCatching { h.collection.listAll("ABCD1EFG2HJK") }.exceptionOrNull()
        assertNotNull("最终 401 必须让本次同步失败", error)
        assertTrue(error is CloudException)
        assertEquals("刷新一次", 1, h.backend.refreshCount)
        assertEquals("再重新登录一次", 2, h.backend.signinCount)
    }

    @Test
    fun tokenRefreshedProactivelyBeforeExpiry() = runBlocking {
        val h = Harness()
        h.collection.listAll("ABCD1EFG2HJK")
        h.now += 7_200_000L // 已到期
        h.collection.listAll("ABCD1EFG2HJK")
        assertEquals("到期前主动刷新，不等 401", 1, h.backend.refreshCount)
    }

    @Test
    fun delete_removesOwnDocAndCountReturnsToBaseline() = runBlocking {
        val h = Harness()
        h.backend.stored += buildJsonObject {
            put("_id", "keep-1")
            put("ownerId", "ABCD1EFG2HJK")
            put("updatedAt", JsonPrimitive(1L))
        }
        assertEquals(1, h.collection.count("ABCD1EFG2HJK"))
        val newId = h.collection.add(
            buildJsonObject {
                put("ownerId", "ABCD1EFG2HJK")
                put("updatedAt", JsonPrimitive(2L))
            },
        )
        assertNotNull(newId)
        assertEquals(2, h.collection.count("ABCD1EFG2HJK"))
        assertTrue(h.collection.delete(newId!!))
        assertEquals("清理后计数回到测试前", 1, h.collection.count("ABCD1EFG2HJK"))
    }

    @Test
    fun envSwitch_dropsStaleLoginState() = runBlocking {
        var env = "env-one"
        val backend = FakeBackend()
        val store = MapStore()
        val auth = CloudBaseAuth(backend, store) { 1_790_000_000_000L }
        val collection = CloudBaseCollection(backend, auth, envIdProvider = { env })

        collection.count("ABCD1EFG2HJK")
        assertEquals(1, backend.signinCount)

        env = "env-two"
        collection.count("ABCD1EFG2HJK")
        assertEquals("换环境必须重新登录", 2, backend.signinCount)

        val dbCallsToNewEnv = backend.requests.filter {
            it.url.contains("env-two.api.tcloudbasegateway.com") && it.url.contains("/v1/database")
        }
        assertTrue("旧环境的 token 不能带到新环境", dbCallsToNewEnv.isNotEmpty())
        assertTrue("新环境请求都带新登录态", dbCallsToNewEnv.all { it.headers.containsKey("Authorization") })
        assertNull(store.map["auth_access_token"]?.takeIf { it == "tok-1" })
    }
}
