package com.jixu.app

import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jixu.app.data.PrefsKeys
import com.jixu.app.ui.nav.JiXuNavHost
import com.jixu.app.ui.theme.JiXuTheme
import com.jixu.app.ui.theme.UiStyle
import kotlinx.coroutines.runBlocking

class MainActivity : ComponentActivity() {

    /** 通知点击「进入待办页」（§10）：冷启动读 intent，已在运行走 onNewIntent。 */
    private var openTodos by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        openTodos = intent?.getBooleanExtra(EXTRA_OPEN_TODOS, false) == true

        val container = (application as JiXuApp).container

        // 外观偏好必须在 setContent 之前读出来：否则首帧先按系统值画一遍，
        // 用户选了「始终浅色」而系统是深色时会闪一下。
        val initialPref = runCatching {
            runBlocking { container.prefs.get(PrefsKeys.UI_THEME_PREF) }
        }.getOrNull()
        val initialStylePref = runCatching {
            runBlocking { container.prefs.get(PrefsKeys.UI_STYLE_PREF) }
        }.getOrNull()
        val systemDark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
        val darkNow = when (initialPref) {
            "light" -> false
            "dark" -> true
            else -> systemDark
        }
        applySystemBars(darkNow)

        setContent {
            // 外观三态（§9）：system / light / dark，DataStore 变化即时重组
            val pref by container.prefs
                .observeString(PrefsKeys.UI_THEME_PREF)
                .collectAsStateWithLifecycle(initialValue = initialPref)
            // 界面风格：instrument（夜航仪表）/ miniapp（小程序靛风）
            val stylePref by container.prefs
                .observeString(PrefsKeys.UI_STYLE_PREF)
                .collectAsStateWithLifecycle(initialValue = initialStylePref)
            val dark = when (pref) {
                "light" -> false
                "dark" -> true
                else -> isSystemInDarkTheme()
            }
            LaunchedEffect(dark) { applySystemBars(dark) }
            JiXuTheme(
                darkTheme = dark,
                uiStyle = UiStyle.fromPref(stylePref),
            ) {
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

    /** 边到边 + 状态栏图标明暗跟随应用内主题（不是系统主题）。 */
    private fun applySystemBars(dark: Boolean) {
        val transparent = android.graphics.Color.TRANSPARENT
        enableEdgeToEdge(
            statusBarStyle = if (dark) {
                SystemBarStyle.dark(transparent)
            } else {
                SystemBarStyle.light(transparent, transparent)
            },
            navigationBarStyle = if (dark) {
                SystemBarStyle.dark(transparent)
            } else {
                SystemBarStyle.light(transparent, transparent)
            },
        )
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
