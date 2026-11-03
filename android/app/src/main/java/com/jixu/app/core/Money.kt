package com.jixu.app.core

import kotlin.math.abs

/**
 * 金额工具 —— 逐行移植 `miniapp/src/utils/money.ts`（开发文档 §7.1）。
 * 只格式化数值本身（内部取绝对值），符号与「¥」由界面自己拼。
 */

/** 单笔金额上限（元）。个人记账场景足够宽裕，同时挡掉天文数字与精度陷阱 */
const val MAX_AMOUNT: Double = 999999999.99

/** 上限的可读文案（错误提示里用） */
const val MAX_AMOUNT_TEXT: String = "999,999,999.99"

/** 金额最多保留 2 位小数（分） */
const val AMOUNT_DECIMALS: Int = 2

/** 输入框里允许出现的整数位上限（10 位整数必然超过 MAX_AMOUNT，交给 parseAmountInput 明确拒绝） */
const val AMOUNT_MAX_INT_DIGITS: Int = 10

/** 输入框长度上限：10 位整数 + 小数点 + 2 位小数 */
const val AMOUNT_INPUT_MAX_LENGTH: Int = AMOUNT_MAX_INT_DIGITS + 1 + AMOUNT_DECIMALS

/** 超出可表达范围时的兜底文案（1e16 以上已无合适中文单位） */
private const val OVERFLOW_TEXT = ">9999万亿"

/** 非法 / 非有限值的占位文案 */
private const val INVALID_TEXT = "--"

/** 严格金额格式：0~9 位整数 + 可选「.0~2 位小数」（允许 `1.` / `.5` 这类中间态） */
private val STRICT_AMOUNT_RE = Regex("^\\d{0,9}(\\.\\d{0,2})?$")

private data class Tier(val div: Double, val suffix: String)

/** 中文金额单位分级表（从大到小） */
private val TIERS = listOf(
    Tier(1e12, "万亿"),
    Tier(1e8, "亿"),
    Tier(1e4, "万"),
    Tier(1.0, ""),
)

/** 是否是一个可用于记账的金额：有限、> 0、且不超过上限 */
fun isValidAmount(v: Double?): Boolean = v != null && v.isFinite() && v > 0 && v <= MAX_AMOUNT

/**
 * 累加安全化：先把每笔换算成「分」取整再相加，最后除回「元」。
 * 累加器刻意用 Double（与 JS 完全同值，1.1e125 这类历史脏值不会像 Long 那样溢出成乱数）。
 * 非有限值直接跳过（脏数据不参与合计）。
 */
fun sumAmounts(values: DoubleArray): Double {
    var cents = 0.0
    for (v in values) {
        if (!v.isFinite()) continue
        cents += jsRound(v * 100)
    }
    return cents / 100
}

/**
 * 金额输入实时净化：只保留数字与一个小数点，整数位 ≤ 10 位、小数位 ≤ 2 位。
 *
 * 科学计数法（`1e5` / `1E5`）整串清空而不是过滤字符：
 * 过滤会得到 `15`，把「十万」静默变成「十五」，比报错更危险。
 */
fun sanitizeAmountInput(raw: String?): String {
    if (raw.isNullOrEmpty()) return ""
    if (raw.indexOf('e') >= 0 || raw.indexOf('E') >= 0) return ""
    // 1) 去掉一切非数字 / 非小数点的字符（含 +、-、空格、逗号、字母）
    val digitsOnly = raw.filter { it in '0'..'9' || it == '.' }
    // 2) 只保留第一个小数点
    val dot = digitsOnly.indexOf('.')
    val s = if (dot >= 0) {
        digitsOnly.substring(0, dot + 1) + digitsOnly.substring(dot + 1).replace(".", "")
    } else {
        digitsOnly
    }
    val sDot = s.indexOf('.')
    val rawInt = if (sDot >= 0) s.substring(0, sDot) else s
    // 3) 去掉前导 0（至少保留一位），再截断到 10 位
    var start = 0
    while (start < rawInt.length - 1 && rawInt[start] == '0') start++
    val int = rawInt.substring(start).take(AMOUNT_MAX_INT_DIGITS)
    if (sDot < 0) return int
    return "$int.${s.substring(sDot + 1).take(AMOUNT_DECIMALS)}"
}

