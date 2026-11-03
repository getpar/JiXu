package com.jixu.app

import android.app.Application
import kotlinx.coroutines.launch

/**
 * 应用入口：创建 [AppContainer]（开发文档 §3.3），并触发一次冷启动同步（§6.7，非强制）。
 * 提醒重排在 P8 接入。
 */
class JiXuApp : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        // 冷启动同步：不等待、失败静默（下次进页或本地写后自动补传）
        container.scope.launch {
            runCatching { container.syncManager.syncNow(force = false) }
        }
    }
}
