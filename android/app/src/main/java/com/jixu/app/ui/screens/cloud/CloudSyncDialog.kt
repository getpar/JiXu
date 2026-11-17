package com.jixu.app.ui.screens.cloud

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.jixu.app.AppContainer
import com.jixu.app.cloud.CloudEnv
import com.jixu.app.core.formatOwnerId
import com.jixu.app.core.isValidOwnerId
import com.jixu.app.core.newOwnerId
import com.jixu.app.data.PrefsKeys
import com.jixu.app.ui.screens.common.BConfirm
import com.jixu.app.ui.screens.common.BDialog
import com.jixu.app.ui.screens.common.BTextField
import com.jixu.app.ui.screens.common.HLine
import com.jixu.app.ui.screens.common.MicroLabel
import com.jixu.app.ui.screens.common.MiniButton
import com.jixu.app.ui.screens.common.showToast
import com.jixu.app.ui.theme.JiXuTheme
import com.jixu.app.ui.theme.MonoFamily
import com.jixu.app.ui.theme.SansFamily
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

/**
 * 云同步弹窗（开发文档 §8.8 + 微信身份配对方案 §3.2/§4.3）：
 * - 主流程「扫码绑定（推荐）」：安卓生成配对请求 + 小程序码 → 保存相册 → 微信扫一扫 → 轮询回执自动绑定；
 * - 备用：6 位数字配对码输入；
 * - 原「我的同步码 / 加入 / 换新码」折叠到「高级（备用同步码）」里，默认收起；
 * - 自定义云环境折叠区保持原样。
 */
