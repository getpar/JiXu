package com.jixu.app.ui.screens.cloud

import android.content.ClipData
import android.content.ClipboardManager
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jixu.app.AppContainer
import com.jixu.app.cloud.CloudEnv
import com.jixu.app.core.formatOwnerId
import com.jixu.app.core.newOwnerId
import com.jixu.app.data.PrefsKeys
import com.jixu.app.ui.screens.common.JxConfirmDialog
import com.jixu.app.ui.screens.common.JxDialog
import com.jixu.app.ui.screens.common.JxDivider
import com.jixu.app.ui.screens.common.JxLabel
import com.jixu.app.ui.screens.common.JxLink
import com.jixu.app.ui.screens.common.JxTextField
import com.jixu.app.ui.screens.common.showToast
import com.jixu.app.ui.theme.JiXuTheme
import kotlinx.coroutines.launch

/**
 * 云同步弹窗（开发文档 §8.8，参照 miniapp 首页同名弹窗）。
 * 同步码只决定「读哪本账」，加入/换码后立即强制同步一次。
 */
@Composable
fun CloudSyncDialog(
    container: AppContainer,
    onDismiss: () -> Unit,
    onOwnerChanged: (String) -> Unit,
) {
    val colors = JiXuTheme.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var ownerId by remember { mutableStateOf("") }
    var status by remember { mutableStateOf<String?>(null) }
    var statusOk by remember { mutableStateOf(false) }
    var joinInput by remember { mutableStateOf("") }
    var showEnv by remember { mutableStateOf(false) }
    var envInput by remember { mutableStateOf("") }
    var envId by remember { mutableStateOf(CloudEnv.DEFAULT_ENV_ID) }
    var confirmRegenerate by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    suspend fun testCloud() {
        val id = ownerId.ifEmpty { container.ownerId().also { ownerId = it } }
        status = null
        val result = runCatching { container.cloud.count(id) }
        statusOk = result.isSuccess
        status = result.fold(
            onSuccess = { "已连接云环境 ✓" },
            onFailure = { "读写云端失败：${it.message ?: it}（数据仅存本机，联网后会自动补传）" },
        )
    }

    LaunchedEffect(Unit) {
        ownerId = container.ownerId()
        envId = CloudEnv.resolve(container.store)
        testCloud()
    }

    fun copyOwnerId() {
        val cm = context.getSystemService(ClipboardManager::class.java)
        cm.setPrimaryClip(ClipData.newPlainText("同步码", ownerId))
        context.showToast("已复制")
    }

    fun join() {
        if (busy) return
        busy = true
        scope.launch {
            if (!container.setOwnerId(joinInput)) {
                context.showToast("同步码格式不对（至少 8 位）")
                busy = false
                return@launch
            }
            ownerId = container.ownerId()
            onOwnerChanged(ownerId)
            joinInput = ""
            context.showToast("已加入，正在同步…")
            runCatching { container.syncManager.syncNow(true) }
            testCloud()
            busy = false
        }
    }

    fun regenerate() {
        scope.launch {
            val id = newOwnerId()
            container.store.set(PrefsKeys.CLOUD_OWNER_ID, id)
            ownerId = id
            onOwnerChanged(id)
        }
    }

    fun applyEnv(raw: String) {
        val value = raw.trim()
        if (value.isNotEmpty() && value.any { it.isWhitespace() }) {
            context.showToast("环境 ID 不能包含空格")
            return
        }
        scope.launch {
            if (value.isEmpty()) {
                container.store.remove(CloudEnv.OVERRIDE_KEY)
            } else {
                container.store.set(CloudEnv.OVERRIDE_KEY, value)
            }
            // 换环境必须重新匿名登录（§5.2）
            container.auth.clearSession()
            envId = CloudEnv.resolve(container.store)
            envInput = ""
            status = null
            context.showToast(if (value.isEmpty()) "已恢复默认云环境…" else "正在连接自定义云环境…")
            val result = runCatching { container.cloud.count(ownerId) }
            statusOk = result.isSuccess
            status = result.fold(
                onSuccess = { "已连接云环境 ✓" },
                onFailure = { "读写云端失败：${it.message ?: it}（数据仅存本机，联网后会自动补传）" },
            )
            if (result.isSuccess) runCatching { container.syncManager.syncNow(true) }
        }
    }

    JxDialog(title = "云同步", onDismiss = onDismiss) {
        Text(
            status ?: "正在检测云端连通…",
            fontSize = 12.sp,
            color = when {
                status == null -> colors.muted
                statusOk -> colors.inc
                else -> colors.exp
            },
            modifier = Modifier.padding(bottom = 16.dp),
        )

        JxLabel("我的同步码")
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(vertical = 8.dp),
        ) {
            Text(
                formatOwnerId(ownerId),
                fontSize = 18.sp,
                fontWeight = FontWeight.Medium,
                color = colors.accent,
                letterSpacing = 1.5.sp,
                maxLines = 1,
                softWrap = false,
                modifier = Modifier.weight(1f),
            )
            Text(
                "复制",
                fontSize = 12.sp,
                color = colors.bg,
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(colors.accent)
                    .clickable { copyOwnerId() }
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            )
        }
        Text(
            "在电脑或小程序里输入同一个码，就同步同一本账；别人用会自动分到各自的账本，互相看不到",
            fontSize = 12.sp,
            color = colors.muted,
            lineHeight = 18.sp,
        )

        Spacer(Modifier.height(18.dp))
        JxLabel("输入其他设备的码，加入同一本账")
        Spacer(Modifier.height(4.dp))
        JxTextField(
            value = joinInput,
            onValueChange = { joinInput = it },
            placeholder = "如：ABCD-EFGH-JKMN",
            maxLength = 16,
        )

        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(20.dp), verticalAlignment = Alignment.CenterVertically) {
            Spacer(Modifier.weight(1f))
            JxLink("换新码", onClick = { confirmRegenerate = true }, color = colors.sub, size = 14.sp)
            Text(
                "加入",
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                color = colors.bg,
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(colors.accent)
                    .clickable { join() }
                    .padding(horizontal = 16.dp, vertical = 7.dp),
            )
        }

        Spacer(Modifier.height(16.dp))
        JxDivider()
        Text(
            "自定义云环境 ID（高级）" + if (showEnv) " ▲" else " ▼",
            fontSize = 12.sp,
            color = colors.muted,
            modifier = Modifier
                .fillMaxWidth()
                .clickable { showEnv = !showEnv }
                .padding(vertical = 12.dp),
        )
        if (showEnv) {
            Text(
                "自己有微信云开发/CloudBase 环境时，填它的环境 ID，账本就存进你自己的云数据库；不填则用默认环境。" +
                    "注意：换环境后各环境的账互不可见，需在新环境里重新输入同步码对码",
                fontSize = 11.sp,
                color = colors.muted,
                lineHeight = 17.sp,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "当前环境：" + envId + if (envId == CloudEnv.DEFAULT_ENV_ID) "（默认）" else "（自定义）",
                fontSize = 11.sp,
                color = colors.text,
            )
            Spacer(Modifier.height(6.dp))
            JxTextField(
                value = envInput,
                onValueChange = { envInput = it },
                placeholder = "默认：" + CloudEnv.DEFAULT_ENV_ID,
                maxLength = 64,
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.weight(1f))
                JxLink("恢复默认", onClick = { applyEnv("") }, color = colors.sub, size = 13.sp)
                Text(
                    "保存并重连",
                    fontSize = 13.sp,
                    color = colors.bg,
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(colors.accent)
                        .clickable { applyEnv(envInput) }
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                )
            }
        }
        Spacer(Modifier.height(4.dp))
    }

    if (confirmRegenerate) {
        JxConfirmDialog(
            title = "换新同步码？",
            message = "换新码后本机将和一个新的云端账本同步，旧账本数据仍在云端但不再拉取",
            confirmText = "换新码",
            confirmColor = colors.accent,
            onConfirm = {
                confirmRegenerate = false
                regenerate()
            },
            onDismiss = { confirmRegenerate = false },
        )
    }
}
