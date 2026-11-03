package com.jixu.app.sync

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.fail

/**
 * 同步录像回放器（开发文档 §6.8）：假依赖逐条喂 inputs，每次调用返回录像同位置的 ret，
 * 断言调用序列与返回值完全一致。fixtures 的 55 条录像与临时随机生成的差分录像共用它。
 */
object SyncReplayHarness {

    /** 回放一批录像，返回失败描述（空 = 全过）。 */
    suspend fun replayAll(traces: JsonArray, label: String, verbose: Boolean = true): List<String> {
        val failures = mutableListOf<String>()
        for ((i, element) in traces.withIndex()) {
            val trace = element.jsonObject
            val scenario = trace["scenario"]?.jsonPrimitive?.content ?: "#${i + 1}"
            try {
                replayOne(trace)
                if (verbose) println("[$label ${i + 1}/${traces.size}] OK  $scenario")
            } catch (e: AssertionError) {
                failures += "$scenario\n${e.message}"
            } catch (e: Exception) {
                failures += "$scenario\n${e::class.simpleName}: ${e.message}"
            }
        }
        return failures
    }

    suspend fun replayOne(trace: JsonObject) {
        val scenario = trace["scenario"]?.jsonPrimitive?.content ?: "(unknown scenario)"
        val inputs = trace["inputs"]!!.jsonObject
        val caps = trace["capabilities"]!!.jsonObject
        val expectedCalls = trace["calls"]!!.jsonArray.map { it.jsonObject }
        var cursor = 0

        fun inputList(key: String): List<JsonObject> =
            (inputs[key] as? JsonArray)?.map { deepCopy(it).jsonObject } ?: emptyList()

        val cloudDocs = inputList("cloudDocs")
        val local = inputList("local")
        val pendingPurges = inputList("pendingPurges")
        val todosLocal = inputList("todosLocal")
        val recurringLocal = inputList("recurringLocal")
        val now = inputs["now"]!!.jsonPrimitive.long

        fun capability(name: String): Boolean = caps[name]?.jsonPrimitive?.booleanOrNull ?: false

        /** 记录一次依赖调用，立刻与录像同位置调用比对，并返回录像里的 ret。 */
        fun record(fn: String, args: JsonObject): JsonElement? {
            val index = cursor + 1
            if (cursor >= expectedCalls.size) {
                fail("$scenario 第 $index 个调用（$fn）：录像只有 ${expectedCalls.size} 个调用，引擎多发了")
            }
            val expected = expectedCalls[cursor]
            val actual = buildJsonObject {
                put("fn", fn)
                for ((k, v) in args) put(k, v)
            }
            val expectedWithoutRet = JsonObject(expected.filterKeys { it != "ret" })
            try {
                assertJsonEquals(expectedWithoutRet, actual, "$scenario 第 $index 个调用")
            } catch (e: AssertionError) {
                throw AssertionError("$scenario 第 $index 个调用不一致：\n${e.message}")
            }
            cursor++
            return expected["ret"]
        }

        fun retInt(ret: JsonElement?): Int = (ret as? JsonPrimitive)?.int ?: 0

        fun retStr(ret: JsonElement?): String? =
            (ret as? JsonPrimitive)?.takeIf { it.isString }?.content

        val cloud = object : CloudCollection {
            override suspend fun listAll(ownerId: String): List<JsonObject> = cloudDocs

            override suspend fun add(doc: JsonObject): String? {
                val ret = record("cloud.add", buildJsonObject { put("doc", doc) })
                if (ret == null || ret is JsonNull) return null
                return retStr(ret)
            }
        }

        val store = object : KVStore {
            override fun get(key: String): String? = null
            override fun set(key: String, value: String) {
                record(
                    "store.set",
                    buildJsonObject {
                        put("key", key)
                        put("value", value)
                    },
                )
            }
        }

        val purges = if (capability("purges")) {
            object : PurgeQueue {
                override suspend fun getPending(): List<PendingPurge> = pendingPurges.map { p ->
                    PendingPurge(
                        pid = strOf(p, "pid"),
                        targetKey = strOf(p, "targetKey"),
                        cancelRec = intOf(p, "cancelRec"),
                        cancelTomb = intOf(p, "cancelTomb"),
                        cancelRev = intOf(p, "cancelRev"),
                        label = (p["label"] as? JsonPrimitive)?.takeIf { it.isString }?.content,
                    )
                }

                override suspend fun clearPending(pids: List<String>) {
                    record(
                        "purges.clearPending",
                        buildJsonObject { put("pids", buildJsonArray { pids.forEach { add(JsonPrimitive(it)) } }) },
                    )
                }
            }
        } else {
            null
        }

        fun entitySpec(name: String, localItems: List<JsonObject>): EntitySyncSpec = object : EntitySyncSpec {
            override suspend fun getLocal(): List<JsonObject> = localItems

            override suspend fun apply(items: List<JsonObject>): Int =
                retInt(record("$name.apply", buildJsonObject { put("items", JsonArray(items)) }))
        }

        val deps = SyncDeps(
            cloud = cloud,
            source = trace["source"]!!.jsonPrimitive.content,
            ownerId = trace["ownerId"]!!.jsonPrimitive.content,
            getLocal = { local },
            addLocal = { records ->
                retInt(record("addLocal", buildJsonObject { put("records", JsonArray(records)) }))
            },
            markLocal = { key, count ->
                retInt(
                    record(
                        "markLocal",
                        buildJsonObject {
                            put("key", key)
                            put("count", count)
                        },
                    ),
                )
            },
            markAlive = { key, count ->
                retInt(
                    record(
                        "markAlive",
                        buildJsonObject {
                            put("key", key)
                            put("count", count)
                        },
                    ),
                )
            },
            store = store,
            legacySources = (trace["legacySources"] as? JsonArray)?.map { it.jsonPrimitive.content } ?: emptyList(),
            purgeLocal = if (capability("purgeLocal")) {
                { key, count ->
                    retInt(
                        record(
                            "purgeLocal",
                            buildJsonObject {
                                put("key", key)
                                put("count", count)
                            },
                        ),
                    )
                }
            } else {
                null
            },
            purges = purges,
            todos = if (capability("todos")) entitySpec("todos", todosLocal) else null,
            recurring = if (capability("recurring")) entitySpec("recurring", recurringLocal) else null,
            now = { now },
        )

        val result = runSync(deps)
        val expectedResult = trace["result"]!!.jsonObject
        assertEquals(
            "$scenario 返回 ok（error=${result.error}）",
            expectedResult["ok"]!!.jsonPrimitive.booleanOrNull,
            result.ok,
        )
        assertEquals("$scenario 返回 pushed", intOf(expectedResult, "pushed"), result.pushed)
        assertEquals("$scenario 返回 pulled", intOf(expectedResult, "pulled"), result.pulled)
        if (cursor != expectedCalls.size) {
            val remaining = expectedCalls.drop(cursor).mapNotNull { it["fn"]?.jsonPrimitive?.content }
            fail("$scenario 少调用了 ${expectedCalls.size - cursor} 个：录像剩余 $remaining；返回值 $result")
        }
    }

