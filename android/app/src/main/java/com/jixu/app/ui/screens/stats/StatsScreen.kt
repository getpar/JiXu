package com.jixu.app.ui.screens.stats

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jixu.app.AppContainer
import com.jixu.app.core.formatMoney
import com.jixu.app.core.jsRound
import com.jixu.app.core.jsToFixed
import com.jixu.app.core.sumAmounts
import com.jixu.app.data.CategoryStat
import com.jixu.app.data.DailyTotal
import com.jixu.app.data.db.RecordEntity
import com.jixu.app.ui.screens.common.Ease
import com.jixu.app.ui.screens.common.HLine
import com.jixu.app.ui.screens.common.HeroAmount
import com.jixu.app.ui.screens.common.MicroLabel
import com.jixu.app.ui.screens.common.MiniButton
import com.jixu.app.ui.screens.common.ModuleHeader
import com.jixu.app.ui.screens.common.MoneyText
import com.jixu.app.ui.screens.common.Panel
import com.jixu.app.ui.screens.common.PictBox
import com.jixu.app.ui.screens.common.Seg
import com.jixu.app.ui.screens.common.currentMonth
import com.jixu.app.ui.screens.common.mmddDot
import com.jixu.app.ui.screens.common.monthDot
import com.jixu.app.ui.screens.common.monthOptions
import com.jixu.app.ui.screens.common.striped
import com.jixu.app.ui.theme.JiXuTheme
import com.jixu.app.ui.theme.MonoFamily
import com.jixu.app.ui.theme.SansFamily
import java.time.LocalDate
import java.time.YearMonth
import kotlin.math.abs

private data class StatsUi(
    val total: Double = 0.0,
    val stats: List<CategoryStat> = emptyList(),
    val trend: List<DailyTotal> = emptyList(),
    val months: List<Pair<String, Double>> = emptyList(),
    val monthRecords: List<RecordEntity> = emptyList(),
    val incomeTotal: Double = 0.0,
)

/**
 * 统计（开发文档 §8.4）：S-01 收支总览 / S-02 分类构成（环）/ 每日走势 / 六月对比 / 本月报告。
 * 图表全部 Compose 自绘，不引入图表库；数据口径与旧版一致。
 */
