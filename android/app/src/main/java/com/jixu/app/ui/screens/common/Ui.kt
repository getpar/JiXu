package com.jixu.app.ui.screens.common

import android.content.Context
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DirectionsBus
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MedicalServices
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Pets
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.jixu.app.core.formatMoneyExact
import com.jixu.app.core.localDateStr
import com.jixu.app.ui.theme.BShape
import com.jixu.app.ui.theme.JiXuTheme
import com.jixu.app.ui.theme.MicroStyle
import com.jixu.app.ui.theme.UiStyle
import com.jixu.app.ui.theme.ModuleTitleStyle
import com.jixu.app.ui.theme.MonoFamily
import com.jixu.app.ui.theme.SansFamily
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * 「B · 夜航仪表」构件（B-SPEC §4）。
 *
 * 规则：直角 2dp、1dp 发丝线、无渐变无投影、强调色占比 ≤5%、动效只走 transform/opacity。
 */

/** 全局缓动：cubic-bezier(.2,.7,.1,1) */
val Ease = CubicBezierEasing(0.2f, 0.7f, 0.1f, 1f)

/** 按压 90ms */
const val DUR_PRESS = 90
/** 切换 260ms */
const val DUR_SWITCH = 260
/** 入场 380ms */
const val DUR_ENTER = 380

// ==================== 面板 ====================

/**
 * 模块面板：1dp 发丝边框 + 四角 6dp 角标（L 形）。
 * [flat] = 透明底（只留边框与角标），用于嵌在大面板里的子块。
 */
@Composable
fun Panel(
    modifier: Modifier = Modifier,
    flat: Boolean = false,
    contentPadding: PaddingValues = PaddingValues(start = 16.dp, top = 14.dp, end = 16.dp, bottom = 16.dp),
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = JiXuTheme.colors
    val mini = JiXuTheme.style == UiStyle.MINIAPP
    var m = modifier.fillMaxWidth()
    if (mini) {
        m = m
            .clip(JiXuTheme.cardShape)
            .background(if (flat) Color.Transparent else c.p1)
    } else {
        m = m
            .drawWithContent {
                drawContent()
                val len = 7.dp.toPx()
                val w = 1.dp.toPx()
                val half = w / 2f
                val right = size.width - half
                val bottom = size.height - half
                // 左上
                drawLine(c.tick, Offset(half, half), Offset(half + len, half), w)
                drawLine(c.tick, Offset(half, half), Offset(half, half + len), w)
                // 右上
                drawLine(c.tick, Offset(right - len, half), Offset(right, half), w)
                drawLine(c.tick, Offset(right, half), Offset(right, half + len), w)
                // 左下
                drawLine(c.tick, Offset(half, bottom - len), Offset(half, bottom), w)
                drawLine(c.tick, Offset(half, bottom), Offset(half + len, bottom), w)
                // 右下
                drawLine(c.tick, Offset(right, bottom - len), Offset(right, bottom), w)
                drawLine(c.tick, Offset(right - len, bottom), Offset(right, bottom), w)
            }
            .background(if (flat) Color.Transparent else c.p1)
            .border(1.dp, c.ln)
    }
    if (onClick != null) m = m.clickable(onClick = onClick)
    Column(m.padding(contentPadding), content = content)
}

/** 模块头行：编号（等宽 9sp）+ 中文标题（14/700）+ 英文微标签 + 右侧插槽。 */
@Composable
fun ModuleHeader(
    id: String,
    title: String,
    en: String = "",
    modifier: Modifier = Modifier,
    trailing: (@Composable RowScope.() -> Unit)? = null,
) {
    val c = JiXuTheme.colors
    val mini = JiXuTheme.style == UiStyle.MINIAPP
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (!mini) {
            Text(
                id,
                style = MicroStyle.copy(color = c.fnt),
                maxLines = 1,
                modifier = Modifier.padding(end = 9.dp),
            )
        }
        Text(
            title,
            style = if (mini) {
                ModuleTitleStyle.copy(color = c.tx, fontSize = 15.sp, fontWeight = FontWeight.Medium)
            } else {
                ModuleTitleStyle.copy(color = c.tx)
            },
            maxLines = 1,
        )
        if (!mini && en.isNotEmpty()) {
            Text(
                en.uppercase(),
                style = MicroStyle.copy(color = c.dim),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .weight(1f, fill = false)
                    .padding(start = 9.dp),
            )
        }
        Spacer(Modifier.weight(1f))
        if (trailing != null) trailing()
    }
}

