package com.jixu.app.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.jixu.app.AppContainer
import com.jixu.app.JiXuApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.time.LocalDate

/**
 * 到期提醒广播（开发文档 §10）：
 * - 08:00 汇总、定时待办到点 → 发通知，并立刻重排下一轮
 * - 开机 / 改系统时间 / 改时区 → 全部重排（AlarmManager 的闹钟在这些情况下会失效或偏移）
 */
class ReminderReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val app = context.applicationContext as? JiXuApp ?: return
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO + SupervisorJob()).launch {
            try {
                val container = app.container
                when (action) {
                    ACTION_DAILY -> notifyDaily(context, container)
                    ACTION_TODO -> notifyTodo(context, intent, container)
                }
                if (action in RESCHEDULE_ACTIONS) {
                    container.reminders.rescheduleAll()
                }
            } catch (_: Throwable) {
                // 失败静默：应用下次启动/下次同步会重新排
            } finally {
                pending.finish()
            }
        }
    }

    private suspend fun notifyDaily(context: Context, container: AppContainer) {
        val today = LocalDate.now()
        val todos = container.repository.getTodos().map { it.toReminderTodo() }
        val content = ReminderPlan.summaryContent(ReminderPlan.dueTodos(todos, today)) ?: return
        ReminderNotifier.postDaily(context, content)
    }

    private suspend fun notifyTodo(context: Context, intent: Intent, container: AppContainer) {
        val id = intent.getStringExtra(EXTRA_TODO_ID) ?: return
        val todo = container.repository.getTodos().firstOrNull { it.id == id } ?: return
        val snapshot = todo.toReminderTodo()
        if (!ReminderPlan.isTimedReminderStillValid(snapshot, LocalDate.now())) return
        ReminderNotifier.postTodo(context, snapshot.id, ReminderPlan.timedContent(snapshot))
    }

    companion object {
        const val ACTION_DAILY = "com.jixu.app.action.REMIND_DAILY"
        const val ACTION_TODO = "com.jixu.app.action.REMIND_TODO"
        const val EXTRA_TODO_ID = "com.jixu.app.extra.TODO_ID"

        private val RESCHEDULE_ACTIONS = setOf(
            ACTION_DAILY,
            ACTION_TODO,
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
        )
    }
}
