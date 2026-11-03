package com.jixu.app.cloud

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * 一次 HTTP 往返的最小抽象（开发文档 §5）。云逻辑只依赖它，真机走 [OkHttpTransport]，
 * JVM 单测用假传输脚本化响应——登录、401 刷新、分页去重都能在没网的情况下验证。
 */
data class HttpRequest(
    val method: String,
    val url: String,
    val headers: Map<String, String> = emptyMap(),
    val body: String? = null,
)

data class HttpResponse(val code: Int, val body: String)

/** 云接入层能抛出的、需要上层当「同步失败」处理的错误（网络 IO 之外的原因，如最终 401） */
class CloudException(message: String) : Exception(message)

interface HttpTransport {
    suspend fun execute(request: HttpRequest): HttpResponse
}

/** 真机传输：OkHttp，超时够短以便弱网时尽快失败、由下次同步补传 */
class OkHttpTransport(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build(),
) : HttpTransport {

    override suspend fun execute(request: HttpRequest): HttpResponse = withContext(Dispatchers.IO) {
        val builder = okhttp3.Request.Builder().url(request.url)
        for ((name, value) in request.headers) builder.header(name, value)
        val method = request.method.uppercase()
        val body = request.body?.toRequestBody(JSON_MEDIA)
        if (method == "GET" || method == "DELETE") {
            builder.method(method, null)
        } else {
            builder.method(method, body ?: "".toRequestBody(JSON_MEDIA))
        }
        client.newCall(builder.build()).execute().use { resp ->
            HttpResponse(resp.code, resp.body?.string() ?: "")
        }
    }

    private companion object {
        val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    }
}

/** 日志里打码用（token 不进日志） */
fun maskToken(token: String?): String =
    if (token.isNullOrEmpty()) "(none)"
    else if (token.length <= 8) "****"
    else "${token.take(4)}…${token.takeLast(4)}"

/** IO 异常类名 + 消息，用于云同步弹窗与联调输出 */
fun describeError(e: Throwable): String =
    e.message?.takeIf { it.isNotBlank() }?.let { "${e::class.simpleName}: $it" } ?: e::class.simpleName.orEmpty()

internal fun isNetworkError(e: Throwable): Boolean = e is IOException
