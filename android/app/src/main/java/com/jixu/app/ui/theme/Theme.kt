package com.jixu.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** 界面风格：夜航仪表（现有）/ 小程序靛风（新增）。 */
enum class UiStyle {
    INSTRUMENT,
    MINIAPP;

    companion object {
        fun fromPref(value: String?): UiStyle =
            if (value == "miniapp") MINIAPP else INSTRUMENT
    }
}

/** 仪表盘风格全局圆角只用 2dp（B-SPEC §4）。 */
val BShape = RoundedCornerShape(2.dp)

private val LocalBColors = staticCompositionLocalOf { BLightColors }
private val LocalUiStyle = staticCompositionLocalOf { UiStyle.INSTRUMENT }

/** 语义色入口：[JiXuTheme.colors.xxx]；[JiXuTheme.dark] 判断当前明暗。 */
object JiXuTheme {
    val colors: BColors
        @Composable
        @ReadOnlyComposable
        get() = LocalBColors.current

    val dark: Boolean
        @Composable
        @ReadOnlyComposable
        get() = LocalBColors.current.dark

    val style: UiStyle
        @Composable
        @ReadOnlyComposable
        get() = LocalUiStyle.current

    /** 卡片圆角：仪表风直角，小程序风大圆角。 */
    val cardShape: RoundedCornerShape
        @Composable
        @ReadOnlyComposable
        get() = if (style == UiStyle.MINIAPP) RoundedCornerShape(16.dp) else RoundedCornerShape(2.dp)

    /** 小程序风隐藏模块编号/英文微标签。 */
    val showModuleCodes: Boolean
        @Composable
        @ReadOnlyComposable
        get() = style == UiStyle.INSTRUMENT
}

/**
 * 外观三态（跟随系统 / 始终浅色 / 始终深色）由 MainActivity 解析偏好后传 [darkTheme]，
 * 首帧前就读过偏好，所以不会出现先亮后暗的闪屏。
 * [uiStyle] 决定视觉体系（仪表 / 小程序），两套风格共用业务与数据结构。
 */
@Composable
fun JiXuTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    uiStyle: UiStyle = UiStyle.INSTRUMENT,
    content: @Composable () -> Unit,
) {
    val colors = when (uiStyle) {
        UiStyle.INSTRUMENT -> if (darkTheme) BDarkColors else BLightColors
        UiStyle.MINIAPP -> if (darkTheme) MiniDarkColors else MiniLightColors
    }
    val scheme = if (darkTheme) {
        darkColorScheme(
            primary = colors.acF,
            onPrimary = colors.onAc,
            primaryContainer = colors.acS,
            onPrimaryContainer = colors.ac,
            secondary = colors.inc,
            onSecondary = colors.onAc,
            background = colors.bg,
            onBackground = colors.tx,
            surface = colors.p1,
            onSurface = colors.tx,
            surfaceVariant = colors.p2,
            onSurfaceVariant = colors.dim,
            surfaceTint = Color.Transparent,
            surfaceContainerLowest = colors.bg,
            surfaceContainerLow = colors.p1,
            surfaceContainer = colors.p1,
            surfaceContainerHigh = colors.p2,
            surfaceContainerHighest = colors.p3,
            outline = colors.ln2,
            outlineVariant = colors.ln,
            error = colors.cor,
            onError = colors.onAc,
            errorContainer = colors.corS,
            onErrorContainer = colors.cor,
            tertiary = colors.amb,
            scrim = Color.Black,
        )
    } else {
        lightColorScheme(
            primary = colors.ac,
            onPrimary = Color(0xFFFFFFFF),
            primaryContainer = colors.acS,
            onPrimaryContainer = colors.ac,
            secondary = colors.inc,
            onSecondary = Color(0xFFFFFFFF),
            background = colors.bg,
            onBackground = colors.tx,
            surface = colors.p1,
            onSurface = colors.tx,
            surfaceVariant = colors.p2,
            onSurfaceVariant = colors.dim,
            surfaceTint = Color.Transparent,
            surfaceContainerLowest = colors.bg,
            surfaceContainerLow = colors.p1,
            surfaceContainer = colors.p1,
            surfaceContainerHigh = colors.p2,
            surfaceContainerHighest = colors.p3,
            outline = colors.ln2,
            outlineVariant = colors.ln,
            error = colors.cor,
            onError = Color(0xFFFFFFFF),
            errorContainer = colors.corS,
            onErrorContainer = colors.cor,
            tertiary = colors.amb,
            scrim = Color.Black,
        )
    }
    val shape = if (uiStyle == UiStyle.MINIAPP) RoundedCornerShape(14.dp) else BShape
    val shapes = Shapes(
        extraSmall = shape,
        small = shape,
        medium = shape,
        large = shape,
        extraLarge = shape,
    )
    CompositionLocalProvider(
        LocalBColors provides colors,
        LocalUiStyle provides uiStyle,
    ) {
        MaterialTheme(
            colorScheme = scheme,
            typography = BTypography,
            shapes = shapes,
            content = content,
        )
    }
}