@Composable
fun StatsScreen(
    container: AppContainer,
    onDrillDown: (month: String, key: String, name: String) -> Unit,
) {
    val c = JiXuTheme.colors
    val repo = container.repository
    val recordsFlow = remember { repo.observeAliveRecords() }
    val records by recordsFlow.collectAsStateWithLifecycle(emptyList())

    var month by rememberSaveable { mutableStateOf(currentMonth()) }
    var monthOpen by remember { mutableStateOf(false) }
    var type by rememberSaveable { mutableStateOf("expense") }
    var level by rememberSaveable { mutableStateOf("cat") }
    var ringSel by remember { mutableIntStateOf(0) }

    val ui = remember(records, month, type, level) { computeStats(records, month, type, level) }
    val monthLabel = if (month == currentMonth()) "本月" else "${YearMonth.parse(month).monthValue}月"

    val maxMonth = ui.months.maxOfOrNull { it.second }?.coerceAtLeast(1.0) ?: 1.0
    val hasMonthData = ui.months.any { it.second > 0 }
    val curMonthTotal = ui.months.lastOrNull()?.second ?: 0.0
    val prevMonthTotal = ui.months.getOrNull(ui.months.size - 2)?.second ?: 0.0
    val momPct = if (prevMonthTotal > 0) (curMonthTotal - prevMonthTotal) / prevMonthTotal * 100 else null

    val expRecs = remember(ui.monthRecords) { ui.monthRecords.filter { it.type == "expense" } }
    val recordDays = remember(expRecs) { expRecs.map { it.date }.toSet().size }
    val maxRec = remember(expRecs) { expRecs.maxByOrNull { it.amount } }
    val maxDay = remember(ui.trend) { ui.trend.maxByOrNull { it.total } }

    LaunchedEffect(ui.stats) { ringSel = 0 }

    fun drill(key: String, name: String) {
        onDrillDown(month, key, name)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 14.dp),
    ) {
        Spacer(Modifier.height(6.dp))

        // ===== 顶栏 =====
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.weight(1f)) {
                Text(
                    "统计",
                    style = TextStyle(fontFamily = SansFamily, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = c.tx),
                )
                MicroLabel("04 · ANALYSIS", modifier = Modifier.padding(top = 3.dp), color = c.dim)
            }
            Seg(
                options = listOf("expense" to "支出", "income" to "收入"),
                selected = type,
                onSelect = { type = it },
                modifier = Modifier.width(150.dp),
                height = 32.dp,
                accent = if (type == "income") c.inc else c.acF,
            )
        }

        Spacer(Modifier.height(12.dp))

        // ===== S-01 收支总览 =====
        Panel {
            ModuleHeader(id = "S-01", title = "收支总览", en = "TOTALS") {
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
            MicroLabel(if (type == "expense") "支出 · EXPENSE" else "收入 · INCOME", color = c.dim)
            Spacer(Modifier.height(8.dp))
            HeroAmount(ui.total, intSize = 46.sp)
            Spacer(Modifier.height(14.dp))
            HLine()
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth()) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "收入",
                            style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.dim),
                        )
                        MicroLabel("INCOME", modifier = Modifier.padding(start = 4.dp), color = c.fnt)
                    }
                    Spacer(Modifier.height(5.dp))
                    MoneyText(ui.incomeTotal, size = 15.sp, currency = true, color = c.inc)
                }
                Box(Modifier.width(1.dp).height(30.dp).background(c.ln))
                Column(Modifier.weight(1f).padding(start = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "结余",
                            style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.dim),
                        )
                        MicroLabel("BALANCE", modifier = Modifier.padding(start = 4.dp), color = c.fnt)
                    }
                    Spacer(Modifier.height(5.dp))
                    MoneyText(
                        ui.incomeTotal - ui.total,
                        size = 15.sp,
                        currency = true,
                        signed = true,
                        color = if (ui.incomeTotal - ui.total < 0) c.cor else c.tx,
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            KvRow("日均支出", "¥" + formatMoney(ui.total / maxOf(recordDays, 1)))
            KvRow(
                "最高单日 · " + (maxDay?.let { mmddDot(it.date) } ?: "—"),
                "¥" + formatMoney(maxDay?.total ?: 0.0),
            )
            KvRow("记账笔数", "${expRecs.size} 笔")
        }

        if (ui.stats.isEmpty()) {
            Spacer(Modifier.height(10.dp))
            Panel {
                ModuleHeader(id = "S-02", title = "分类构成", en = "COMPOSITION")
                Box(
                    Modifier.fillMaxWidth().padding(vertical = 34.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            "暂无数据",
                            style = TextStyle(fontFamily = SansFamily, fontSize = 14.sp, color = c.dim),
                        )
                        Text(
                            "记一笔账后这里就会出现统计图表",
                            style = TextStyle(fontFamily = SansFamily, fontSize = 11.5.sp, color = c.fnt),
                            modifier = Modifier.padding(top = 6.dp),
                        )
                    }
                }
            }
        } else {
            // ===== S-02 分类构成 =====
            Spacer(Modifier.height(10.dp))
            Panel {
                ModuleHeader(id = "S-02", title = "分类构成", en = "COMPOSITION · ${ui.stats.size} CH") {
                    Seg(
                        options = listOf("cat" to "一级", "sub" to "二级"),
                        selected = level,
                        onSelect = { level = it },
                        modifier = Modifier.width(124.dp),
                        height = 30.dp,
                    )
                }
                Spacer(Modifier.height(14.dp))
                CategoryRing(
                    stats = ui.stats,
                    total = ui.total,
                    selected = ringSel.coerceIn(0, ui.stats.lastIndex),
                    onSelect = { ringSel = it },
                )
                Spacer(Modifier.height(14.dp))
                HLine()
                ui.stats.take(8).forEachIndexed { i, s ->
                    val share = if (ui.total > 0) s.total / ui.total else 0.0
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                ringSel = i
                                drill(s.categoryKey, s.categoryName)
                            }
                            .padding(vertical = 9.dp),
                    ) {
                        Text(
                            (i + 1).toString().padStart(2, '0'),
                            style = TextStyle(
                                fontFamily = MonoFamily,
                                fontSize = 10.sp,
                                color = if (i == ringSel) c.ac else c.fnt,
                            ),
                        )
                        PictBox(s.categoryKey, size = 28.dp, modifier = Modifier.padding(start = 8.dp))
                        Column(Modifier.weight(1f).padding(start = 10.dp)) {
                            Text(
                                s.categoryName,
                                style = TextStyle(fontFamily = SansFamily, fontSize = 12.5.sp, color = c.tx),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Spacer(Modifier.height(5.dp))
                            Box(Modifier.fillMaxWidth().height(2.dp).background(c.grid)) {
                                Box(
                                    Modifier
                                        .fillMaxWidth(share.toFloat().coerceIn(0f, 1f))
                                        .height(2.dp)
                                        .background(if (i == 0) c.acF else c.tx.copy(alpha = 0.75f)),
                                )
                            }
                        }
                        MoneyText(
                            s.total,
                            size = 12.sp,
                            color = c.tx,
                            modifier = Modifier.padding(start = 10.dp),
                        )
                        Text(
                            jsToFixed(share * 100, 1) + "%",
                            style = TextStyle(fontFamily = MonoFamily, fontSize = 10.sp, color = c.dim),
                            modifier = Modifier.width(46.dp),
                            textAlign = androidx.compose.ui.text.style.TextAlign.End,
                        )
                    }
                    if (i != minOf(ui.stats.size, 8) - 1) HLine()
                }
                if (ui.stats.size > 8) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "还有 ${ui.stats.size - 8} 个分类，点上方任一条进账单看明细",
                        style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.fnt),
                    )
                }
            }

            // ===== 每日走势 =====
            Spacer(Modifier.height(10.dp))
            DailyBars(month = month, trend = ui.trend, type = type)

            // ===== 月度对比（近 6 个月） =====
            if (hasMonthData) {
                Spacer(Modifier.height(10.dp))
                Panel {
                    ModuleHeader(id = "S-04", title = "月度对比", en = "6 MONTHS") {
                        if (momPct != null) {
                            Text(
                                (if (momPct > 0) "↑" else "↓") + jsToFixed(abs(momPct), 0) + "%",
                                style = TextStyle(
                                    fontFamily = MonoFamily,
                                    fontSize = 11.sp,
                                    color = if (momPct > 0) c.cor else c.inc,
                                ),
                            )
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    Row(Modifier.fillMaxWidth().height(150.dp)) {
                        ui.months.forEachIndexed { i, (m, total) ->
                            val isCur = i == ui.months.lastIndex
                            Column(
                                modifier = Modifier.weight(1f).fillMaxHeight(),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                Row(
                                    modifier = Modifier.weight(1f).fillMaxWidth(),
                                    verticalAlignment = Alignment.Bottom,
                                    horizontalArrangement = Arrangement.Center,
                                ) {
                                    Box(
                                        Modifier
                                            .width(11.dp)
                                            .fillMaxHeight((total / maxMonth).toFloat().coerceIn(0.02f, 1f))
                                            .background(if (isCur) c.acF else c.tx.copy(alpha = 0.82f)),
                                    )
                                    Spacer(Modifier.width(3.dp))
                                    Box(
                                        Modifier
                                            .width(11.dp)
                                            .fillMaxHeight(
                                                (sumAmounts(
                                                    records.filter {
                                                        it.date.startsWith(m) && it.type == "income"
                                                    }.map { it.amount }.toDoubleArray(),
                                                ) / maxMonth).toFloat().coerceIn(0.02f, 1f),
                                            )
                                            .striped(c.inc),
                                    )
                                }
                                Text(
                                    "${YearMonth.parse(m).monthValue}月",
                                    style = TextStyle(
                                        fontFamily = MonoFamily,
                                        fontSize = 9.5.sp,
                                        color = if (isCur) c.tx else c.dim,
                                    ),
                                    modifier = Modifier.padding(top = 6.dp),
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        LegendItem("支出", c.tx.copy(alpha = 0.82f), striped = false)
                        LegendItem("收入", c.inc, striped = true)
                        LegendItem("本月", c.acF, striped = false)
                    }
                }
            }

            // ===== 本月报告 =====
            if (type == "expense") {
                Spacer(Modifier.height(10.dp))
                Panel {
                    ModuleHeader(id = "S-05", title = "${monthLabel}报告", en = "REPORT")
                    Spacer(Modifier.height(12.dp))
                    ReportLine(
                        "01",
                        buildAnnotatedString {
                            append(if (monthLabel == "本月") "这个月" else monthLabel)
                            append("花了 ")
                            withStyle(SpanStyle(color = c.tx, fontWeight = FontWeight.Medium)) {
                                append("¥" + formatMoney(ui.total, 0))
                            }
                            if (momPct == null) {
                                append("，还没有上月数据可比")
                            } else if (momPct >= 0) {
                                append("，比上月 ")
                                withStyle(SpanStyle(color = c.cor, fontWeight = FontWeight.Medium)) {
                                    append("多花 ${jsToFixed(momPct, 0)}%")
                                }
                            } else {
                                append("，比上月 ")
                                withStyle(SpanStyle(color = c.inc, fontWeight = FontWeight.Medium)) {
                                    append("少花 ${jsToFixed(abs(momPct), 0)}%")
                                }
                            }
                        },
                    )
                    val top = ui.stats.firstOrNull()
                    if (top != null) {
                        val topPct = if (ui.total > 0) jsToFixed(top.total / ui.total * 100, 0) else "0"
                        ReportLine(
                            "02",
                            buildAnnotatedString {
                                append("大头是「${top.categoryName}」")
                                withStyle(SpanStyle(color = c.tx, fontWeight = FontWeight.Medium)) {
                                    append("¥${formatMoney(top.total, 0)}")
                                }
                                append("，占 $topPct%")
                            },
                        )
                    }
                    ReportLine("03", buildAnnotatedString { append("共 ${expRecs.size} 笔 · 记了 $recordDays 天") })
                    if (maxRec != null) {
                        ReportLine(
                            "04",
                            buildAnnotatedString {
                                append("最大一笔 ")
                                withStyle(SpanStyle(color = c.tx, fontWeight = FontWeight.Medium)) {
                                    append("¥${formatMoney(maxRec.amount, 0)}")
                                }
                                append(" · ${maxRec.subcategoryName}（${maxRec.date.takeLast(5)}）")
                            },
                        )
                    }
                    if (ui.incomeTotal > 0) {
                        val balance = ui.incomeTotal - ui.total
                        ReportLine(
                            "05",
                            buildAnnotatedString {
                                append("收入 ¥${formatMoney(ui.incomeTotal, 0)}，结余 ")
                                withStyle(
                                    SpanStyle(
                                        color = if (balance >= 0) c.inc else c.cor,
                                        fontWeight = FontWeight.Medium,
                                    ),
                                ) {
                                    append((if (balance >= 0) "+" else "-") + formatMoney(abs(balance), 0))
                                }
                            },
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(24.dp))
    }
}

// ==================== 局部构件 ====================

@Composable
private fun KvRow(label: String, value: String) {
    val c = JiXuTheme.colors
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, color = c.dim),
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(value, style = TextStyle(fontFamily = MonoFamily, fontSize = 12.5.sp, color = c.tx))
    }
}

@Composable
private fun ReportLine(n: String, text: androidx.compose.ui.text.AnnotatedString) {
    val c = JiXuTheme.colors
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text(
            n,
            style = TextStyle(fontFamily = MonoFamily, fontSize = 9.sp, color = c.fnt),
            modifier = Modifier.width(20.dp).padding(top = 2.dp),
        )
        Text(
            text,
            style = TextStyle(fontFamily = SansFamily, fontSize = 12.5.sp, lineHeight = 20.sp, color = c.dim),
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun LegendItem(label: String, color: Color, striped: Boolean) {
    val c = JiXuTheme.colors
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(10.dp)
                .then(if (striped) Modifier.striped(color) else Modifier.background(color)),
        )
        Text(
            label,
            style = TextStyle(fontFamily = SansFamily, fontSize = 10.5.sp, color = c.dim),
            modifier = Modifier.padding(start = 6.dp),
        )
    }
}

/**
 * 分类构成环（B-SPEC §4「环形」）：段间 1.4° 间隙，选中段满不透明，其余按名次递减。
 * 外圈是刻度，中心是名次 / 分类 / 金额 / 占比。
 */
@Composable
private fun CategoryRing(
    stats: List<CategoryStat>,
    total: Double,
    selected: Int,
    onSelect: (Int) -> Unit,
) {
    val c = JiXuTheme.colors
    val sel = stats.getOrNull(selected)
    val selShare = if (sel != null && total > 0) sel.total / total else 0.0
    Box(
        modifier = Modifier.fillMaxWidth(),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 236.dp)
                .fillMaxWidth()
                .aspectRatio(1f),
        ) {
            Canvas(
                Modifier
                    .fillMaxSize()
                    .pointerInput(stats, total) {
                        detectTapGestures { off ->
                            val cx = size.width / 2f
                            val cy = size.height / 2f
                            val dx = off.x - cx
                            val dy = off.y - cy
                            var ang = Math.toDegrees(kotlin.math.atan2(dy, dx).toDouble()).toFloat() + 90f
                            if (ang < 0f) ang += 360f
                            var acc = 0f
                            stats.forEachIndexed { i, s ->
                                val sweep = if (total > 0) (s.total / total * 360).toFloat() else 0f
                                if (ang >= acc && ang < acc + sweep) onSelect(i)
                                acc += sweep
                            }
                        }
                    },
            ) {
                val stroke = 12.dp.toPx()
                val inset = stroke / 2f + 10.dp.toPx()
                val arcSize = Size(size.width - inset * 2f, size.height - inset * 2f)
                val topLeft = Offset(inset, inset)
                // 底环
                drawArc(
                    color = c.ln,
                    startAngle = -90f,
                    sweepAngle = 360f,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = Stroke(1.dp.toPx()),
                )
                // 外圈刻度（每 3°）
                val cx = size.width / 2f
                val cy = size.height / 2f
                val rOuter = size.minDimension / 2f - 2.dp.toPx()
                val rInner = rOuter - 5.dp.toPx()
                var a = 0f
                while (a < 360f) {
                    val rad = Math.toRadians(a.toDouble() - 90.0)
                    val cos = kotlin.math.cos(rad).toFloat()
                    val sin = kotlin.math.sin(rad).toFloat()
                    drawLine(
                        color = c.fnt.copy(alpha = 0.55f),
                        start = Offset(cx + cos * rInner, cy + sin * rInner),
                        end = Offset(cx + cos * rOuter, cy + sin * rOuter),
                        strokeWidth = 1.dp.toPx(),
                    )
                    a += 3f
                }
                // 分段
                val gap = 1.4f
                var start = -90f
                stats.forEachIndexed { i, s ->
                    val sweep = if (total > 0) (s.total / total * 360).toFloat() else 0f
                    if (sweep > gap) {
                        val color = if (i == selected) {
                            c.acF
                        } else {
                            c.tx.copy(alpha = (1f - i * 0.1f).coerceAtLeast(0.24f))
                        }
                        drawArc(
                            color = color,
                            startAngle = start + gap / 2f,
                            sweepAngle = sweep - gap,
                            useCenter = false,
                            topLeft = topLeft,
                            size = arcSize,
                            style = Stroke(stroke, cap = StrokeCap.Butt),
                        )
                    }
                    start += sweep
                }
            }
            Column(
                modifier = Modifier.fillMaxSize().padding(horizontal = 56.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                if (sel == null) {
                    Text(
                        "本月无支出",
                        style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, color = c.dim),
                    )
                } else {
                    MicroLabel(
                        (selected + 1).toString().padStart(2, '0') + " / " +
                            stats.size.toString().padStart(2, '0') + " · RANK",
                        color = c.dim,
                    )
                    Text(
                        sel.categoryName,
                        style = TextStyle(
                            fontFamily = SansFamily,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = c.tx,
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 7.dp),
                    )
                    Spacer(Modifier.height(7.dp))
                    MoneyText(sel.total, size = 21.sp, currency = true, color = c.tx)
                    Text(
                        jsToFixed(selShare * 100, 1) + "%",
                        style = TextStyle(fontFamily = MonoFamily, fontSize = 10.5.sp, color = c.dim),
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
            }
        }
    }
}

/** 每日走势：细柱，今天用强调色，未到的日子只画 3dp 基线刻度。 */
@Composable
private fun DailyBars(month: String, trend: List<DailyTotal>, type: String) {
    val c = JiXuTheme.colors
    val ym = runCatching { YearMonth.parse(month) }.getOrNull() ?: YearMonth.now()
    val days = ym.lengthOfMonth()
    val byDate = remember(trend) { trend.associate { it.date to it.total } }
    val values = remember(month, byDate, days) {
        (1..days).map { d ->
            val key = String.format(java.util.Locale.US, "%04d-%02d-%02d", ym.year, ym.monthValue, d)
            byDate[key] ?: 0.0
        }
    }
    val maxV = values.maxOrNull()?.coerceAtLeast(1.0) ?: 1.0
    val today = LocalDate.now()
    val todayDay = if (ym == YearMonth.from(today)) today.dayOfMonth else 0
    val maxIdx = values.indices.maxByOrNull { values[it] } ?: 0

    Panel {
        ModuleHeader(
            id = "S-03",
            title = "每日走势",
            en = if (type == "expense") "DAILY · EXPENSE" else "DAILY · INCOME",
        ) {
            MicroLabel("最高 ¥" + formatMoney(values.getOrElse(maxIdx) { 0.0 }, 0), color = c.dim)
        }
        Spacer(Modifier.height(12.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .height(150.dp)
                .drawBehind {
                    val rows = 4
                    for (i in 1..rows) {
                        val y = size.height * i / rows
                        drawLine(
                            color = c.grid,
                            start = Offset(0f, y),
                            end = Offset(size.width, y),
                            strokeWidth = 1.dp.toPx(),
                        )
                    }
                },
        ) {
            Row(
                modifier = Modifier.fillMaxSize(),
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(1.dp),
            ) {
                values.forEachIndexed { i, v ->
                    val day = i + 1
                    val future = todayDay in 1 until day
                    val isToday = day == todayDay
                    Box(
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                        contentAlignment = Alignment.BottomCenter,
                    ) {
                        if (future) {
                            Box(
                                Modifier
                                    .fillMaxWidth(0.7f)
                                    .height(3.dp)
                                    .background(c.ln2),
                            )
                        } else {
                            Box(
                                Modifier
                                    .fillMaxWidth(0.7f)
                                    .fillMaxHeight((v / maxV).toFloat().coerceIn(0.015f, 1f))
                                    .background(
                                        if (isToday) c.acF else c.tx.copy(alpha = 0.82f),
                                    ),
                            )
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth()) {
            MicroLabel("1", color = c.fnt)
            Spacer(Modifier.weight(1f))
            if (todayDay in 1..days) MicroLabel("今天 $todayDay", color = c.dim)
            Spacer(Modifier.weight(1f))
            MicroLabel("$days", color = c.fnt)
        }
    }
}

private fun computeStats(
    records: List<RecordEntity>,
    month: String,
    type: String,
    level: String,
): StatsUi {
    val monthRecords = records.filter { it.date.startsWith(month) }
    val typed = monthRecords.filter { it.type == type }
    val total = sumAmounts(typed.map { it.amount }.toDoubleArray())

    val names = LinkedHashMap<String, String>()
    val cents = LinkedHashMap<String, Double>()
    for (r in typed) {
        val key = if (level == "sub") r.subcategoryKey else r.categoryKey
        val name = if (level == "sub") r.subcategoryName.ifEmpty { r.categoryName } else r.categoryName
        if (key.isEmpty()) continue
        if (!names.containsKey(key)) {
            names[key] = name
            cents[key] = 0.0
        }
        if (r.amount.isFinite()) {
            cents[key] = (cents[key] ?: 0.0) + jsRound(r.amount * 100)
        }
    }
    val stats = names.map { (key, name) -> CategoryStat(key, name, (cents[key] ?: 0.0) / 100) }
        .sortedByDescending { it.total }

    val dailyCents = LinkedHashMap<String, Double>()
    for (r in typed) {
        if (!r.amount.isFinite()) continue
        dailyCents[r.date] = (dailyCents[r.date] ?: 0.0) + jsRound(r.amount * 100)
    }
    val trend = dailyCents.map { DailyTotal(it.key, it.value / 100) }.sortedBy { it.date }

    val end = YearMonth.parse(month)
    val months = (5 downTo 0).map { offset ->
        val key = end.minusMonths(offset.toLong()).toString()
        key to sumAmounts(
            records.filter { it.date.startsWith(key) && it.type == type }.map { it.amount }.toDoubleArray(),
        )
    }

    val incomeTotal = sumAmounts(
        monthRecords.filter { it.type == "income" }.map { it.amount }.toDoubleArray(),
    )

    return StatsUi(
        total = total,
        stats = stats,
        trend = trend,
        months = months,
        monthRecords = monthRecords,
        incomeTotal = incomeTotal,
    )
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
        modifier = Modifier.height(30.dp).border(1.dp, c.ln),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(width = 28.dp, height = 30.dp)
                .clickable { onPick(YearMonth.parse(month).minusMonths(1).toString()) },
            contentAlignment = Alignment.Center,
        ) {
            Text("‹", style = TextStyle(fontFamily = MonoFamily, fontSize = 13.sp, color = c.dim))
        }
        Box {
            Text(
                monthDot(month),
                style = TextStyle(fontFamily = MonoFamily, fontSize = 12.sp, color = c.tx),
                modifier = Modifier.clickable(onClick = onOpen).padding(horizontal = 8.dp),
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