/** 微标签（等宽 9sp / .12em / 全大写）。 */
@Composable
fun MicroLabel(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = JiXuTheme.colors.dim,
) {
    val mini = JiXuTheme.style == UiStyle.MINIAPP
    Text(
        if (mini) text else text.uppercase(),
        modifier = modifier,
        style = if (mini) {
            TextStyle(fontFamily = SansFamily, fontSize = 11.sp, fontWeight = FontWeight.Normal, color = color)
        } else {
            MicroStyle.copy(color = color)
        },
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

/** 「中文 + 英文微标签」组合，用于读数、小节标题。 */
@Composable
fun BiLabel(
    cn: String,
    en: String = "",
    modifier: Modifier = Modifier,
    color: Color = JiXuTheme.colors.dim,
    enColor: Color = JiXuTheme.colors.fnt,
) {
    val mini = JiXuTheme.style == UiStyle.MINIAPP
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        Text(cn, style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, color = color), maxLines = 1)
        if (!mini && en.isNotEmpty()) {
            Text(
                en.uppercase(),
                style = MicroStyle.copy(color = enColor),
                maxLines = 1,
                modifier = Modifier.padding(start = 5.dp),
            )
        }
    }
}

/** 1dp 分隔线。 */
@Composable
fun HLine(modifier: Modifier = Modifier, color: Color = JiXuTheme.colors.ln) {
    Box(modifier.fillMaxWidth().height(1.dp).background(color))
}

/** 空态。 */
@Composable
fun EmptyLine(text: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.fillMaxWidth().padding(vertical = 22.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = TextStyle(fontFamily = SansFamily, fontSize = 13.sp, color = JiXuTheme.colors.dim))
    }
}

// ==================== 金额 ====================

/**
 * 等宽金额：`¥` 与小数位按比例缩小并压暗（B-SPEC §4 金额）。
 * [size] 是整数部分的字号；[decRatio] 决定小数位比例。
 */
@Composable
fun MoneyText(
    amount: Double,
    modifier: Modifier = Modifier,
    size: TextUnit = 14.sp,
    color: Color = JiXuTheme.colors.tx,
    currency: Boolean = false,
    dimDecimals: Boolean = false,
    decRatio: Float = 0.62f,
    curRatio: Float = 0.62f,
    signed: Boolean = false,
    income: Boolean = false,
) {
    val c = JiXuTheme.colors
    val value = if (amount.isFinite()) amount else 0.0
    val text = formatMoneyExact(value)
    val dot = text.indexOf('.')
    val intPart = if (dot >= 0) text.substring(0, dot) else text
    val decPart = if (dot >= 0) text.substring(dot) else ""
    val fg = if (income) c.inc else color
    val annotated = buildAnnotatedString {
        if (signed) append(if (value < 0) "-" else "+")
        if (currency) {
            withStyle(SpanStyle(fontSize = size * curRatio, color = c.dim)) { append("¥") }
        }
        append(intPart)
        if (decPart.isNotEmpty()) {
            withStyle(
                SpanStyle(
                    fontSize = if (dimDecimals) size * decRatio else size,
                    color = if (dimDecimals) c.dim else fg,
                ),
            ) { append(decPart) }
        }
    }
    Text(
        text = annotated,
        modifier = modifier,
        style = TextStyle(
            fontFamily = if (JiXuTheme.style == UiStyle.MINIAPP) SansFamily else MonoFamily,
            fontSize = size,
            fontWeight = if (JiXuTheme.style == UiStyle.MINIAPP) FontWeight.Medium else FontWeight.Light,
            letterSpacing = if (JiXuTheme.style == UiStyle.MINIAPP) 0.em else (-0.02).em,
            fontFeatureSettings = "tnum",
            color = fg,
        ),
        maxLines = 1,
        softWrap = false,
        overflow = TextOverflow.Clip,
    )
}

/** 主读数（首页 / 统计）：大号整数 + 小号暗色小数。位数多时自动收字号，避免撑破面板。 */
@Composable
fun HeroAmount(
    amount: Double,
    modifier: Modifier = Modifier,
    intSize: TextUnit = 52.sp,
    color: Color = JiXuTheme.colors.tx,
) {
    MoneyText(
        amount = amount,
        modifier = modifier,
        size = amountTextSize(amount, intSize),
        color = color,
        currency = true,
        dimDecimals = true,
        decRatio = 0.4f,
        curRatio = 0.32f,
    )
}

