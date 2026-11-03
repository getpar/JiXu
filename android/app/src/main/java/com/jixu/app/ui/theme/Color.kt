package com.jixu.app.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/**
 * 「靛」风格语义配色（开发文档 §9），浅色 / 深色各一套。
 * 界面一律通过 [JiXuTheme.colors] 取色，不要直接写死颜色值。
 */
@Immutable
data class JiXuColors(
    /** 页面底 */
    val bg: Color,
    /** 卡片 */
    val card: Color,
    /** 浅底块 / 轨道 */
    val soft: Color,
    /** 主文字 */
    val text: Color,
    /** 次级文字 */
    val sub: Color,
    /** 弱文字 */
    val muted: Color,
    /** 占位 */
    val faint: Color,
    /** 分隔线 */
    val line: Color,
    /** 主色 */
    val accent: Color,
    val accent2: Color,
    val accent3: Color,
    /** 标签底 */
    val accentSoft: Color,
    /** 主卡底 */
    val hero: Color,
    /** 支出红 / 浅底 */
    val exp: Color,
    val expSoft: Color,
    /** 收入绿 / 浅底 */
    val inc: Color,
    val incSoft: Color,
    /** 预警琥珀 / 浅底 */
    val warn: Color,
    val warnSoft: Color,
)

internal val LightJiXuColors = JiXuColors(
    bg = Color(0xFFF5F6F8),
    card = Color(0xFFFFFFFF),
    soft = Color(0xFFF1F2F5),
    text = Color(0xFF17181C),
    sub = Color(0xFF7A7F8A),
    muted = Color(0xFF9AA0AB),
    faint = Color(0xFFB9BEC8),
    line = Color(0xFFEAECF0),
    accent = Color(0xFF2E3A8C),
    accent2 = Color(0xFF6B74C4),
    accent3 = Color(0xFFA9AEE0),
    accentSoft = Color(0xFFEDEFF8),
    hero = Color(0xFF2E3A8C),
    exp = Color(0xFFC0453C),
    expSoft = Color(0xFFF8EDEC),
    inc = Color(0xFF2F7A5A),
    incSoft = Color(0xFFEAF3EE),
    warn = Color(0xFFB4823C),
    warnSoft = Color(0xFFF7F0E5),
)

internal val DarkJiXuColors = JiXuColors(
    bg = Color(0xFF0E0F13),
    card = Color(0xFF1A1C22),
    soft = Color(0xFF23262E),
    text = Color(0xFFE8E9EC),
    sub = Color(0xFF8A909C),
    muted = Color(0xFF6E7480),
    faint = Color(0xFF4E535E),
    line = Color(0xFF2A2D36),
    accent = Color(0xFF7C89E0),
    accent2 = Color(0xFF5D68C0),
    accent3 = Color(0xFF454E9E),
    accentSoft = Color(0xFF232A4D),
    hero = Color(0xFF2C3580),
    exp = Color(0xFFE07A72),
    expSoft = Color(0xFF3A2523),
    inc = Color(0xFF6FBF97),
    incSoft = Color(0xFF22362C),
    warn = Color(0xFFD3A45E),
    warnSoft = Color(0xFF362C1E),
)
