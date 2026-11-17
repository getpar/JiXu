package com.jixu.app.data.db

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [
        RecordEntity::class,
        TodoEntity::class,
        RecurringBillEntity::class,
        CustomCategoryEntity::class,
        PendingPurgeEntity::class,
        SavingsEntity::class,
    ],
    version = 2,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun records(): RecordDao
    abstract fun todos(): TodoDao
    abstract fun recurringBills(): RecurringBillDao
    abstract fun customCategories(): CustomCategoryDao
    abstract fun pendingPurges(): PendingPurgeDao
    abstract fun savings(): SavingsDao
}
