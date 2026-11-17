package com.jixu.app.ui.screens.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jixu.app.AppContainer
import com.jixu.app.core.formatOwnerId
import com.jixu.app.ui.screens.common.BConfirm
import com.jixu.app.ui.screens.common.BDialog
import com.jixu.app.ui.screens.common.HLine
import com.jixu.app.ui.screens.common.MicroLabel
import com.jixu.app.ui.screens.common.MiniButton
import com.jixu.app.ui.screens.common.Panel
import com.jixu.app.ui.screens.common.showToast
import com.jixu.app.ui.theme.JiXuTheme
import com.jixu.app.ui.theme.MonoFamily
import com.jixu.app.ui.theme.SansFamily
import kotlinx.coroutines.launch

@Composable
internal fun HomeSystemGroup(
    themePref: String,
    dark: Boolean,
    cloudBound: Boolean,
    onOpenTheme: () -> Unit,
    onOpenCloud: () -> Unit,
    onClearData: () -> Unit,
) {
    // ===== 系统组：外观 / 云同步 / 清除数据 =====
    val prefLabel = when (themePref) {
        "light" -> "始终浅色"
        "dark" -> "始终深色"
        else -> "跟随系统"
    }
    Panel(contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
        SystemRow("外观", prefLabel + if (themePref == "system" && dark) "（当前深色）" else "", onClick = onOpenTheme)
        HLine(Modifier.padding(horizontal = 16.dp))
        SystemRow("云同步", if (cloudBound) "已绑定" else "未绑定", onClick = onOpenCloud)
        HLine(Modifier.padding(horizontal = 16.dp))
        SystemRow("清除所有数据", "本机账单、待办、照片与预算", onClick = onClearData)
    }
}

@Composable
internal fun SystemRow(title: String, sub: String, onClick: () -> Unit) {
    val c = JiXuTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, style = TextStyle(fontFamily = SansFamily, fontSize = 13.sp, color = c.tx))
        Spacer(Modifier.weight(1f))
        Text(
            sub,
            style = TextStyle(fontFamily = SansFamily, fontSize = 11.5.sp, color = c.dim),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.widthIn(max = 210.dp),
        )
        Text(
            "›",
            style = TextStyle(fontFamily = MonoFamily, fontSize = 14.sp, color = c.fnt),
            modifier = Modifier.padding(start = 6.dp),
        )
    }
}

// ===== 外观三态（§9） =====
@Composable
internal fun ThemeDialog(
    themePref: String,
    uiStylePref: String,
    onSelectTheme: (String) -> Unit,
    onSelectStyle: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val c = JiXuTheme.colors
    BDialog(title = "外观", en = "THEME", onDismiss = onDismiss) {
        listOf(
            "system" to "跟随系统",
            "light" to "始终浅色",
            "dark" to "始终深色",
        ).forEach { (key, label) ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        onSelectTheme(key)
                    }
                    .padding(vertical = 12.dp),
            ) {
                Text(
                    label,
                    style = TextStyle(
                        fontFamily = SansFamily,
                        fontSize = 14.sp,
                        color = if (themePref == key) c.ac else c.tx,
                    ),
                    modifier = Modifier.weight(1f),
                )
                if (themePref == key) {
                    Text("●", style = TextStyle(fontFamily = MonoFamily, fontSize = 10.sp, color = c.acF))
                }
            }
            HLine()
        }
        Spacer(Modifier.height(8.dp))
        MicroLabel("界面风格", color = c.fnt)
        listOf(
            "instrument" to "夜航仪表（当前 App 风）",
            "miniapp" to "小程序靛风（微信小程序风）",
        ).forEach { (key, label) ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        onSelectStyle(key)
                    }
                    .padding(vertical = 12.dp),
            ) {
                Text(
                    label,
                    style = TextStyle(
                        fontFamily = SansFamily,
                        fontSize = 14.sp,
                        color = if (uiStylePref == key) c.ac else c.tx,
                    ),
                    modifier = Modifier.weight(1f),
                )
                if (uiStylePref == key) {
                    Text("●", style = TextStyle(fontFamily = MonoFamily, fontSize = 10.sp, color = c.acF))
                }
            }
            HLine()
        }
    }
}

// ===== 清除本机所有数据（§7.9） =====
@Composable
internal fun ClearDataDialog(
    ownerId: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    BConfirm(
        title = "清除本机所有数据？",
        message = "将清空本机的账单、待办、周期账单、存钱记录、预算、自定义分类和小票照片，并换一个新同步码。" +
            "云端账本不会删除，记下原同步码 ${formatOwnerId(ownerId)}，以后在「云同步」里加入即可找回",
        confirmText = "清除",
        onConfirm = onConfirm,
        onDismiss = onDismiss,
    )
}

// ===== 调试工具（仅 debug 包） =====
@Composable
internal fun HomeDebugPanel(container: AppContainer) {
    val c = JiXuTheme.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repo = container.repository
    var debugBusy by remember { mutableStateOf(false) }
    Panel {
        MicroLabel("调试工具 · DEBUG ONLY", color = c.amb)
        Spacer(Modifier.height(6.dp))
        Text(
            "模拟账单不参与云同步",
            style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.dim),
        )
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MiniButton(if (debugBusy) "处理中…" else "插入 5000 条", onClick = {
                if (debugBusy) return@MiniButton
                debugBusy = true
                scope.launch {
                    runCatching { repo.insertDebugRecords(5000) }
                    debugBusy = false
                    context.showToast("已插入 5000 条模拟账单")
                }
            })
            MiniButton("清空调试数据", onClick = {
                if (debugBusy) return@MiniButton
                debugBusy = true
                scope.launch {
                    runCatching { repo.clearDebugRecords() }
                    debugBusy = false
                    context.showToast("已清空调试数据")
                }
            }, danger = true)
        }
    }
}
