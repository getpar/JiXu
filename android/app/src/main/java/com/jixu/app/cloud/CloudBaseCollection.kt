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
            authorizedCall(envId, "POST", CloudEnv.documentsUrl(envId), body)
        } catch (e: IOException) {
            return null // 网络失败：不计数，下次同步补传（§5.4）
        }
        if (resp.code !in 200..299) return null
        val obj = parseJsonObjectOrNull(resp.body) ?: return null
        val ids = obj["insertedIds"] as? JsonArray ?: return null
        return (ids.firstOrNull() as? JsonPrimitive)?.takeIf { it.isString }?.content
    }

    /** 本户文档总数（连通性自检与联调清理用） */
    suspend fun count(ownerId: String): Int = countInternal(envIdProvider(), ownerId)

    /** 删除自己刚插入的联调文档（§5.8 清理用；同步业务从不删除云端文档） */
    suspend fun delete(docId: String): Boolean {
        val envId = envIdProvider()
        val resp = try {
            authorizedCall(envId, "DELETE", "${CloudEnv.documentsUrl(envId)}/${CloudEnv.encode(docId)}", null)
        } catch (e: IOException) {
            return false
        }
        return resp.code in 200..299
    }

    // ==================== 内部 ====================

    private suspend fun countInternal(envId: String, ownerId: String): Int {
        val query = CloudEnv.encode(ownerIdQuery(ownerId))
        val url = "${CloudEnv.documentsUrl(envId)}?query=$query&count=true"
        val resp = authorizedCall(envId, "GET", url, null)
        if (resp.code !in 200..299) throw CloudException("云端计数失败：HTTP ${resp.code} ${resp.body.take(300)}")
        val obj = parseJsonObjectOrNull(resp.body) ?: throw CloudException("云端计数返回不是 JSON")
        val total = obj.numberField("total") ?: throw CloudException("云端计数未返回 total")
        return total.toInt().coerceAtLeast(0)
    }

    private suspend fun fetchPage(envId: String, ownerId: String, offset: Int): List<JsonObject> {
        val query = CloudEnv.encode(ownerIdQuery(ownerId))
        val order = CloudEnv.encode(ORDER_JSON)
        val url = "${CloudEnv.documentsUrl(envId)}?query=$query&order=$order&offset=$offset&limit=$pageSize"
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
