package com.jixu.app.sync

import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * SyncManager 调度语义（§6.7）：单飞、强制排队合并、30 秒节流。
 * 用可控闸门让同步停在 listAll 里，配假时钟断言行为。
 */
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class SyncManagerTest {

    private class FakeStore : KVStore {
        private val map = mutableMapOf<String, String>()
        override suspend fun get(key: String): String? = map[key]
        override suspend fun set(key: String, value: String) {
            map[key] = value
        }
    }

    private fun deps(cloud: CloudCollection, clock: () -> Long): SyncDeps = SyncDeps(
        cloud = cloud,
        source = "android:TESTTEST",
        ownerId = "ABCD1EFG2HJK",
        getLocal = { emptyList() },
        addLocal = { 0 },
        markLocal = { _, _ -> 0 },
        markAlive = { _, _ -> 0 },
        store = FakeStore(),
        now = clock,
    )

    @Test
    fun singleFlightSharesOneRun() = runTest {
        var run = 0
        val gate = Channel<Unit>(Channel.UNLIMITED)
        val manager = SyncManager(
            scope = backgroundScope,
            depsFactory = {
                deps(
                    object : CloudCollection {
                        override suspend fun listAll(ownerId: String): List<JsonObject> {
                            run++
                            gate.receive()
                            return emptyList()
                        }

                        override suspend fun add(doc: JsonObject): String? = "id"
                    },
                    { 1_700_000_000_000 },
                )
            },
            clock = { 1_700_000_000_000 },
        )

        val a = async { manager.syncNow(false) }
        val b = async { manager.syncNow(false) }
        runCurrent()
        assertEquals("两路非强制调用应合并为一趟", 1, run)

        gate.send(Unit)
        runCurrent()
        val ra = a.await()
        val rb = b.await()
        assertTrue(ra.ok)
        assertTrue(rb.ok)
        assertEquals(1, run)
    }

    @Test
    fun forceDuringRunQueuesExactlyOneRerun() = runTest {
        var run = 0
        val gate = Channel<Unit>(Channel.UNLIMITED)
        val manager = SyncManager(
            scope = backgroundScope,
            depsFactory = {
                deps(
                    object : CloudCollection {
                        override suspend fun listAll(ownerId: String): List<JsonObject> {
                            run++
                            val my = run
                            gate.receive()
                            if (my == 2) throw IllegalStateException("boom")
                            return emptyList()
                        }

                        override suspend fun add(doc: JsonObject): String? = "id"
                    },
                    { 1_700_000_000_000 },
                )
            },
            clock = { 1_700_000_000_000 },
        )

        val normal = async { manager.syncNow(false) }
        runCurrent()
        assertEquals(1, run)

        val force1 = async { manager.syncNow(true) }
        val force2 = async { manager.syncNow(true) }
        runCurrent()
        assertEquals("强制请求不立刻另起一趟", 1, run)

        gate.send(Unit) // 第一趟完成 → 补跑第二趟
        runCurrent()
        assertEquals(2, run)
        gate.send(Unit) // 第二趟完成（抛错）
        runCurrent()

        assertTrue(normal.await().ok)
        // 两个强制调用拿到的是「补跑那趟」的结果
        assertFalse(force1.await().ok)
        assertFalse(force2.await().ok)
        assertEquals("多次强制合并为一趟补跑", 2, run)
    }

    @Test
    fun throttleSkipsNonForcedWithin30Seconds() = runTest {
        var now = 1_700_000_000_000L
        var run = 0
        val manager = SyncManager(
            scope = backgroundScope,
            depsFactory = {
                deps(
                    object : CloudCollection {
                        override suspend fun listAll(ownerId: String): List<JsonObject> {
                            run++
                            return emptyList()
                        }

                        override suspend fun add(doc: JsonObject): String? = "id"
                    },
                    { now },
                )
            },
            clock = { now },
        )

        assertTrue(manager.syncNow(false).ok)
        assertEquals(1, run)

        now += 29_999
        val throttled = manager.syncNow(false)
        assertTrue(throttled.ok)
        assertEquals(0, throttled.pushed)
        assertEquals("30 秒内不重复拉", 1, run)

        now += 1 // 正好 30 秒
        manager.syncNow(false)
        assertEquals(2, run)

        now += 1 // 强制同步不受节流限制
        manager.syncNow(true)
        assertEquals(3, run)
    }

    @Test
    fun pushSoonRunsInBackgroundAndDoesNotBlock() = runTest {
        var run = 0
        val manager = SyncManager(
            scope = backgroundScope,
            depsFactory = {
                deps(
                    object : CloudCollection {
                        override suspend fun listAll(ownerId: String): List<JsonObject> {
                            run++
                            return emptyList()
                        }

                        override suspend fun add(doc: JsonObject): String? = "id"
                    },
                    { 1_700_000_000_000 },
                )
            },
            clock = { 1_700_000_000_000 },
        )
        manager.pushSoon()
        runCurrent()
        assertEquals(1, run)
    }
}
