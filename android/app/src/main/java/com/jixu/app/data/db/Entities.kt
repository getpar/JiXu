package com.jixu.app.data.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** 账单（开发文档 §4.1，字段与 storage.ts RecordItem 一一对应） */
@Entity(
    tableName = "records",
    indices = [
        Index(value = ["deleted", "date"]),
        Index(value = ["date", "subcategory_key", "type"]),
    ],
)
data class RecordEntity(
    @PrimaryKey val id: String,
    val type: String,
    val amount: Double,
    @ColumnInfo(name = "category_key") val categoryKey: String,
    @ColumnInfo(name = "category_name") val categoryName: String,
    @ColumnInfo(name = "subcategory_key") val subcategoryKey: String,
    @ColumnInfo(name = "subcategory_name") val subcategoryName: String,
    val note: String = "",
    val date: String,
    val person: String = "",
    @ColumnInfo(name = "created_at") val createdAt: Long? = null,
    val photo: String? = null,
    val deleted: Int = 0,
    @ColumnInfo(name = "revive_count") val reviveCount: Int = 0,
)

/** 待办（completedDates 存 JSON 字符串数组） */
@Entity(tableName = "todos")
data class TodoEntity(
    @PrimaryKey val id: String,
    val title: String,
    val cycle: String,
    @ColumnInfo(name = "next_date") val nextDate: String,
    val time: String? = null,
    @ColumnInfo(name = "is_active") val isActive: Boolean,
    val amount: Double? = null,
    @ColumnInfo(name = "category_key") val categoryKey: String? = null,
    @ColumnInfo(name = "category_name") val categoryName: String? = null,
    @ColumnInfo(name = "subcategory_key") val subcategoryKey: String? = null,
    @ColumnInfo(name = "subcategory_name") val subcategoryName: String? = null,
    val note: String? = null,
    @ColumnInfo(name = "completed_dates") val completedDates: String = "[]",
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "updated_at") val updatedAt: Long? = null,
    val deleted: Int = 0,
)

/** 周期账单 */
@Entity(tableName = "recurring_bills")
data class RecurringBillEntity(
    @PrimaryKey val id: String,
    val type: String,
    val amount: Double,
    @ColumnInfo(name = "category_key") val categoryKey: String,
    @ColumnInfo(name = "category_name") val categoryName: String,
    @ColumnInfo(name = "subcategory_key") val subcategoryKey: String,
    @ColumnInfo(name = "subcategory_name") val subcategoryName: String,
    val note: String = "",
    val cycle: String,
    @ColumnInfo(name = "next_date") val nextDate: String,
    @ColumnInfo(name = "is_active") val isActive: Boolean,
    @ColumnInfo(name = "last_executed_for") val lastExecutedFor: String? = null,
    @ColumnInfo(name = "updated_at") val updatedAt: Long? = null,
    val deleted: Int = 0,
)

/** 自定义分类（只存本机） */
@Entity(tableName = "custom_categories")
data class CustomCategoryEntity(
    @PrimaryKey @ColumnInfo(name = "subcategory_key") val subcategoryKey: String,
    @ColumnInfo(name = "category_key") val categoryKey: String,
    @ColumnInfo(name = "category_name") val categoryName: String,
    @ColumnInfo(name = "subcategory_name") val subcategoryName: String,
    val seq: Long,
)

/** 待上传注销凭条（离线彻底删除也不丢） */
@Entity(tableName = "pending_purges")
data class PendingPurgeEntity(
    @PrimaryKey val pid: String,
    @ColumnInfo(name = "target_key") val targetKey: String,
    @ColumnInfo(name = "cancel_rec") val cancelRec: Int,
    @ColumnInfo(name = "cancel_tomb") val cancelTomb: Int,
    @ColumnInfo(name = "cancel_rev") val cancelRev: Int,
    val label: String? = null,
    val seq: Long,
)