@Composable
fun CloudSyncDialog(
    container: AppContainer,
    onDismiss: () -> Unit,
    onOwnerChanged: (String) -> Unit,
) {
    val c = JiXuTheme.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var ownerId by remember { mutableStateOf("") }
    var status by remember { mutableStateOf<String?>(null) }
    var statusOk by remember { mutableStateOf(false) }
    var pairCode by remember { mutableStateOf("") }
    var pairBusy by remember { mutableStateOf(false) }
    var joinInput by remember { mutableStateOf("") }
    var showAdvanced by remember { mutableStateOf(false) }
    var showEnv by remember { mutableStateOf(false) }
    var envInput by remember { mutableStateOf("") }
    var envId by remember { mutableStateOf(CloudEnv.DEFAULT_ENV_ID) }
    var confirmRegenerate by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    // ===== 扫码绑定状态 =====
    var qrBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var qrPairingId by remember { mutableStateOf<String?>(null) }
    var qrDocId by remember { mutableStateOf<String?>(null) }
    var qrExpiresAt by remember { mutableStateOf(0L) }
    var qrGenerating by remember { mutableStateOf(false) }
    var qrStatus by remember { mutableStateOf<String?>(null) }

    suspend fun testCloud() {
        val id = ownerId.ifEmpty { container.ownerId().also { ownerId = it } }
        status = null
        val result = runCatching { container.cloud.count(id) }
        statusOk = result.isSuccess
        status = result.fold(
            onSuccess = { "已连接云环境" },
            onFailure = { "读写云端失败：${it.message ?: it}（数据仅存本机，联网后会自动补传）" },
        )
    }

    /** 把当前小程序码写入系统相册（API 29+ 走 MediaStore；26~28 写公共 Pictures 后通知媒体扫描） */
    fun saveQrToGallery(bitmap: Bitmap) {
        scope.launch {
            val ok = withContext(Dispatchers.IO) {
                runCatching { writeBitmapToGallery(context, bitmap) }.getOrDefault(false)
            }
            context.showToast(if (ok) "已保存到相册" else "保存失败，请检查相册权限")
        }
    }

    val savePermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val bitmap = qrBitmap
        if (granted && bitmap != null) {
            saveQrToGallery(bitmap)
        } else if (!granted) {
            context.showToast("没有相册权限，无法保存到相册")
        }
    }

    fun saveCurrentQr() {
        val bitmap = qrBitmap ?: return
        val needPermission = Build.VERSION.SDK_INT <= Build.VERSION_CODES.P &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_EXTERNAL_STORAGE) !=
            PackageManager.PERMISSION_GRANTED
        if (needPermission) {
            savePermissionLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        } else {
            saveQrToGallery(bitmap)
        }
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

    /** 生成安卓配对请求 + 小程序码（§3.2）：pair_req 落库 → account.createMiniCode 返回 base64 */
    fun generateQr() {
        if (qrGenerating) return
        qrGenerating = true
        qrStatus = null
        // 关键：先清掉旧 pairingId，让 LaunchedEffect 停掉上一轮 1.5s 轮询
        qrPairingId = null
        // 旧请求尽力清理，避免反复生成在云端堆积 pair_req
        qrDocId?.let { oldDocId ->
            container.scope.launch { runCatching { container.cloud.delete(oldDocId) } }
        }
        qrDocId = null
        qrBitmap = null
        scope.launch {
            var createdDocId: String? = null
            try {
                val pairingId = UUID.randomUUID().toString().replace("-", "")
                val pairToken = UUID.randomUUID().toString().replace("-", "").take(16)
                val now = System.currentTimeMillis()
                val expiresAt = now + 5 * 60 * 1000
                val docId = container.cloud.add(
                    buildJsonObject {
                        put("kind", "pair_req")
                        put("pairingId", pairingId)
                        put("pairToken", pairToken)
                        put("deviceType", "android")
                        put("deviceName", "安卓手机")
                        put("createdAt", now)
                        put("expiresAt", expiresAt)
                    },
                )
                createdDocId = docId
                if (docId == null) {
                    qrStatus = "创建配对请求失败，请检查网络后重试"
                    return@launch
                }
                val result = container.cloud.invokeFunction(
                    "account",
                    buildJsonObject {
                        put("action", "createMiniCode")
                        put("pairToken", pairToken)
                    },
                )
                if ((result["ok"] as? JsonPrimitive)?.content != "true") {
                    val error = (result["error"] as? JsonPrimitive)?.content ?: "生成小程序码失败"
                    qrStatus = "生成小程序码失败：$error"
                    container.scope.launch { runCatching { container.cloud.delete(docId) } }
                    return@launch
                }
                val imageBase64 = (result["imageBase64"] as? JsonPrimitive)?.takeIf { it.isString }?.content
                if (imageBase64.isNullOrBlank()) {
                    qrStatus = "云函数没有返回小程序码图片"
                    container.scope.launch { runCatching { container.cloud.delete(docId) } }
                    return@launch
                }
                val bytes = Base64.decode(imageBase64, Base64.DEFAULT)
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                if (bitmap == null) {
                    qrStatus = "小程序码图片解码失败，请重新生成"
                    container.scope.launch { runCatching { container.cloud.delete(docId) } }
                    return@launch
                }
                qrBitmap = bitmap
                qrDocId = docId
                qrExpiresAt = expiresAt
                qrPairingId = pairingId
                qrStatus = "小程序码 5 分钟内有效"
            } catch (e: Exception) {
                qrStatus = "生成小程序码失败：${e.message ?: e}"
                createdDocId?.let { id -> container.scope.launch { runCatching { container.cloud.delete(id) } } }
            } finally {
                qrGenerating = false
            }
        }
    }

    /** 备用：小程序「生成手机绑定码」→ 安卓输入 6 位数字（§3.3） */
    fun bindByCode() {
        if (pairBusy) return
        val code = pairCode.trim()
        if (!Regex("^\\d{6}$").matches(code)) {
            context.showToast("请输入 6 位数字绑定码")
            return
        }
        pairBusy = true
        scope.launch {
            val result = runCatching {
                container.cloud.queryDocuments(
                    query = mapOf("kind" to "pair_invite", "shortCode" to code),
                    limit = 5,
                )
            }
            if (result.isFailure) {
                val e = result.exceptionOrNull()
                statusOk = false
                status = "查询绑定码失败：${e?.message ?: e}（请检查网络后重试）"
                context.showToast("绑定失败，请检查网络后重试")
                pairBusy = false
                return@launch
            }
            val invites = result.getOrDefault(emptyList())
            val invite = invites.maxByOrNull { it.millisField("createdAt") ?: 0L }
            if (invite == null) {
                statusOk = false
                status = "没有找到这个绑定码（可能已过期，请在手机上重新生成）"
                pairBusy = false
                return@launch
            }
            // EJSON 解码后 createdAt/expiresAt 可能是 Double 或 Long，统一按毫秒安全转换
            val expiresAt = invite.millisField("expiresAt") ?: 0L
            if (expiresAt <= System.currentTimeMillis()) {
                statusOk = false
                status = "绑定码已过期，请在手机上重新生成"
                pairBusy = false
                return@launch
            }
            // 协议修正：账本码字段为 targetOwnerId（兼容旧字段 ownerId 回退）
            val inviteOwner = ((invite["targetOwnerId"] ?: invite["ownerId"]) as? JsonPrimitive)
                ?.takeIf { it.isString }?.content
            if (inviteOwner == null || !isValidOwnerId(inviteOwner)) {
                statusOk = false
                status = "绑定码数据异常，请重新生成"
                pairBusy = false
                return@launch
            }
            if (!container.setOwnerId(inviteOwner)) {
                statusOk = false
                status = "绑定码里的同步码格式不对"
                pairBusy = false
                return@launch
            }
            ownerId = container.ownerId()
            onOwnerChanged(ownerId)
            pairCode = ""
            context.showToast("已绑定，正在同步…")
            runCatching { container.syncManager.syncNow(true) }
            runCatching { container.savingsSyncManager.syncNow(true) }
            testCloud()
            pairBusy = false
        }
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
            runCatching { container.savingsSyncManager.syncNow(true) }
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
            runCatching { container.savingsSyncManager.syncNow(true) }
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
                onSuccess = { "已连接云环境" },
                onFailure = { "读写云端失败：${it.message ?: it}（数据仅存本机，联网后会自动补传）" },
            )
            if (result.isSuccess) {
                runCatching { container.syncManager.syncNow(true) }
                runCatching { container.savingsSyncManager.syncNow(true) }
            }
        }
    }

    // ===== 每 1.5 秒查 pair_ack；qrPairingId 变化（重新生成）或弹窗关闭时自动取消 =====
    LaunchedEffect(qrPairingId) {
        val pairingId = qrPairingId ?: return@LaunchedEffect
        while (true) {
            delay(1500)
            if (qrPairingId != pairingId) break
            if (System.currentTimeMillis() > qrExpiresAt) {
                qrStatus = "小程序码已过期，请重新生成"
                break
            }
            val ackDocs = runCatching {
                container.cloud.queryDocuments(
                    query = mapOf("kind" to "pair_ack", "pairingId" to pairingId),
                    limit = 5,
                )
            }.getOrNull() ?: continue
            val ack = ackDocs.maxByOrNull { it.millisField("createdAt") ?: 0L } ?: continue
            if ((ack.millisField("expiresAt") ?: 0L) <= System.currentTimeMillis()) continue
            // 小程序回执的账本码字段为 targetOwnerId（兼容旧字段 ownerId）
            val ackOwner = ((ack["targetOwnerId"] ?: ack["ownerId"]) as? JsonPrimitive)
                ?.takeIf { it.isString }?.content
            if (ackOwner == null || !isValidOwnerId(ackOwner)) continue
            if (!container.setOwnerId(ackOwner)) continue

            ownerId = container.ownerId()
            onOwnerChanged(ownerId)
            qrStatus = "已绑定，正在同步…"
            context.showToast("已绑定，正在同步…")
            runCatching { container.syncManager.syncNow(true) }
            runCatching { container.savingsSyncManager.syncNow(true) }
            testCloud()
            // 尽力清理自己创建的 pair_req（用完即弃）
            qrDocId?.let { docId -> container.scope.launch { runCatching { container.cloud.delete(docId) } } }
            qrDocId = null
            qrBitmap = null
            qrPairingId = null
            break
        }
    }

    // 弹窗关闭时 LaunchedEffect 随组合销毁自动取消轮询；pair_req 保留到 5 分钟自然过期，
    // 避免用户「保存图片 → 关闭弹窗 → 去微信扫」时把刚保存的码提前删坏。

    BDialog(title = "云同步", en = "SYNC", onDismiss = onDismiss) {
        // 状态行：LED + 文案
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(7.dp)
                    .background(
                        when {
                            status == null -> c.amb
                            statusOk -> c.acF
                            else -> c.cor
                        },
                    ),
            )
            Text(
                status ?: "正在检测云端连通…",
                style = TextStyle(
                    fontFamily = SansFamily,
                    fontSize = 11.5.sp,
                    lineHeight = 18.sp,
                    color = when {
                        status == null -> c.dim
                        statusOk -> c.inc
                        else -> c.cor
                    },
                ),
                modifier = Modifier.padding(start = 8.dp),
            )
        }

        // ===== 主流程：生成小程序码 → 保存相册 → 微信扫一扫（§3.2） =====
        Spacer(Modifier.height(16.dp))
        MicroLabel("扫码绑定（推荐） · QR", color = c.fnt)
        Text(
            "保存后打开微信 → 扫一扫 → 从相册选择这张图 → 按提示确认；保持本窗口打开（可切到微信），绑定成功后会自动提示",
            style = TextStyle(fontFamily = SansFamily, fontSize = 11.5.sp, lineHeight = 18.sp, color = c.dim),
            modifier = Modifier.padding(top = 6.dp),
        )
        Spacer(Modifier.height(10.dp))

        val bitmap = qrBitmap
        if (bitmap != null) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White)
                    .border(1.dp, c.ln)
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    bitmap = bitmap.asImageBitmap(),
                    contentDescription = "安卓配对小程序码",
                    modifier = Modifier.size(220.dp),
                )
            }
            Text(
                qrStatus ?: "小程序码 5 分钟内有效",
                style = TextStyle(fontFamily = SansFamily, fontSize = 10.5.sp, lineHeight = 16.sp, color = c.fnt),
                modifier = Modifier.padding(top = 6.dp),
            )
            Spacer(Modifier.height(10.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                MiniButton("重新生成", onClick = { generateQr() }, enabled = !qrGenerating)
                Spacer(Modifier.weight(1f))
                MiniButton("保存到相册", onClick = { saveCurrentQr() }, primary = true)
            }
        } else {
            Text(
                qrStatus ?: "点下方按钮生成小程序码，保存到相册后用微信扫一扫",
                style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, lineHeight = 17.sp, color = c.dim),
            )
            Spacer(Modifier.height(10.dp))
            MiniButton(
                if (qrGenerating) "生成中…" else "生成安卓配对二维码",
                onClick = { generateQr() },
                primary = true,
                enabled = !qrGenerating,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        // ===== 备用：6 位配对码（§3.3） =====
        Spacer(Modifier.height(18.dp))
        HLine()
        Spacer(Modifier.height(14.dp))
        MicroLabel("备用：6 位配对码 · PAIR", color = c.fnt)
        Text(
            "手机小程序 → 云同步 → 生成手机绑定码，把 6 位数字填到这里",
            style = TextStyle(fontFamily = SansFamily, fontSize = 11.5.sp, lineHeight = 18.sp, color = c.dim),
            modifier = Modifier.padding(top = 6.dp),
        )
        Spacer(Modifier.height(8.dp))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            BTextField(
                value = pairCode,
                onValueChange = { pairCode = it.filter { ch -> ch.isDigit() }.take(6) },
                placeholder = "6 位数字",
                maxLength = 6,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                textSize = 20.sp,
                mono = true,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(10.dp))
            MiniButton(
                if (pairBusy) "绑定中…" else "绑定",
                onClick = { bindByCode() },
                primary = true,
            )
        }
        HLine(Modifier.padding(top = 6.dp))
        Text(
            "绑定码 5 分钟内有效；绑定后自动换成同一个账本并立即同步",
            style = TextStyle(fontFamily = SansFamily, fontSize = 10.5.sp, lineHeight = 16.sp, color = c.fnt),
            modifier = Modifier.padding(top = 6.dp),
        )

        // ===== 高级（备用同步码）：原来的同步码 / 加入 / 换新码 =====
        Spacer(Modifier.height(18.dp))
        HLine()
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { showAdvanced = !showAdvanced }
                .padding(vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MicroLabel("高级（备用同步码） · ADVANCED", color = c.dim)
            Spacer(Modifier.weight(1f))
            Text(
                if (showAdvanced) "▴" else "▾",
                style = TextStyle(fontFamily = MonoFamily, fontSize = 10.sp, color = c.fnt),
            )
        }
        if (showAdvanced) {
            MicroLabel("我的同步码 · CODE", color = c.fnt)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(vertical = 8.dp),
            ) {
                Text(
                    formatOwnerId(ownerId),
                    style = TextStyle(
                        fontFamily = MonoFamily,
                        fontSize = 19.sp,
                        letterSpacing = 2.sp,
                        color = c.tx,
                    ),
                    maxLines = 1,
                    modifier = Modifier.weight(1f),
                )
                MiniButton("复制", onClick = { copyOwnerId() }, primary = true, height = 32.dp)
            }
            Text(
                "在电脑或小程序里输入同一个码，就同步同一本账；别人用会自动分到各自的账本，互相看不到",
                style = TextStyle(fontFamily = SansFamily, fontSize = 11.5.sp, lineHeight = 18.sp, color = c.dim),
            )

            Spacer(Modifier.height(16.dp))
            MicroLabel("输入其他设备的码 · JOIN", color = c.fnt)
            BTextField(
                value = joinInput,
                onValueChange = { joinInput = it },
                placeholder = "如：ABCD-EFGH-JKMN",
                maxLength = 16,
                textSize = 14.sp,
                mono = true,
                modifier = Modifier.padding(top = 6.dp),
            )
            HLine(Modifier.padding(top = 6.dp))

            Spacer(Modifier.height(14.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                MiniButton("换新码", onClick = { confirmRegenerate = true })
                Spacer(Modifier.weight(1f))
                MiniButton("加入", onClick = { join() }, primary = true)
            }
        }

        // ===== 自定义云环境（保留原折叠区） =====
        Spacer(Modifier.height(16.dp))
        HLine()
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { showEnv = !showEnv }
                .padding(vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MicroLabel("自定义云环境 · ADVANCED", color = c.dim)
            Spacer(Modifier.weight(1f))
            Text(
                if (showEnv) "▴" else "▾",
                style = TextStyle(fontFamily = MonoFamily, fontSize = 10.sp, color = c.fnt),
            )
        }
        if (showEnv) {
            Text(
                "自己有微信云开发 / CloudBase 环境时，填它的环境 ID，账本就存进你自己的云数据库；不填则用默认环境。" +
                    "注意：换环境后各环境的账互不可见，需在新环境里重新输入同步码对码",
                style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, lineHeight = 17.sp, color = c.dim),
            )
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                MicroLabel("当前环境", color = c.fnt)
                Spacer(Modifier.width(8.dp))
                Text(
                    envId + if (envId == CloudEnv.DEFAULT_ENV_ID) "（默认）" else "（自定义）",
                    style = TextStyle(fontFamily = MonoFamily, fontSize = 10.5.sp, color = c.tx),
                    maxLines = 1,
                )
            }
            Spacer(Modifier.height(8.dp))
            BTextField(
                value = envInput,
                onValueChange = { envInput = it },
                placeholder = "默认：" + CloudEnv.DEFAULT_ENV_ID,
                maxLength = 64,
                textSize = 13.sp,
                mono = true,
            )
            HLine(Modifier.padding(top = 6.dp))
            Spacer(Modifier.height(12.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                MiniButton("恢复默认", onClick = { applyEnv("") })
                Spacer(Modifier.weight(1f))
                MiniButton("保存并重连", onClick = { applyEnv(envInput) }, primary = true)
            }
        }
        Spacer(Modifier.height(4.dp))
    }

    if (confirmRegenerate) {
        BConfirm(
            title = "换新同步码？",
            message = "换新码后本机将和一个新的云端账本同步，旧账本数据仍在云端但不再拉取",
            confirmText = "换新码",
            danger = false,
            onConfirm = {
                confirmRegenerate = false
                regenerate()
            },
            onDismiss = { confirmRegenerate = false },
        )
    }
}

