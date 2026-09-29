/**
 * 金额工具（v0.9.5）
 *
 * 背景 —— 本次修的 bug：
 * 1. 展示层原来直接写 `(abs / 1e8).toFixed(2) + '亿'`。按 ECMAScript 规范，
 *    `Number.prototype.toFixed()` 在 |值| ≥ 1e21 时会退化成 `toString()`，
 *    于是输出 `2.224444444444444e+117亿` 这种科学计数法，直接暴露给用户。
 * 2. 输入侧没有任何上限 / 格式校验，可以存进天文数字（线上已出现 1.1e125 的记录）。
 * 3. 金额以 float64 累加会漂（0.1 + 0.2 = 0.30000000000000004）。
 *
 * 约定：
 * - `formatMoney` / `formatMoneyExact` 只格式化**数值本身（内部取绝对值）**，
 *   符号（+ / -）和「¥」由调用方自己拼 —— 与改造前的调用点保持一致。
 * - 任何非有限值（NaN / Infinity）一律输出 `--`，绝不把脏数据透出成乱码。
 */

/** 单笔金额上限（元）。个人记账场景足够宽裕，同时挡掉天文数字与精度陷阱 */
export const MAX_AMOUNT = 999999999.99
/** 上限的可读文案（错误提示里用） */
export const MAX_AMOUNT_TEXT = '999,999,999.99'
/** 金额最多保留 2 位小数（分） */
export const AMOUNT_DECIMALS = 2
/**
 * 输入框里允许出现的整数位上限。
 * 取 10 而不是 9 是刻意的：10 位整数（1,000,000,000 起）**必然**超过 MAX_AMOUNT，
 * 所以超限输入只会被 `parseAmountInput` 明确拒绝，而不会被静默截断成另一个「看起来合法」的金额。
 */
export const AMOUNT_MAX_INT_DIGITS = 10
/** 输入框长度上限：10 位整数 + 小数点 + 2 位小数 */
export const AMOUNT_INPUT_MAX_LENGTH = AMOUNT_MAX_INT_DIGITS + 1 + AMOUNT_DECIMALS
/** 超出可表达范围时的兜底文案（1e16 以上已无合适中文单位） */
const OVERFLOW_TEXT = '>9999万亿'
/** 非法 / 非有限值的占位文案 */
const INVALID_TEXT = '--'

/** 是否是一个可用于记账的金额：有限、> 0、且不超过上限 */
export function isValidAmount(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_AMOUNT
}

/**
 * 累加安全化：先把每笔换算成「分」取整再相加，最后除回「元」。
 * 这样能消掉 0.1 + 0.2 这类浮点累加误差，且**不改动已有存储格式**。
 * 非有限值直接跳过（脏数据不参与合计）。
 */
export function sumAmounts(list: ArrayLike<number>): number {
  let cents = 0
  for (let i = 0; i < list.length; i++) {
    const v = list[i]
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    cents += Math.round(v * 100)
  }
  return cents / 100
}

/**
 * 金额输入实时净化：只保留数字与一个小数点，整数位 ≤ 10 位、小数位 ≤ 2 位。
 * 用在 Input 的 onInput 上，边输边纠 —— 挡掉 `12.3.4`、超长粘贴、脏字符。
 * 允许中间态（如 `1.`），最终由 `parseAmountInput` 兜底。
 *
 * ⚠️ 科学计数法（`1e5` / `1E5`）**整串清空**而不是过滤字符：
 * 过滤会得到 `15`，把「十万」静默变成「十五」，比报错更危险。
 *
 * ⚠️ 这里只做「字符级」纠正，**不做数值级截断**。像 1,000,000,000 这种超限金额
 * 会原样留在输入框里，由提交时的 `parseAmountInput` 明确报「不能超过上限」，
 * 而不是悄悄截成 1 亿 —— 静默改小金额比拒绝保存更误导用户。
 */
export function sanitizeAmountInput(raw: string): string {
  if (!raw) return ''
  const src = String(raw)
  if (/[eE]/.test(src)) return ''
  // 1) 去掉一切非数字 / 非小数点的字符（含 +、-、空格、逗号、字母）
  let s = src.replace(/[^\d.]/g, '')
  // 2) 只保留第一个小数点
  const dot = s.indexOf('.')
  if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '')
  // 3) 拆整数位 / 小数位，各自截断
  const parts = s.split('.')
  const int = (parts[0] || '').replace(/^0+(?=\d)/, '').slice(0, AMOUNT_MAX_INT_DIGITS)
  if (dot < 0) return int
  return `${int}.${(parts[1] || '').slice(0, AMOUNT_DECIMALS)}`
}

export interface AmountParseResult {
  ok: boolean
  /** 通过校验后的金额（已归一到 2 位小数）；不通过时为 0 */
  value: number
  /** 不通过时的提示文案，通过时为空串 */
  message: string
}

/** 严格金额格式：0~9 位整数 + 可选「.0~2 位小数」（允许 `1.` / `.5` 这类中间态） */
const STRICT_AMOUNT_RE = /^\d{0,9}(\.\d{0,2})?$/