    // ---- 工具 ----

    private fun deepCopy(el: JsonElement): JsonElement = Json.parseToJsonElement(el.toString())

    private fun strOf(obj: JsonObject, key: String): String =
        (obj[key] as? JsonPrimitive)?.content ?: ""

    private fun intOf(obj: JsonObject, key: String): Int =
        (obj[key] as? JsonPrimitive)?.int ?: 0

    private fun assertJsonEquals(expected: JsonElement?, actual: JsonElement?, path: String) {
        val e = expected?.takeUnless { it is JsonNull }
        val a = actual?.takeUnless { it is JsonNull }
        if (e == null || a == null) {
            if (!(e == null && a == null)) fail("$path：期望 ${e ?: "null"}，实际 ${a ?: "null"}")
            return
        }
        when {
            e is JsonObject && a is JsonObject -> {
                val ek = e.keys.filter { e[it] !is JsonNull }
                val ak = a.keys.filter { a[it] !is JsonNull }
                assertEquals("$path 键集合（期望 ${ek}，实际 ${ak}）", ek.toSet(), ak.toSet())
                for (k in ek) assertJsonEquals(e[k], a[k], "$path.$k")
            }
            e is JsonArray && a is JsonArray -> {
                assertEquals("$path 长度", e.size, a.size)
                for (i in e.indices) assertJsonEquals(e[i], a[i], "$path[$i]")
            }
            e is JsonPrimitive && a is JsonPrimitive -> {
                val eb = e.booleanOrNull
                val ab = a.booleanOrNull
                when {
                    e.isString || a.isString -> assertEquals(path, e.content, a.content)
                    eb != null || ab != null -> assertEquals("$path（期望 ${e.content}，实际 ${a.content}）", eb, ab)
                    else -> assertEquals("$path（期望 ${e.content}，实际 ${a.content}）", e.double, a.double, 0.0)
                }
            }
            else -> fail("$path：类型不一致")
        }
    }
}