/** EJSON 解码后的时间字段统一转毫秒：兼容 Long / Double / 字符串数字（toDouble().toLong() 防类型差异）。 */
private fun JsonObject.millisField(key: String): Long? {
    val p = this[key] as? JsonPrimitive ?: return null
    return p.content.toDoubleOrNull()?.toDouble()?.toLong()
}

/** 保存 PNG 到系统相册：API 29+ 用 MediaStore 的 RELATIVE_PATH/IS_PENDING；26~28 写 Pictures 后扫描。 */
private fun writeBitmapToGallery(context: Context, bitmap: Bitmap): Boolean {
    val fileName = "jixu_pair_${System.currentTimeMillis()}.png"
    val resolver = context.contentResolver
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
            put(MediaStore.Images.Media.MIME_TYPE, "image/png")
            put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/JiXu")
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return false
        val wrote = resolver.openOutputStream(uri)?.use { out ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
        } ?: false
        if (!wrote) {
            resolver.delete(uri, null, null)
            return false
        }
        values.clear()
        values.put(MediaStore.Images.Media.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
        return true
    }

    @Suppress("DEPRECATION")
    val pictures = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
    val dir = File(pictures, "JiXu")
    if (!dir.exists() && !dir.mkdirs()) return false
    val file = File(dir, fileName)
    val wrote = FileOutputStream(file).use { out ->
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
    }
    if (!wrote) return false
    MediaScannerConnection.scanFile(context, arrayOf(file.absolutePath), arrayOf("image/png"), null)
    return true
}
