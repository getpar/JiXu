package com.jixu.app.ui.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jixu.app.AppContainer
import com.jixu.app.BuildConfig
import com.jixu.app.core.AMOUNT_INPUT_MAX_LENGTH
import com.jixu.app.core.formatOwnerId
import com.jixu.app.core.formatMoney
import com.jixu.app.core.jsRound
import com.jixu.app.core.parseAmountInput
import com.jixu.app.core.sanitizeAmountInput
import com.jixu.app.core.sumAmounts
import com.jixu.app.data.DueSummary
import com.jixu.app.data.PrefsKeys
import com.jixu.app.data.db.RecordEntity
import com.jixu.app.ui.screens.cloud.CloudSyncDialog
import com.jixu.app.ui.screens.common.JxAmount
import com.jixu.app.ui.screens.common.JxCard
import com.jixu.app.ui.screens.common.JxConfirmDialog
import com.jixu.app.ui.screens.common.JxDialog
import com.jixu.app.ui.screens.common.JxDivider
import com.jixu.app.ui.screens.common.JxEmpty
import com.jixu.app.ui.screens.common.JxLabel
import com.jixu.app.ui.screens.common.JxLink
import com.jixu.app.ui.screens.common.JxSectionTitle
import com.jixu.app.ui.screens.common.JxTextField
import com.jixu.app.ui.screens.common.JxTitle
import com.jixu.app.ui.screens.common.PhotoPreviewDialog
import com.jixu.app.ui.screens.common.currentMonth
import com.jixu.app.ui.screens.common.monthOptions
import com.jixu.app.ui.screens.common.showToast
import com.jixu.app.ui.screens.common.todayStr
import com.jixu.app.ui.theme.JiXuTheme
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth

/**
 * 首页（开发文档 §8.1，参照 miniapp/src/pages/index/index.tsx）。
 * 页脚的云同步/清除数据入口在 P7 接线；外观切换也在 P7。
 */
