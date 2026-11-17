package com.jixu.app.ui.screens.home

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jixu.app.AppContainer
import com.jixu.app.BuildConfig
import com.jixu.app.core.jsRound
import com.jixu.app.core.parseAmountInput
import com.jixu.app.core.sanitizeAmountInput
import com.jixu.app.core.sumAmounts
import com.jixu.app.data.DueSummary
import com.jixu.app.data.PrefsKeys
import com.jixu.app.ui.screens.cloud.CloudSyncDialog
import com.jixu.app.ui.screens.common.PhotoPreviewDialog
import com.jixu.app.ui.screens.common.currentMonth
import com.jixu.app.ui.screens.common.showToast
import com.jixu.app.ui.screens.common.todayStr
import com.jixu.app.ui.theme.JiXuTheme
import com.jixu.app.ui.theme.UiStyle
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth

/**
 * 首页（开发文档 §8.1）：M-01 本月支出 / M-02 预算表盘 / M-03 最近记录。
 * 业务逻辑与旧版一致（进页同步 → 执行周期账单 → 刷待办角标与提醒），只换视觉层。
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
    onOpenSavings: () -> Unit,
    onDueCount: (Int) -> Unit,
) {
    val c = JiXuTheme.colors
    val dark = JiXuTheme.dark
    val mini = JiXuTheme.style == UiStyle.MINIAPP
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
    var cloudBound by remember { mutableStateOf(false) }
    var themePref by remember { mutableStateOf("system") }
    var uiStylePref by remember { mutableStateOf("instrument") }
    var dueInfo by remember { mutableStateOf(DueSummary(0, 0)) }
    var showTheme by remember { mutableStateOf(false) }
    var showCloud by remember { mutableStateOf(false) }
    var showClear by remember { mutableStateOf(false) }
    var photoPreview by remember { mutableStateOf<String?>(null) }

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
        over -> c.cor
        pct >= 80 -> c.amb
        else -> c.acF
    }
    val daysInMonth = remember(month) { YearMonth.parse(month).lengthOfMonth() }
    val dayOfMonth = remember(month) {
        val today = LocalDate.now()
        if (month == currentMonth()) today.dayOfMonth else daysInMonth
    }
    val remainDays = remember(month) { maxOf(daysInMonth - dayOfMonth + 1, 1) }
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
            // 绑定状态按「这个账本是否成功同步过」判断：cloud_last_sync_at_<ownerId> 由同步引擎成功落盘后写入
            ownerId = runCatching { container.ownerId() }.getOrDefault("")
            cloudBound = !runCatching { container.store.get("cloud_last_sync_at_" + ownerId) }
                .getOrNull()
                .isNullOrBlank()
            themePref = runCatching { container.store.get(PrefsKeys.UI_THEME_PREF) }.getOrNull() ?: "system"
            uiStylePref = runCatching { container.store.get(PrefsKeys.UI_STYLE_PREF) }.getOrNull() ?: "instrument"

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
        Spacer(Modifier.height(6.dp))

        HomeHeader(
            mini = mini,
            dark = dark,
            onOpenCloud = { showCloud = true },
            onOpenTheme = { showTheme = true },
        )

        Spacer(Modifier.height(12.dp))

        HomeDueBanner(
            dueTotal = dueTotal,
            dueInfo = dueInfo,
            onClick = onOpenTodos,
        )

        HomeOverviewCard(
            mini = mini,
            isCurrentMonth = isCurrentMonth,
            month = month,
            monthOpen = monthOpen,
            onMonthOpen = { monthOpen = true },
            onMonthDismiss = { monthOpen = false },
            onMonthPick = {
                month = it
                monthOpen = false
            },
            exp = exp,
            inc = inc,
            balance = balance,
            entryCount = monthRecords.size,
            top3 = top3,
            onOpenStats = onOpenStats,
        )

        Spacer(Modifier.height(10.dp))

        HomeSavingsEntry(onOpenSavings = onOpenSavings)

        Spacer(Modifier.height(10.dp))

        HomeBudgetCard(
            mini = mini,
            isCurrentMonth = isCurrentMonth,
            budget = budget,
            exp = exp,
            over = over,
            pct = pct,
            budgetColor = budgetColor,
            daysInMonth = daysInMonth,
            dayOfMonth = dayOfMonth,
            remainDays = remainDays,
            dailyLeft = dailyLeft,
            budgetLeft = budgetLeft,
            onNewBudget = {
                budgetInput = ""
                showBudget = true
            },
            onEditBudget = {
                budgetInput = if (budget > 0) jsRound(budget).toLong().toString() else ""
                showBudget = true
            },
            onOpenStats = onOpenStats,
        )

        Spacer(Modifier.height(10.dp))

        HomeRecentCard(
            recent = recent,
            onOpenHistory = onOpenHistory,
            onPreviewPhoto = { photoPreview = it },
        )

        Spacer(Modifier.height(10.dp))

        HomeQuickActions(
            mini = mini,
            budget = budget,
            onOpenAdd = onOpenAdd,
            onOpenTodos = onOpenTodos,
            onEditBudget = {
                budgetInput = if (budget > 0) jsRound(budget).toLong().toString() else ""
                showBudget = true
            },
            onOpenCategories = onOpenCategories,
            onOpenRecurring = onOpenRecurring,
            onOpenStats = onOpenStats,
        )

        Spacer(Modifier.height(10.dp))

        HomeSystemGroup(
            themePref = themePref,
            dark = dark,
            cloudBound = cloudBound,
            onOpenTheme = { showTheme = true },
            onOpenCloud = { showCloud = true },
            onClearData = { showClear = true },
        )

        // ===== 调试工具（仅 debug 包） =====
        if (debuggable) {
            Spacer(Modifier.height(10.dp))
            HomeDebugPanel(container = container)
        }

        Spacer(Modifier.height(24.dp))
    }

    if (showBudget) {
        BudgetDialog(
            value = budgetInput,
            onValueChange = { budgetInput = sanitizeAmountInput(it) },
            onDismiss = { showBudget = false },
            onSave = { saveBudget() },
        )
    }

    if (showTheme) {
        ThemeDialog(
            themePref = themePref,
            uiStylePref = uiStylePref,
            onSelectTheme = { key ->
                scope.launch {
                    runCatching { container.store.set(PrefsKeys.UI_THEME_PREF, key) }
                    themePref = key
                    showTheme = false
                }
            },
            onSelectStyle = { key ->
                scope.launch {
                    runCatching { container.store.set(PrefsKeys.UI_STYLE_PREF, key) }
                    uiStylePref = key
                }
            },
            onDismiss = { showTheme = false },
        )
    }

    if (showClear) {
        ClearDataDialog(
            ownerId = ownerId,
            onConfirm = {
                showClear = false
                scope.launch {
                    // 等在途/排队的同步结束再清，避免旧账被写回（§7.9）
                    runCatching { container.syncManager.awaitQuiescent() }
                    runCatching { container.savingsSyncManager.awaitQuiescent() }
                    runCatching { repo.clearAllLocalData() }
                    budget = 0.0
                    dueInfo = DueSummary(0, 0)
                    onDueCount(0)
                    themePref = "system"
                    // 清除后换新同步码（旧码已清掉，ownerId() 自动生成新码；新账本尚未同步过）
                    ownerId = runCatching { container.ownerId() }.getOrDefault("")
                    cloudBound = false
                }
            },
            onDismiss = { showClear = false },
        )
    }

    // ===== 云同步弹窗（§8.8） =====
    if (showCloud) {
        CloudSyncDialog(
            container = container,
            onDismiss = {
                showCloud = false
                // 弹窗内绑定/加入/换码后已强制同步，关闭时按最新同步记录刷新「已绑定/未绑定」
                scope.launch {
                    val id = runCatching { container.ownerId() }.getOrDefault("")
                    ownerId = id
                    cloudBound = !runCatching { container.store.get("cloud_last_sync_at_" + id) }
                        .getOrNull()
                        .isNullOrBlank()
                }
            },
            onOwnerChanged = { ownerId = it },
        )
    }

    // ===== 小票大图（§12） =====
    photoPreview?.let { path ->
        PhotoPreviewDialog(path = path, onDismiss = { photoPreview = null })
    }
}
