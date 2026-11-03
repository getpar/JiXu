package com.jixu.app.sync

import com.jixu.app.core.strOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put

/**
 * 内存模拟云 —— 移植 `cloudCore.ts createMockCloud`（仅测试用）：
 * 自动生成 _id、按 updatedAt 升序返回、无鉴权。
 */
class MockCloud(
    private val store: KVStore,
    private val collectionKey: String = "mock_cloud_records",
) : CloudCollection {

    private var seq = 0

    private suspend fun read(): List<JsonObject> {
        val raw = store.get(collectionKey) ?: return emptyList()
        return Json.parseToJsonElement(raw).let { (it as JsonArray) }.map { it as JsonObject }
    }

    private suspend fun write(list: List<JsonObject>) {
        store.set(collectionKey, JsonArray(list).toString())
    }

    override suspend fun listAll(ownerId: String): List<JsonObject> =
        read()
            .filter { it.strOrNull("ownerId") == ownerId }
            .sortedBy { (it["updatedAt"] as? JsonPrimitive)?.doubleOrNull ?: 0.0 }

    override suspend fun add(doc: JsonObject): String? {
        val list = read().toMutableList()
        val id = "mock_${seq++}"
        list.add(buildJsonObject { doc.forEach { (k, v) -> put(k, v) }; put("_id", id) })
        write(list)
        return id
    }
}
