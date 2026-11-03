package com.jixu.app.cloud

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** 云端 JSON 解析小工具（只服务 cloud/ 包） */

internal fun parseJsonObjectOrNull(body: String): JsonObject? =
    runCatching { Json.parseToJsonElement(body) as? JsonObject }.getOrNull()

/** 字符串字段（数字也按 JS `String()` 转，兼容服务端偶尔给字符串化数字） */
internal fun JsonObject.stringField(key: String): String? {
    val p = this[key] as? JsonPrimitive ?: return null
    if (p.isString) return p.content
    p.booleanOrNull?.let { return it.toString() }
    p.doubleOrNull?.let { return it.toString() }
    return null
}

/** 数字字段（服务端有时把数字包成字符串） */
internal fun JsonObject.numberField(key: String): Double? {
    val p = this[key] as? JsonPrimitive ?: return null
    return p.doubleOrNull ?: p.content.toDoubleOrNull()
}

/** 拼一个只含固定字符串键值的对象，避免手写 JSON 转义 */
internal fun jsonObjectOf(vararg pairs: Pair<String, String>): JsonObject = buildJsonObject {
    for ((k, v) in pairs) put(k, v)
}