/**
 * 按整数位数收敛字号：6 位以内保持原字号，再长就等比缩小。
 * （等宽字体下字符宽度可预测，这条规则比自适应布局便宜也更稳。）
 */
fun amountTextSize(amount: Double, base: TextUnit): TextUnit {
    val text = formatMoneyExact(if (amount.isFinite()) abs(amount) else 0.0)
    val digits = text.substringBefore('.').length
    return when {
        digits <= 6 -> base
        digits <= 8 -> base * 0.84f
        digits <= 10 -> base * 0.68f
        else -> base * 0.52f
    }
}

// ==================== 控件 ====================

/** 分段控件：外框 1dp ln2，内 2dp；选中填强调色、深色字 700。 */
@Composable
fun Seg(
    options: List<Pair<String, String>>,
    selected: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    height: Dp = 34.dp,
    fill: Boolean = true,
    accent: Color = JiXuTheme.colors.acF,
    onAccent: Color = JiXuTheme.colors.onAc,
) {
    val c = JiXuTheme.colors
    val mini = JiXuTheme.style == UiStyle.MINIAPP
    val outerShape = if (mini) RoundedCornerShape(10.dp) else RoundedCornerShape(2.dp)
    val itemShape = if (mini) RoundedCornerShape(8.dp) else RoundedCornerShape(0.dp)
    Row(
        modifier = modifier
            .then(if (fill) Modifier.fillMaxWidth() else Modifier)
            .clip(outerShape)
            .background(if (mini) c.p2 else Color.Transparent)
            .border(1.dp, if (mini) c.ln else c.ln2, outerShape)
            .padding(2.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        options.forEach { (key, label) ->
            val on = key == selected
            Box(
                modifier = Modifier
                    .then(if (fill) Modifier.weight(1f) else Modifier)
                    .height(height)
                    .clip(itemShape)
                    .background(if (on) accent else Color.Transparent)
                    .clickable { onSelect(key) },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    style = TextStyle(
                        fontFamily = SansFamily,
                        fontSize = 13.sp,
                        fontWeight = if (on) FontWeight.Bold else FontWeight.Normal,
                        color = if (on) onAccent else c.dim,
                    ),
                    maxLines = 1,
                )
            }
        }
    }
}

/** 筹码：胶囊 1dp 边，选中反白。 */
@Composable
fun Chip(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    count: String? = null,
) {
    val c = JiXuTheme.colors
    val mini = JiXuTheme.style == UiStyle.MINIAPP
    val shape = if (mini) RoundedCornerShape(9.dp) else RoundedCornerShape(17.dp)
    Row(
        modifier = modifier
            .height(34.dp)
            .clip(shape)
            .background(
                when {
                    mini && selected -> c.acS
                    mini -> Color.Transparent
                    selected -> c.tx
                    else -> Color.Transparent
                },
            )
            .border(1.dp, if (mini && selected) c.ac else if (selected) c.tx else c.ln, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text,
            style = TextStyle(
                fontFamily = SansFamily,
                fontSize = 12.sp,
                color = if (mini && selected) c.ac else if (selected) c.bg else c.dim,
            ),
            maxLines = 1,
        )
        if (count != null) {
            Text(
                count,
                style = TextStyle(
                    fontFamily = if (mini) SansFamily else MonoFamily,
                    fontSize = 10.sp,
                    color = if (mini && selected) c.ac else if (selected) c.bg else c.fnt,
                ),
                modifier = Modifier.padding(start = 5.dp),
                maxLines = 1,
            )
        }
    }
}

/** 小按钮：1dp ln2 边；[primary] 填强调色。 */
@Composable
fun MiniButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    primary: Boolean = false,
    danger: Boolean = false,
    enabled: Boolean = true,
    height: Dp = 34.dp,
) {
    val c = JiXuTheme.colors
    val mini = JiXuTheme.style == UiStyle.MINIAPP
    val shape = if (mini) RoundedCornerShape(10.dp) else BShape
    Box(
        modifier = modifier
            .height(height)
            .background(if (primary) c.acF else if (mini) c.p2 else Color.Transparent, shape)
            .border(1.dp, if (primary) c.acF else if (mini) c.ln else c.ln2, shape)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            style = TextStyle(
                fontFamily = SansFamily,
                fontSize = 12.sp,
                fontWeight = if (primary) FontWeight.Medium else FontWeight.Normal,
                color = when {
                    !enabled -> c.fnt
                    primary -> c.onAc
                    danger -> c.cor
                    else -> c.tx
                },
            ),
            maxLines = 1,
        )
    }
}

