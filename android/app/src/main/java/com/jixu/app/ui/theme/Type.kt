package com.jixu.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * 「B · 夜航仪表」字体（B-SPEC §2）。
 *
 * 数字与英文微标签走等宽（[MonoFamily]），中文与正文走系统无衬线（[SansFamily]，
 * 即各厂商黑体栈：PingFang / HarmonyOS Sans / MiSans / 思源黑体…）。
 * 金额字距 -.02em，微标签 .12em + 全大写。
 */
val MonoFamily: FontFamily = FontFamily.Monospace
val SansFamily: FontFamily = FontFamily.SansSerif

/** 数字通用字形：等宽 + 表格数字 + 紧字距 */
fun numStyle(
    size: androidx.compose.ui.unit.TextUnit,
    weight: FontWeight = FontWeight.Light,
): TextStyle = TextStyle(
    fontFamily = MonoFamily,
    fontSize = size,
    fontWeight = weight,
    letterSpacing = (-0.02).em,
    fontFeatureSettings = "tnum",
)

/** 微标签：9sp 等宽、字距 .12em（全大写由调用方保证） */
val MicroStyle: TextStyle = TextStyle(
    fontFamily = MonoFamily,
    fontSize = 9.sp,
    lineHeight = 12.sp,
    fontWeight = FontWeight.Medium,
    letterSpacing = 0.12.em,
)

/** 模块标题：14sp / 700 */
val ModuleTitleStyle: TextStyle = TextStyle(
    fontFamily = SansFamily,
    fontSize = 14.sp,
    lineHeight = 20.sp,
    fontWeight = FontWeight.Bold,
)

/** 正文 13sp */
val BodyStyle: TextStyle = TextStyle(
    fontFamily = SansFamily,
    fontSize = 13.sp,
    lineHeight = 19.sp,
    fontWeight = FontWeight.Normal,
)

internal val BTypography = Typography(
    titleLarge = TextStyle(fontFamily = SansFamily, fontSize = 20.sp, lineHeight = 26.sp, fontWeight = FontWeight.Bold),
    titleMedium = TextStyle(fontFamily = SansFamily, fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.Bold),
    titleSmall = TextStyle(fontFamily = SansFamily, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Bold),
    bodyLarge = TextStyle(fontFamily = SansFamily, fontSize = 14.sp, lineHeight = 21.sp, fontWeight = FontWeight.Normal),
    bodyMedium = TextStyle(fontFamily = SansFamily, fontSize = 13.sp, lineHeight = 19.sp, fontWeight = FontWeight.Normal),
    bodySmall = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, lineHeight = 17.sp, fontWeight = FontWeight.Normal),
    labelLarge = TextStyle(fontFamily = SansFamily, fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.Medium),
    labelMedium = TextStyle(fontFamily = MonoFamily, fontSize = 11.sp, lineHeight = 15.sp, fontWeight = FontWeight.Normal),
    labelSmall = TextStyle(fontFamily = MonoFamily, fontSize = 9.sp, lineHeight = 12.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.12.em),
)
