package com.jixu.app.ui.screens.home

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jixu.app.core.AMOUNT_INPUT_MAX_LENGTH
import com.jixu.app.core.formatMoney
import com.jixu.app.ui.screens.common.BDialog
import com.jixu.app.ui.screens.common.BTextField
import com.jixu.app.ui.screens.common.HLine
import com.jixu.app.ui.screens.common.MicroLabel
import com.jixu.app.ui.screens.common.MiniButton
import com.jixu.app.ui.screens.common.ModuleHeader
import com.jixu.app.ui.screens.common.MoneyText
import com.jixu.app.ui.screens.common.Panel
import com.jixu.app.ui.theme.JiXuTheme
import com.jixu.app.ui.theme.MonoFamily
import com.jixu.app.ui.theme.SansFamily
import kotlin.math.abs

@Composable
internal fun HomeBudgetCard(
    mini: Boolean,
    isCurrentMonth: Boolean,
    budget: Double,
    exp: Double,
    over: Boolean,
    pct: Int,
    budgetColor: Color,
    daysInMonth: Int,
    dayOfMonth: Int,
    remainDays: Int,
    dailyLeft: Double,
    budgetLeft: Double,
    onNewBudget: () -> Unit,
    onEditBudget: () -> Unit,
    onOpenStats: () -> Unit,
) {
    val c = JiXuTheme.colors
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
                    onNewBudget()
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
                        onEditBudget()
                    },
                )
                MiniButton("看统计", onClick = onOpenStats)
            }
        }
    }
}

/**
 * 预算表盘：270° 弧 + 每天一格刻度（B-SPEC §4「表盘」）。
 * 已用弧走强调色，超 80% 转琥珀，超支转危险色；虚线是匀速参考。
 */
@Composable
internal fun BudgetDial(
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

@Composable
internal fun BudgetDialog(
    value: String,
    onValueChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onSave: () -> Unit,
) {
    // ===== 预算弹窗 =====
    BDialog(title = "设置月度预算", en = "BUDGET", onDismiss = onDismiss) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("¥", style = TextStyle(fontFamily = MonoFamily, fontSize = 20.sp, color = JiXuTheme.colors.dim))
            Spacer(Modifier.width(10.dp))
            BTextField(
                value = value,
                onValueChange = onValueChange,
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
            MiniButton("取消", onClick = onDismiss)
            MiniButton("保存", onClick = { onSave() }, primary = true)
        }
    }
}