/** 开关：46×28，开 = 强调色底 + 深色圆点。 */
@Composable
fun Toggle(
    checked: Boolean,
    onChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = JiXuTheme.colors
    val knob by androidx.compose.animation.core.animateDpAsState(
        targetValue = if (checked) 18.dp else 0.dp,
        animationSpec = tween(DUR_SWITCH, easing = Ease),
        label = "toggle",
    )
    Box(
        modifier = modifier
            .size(width = 46.dp, height = 28.dp)
            .clip(CircleShape)
            .background(if (checked) c.acF else Color.Transparent)
            .border(1.dp, if (checked) c.acF else c.ln2, CircleShape)
            .clickable { onChange(!checked) }
            .padding(3.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Box(
            Modifier
                .offset(x = knob)
                .size(22.dp)
                .clip(CircleShape)
                .background(if (checked) c.onAc else c.dim),
        )
    }
}

/** 分类图标（等宽风格的小方框）。 */
fun categoryIcon(key: String): ImageVector = when (key) {
    "food" -> Icons.Filled.Restaurant
    "transport" -> Icons.Filled.DirectionsBus
    "shopping" -> Icons.Filled.ShoppingBag
    "housing" -> Icons.Filled.Home
    "entertainment" -> Icons.Filled.Movie
    "medical" -> Icons.Filled.MedicalServices
    "education" -> Icons.AutoMirrored.Filled.MenuBook
    "social" -> Icons.Filled.CardGiftcard
    "finance" -> Icons.Filled.AccountBalance
    "pet" -> Icons.Filled.Pets
    else -> Icons.Filled.MoreHoriz
}

/** 图标方框：28dp（手机 34dp），1dp 边。 */
@Composable
fun PictBox(key: String, modifier: Modifier = Modifier, size: Dp = 34.dp, tint: Color = JiXuTheme.colors.tx) {
    val mini = JiXuTheme.style == UiStyle.MINIAPP
    Box(
        modifier = modifier
            .size(size)
            .then(
                if (mini) {
                    Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(JiXuTheme.colors.p2)
                } else {
                    Modifier.border(1.dp, JiXuTheme.colors.ln)
                },
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(categoryIcon(key), contentDescription = null, tint = tint, modifier = Modifier.size(size * 0.5f))
    }
}

/**
 * 列表行（B-SPEC §4 `.rw`）：图标 34 | 文字 1fr | 金额。
 * 第二行是「人 · 时间 · 小票」。
 */
@Composable
fun RowItem(
    title: String,
    amount: Double,
    modifier: Modifier = Modifier,
    iconKey: String = "other",
    sub: String = "",
    meta: String = "",
    income: Boolean = false,
    onClick: (() -> Unit)? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
) {
    val c = JiXuTheme.colors
    var m = modifier.fillMaxWidth()
    if (onClick != null) m = m.clickable(onClick = onClick)
    Row(
        modifier = m.padding(vertical = 9.dp),
        verticalAlignment = Alignment.Top,
    ) {
        PictBox(iconKey)
        Column(Modifier.weight(1f).padding(start = 11.dp)) {
            Text(
                title,
                style = TextStyle(fontFamily = SansFamily, fontSize = 13.5.sp, color = c.tx),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (sub.isNotEmpty()) {
                Text(
                    sub,
                    style = TextStyle(fontFamily = SansFamily, fontSize = 11.5.sp, color = c.dim),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 1.dp),
                )
            }
            if (meta.isNotEmpty()) {
                Text(
                    meta,
                    style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.fnt),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
        Row(verticalAlignment = Alignment.Top) {
            MoneyText(
                amount = amount,
                size = 14.sp,
                color = c.tx,
                signed = true,
                income = income,
                modifier = Modifier.padding(top = 1.dp),
            )
            if (trailing != null) trailing()
        }
    }
}

/** 日期分隔条：`今天 11.05 周四` 左，`5 笔 −199.00` 右。 */
@Composable
fun DayHeader(
    date: String,
    count: Int,
    expense: Double,
    income: Double,
    modifier: Modifier = Modifier,
) {
    val c = JiXuTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(34.dp)
            .background(c.p2)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            dayName(date),
            style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = c.tx),
            maxLines = 1,
        )
        Text(
            "${mmddDot(date)} ${weekdayCn(date)}",
            style = TextStyle(fontFamily = MonoFamily, fontSize = 10.sp, color = c.dim),
            modifier = Modifier.padding(start = 8.dp),
            maxLines = 1,
        )
        Spacer(Modifier.weight(1f))
        Text("$count 笔", style = TextStyle(fontFamily = MonoFamily, fontSize = 10.5.sp, color = c.dim), maxLines = 1)
        if (expense > 0) {
            Text(
                "-" + formatMoneyExact(expense),
                style = TextStyle(fontFamily = MonoFamily, fontSize = 10.5.sp, color = c.dim),
                modifier = Modifier.padding(start = 10.dp),
                maxLines = 1,
            )
        }
        if (income > 0) {
            Text(
                "+" + formatMoneyExact(income),
                style = TextStyle(fontFamily = MonoFamily, fontSize = 10.5.sp, color = c.inc),
                modifier = Modifier.padding(start = 10.dp),
                maxLines = 1,
            )
        }
    }
}

// ==================== 键盘 ====================

/** 数字键盘：4 列，保存键跨两行（B-SPEC §4 `.pad`）。 */
@Composable
fun Keypad(
    onDigit: (Char) -> Unit,
    onDot: () -> Unit,
    onBackspace: () -> Unit,
    onClear: () -> Unit,
    onDoubleZero: () -> Unit,
    onSave: () -> Unit,
    modifier: Modifier = Modifier,
    saveLabel: String = "保存",
    income: Boolean = false,
) {
    val c = JiXuTheme.colors
    val mini = JiXuTheme.style == UiStyle.MINIAPP
    val saveShape = if (mini) RoundedCornerShape(14.dp) else RoundedCornerShape(2.dp)
    val keyH = 54.dp
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            KeyCell("7", keyH, Modifier.weight(1f)) { onDigit('7') }
            KeyCell("8", keyH, Modifier.weight(1f)) { onDigit('8') }
            KeyCell("9", keyH, Modifier.weight(1f)) { onDigit('9') }
            KeyCell("⌫", keyH, Modifier.weight(1f), small = "BKSP", fn = true) { onBackspace() }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            KeyCell("4", keyH, Modifier.weight(1f)) { onDigit('4') }
            KeyCell("5", keyH, Modifier.weight(1f)) { onDigit('5') }
            KeyCell("6", keyH, Modifier.weight(1f)) { onDigit('6') }
            KeyCell("00", keyH, Modifier.weight(1f), small = "ZERO", fn = true) { onDoubleZero() }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Column(Modifier.weight(3f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    KeyCell("1", keyH, Modifier.weight(1f)) { onDigit('1') }
                    KeyCell("2", keyH, Modifier.weight(1f)) { onDigit('2') }
                    KeyCell("3", keyH, Modifier.weight(1f)) { onDigit('3') }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    KeyCell("C", keyH, Modifier.weight(1f), small = "ESC", fn = true) { onClear() }
                    KeyCell("0", keyH, Modifier.weight(1f)) { onDigit('0') }
                    KeyCell(".", keyH, Modifier.weight(1f), small = "DOT", fn = true) { onDot() }
                }
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(keyH * 2 + 6.dp)
                    .background(if (income) c.inc else c.acF, saveShape)
                    .border(1.dp, if (income) c.inc else c.acF, saveShape)
                    .clickable(onClick = onSave),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        saveLabel,
                        style = TextStyle(
                            fontFamily = SansFamily,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = c.onAc,
                        ),
                    )
                    Text(
                        "ENTER",
                        style = MicroStyle.copy(color = c.onAc.copy(alpha = 0.55f)),
                        modifier = Modifier.padding(top = 5.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun KeyCell(
    label: String,
    height: Dp,
    modifier: Modifier = Modifier,
    small: String? = null,
    fn: Boolean = false,
    onClick: () -> Unit,
) {
    val c = JiXuTheme.colors
    val mini = JiXuTheme.style == UiStyle.MINIAPP
    val shape = if (mini) RoundedCornerShape(10.dp) else RoundedCornerShape(3.dp)
    Box(
        modifier = modifier
            .height(height)
            .background(if (mini) c.p2 else c.key, shape)
            .border(1.dp, if (mini) c.ln else c.keyB, shape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (small != null && !mini) {
            Text(
                small,
                style = MicroStyle.copy(color = c.fnt, fontSize = 8.sp),
                modifier = Modifier.align(Alignment.TopStart).padding(start = 6.dp, top = 5.dp),
            )
        }
        Text(
            label,
            style = TextStyle(
                fontFamily = if (mini) SansFamily else MonoFamily,
                fontSize = if (fn) 16.sp else 22.sp,
                fontWeight = if (mini) FontWeight.Normal else FontWeight.Light,
                color = if (fn) c.dim else c.tx,
            ),
        )
    }
}

// ==================== 弹窗 / 输入 ====================

/** 面板式弹窗：直角、1dp 边、内容可滚。 */
@Composable
fun BDialog(
    onDismiss: () -> Unit,
    title: String,
    en: String = "",
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = JiXuTheme.colors
    val mini = JiXuTheme.style == UiStyle.MINIAPP
    val maxHeight = (LocalConfiguration.current.screenHeightDp * 0.88f).dp
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth(0.94f)
                .widthIn(max = 560.dp)
                .heightIn(max = maxHeight)
                .clip(if (mini) RoundedCornerShape(20.dp) else RoundedCornerShape(0.dp))
                .background(c.p1)
                .then(if (mini) Modifier else Modifier.border(1.dp, c.ln2))
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 18.dp, vertical = 16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    title,
                    style = TextStyle(fontFamily = SansFamily, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = c.tx),
                    modifier = Modifier.weight(1f),
                )
                if (en.isNotEmpty()) MicroLabel(en, color = c.fnt)
                Text(
                    "✕",
                    style = TextStyle(fontFamily = MonoFamily, fontSize = 14.sp, color = c.dim),
                    modifier = Modifier
                        .clickable(onClick = onDismiss)
                        .padding(start = 14.dp, top = 2.dp, bottom = 2.dp, end = 2.dp),
                )
            }
            HLine(Modifier.padding(top = 12.dp, bottom = 14.dp))
            content()
        }
    }
}

/** 确认弹窗（删除 / 恢复 / 换码）。 */
@Composable
fun BConfirm(
    title: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
    message: String? = null,
    confirmText: String = "确定",
    danger: Boolean = true,
) {
    val c = JiXuTheme.colors
    val mini = JiXuTheme.style == UiStyle.MINIAPP
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth(0.9f)
                .widthIn(max = 420.dp)
                .clip(if (mini) RoundedCornerShape(20.dp) else RoundedCornerShape(0.dp))
                .background(c.p1)
                .then(if (mini) Modifier else Modifier.border(1.dp, c.ln2))
                .padding(18.dp),
        ) {
            Text(title, style = TextStyle(fontFamily = SansFamily, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = c.tx))
            if (message != null) {
                Text(
                    message,
                    style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, lineHeight = 19.sp, color = c.dim),
                    modifier = Modifier.padding(top = 10.dp),
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 18.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Spacer(Modifier.weight(1f))
                MiniButton("取消", onClick = onDismiss)
                MiniButton(confirmText, onClick = onConfirm, primary = !danger, danger = danger, modifier = Modifier.padding(start = 0.dp))
            }
        }
    }
}