@Composable
fun HomeScreen(
    container: AppContainer,
    onOpenAdd: () -> Unit,
    onOpenHistory: () -> Unit,
    onOpenStats: () -> Unit,
    onOpenTodos: () -> Unit,
    onOpenCategories: () -> Unit,
    onOpenRecurring: () -> Unit,
    onDueCount: (Int) -> Unit,
) {
    val colors = JiXuTheme.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repo = container.repository
    val recordsFlow = remember { repo.observeAliveRecords() }
    val records by recordsFlow.collectAsStateWithLifecycle(emptyList())

    var month by rememberSaveable { mutableStateOf(currentMonth()) }
    var monthOpen by remember { mutableStateOf(false) }
    var budget by remember { mutableDoubleStateOf(0.0) }
    var showBudget by remember { mutableStateOf(false) }
    var budgetInput by remember { mutableStateOf("") }
    var ownerId by remember { mutableStateOf("") }
    var themePref by remember { mutableStateOf("system") }
    var dueInfo by remember { mutableStateOf(DueSummary(0, 0)) }
    var debugBusy by remember { mutableStateOf(false) }
    var showTheme by remember { mutableStateOf(false) }
    var showCloud by remember { mutableStateOf(false) }
    var showClear by remember { mutableStateOf(false) }
    var photoPreview by remember { mutableStateOf<String?>(null) }

    val dark = isSystemInDarkTheme()
    // 编译期常量：release 包里 R8 直接裁掉整个调试入口
    val debuggable = BuildConfig.DEBUG

    val monthRecords = remember(records, month) { records.filter { it.date.startsWith(month) } }
    val exp = remember(monthRecords) {
        sumAmounts(monthRecords.filter { it.type == "expense" }.map { it.amount }.toDoubleArray())
    }
    val inc = remember(monthRecords) {
        sumAmounts(monthRecords.filter { it.type == "income" }.map { it.amount }.toDoubleArray())
    }
    val top3 = remember(monthRecords) { top3Of(monthRecords) }
    val recent = remember(monthRecords) { monthRecords.take(8) }

    val isCurrentMonth = month == currentMonth()
    val balance = inc - exp
    val pct = if (budget > 0) jsRound(exp / budget * 100).toInt() else 0
    val over = budget > 0 && exp > budget
    val budgetColor = when {
        over -> colors.exp
        pct >= 80 -> colors.warn
        else -> colors.accent
    }
    val remainDays = remember(month) {
        val today = LocalDate.now()
        maxOf(YearMonth.parse(month).lengthOfMonth() - today.dayOfMonth + 1, 1)
    }
    val budgetLeft = budget - exp
    val dailyLeft = if (budgetLeft > 0) budgetLeft / remainDays else 0.0
    val dueTotal = dueInfo.due + dueInfo.overdue

    /** 进页（§8.1-9）：先同步，结束后再执行到期周期账单；再刷新待办角标与每日提醒 */
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        scope.launch {
            runCatching { container.syncManager.syncNow(false) }
            val executed = runCatching { repo.checkAndExecuteDueBills() }.getOrDefault(emptyList())
            if (executed.isNotEmpty()) {
                context.showToast("已自动记录 ${executed.size} 笔周期账单")
            }
            budget = runCatching { repo.getBudget() }.getOrDefault(0.0)
            ownerId = runCatching { container.ownerId() }.getOrDefault("")
            themePref = runCatching { container.store.get(PrefsKeys.UI_THEME_PREF) }.getOrNull() ?: "system"

            val info = runCatching { repo.getDueSummary() }.getOrDefault(DueSummary(0, 0))
            dueInfo = info
            onDueCount(info.due + info.overdue)
            val n = info.due + info.overdue
            if (n > 0) {
                val today = todayStr()
                val lastRemind = runCatching { container.store.get(PrefsKeys.LAST_DUE_REMIND) }.getOrNull()
                if (lastRemind != today) {
                    runCatching { container.store.set(PrefsKeys.LAST_DUE_REMIND, today) }
                    context.showToast(
                        "今天有 $n 个待办" + if (info.overdue > 0) "（含 ${info.overdue} 个已逾期）" else "",
                    )
                }
            }
        }
    }

    fun saveBudget() {
        val raw = budgetInput.trim()
        if (raw.isEmpty()) return
        if (raw.toDoubleOrNull() == 0.0) {
            scope.launch {
                repo.setBudget(0.0)
                budget = 0.0
                showBudget = false
            }
            return
        }
        val parsed = parseAmountInput(raw)
        if (!parsed.ok) {
            context.showToast(parsed.message)
            return
        }
        scope.launch {
            repo.setBudget(parsed.value)
            budget = parsed.value
            showBudget = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 14.dp),
    ) {
        Spacer(Modifier.height(8.dp))

        // ===== 顶栏：品牌 + 月份选择 =====
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Text("计序", fontSize = 21.sp, fontWeight = FontWeight.Medium, color = colors.text)
            Spacer(Modifier.weight(1f))
            Box {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(colors.card)
                        .clickable { monthOpen = true }
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    Text(month, fontSize = 13.sp, color = colors.sub)
                    Spacer(Modifier.width(6.dp))
                    Text("▼", fontSize = 9.sp, color = colors.faint)
                }
                DropdownMenu(expanded = monthOpen, onDismissRequest = { monthOpen = false }) {
                    monthOptions().forEach { m ->
                        DropdownMenuItem(
                            text = { Text(m, color = if (m == month) colors.accent else colors.text) },
                            onClick = {
                                month = m
                                monthOpen = false
                            },
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(12.dp))

        // ===== 待办到期横幅 =====
        if (dueTotal > 0) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(colors.warnSoft)
                    .clickable(onClick = onOpenTodos)
                    .padding(horizontal = 14.dp, vertical = 12.dp),
            ) {
                Text(
                    "今天有 $dueTotal 个待办要处理" +
                        if (dueInfo.overdue > 0) "（含 ${dueInfo.overdue} 个已逾期）" else "",
                    fontSize = 12.sp,
                    color = colors.warn,
                    modifier = Modifier.weight(1f),
                )
                Text("去处理 ›", fontSize = 12.sp, color = colors.warn)
            }
            Spacer(Modifier.height(10.dp))
        }

        // ===== 结余主卡 =====
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .background(colors.hero)
                .padding(18.dp),
        ) {
            Text("本月结余", fontSize = 12.sp, color = Color.White.copy(alpha = 0.75f))
            Spacer(Modifier.height(6.dp))
            Text(
                (if (balance >= 0) "+" else "-") + "¥" + formatMoney(kotlin.math.abs(balance)),
                fontSize = 28.sp,
                fontWeight = FontWeight.Medium,
                color = Color.White,
            )
            Spacer(Modifier.height(14.dp))
            Row {
                Text("支出 ", fontSize = 12.sp, color = Color.White.copy(alpha = 0.7f))
                Text("¥" + formatMoney(exp), fontSize = 12.sp, color = Color.White)
                Spacer(Modifier.width(20.dp))
                Text("收入 ", fontSize = 12.sp, color = Color.White.copy(alpha = 0.7f))
                Text("¥" + formatMoney(inc), fontSize = 12.sp, color = Color.White)
            }
        }

        // ===== 预算卡（仅当月且已设预算） =====
        if (isCurrentMonth && budget > 0) {
            Spacer(Modifier.height(10.dp))
            JxCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    JxTitle("本月预算", Modifier.weight(1f))
                    Text(
                        if (over) "已超支" else "$pct%",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        color = budgetColor,
                    )
                }
                Spacer(Modifier.height(10.dp))
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .clip(RoundedCornerShape(99.dp))
                        .background(colors.soft),
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth((minOf(pct, 100).coerceAtLeast(0)) / 100f)
                            .height(6.dp)
                            .clip(RoundedCornerShape(99.dp))
                            .background(budgetColor),
                    )
                }
                Spacer(Modifier.height(8.dp))
                Row {
                    JxLabel("已用 ¥" + formatMoney(exp), Modifier.weight(1f))
                    JxLabel("预算 ¥" + formatMoney(budget))
                }
                Spacer(Modifier.height(12.dp))
                Row {
                    Column(Modifier.weight(1f)) {
                        JxLabel(if (budgetLeft < 0) "已超支" else "剩余可花")
                        Text(
                            (if (budgetLeft < 0) "-" else "") + "¥" + formatMoney(kotlin.math.abs(budgetLeft)),
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Medium,
                            color = if (budgetLeft < 0) colors.exp else colors.text,
                        )
                    }
                    Column(Modifier.weight(1f)) {
                        JxLabel("日均可花")
                        Text(
                            "¥" + formatMoney(dailyLeft),
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Medium,
                            color = colors.text,
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                JxLabel(
                    if (budgetLeft >= 0) {
                        "按本月剩余 $remainDays 天算，每天约可花 ¥${formatMoney(dailyLeft)}"
                    } else {
                        "已超出预算，建议收紧本月开支"
                    },
                )
            }
        }

        // ===== 这个月钱花哪了 =====
        if (top3.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            JxCard(onClick = onOpenStats) {
                JxSectionTitle("这个月钱花哪了")
                Spacer(Modifier.height(10.dp))
                top3.forEachIndexed { i, t ->
                    val p = if (exp > 0) jsRound(t.total / exp * 100).toInt() else 0
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(t.name, fontSize = 13.sp, color = colors.text, modifier = Modifier.weight(1f))
                        Text("¥" + formatMoney(t.total) + " · $p%", fontSize = 11.sp, color = colors.muted)
                    }
                    Spacer(Modifier.height(6.dp))
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(4.dp)
                            .clip(RoundedCornerShape(99.dp))
                            .background(colors.soft),
                    ) {
                        Box(
                            Modifier
                                .fillMaxWidth(maxOf(p, 3).coerceAtMost(100) / 100f)
                                .height(4.dp)
                                .clip(RoundedCornerShape(99.dp))
                                .background(
                                    when (i) {
                                        0 -> colors.accent
                                        1 -> colors.accent2
                                        else -> colors.accent3
                                    },
                                ),
                        )
                    }
                    if (i != top3.lastIndex) Spacer(Modifier.height(10.dp))
                }
            }
        }

        // ===== 快捷操作 3×2 =====
        Spacer(Modifier.height(10.dp))
        val actions: List<Pair<String, () -> Unit>> = listOf(
            "记账" to onOpenAdd,
            "待办" to onOpenTodos,
            (if (budget > 0) "预算" else "设预算") to {
                budgetInput = if (budget > 0) jsRound(budget).toLong().toString() else ""
                showBudget = true
            },
            "分类" to onOpenCategories,
            "周期" to onOpenRecurring,
            "统计" to onOpenStats,
        )
        actions.chunked(3).forEachIndexed { rowIndex, row ->
            if (rowIndex > 0) Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { (label, action) ->
                    JxCard(modifier = Modifier.weight(1f), onClick = action, padding = 0.dp) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .padding(vertical = 14.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(label, fontSize = 13.sp, color = colors.text)
                        }
                    }
                }
                repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }

        // ===== 最近记录 =====
        Spacer(Modifier.height(10.dp))
        JxCard {
            Row(verticalAlignment = Alignment.CenterVertically) {
                JxSectionTitle("最近记录", Modifier.weight(1f))
                JxLink("全部 ›", onClick = onOpenHistory)
            }
            Spacer(Modifier.height(6.dp))
            if (recent.isEmpty()) {
                JxEmpty("暂无记录，去记一笔吧")
            } else {
                recent.forEachIndexed { index, r ->
                    if (index > 0) JxDivider()
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 9.dp),
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(r.subcategoryName, fontSize = 14.sp, color = colors.text)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    r.date +
                                        (if (r.person.isNotEmpty()) " · " + r.person else "") +
                                        (if (r.note.isNotEmpty()) " · " + r.note else ""),
                                    modifier = Modifier.weight(1f, fill = false),
                                    fontSize = 11.sp,
                                    color = colors.muted,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                if (!r.photo.isNullOrEmpty()) {
                                    Spacer(Modifier.width(6.dp))
                                    Text(
                                        "凭证",
                                        fontSize = 11.sp,
                                        color = colors.accent2,
                                        modifier = Modifier.clickable { photoPreview = r.photo },
                                    )
                                }
                            }
                        }
                        JxAmount(r.amount, r.type)
                    }
                }
            }
        }

        // ===== 页脚：外观 / 云同步 / 清除数据 =====
        Spacer(Modifier.height(10.dp))
        val prefLabel = when (themePref) {
            "light" -> "始终浅色"
            "dark" -> "始终深色"
            else -> "跟随系统"
        }
        JxCard(onClick = { showTheme = true }) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                Text(
                    "外观 · $prefLabel" + if (themePref == "system" && dark) "（当前深色）" else "",
                    fontSize = 13.sp,
                    color = colors.sub,
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        JxCard(onClick = { showCloud = true }) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                Text(
                    "云同步 · 同步码：" + formatOwnerId(ownerId).ifEmpty { "--------" },
                    fontSize = 13.sp,
                    color = colors.sub,
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        JxCard(onClick = { showClear = true }) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                Text("清除所有数据", fontSize = 13.sp, color = colors.sub)
            }
        }

        // ===== 调试工具（仅 debug 包） =====
        if (debuggable) {
            Spacer(Modifier.height(10.dp))
            JxCard {
                JxLabel("调试工具（仅 debug 包，模拟账单不参与云同步）")
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    JxLink(if (debugBusy) "处理中…" else "插入 5000 条模拟账单", onClick = {
                        if (debugBusy) return@JxLink
                        debugBusy = true
                        scope.launch {
                            runCatching { repo.insertDebugRecords(5000) }
                            debugBusy = false
                            context.showToast("已插入 5000 条模拟账单")
                        }
                    })
                    JxLink("清空调试数据", onClick = {
                        if (debugBusy) return@JxLink
                        debugBusy = true
                        scope.launch {
                            runCatching { repo.clearDebugRecords() }
                            debugBusy = false
                            context.showToast("已清空调试数据")
                        }
                    }, color = colors.exp)
                }
            }
        }

        Spacer(Modifier.height(24.dp))
    }

    // ===== 预算弹窗 =====
    if (showBudget) {
        JxDialog(title = "设置月度预算", onDismiss = { showBudget = false }) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("¥", fontSize = 22.sp, fontWeight = FontWeight.Medium, color = colors.accent)
                Spacer(Modifier.width(8.dp))
                JxTextField(
                    value = budgetInput,
                    onValueChange = { budgetInput = sanitizeAmountInput(it) },
                    placeholder = "输入金额",
                    maxLength = AMOUNT_INPUT_MAX_LENGTH,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    textSize = 22.sp,
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(10.dp))
            JxDivider()
            Spacer(Modifier.height(14.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(24.dp),
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Spacer(Modifier.weight(1f))
                JxLink("取消", onClick = { showBudget = false }, color = colors.sub, size = 14.sp)
                JxLink("保存", onClick = { saveBudget() }, size = 14.sp)
            }
        }
    }

    // ===== 外观三态（§9） =====
    if (showTheme) {
        JxDialog(title = "外观", onDismiss = { showTheme = false }) {
            listOf(
                "system" to "跟随系统",
                "light" to "始终浅色",
                "dark" to "始终深色",
            ).forEach { (key, label) ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .clickable {
                            scope.launch {
                                runCatching { container.store.set(PrefsKeys.UI_THEME_PREF, key) }
                                themePref = key
                                showTheme = false
                            }
                        }
                        .padding(horizontal = 10.dp, vertical = 12.dp),
                ) {
                    Text(
                        label,
                        fontSize = 15.sp,
                        color = if (themePref == key) colors.accent else colors.text,
                        modifier = Modifier.weight(1f),
                    )
                    if (themePref == key) Text("✓", fontSize = 14.sp, color = colors.accent)
                }
            }
        }
    }

    // ===== 清除本机所有数据（§7.9） =====
    if (showClear) {
        JxConfirmDialog(
            title = "清除本机所有数据？",
            message = "将清空本机的账单、待办、周期账单、预算、自定义分类和小票照片，并换一个新同步码。" +
                "云端账本不会删除，记下原同步码 ${formatOwnerId(ownerId)}，以后在「云同步」里加入即可找回",
            confirmText = "清除",
            confirmColor = colors.exp,
            onConfirm = {
                showClear = false
                scope.launch {
                    // 等在途/排队的同步结束再清，避免旧账被写回（§7.9）
                    runCatching { container.syncManager.awaitQuiescent() }
                    runCatching { repo.clearAllLocalData() }
                    budget = 0.0
                    dueInfo = DueSummary(0, 0)
                    onDueCount(0)
                    themePref = "system"
                    // 清除后换新同步码（旧码已清掉，ownerId() 自动生成新码）
                    ownerId = runCatching { container.ownerId() }.getOrDefault("")
                }
            },
            onDismiss = { showClear = false },
        )
    }

    // ===== 云同步弹窗（§8.8） =====
    if (showCloud) {
        CloudSyncDialog(
            container = container,
            onDismiss = { showCloud = false },
            onOwnerChanged = { ownerId = it },
        )
    }

    // ===== 小票大图（§12） =====
    photoPreview?.let { path ->
        PhotoPreviewDialog(path = path, onDismiss = { photoPreview = null })
    }
}

/** Top3 一级分类（支出，按分累加，金额倒序；口径同 §7.5） */
private data class TopCat(val key: String, val name: String, val total: Double)

private fun top3Of(records: List<RecordEntity>): List<TopCat> {
    val names = LinkedHashMap<String, String>()
    val cents = LinkedHashMap<String, Double>()
    for (r in records) {
        if (r.type != "expense" || r.categoryKey.isEmpty()) continue
        if (!names.containsKey(r.categoryKey)) {
            names[r.categoryKey] = r.categoryName
            cents[r.categoryKey] = 0.0
        }
        if (r.amount.isFinite()) {
            cents[r.categoryKey] = (cents[r.categoryKey] ?: 0.0) + jsRound(r.amount * 100)
        }
    }
    return names.map { (key, name) -> TopCat(key, name, (cents[key] ?: 0.0) / 100) }
        .sortedByDescending { it.total }
        .take(3)
}
