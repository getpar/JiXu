package com.jixu.app.ui.screens.stats

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
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
import com.jixu.app.ui.screens.common.JxCard
import com.jixu.app.ui.screens.common.JxLabel
import com.jixu.app.ui.screens.common.JxSectionTitle
import com.jixu.app.ui.screens.common.currentMonth
import com.jixu.app.ui.screens.common.monthOptions
import com.jixu.app.ui.theme.JiXuTheme
import java.time.YearMonth
import kotlin.math.abs

/** 「靛」单色系：按金额排名取色（开发文档 §8.4-11） */
private val RAMP = listOf(
    Color(0xFF2E3A8C), Color(0xFF3F4C9C), Color(0xFF505DAC), Color(0xFF6B74C4),
    Color(0xFF8289D0), Color(0xFF9AA0DA), Color(0xFFA9AEE0), Color(0xFFB8BCE6),
    Color(0xFFC7CAEC), Color(0xFFD6D8F2),
)

private fun colorAt(i: Int): Color = RAMP[i % RAMP.size]

private data class StatsUi(
    val total: Double = 0.0,
    val stats: List<CategoryStat> = emptyList(),
    val trend: List<DailyTotal> = emptyList(),
    val months: List<Pair<String, Double>> = emptyList(),
    val monthRecords: List<RecordEntity> = emptyList(),
    val incomeTotal: Double = 0.0,
)

/**
 * 统计（开发文档 §8.4，参照 miniapp/src/pages/stats/index.tsx）。
 * 数据来自 Room Flow，图表全部用 Compose 自绘，不引入图表库。
 */
