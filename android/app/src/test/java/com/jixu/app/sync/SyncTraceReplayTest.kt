package com.jixu.app.sync

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.fail
import org.junit.Test

/**
 * 55 次同步录像回放（开发文档 §6.8，fixtures/sync-traces.json）。
 * 回放逻辑见 [SyncReplayHarness]；失败时打印场景名、第几个调用、期望 vs 实际。
 */
class SyncTraceReplayTest {

    @Test
    fun replayAllTraces() = runBlocking {
        val text = javaClass.getResourceAsStream("/sync-traces.json")!!.bufferedReader().use { it.readText() }
        val root = Json.parseToJsonElement(text).jsonObject
        val traces = root["traces"]!!.jsonArray
        val failures = SyncReplayHarness.replayAll(traces, "录像")
        println("回放通过 ${traces.size - failures.size}/${traces.size}")
        if (failures.isNotEmpty()) {
            fail("录像回放失败 ${failures.size}/${traces.size}：\n\n" + failures.joinToString("\n\n"))
        }
    }
}