/** 金额解析结果 */
data class AmountParseResult(
    val ok: Boolean,
    /** 通过校验后的金额（已归一到 2 位小数）；不通过时为 0 */
    val value: Double,
    /** 不通过时的提示文案，通过时为空串 */
    val message: String,
)

/**
 * 严格解析金额输入 —— 这是唯一的「放行闸门」。
 * 不做字符级净化，直接用严格正则卡格式；校验 > 0、有限、≤ MAX_AMOUNT 三条边界。
 */
fun parseAmountInput(raw: String?): AmountParseResult {
    // 容忍用户粘贴时带上的千分位逗号与首尾空白
    val s = (raw ?: "").filter { it != ',' && !isJsWhitespace(it) }
    if (s.isEmpty() || s == ".") return AmountParseResult(false, 0.0, "请输入金额")
    if (!STRICT_AMOUNT_RE.matches(s)) {
        val n = jsNumber(s)
        // 位数超了但数值本身能读出来 —— 说明是「金额太大」，给更贴切的提示
        if (n.isFinite() && n > MAX_AMOUNT) {
            return AmountParseResult(false, 0.0, "单笔金额不能超过 $MAX_AMOUNT_TEXT")
        }
        return AmountParseResult(false, 0.0, "金额格式不正确")
    }
    val v = jsNumber(s)
    if (!v.isFinite()) return AmountParseResult(false, 0.0, "金额格式不正确")
    if (v <= 0) return AmountParseResult(false, 0.0, "金额需大于 0")
    if (v > MAX_AMOUNT) return AmountParseResult(false, 0.0, "单笔金额不能超过 $MAX_AMOUNT_TEXT")
    return AmountParseResult(true, jsRound(v * 100) / 100, "")
}

/** 千分位分组：`1234.56` → `1,234.56`（只处理绝对值，不处理负号） */
private fun groupThousands(s: String): String {
    val dot = s.indexOf('.')
    val int = if (dot >= 0) s.substring(0, dot) else s
    val frac = if (dot >= 0) s.substring(dot) else ""
    val sb = StringBuilder(int.length + int.length / 3 + frac.length)
    for (i in int.indices) {
        if (i > 0 && (int.length - i) % 3 == 0) sb.append(',')
        sb.append(int[i])
    }
    sb.append(frac)
    return sb.toString()
}

/**
 * 汇总类金额格式化：自动按 万 / 亿 / 万亿 分级缩写，千分位 + 小数位。
 *
 *   formatMoney(1234.5)      → "1,234.50"
 *   formatMoney(123456789)   → "1.23亿"
 *   formatMoney(2.2e125)     → ">9999万亿"
 *   formatMoney(Double.NaN)  → "--"
 */
fun formatMoney(value: Double, decimals: Int = AMOUNT_DECIMALS): String {
    val abs = abs(value)
    val dp = if (decimals in 0..6) decimals else AMOUNT_DECIMALS
    if (!abs.isFinite()) return INVALID_TEXT
    if (abs >= 1e16) return OVERFLOW_TEXT

    var idx = TIERS.indexOfFirst { abs >= it.div }
    if (idx < 0) idx = TIERS.lastIndex

    var tier = TIERS[idx]
    var scaled = jsToFixed(abs / tier.div, dp).toDouble()
    // 四舍五入后顶到上一级（如 99,999,999 算成 10000.00万）时自动进位单位
    if (scaled >= 1e4) {
        if (idx == 0) return OVERFLOW_TEXT
        idx -= 1
        tier = TIERS[idx]
        scaled = jsToFixed(abs / tier.div, dp).toDouble()
    }
    return groupThousands(jsToFixed(scaled, dp)) + tier.suffix
}

/** 明细类金额格式化：完整金额 + 千分位 + 2 位小数，不做万/亿缩写。 */
fun formatMoneyExact(value: Double): String {
    val abs = abs(value)
    if (!abs.isFinite()) return INVALID_TEXT
    if (abs >= 1e12) return formatMoney(abs)
    return groupThousands(jsToFixed(abs, AMOUNT_DECIMALS))
}

/** 该金额是否超出合理范围（用于标记历史脏数据） */
fun isSuspiciousAmount(v: Double): Boolean = !v.isFinite() || v > MAX_AMOUNT
