package com.jixu.app.core

import java.time.LocalDate
import java.util.Locale

/**
 * 日期工具 —— 移植 `miniapp/src/utils/dates.ts`（开发文档 §7.2）。
 * 一律按本机时区的年月日分量计算，绝不经过 UTC（中国 0~8 点会算成昨天）。
 */

/** 本机时区的 YYYY-MM-DD */
fun localDateStr(date: LocalDate = LocalDate.now()): String =
    String.format(Locale.ROOT, "%04d-%02d-%02d", date.year, date.monthValue, date.dayOfMonth)

/**
 * 向后推一个周期（周期账单与待办共用，三端同一算法）。
 * 月/年按月未对齐：1/31 + 1 月 = 2/28（闰年 2/29），2/29 + 1 年 = 次年 2/28。
 * 未知周期（含 `once`）原样返回（调用方的快进循环据此停止）。
 */
fun advanceDate(current: String, cycle: String): String {
    val parts = current.split('-')
    if (parts.size != 3) return current
    val y = parts[0].toIntOrNull() ?: return current
    val m = parts[1].toIntOrNull() ?: return current
    val d = parts[2].toIntOrNull() ?: return current
    val date = runCatching { LocalDate.of(y, m, d) }.getOrNull() ?: return current
    return when (cycle) {
        "daily" -> localDateStr(date.plusDays(1))
        "weekly" -> localDateStr(date.plusDays(7))
        "monthly" -> localDateStr(date.plusMonths(1))
        "yearly" -> localDateStr(date.plusYears(1))
        else -> current
    }
}
