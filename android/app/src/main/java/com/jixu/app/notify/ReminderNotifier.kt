package com.jixu.app.notify

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.jixu.app.MainActivity
import com.jixu.app.R

/**
 * 到期提醒通知（开发文档 §10）：渠道「到期提醒」，点击进入待办页。
 */
object ReminderNotifier {

    const val CHANNEL_ID = "due_reminders"
    const val CHANNEL_NAME = "到期提醒"

    const val DAILY_NOTIFICATION_ID = 8001
    private const val TODO_NOTIFICATION_ID_BASE = 9000

    fun ensureChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "每天 08:00 的到期待办汇总，以及设了具体时间的待办提醒"
        }
        manager.createNotificationChannel(channel)
    }

    /** 每日汇总：0 个到期待办时调用方不会进来。 */
    fun postDaily(context: Context, content: ReminderContent) {
        post(context, DAILY_NOTIFICATION_ID, content)
    }

    /** 定时待办：用待办 id 的稳定散列做通知 id，重复提醒覆盖旧的那条。 */
    fun postTodo(context: Context, todoId: String, content: ReminderContent) {
        val id = TODO_NOTIFICATION_ID_BASE + (todoId.hashCode() and 0x7FFFFFFF) % 100_000
        post(context, id, content)
    }

    private fun post(context: Context, id: Int, content: ReminderContent) {
        val manager = NotificationManagerCompat.from(context.applicationContext)
        if (!manager.areNotificationsEnabled()) return

        ensureChannel(context)
        val openTodos = Intent(context.applicationContext, MainActivity::class.java).apply {
            putExtra(MainActivity.EXTRA_OPEN_TODOS, true)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val pi = PendingIntent.getActivity(
            context.applicationContext,
            id,
            openTodos,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context.applicationContext, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle(content.title)
            .setContentText(content.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(content.body))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        try {
            manager.notify(id, notification)
        } catch (_: SecurityException) {
            // 权限刚被撤销：静默放弃，待办页会提示重新开启
        }
    }
}
