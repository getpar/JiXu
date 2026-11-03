package com.jixu.app.core

import java.math.BigDecimal
import java.math.MathContext
import java.math.RoundingMode
import kotlin.math.abs
import kotlin.math.roundToLong

/**
 * JS 数字语义（开发文档 §6.3、§7.1）：
 * - [jsNumberToString]：复刻 ECMAScript Number::toString，`25` 而不是 `25.0`、`1.1e+125` 带加号
 * - [jsToFixed]：复刻 `Number.prototype.toFixed`（按 double 精确值四舍五入）
 * - [jsRound]：复刻 `Math.round`（0.5 向正无穷，结果为 double）
 * - [jsNumber]：复刻 `Number(s)` 的常见十进制解析
 */

private val JS_NUMBER_RE = Regex("^[+-]?(\\d+\\.?\\d*|\\.\\d+)([eE][+-]?\\d+)?$")

/** 复刻 ECMAScript Number::toString（金额专用；金标准 amountToKeyString 验收） */
fun jsNumberToString(v: Double): String {
    if (v.isNaN()) return "NaN"
    if (v.isInfinite()) return if (v > 0) "Infinity" else "-Infinity"
    if (v == 0.0) return "0"
    if (v < 0) return "-" + jsNumberToString(-v)
    // 快路径：合法金额（≤2 位小数、远小于上限）——十进制两位小数的最近 double，JS 最短表示就是它本身
    if (v < 1e13) {
        val cents = (v * 100).roundToLong()
        if (cents / 100.0 == v) return BigDecimal.valueOf(cents, 2).stripTrailingZeros().toPlainString()
    }
    // 通用路径（历史脏数据）：取能原样还原这个 double 的最短十进制数字串（1~17 位逐个试），再按 ECMAScript 规则排版。
    // 不能用 Double.toString 取数字：JDK 18 及更早不保证最短（实测 JDK 17 把 6.785272955894471E18 多打一位），安卓同类实现也不能指望
    val exact = BigDecimal(v)
    var bd = exact
    for (p in 1..17) {
        val c = exact.round(MathContext(p, RoundingMode.HALF_EVEN))
        if (c.toDouble() == v) {
            bd = c
            break
        }
    }
    bd = bd.stripTrailingZeros()
    val digits = bd.unscaledValue().toString()
    val k = digits.length
    val n = k - bd.scale() // 值 = 0.digits × 10^n
    return when {
        n in k..21 -> digits + "0".repeat(n - k)
        n in 1..21 -> digits.substring(0, n) + "." + digits.substring(n)
        n in -5..0 -> "0." + "0".repeat(-n) + digits
        else -> {
            val e = n - 1
            (if (k == 1) digits else "${digits[0]}." + digits.substring(1)) +
                "e" + (if (e >= 0) "+" else "-") + abs(e)
        }
    }
}

/**
 * 复刻 `x.toFixed(digits)`。
 * 必须用 `BigDecimal(Double)` 构造（按 double 精确值四舍五入）：
 * `1.005 → "1.00"`、`0.005 → "0.01"`。不能用 `BigDecimal.valueOf`。
 */
fun jsToFixed(x: Double, digits: Int): String =
    BigDecimal(x).setScale(digits, RoundingMode.HALF_UP).toPlainString()

/**
 * 复刻 `Math.round(x)`：0.5 向正无穷，结果仍是 double。
 * 天文数字（历史脏数据）原样返回，避免溢出。
 */
fun jsRound(x: Double): Double =
    if (x.isNaN() || x.isInfinite() || abs(x) >= 4.503599627370496E15) x else Math.round(x).toDouble()

/** JS `\s` 的完整集合（含全角空格、NBSP 等；Java 的 isWhitespace 不含 \u00A0） */
internal fun isJsWhitespace(c: Char): Boolean =
    c in '\u0009'..'\u000D' || c == ' ' || c == '\u00A0' || c == '\u1680' ||
        c in '\u2000'..'\u200A' || c == '\u2028' || c == '\u2029' || c == '\u202F' ||
        c == '\u205F' || c == '\u3000' || c == '\uFEFF'

/** 复刻 JS `Number(s)` 的常见十进制解析（不认 Java 独有的 `12d` / `1f` 写法，也不复刻 0x 进制）。 */
fun jsNumber(raw: String): Double {
    val s = raw.trim { isJsWhitespace(it) }
    if (s.isEmpty()) return 0.0 // JS: Number('') === 0
    if (s == "Infinity" || s == "+Infinity") return Double.POSITIVE_INFINITY
    if (s == "-Infinity") return Double.NEGATIVE_INFINITY
    if (!JS_NUMBER_RE.matches(s)) return Double.NaN
    return s.toDoubleOrNull() ?: Double.NaN
}
