package com.jixu.app.sync

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Test

/** SyncManager + 同步引擎 + 内存模拟云：两台设备共用一本账的端到端冒烟。 */
class SyncManagerMockCloudTest {

    private class MapStore : KVStore {
        private val map = mutableMapOf<String, String>()
        override suspend fun get(key: String): String? = map[key]
        override suspend fun set(key: String, value: String) {
            map[key] = value
        }
    }

    private val owner = "ABCD1EFG2HJK"

    private fun recordJson(id: String) = buildJsonObject {
        put("id", id)
        put("type", "expense")
        put("amount", 25.0)
        put("categoryKey", "food")
        put("categoryName", "餐饮饮食")
        put("subcategoryKey", "lunch")
        put("subcategoryName", "午餐")
        put("note", "")
        put("person", "")
        put("date", "2026-11-03")
        put("createdAt", 1700000000000L)
    }

    @Test
    fun twoDevicesConvergeThroughMockCloud() = runTest {
        val store = MapStore()
        val cloud = MockCloud(store)
        var now = 1_700_000_008_000L

        fun depsFor(local: MutableList<JsonObject>, source: String): SyncDeps = SyncDeps(
            cloud = cloud,
            source = source,
            ownerId = owner,
            getLocal = { local.toList() },
            addLocal = { records ->
                var added = 0
                for (r in records) {
                    if (local.none { it["id"] == r["id"] }) {
                        local += r
                        added++
                    }
                }
                added
            },
            markLocal = { _, _ -> 0 },
            markAlive = { _, _ -> 0 },
            store = store,
            now = { now },
        )

        val localA = mutableListOf(recordJson("1001"))
        val localB = mutableListOf<JsonObject>()
        val a = SyncManager(backgroundScope, { depsFor(localA, "android:AAAA") }, clock = { now })
        val b = SyncManager(backgroundScope, { depsFor(localB, "android:BBBB") }, clock = { now })

        val first = a.syncNow(force = true)
        assertEquals(1, first.pushed)

        now += 1000
        val second = b.syncNow(force = true)
        assertEquals(1, second.pulled)
        assertEquals(1, localB.size)
        val cloudId = (localB[0]["id"] as JsonPrimitive).content
        assertEquals(true, cloudId.startsWith("cloud_"))

        // 再各同步一次：幂等，不重复入账
        now += 1000
        assertEquals(0, a.syncNow(force = true).pushed)
        now += 1000
        val again = b.syncNow(force = true)
        assertEquals(0, again.pushed)
        assertEquals(0, again.pulled)
        assertEquals(1, localB.size)
    }
}
