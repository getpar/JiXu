package com.jixu.app

import android.app.Application
import com.jixu.app.notify.ReminderNotifier
import kotlinx.coroutines.launch

/**
 * 应用入口：创建 [AppContainer]（开发文档 §3.3），触发一次冷启动同步（§6.7，非强制），
 * 并重排本机到期提醒（§10：应用启动、同步拉到待办变化都由 Repository 再次触发）。
 */
class JiXuApp : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        ReminderNotifier.ensureChannel(this)
        container.scope.launch {
            // 先按本机待办排上，再同步；同步拉到待办时 Repository 会自动重排
            runCatching { container.reminders.rescheduleAll() }
            runCatching { container.syncManager.syncNow(force = false) }
        }
    }
}