@Composable
fun StatsScreen(
    container: AppContainer,
    onDrillDown: (month: String, key: String, name: String) -> Unit,
) {
    val colors = JiXuTheme.colors
    val repo = container.repository
    val recordsFlow = remember { repo.observeAliveRecords() }
    val records by recordsFlow.collectAsStateWithLifecycle(emptyList())

    var month by rememberSaveable { mutableStateOf(currentMonth()) }
    var monthOpen by remember { mutableStateOf(false) }
    var type by rememberSaveable { mutableStateOf("expense") }
    var level by rememberSaveable { mutableStateOf("cat") }

    val ui = remember(records, month, type, level) { computeStats(records, month, type, level) }
    val monthLabel = if (month == currentMonth()) "本月" else "${YearMonth.parse(month).monthValue}月"

    val maxAmount = ui.stats.maxOfOrNull { it.total }?.coerceAtLeast(1.0) ?: 1.0
    val maxTrend = ui.trend.maxOfOrNull { it.total }?.coerceAtLeast(1.0) ?: 1.0
    val maxMonth = ui.months.maxOfOrNull { it.second }?.coerceAtLeast(1.0) ?: 1.0
    val hasMonthData = ui.months.any { it.second > 0 }
    val curMonthTotal = ui.months.lastOrNull()?.second ?: 0.0
    val prevMonthTotal = ui.months.getOrNull(ui.months.size - 2)?.second ?: 0.0
    val momPct = if (prevMonthTotal > 0) (curMonthTotal - prevMonthTotal) / prevMonthTotal * 100 else null

    val expRecs = remember(ui.monthRecords) { ui.monthRecords.filter { it.type == "expense" } }
    val recordDays = remember(expRecs) { expRecs.map { it.date }.toSet().size }
    val maxRec = remember(expRecs) { expRecs.maxByOrNull { it.amount } }

    fun drill(key: String, name: String) {
        onDrillDown(month, key, name)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 14.dp),
    ) {
        Spacer(Modifier.height(8.dp))

        // ===== 支出 / 收入 =====
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(colors.soft)
                .padding(3.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            listOf("expense" to "支出", "income" to "收入").forEach { (key, label) ->
                val selected = type == key
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(6.dp))
                        .background(
                            if (selected) {
                                if (key == "income") colors.inc else colors.exp
                            } else {
                                Color.Transparent
                            },
                        )
                        .clickable { type = key }
                        .padding(vertical = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        label,
                        fontSize = 14.sp,
                        fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
                        color = if (selected) Color.White else colors.sub,
                    )
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        // ===== 一级 / 二级分类 =====
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("cat" to "一级分类", "sub" to "二级分类").forEach { (key, label) ->
                val selected = level == key
                Text(
                    label,
                    modifier = Modifier
                        .clip(RoundedCornerShape(99.dp))
                        .background(if (selected) colors.accentSoft else colors.soft)
                        .clickable { level = key }
                        .padding(horizontal = 14.dp, vertical = 6.dp),
                    fontSize = 12.sp,
                    color = if (selected) colors.accent else colors.sub,
                    fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
                )
            }
        }

        Spacer(Modifier.height(12.dp))

        // ===== 合计主卡 =====
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .background(colors.hero)
                .padding(18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box {
                Text(
                    "$month · $monthLabel${if (type == "expense") "支出" else "收入"} ▾",
                    fontSize = 12.sp,
                    color = Color.White.copy(alpha = 0.66f),
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .clickable { monthOpen = true }
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )
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
            Text(
                "¥" + formatMoney(ui.total),
                fontSize = 30.sp,
                fontWeight = FontWeight.Medium,
                color = Color.White,
            )
            Text(
                "${ui.stats.size} 个类别" + if (ui.stats.isNotEmpty()) " · 最高 ${ui.stats[0].categoryName}" else "",
                fontSize = 11.sp,
                color = Color.White.copy(alpha = 0.6f),
            )
        }

        if (ui.stats.isEmpty()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 46.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("暂无数据", fontSize = 14.sp, color = colors.sub)
                Spacer(Modifier.height(6.dp))
                Text("记一笔账后这里就会出现统计图表", fontSize = 12.sp, color = colors.faint)
            }
        } else {
            // ===== 月度报告（仅支出） =====
            if (type == "expense") {
                Spacer(Modifier.height(10.dp))
                JxCard {
                    JxSectionTitle("${monthLabel}报告")
                    Spacer(Modifier.height(10.dp))
                    Text(
                        buildAnnotatedString {
                            append(if (monthLabel == "本月") "这个月" else monthLabel)
                            append("花了 ")
                            withStyle(SpanStyle(color = colors.text, fontWeight = FontWeight.Medium)) {
                                append("¥" + formatMoney(ui.total, 0))
                            }
                            if (momPct == null) {
                                append("，还没有上月数据可比")
                            } else if (momPct >= 0) {
                                append("，比上月 ")
                                withStyle(SpanStyle(color = colors.exp, fontWeight = FontWeight.Medium)) {
                                    append("多花 ${jsToFixed(momPct, 0)}%")
                                }
                            } else {
                                append("，比上月 ")
                                withStyle(SpanStyle(color = colors.inc, fontWeight = FontWeight.Medium)) {
                                    append("少花 ${jsToFixed(abs(momPct), 0)}%")
                                }
                            }
                        },
                        fontSize = 12.sp,
                        color = colors.sub,
                        lineHeight = 20.sp,
                    )
                    Spacer(Modifier.height(6.dp))
                    val top = ui.stats[0]
                    val topPct = if (ui.total > 0) jsToFixed(top.total / ui.total * 100, 0) else "0"
                    Text(
                        "大头是「${top.categoryName}」¥${formatMoney(top.total, 0)}，占 $topPct%",
                        fontSize = 12.sp,
                        color = colors.sub,
                        lineHeight = 20.sp,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text("共 ${expRecs.size} 笔 · 记了 $recordDays 天", fontSize = 12.sp, color = colors.sub)
                    if (maxRec != null) {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "最大一笔：¥${formatMoney(maxRec.amount, 0)} · ${maxRec.subcategoryName}（${maxRec.date.takeLast(5)}）",
                            fontSize = 12.sp,
                            color = colors.sub,
                        )
                    }
                    if (ui.incomeTotal > 0) {
                        Spacer(Modifier.height(6.dp))
                        val balance = ui.incomeTotal - ui.total
                        Text(
                            buildAnnotatedString {
                                append("收入 ¥${formatMoney(ui.incomeTotal, 0)}，结余 ")
                                withStyle(
                                    SpanStyle(
                                        color = if (balance >= 0) colors.inc else colors.exp,
                                        fontWeight = FontWeight.Medium,
                                    ),
                                ) {
                                    append((if (balance >= 0) "+" else "-") + formatMoney(abs(balance), 0))
                                }
                            },
                            fontSize = 12.sp,
                            color = colors.sub,
                        )
                    }
                }
            }

            // ===== 分类饼图 =====
            Spacer(Modifier.height(10.dp))
            JxCard {
                JxSectionTitle("分类饼图")
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.Top) {
                    DonutChart(stats = ui.stats, total = ui.total, monthLabel = monthLabel)
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        ui.stats.forEachIndexed { i, s ->
                            val pct = if (ui.total > 0) s.total / ui.total * 100 else 0.0
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { drill(s.categoryKey, s.categoryName) }
                                    .padding(vertical = 1.dp),
                            ) {
                                Box(
                                    Modifier
                                        .size(7.dp)
                                        .clip(RoundedCornerShape(2.dp))
                                        .background(colorAt(i)),
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    s.categoryName,
                                    fontSize = 11.sp,
                                    color = colors.text,
                                    maxLines = 1,
                                    modifier = Modifier.weight(1f),
                                )
                                Text("${jsToFixed(pct, 0)}%", fontSize = 11.sp, color = colors.muted)
                            }
                        }
                    }
                }
            }

            // ===== 分类对比 =====
            Spacer(Modifier.height(10.dp))
            JxCard {
                JxSectionTitle("分类对比")
                Spacer(Modifier.height(10.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    ui.stats.forEachIndexed { i, s ->
                        Column(
                            modifier = Modifier
                                .width(56.dp)
                                .clickable { drill(s.categoryKey, s.categoryName) },
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text(
                                "¥" + shortAmount(s.total),
                                fontSize = 9.sp,
                                color = colors.muted,
                                maxLines = 1,
                            )
                            Box(
                                Modifier
                                    .height(100.dp)
                                    .width(30.dp),
                                contentAlignment = Alignment.BottomCenter,
                            ) {
                                Box(
                                    Modifier
                                        .fillMaxWidth()
                                        .fillMaxHeight((s.total / maxAmount).toFloat().coerceAtLeast(0.04f))
                                        .background(
                                            colorAt(i),
                                            RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp),
                                        ),
                                )
                            }
                            Spacer(Modifier.height(4.dp))
                            Text(
                                s.categoryName.take(4),
                                fontSize = 9.sp,
                                color = colors.faint,
                                maxLines = 1,
                            )
                        }
                    }
                }
            }

            // ===== 分类占比 =====
            Spacer(Modifier.height(10.dp))
            JxCard {
                JxSectionTitle("分类占比 · 点条目看明细")
                Spacer(Modifier.height(10.dp))
                ui.stats.forEachIndexed { i, s ->
                    val pct = if (ui.total > 0) s.total / ui.total * 100 else 0.0
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { drill(s.categoryKey, s.categoryName) }
                            .padding(vertical = 5.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                Modifier
                                    .size(7.dp)
                                    .clip(RoundedCornerShape(2.dp))
                                    .background(colorAt(i)),
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(s.categoryName, fontSize = 13.sp, color = colors.text, modifier = Modifier.weight(1f))
                            Text("¥" + formatMoney(s.total, 0), fontSize = 13.sp, fontWeight = FontWeight.Medium, color = colors.text)
                            Spacer(Modifier.width(8.dp))
                            Text("${jsToFixed(pct, 0)}%", fontSize = 11.sp, color = colors.muted)
                        }
                        Spacer(Modifier.height(5.dp))
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .height(4.dp)
                                .clip(RoundedCornerShape(99.dp))
                                .background(colors.soft),
                        ) {
                            Box(
                                Modifier
                                    .fillMaxWidth((pct / 100).toFloat().coerceIn(0f, 1f))
                                    .height(4.dp)
                                    .background(colorAt(i)),
                            )
                        }
                    }
                }
            }

            // ===== 每日趋势 =====
            if (ui.trend.size >= 2) {
                Spacer(Modifier.height(10.dp))
                JxCard {
                    JxSectionTitle("每日趋势")
                    Spacer(Modifier.height(10.dp))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        ui.trend.forEach { d ->
                            Column(
                                modifier = Modifier.width(38.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                Text("¥" + shortAmount(d.total), fontSize = 8.sp, color = colors.muted, maxLines = 1)
                                Box(
                                    Modifier
                                        .height(80.dp)
                                        .width(24.dp),
                                    contentAlignment = Alignment.BottomCenter,
                                ) {
                                    Box(
                                        Modifier
                                            .fillMaxWidth()
                                            .fillMaxHeight((d.total / maxTrend).toFloat().coerceAtLeast(0.03f))
                                            .background(colors.accent, RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp)),
                                    )
                                }
                                Spacer(Modifier.height(3.dp))
                                Text(d.date.takeLast(5), fontSize = 8.sp, color = colors.faint, maxLines = 1)
                            }
                        }
                    }
                }
            }
        }

        // ===== 月度对比（近 6 个月） =====
        if (hasMonthData) {
            Spacer(Modifier.height(10.dp))
            JxCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    JxSectionTitle("月度对比", Modifier.weight(1f))
                    if (momPct != null) {
                        Text(
                            "较上月 " + (if (momPct > 0) "↑" else "↓") + jsToFixed(abs(momPct), 0) + "%",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            color = if (momPct > 0) colors.exp else colors.inc,
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    ui.months.forEachIndexed { i, (m, total) ->
                        val isCur = i == ui.months.lastIndex
                        Column(
                            modifier = Modifier.weight(1f),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text("¥" + shortAmount(total), fontSize = 9.sp, color = colors.muted, maxLines = 1)
                            Box(
                                Modifier
                                    .height(100.dp)
                                    .fillMaxWidth(),
                                contentAlignment = Alignment.BottomCenter,
                            ) {
                                Box(
                                    Modifier
                                        .width(22.dp)
                                        .fillMaxHeight((total / maxMonth).toFloat().coerceAtLeast(0.03f))
                                        .background(
                                            if (isCur) colors.accent else colors.soft,
                                            RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp),
                                        ),
                                )
                            }
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "${YearMonth.parse(m).monthValue}月",
                                fontSize = 10.sp,
                                color = if (isCur) colors.accent else colors.faint,
                                fontWeight = if (isCur) FontWeight.Medium else FontWeight.Normal,
                            )
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun DonutChart(stats: List<CategoryStat>, total: Double, monthLabel: String) {
    val colors = JiXuTheme.colors
    Box(Modifier.size(132.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val strokeWidth = 22.dp.toPx()
            val inset = strokeWidth / 2
            val arcSize = Size(size.width - strokeWidth, size.height - strokeWidth)
            drawArc(
                color = colors.soft,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = arcSize,
                style = Stroke(strokeWidth),
            )
            if (total > 0) {
                var start = -90f
                stats.forEachIndexed { i, s ->
                    val sweep = (s.total / total * 360).toFloat()
                    if (sweep > 0f) {
                        drawArc(
                            color = colorAt(i),
                            startAngle = start,
                            sweepAngle = sweep,
                            useCenter = false,
                            topLeft = Offset(inset, inset),
                            size = arcSize,
                            style = Stroke(strokeWidth, cap = StrokeCap.Butt),
                        )
                    }
                    start += sweep
                }
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("¥" + shortAmount(total), fontSize = 15.sp, fontWeight = FontWeight.Medium, color = colors.text)
            Text("${monthLabel}合计", fontSize = 10.sp, color = colors.muted)
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

/** 图表标签短金额：≥1 万保留 1 位小数，<1 万取整（§8.4-11） */
private fun shortAmount(value: Double): String {
    val abs = abs(value)
    if (!abs.isFinite()) return "--"
    return if (abs >= 1e4) formatMoney(abs, 1) else formatMoney(abs, 0)
}
