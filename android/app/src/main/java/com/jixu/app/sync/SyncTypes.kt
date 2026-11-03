package com.jixu.app.sync

import kotlinx.serialization.json.JsonObject

/**
 * 同步引擎的依赖接口 —— 对应 `miniapp/src/utils/cloudCore.ts` 的 SyncDeps / CloudCollection /
 * KVStore / EntitySyncSpec / SyncResult。引擎内部一律用 JsonObject 流转云端文档，
 * 强类型只出现在各自适配器里（开发文档 §6.1）。
 */

/** 云数据库集合的最小操作面：模拟云和真云都实现它 */
interface CloudCollection {
    /** 分页拉取云端属于指定同步码的全部文档（账单记录 + 各种凭证混在一起） */
    suspend fun listAll(ownerId: String): List<JsonObject>

    /** 上传一条文档（账单或凭证），返回云端 _id（失败返回 null） */
    suspend fun add(doc: JsonObject): String?
}

/** 最小键值存储接口：小程序端 = Taro Storage，安卓 = DataStore */
interface KVStore {
    fun get(key: String): String?
    fun set(key: String, value: String)
}

/** 本地待上传的注销凭条队列项（彻底删除时入队，离线也不丢，上传成功后按 pid 清除） */
data class PendingPurge(
    val pid: String,
    val targetKey: String,
    val cancelRec: Int,
    val cancelTomb: Int,
    val cancelRev: Int,
    val label: String? = null,
)

/** 注销凭条队列（对应 cloudCore.ts 的 purges: getPending / clearPending） */
interface PurgeQueue {
    suspend fun getPending(): List<PendingPurge>
    suspend fun clearPending(pids: List<String>)
}

/** 实体同步的两端适配接口（待办 / 周期账单，LWW 快照） */
interface EntitySyncSpec {
    /** 读本地全部实体（含 deleted 软删项），每项必须有稳定 id 和 updatedAt */
    suspend fun getLocal(): List<JsonObject>

    /** 应用云端快照（含 deleted 标记）：按 id 新增/覆盖，返回实际变更数 */
    suspend fun apply(items: List<JsonObject>): Int
}

/**
 * 一次同步的全部依赖。
 *
 * [source] 本端标识，v0.9.6 起每台设备唯一（安卓形如 `android:7KQ2M9XA`）。
 * [legacySources] 升级前用过的共用 source（安卓为空）。
 */
class SyncDeps(
    val cloud: CloudCollection,
    val source: String,
    val ownerId: String,
    val getLocal: suspend () -> List<JsonObject>,
    val addLocal: suspend (records: List<JsonObject>) -> Int,
    val markLocal: suspend (key: String, count: Int) -> Int,
    val markAlive: suspend (key: String, count: Int) -> Int,
    val store: KVStore,
    val legacySources: List<String> = emptyList(),
    val purgeLocal: (suspend (key: String, count: Int) -> Int)? = null,
    val purges: PurgeQueue? = null,
    val todos: EntitySyncSpec? = null,
    val recurring: EntitySyncSpec? = null,
    val now: () -> Long = { System.currentTimeMillis() },
)

data class SyncResult(
    val ok: Boolean,
    /** 本端上传到云端的文档数（含账单与删除凭证） */
    val pushed: Int,
    /** 本端从云端学到的变化数（新增入账 + 标记删除） */
    val pulled: Int,
    val error: String? = null,
)
