package com.jixu.app.ui.screens.home

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
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
import com.jixu.app.core.formatMoney
import com.jixu.app.core.formatOwnerId
import com.jixu.app.core.jsRound
import com.jixu.app.core.parseAmountInput
import com.jixu.app.core.sanitizeAmountInput
import com.jixu.app.core.sumAmounts
import com.jixu.app.data.DueSummary
import com.jixu.app.data.PrefsKeys
import com.jixu.app.data.db.RecordEntity
import com.jixu.app.ui.screens.cloud.CloudSyncDialog
import com.jixu.app.ui.screens.common.BConfirm
import com.jixu.app.ui.screens.common.BDialog
import com.jixu.app.ui.screens.common.BTextField
import com.jixu.app.ui.screens.common.Chip
import com.jixu.app.ui.screens.common.DayHeader
import com.jixu.app.ui.screens.common.Dot
import com.jixu.app.ui.screens.common.EmptyLine
import com.jixu.app.ui.screens.common.HLine
import com.jixu.app.ui.screens.common.HeroAmount
import com.jixu.app.ui.screens.common.MicroLabel
import com.jixu.app.ui.screens.common.MiniButton
import com.jixu.app.ui.screens.common.ModuleHeader
import com.jixu.app.ui.screens.common.MoneyText
import com.jixu.app.ui.screens.common.Panel
import com.jixu.app.ui.screens.common.PhotoPreviewDialog
import com.jixu.app.ui.screens.common.PictBox
import com.jixu.app.ui.screens.common.RowItem
import com.jixu.app.ui.screens.common.currentMonth
import com.jixu.app.ui.screens.common.mmddDot
import com.jixu.app.ui.screens.common.monthDot
import com.jixu.app.ui.screens.common.monthOptions
import com.jixu.app.ui.screens.common.showToast
import com.jixu.app.ui.screens.common.todayStr
import com.jixu.app.ui.theme.JiXuTheme
import com.jixu.app.ui.theme.MonoFamily
import com.jixu.app.ui.theme.SansFamily
import com.jixu.app.ui.theme.UiStyle
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth
import kotlin.math.abs

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
    var debugBusy by remember { mutableStateOf(false) }
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

        // ===== 顶栏：品牌 + 同步 + 外观 =====
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.weight(1f)) {
                Text(
                    "计序",
                    style = TextStyle(
                        fontFamily = SansFamily,
                        fontSize = if (mini) 26.sp else 22.sp,
                        fontWeight = if (mini) FontWeight.Medium else FontWeight.Bold,
                        color = c.tx,
                    ),
                )
                if (!mini) {
                    MicroLabel("JIXU · NIGHT INSTRUMENT", modifier = Modifier.padding(top = 3.dp), color = c.dim)
                }
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .height(38.dp)
                    .clip(if (mini) RoundedCornerShape(12.dp) else RoundedCornerShape(0.dp))
                    .background(if (mini) c.p1 else Color.Transparent)
                    .border(1.dp, c.ln, if (mini) RoundedCornerShape(12.dp) else RoundedCornerShape(0.dp))
                    .clickable { showCloud = true }
                    .padding(horizontal = 11.dp),
            ) {
                Dot(c.acF)
                Text(
                    "云同步",
                    style = TextStyle(fontFamily = SansFamily, fontSize = 11.5.sp, color = c.dim),
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
            Spacer(Modifier.width(8.dp))
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .clip(if (mini) RoundedCornerShape(12.dp) else RoundedCornerShape(0.dp))
                    .background(if (mini) c.p1 else Color.Transparent)
                    .border(1.dp, c.ln2, if (mini) RoundedCornerShape(12.dp) else RoundedCornerShape(0.dp))
                    .clickable { showTheme = true },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    if (dark) Icons.Filled.LightMode else Icons.Filled.DarkMode,
                    contentDescription = "外观",
                    tint = c.tx,
                    modifier = Modifier.size(19.dp),
                )
            }
        }

        Spacer(Modifier.height(12.dp))

        // ===== 待办到期横幅 =====
        if (dueTotal > 0) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(c.ambS)
                    .border(1.dp, c.amb.copy(alpha = 0.35f))
                    .clickable(onClick = onOpenTodos)
                    .padding(horizontal = 14.dp, vertical = 11.dp),
            ) {
                Dot(c.amb)
                Text(
                    "今天有 $dueTotal 个待办要处理" +
                        if (dueInfo.overdue > 0) "（含 ${dueInfo.overdue} 个已逾期）" else "",
                    style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, color = c.amb),
                    modifier = Modifier.weight(1f).padding(start = 10.dp),
                    maxLines = 2,
                )
                Text(
                    "去处理 ›",
                    style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, color = c.amb),
                )
            }
            Spacer(Modifier.height(10.dp))
        }

        // ===== M-01 本月支出 =====
        Panel {
            ModuleHeader(
                id = "M-01",
                title = if (mini) "本月结余" else if (isCurrentMonth) "本月支出" else "当月支出",
                en = "EXPENSE",
            ) {
                MonthStepper(
                    month = month,
                    open = monthOpen,
                    onOpen = { monthOpen = true },
                    onDismiss = { monthOpen = false },
                    onPick = {
                        month = it
                        monthOpen = false
                    },
                )
            }
            Spacer(Modifier.height(14.dp))
            HeroAmount(
                if (mini) balance else exp,
                intSize = 50.sp,
                color = if (mini && balance < 0) c.cor else c.tx,
            )
            Spacer(Modifier.height(14.dp))
            HLine()
            Spacer(Modifier.height(12.dp))
            if (mini) {
                Row(Modifier.fillMaxWidth()) {
                    Readout("支出", "", Modifier.weight(1f)) {
                        MoneyText(exp, size = 15.sp, currency = true, color = c.cor)
                    }
                    Box(Modifier.width(1.dp).height(30.dp).background(c.ln))
                    Readout("收入", "", Modifier.weight(1f).padding(start = 12.dp)) {
                        MoneyText(inc, size = 15.sp, currency = true, color = c.inc)
                    }
                }
            } else {
                Row(Modifier.fillMaxWidth()) {
                    Readout("收入", "INCOME", Modifier.weight(1f)) {
                        MoneyText(inc, size = 15.sp, currency = true, color = c.tx)
                    }
                    Box(Modifier.width(1.dp).height(30.dp).background(c.ln))
                    Readout("结余", "BALANCE", Modifier.weight(1f).padding(start = 12.dp)) {
                        MoneyText(
                            balance,
                            size = 15.sp,
                            currency = true,
                            color = if (balance < 0) c.cor else c.tx,
                            signed = true,
                        )
                    }
                    Box(Modifier.width(1.dp).height(30.dp).background(c.ln))
                    Readout("笔数", "ENTRIES", Modifier.weight(1f).padding(start = 12.dp)) {
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text(
                                monthRecords.size.toString(),
                                style = TextStyle(fontFamily = MonoFamily, fontSize = 15.sp, color = c.tx),
                            )
                            Text(
                                "笔",
                                style = TextStyle(fontFamily = SansFamily, fontSize = 10.sp, color = c.dim),
                                modifier = Modifier.padding(start = 3.dp, bottom = 1.dp),
                            )
                        }
                    }
                }
            }

            if (top3.isNotEmpty()) {
                Spacer(Modifier.height(16.dp))
                MicroLabel("支出前三 · TOP 3", color = c.dim)
                Spacer(Modifier.height(8.dp))
                top3.forEachIndexed { i, t ->
                    val share = if (exp > 0) t.total / exp else 0.0
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(onClick = onOpenStats)
                            .padding(vertical = 5.dp),
                    ) {
                        PictBox(t.key, size = 28.dp)
                        Text(
                            t.name,
                            style = TextStyle(fontFamily = SansFamily, fontSize = 12.5.sp, color = c.tx),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier
                                .weight(1f)
                                .padding(start = 10.dp),
                        )
                        Box(
                            Modifier
                                .weight(1.4f)
                                .height(4.dp)
                                .background(c.grid),
                        ) {
                            Box(
                                Modifier
                                    .fillMaxWidth(share.toFloat().coerceIn(0.02f, 1f))
                                    .height(4.dp)
                                    .background(if (i == 0) c.acF else c.tx.copy(alpha = 0.82f)),
                            )
                        }
                        MoneyText(
                            t.total,
                            size = 12.sp,
                            color = c.tx,
                            modifier = Modifier.padding(start = 12.dp),
                        )
                        Text(
                            "${jsRound(share * 100).toInt()}%",
                            style = TextStyle(fontFamily = MonoFamily, fontSize = 10.5.sp, color = c.dim),
                            modifier = Modifier.width(36.dp),
                            textAlign = androidx.compose.ui.text.style.TextAlign.End,
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        // ===== 存钱罐入口（首页不显示金额，只放入口） =====
        Panel(contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
            SystemRow("存钱罐", "独立小账本，不计入本月结余", onClick = onOpenSavings)
        }

        Spacer(Modifier.height(10.dp))

        // ===== M-02 预算 =====
        Panel {
            ModuleHeader(
                id = "M-02",
                title = "预算",
                en = if (budget > 0) "BUDGET · ¥${formatMoney(budget, 0)} / MO" else "BUDGET",
            ) {
                if (budget > 0) {
                    Text(
                        if (over) "已超支" else "$pct%",
                        style = TextStyle(
                            fontFamily = MonoFamily,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = budgetColor,
                        ),
                    )
                } else {
                    MiniButton("设置预算", onClick = {
                        budgetInput = ""
                        showBudget = true
                    }, height = 28.dp)
                }
            }
            if (budget > 0 && isCurrentMonth) {
                Spacer(Modifier.height(6.dp))
                if (mini) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "已用 ¥${formatMoney(exp, 0)}",
                            style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, color = c.dim),
                        )
                        Spacer(Modifier.weight(1f))
                        Text(
                            "预算 ¥${formatMoney(budget, 0)}",
                            style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, color = c.dim),
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(8.dp)
                            .clip(RoundedCornerShape(5.dp))
                            .background(c.p2),
                    ) {
                        Box(
                            Modifier
                                .fillMaxWidth((exp / budget).toFloat().coerceIn(0f, 1f))
                                .height(8.dp)
                                .clip(RoundedCornerShape(5.dp))
                                .background(budgetColor),
                        )
                    }
                    Spacer(Modifier.height(14.dp))
                    Row(Modifier.fillMaxWidth()) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                if (budgetLeft < 0) "已超支" else "剩余可花",
                                style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, color = c.dim),
                            )
                            Spacer(Modifier.height(3.dp))
                            MoneyText(
                                abs(budgetLeft),
                                size = 18.sp,
                                currency = true,
                                color = if (budgetLeft < 0) c.cor else c.tx,
                            )
                        }
                        Column(Modifier.weight(1f)) {
                            Text(
                                "日均可花",
                                style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, color = c.dim),
                            )
                            Spacer(Modifier.height(3.dp))
                            MoneyText(dailyLeft, size = 18.sp, currency = true, color = c.tx)
                        }
                    }
                } else {
                    BudgetDial(
                        budget = budget,
                        spent = exp,
                        daysInMonth = daysInMonth,
                        dayOfMonth = dayOfMonth,
                        remainDays = remainDays,
                        dailyLeft = dailyLeft,
                        budgetLeft = budgetLeft,
                        over = over,
                        color = budgetColor,
                    )
                }
            } else {
                Spacer(Modifier.height(10.dp))
                Text(
                    if (budget <= 0) {
                        "还没有设置预算。设一个数，这里就会出现剩余可花的表盘。"
                    } else {
                        "预算只在当月显示表盘，历史月份看「统计」里的走势。"
                    },
                    style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, lineHeight = 19.sp, color = c.dim),
                )
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    MiniButton(
                        if (budget > 0) "修改预算" else "设置预算",
                        onClick = {
                            budgetInput = if (budget > 0) jsRound(budget).toLong().toString() else ""
                            showBudget = true
                        },
                    )
                    MiniButton("看统计", onClick = onOpenStats)
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        // ===== M-03 最近记录 =====
        Panel(contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
            Row(
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ModuleHeader(id = "M-03", title = "最近记录", en = "RECENT") {
                    Text(
                        "全部 ›",
                        style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, color = c.dim),
                        modifier = Modifier
                            .clickable(onClick = onOpenHistory)
                            .padding(vertical = 6.dp, horizontal = 2.dp),
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            if (recent.isEmpty()) {
                EmptyLine("暂无记录，去记一笔吧")
            } else {
                recent.forEachIndexed { index, r ->
                    if (index > 0) HLine(Modifier.padding(horizontal = 16.dp))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(onClick = onOpenHistory)
                            .padding(horizontal = 16.dp),
                    ) {
                        RowItem(
                            title = r.subcategoryName.ifEmpty { r.categoryName },
                            sub = r.note,
                            meta = listOfNotNull(
                                r.person.takeIf { it.isNotEmpty() },
                                mmddDot(r.date),
                                "小票".takeIf { !r.photo.isNullOrEmpty() },
                            ).joinToString(" · "),
                            amount = r.amount,
                            income = r.type == "income",
                            iconKey = r.categoryKey,
                            modifier = Modifier.weight(1f),
                        ) {
                            if (!r.photo.isNullOrEmpty()) {
                                Text(
                                    "凭证",
                                    style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.ac),
                                    modifier = Modifier
                                        .padding(start = 8.dp, top = 3.dp)
                                        .clickable { photoPreview = r.photo },
                                )
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
        }

        Spacer(Modifier.height(10.dp))

        // ===== 快捷入口 =====
        val actions: List<Pair<String, String>> = listOf(
            "记一笔" to "ADD",
            "待办" to "TODO",
            (if (budget > 0) "预算" else "设预算") to "BUDGET",
            "分类" to "CATS",
            "周期" to "CYCLE",
            "统计" to "STATS",
        )
        val handlers: List<() -> Unit> = listOf(
            onOpenAdd,
            onOpenTodos,
            {
                budgetInput = if (budget > 0) jsRound(budget).toLong().toString() else ""
                showBudget = true
            },
            onOpenCategories,
            onOpenRecurring,
            onOpenStats,
        )
        actions.chunked(3).forEachIndexed { rowIndex, row ->
            if (rowIndex > 0) Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEachIndexed { i, (label, en) ->
                    val global = rowIndex * 3 + i
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .clip(if (mini) RoundedCornerShape(14.dp) else RoundedCornerShape(0.dp))
                            .background(c.p1)
                            .border(1.dp, c.ln, if (mini) RoundedCornerShape(14.dp) else RoundedCornerShape(0.dp))
                            .clickable { handlers[global]() }
                            .padding(horizontal = 12.dp, vertical = if (mini) 15.dp else 11.dp),
                    ) {
                        Text(
                            label,
                            style = TextStyle(fontFamily = SansFamily, fontSize = 13.sp, color = c.tx),
                        )
                        MicroLabel(en, modifier = Modifier.padding(top = 3.dp), color = c.fnt)
                    }
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        // ===== 系统组：外观 / 云同步 / 清除数据 =====
        val prefLabel = when (themePref) {
            "light" -> "始终浅色"
            "dark" -> "始终深色"
            else -> "跟随系统"
        }
        Panel(contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
            SystemRow("外观", prefLabel + if (themePref == "system" && dark) "（当前深色）" else "", onClick = { showTheme = true })
            HLine(Modifier.padding(horizontal = 16.dp))
            SystemRow("云同步", if (cloudBound) "已绑定" else "未绑定", onClick = { showCloud = true })
            HLine(Modifier.padding(horizontal = 16.dp))
            SystemRow("清除所有数据", "本机账单、待办、照片与预算", onClick = { showClear = true })
        }

        // ===== 调试工具（仅 debug 包） =====
        if (debuggable) {
            Spacer(Modifier.height(10.dp))
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

        Spacer(Modifier.height(24.dp))
    }

    // ===== 预算弹窗 =====
    if (showBudget) {
        BDialog(title = "设置月度预算", en = "BUDGET", onDismiss = { showBudget = false }) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("¥", style = TextStyle(fontFamily = MonoFamily, fontSize = 20.sp, color = c.dim))
                Spacer(Modifier.width(10.dp))
                BTextField(
                    value = budgetInput,
                    onValueChange = { budgetInput = sanitizeAmountInput(it) },
                    placeholder = "输入金额",
                    maxLength = AMOUNT_INPUT_MAX_LENGTH,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    textSize = 24.sp,
                    mono = true,
                    modifier = Modifier.weight(1f),
                )
            }
            HLine(Modifier.padding(top = 8.dp))
            Spacer(Modifier.height(16.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Spacer(Modifier.weight(1f))
                MiniButton("取消", onClick = { showBudget = false })
                MiniButton("保存", onClick = { saveBudget() }, primary = true)
            }
        }
    }

    // ===== 外观三态（§9） =====
    if (showTheme) {
        BDialog(title = "外观", en = "THEME", onDismiss = { showTheme = false }) {
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
                            scope.launch {
                                runCatching { container.store.set(PrefsKeys.UI_THEME_PREF, key) }
                                themePref = key
                                showTheme = false
                            }
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
                            scope.launch {
                                runCatching { container.store.set(PrefsKeys.UI_STYLE_PREF, key) }
                                uiStylePref = key
                            }
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
    if (showClear) {
        BConfirm(
            title = "清除本机所有数据？",
            message = "将清空本机的账单、待办、周期账单、存钱记录、预算、自定义分类和小票照片，并换一个新同步码。" +
                "云端账本不会删除，记下原同步码 ${formatOwnerId(ownerId)}，以后在「云同步」里加入即可找回",
            confirmText = "清除",
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

// ==================== 局部构件 ====================

@Composable
private fun Readout(
    cn: String,
    en: String,
    modifier: Modifier = Modifier,
    value: @Composable () -> Unit,
) {
    Column(modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                cn,
                style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = JiXuTheme.colors.dim),
            )
            MicroLabel(en, modifier = Modifier.padding(start = 4.dp), color = JiXuTheme.colors.fnt)
        }
        Spacer(Modifier.height(5.dp))
        value()
    }
}

@Composable
private fun SystemRow(title: String, sub: String, onClick: () -> Unit) {
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

/** 月份步进器：‹ 2026.11 ›，点中间弹月份表。 */
@Composable
private fun MonthStepper(
    month: String,
    open: Boolean,
    onOpen: () -> Unit,
    onDismiss: () -> Unit,
    onPick: (String) -> Unit,
) {
    val c = JiXuTheme.colors
    Row(
        modifier = Modifier
            .height(30.dp)
            .border(1.dp, c.ln),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(width = 28.dp, height = 30.dp)
                .clickable {
                    onPick(YearMonth.parse(month).minusMonths(1).toString())
                },
            contentAlignment = Alignment.Center,
        ) {
            Text("‹", style = TextStyle(fontFamily = MonoFamily, fontSize = 13.sp, color = c.dim))
        }
        Box {
            Text(
                monthDot(month),
                style = TextStyle(fontFamily = MonoFamily, fontSize = 12.sp, color = c.tx),
                modifier = Modifier
                    .clickable(onClick = onOpen)
                    .padding(horizontal = 8.dp),
            )
            DropdownMenu(expanded = open, onDismissRequest = onDismiss) {
                monthOptions().forEach { m ->
                    DropdownMenuItem(
                        text = {
                            Text(
                                monthDot(m),
                                style = TextStyle(
                                    fontFamily = MonoFamily,
                                    fontSize = 13.sp,
                                    color = if (m == month) c.ac else c.tx,
                                ),
                            )
                        },
                        onClick = { onPick(m) },
                    )
                }
            }
        }
        Box(
            modifier = Modifier
                .size(width = 28.dp, height = 30.dp)
                .clickable {
                    val next = YearMonth.parse(month).plusMonths(1)
                    if (next.toString() <= currentMonth()) onPick(next.toString())
                },
            contentAlignment = Alignment.Center,
        ) {
            Text("›", style = TextStyle(fontFamily = MonoFamily, fontSize = 13.sp, color = c.dim))
        }
    }
}

/**
 * 预算表盘：270° 弧 + 每天一格刻度（B-SPEC §4「表盘」）。
 * 已用弧走强调色，超 80% 转琥珀，超支转危险色；虚线是匀速参考。
 */
@Composable
private fun BudgetDial(
    budget: Double,
    spent: Double,
    daysInMonth: Int,
    dayOfMonth: Int,
    remainDays: Int,
    dailyLeft: Double,
    budgetLeft: Double,
    over: Boolean,
    color: Color,
) {
    val c = JiXuTheme.colors
    val ratio = if (budget > 0) (spent / budget).toFloat().coerceIn(0f, 1f) else 0f
    val pace = if (daysInMonth > 0) dayOfMonth.toFloat() / daysInMonth else 0f
    val animated by androidx.compose.animation.core.animateFloatAsState(
        targetValue = ratio,
        animationSpec = androidx.compose.animation.core.tween(380, easing = com.jixu.app.ui.screens.common.Ease),
        label = "dial",
    )
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 250.dp)
                .fillMaxWidth()
                .aspectRatio(1f),
        ) {
            Canvas(Modifier.fillMaxSize()) {
                val start = 135f
                val sweep = 270f
                val stroke = 3.dp.toPx()
                val inset = 14.dp.toPx()
                val arcSize = Size(size.width - inset * 2, size.height - inset * 2)
                val topLeft = Offset(inset, inset)
                // 轨道
                drawArc(
                    color = c.ln2,
                    startAngle = start,
                    sweepAngle = sweep,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = Stroke(stroke, cap = StrokeCap.Butt),
                )
                // 每天一格刻度
                val cx = size.width / 2f
                val cy = size.height / 2f
                val outer = size.minDimension / 2f - 2.dp.toPx()
                val inner = outer - 7.dp.toPx()
                for (i in 0 until daysInMonth) {
                    val a = start + sweep * (i.toFloat() / maxOf(daysInMonth - 1, 1))
                    val rad = Math.toRadians(a.toDouble())
                    val cos = kotlin.math.cos(rad).toFloat()
                    val sin = kotlin.math.sin(rad).toFloat()
                    val elapsed = i < dayOfMonth
                    drawLine(
                        color = if (elapsed) c.tx else c.fnt,
                        start = Offset(cx + cos * inner, cy + sin * inner),
                        end = Offset(cx + cos * outer, cy + sin * outer),
                        strokeWidth = if (i % 5 == 0) 1.6.dp.toPx() else 1.dp.toPx(),
                    )
                }
                // 匀速参考（虚线）
                val paceAngle = start + sweep * pace
                val radP = Math.toRadians(paceAngle.toDouble())
                val r1 = size.minDimension / 2f - 18.dp.toPx()
                val r2 = size.minDimension / 2f - 26.dp.toPx()
                drawLine(
                    color = c.amb.copy(alpha = 0.8f),
                    start = Offset(cx + kotlin.math.cos(radP).toFloat() * r2, cy + kotlin.math.sin(radP).toFloat() * r2),
                    end = Offset(cx + kotlin.math.cos(radP).toFloat() * r1, cy + kotlin.math.sin(radP).toFloat() * r1),
                    strokeWidth = 1.5.dp.toPx(),
                )
                // 已用弧
                drawArc(
                    color = color,
                    startAngle = start,
                    sweepAngle = sweep * animated,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = Stroke(stroke, cap = StrokeCap.Butt),
                )
            }
            Column(
                modifier = Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                MicroLabel(if (over) "已超支 · OVER" else "剩余可花 · REMAIN", color = c.dim)
                Spacer(Modifier.height(8.dp))
                MoneyText(
                    abs(budgetLeft),
                    size = com.jixu.app.ui.screens.common.amountTextSize(budgetLeft, 30.sp),
                    currency = true,
                    dimDecimals = true,
                    decRatio = 0.45f,
                    curRatio = 0.36f,
                    color = if (over) c.cor else c.tx,
                    signed = false,
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    if (budgetLeft >= 0) {
                        "日均可花 ¥${formatMoney(dailyLeft)} · 余 $remainDays 天"
                    } else {
                        "本月已结算 · 超出预算"
                    },
                    style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.dim),
                )
            }
        }
    }
    Spacer(Modifier.height(10.dp))
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, if (over) Color.Transparent else c.ln)
            .background(if (over) c.corS else Color.Transparent)
            .padding(horizontal = 12.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            if (over) "已超出预算" else "预算内",
            style = TextStyle(
                fontFamily = SansFamily,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = if (over) c.cor else c.tx,
            ),
        )
        Spacer(Modifier.weight(1f))
        Text(
            "已用 ¥${formatMoney(spent)} / ¥${formatMoney(budget)}",
            style = TextStyle(fontFamily = MonoFamily, fontSize = 10.5.sp, color = c.dim),
        )
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
