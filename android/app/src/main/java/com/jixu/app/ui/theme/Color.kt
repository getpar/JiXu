package com.jixu.app.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/**
 * 「B · 夜航仪表」令牌（design-demos/B-SPEC.md §1）。
 *
 * 界面一律通过 [JiXuTheme.colors] 取色，不要在屏幕里写死十六进制。
 * 强调色（[acF] / [ac]）在屏幕上占比不得超过 5%：主按钮、当前读数、焦点环、今天。
 */
@Immutable
data class BColors(
    /** 当前是否深色（浅色下部分构件要做额外处理） */
    val dark: Boolean,
    /** 页面底 */
    val bg: Color,
    /** 面板 */
    val p1: Color,
    /** 面板浮起 / hover */
    val p2: Color,
    /** 按压 */
    val p3: Color,
    /** 发丝线 */
    val ln: Color,
    /** 强线 */
    val ln2: Color,
    /** 角标线 */
    val tick: Color,
    /** 主文字 */
    val tx: Color,
    /** 次文字 */
    val dim: Color,
    /** 弱文字 */
    val fnt: Color,
    /** 强调描边 / 文字 */
    val ac: Color,
    /** 强调填充 */
    val acF: Color,
    /** 强调上的字 */
    val onAc: Color,
    /** 强调底 */
    val acS: Color,
    /** 警示 */
    val amb: Color,
    val ambS: Color,
    /** 危险 */
    val cor: Color,
    val corS: Color,
    /** 收入 */
    val inc: Color,
    val incS: Color,
    /** 网格线 */
    val grid: Color,
    /** 键盘键底 */
    val key: Color,
    val keyB: Color,
    val keyLo: Color,
    /** 数码管底 / 字 */
    val lcd: Color,
    val lcdT: Color,
)

/** 深色（默认，主推） */
val BDarkColors = BColors(
    dark = true,
    bg = Color(0xFF0A0B0D),
    p1 = Color(0xFF111316),
    p2 = Color(0xFF171A1E),
    p3 = Color(0xFF1D2126),
    ln = Color(0x14FFFFFF),
    ln2 = Color(0x26FFFFFF),
    tick = Color(0x6BFFFFFF),
    tx = Color(0xFFE9EBEE),
    dim = Color(0xFF8B919A),
    fnt = Color(0xFF5C626B),
    ac = Color(0xFFD4FF3F),
    acF = Color(0xFFD4FF3F),
    onAc = Color(0xFF0A0B0D),
    acS = Color(0x1FD4FF3F),
    amb = Color(0xFFFFB020),
    ambS = Color(0x1FFFB020),
    cor = Color(0xFFFF6B57),
    corS = Color(0x21FF5B45),
    inc = Color(0xFF3FE0A5),
    incS = Color(0x1F3FE0A5),
    grid = Color(0x0BFFFFFF),
    key = Color(0xFF1A1D22),
    keyB = Color(0x1AFFFFFF),
    keyLo = Color(0xFF08090B),
    lcd = Color(0xFF0D0F0B),
    lcdT = Color(0xFFD4FF3F),
)

/** 小程序「靛」浅色（来源：miniapp/src/app.scss） */
val MiniLightColors = BColors(
    dark = false,
    bg = Color(0xFFF5F6F8),
    p1 = Color(0xFFFFFFFF),
    p2 = Color(0xFFF1F2F5),
    p3 = Color(0xFFEAECF0),
    ln = Color(0xFFEAECF0),
    ln2 = Color(0xFFD9DDE5),
    tick = Color(0x00000000),
    tx = Color(0xFF17181C),
    dim = Color(0xFF7A7F8A),
    fnt = Color(0xFF9AA0AB),
    ac = Color(0xFF2E3A8C),
    acF = Color(0xFF2E3A8C),
    onAc = Color(0xFFFFFFFF),
    acS = Color(0xFFEDEFF8),
    amb = Color(0xFFB4823C),
    ambS = Color(0xFFF7F0E5),
    cor = Color(0xFFC0453C),
    corS = Color(0xFFF8EDEC),
    inc = Color(0xFF2F7A5A),
    incS = Color(0xFFEAF3EE),
    grid = Color(0xFFF1F2F5),
    key = Color(0xFFF1F2F5),
    keyB = Color(0xFFEAECF0),
    keyLo = Color(0xFFE7E9EE),
    lcd = Color(0xFFFFFFFF),
    lcdT = Color(0xFF2E3A8C),
)

/** 小程序「靛」深色（来源：miniapp/src/app.scss .theme-dark） */
val MiniDarkColors = BColors(
    dark = true,
    bg = Color(0xFF0E0F13),
    p1 = Color(0xFF1A1C22),
    p2 = Color(0xFF23262E),
    p3 = Color(0xFF2A2D36),
    ln = Color(0xFF2A2D36),
    ln2 = Color(0xFF3A3E48),
    tick = Color(0x00000000),
    tx = Color(0xFFE8E9EC),
    dim = Color(0xFF8A909C),
    fnt = Color(0xFF6E7480),
    ac = Color(0xFF7C89E0),
    acF = Color(0xFF7C89E0),
    onAc = Color(0xFFFFFFFF),
    acS = Color(0xFF232A4D),
    amb = Color(0xFFD3A45E),
    ambS = Color(0xFF362C1E),
    cor = Color(0xFFE07A72),
    corS = Color(0xFF3A2523),
    inc = Color(0xFF6FBF97),
    incS = Color(0xFF22362C),
    grid = Color(0xFF23262E),
    key = Color(0xFF23262E),
    keyB = Color(0xFF2A2D36),
    keyLo = Color(0xFF23262E),
    lcd = Color(0xFF1A1C22),
    lcdT = Color(0xFFE8E9EC),
)

/** 浅色（同等完成度，不是深色的反相） */
val BLightColors = BColors(
    dark = false,
    bg = Color(0xFFE6E7E2),
    p1 = Color(0xFFF8F8F5),
    p2 = Color(0xFFF0F1EC),
    p3 = Color(0xFFE8E9E4),
    ln = Color(0x1A000000),
    ln2 = Color(0x2E000000),
    tick = Color(0x80000000),
    tx = Color(0xFF0C0D0F),
    dim = Color(0xFF585D65),
    fnt = Color(0xFF9A9EA4),
    ac = Color(0xFF4B6400),
    acF = Color(0xFFD4FF3F),
    onAc = Color(0xFF0C0D0F),
    acS = Color(0x174B6400),
    amb = Color(0xFF8F5300),
    ambS = Color(0x33FFB020),
    cor = Color(0xFFC2301C),
    corS = Color(0x21FF5B45),
    inc = Color(0xFF0A7452),
    incS = Color(0x2E3FE0A5),
    grid = Color(0x0D000000),
    key = Color(0xFFFBFBF9),
    keyB = Color(0x24000000),
    keyLo = Color(0xFFC9CBC4),
    lcd = Color(0xFF1A1C14),
    lcdT = Color(0xFFD4FF3F),
)
