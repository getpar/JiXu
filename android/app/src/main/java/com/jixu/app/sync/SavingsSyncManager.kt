package com.jixu.app.sync

import com.jixu.app.data.Repository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull

/** 存钱罐同步状态（存钱罐页面右上角展示） */
data class SavingsSyncState(
    val syncing: Boolean = false,
    val lastOk: Boolean? = null,
    val error: String? = null,
    val lastDoneAt: Long = 0,
)

/**
 * 存钱罐独立同步调度：和现有账单 SyncManager 完全分开。
 * 单飞：同一时刻只跑一趟；Android 端只在存钱罐页/冷启动/存钱操作后调用，频率很低。
 */
class SavingsSyncManager(
    private val scope: CoroutineScope,
    private val cloud: CloudCollection,
    private val repository: Repository,
    private val ownerIdProvider: suspend () -> String,
    private val sourceProvider: suspend () -> String,
    private val clock: () -> Long = { System.currentTimeMillis() },
) {

    private val mutex = Mutex()
    private val _state = MutableStateFlow(SavingsSyncState())
    val state: StateFlow<SavingsSyncState> = _state.asStateFlow()

    suspend fun syncNow(force: Boolean = false): SavingsSyncResult = mutex.withLock {
        _state.value = _state.value.copy(syncing = true, error = null)
        try {
            val ownerId = ownerIdProvider()
            if (ownerId.isBlank()) {
                val result = SavingsSyncResult(ok = false, pushed = 0, applied = 0, error = "同步码未设置")
                _state.value = SavingsSyncState(false, false, result.error, clock())
                return@withLock result
            }
            val docs = cloud.listAll(ownerId)
            val local = repository.getAllSavings()
            val plan = SavingsSyncEngine.plan(
                local = local,
                cloudDocs = docs,
                ownerId = ownerId,
                source = sourceProvider(),
            )
            var pushed = 0
            for (doc in plan.push) {
                if (cloud.add(doc) != null) pushed++
            }
            val applied = repository.applyCloudSavings(plan.apply)
            val result = SavingsSyncResult(ok = true, pushed = pushed, applied = applied)
            _state.value = SavingsSyncState(false, true, null, clock())
            result
        } catch (e: Exception) {
            val msg = e.message ?: e.toString()
            _state.value = SavingsSyncState(false, false, msg, clock())
            SavingsSyncResult(ok = false, pushed = 0, applied = 0, error = msg)
        }
    }

    /** 本地存钱写完后异步补传，不阻塞界面 */
    fun pushSoon() {
        scope.launch { runCatching { syncNow(true) } }
    }

    /** 清除数据前等待当前存钱同步结束，避免清完又被在途同步写回。 */
    suspend fun awaitQuiescent(timeoutMs: Long = 10_000) {
        withTimeoutOrNull(timeoutMs) {
            mutex.withLock { /* 等当前同步释放锁即可 */ }
        }
    }
}
