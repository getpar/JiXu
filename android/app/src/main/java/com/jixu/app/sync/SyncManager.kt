package com.jixu.app.sync

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull

/** 本地写完后的推送入口（Repository → SyncManager） */
fun interface SyncTrigger {
    fun pushSoon()
}

/**
 * 同步调度（开发文档 §6.7），与 `storage.ts syncNow` v0.9.6 语义一致：
 * - 单飞：同一时刻只跑一趟；非强制调用直接等这趟
 * - 强制：这趟跑完补跑一趟（多次强制合并为一趟），调用方拿到补跑结果
 * - 节流：非强制且距上次完成 < 30 秒 → 直接返回 ok,0,0
 * - [pushSoon]：应用级协程里异步强制同步，不等待、失败静默
 *
 * [depsFactory] 是挂起函数：每趟同步现读同步码/设备来源（同步码可能在「加入」时被换掉）。
 */
class SyncManager(
    private val scope: CoroutineScope,
    private val depsFactory: suspend () -> SyncDeps,
    private val clock: () -> Long = { System.currentTimeMillis() },
    private val throttleMs: Long = 30_000,
) : SyncTrigger {

    private val lock = Mutex()
    private var running: CompletableDeferred<SyncResult>? = null
    private var queued: CompletableDeferred<SyncResult>? = null
    private var lastDoneAt: Long = 0

    suspend fun syncNow(force: Boolean = false): SyncResult {
        var waitFor: CompletableDeferred<SyncResult>? = null
        var start: CompletableDeferred<SyncResult>? = null
        lock.withLock {
            val cur = running
            when {
                cur != null && !force -> waitFor = cur
                cur != null -> {
                    val q = queued ?: CompletableDeferred<SyncResult>().also { queued = it }
                    waitFor = q
                }
                !force && clock() - lastDoneAt < throttleMs -> return SyncResult(ok = true, pushed = 0, pulled = 0)
                else -> {
                    val d = CompletableDeferred<SyncResult>()
                    running = d
                    start = d
                }
            }
        }
        val existing = waitFor
        if (existing != null) return existing.await()

        val first = start!!
        // 跑在应用级 scope：调用方取消（页面退出）不会打断同步
        scope.launch { drain(first) }
        return first.await()
    }

    /**
     * 清除数据前调用：等当前/排队的同步都结束，避免刚清完又被在途同步把旧账写回（§7.9）。
     * 超时（网络卡住）也放行，界面不能无限等。
     */
    suspend fun awaitQuiescent(timeoutMs: Long = 10_000) {
        val deadline = clock() + timeoutMs
        while (true) {
            val pending = lock.withLock { running ?: queued } ?: return
            val left = deadline - clock()
            if (left <= 0) return
            withTimeoutOrNull(left) { pending.await() } ?: return
        }
    }

    /** 连续跑：每一趟结束后若期间有人请求强制同步，就再补跑一趟（合并）。 */
    private suspend fun drain(first: CompletableDeferred<SyncResult>) {
        var current = first
        var waitersFromPrev: CompletableDeferred<SyncResult>? = null
        while (true) {
            val result = execute()
            val thisRun = current
            var next: CompletableDeferred<SyncResult>? = null
            var newWaiters: CompletableDeferred<SyncResult>? = null
            lock.withLock {
                lastDoneAt = clock()
                newWaiters = queued
                queued = null
                if (newWaiters != null) {
                    val d = CompletableDeferred<SyncResult>()
                    running = d
                    next = d
                } else {
                    running = null
                }
            }
            thisRun.complete(result)
            waitersFromPrev?.complete(result)
            val following = next ?: return
            waitersFromPrev = newWaiters
            current = following
        }
    }

    private suspend fun execute(): SyncResult = try {
        runSync(depsFactory())
    } catch (e: Exception) {
        SyncResult(ok = false, pushed = 0, pulled = 0, error = e.message ?: e.toString())
    }

    override fun pushSoon() {
        // 不等待、不阻塞界面；失败静默，由下次同步补传
        scope.launch { runCatching { syncNow(true) } }
    }
}