/** 极简输入框：无底无框，光标用强调色；下划线由调用方补。 */
@Composable
fun BTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    maxLength: Int? = null,
    singleLine: Boolean = true,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    textSize: TextUnit = 14.sp,
    mono: Boolean = false,
) {
    val c = JiXuTheme.colors
    val mini = JiXuTheme.style == UiStyle.MINIAPP
    BasicTextField(
        value = value,
        onValueChange = { v -> onValueChange(if (maxLength != null) v.take(maxLength) else v) },
        modifier = modifier
            .fillMaxWidth()
            .then(
                if (mini) {
                    Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(c.p2)
                        .padding(horizontal = 12.dp, vertical = 10.dp)
                } else {
                    Modifier
                },
            ),
        singleLine = singleLine,
        textStyle = TextStyle(
            fontFamily = if (mono) MonoFamily else SansFamily,
            fontSize = textSize,
            color = c.tx,
        ),
        keyboardOptions = keyboardOptions,
        cursorBrush = SolidColor(c.acF),
        decorationBox = { inner ->
            Box {
                if (value.isEmpty()) {
                    Text(
                        placeholder,
                        style = TextStyle(
                            fontFamily = if (mono) MonoFamily else SansFamily,
                            fontSize = textSize,
                            color = c.fnt,
                        ),
                    )
                }
                inner()
            }
        },
    )
}