/**
 * 严格解析金额输入 —— 这是唯一的「放行闸门」。
 *
 * 与 `parseFloat` 的区别：
 * - **不做字符级净化**，直接用严格正则卡格式：`12.3.4` / `1e5` / `abc` 一律拒绝，
 *   不会像 `parseFloat('12.3.4') === 12.3` 那样蒙混过关
 * - 校验 > 0、有限、≤ MAX_AMOUNT 三条边界；超过上限给明确文案，
 *   **绝不静默截断成另一个合法金额**
 * - 通过后归一到 2 位小数，顺手消掉 0.30000000000000004 这类浮点尾巴
 */
export function parseAmountInput(raw: string): AmountParseResult {
  // 容忍用户粘贴时带上的千分位逗号与首尾空白
  const s = String(raw == null ? '' : raw).replace(/[,\s]/g, '')
  if (!s || s === '.') return { ok: false, value: 0, message: '请输入金额' }
  if (!STRICT_AMOUNT_RE.test(s)) {
    const n = Number(s)
    // 位数超了但数值本身能读出来 —— 说明是「金额太大」，给更贴切的提示
    if (Number.isFinite(n) && n > MAX_AMOUNT) {
      return { ok: false, value: 0, message: `单笔金额不能超过 ${MAX_AMOUNT_TEXT}` }
    }
    return { ok: false, value: 0, message: '金额格式不正确' }
  }
  const v = Number(s)
  if (!Number.isFinite(v)) return { ok: false, value: 0, message: '金额格式不正确' }
  if (v <= 0) return { ok: false, value: 0, message: '金额需大于 0' }
  if (v > MAX_AMOUNT) return { ok: false, value: 0, message: `单笔金额不能超过 ${MAX_AMOUNT_TEXT}` }
  return { ok: true, value: Math.round(v * 100) / 100, message: '' }
}

/** 千分位分组：`1234.56` → `1,234.56`（只处理绝对值，不处理负号） */
function groupThousands(s: string): string {
  const [i, d] = s.split('.')
  const head = (i || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return d === undefined ? head : `${head}.${d}`
}

/** 中文金额单位分级表（从大到小） */
const TIERS: Array<{ div: number; suffix: string }> = [
  { div: 1e12, suffix: '万亿' },
  { div: 1e8, suffix: '亿' },
  { div: 1e4, suffix: '万' },
  { div: 1, suffix: '' },
]

/**
 * 汇总类金额格式化：自动按 万 / 亿 / 万亿 分级缩写，千分位 + 2 位小数。
 * 这是修「科学计数法」的核心函数 —— 因为分级后待格式化的数永远 < 1e4，
 * 远低于 `toFixed` 退化阈值 1e21，从根上不可能再输出 `e+117`。
 *
 *   formatMoney(1234.5)        → '1,234.50'
 *   formatMoney(123456789)     → '1.23亿'
 *   formatMoney(2.2e125)       → '>9999万亿'
 *   formatMoney(NaN)           → '--'
 *   formatMoney(123456789, 1)  → '1.2亿'   （图表标签可用 1 位小数）
 */
export function formatMoney(val: number, decimals: number = AMOUNT_DECIMALS): string {
  const abs = Math.abs(Number(val))
  const dp = decimals >= 0 && decimals <= 6 ? decimals : AMOUNT_DECIMALS
  if (!Number.isFinite(abs)) return INVALID_TEXT
  if (abs >= 1e16) return OVERFLOW_TEXT

  let idx = TIERS.findIndex((t) => abs >= t.div)
  if (idx < 0) idx = TIERS.length - 1

  let tier = TIERS[idx]
  let scaled = Number((abs / tier.div).toFixed(dp))
  // 四舍五入后顶到上一级（如 99,999,999 算成 10000.00万）时自动进位单位，避免出现「10000.00万」
  if (scaled >= 1e4) {
    if (idx === 0) return OVERFLOW_TEXT
    idx -= 1
    tier = TIERS[idx]
    scaled = Number((abs / tier.div).toFixed(dp))
  }
  return groupThousands(scaled.toFixed(dp)) + tier.suffix
}

/**
 * 明细类金额格式化：完整金额 + 千分位 + 2 位小数，**不做万/亿缩写**（账单列表里用户要看准确数）。
 * 仅在超过 1e12（历史脏数据才可能到）时降级走 `formatMoney`，避免长串误导。
 *
 *   formatMoneyExact(123456)  → '123,456.00'
 *   formatMoneyExact(1.1e125) → '>9999万亿'
 */
export function formatMoneyExact(val: number): string {
  const abs = Math.abs(Number(val))
  if (!Number.isFinite(abs)) return INVALID_TEXT
  if (abs >= 1e12) return formatMoney(abs)
  return groupThousands(abs.toFixed(AMOUNT_DECIMALS))
}

/** 该金额是否超出合理范围（用于标记历史脏数据） */
export function isSuspiciousAmount(v: unknown): boolean {
  return typeof v === 'number' && (!Number.isFinite(v) || v > MAX_AMOUNT)
}
