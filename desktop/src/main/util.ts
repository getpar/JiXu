/** v0.7.3 实体云同步标识：d_ + 时间戳 + 随机段（与小程序端字符串 id 同属不透明串，不冲突） */
export function newEntityId(): string {
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 本地时区的 YYYY-MM-DD（v0.6.8 修时区 bug：toISOString 是 UTC 日期，凌晨 0~8 点会算成昨天） */
export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 向后推一个周期（与小程序 storage.advanceDate 同算法）：月末对齐——1/31 + 1 个月 = 2/28（闰年 2/29），
 *  2/29 + 1 年 = 次年 2/28；旧版 setMonth 会溢出成 3/3，二月那一期整期被跳过 */
export function getNextDate(current: string, cycle: string): string {
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
