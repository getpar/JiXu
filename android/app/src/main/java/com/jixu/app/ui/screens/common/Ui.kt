package com.jixu.app.ui.screens.common

import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.jixu.app.core.formatMoney
import com.jixu.app.core.formatMoneyExact
import com.jixu.app.core.localDateStr
import com.jixu.app.ui.theme.JiXuTheme
import java.time.LocalDate
import java.time.YearMonth

/** 页面通用底板：卡片 / 标签 / 按钮 / 弹窗，样式见开发文档 §9（无渐变、无阴影、1dp 细线）。 */

@Composable
fun JxCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    padding: Dp = 14.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = JiXuTheme.colors
    var m = modifier
        .fillMaxWidth()
        .clip(RoundedCornerShape(10.dp))
        .background(colors.card)
    if (onClick != null) m = m.clickable(onClick = onClick)
    Column(m.padding(padding), content = content)
}

@Composable
fun JxLabel(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier = modifier, fontSize = 12.sp, color = JiXuTheme.colors.sub)
}

@Composable
fun JxTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        modifier = modifier,
        fontSize = 16.sp,
        fontWeight = FontWeight.Medium,
        color = JiXuTheme.colors.text,
    )
}

@Composable
fun JxSectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        modifier = modifier,
        fontSize = 15.sp,
        fontWeight = FontWeight.Medium,
        color = JiXuTheme.colors.text,
    )
}

@Composable
fun JxChip(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = JiXuTheme.colors
    Text(
        text = text,
        modifier = modifier
            .clip(RoundedCornerShape(99.dp))
            .background(if (selected) colors.accent else colors.soft)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        fontSize = 12.sp,
        color = if (selected) Color.White else colors.sub,
    )
}

@Composable
fun JxTag(
    text: String,
    fg: Color = JiXuTheme.colors.accent,
    bg: Color = JiXuTheme.colors.accentSoft,
    modifier: Modifier = Modifier,
) {
    Text(
        text = text,
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .background(bg)
            .padding(horizontal = 6.dp, vertical = 2.dp),
        fontSize = 11.sp,
        color = fg,
    )
}

@Composable
fun JxLink(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    color: Color = JiXuTheme.colors.accent,
    size: TextUnit = 13.sp,
) {
    Text(
        text = text,
        modifier = modifier.clickable(onClick = onClick).padding(vertical = 2.dp),
        fontSize = size,
        color = color,
    )
}

@Composable
fun JxPrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val colors = JiXuTheme.colors
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(colors.accent)
            .clickable(onClick = onClick)
            .padding(vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = Color.White)
    }
}

@Composable
fun JxDialog(
    onDismiss: () -> Unit,
    title: String? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = JiXuTheme.colors
    // 内容超长（如云同步展开高级设置 + 键盘）时必须限高，否则 verticalScroll 没有视口可滚，底部按钮会跑到屏幕外
    val maxHeight = (LocalConfiguration.current.screenHeightDp * 0.9f).dp
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .widthIn(max = 560.dp)
                .heightIn(max = maxHeight)
                .clip(RoundedCornerShape(12.dp))
                .background(colors.card)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(18.dp),
        ) {
            if (title != null) {
                Text(
                    text = title,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Medium,
                    color = colors.text,
                    modifier = Modifier.padding(bottom = 14.dp),
                )
            }
            content()
        }
    }
}

@Composable
fun JxTopBar(
    title: String,
    onBack: () -> Unit,
    actions: @Composable RowScope.() -> Unit = {},
) {
    val colors = JiXuTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
            contentDescription = "返回",
            tint = colors.text,
            modifier = Modifier
                .clip(RoundedCornerShape(99.dp))
                .clickable(onClick = onBack)
                .padding(4.dp),
        )
        Text(title, fontSize = 18.sp, fontWeight = FontWeight.Medium, color = colors.text)
        Spacer(Modifier.weight(1f))
        actions()
    }
}

@Composable
fun JxEmpty(text: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 36.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, fontSize = 13.sp, color = JiXuTheme.colors.faint)
    }
}

@Composable
fun JxDivider(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(JiXuTheme.colors.line),
    )
}

@Composable
fun JxAmount(
    amount: Double,
    type: String,
    modifier: Modifier = Modifier,
    exact: Boolean = true,
    size: TextUnit = 14.sp,
) {
    val colors = JiXuTheme.colors
    Text(
        text = (if (type == "income") "+" else "-") + "¥" +
            (if (exact) formatMoneyExact(amount) else formatMoney(amount)),
        modifier = modifier,
        fontSize = size,
        fontWeight = FontWeight.Medium,
        color = if (type == "income") colors.inc else colors.exp,
    )
}

@Composable
fun JxTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    maxLength: Int? = null,
    singleLine: Boolean = true,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    textSize: TextUnit = 14.sp,
) {
    val colors = JiXuTheme.colors
    BasicTextField(
        value = value,
        onValueChange = { v -> onValueChange(if (maxLength != null) v.take(maxLength) else v) },
        modifier = modifier.fillMaxWidth(),
        singleLine = singleLine,
        textStyle = TextStyle(fontSize = textSize, color = colors.text),
        keyboardOptions = keyboardOptions,
        cursorBrush = SolidColor(colors.accent),
        decorationBox = { inner ->
            Box {
                if (value.isEmpty()) {
                    Text(placeholder, fontSize = textSize, color = colors.faint)
                }
                inner()
            }
        },
    )
}

@Composable
fun JxSmallAction(
    text: String,
    onClick: () -> Unit,
    fg: Color = JiXuTheme.colors.accent,
    bg: Color = JiXuTheme.colors.accentSoft,
) {
    Text(
        text = text,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(bg)
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        fontSize = 12.sp,
        color = fg,
    )
}

@Composable
fun JxConfirmDialog(
    title: String,
    onDismiss: () -> Unit,
    confirmText: String = "确定",
    confirmColor: Color = JiXuTheme.colors.exp,
    message: String? = null,
    onConfirm: () -> Unit,
) {
    val colors = JiXuTheme.colors
    AlertDialog(
        onDismissRequest = onDismiss,
        shape = RoundedCornerShape(12.dp),
        containerColor = colors.card,
        titleContentColor = colors.text,
        textContentColor = colors.sub,
        title = { Text(title, fontSize = 17.sp, fontWeight = FontWeight.Medium) },
        text = if (message != null) {
            { Text(message, fontSize = 13.sp, lineHeight = 19.sp) }
        } else {
            null
        },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(confirmText, fontSize = 14.sp, color = confirmColor)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("取消", fontSize = 14.sp, color = colors.sub)
            }
        },
    )
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

fun Context.showToast(text: String) {
    Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
}
