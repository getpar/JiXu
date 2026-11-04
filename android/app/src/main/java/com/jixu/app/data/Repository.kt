package com.jixu.app.data

import androidx.room.withTransaction
import com.jixu.app.core.CatFields
import com.jixu.app.core.CategoryGroup
import com.jixu.app.core.CustomCategory
import com.jixu.app.core.advanceDate
import com.jixu.app.core.fillCatNames
import com.jixu.app.core.jsNumberToString
import com.jixu.app.core.jsRound
import com.jixu.app.core.localDateStr
import com.jixu.app.core.mergedCategories
import com.jixu.app.core.parseRecordKey
import com.jixu.app.core.recordKey
import com.jixu.app.core.strOrNull
import com.jixu.app.core.sumAmounts
import com.jixu.app.data.db.AppDatabase
import com.jixu.app.data.db.CustomCategoryEntity
import com.jixu.app.data.db.PendingPurgeEntity
import com.jixu.app.data.db.RecordEntity
import com.jixu.app.data.db.RecurringBillEntity
import com.jixu.app.data.db.TodoEntity
import com.jixu.app.notify.ReminderUpdates
import com.jixu.app.sync.KVStore
import com.jixu.app.sync.PendingPurge
import com.jixu.app.sync.PurgeQueue
import com.jixu.app.sync.SyncTrigger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.put
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.max
import kotlin.random.Random

/** 本机新记一笔的入参（id / createdAt 由 Repository 生成） */
data class NewRecord(
    val type: String,
    val amount: Double,
    val categoryKey: String,
    val categoryName: String,
    val subcategoryKey: String,
    val subcategoryName: String,
    val note: String = "",
    val date: String,
    val person: String = "",
    val createdAt: Long? = null,
    val photo: String? = null,
)

/** 编辑记录：null = 不改该字段 */
data class RecordUpdate(
    val type: String? = null,
    val amount: Double? = null,
    val categoryKey: String? = null,
    val categoryName: String? = null,
    val subcategoryKey: String? = null,
    val subcategoryName: String? = null,
    val note: String? = null,
    val date: String? = null,
    val person: String? = null,
    val photo: String? = null,
)

data class NewRecurringBill(
    val type: String,
    val amount: Double,
    val categoryKey: String,
    val categoryName: String,
    val subcategoryKey: String,
    val subcategoryName: String,
    val note: String = "",
    val cycle: String,
    val nextDate: String,
    val isActive: Boolean = true,
)

data class NewTodo(
    val title: String,
    val cycle: String,
    val nextDate: String,
    val time: String? = null,
    val isActive: Boolean = true,
    val amount: Double? = null,
    val categoryKey: String? = null,
    val categoryName: String? = null,
    val subcategoryKey: String? = null,
    val subcategoryName: String? = null,
    val note: String? = null,
)

data class CategoryStat(val categoryKey: String, val categoryName: String, val total: Double)
data class DailyTotal(val date: String, val total: Double)
data class ExecutedBill(val name: String, val amount: Double)
data class DueSummary(val due: Int, val overdue: Int)

/**
 * 本地读写语义 —— `miniapp/src/utils/storage.ts` 全部导出函数的等价物（开发文档 §6.5、§7.2~§7.9）。
 * 每个写操作在 Room 事务内完成，写完调用 [SyncTrigger.pushSoon]；同步适配器同时实现 §6.5 语义。
 */
