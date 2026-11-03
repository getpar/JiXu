package com.jixu.app.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update

@Dao
interface RecordDao {
    @Query("SELECT * FROM records")
    suspend fun getAll(): List<RecordEntity>

    @Query("SELECT * FROM records WHERE id = :id")
    suspend fun byId(id: String): RecordEntity?

    @Query("SELECT * FROM records WHERE deleted = 0")
    suspend fun alive(): List<RecordEntity>

    @Query("SELECT * FROM records WHERE deleted = 0 AND date LIKE :monthPrefix || '%'")
    suspend fun aliveInMonth(monthPrefix: String): List<RecordEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(record: RecordEntity)

    /** 返回 rowId 列表；-1 表示该 id 已存在（防同一云端记录重复入账） */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(records: List<RecordEntity>): List<Long>

    @Update
    suspend fun update(record: RecordEntity)

    @Query("DELETE FROM records WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM records")
    suspend fun clear()
}

@Dao
interface TodoDao {
    @Query("SELECT * FROM todos")
    suspend fun getAll(): List<TodoEntity>

    @Query("SELECT * FROM todos WHERE id = :id")
    suspend fun byId(id: String): TodoEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(todo: TodoEntity)

    @Query("DELETE FROM todos")
    suspend fun clear()
}

@Dao
interface RecurringBillDao {
    @Query("SELECT * FROM recurring_bills")
    suspend fun getAll(): List<RecurringBillEntity>

    @Query("SELECT * FROM recurring_bills WHERE id = :id")
    suspend fun byId(id: String): RecurringBillEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(bill: RecurringBillEntity)

    @Query("DELETE FROM recurring_bills")
    suspend fun clear()
}

@Dao
interface CustomCategoryDao {
    @Query("SELECT * FROM custom_categories ORDER BY seq ASC")
    suspend fun getAll(): List<CustomCategoryEntity>

    @Query("SELECT COALESCE(MAX(seq), 0) FROM custom_categories")
    suspend fun maxSeq(): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(category: CustomCategoryEntity)

    @Query("DELETE FROM custom_categories WHERE subcategory_key = :subKey")
    suspend fun deleteBySubKey(subKey: String)

    @Query("DELETE FROM custom_categories")
    suspend fun clear()
}

@Dao
interface PendingPurgeDao {
    @Query("SELECT * FROM pending_purges ORDER BY seq ASC")
    suspend fun getAll(): List<PendingPurgeEntity>

    @Query("SELECT COALESCE(MAX(seq), 0) FROM pending_purges")
    suspend fun maxSeq(): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(purge: PendingPurgeEntity)

    @Query("DELETE FROM pending_purges WHERE pid IN (:pids)")
    suspend fun deleteByPids(pids: List<String>)

    @Query("DELETE FROM pending_purges")
    suspend fun clear()
}
