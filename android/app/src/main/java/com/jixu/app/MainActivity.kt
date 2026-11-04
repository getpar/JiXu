package com.jixu.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jixu.app.data.PrefsKeys
import com.jixu.app.ui.nav.JiXuNavHost
import com.jixu.app.ui.theme.JiXuTheme

class MainActivity : ComponentActivity() {

    /** 通知点击「进入待办页」（§10）：冷启动读 intent，已在运行走 onNewIntent。 */
    private var openTodos by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        openTodos = intent?.getBooleanExtra(EXTRA_OPEN_TODOS, false) == true
        enableEdgeToEdge()
        val container = (application as JiXuApp).container
        setContent {
            // 外观三态（§9）：system / light / dark，DataStore 变化即时重组
            val pref by container.prefs
                .observeString(PrefsKeys.UI_THEME_PREF)
                .collectAsStateWithLifecycle(initialValue = null)
            val dark = when (pref) {
                "light" -> false
                "dark" -> true
                else -> isSystemInDarkTheme()
            }
            JiXuTheme(darkTheme = dark) {
                JiXuNavHost(
                    openTodos = openTodos,
                    onOpenTodosHandled = {
                        openTodos = false
                        intent?.removeExtra(EXTRA_OPEN_TODOS)
                    },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        openTodos = intent.getBooleanExtra(EXTRA_OPEN_TODOS, false)
    }

    override fun onResume() {
        super.onResume()
        // 从系统设置（通知/精确闹钟）返回后让新权限立即生效；应用回到前台也顺带校正闹钟
        (application as JiXuApp).container.reminders.rescheduleSoon()
    }

    companion object {
        const val EXTRA_OPEN_TODOS = "com.jixu.app.extra.OPEN_TODOS"
    }
}
