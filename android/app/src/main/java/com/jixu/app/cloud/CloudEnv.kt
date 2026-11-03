package com.jixu.app.cloud

import com.jixu.app.sync.KVStore
import java.net.URLEncoder

/**
 * 云环境与网关地址（开发文档 §5.1）。默认环境与小程序 `cloud.ts` 一致；
 * 「自定义云环境 ID（高级）」写 [OVERRIDE_KEY]，空/空白 = 用默认环境。
 */
object CloudEnv {

    const val DEFAULT_ENV_ID = "daily-notes-d3gaotrwyc09ff44a"

    /** DataStore 键，与小程序覆盖键同名 */
    const val OVERRIDE_KEY = "cloud_env_id"

    /** 三端共用的集合 */
    const val COLLECTION = "records"

    /** 当前生效的环境 ID：自定义优先（去首尾空白），否则默认 */
    suspend fun resolve(store: KVStore): String =
        store.get(OVERRIDE_KEY)?.trim()?.takeIf { it.isNotEmpty() } ?: DEFAULT_ENV_ID

    fun gateway(envId: String): String = "https://$envId.api.tcloudbasegateway.com"

    fun documentsUrl(envId: String): String =
        "${gateway(envId)}/v1/database/instances/(default)/databases/(default)/collections/$COLLECTION/documents"

    /** 查询参数一律 URL 编码（括号路径段保留原文） */
    fun encode(raw: String): String = URLEncoder.encode(raw, "UTF-8")
}
