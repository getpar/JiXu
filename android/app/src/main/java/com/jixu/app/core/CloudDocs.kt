package com.jixu.app.core

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * 云端文档 ⇄ 本地行 / 人话摘要 —— 移植 `miniapp/src/utils/cloudCore.ts`：
 * [cloudToLocal]、[localToCloud]、[docLabel]。
 *
 * 引擎内部一律用 JsonObject 流转（开发文档 §6.1），这里只做字段搬运，
 * 语义（`||` 的 JS 真值判断、缺失字段）与源码逐条对齐。
 */

/** 云端记录 → 本地记录格式 */
fun cloudToLocal(r: JsonObject): JsonObject = buildJsonObject {
    val idValue = r["_id"]?.takeIf { jsTruthy(it) }
    val id = idValue?.let { jsTemplateValue(it) } ?: recordKey(r)
    put("id", JsonPrimitive("cloud_$id"))

    putIfPresent("type", r)
    putIfPresent("amount", r)
    putIfPresent("categoryKey", r)
    put("categoryName", JsonPrimitive(jsTemplateValue(jsOr(r["categoryName"], JsonPrimitive("")))))
    putIfPresent("subcategoryKey", r)
    put("subcategoryName", JsonPrimitive(jsTemplateValue(jsOr(r["subcategoryName"], JsonPrimitive("")))))
    put("note", JsonPrimitive(jsTemplateValue(jsOr(r["note"], JsonPrimitive("")))))
    put("person", JsonPrimitive(jsTemplateValue(jsOr(r["person"], JsonPrimitive("")))))
    putIfPresent("date", r)
    // v0.8.7 老云端数据无提交时刻时退用上云时间
    val createdAt = jsOr(r["createdAt"], r["updatedAt"])
    if (createdAt != null) put("createdAt", createdAt)
}

/** 本地记录 → 云端上传格式（不写 _id / _openid，云端自动生成） */
fun localToCloud(r: JsonObject, source: String, now: Long, ownerId: String): JsonObject = buildJsonObject {
    putIfPresent("type", r)
    putIfPresent("amount", r)
    putIfPresent("categoryKey", r)
    putIfPresent("categoryName", r)
    putIfPresent("subcategoryKey", r)
    putIfPresent("subcategoryName", r)
    put("note", JsonPrimitive(jsTemplateValue(jsOr(r["note"], JsonPrimitive("")))))
    put("person", JsonPrimitive(jsTemplateValue(jsOr(r["person"], JsonPrimitive("")))))
    putIfPresent("date", r)
    // v0.8.7 提交时刻随云上云（老本地数据退用上传时刻）
    put("createdAt", jsOr(r["createdAt"], JsonPrimitive(now))!!)
    put("updatedAt", JsonPrimitive(now))
    put("source", JsonPrimitive(source))
    put("ownerId", JsonPrimitive(ownerId))
}

/** 凭证/凭条的人话摘要：云控制台里能看懂这条删/恢复的是哪笔账（引擎不读此字段） */
fun docLabel(r: JsonObject): String {
    val cat = jsTemplateValue(jsOr(r["categoryName"], r["categoryKey"], JsonPrimitive("")))
    val sub = jsTemplateValue(jsOr(r["subcategoryName"], r["subcategoryKey"], JsonPrimitive("")))
    val note = jsTemplateValue(jsOr(r["note"], JsonPrimitive("")))
    val amount = jsNumberOf(r, "amount")
    val tail = if (note.isNotEmpty()) " 备注:$note" else ""
    return "${jsTemplate(r, "date")} $cat/$sub ¥${formatMoneyExact(amount)}$tail"
}

private fun JsonObjectBuilder.putIfPresent(key: String, src: JsonObject) {
    // JS 里 undefined 的属性序列化时消失，null 会保留；这里同样只在字段存在时搬运
    if (src.containsKey(key)) put(key, src[key]!!)
}
