package com.jixu.app.cloud

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * 云端返回强制 Strict EJSON，解码成「和 JS 里一样」的普通 JSON（开发文档 §5.5）：
 * - `{"$numberInt":"25"}` / `{"$numberLong":"1790056665029"}` → 数字
 * - `{"$numberDouble":"12.5"}` → 数字；可能是 `Infinity` / `-Infinity` / `NaN` / 科学计数法
 * - `{"$oid":"…"}` → 字符串
 * - `{"$date":…}` → 毫秒数
 * - 其余原样，递归处理对象与数组
 */
fun decodeEjson(element: JsonElement): JsonElement = when (element) {
    is JsonArray -> buildJsonArray { element.forEach { add(decodeEjson(it)) } }
    is JsonObject -> decodeObject(element)
    else -> element
}

private fun decodeObject(obj: JsonObject): JsonElement {
    if (obj.size == 1) {
        val (key, value) = obj.entries.first()
        val content = (value as? JsonPrimitive)?.takeIf { it.isString }?.content
        when (key) {
            "\$numberInt" -> if (content != null) return JsonPrimitive(content.toLongOrNull() ?: content.toDoubleOrNull() ?: 0L)
            "\$numberLong" -> if (content != null) return JsonPrimitive(content.toLongOrNull() ?: content.toDoubleOrNull() ?: 0L)
            "\$numberDouble" -> if (content != null) return JsonPrimitive(parseJsDouble(content))
            "\$numberDecimal" -> if (content != null) return JsonPrimitive(content.toDoubleOrNull() ?: 0.0)
            "\$oid" -> if (content != null) return JsonPrimitive(content)
            "\$date" -> return decodeDate(value)
        }
    }
    return buildJsonObject {
        for ((k, v) in obj) put(k, decodeEjson(v))
    }
}

private fun decodeDate(value: JsonElement): JsonElement {
    val decoded = decodeEjson(value) // $date 里可能是数字，也可能再包一层 $numberLong
    val number = (decoded as? JsonPrimitive)?.let { p ->
        if (p.isString) p.content.toDoubleOrNull() else p.content.toDoubleOrNull()
    }
    return if (number != null) JsonPrimitive(number.toLong()) else JsonNull
}

/** JS `Number(s)` 的数值解析（含 Infinity / -Infinity / NaN / 科学计数法）。 */
private fun parseJsDouble(raw: String): Double = when (raw) {
    "Infinity", "+Infinity" -> Double.POSITIVE_INFINITY
    "-Infinity" -> Double.NEGATIVE_INFINITY
    "NaN" -> Double.NaN
    else -> raw.toDoubleOrNull() ?: Double.NaN
}