/** 顶部栏：返回 + 标题 + 英文微标签 + 右侧插槽。 */
@Composable
fun BTopBar(
    title: String,
    en: String = "",
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
) {
    val c = JiXuTheme.colors
    val mini = JiXuTheme.style == UiStyle.MINIAPP
    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onBack != null) {
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .clip(if (mini) RoundedCornerShape(12.dp) else RoundedCornerShape(0.dp))
                    .background(if (mini) c.p2 else Color.Transparent)
                    .then(if (mini) Modifier else Modifier.border(1.dp, c.ln2))
                    .clickable(onClick = onBack),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                    contentDescription = "返回",
                    tint = c.tx,
                    modifier = Modifier.size(22.dp),
                )
            }
            Spacer(Modifier.width(12.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(
                title,
                style = TextStyle(
                    fontFamily = SansFamily,
                    fontSize = if (mini) 18.sp else 20.sp,
                    fontWeight = if (mini) FontWeight.Medium else FontWeight.Bold,
                    color = c.tx,
                ),
                maxLines = 1,
            )
            if (!mini && en.isNotEmpty()) {
                MicroLabel(en, modifier = Modifier.padding(top = 3.dp), color = c.dim)
            }
        }
        if (trailing != null) trailing()
    }
}

/** 底部撤销条：从下方推入。 */
@Composable
fun UndoToast(
    visible: Boolean,
    message: String,
    actionText: String,
    onAction: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = JiXuTheme.colors
    AnimatedVisibility(
        visible = visible,
        modifier = modifier,
        enter = fadeIn(tween(180)) + slideInVertically(tween(300, easing = Ease)) { it / 2 },
        exit = fadeOut(tween(140)) + slideOutVertically(tween(220, easing = Ease)) { it / 2 },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(c.tx, RoundedCornerShape(3.dp))
                .padding(start = 16.dp, end = 6.dp, top = 10.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(c.acF))
            Text(
                message,
                style = TextStyle(fontFamily = SansFamily, fontSize = 12.5.sp, color = c.bg),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).padding(start = 12.dp),
            )
            Text(
                actionText,
                style = TextStyle(fontFamily = SansFamily, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, color = c.bg),
                modifier = Modifier
                    .clickable(onClick = onAction)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            )
        }
    }
}

