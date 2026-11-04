/**
 * 日期工具（纯 TS，零 Taro 依赖：可在 Node 里直接跑，Android 端金标准用例也从这里导出）
 */

/** 本地时区的 YYYY-MM-DD（v0.6.8 修 iOS/安卓通用时区 bug：
 * toISOString 是 UTC 日期，中国每天 0~8 点会算成"昨天"，导致记账/周期推算日期错位） */
export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 向后推一个周期（周期账单与待办共用，桌面端 getNextDate 同算法）。
 * v0.9.6 月末对齐：1/31 + 1 个月 = 2/28（闰年 2/29），2/29 + 1 年 = 次年 2/28。
 * 旧版直接 setMonth 会溢出成 3/3，二月那一期整期被跳过。
 * 按本地年月日分量计算，不经过 new Date('YYYY-MM-DD')（那是 UTC 零点）。
 * 未知周期原样返回（调用方的快进循环据此停止）。
 */
export function advanceDate(current: string, cycle: string): string {
  const [y, m, d] = current.split('-').map(Number)
  const lastDay = (year: number, month0: number): number => new Date(year, month0 + 1, 0).getDate()
  switch (cycle) {
    case 'daily': return localDateStr(new Date(y, m - 1, d + 1))
    case 'weekly': return localDateStr(new Date(y, m - 1, d + 7))
    case 'monthly': return localDateStr(new Date(y, m, Math.min(d, lastDay(y, m))))
    case 'yearly': return localDateStr(new Date(y + 1, m - 1, Math.min(d, lastDay(y + 1, m - 1))))
    default: return current
  }
}
