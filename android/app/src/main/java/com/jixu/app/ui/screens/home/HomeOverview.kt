package com.jixu.app.ui.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jixu.app.core.jsRound
import com.jixu.app.data.DueSummary
import com.jixu.app.data.db.RecordEntity
import com.jixu.app.ui.screens.common.Dot
import com.jixu.app.ui.screens.common.HLine
import com.jixu.app.ui.screens.common.HeroAmount
import com.jixu.app.ui.screens.common.MicroLabel
import com.jixu.app.ui.screens.common.ModuleHeader
import com.jixu.app.ui.screens.common.MoneyText
import com.jixu.app.ui.screens.common.Panel
import com.jixu.app.ui.screens.common.PictBox
import com.jixu.app.ui.screens.common.currentMonth
import com.jixu.app.ui.screens.common.monthDot
import com.jixu.app.ui.screens.common.monthOptions
import com.jixu.app.ui.theme.JiXuTheme
import com.jixu.app.ui.theme.MonoFamily
import com.jixu.app.ui.theme.SansFamily
import java.time.YearMonth

@Composable
internal fun HomeHeader(
    mini: Boolean,
    dark: Boolean,
    onOpenCloud: () -> Unit,
    onOpenTheme: () -> Unit,
) {
    val c = JiXuTheme.colors
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
                .clickable { onOpenCloud() }
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
                .clickable { onOpenTheme() },
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
}

@Composable
internal fun HomeDueBanner(
    dueTotal: Int,
    dueInfo: DueSummary,
    onClick: () -> Unit,
) {
    val c = JiXuTheme.colors
    // ===== 待办到期横幅 =====
    if (dueTotal > 0) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .background(c.ambS)
                .border(1.dp, c.amb.copy(alpha = 0.35f))
                .clickable(onClick = onClick)
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
}

@Composable
internal fun HomeOverviewCard(
    mini: Boolean,
    isCurrentMonth: Boolean,
    month: String,
    monthOpen: Boolean,
    onMonthOpen: () -> Unit,
    onMonthDismiss: () -> Unit,
    onMonthPick: (String) -> Unit,
    exp: Double,
    inc: Double,
    balance: Double,
    entryCount: Int,
    top3: List<TopCat>,
    onOpenStats: () -> Unit,
) {
    val c = JiXuTheme.colors
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
                onOpen = onMonthOpen,
                onDismiss = onMonthDismiss,
                onPick = onMonthPick,
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
                            entryCount.toString(),
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
}

@Composable
internal fun HomeSavingsEntry(onOpenSavings: () -> Unit) {
    // ===== 存钱罐入口（首页不显示金额，只放入口） =====
    Panel(contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
        SystemRow("存钱罐", "独立小账本，不计入本月结余", onClick = onOpenSavings)
    }
}

@Composable
internal fun Readout(
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

/** 月份步进器：‹ 2026.11 ›，点中间弹月份表。 */
@Composable
internal fun MonthStepper(
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

/** Top3 一级分类（支出，按分累加，金额倒序；口径同 §7.5） */
internal data class TopCat(val key: String, val name: String, val total: Double)

internal fun top3Of(records: List<RecordEntity>): List<TopCat> {
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
