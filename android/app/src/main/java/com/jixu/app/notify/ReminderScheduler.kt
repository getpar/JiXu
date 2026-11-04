package com.jixu.app.notify

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import com.jixu.app.data.db.TodoEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import java.time.Instant
import java.time.ZoneId

/**
 * 本机到期提醒的系统调度（开发文档 §10）。
 *
 * 每次重排：先取消上一轮登记过的全部闹钟，再按 [ReminderPlan] 重新排。
 * 已排的 requestCode 存在 SharedPreferences，进程被杀后仍能在开机/改时间时全部取消重排；
 * 计算与系统调用分离，[ReminderPlan] 可独立测试。
 */
class ReminderScheduler(
    context: Context,
    private val scope: CoroutineScope,
    private val todosProvider: suspend () -> List<TodoEntity>,
    private val clock: () -> Long = { System.currentTimeMillis() },
    private val zone: () -> ZoneId = { ZoneId.systemDefault() },
) : ReminderUpdates {

    private val appContext: Context = context.applicationContext
    private val alarmManager: AlarmManager? = appContext.getSystemService(AlarmManager::class.java)
    private val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val mutex = Mutex()

    override fun rescheduleSoon() {
        scope.launch {
            // 失败静默：下次启动/同步/到点重排会再来一次
            runCatching { rescheduleAll() }
        }
    }

    /** 重新计算并替换全部闹钟；任何时刻只跑一趟。 */
    suspend fun rescheduleAll() = mutex.withLock {
        val now = Instant.ofEpochMilli(clock()).atZone(zone())
        val todos = todosProvider()
            .filter { it.deleted == 0 }
            .map { it.toReminderTodo() }
        val plan = ReminderPlan.plan(now, todos)

        cancelLocked()
        val scheduled = LinkedHashSet<String>()
        plan.forEachIndexed { index, reminder ->
            val code = if (reminder.kind == PlannedKind.DAILY_SUMMARY) {
                DAILY_REQUEST_CODE
            } else {
                TODO_REQUEST_CODE_BASE + index
            }
            val action = actionOf(reminder.kind)
            val intent = Intent(appContext, ReminderReceiver::class.java).setAction(action)
            if (reminder.todoId != null) intent.putExtra(ReminderReceiver.EXTRA_TODO_ID, reminder.todoId)
            val pi = PendingIntent.getBroadcast(
                appContext,
                code,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            ) ?: return@forEachIndexed
            setAlarm(reminder.triggerAtMillis, pi)
            scheduled += "$code|$action"
        }
        prefs.edit().putStringSet(KEY_SCHEDULED, scheduled).apply()
    }

    /** 清除数据：取消所有闹钟与已显示的通知（§7.9）。 */
    override suspend fun cancelAll() {
        mutex.withLock {
            cancelLocked()
            runCatching { NotificationManagerCompat.from(appContext).cancelAll() }
        }
    }

    private fun cancelLocked() {
        val entries = prefs.getStringSet(KEY_SCHEDULED, emptySet())?.toList().orEmpty()
        for (entry in entries) {
            val code = entry.substringBefore('|').toIntOrNull() ?: continue
            val action = entry.substringAfter('|', "")
            if (action.isEmpty()) continue
            val pi = PendingIntent.getBroadcast(
                appContext,
                code,
                Intent(appContext, ReminderReceiver::class.java).setAction(action),
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
            )
            if (pi != null) alarmManager?.cancel(pi)
        }
        prefs.edit().remove(KEY_SCHEDULED).apply()
    }

    private fun setAlarm(triggerAtMillis: Long, pi: PendingIntent) {
        val am = alarmManager ?: return
        try {
            if (canScheduleExact(appContext)) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi)
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi)
            }
        } catch (_: SecurityException) {
            // 精确闹钟权限在检查后被撤销：退回可能晚到的不精确闹钟
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi)
        }
    }

    private fun actionOf(kind: PlannedKind): String =
        if (kind == PlannedKind.DAILY_SUMMARY) ReminderReceiver.ACTION_DAILY else ReminderReceiver.ACTION_TODO

    companion object {
        const val PREFS_NAME = "jixu_reminders"
        private const val KEY_SCHEDULED = "scheduled"
        private const val DAILY_REQUEST_CODE = 100
        private const val TODO_REQUEST_CODE_BASE = 200

        /** 通知总开关（Android 13+ 未授权时为 false）。 */
        fun notificationsEnabled(context: Context): Boolean =
            NotificationManagerCompat.from(context.applicationContext).areNotificationsEnabled()

        /** Android 12+ 精确闹钟是否已被允许；旧系统恒为 true。 */
        fun canScheduleExact(context: Context): Boolean {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
            val am = context.applicationContext.getSystemService(AlarmManager::class.java) ?: return false
            return am.canScheduleExactAlarms()
        }

        fun openNotificationSettingsIntent(context: Context): Intent =
            Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, context.packageName)

        fun openExactAlarmSettingsIntent(context: Context): Intent =
            Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                .setData(android.net.Uri.parse("package:${context.packageName}"))

        fun openAppDetailsIntent(context: Context): Intent =
            Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(android.net.Uri.parse("package:${context.packageName}"))
    }
}

internal fun TodoEntity.toReminderTodo(): ReminderTodo = ReminderTodo(
    id = id,
    title = title,
    nextDate = nextDate,
    time = time?.takeIf { it.isNotBlank() },
    isActive = isActive,
    deleted = deleted > 0,
    completedDates = parseCompletedDates(completedDates),
    note = note.orEmpty(),
)

private fun parseCompletedDates(raw: String): List<String> = runCatching {
    Json.parseToJsonElement(raw).jsonArray.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
}.getOrElse { emptyList() }
