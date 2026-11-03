package com.jixu.app.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.jixu.app.core.recordKey
import com.jixu.app.data.db.AppDatabase
import com.jixu.app.sync.KVStore
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

class FakeStore : KVStore {
    val map = mutableMapOf<String, String>()
    override suspend fun get(key: String): String? = map[key]
    override suspend fun set(key: String, value: String) {
        map[key] = value
    }

    override suspend fun remove(key: String) {
        map.remove(key)
    }

    override suspend fun clear() {
        map.clear()
    }
}

class RecordingPhotoStore : PhotoStore {
    val deleted = mutableListOf<String>()
    var cleared = false
    override suspend fun delete(path: String) {
        deleted += path
    }

    override suspend fun clearAll() {
        cleared = true
    }
}

/** Repository 语义（开发文档 §15 表格）：排序配对、物理删除顺序、编辑、孤儿照片、周期回执、待办记账、补名、清数据。 */
@RunWith(AndroidJUnit4::class)
class RepositoryTest {

    private lateinit var db: AppDatabase
    private lateinit var store: FakeStore
    private lateinit var photos: RecordingPhotoStore
    private lateinit var repo: Repository
    private var now = 1_700_000_000_000L
    private var today = "2026-11-03"

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        store = FakeStore()
        photos = RecordingPhotoStore()
        repo = Repository(db, store, photos, sync = null, clock = { now }, today = { today })
    }

    @After
    fun tearDown() {
        db.close()
    }

    private fun rec(
        amount: Double = 25.0,
        date: String = "2026-11-03",
        createdAt: Long? = null,
        photo: String? = null,
        sub: String = "lunch",
        type: String = "expense",
    ) = NewRecord(
        type = type,
        amount = amount,
        categoryKey = "food",
        categoryName = "餐饮饮食",
        subcategoryKey = sub,
        subcategoryName = "午餐",
        note = "",
        date = date,
        person = "",
        createdAt = createdAt,
        photo = photo,
    )

    @Test
    fun markLocalAndAliveFollowSortOrder() = runBlocking {
        val idOld = repo.addRecord(rec(createdAt = 100))
        val idMid = repo.addRecord(rec(createdAt = 200))
        val idNew = repo.addRecord(rec(createdAt = 300))
        val key = recordKey("2026-11-03", 25.0, "lunch", "expense")

        assertEquals(1, repo.markLocalDeleted(key, 1))
        assertEquals("同键按提交时刻倒序，先标最新那笔", 1, db.records().byId(idNew)!!.deleted)
        assertEquals(0, db.records().byId(idMid)!!.deleted)
        assertEquals(0, db.records().byId(idOld)!!.deleted)

        assertEquals(1, repo.markLocalAlive(key, 1))
        val revived = db.records().byId(idNew)!!
        assertEquals(0, revived.deleted)
        assertEquals(1, revived.reviveCount)
    }

    @Test
    fun purgeLocalRemovesRecycleBinFirstThenAlive() = runBlocking {
        val idOld = repo.addRecord(rec(createdAt = 100))
        val idMid = repo.addRecord(rec(createdAt = 200))
        val idNew = repo.addRecord(rec(createdAt = 300))
        val key = recordKey("2026-11-03", 25.0, "lunch", "expense")
        repo.deleteRecord(idOld) // 回收站里只有最旧的那笔

        assertEquals(1, repo.purgeLocalRecords(key, 1))
        assertEquals("先物理删回收站行", null, db.records().byId(idOld))
        assertNotEquals(null, db.records().byId(idNew))

        assertEquals(1, repo.purgeLocalRecords(key, 1))
        assertEquals("回收站空了再按时间倒序删存活行", null, db.records().byId(idNew))
        assertNotEquals(null, db.records().byId(idMid))
    }

    @Test
    fun updateRecordKeepsOldRowInRecycleBinAndCreatedAt() = runBlocking {
        val oldId = repo.addRecord(rec(createdAt = 500, photo = "p1.jpg"))
        repo.updateRecord(oldId, RecordUpdate(amount = 28.0, note = "改成拿铁"))

        val old = db.records().byId(oldId)!!
        assertEquals(1, old.deleted)
        val fresh = db.records().getAll().first { it.deleted == 0 }
        assertEquals(28.0, fresh.amount, 0.0)
        assertEquals("编辑沿用旧行提交时刻", 500L, fresh.createdAt)
        assertEquals("p1.jpg", fresh.photo)
        assertNotEquals(oldId, fresh.id)
    }

    @Test
    fun purgeCleansOnlyOrphanPhotos() = runBlocking {
        val oldId = repo.addRecord(rec(createdAt = 500, photo = "p1.jpg"))
        repo.updateRecord(oldId, RecordUpdate(amount = 28.0))
        val freshId = db.records().getAll().first { it.deleted == 0 }.id

        repo.purgeRecord(oldId)
        assertTrue("新行仍在引用同一张照片，不能删", photos.deleted.isEmpty())

        repo.deleteRecord(freshId)
        repo.purgeRecord(freshId)
        assertEquals(listOf("p1.jpg"), photos.deleted)
    }

    @Test
    fun recurringExecuteWritesReceiptAndMonthEnd() = runBlocking {
        today = "2026-01-31"
        repo.addRecurringBill(
            NewRecurringBill(
                type = "expense",
                amount = 2400.0,
                categoryKey = "housing",
                categoryName = "住房居家",
                subcategoryKey = "rent",
                subcategoryName = "房租/房贷",
                note = "房租",
                cycle = "monthly",
                nextDate = "2026-01-31",
            ),
        )
        val billId = repo.getRecurringBills().first().id
        repo.executeRecurringBill(billId)

        val bill = repo.getRecurringBills().first()
        assertEquals("2026-02-28", bill.nextDate)
        assertEquals("2026-01-31", bill.lastExecutedFor)
        val records = repo.getRecords()
        assertEquals(1, records.size)
        assertEquals("房租", records[0].note)

        // 到期自动执行：回执已存在时不重复记账，只快进
        today = "2026-02-28"
        assertEquals(1, repo.checkAndExecuteDueBills().size)
        val afterAuto = repo.getRecurringBills().first()
        assertEquals("2026-03-28", afterAuto.nextDate)
        assertEquals("2026-02-28", afterAuto.lastExecutedFor)
        assertEquals(2, repo.getRecords().size)

        // 再跑一次：未到期，不动作
        val before = repo.getRecords().size
        assertTrue(repo.checkAndExecuteDueBills().isEmpty())
        assertEquals(before, repo.getRecords().size)
    }

    @Test
    fun recurringReceiptFromOtherDevicePreventsDoubleEntry() = runBlocking {
        today = "2026-02-28"
        repo.applyCloudRecurringBills(
            listOf(
                Json.parseToJsonElement(
                    """{"id":"b2","type":"expense","amount":30,"categoryKey":"entertainment","categoryName":"娱乐休闲",
                       "subcategoryKey":"game","subcategoryName":"游戏充值","note":"会员","cycle":"monthly",
                       "nextDate":"2026-02-28","isActive":true,"lastExecutedFor":"2026-02-28","updatedAt":1700000000000,
                       "deleted":false}""",
                ).jsonObject,
            ),
        )
        val executed = repo.checkAndExecuteDueBills()
        assertTrue("对端已记过本期，不再记账", executed.isEmpty())
        assertTrue(repo.getRecords().isEmpty())
        assertEquals("2026-03-28", repo.getRecurringBills().first().nextDate)
    }

    @Test
    fun completeTodoBooksExpenseOnceAndAdvances() = runBlocking {
        today = "2026-11-03"
        repo.addTodo(
            NewTodo(
                title = "交房租",
                cycle = "monthly",
                nextDate = today,
                amount = 12.5,
                categoryKey = "food",
                categoryName = "餐饮饮食",
                subcategoryKey = "lunch",
                subcategoryName = "午餐",
            ),
        )
        val todoId = repo.getTodos().first().id
        repo.completeTodo(todoId)

        val records = repo.getRecords()
        assertEquals(1, records.size)
        assertEquals(12.5, records[0].amount, 0.0)
        assertEquals("[待办] 交房租", records[0].note)
        assertEquals(today, records[0].date)

        val todo = repo.getTodos().first()
        assertTrue(todo.completedDates.contains(today))
        assertEquals("2026-12-03", todo.nextDate)

        repo.completeTodo(todoId)
        assertEquals("同一天重复完成不重复记账", 1, repo.getRecords().size)
    }

    @Test
    fun applyCloudTodosFillsMissingCategoryNames() = runBlocking {
        repo.applyCloudTodos(
            listOf(
                Json.parseToJsonElement(
                    """{"id":"t1","title":"交水费","cycle":"monthly","nextDate":"2026-11-05","isActive":true,
                       "categoryKey":"food","categoryName":"","subcategoryKey":"lunch","subcategoryName":"",
                       "completedDates":[],"createdAt":"2026-11-01","updatedAt":1700000000000,"deleted":false}""",
                ).jsonObject,
            ),
        )
        val todo = db.todos().byId("t1")!!
        assertEquals("餐饮饮食", todo.categoryName)
        assertEquals("午餐", todo.subcategoryName)
    }

    @Test
    fun clearAllLocalDataWipesTablesPrefsAndPhotos() = runBlocking {
        repo.addRecord(rec(photo = "p9.jpg"))
        repo.addTodo(NewTodo(title = "喝水", cycle = "daily", nextDate = today))
        repo.addRecurringBill(
            NewRecurringBill(
                type = "expense",
                amount = 30.0,
                categoryKey = "entertainment",
                categoryName = "娱乐休闲",
                subcategoryKey = "game",
                subcategoryName = "游戏充值",
                cycle = "monthly",
                nextDate = today,
            ),
        )
        repo.addCustomCategory("custom_1", "育儿", "custom_1_2", "奶粉")
        repo.setBudget(1000.0)
        assertFalse(store.map.isEmpty())

        repo.clearAllLocalData()

        assertTrue(db.records().getAll().isEmpty())
        assertTrue(db.todos().getAll().isEmpty())
        assertTrue(db.recurringBills().getAll().isEmpty())
        assertTrue(db.customCategories().getAll().isEmpty())
        assertTrue(db.pendingPurges().getAll().isEmpty())
        assertTrue(store.map.isEmpty())
        assertTrue(photos.cleared)
    }
}
