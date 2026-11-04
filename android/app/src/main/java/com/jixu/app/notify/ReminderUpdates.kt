package com.jixu.app.notify

/**
 * Repository → 提醒调度的小接口。
 * 待办增删改/完成、同步拉到待办变化后重排；清除数据后全部取消（开发文档 §10、§7.9）。
 */
interface ReminderUpdates {
    fun rescheduleSoon()

    suspend fun cancelAll()

    object Noop : ReminderUpdates {
        override fun rescheduleSoon() = Unit

        override suspend fun cancelAll() = Unit
    }
}
