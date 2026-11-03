package com.jixu.app

import android.content.Context
import androidx.room.Room
import com.jixu.app.cloud.CloudBaseAuth
import com.jixu.app.cloud.CloudBaseCollection
import com.jixu.app.cloud.CloudEnv
import com.jixu.app.cloud.HttpTransport
import com.jixu.app.cloud.OkHttpTransport
import com.jixu.app.core.isValidOwnerId
import com.jixu.app.core.newOwnerId
import com.jixu.app.data.PhotoStore
import com.jixu.app.data.PrefsKeys
import com.jixu.app.data.PrefsStore
import com.jixu.app.data.Repository
import com.jixu.app.data.db.AppDatabase
import com.jixu.app.sync.EntitySyncSpec
import com.jixu.app.sync.KVStore
import com.jixu.app.sync.SyncDeps
import com.jixu.app.sync.SyncManager
import com.jixu.app.sync.SyncTrigger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/**
 * 手写依赖装配（开发文档 §3.1 明确不引入依赖注入框架）。
 *
 * 同步链路全部接真云：Repository（本地 Room）→ SyncManager（单飞/节流）→
 * CloudBaseCollection（CloudBase HTTP API）→ 匿名登录态。
 */
class AppContainer(context: Context) {

    private val appContext: Context = context.applicationContext

    /** 应用级协程作用域：同步不随界面销毁而中断 */
    val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    val store: KVStore = PrefsStore(appContext)

    val db: AppDatabase = Room.databaseBuilder(appContext, AppDatabase::class.java, DB_NAME).build()

    /** 照片文件操作在 P7 接入真实实现 */
    val photos: PhotoStore = PhotoStore.Noop

    val transport: HttpTransport = OkHttpTransport()

    val auth: CloudBaseAuth = CloudBaseAuth(transport, store)

    /** 自定义云环境 ID 每次现读，换环境无需重建容器 */
    val cloud: CloudBaseCollection = CloudBaseCollection(
        transport = transport,
        auth = auth,
        envIdProvider = { CloudEnv.resolve(store) },
    )

    private var syncRef: SyncManager? = null

    val repository: Repository = Repository(
        db = db,
        store = store,
        photos = photos,
        sync = object : SyncTrigger {
            override fun pushSoon() {
                syncRef?.pushSoon()
            }
        },
    )

    val syncManager: SyncManager = SyncManager(
        scope = scope,
        depsFactory = { buildDeps() },
    ).also { syncRef = it }

    /** 本机同步码：没有或不合法就生成一个（§7.8） */
    suspend fun ownerId(): String {
        val current = store.get(PrefsKeys.CLOUD_OWNER_ID)
        if (current != null && isValidOwnerId(current)) return current
        val id = newOwnerId()
        store.set(PrefsKeys.CLOUD_OWNER_ID, id)
        return id
    }

    /** 写入同步码（P7「加入/换新码」用），返回是否合法 */
    suspend fun setOwnerId(raw: String): Boolean {
        val id = com.jixu.app.core.normalizeOwnerId(raw)
        if (!isValidOwnerId(id)) return false
        store.set(PrefsKeys.CLOUD_OWNER_ID, id)
        return true
    }

    /** 本机来源标识 `android:<8 位>`：每台手机唯一，清除数据后重新生成（§6.6） */
    suspend fun deviceSource(): String {
        val tag = store.get(PrefsKeys.DEVICE_TAG)?.takeIf { it.isNotBlank() }
            ?: newOwnerId().take(8).also { store.set(PrefsKeys.DEVICE_TAG, it) }
        return "android:$tag"
    }

    /**
     * 每个同步适配器调用都在 Repository 自己的 Room 事务内完成（§6.5）。
     * 安卓没有升级前历史，`legacySources` 恒为空。
     */
    private suspend fun buildDeps(): SyncDeps = SyncDeps(
        cloud = cloud,
        source = deviceSource(),
        ownerId = ownerId(),
        getLocal = { repository.getAllRecords() },
        addLocal = { repository.mergeLocalRecords(it) },
        markLocal = { key, count -> repository.markLocalDeleted(key, count) },
        markAlive = { key, count -> repository.markLocalAlive(key, count) },
        store = store,
        legacySources = emptyList(),
        purgeLocal = { key, count -> repository.purgeLocalRecords(key, count) },
        purges = repository,
        todos = object : EntitySyncSpec {
            override suspend fun getLocal() = repository.getAllTodos()
            override suspend fun apply(items: List<kotlinx.serialization.json.JsonObject>) =
                repository.applyCloudTodos(items)
        },
        recurring = object : EntitySyncSpec {
            override suspend fun getLocal() = repository.getAllRecurringBills()
            override suspend fun apply(items: List<kotlinx.serialization.json.JsonObject>) =
                repository.applyCloudRecurringBills(items)
        },
    )

    private companion object {
        const val DB_NAME = "jixu.db"
    }
}
