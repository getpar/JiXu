package com.jixu.app.cloud

import com.jixu.app.sync.CloudCollection
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.IOException

/**
 * 实现 [CloudCollection] 的真云驱动（开发文档 §5.3、§5.4）。
 *
 * - [listAll]：先 count 拿总数 → 按 `updatedAt` + `_id` 双字段升序、每页 100 拉取，
 *   偏移按**请求页长**推进（不按返回条数，某页返回少也继续推进到总数）；
 *   每批 5 页并发；按 `_id` 去重，顺序 = 首次出现顺序；返回前做 EJSON 解码。
 * - [add]：一次一条（失败语义要求不能批量），返回云端 `_id`，失败返回 null。
 * - [count] / [delete]：连通性自检（§5.7）与联调清理（§5.8）用，业务同步不删云端文档。
 */
class CloudBaseCollection(
    private val transport: HttpTransport,
    private val auth: CloudBaseAuth,
    private val envIdProvider: suspend () -> String,
    private val collectionName: String = CloudEnv.COLLECTION,
    private val pageSize: Int = 100,
    private val pageConcurrency: Int = 5,
) : CloudCollection {

    override suspend fun listAll(ownerId: String): List<JsonObject> {
        val envId = envIdProvider()
        val total = countInternal(envId, ownerId)
        if (total <= 0) return emptyList()

        // 按请求页长推进：0, 100, 200 … < total（返回条数少也不提前退出）
        val offsets = ArrayList<Int>((total + pageSize - 1) / pageSize)
        var offset = 0
        while (offset < total) {
            offsets += offset
            offset += pageSize
        }

        // LinkedHashMap 保留首次出现顺序；同一趟上传的文档 updatedAt 全相同，
        // 只按 updatedAt 翻页时同值文档先后不保证稳定，必须靠 _id 去重防跨页重复
        val merged = LinkedHashMap<String, JsonObject>()
        for (chunk in offsets.chunked(pageConcurrency)) {
            val pages = coroutineScope {
                chunk.map { pageOffset -> async { fetchPage(envId, ownerId, pageOffset) } }.awaitAll()
            }
            for (docs in pages) {
                for (doc in docs) {
                    val id = doc.stringField("_id") ?: continue
                    merged.putIfAbsent(id, doc)
                }
            }
        }
        return merged.values.toList()
    }

    override suspend fun add(doc: JsonObject): String? {
        val envId = envIdProvider()
        val body = buildJsonObject { put("data", JsonArray(listOf(doc))) }.toString()
        val resp = try {
            authorizedCall(envId, "POST", CloudEnv.documentsUrl(envId, collectionName), body)
        } catch (e: IOException) {
            return null // 网络失败：不计数，下次同步补传（§5.4）
        }
        if (resp.code !in 200..299) return null
        val obj = parseJsonObjectOrNull(resp.body) ?: return null
        val ids = obj["insertedIds"] as? JsonArray ?: return null
        return (ids.firstOrNull() as? JsonPrimitive)?.takeIf { it.isString }?.content
    }

    /**
     * 通用条件查询（配对邀请等非账本用途）：按 [query] 的 map 顺序构造查询 JSON，
     * 请求 `documents?query=<encode>&limit=<limit>`，把返回 `list` 逐条 EJSON 解码为 [JsonObject]。
     * 查询失败抛 [CloudException]（与 [listAll] 一致），让调用方区分「没查到」与「查询失败」。
     */
    suspend fun queryDocuments(query: Map<String, String>, limit: Int = 10): List<JsonObject> {
        val envId = envIdProvider()
        val queryJson = buildJsonObject {
            for ((key, value) in query) put(key, value)
        }.toString()
        val url = "${CloudEnv.documentsUrl(envId, collectionName)}?query=${CloudEnv.encode(queryJson)}&limit=$limit"
        val resp = authorizedCall(envId, "GET", url, null)
        if (resp.code !in 200..299) throw CloudException("云端查询失败：HTTP ${resp.code} ${resp.body.take(300)}")
        val obj = parseJsonObjectOrNull(resp.body) ?: throw CloudException("云端查询返回不是 JSON")
        val list = obj["list"] as? JsonArray ?: return emptyList()
        return list.mapNotNull { decodeDoc(it) }
    }

    /**
     * 调用云函数：`POST {gateway}/v1/functions/:name`，body 就是传给云函数的 event 对象。
     * 响应若有 `result` 字段则优先取它（兼容 HTTP 网关包装，result 为 JSON 字符串时也会再解析），
     * 否则取整个响应对象。失败抛 [CloudException]。
     */
    suspend fun invokeFunction(name: String, payload: JsonObject): JsonObject {
        val envId = envIdProvider()
        val resp = try {
            authorizedCall(envId, "POST", CloudEnv.functionUrl(envId, name), payload.toString())
        } catch (e: IOException) {
            throw CloudException("云函数 $name 网络请求失败：${e.message ?: e}")
        }
        if (resp.code !in 200..299) throw CloudException("云函数 $name 调用失败：HTTP ${resp.code} ${resp.body.take(300)}")
        val obj = parseJsonObjectOrNull(resp.body) ?: throw CloudException("云函数 $name 返回不是 JSON")
        // HTTP API 可能直接返回函数对象，也可能包一层 result/data（不同网关版本）
        val result = obj["result"] ?: obj["data"]
        if (result is JsonObject) return result
        if (result is JsonPrimitive && result.isString) {
            parseJsonObjectOrNull(result.content)?.let { return it }
        }
        return obj
    }

    /** 本户文档总数（连通性自检与联调清理用） */
    suspend fun count(ownerId: String): Int = countInternal(envIdProvider(), ownerId)

    /** 删除自己刚插入的联调文档（§5.8 清理用；同步业务从不删除云端文档） */
    suspend fun delete(docId: String): Boolean {
        val envId = envIdProvider()
        val resp = try {
            authorizedCall(envId, "DELETE", "${CloudEnv.documentsUrl(envId, collectionName)}/${CloudEnv.encode(docId)}", null)
        } catch (e: IOException) {
            return false
        }
        return resp.code in 200..299
    }

    // ==================== 内部 ====================

    private suspend fun countInternal(envId: String, ownerId: String): Int {
        val query = CloudEnv.encode(ownerIdQuery(ownerId))
        val url = "${CloudEnv.documentsUrl(envId, collectionName)}?query=$query&count=true"
        val resp = authorizedCall(envId, "GET", url, null)
        if (resp.code !in 200..299) throw CloudException("云端计数失败：HTTP ${resp.code} ${resp.body.take(300)}")
        val obj = parseJsonObjectOrNull(resp.body) ?: throw CloudException("云端计数返回不是 JSON")
        val total = obj.numberField("total") ?: throw CloudException("云端计数未返回 total")
        return total.toInt().coerceAtLeast(0)
    }

    private suspend fun fetchPage(envId: String, ownerId: String, offset: Int): List<JsonObject> {
        val query = CloudEnv.encode(ownerIdQuery(ownerId))
        val order = CloudEnv.encode(ORDER_JSON)
        val url = "${CloudEnv.documentsUrl(envId, collectionName)}?query=$query&order=$order&offset=$offset&limit=$pageSize"
        val resp = authorizedCall(envId, "GET", url, null)
        if (resp.code !in 200..299) throw CloudException("云端分页拉取失败：HTTP ${resp.code} ${resp.body.take(300)}")
        val obj = parseJsonObjectOrNull(resp.body) ?: throw CloudException("云端分页返回不是 JSON")
        val list = obj["list"] as? JsonArray ?: return emptyList()
        return list.mapNotNull { decodeDoc(it) }
    }

    private fun decodeDoc(el: JsonElement): JsonObject? =
        decodeEjson(el) as? JsonObject

    /**
     * 带鉴权的请求。401 处理顺序（§5.2）：
     * 刷新后重试一次 → 重新匿名登录后重试一次 → 仍 401 抛 [CloudException]（本次同步失败）。
     */
    private suspend fun authorizedCall(
        envId: String,
        method: String,
        url: String,
        body: String?,
    ): HttpResponse {
        var access = auth.accessToken(envId)
        var resp = send(method, url, access, body)
        if (resp.code == 401) {
            access = auth.recoverAfterUnauthorized(envId, access, forceSignIn = false)
            resp = send(method, url, access, body)
        }
        if (resp.code == 401) {
            access = auth.recoverAfterUnauthorized(envId, access, forceSignIn = true)
            resp = send(method, url, access, body)
        }
        if (resp.code == 401) throw CloudException("云端鉴权失败（401）")
        return resp
    }

    private suspend fun send(method: String, url: String, access: String, body: String?): HttpResponse =
        transport.execute(
            HttpRequest(
                method = method,
                url = url,
                headers = buildMap {
                    put("Authorization", "Bearer $access")
                    if (body != null) put("Content-Type", "application/json")
                },
                body = body,
            ),
        )

    private fun ownerIdQuery(ownerId: String): String =
        buildJsonObject { put("ownerId", ownerId) }.toString()

    private companion object {
        /** 双字段次序：updatedAt 升序 + _id 升序（v0.9.6 修跨页重复/漏拉） */
        val ORDER_JSON = """[{"field":"updatedAt","direction":"asc"},{"field":"_id","direction":"asc"}]"""
    }
}