class Repository(
    private val db: AppDatabase,
    private val store: KVStore,
    private val photos: PhotoStore = PhotoStore.Noop,
    private val sync: SyncTrigger? = null,
    private val reminders: ReminderUpdates = ReminderUpdates.Noop,
    private val clock: () -> Long = { System.currentTimeMillis() },
    private val today: () -> String = { localDateStr() },
) : PurgeQueue {

    private val lastLocalId = AtomicLong(0)

    // ==================== 账单 CRUD ====================

    suspend fun addRecord(input: NewRecord): String = db.withTransaction {
        val record = insertRecordLocal(input)
        record.id
    }.also { pushSoon() }

    suspend fun deleteRecord(id: String) {
        val changed = db.withTransaction {
            val rec = db.records().byId(id) ?: return@withTransaction false
            if (rec.deleted > 0) return@withTransaction false
            db.records().update(rec.copy(deleted = 1))
            true
        }
        if (changed) pushSoon()
    }

    suspend fun restoreRecord(id: String) {
        val changed = db.withTransaction {
            val rec = db.records().byId(id) ?: return@withTransaction false
            if (rec.deleted <= 0) return@withTransaction false
            db.records().update(rec.copy(deleted = 0, reviveCount = rec.reviveCount + 1))
            true
        }
        if (changed) pushSoon()
    }

    /** 编辑 = 旧行标删 + 新增一行（旧行 createdAt 沿用，排序位置不跳到最前） */
    suspend fun updateRecord(id: String, data: RecordUpdate) {
        val changed = db.withTransaction {
            val old = db.records().byId(id) ?: return@withTransaction false
            if (old.deleted > 0) return@withTransaction false
            val newId = nextLocalId()
            val newRecord = old.copy(
                id = newId,
                type = data.type ?: old.type,
                amount = data.amount ?: old.amount,
                categoryKey = data.categoryKey ?: old.categoryKey,
                categoryName = data.categoryName ?: old.categoryName,
                subcategoryKey = data.subcategoryKey ?: old.subcategoryKey,
                subcategoryName = data.subcategoryName ?: old.subcategoryName,
                note = data.note ?: old.note,
                date = data.date ?: old.date,
                person = data.person ?: old.person,
                createdAt = createdAtOf(old),
                photo = data.photo ?: old.photo,
                deleted = 0,
            )
            db.records().update(old.copy(deleted = 1))
            db.records().upsert(newRecord)
            true
        }
        if (changed) pushSoon()
    }

    /** 彻底删除回收站里的一笔：物理删行 + 生成注销凭条入队（§7.4） */
    suspend fun purgeRecord(id: String) {
        var removed: RecordEntity? = null
        var kept: List<RecordEntity> = emptyList()
        val changed = db.withTransaction {
            val all = db.records().getAll()
            val rec = all.firstOrNull { it.id == id } ?: return@withTransaction false
            if (rec.deleted <= 0) return@withTransaction false
            val v = rec.reviveCount
            val seq = db.pendingPurges().maxSeq() + 1
            db.pendingPurges().upsert(
                PendingPurgeEntity(
                    pid = "p_${clock()}_${randomBase36(8)}",
                    targetKey = recordKey(rec),
                    cancelRec = 1,
                    cancelTomb = 1 + v,
                    cancelRev = v,
                    label = docLabelOf(rec),
                    seq = seq,
                ),
            )
            db.records().deleteById(id)
            removed = rec
            kept = all.filter { it.id != id }
            true
        }
        if (changed) {
            removed?.let { removeOrphanPhotos(listOf(it), kept) }
            pushSoon()
        }
    }

    suspend fun getRecords(): List<RecordEntity> = sortRecordsByTimeDesc(db.records().alive())

    suspend fun getDeletedRecords(): List<RecordEntity> =
        sortRecordsByTimeDesc(db.records().getAll().filter { it.deleted > 0 })

    /** 存活账单的 Room Flow（已按 §7.4 排序），界面直接观察 */
    fun observeAliveRecords(): Flow<List<RecordEntity>> =
        db.records().aliveFlow().map { sortRecordsByTimeDesc(it) }.flowOn(Dispatchers.Default)

    /** 回收站账单的 Room Flow（已按 §7.4 排序） */
    fun observeDeletedRecords(): Flow<List<RecordEntity>> =
        db.records().deletedFlow().map { sortRecordsByTimeDesc(it) }.flowOn(Dispatchers.Default)

    // ==================== 调试入口（仅 debug 包可见） ====================

    /** 一次性插入模拟账单，用于检查账单页滑动性能；不触发同步 */
    suspend fun insertDebugRecords(count: Int) {
        val now = clock()
        val today = today()
        val rows = buildList {
            for (i in 0 until count) {
                val cat = com.jixu.app.core.DEFAULT_CATEGORIES[i % com.jixu.app.core.DEFAULT_CATEGORIES.size]
                val sub = cat.subs[i % cat.subs.size]
                val type = if (i % 10 == 0) "income" else "expense"
                val date = java.time.LocalDate.parse(today).minusDays((i % 365).toLong()).toString()
                add(
                    RecordEntity(
                        id = "debug_${now}_$i",
                        type = type,
                        amount = ((i * 37) % 500_000 + 1) / 100.0,
                        categoryKey = cat.key,
                        categoryName = cat.name,
                        subcategoryKey = sub.key,
                        subcategoryName = sub.name,
                        note = if (i % 3 == 0) "调试数据 $i" else "",
                        date = date,
                        createdAt = now - i,
                    ),
                )
            }
        }
        db.withTransaction { db.records().insertIgnore(rows) }
    }

    suspend fun clearDebugRecords() = db.withTransaction { db.records().deleteDebug() }

    // ==================== 统计 ====================

    suspend fun getMonthTotal(month: String, type: String? = null): Double =
        sumAmounts(
            db.records().aliveInMonth(month)
                .filter { type == null || it.type == type }
                .map { it.amount }
                .toDoubleArray(),
        )

    suspend fun getMonthStats(month: String, type: String? = null, level: String = "cat"): List<CategoryStat> {
        val records = sortRecordsByTimeDesc(db.records().aliveInMonth(month))
            .filter { type == null || it.type == type }
        val map = LinkedHashMap<String, CategoryStat>()
        val cents = LinkedHashMap<String, Double>()
        for (r in records) {
            val key = if (level == "sub") r.subcategoryKey else r.categoryKey
            val name = if (level == "sub") r.subcategoryName.ifEmpty { r.categoryName } else r.categoryName
            if (key.isEmpty()) continue
            if (map[key] == null) {
                map[key] = CategoryStat(key, name, 0.0)
                cents[key] = 0.0
            }
            if (r.amount.isFinite()) cents[key] = (cents[key] ?: 0.0) + jsRound(r.amount * 100)
        }
        return map.values.map { it.copy(total = (cents[it.categoryKey] ?: 0.0) / 100) }
            .sortedByDescending { it.total }
    }

    suspend fun getDailyTrend(month: String, type: String? = null): List<DailyTotal> {
        val records = db.records().aliveInMonth(month).filter { type == null || it.type == type }
        val cents = LinkedHashMap<String, Double>()
        for (r in records) {
            if (!r.amount.isFinite()) continue
            cents[r.date] = (cents[r.date] ?: 0.0) + jsRound(r.amount * 100)
        }
        return cents.entries
            .map { DailyTotal(it.key, it.value / 100) }
            .sortedBy { it.date }
    }

    // ==================== 分类 ====================

    suspend fun getMergedCategories(): List<CategoryGroup> = mergedCategories(
        db.customCategories().getAll().map {
            CustomCategory(it.categoryKey, it.categoryName, it.subcategoryKey, it.subcategoryName)
        },
    )

    /** 自定义分类的 Room Flow（分类管理页实时刷新；只存本机） */
    fun observeCustomCategories(): Flow<List<CustomCategoryEntity>> =
        db.customCategories().allFlow().flowOn(Dispatchers.Default)

    /** 合并分类表的 Room Flow（周期账单 / 待办添加弹窗用） */
    fun observeMergedCategories(): Flow<List<CategoryGroup>> =
        db.customCategories().allFlow()
            .map { rows ->
                mergedCategories(
                    rows.map { CustomCategory(it.categoryKey, it.categoryName, it.subcategoryKey, it.subcategoryName) },
                )
            }
            .flowOn(Dispatchers.Default)

    suspend fun addCustomCategory(catKey: String, catName: String, subKey: String, subName: String) {
        db.withTransaction {
            val seq = db.customCategories().maxSeq() + 1
            db.customCategories().upsert(
                CustomCategoryEntity(
                    subcategoryKey = subKey,
                    categoryKey = catKey,
                    categoryName = catName,
                    subcategoryName = subName,
                    seq = seq,
                ),
            )
        }
    }

    suspend fun deleteCustomCategory(subKey: String) {
        db.customCategories().deleteBySubKey(subKey)
    }

    suspend fun isCustomCategory(subKey: String): Boolean =
        db.customCategories().getAll().any { it.subcategoryKey == subKey }

    // ==================== 预算 ====================

    suspend fun getBudget(): Double = store.get("budget")?.toDoubleOrNull() ?: 0.0

    suspend fun setBudget(value: Double) {
        if (value == 0.0) store.remove("budget") else store.set("budget", value.toString())
    }

    // ==================== 周期账单 ====================

    suspend fun getRecurringBills(): List<RecurringBillEntity> =
        db.recurringBills().getAll().filter { it.deleted == 0 }

    fun observeRecurringBills(): Flow<List<RecurringBillEntity>> =
        db.recurringBills().allFlow()
            .map { rows -> rows.filter { it.deleted == 0 } }
            .flowOn(Dispatchers.Default)

    suspend fun addRecurringBill(input: NewRecurringBill) {
        db.withTransaction {
            db.recurringBills().upsert(
                RecurringBillEntity(
                    id = "a_${clock()}_${randomBase36(6)}",
                    type = input.type,
                    amount = input.amount,
                    categoryKey = input.categoryKey,
                    categoryName = input.categoryName,
                    subcategoryKey = input.subcategoryKey,
                    subcategoryName = input.subcategoryName,
                    note = input.note,
                    cycle = input.cycle,
                    nextDate = input.nextDate,
                    isActive = input.isActive,
                    updatedAt = clock(),
                ),
            )
        }
        pushSoon()
    }

    suspend fun deleteRecurringBill(id: String) {
        db.withTransaction {
            val bill = db.recurringBills().byId(id) ?: return@withTransaction
            db.recurringBills().upsert(bill.copy(deleted = 1, updatedAt = clock()))
        }
        pushSoon()
    }

    suspend fun toggleRecurringBill(id: String, active: Boolean) {
        db.withTransaction {
            val bill = db.recurringBills().byId(id) ?: return@withTransaction
            db.recurringBills().upsert(bill.copy(isActive = active, updatedAt = clock()))
        }
        pushSoon()
    }

    /** 手动「立即记录」：账单行与回执同一事务；只推一个周期 */
    suspend fun executeRecurringBill(id: String) {
        val changed = db.withTransaction {
            val bill = db.recurringBills().byId(id) ?: return@withTransaction false
            if (bill.deleted > 0 || !bill.isActive) return@withTransaction false
            recordFromBill(bill, bill.note, today())
            db.recurringBills().upsert(
                bill.copy(
                    lastExecutedFor = bill.nextDate,
                    nextDate = advanceDate(bill.nextDate, bill.cycle),
                    updatedAt = clock(),
                ),
            )
            true
        }
        if (changed) pushSoon()
    }

    /** 到期自动执行（§7.2）：同一到期期只记一次，回执与账单同事务落盘 */
    suspend fun checkAndExecuteDueBills(): List<ExecutedBill> {
        var executed: List<ExecutedBill> = emptyList()
        val changed = db.withTransaction {
            val bills = db.recurringBills().getAll()
            val today = today()
            val result = mutableListOf<ExecutedBill>()
            var dirty = false
            for (bill in bills) {
                if (bill.deleted > 0 || !bill.isActive || bill.nextDate > today) continue
                dirty = true
                if (bill.lastExecutedFor == bill.nextDate) {
                    db.recurringBills().upsert(
                        bill.copy(nextDate = fastForwardPast(bill.nextDate, bill.cycle, today), updatedAt = clock()),
                    )
                    continue
                }
                val rec = recordFromBill(bill, "[周期] ${bill.note}", today)
                db.recurringBills().upsert(
                    bill.copy(
                        lastExecutedFor = bill.nextDate,
                        nextDate = fastForwardPast(bill.nextDate, bill.cycle, today),
                        updatedAt = clock(),
                    ),
                )
                result += ExecutedBill(rec.subcategoryName.ifEmpty { rec.categoryName }, bill.amount)
            }
            executed = result
            dirty
        }
        if (changed) pushSoon()
        return executed
    }

    // ==================== 待办 ====================

    suspend fun getTodos(): List<TodoEntity> = db.todos().getAll().filter { it.deleted == 0 }

    fun observeTodos(): Flow<List<TodoEntity>> =
        db.todos().allFlow()
            .map { rows -> rows.filter { it.deleted == 0 } }
            .flowOn(Dispatchers.Default)

    suspend fun addTodo(input: NewTodo) {
        db.withTransaction {
            db.todos().upsert(
                TodoEntity(
                    id = "a_${clock()}_${randomBase36(6)}",
                    title = input.title,
                    cycle = input.cycle,
                    nextDate = input.nextDate,
                    time = input.time,
                    isActive = input.isActive,
                    amount = input.amount,
                    categoryKey = input.categoryKey,
                    categoryName = input.categoryName,
                    subcategoryKey = input.subcategoryKey,
                    subcategoryName = input.subcategoryName,
                    note = input.note,
                    completedDates = "[]",
                    createdAt = today(),
                    updatedAt = clock(),
                ),
            )
        }
        pushSoon()
        reminders.rescheduleSoon()
    }

    suspend fun deleteTodo(id: String) {
        db.withTransaction {
            val todo = db.todos().byId(id) ?: return@withTransaction
            db.todos().upsert(todo.copy(deleted = 1, updatedAt = clock()))
        }
        pushSoon()
        reminders.rescheduleSoon()
    }

    suspend fun toggleTodo(id: String, active: Boolean) {
        db.withTransaction {
            val todo = db.todos().byId(id) ?: return@withTransaction
            db.todos().upsert(todo.copy(isActive = active, updatedAt = clock()))
        }
        pushSoon()
        reminders.rescheduleSoon()
    }

    /** 完成待办：今天已完成过则忽略；有关联金额则自动记一笔支出（§7.2） */
    suspend fun completeTodo(id: String) {
        val changed = db.withTransaction {
            val todo = db.todos().byId(id) ?: return@withTransaction false
            if (todo.deleted > 0) return@withTransaction false
            val today = today()
            val dates = parseDates(todo.completedDates).toMutableList()
            if (today in dates) return@withTransaction false
            dates += today

            val amount = todo.amount
            if (amount != null && amount > 0 && !todo.categoryKey.isNullOrEmpty() && !todo.subcategoryKey.isNullOrEmpty()) {
                val cats = db.customCategories().getAll().map {
                    CustomCategory(it.categoryKey, it.categoryName, it.subcategoryKey, it.subcategoryName)
                }
                val filled = fillCatNames(
                    CatFields(
                        categoryKey = todo.categoryKey,
                        categoryName = todo.categoryName ?: "",
                        subcategoryKey = todo.subcategoryKey ?: "",
                        subcategoryName = todo.subcategoryName ?: "",
                    ),
                    mergedCategories(cats),
                )
                insertRecordLocal(
                    NewRecord(
                        type = "expense",
                        amount = amount,
                        categoryKey = filled.categoryKey,
                        categoryName = filled.categoryName,
                        subcategoryKey = filled.subcategoryKey,
                        subcategoryName = filled.subcategoryName,
                        note = "[待办] ${todo.title}${if (!todo.note.isNullOrEmpty()) " · " + todo.note else ""}",
                        date = today,
                    ),
                )
            }

            val nextDate = if (todo.cycle == "once") todo.nextDate else advanceDate(todo.nextDate, todo.cycle)
            db.todos().upsert(
                todo.copy(
                    completedDates = encodeDates(dates),
                    isActive = if (todo.cycle == "once") false else todo.isActive,
                    nextDate = nextDate,
                    updatedAt = clock(),
                ),
            )
            true
        }
        if (changed) {
            pushSoon()
            reminders.rescheduleSoon()
        }
    }

    suspend fun getDueSummary(): DueSummary {
        val today = today()
        var due = 0
        var overdue = 0
        for (t in db.todos().getAll()) {
            if (t.deleted > 0 || !t.isActive) continue
            if (today in parseDates(t.completedDates)) continue
            if (t.nextDate == today) due++ else if (t.nextDate < today) overdue++
        }
        return DueSummary(due, overdue)
    }

    // ==================== 清除本机数据（§7.9） ====================
    suspend fun clearAllLocalData() {
        db.withTransaction {
            db.records().clear()
            db.todos().clear()
            db.recurringBills().clear()
            db.customCategories().clear()
            db.pendingPurges().clear()
        }
        store.clear()
        photos.clearAll()
        lastLocalId.set(0)
        reminders.cancelAll()
    }

    // ==================== 同步适配器（§6.5） ====================

    /** 读本地全部账单（含回收站），按 §7.4 统一排序 */
    suspend fun getAllRecords(): List<JsonObject> = sortRecordsByTimeDesc(syncRows()).map { it.toLocalJson() }

    /** 云端记录写入本地：id 已存在就跳过；返回实际新增数 */
    suspend fun mergeLocalRecords(records: List<JsonObject>): Int = db.withTransaction {
        val seen = syncRows().mapTo(HashSet()) { it.id }
        var added = 0
        for (r in records) {
            val rawId = r.strOrNull("id")
            val id = rawId ?: "c_${clock()}_$added"
            if (rawId != null && id in seen) continue
            db.records().upsert(r.toRecordEntity(id))
            if (rawId != null) seen.add(rawId)
            added++
        }
        added
    }

    suspend fun markLocalDeleted(key: String, count: Int): Int {
        if (parseRecordKey(key) == null) return 0
        return db.withTransaction {
            val rows = sortRecordsByTimeDesc(syncRows())
            var marked = 0
            for (r in rows) {
                if (marked >= count) break
                if (r.deleted > 0) continue
                if (recordKey(r) != key) continue
                db.records().update(r.copy(deleted = 1))
                marked++
            }
            marked
        }
    }

    suspend fun markLocalAlive(key: String, count: Int): Int {
        if (parseRecordKey(key) == null) return 0
        return db.withTransaction {
            val rows = sortRecordsByTimeDesc(syncRows())
            var revived = 0
            for (r in rows) {
                if (revived >= count) break
                if (r.deleted <= 0) continue
                if (recordKey(r) != key) continue
                db.records().update(r.copy(deleted = 0, reviveCount = r.reviveCount + 1))
                revived++
            }
            revived
        }
    }

    /** 消费对端注销凭条：先删回收站行、再删同号存活行（各按 §7.4 顺序） */
    suspend fun purgeLocalRecords(key: String, count: Int): Int {
        if (parseRecordKey(key) == null) return 0
        var removed: List<RecordEntity> = emptyList()
        var kept: List<RecordEntity> = emptyList()
        val deletedCount = db.withTransaction {
            val all = sortRecordsByTimeDesc(syncRows())
            val doomed = mutableListOf<RecordEntity>()
            for (r in all) {
                if (doomed.size >= count) break
                if (r.deleted > 0 && recordKey(r) == key) doomed += r
            }
            for (r in all) {
                if (doomed.size >= count) break
                if (r.deleted <= 0 && recordKey(r) == key) doomed += r
            }
            if (doomed.isEmpty()) return@withTransaction 0
            for (r in doomed) db.records().deleteById(r.id)
            val doomedIds = doomed.mapTo(HashSet()) { it.id }
            removed = doomed
            kept = all.filter { it.id !in doomedIds }
            doomed.size
        }
        if (deletedCount > 0) removeOrphanPhotos(removed, kept)
        return deletedCount
    }

    override suspend fun getPending(): List<PendingPurge> =
        db.pendingPurges().getAll().map {
            PendingPurge(it.pid, it.targetKey, it.cancelRec, it.cancelTomb, it.cancelRev, it.label)
        }

    override suspend fun clearPending(pids: List<String>) {
        if (pids.isNotEmpty()) db.pendingPurges().deleteByPids(pids)
    }

    suspend fun getAllTodos(): List<JsonObject> = db.todos().getAll().map { it.toSnapshotJson() }

    suspend fun applyCloudTodos(items: List<JsonObject>): Int = db.withTransaction {
        val cats = mergedCategories(
            db.customCategories().getAll().map {
                CustomCategory(it.categoryKey, it.categoryName, it.subcategoryKey, it.subcategoryName)
            },
        )
        var changed = 0
        for (it in items) {
            val id = it.strOrNull("id") ?: continue
            val filled = fillCatNames(
                CatFields(
                    categoryKey = it.strOrNull("categoryKey") ?: "",
                    categoryName = it.strOrNull("categoryName") ?: "",
                    subcategoryKey = it.strOrNull("subcategoryKey") ?: "",
                    subcategoryName = it.strOrNull("subcategoryName") ?: "",
                ),
                cats,
            )
            val dates = (it["completedDates"] as? JsonArray)
                ?.mapNotNull { d -> (d as? JsonPrimitive)?.contentOrNull }
                ?: emptyList()
            db.todos().upsert(
                TodoEntity(
                    id = id,
                    title = it.strOrNull("title") ?: "",
                    cycle = it.strOrNull("cycle") ?: "",
                    nextDate = it.strOrNull("nextDate") ?: "",
                    time = it.strOrNull("time")?.takeIf { v -> v.isNotEmpty() },
                    isActive = (it["isActive"] as? JsonPrimitive)?.booleanOrNull ?: false,
                    amount = (it["amount"] as? JsonPrimitive)?.doubleOrNull,
                    categoryKey = filled.categoryKey.ifEmpty { null },
                    categoryName = filled.categoryName.ifEmpty { null },
                    subcategoryKey = filled.subcategoryKey.ifEmpty { null },
                    subcategoryName = filled.subcategoryName.ifEmpty { null },
                    note = it.strOrNull("note"),
                    completedDates = encodeDates(dates),
                    createdAt = it.strOrNull("createdAt") ?: "",
                    updatedAt = (it["updatedAt"] as? JsonPrimitive)?.doubleOrNull?.toLong(),
                    deleted = if (isJsonTruthy(it["deleted"])) 1 else 0,
                ),
            )
            changed++
        }
        changed
    }.also {
        if (it > 0) reminders.rescheduleSoon()
    }

    suspend fun getAllRecurringBills(): List<JsonObject> = db.recurringBills().getAll().map { it.toSnapshotJson() }

    suspend fun applyCloudRecurringBills(items: List<JsonObject>): Int = db.withTransaction {
        val cats = mergedCategories(
            db.customCategories().getAll().map {
                CustomCategory(it.categoryKey, it.categoryName, it.subcategoryKey, it.subcategoryName)
            },
        )
        var changed = 0
        for (it in items) {
            val id = it.strOrNull("id") ?: continue
            val filled = fillCatNames(
                CatFields(
                    categoryKey = it.strOrNull("categoryKey") ?: "",
                    categoryName = it.strOrNull("categoryName") ?: "",
                    subcategoryKey = it.strOrNull("subcategoryKey") ?: "",
                    subcategoryName = it.strOrNull("subcategoryName") ?: "",
                ),
                cats,
            )
            db.recurringBills().upsert(
                RecurringBillEntity(
                    id = id,
                    type = it.strOrNull("type") ?: "",
                    amount = (it["amount"] as? JsonPrimitive)?.doubleOrNull ?: 0.0,
                    categoryKey = filled.categoryKey,
                    categoryName = filled.categoryName,
                    subcategoryKey = filled.subcategoryKey,
                    subcategoryName = filled.subcategoryName,
                    note = it.strOrNull("note") ?: "",
                    cycle = it.strOrNull("cycle") ?: "",
                    nextDate = it.strOrNull("nextDate") ?: "",
                    isActive = (it["isActive"] as? JsonPrimitive)?.booleanOrNull ?: false,
                    lastExecutedFor = it.strOrNull("lastExecutedFor"),
                    updatedAt = (it["updatedAt"] as? JsonPrimitive)?.doubleOrNull?.toLong(),
                    deleted = if (isJsonTruthy(it["deleted"])) 1 else 0,
                ),
            )
            changed++
        }
        changed
    }

    // ==================== 内部 ====================

    /** 同步适配器读本地行：调试模拟账单（id `debug_…`）只用于滑动性能检查，永不参与对账 */
    private suspend fun syncRows(): List<RecordEntity> =
        db.records().getAll().filterNot { it.id.startsWith("debug_") }

    private suspend fun insertRecordLocal(input: NewRecord): RecordEntity {
        val id = nextLocalId()
        val record = RecordEntity(
            id = id,
            type = input.type,
            amount = input.amount,
            categoryKey = input.categoryKey,
            categoryName = input.categoryName,
            subcategoryKey = input.subcategoryKey,
            subcategoryName = input.subcategoryName,
            note = input.note,
            date = input.date,
            person = input.person,
            createdAt = input.createdAt?.takeIf { it != 0L } ?: id.toLong(),
            photo = input.photo,
        )
        db.records().upsert(record)
        return record
    }

    /** 周期账单记账：分类名先补全，再写一笔 */
    private suspend fun recordFromBill(bill: RecurringBillEntity, note: String, date: String): RecordEntity {
        val cats = db.customCategories().getAll().map {
            CustomCategory(it.categoryKey, it.categoryName, it.subcategoryKey, it.subcategoryName)
        }
        val b = fillCatNames(
            CatFields(bill.categoryKey, bill.categoryName, bill.subcategoryKey, bill.subcategoryName),
            mergedCategories(cats),
        )
        return insertRecordLocal(
            NewRecord(
                type = bill.type,
                amount = bill.amount,
                categoryKey = b.categoryKey,
                categoryName = b.categoryName,
                subcategoryKey = b.subcategoryKey,
                subcategoryName = b.subcategoryName,
                note = note,
                date = date,
            ),
        )
    }

    private fun nextLocalId(): String {
        while (true) {
            val prev = lastLocalId.get()
            val next = max(clock(), prev + 1)
            if (lastLocalId.compareAndSet(prev, next)) return next.toString()
        }
    }

    private fun fastForwardPast(date: String, cycle: String, today: String): String {
        var next = advanceDate(date, cycle)
        var guard = 0
        while (next <= today && guard++ < 2000) {
            val prev = next
            next = advanceDate(next, cycle)
            if (next == prev) break
        }
        return next
    }

    private suspend fun removeOrphanPhotos(removed: List<RecordEntity>, kept: List<RecordEntity>) {
        val inUse = kept.mapNotNull { it.photo }.toMutableSet()
        for (r in removed) {
            val photo = r.photo ?: continue
            if (photo in inUse) continue
            photos.delete(photo)
            inUse.add(photo)
        }
    }

    private fun pushSoon() {
        sync?.pushSoon()
    }

    /** 统一排序：日期倒序 + 同日按提交时刻倒序（§7.4） */
    fun sortRecordsByTimeDesc(list: List<RecordEntity>): List<RecordEntity> =
        list.sortedWith(
            compareByDescending<RecordEntity> { it.date }.thenByDescending { createdAtOf(it) },
        )

    private fun createdAtOf(r: RecordEntity): Long =
        r.createdAt?.takeIf { it != 0L } ?: r.id.toLongOrNull() ?: 0L

    private fun recordKey(r: RecordEntity): String = recordKey(r.date, r.amount, r.subcategoryKey, r.type)

    private fun docLabelOf(r: RecordEntity): String {
        val cat = r.categoryName
        val sub = r.subcategoryName
        val note = if (r.note.isNotEmpty()) " 备注:${r.note}" else ""
        return "${r.date} $cat/$sub ¥${jsNumberToString(r.amount)}$note"
    }

    private fun randomBase36(length: Int): String {
        val chars = "0123456789abcdefghijklmnopqrstuvwxyz"
        return buildString(length) { repeat(length) { append(chars[Random.nextInt(chars.length)]) } }
    }

    private fun parseDates(raw: String): List<String> = runCatching {
        Json.parseToJsonElement(raw).jsonArray.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
    }.getOrElse { emptyList() }

    private fun encodeDates(dates: List<String>): String =
        JsonArray(dates.map { JsonPrimitive(it) }).toString()

    private fun isJsonTruthy(el: kotlinx.serialization.json.JsonElement?): Boolean {
        val p = el as? JsonPrimitive ?: return false
        if (p.isString) return p.content.isNotEmpty() && p.content != "false"
        return p.booleanOrNull ?: (p.doubleOrNull?.let { it != 0.0 } ?: false)
    }

    private fun RecordEntity.toLocalJson(): JsonObject = buildJsonObject {
        put("id", id)
        put("type", type)
        put("amount", amount)
        put("categoryKey", categoryKey)
        put("categoryName", categoryName)
        put("subcategoryKey", subcategoryKey)
        put("subcategoryName", subcategoryName)
        put("note", note)
        put("date", date)
        put("person", person)
        createdAt?.let { put("createdAt", it) }
        photo?.let { put("photo", it) }
        if (deleted > 0) put("deleted", deleted)
        if (reviveCount > 0) put("reviveCount", reviveCount)
    }

    private fun TodoEntity.toSnapshotJson(): JsonObject = buildJsonObject {
        put("id", id)
        put("title", title)
        put("cycle", cycle)
        put("nextDate", nextDate)
        time?.takeIf { it.isNotEmpty() }?.let { put("time", it) }
        put("isActive", isActive)
        amount?.let { put("amount", it) }
        categoryKey?.takeIf { it.isNotEmpty() }?.let { put("categoryKey", it) }
        categoryName?.takeIf { it.isNotEmpty() }?.let { put("categoryName", it) }
        subcategoryKey?.takeIf { it.isNotEmpty() }?.let { put("subcategoryKey", it) }
        subcategoryName?.takeIf { it.isNotEmpty() }?.let { put("subcategoryName", it) }
        note?.takeIf { it.isNotEmpty() }?.let { put("note", it) }
        put("completedDates", JsonArray(parseDates(completedDates).map { JsonPrimitive(it) }))
        put("createdAt", createdAt)
        updatedAt?.let { put("updatedAt", it) }
        put("deleted", deleted > 0)
    }

    private fun RecurringBillEntity.toSnapshotJson(): JsonObject = buildJsonObject {
        put("id", id)
        put("type", type)
        put("amount", amount)
        put("categoryKey", categoryKey)
        put("categoryName", categoryName)
        put("subcategoryKey", subcategoryKey)
        put("subcategoryName", subcategoryName)
        if (note.isNotEmpty()) put("note", note)
        put("cycle", cycle)
        put("nextDate", nextDate)
        put("isActive", isActive)
        lastExecutedFor?.let { put("lastExecutedFor", it) }
        updatedAt?.let { put("updatedAt", it) }
        put("deleted", deleted > 0)
    }

    private fun JsonObject.toRecordEntity(fallbackId: String): RecordEntity = RecordEntity(
        id = strOrNull("id") ?: fallbackId,
        type = strOrNull("type") ?: "expense",
        amount = (this["amount"] as? JsonPrimitive)?.doubleOrNull ?: 0.0,
        categoryKey = strOrNull("categoryKey") ?: "",
        categoryName = strOrNull("categoryName") ?: "",
        subcategoryKey = strOrNull("subcategoryKey") ?: "",
        subcategoryName = strOrNull("subcategoryName") ?: "",
        note = strOrNull("note") ?: "",
        date = strOrNull("date") ?: "",
        person = strOrNull("person") ?: "",
        createdAt = (this["createdAt"] as? JsonPrimitive)?.doubleOrNull?.toLong(),
        photo = strOrNull("photo"),
        deleted = if (isJsonTruthy(this["deleted"])) 1 else 0,
        reviveCount = (this["reviveCount"] as? JsonPrimitive)?.doubleOrNull?.toInt() ?: 0,
    )
}
