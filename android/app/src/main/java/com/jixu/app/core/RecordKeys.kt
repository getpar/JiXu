package com.jixu.app.core

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull

/**
 * 跨端去重键 —— 必须与桌面端 cloudbase.ts / 小程序 cloudCore.ts 完全一致：
 * `date|amount|subcategoryKey|type`，其中金额是 JS 的 `${amount}`（见 [jsNumberToString]）。
 */
data class RecordKeyPart(
    val date: String,
    val amount: Double,
    val subcategoryKey: String,
    val type: String,
)

fun recordKey(date: String, amount: Double, subcategoryKey: String, type: String): String =
    "$date|${jsNumberToString(amount)}|$subcategoryKey|$type"

/** 云端文档 → 去重键（字段缺失时按 JS 模板字符串语义得到 "undefined"/"null"）。 */
fun recordKey(r: JsonObject): String =
    "${jsTemplate(r, "date")}|${jsNumberToString(jsNumberOf(r, "amount"))}|" +
        "${jsTemplate(r, "subcategoryKey")}|${jsTemplate(r, "type")}"

/** 解析去重键（删除凭证落到本地时用它定位该标哪笔）；必须正好 4 段。 */
fun parseRecordKey(key: String?): RecordKeyPart? {
    val parts = (key ?: "").split('|')
    if (parts.size != 4) return null
    val amount = jsNumber(parts[1])
    if (amount.isNaN()) return null
    return RecordKeyPart(parts[0], amount, parts[2], parts[3])
}

/** JS 模板字符串里的值：缺失 → "undefined"，JSON null → "null"，其余按 JS 语义转字符串。 */
internal fun jsTemplate(obj: JsonObject, key: String): String {
    if (!obj.containsKey(key)) return "undefined"
    return jsTemplateValue(obj[key])
}

internal fun jsTemplateValue(value: JsonElement?): String = when (value) {
    null -> "undefined"
    is JsonNull -> "null"
    is JsonPrimitive -> when {
        value.isString -> value.content
        value.booleanOrNull != null -> value.content
        else -> jsNumberToString(value.doubleOrNull ?: Double.NaN)
    }
    else -> value.toString()
}

/** 读数字字段；缺失/非数字 → NaN（与 JS Number(undefined) 一致）。 */
internal fun jsNumberOf(obj: JsonObject, key: String): Double {
    val p = obj[key] as? JsonPrimitive ?: return Double.NaN
    return p.doubleOrNull ?: Double.NaN
}

/** JS 真值判断（用于复刻 `a || b` 这类写法）。 */
internal fun jsTruthy(value: JsonElement?): Boolean = when (value) {
    null, is JsonNull -> false
    is JsonPrimitive -> when {
        value.isString -> value.content.isNotEmpty()
        value.booleanOrNull != null -> value.booleanOrNull == true
        else -> {
            val d = value.doubleOrNull ?: return false
            d != 0.0 && !d.isNaN()
        }
    }
    else -> true
}

/** 复刻 `obj[key] || fallback`：返回第一个 JS 真值，都没有则 null。 */
internal fun jsFirstTruthy(vararg values: JsonElement?): JsonElement? =
    values.firstOrNull { jsTruthy(it) }

internal fun JsonObject.strOrNull(key: String): String? =
    (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