/**
 * 左滑露出操作：内容层在 [content]，右侧 [actionsWidth] 宽的操作区。
 * 只在 transform 上做动画（B-SPEC §5）。
 */
@Composable
fun SwipeRow(
    actions: @Composable RowScope.() -> Unit,
    modifier: Modifier = Modifier,
    actionsWidth: Dp = 136.dp,
    content: @Composable () -> Unit,
) {
    val c = JiXuTheme.colors
    val scope = rememberCoroutineScope()
    val swipePx = with(LocalDensity.current) { actionsWidth.toPx() }
    val offsetX = remember { Animatable(0f) }
    var open by remember { mutableStateOf(false) }
    LaunchedEffect(open) {
        offsetX.animateTo(if (open) -swipePx else 0f, tween(DUR_SWITCH, easing = Ease))
    }
    Box(modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.matchParentSize(),
            horizontalArrangement = Arrangement.End,
        ) {
            Row(
                modifier = Modifier.width(actionsWidth).fillMaxHeight(),
                content = actions,
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .offset { IntOffset(offsetX.value.roundToInt(), 0) }
                .background(c.p1)
                .pointerInput(swipePx) {
                    detectHorizontalDragGestures(
                        onHorizontalDrag = { change, drag ->
                            change.consume()
                            scope.launch {
                                offsetX.snapTo((offsetX.value + drag).coerceIn(-swipePx, 0f))
                            }
                        },
                        onDragEnd = {
                            val shouldOpen = offsetX.value < -swipePx * 0.4f
                            if (shouldOpen == open) {
                                scope.launch {
                                    offsetX.animateTo(if (shouldOpen) -swipePx else 0f, tween(DUR_SWITCH, easing = Ease))
                                }
                            } else {
                                open = shouldOpen
                            }
                        },
                        onDragCancel = {
                            scope.launch {
                                offsetX.animateTo(if (open) -swipePx else 0f, tween(DUR_SWITCH, easing = Ease))
                            }
                        },
                    )
                },
        ) {
            content()
        }
    }
}

