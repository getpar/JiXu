package com.jixu.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

private val LocalJiXuColors = staticCompositionLocalOf { LightJiXuColors }

/** 语义色取值入口：[JiXuTheme.colors.xxx]，避免全工程散落硬编码颜色。 */
object JiXuTheme {
    val colors: JiXuColors
        @Composable
        @ReadOnlyComposable
        get() = LocalJiXuColors.current
}

/**
 * 外观三态（§9）：跟随系统 / 始终浅色 / 始终深色。
 * P0 先实现「跟随系统」，固定值在 P7 接 DataStore 后接入。
 */
@Composable
fun JiXuTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) DarkJiXuColors else LightJiXuColors
    val colorScheme = if (darkTheme) {
        darkColorScheme(
            primary = colors.accent,
            onPrimary = colors.bg,
            primaryContainer = colors.accentSoft,
            onPrimaryContainer = colors.accent,
            secondary = colors.accent2,
            onSecondary = colors.bg,
            background = colors.bg,
            onBackground = colors.text,
            surface = colors.card,
            onSurface = colors.text,
            surfaceVariant = colors.soft,
            onSurfaceVariant = colors.sub,
            outline = colors.line,
            error = colors.exp,
            onError = colors.bg,
            errorContainer = colors.expSoft,
            onErrorContainer = colors.exp,
            tertiary = colors.inc,
        )
    } else {
        lightColorScheme(
            primary = colors.accent,
            onPrimary = Color.White,
            primaryContainer = colors.accentSoft,
            onPrimaryContainer = colors.accent,
            secondary = colors.accent2,
            onSecondary = Color.White,
            background = colors.bg,
            onBackground = colors.text,
            surface = colors.card,
            onSurface = colors.text,
            surfaceVariant = colors.soft,
            onSurfaceVariant = colors.sub,
            outline = colors.line,
            error = colors.exp,
            onError = Color.White,
            errorContainer = colors.expSoft,
            onErrorContainer = colors.exp,
            tertiary = colors.inc,
        )
    }
    CompositionLocalProvider(LocalJiXuColors provides colors) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = JiXuTypography,
            content = content,
        )
    }
}