/** 右滑操作按钮（编辑 / 删除）。 */
@Composable
fun SwipeAction(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    danger: Boolean = false,
) {
    val c = JiXuTheme.colors
    Box(
        modifier = modifier
            .fillMaxHeight()
            .background(if (danger) c.cor else c.p3)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            style = TextStyle(
                fontFamily = SansFamily,
                fontSize = 12.sp,
                color = if (danger) Color.White else c.tx,
            ),
        )
    }
}

/** 条纹填充（收入柱 / 超刻度），用 1dp 斜线画出来。 */
fun Modifier.striped(color: Color, step: Float = 6f): Modifier = this.drawWithContent {
    drawContent()
    val w = size.width
    val h = size.height
    val stroke = 1.2.dp.toPx()
    var x = -h
    while (x < w) {
        drawLine(
            color = color,
            start = Offset(x, h),
            end = Offset(x + h, 0f),
            strokeWidth = stroke,
        )
        x += step * 1.6f
    }
}

/** 小圆点指示（同步状态 / 分类色）。 */
@Composable
fun Dot(color: Color, size: Dp = 7.dp, modifier: Modifier = Modifier) {
    Box(modifier.size(size).clip(CircleShape).background(color))
}

/** 画一条虚线圆弧的辅助（预算匀速参考）。 */
fun androidx.compose.ui.graphics.drawscope.DrawScope.dashedArc(
    color: Color,
    startAngle: Float,
    sweepAngle: Float,
    strokeWidth: Float,
    inset: Float,
    dash: Float = 4.dp.toPx(),
    gap: Float = 4.dp.toPx(),
) {
    val radius = (size.minDimension - inset * 2f) / 2f
    val center = Offset(size.width / 2f, size.height / 2f)
    var angle = startAngle
    val end = startAngle + sweepAngle
    while (angle < end) {
        val step = dash / radius * (180f / Math.PI.toFloat())
        val next = minOf(angle + step, end)
        drawArc(
            color = color,
            startAngle = angle,
            sweepAngle = next - angle,
            useCenter = false,
            topLeft = Offset(center.x - radius, center.y - radius),
            size = Size(radius * 2f, radius * 2f),
            style = androidx.compose.ui.graphics.drawscope.Stroke(width = strokeWidth),
        )
        val gapDeg = gap / radius * (180f / Math.PI.toFloat())
        angle = next + gapDeg
    }
}

// ==================== 日期 / 月份工具 ====================

fun todayStr(): String = localDateStr()

fun currentMonth(): String = YearMonth.now().toString()

/** 近 12 个月（按「当月 1 号」往前推，避免 29~31 号溢出重复，§8.1-1） */
fun monthOptions(): List<String> {
    val now = YearMonth.now()
    return (0 until 12).map { now.minusMonths(it.toLong()).toString() }
}

fun parseLocalDateOrNull(value: String): LocalDate? =
    runCatching { LocalDate.parse(value) }.getOrNull()

/** `2026-11` → `2026.11` */
fun monthDot(month: String): String = month.replace('-', '.')

/** `2026-11-05` → `11.05` */
fun mmddDot(date: String): String = if (date.length >= 10) date.substring(5).replace('-', '.') else date

fun weekdayCn(date: String): String {
    val d = parseLocalDateOrNull(date) ?: return ""
    return when (d.dayOfWeek.value) {
        1 -> "周一"
        2 -> "周二"
        3 -> "周三"
        4 -> "周四"
        5 -> "周五"
        6 -> "周六"
        else -> "周日"
    }
}

/** 今天 / 昨天 / `11月3日` */
fun dayName(date: String): String {
    val d = parseLocalDateOrNull(date) ?: return date
    val today = LocalDate.now()
    return when (d) {
        today -> "今天"
        today.minusDays(1) -> "昨天"
        else -> "${d.monthValue}月${d.dayOfMonth}日"
    }
}

fun Context.showToast(text: String) {
    Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
}

/** 供外部复用：把金额按「整数 + 小数」切开。 */
fun splitAmount(amount: Double): Pair<String, String> {
    val text = formatMoneyExact(abs(amount))
    val dot = text.indexOf('.')
    return if (dot >= 0) text.substring(0, dot) to text.substring(dot) else text to ""
}
