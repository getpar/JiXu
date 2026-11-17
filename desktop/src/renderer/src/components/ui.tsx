import React from 'react'
import { formatMoney, formatMoneyExact } from '../utils/money'

/* ---------- icons: 20px grid, 1.5 monoline ---------- */
const C = (x: number, y: number, r: number): string =>
  `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`

export const ICON: Record<string, string | [string, string]> = {
  home: 'M4.3 14.6A6.6 6.6 0 1 1 15.7 14.6M10 10.4l3-3.4M3.5 17h13',
  add: 'M10 4.5v11M4.5 10h11',
  log: 'M7.5 5.5h9M7.5 10h9M7.5 14.5h6M3.5 5.5h.01M3.5 10h.01M3.5 14.5h.01',
  stats: 'M3.5 16.5h13M5.5 13.5v-3M9 13.5v-8M12.5 13.5v-5.5M16 13.5V11',
  more: 'M4 4h4.5v4.5H4zM11.5 4H16v4.5h-4.5zM4 11.5h4.5V16H4zM11.5 11.5H16V16h-4.5z',
  cyc: 'M15.6 8.2A6 6 0 0 0 4.7 7M4.4 3.8V7h3.2M4.4 11.8a6 6 0 0 0 10.9 1.2M15.6 16.2V13h-3.2',
  todo: 'M4 4h12v12H4zM7.2 10.2l2 2 3.8-4.2',
  tag: 'M3.5 3.5h6.2l6.8 6.8-6.2 6.2-6.8-6.8zM7 7h.01',
  trash: 'M4 6h12M8 6V3.8h4V6M5.8 6l.8 10.2h6.8L14.2 6M8.6 9v4.4M11.4 9v4.4',
  exp: 'M10 12.5V3.5M6.5 7 10 3.5 13.5 7M4 11.5v4.5h12v-4.5',
  db: 'M4.5 5.5c0-1.1 2.5-2 5.5-2s5.5.9 5.5 2-2.5 2-5.5 2-5.5-.9-5.5-2zM4.5 5.5v9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-9M4.5 10c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2',
  up: 'M10 11v5.5M7 16.5h6M7.2 7.8a4 4 0 0 1 5.6 0M4.9 5.5a7.2 7.2 0 0 1 10.2 0' + C(10, 10.3, 0.8),
  theme: [C(10, 10, 6.5), 'M10 3.5a6.5 6.5 0 0 0 0 13z'],
  kb: 'M2.5 5.5h15v9h-15zM5.5 8.5h.01M8.5 8.5h.01M11.5 8.5h.01M14.5 8.5h.01M7 11.5h6',
  search: C(9, 9, 5.2) + 'M13 13l3.5 3.5',
  rcpt: 'M5.5 3h9v14l-1.8-1.2-1.8 1.2-1.8-1.2-1.8 1.2-1.8-1.2-1.8 1.2zM8 7h4M8 10h4M8 13h2',
  edit: 'M4 16l.8-3.6 8.4-8.4 2.8 2.8-8.4 8.4zM11.6 5.6l2.8 2.8',
  x: 'M5.5 5.5l9 9M14.5 5.5l-9 9',
  l: 'M12 4.5 6.5 10l5.5 5.5',
  r: 'M8 4.5l5.5 5.5L8 15.5',
  ok: 'M4.5 10.5l3.5 3.5 7.5-8',
  bs: 'M7.5 4.5h9v11h-9L3 10zM10 8l4 4M14 8l-4 4',
  cal: 'M3.5 5h13v11.5h-13zM3.5 8.5h13M7 3v3.5M13 3v3.5',
  cam: 'M3 6.5h3l1.5-2h5l1.5 2h3v9.5H3z' + C(10, 11, 2.8),
  restore: 'M5 8.5 2.5 6 5 3.5M2.5 6h9a5 5 0 0 1 0 10h-4',
  copy: 'M7 7h9v9H7zM4 13V4h9',
  refresh: 'M4.6 9A5.5 5.5 0 0 1 15 7.2M15.4 4v3.6h-3.4M15.4 11a5.5 5.5 0 0 1-10.4 1.8M4.6 16v-3.6h3.4',
  down: 'M10 3.5v9M6.5 9l3.5 3.5L13.5 9M4 15.5h12',
  clock: C(10, 10, 6.5) + 'M10 6.5V10l2.4 1.6',
  lock: 'M5.5 9V7a4.5 4.5 0 0 1 9 0v2M4 9h12v7.5H4z',
}

export const CAT_ICON: Record<string, string> = {
  food: 'M3 10.5h14c0 3.6-3.1 6-7 6s-7-2.4-7-6zM11.2 3.5 8.8 8M15.5 4l-4 4',
  transport:
    'M5.5 3.5h9a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2zM3.5 9.5h13M7 12.3h.01M13 12.3h.01M6.5 15l-1.5 2.5M13.5 15l1.5 2.5',
  shopping: 'M4.5 7h11l-1 9.5h-9zM7.5 7V6a2.5 2.5 0 0 1 5 0v1',
  housing: 'M3 9.2 10 3.5l7 5.7M5 7.8v8.7h10V7.8M8.5 16.5v-4h3v4',
  entertainment: 'M8 14.5V5l8-1.5V13' + C(6.3, 14.5, 1.7) + C(14.3, 13, 1.7),
  medical: 'M4 4h12v12H4zM10 7v6M7 10h6',
  education:
    'M10 5.5C8.2 4.2 6 3.7 3.5 4v11c2.5-.3 4.7.2 6.5 1.5 1.8-1.3 4-1.8 6.5-1.5V4c-2.5-.3-4.7.2-6.5 1.5zM10 5.5v11',
  social:
    'M3.5 8h13v3h-13zM4.5 11v5.5h11V11M10 8v8.5M10 8C8.6 5.2 6.2 4.8 6.2 6.4S8.4 8 10 8c1.6 0 3.8 0 3.8-1.6S11.4 5.2 10 8z',
  finance: C(10, 10, 6.5) + 'M7.5 6.8 10 9.6l2.5-2.8M10 9.6v4.6M7.6 10.8h4.8M7.6 12.6h4.8',
  pet: C(5.8, 8.3, 1.3) +
    C(8.6, 5.6, 1.3) +
    C(11.4, 5.6, 1.3) +
    C(14.2, 8.3, 1.3) +
    'M10 10.3c-2.5 0-4.4 2.6-4.4 4.4 0 1.3 1 1.8 2.2 1.6.9-.2 1.4-.5 2.2-.5s1.3.3 2.2.5c1.2.2 2.2-.3 2.2-1.6 0-1.8-1.9-4.4-4.4-4.4z',
  other: 'M3.5 6.5 10 3.5l6.5 3v7L10 16.5l-6.5-3zM3.5 6.5 10 9.5l6.5-3M10 9.5v7',
  income: 'M10 3.5v9M6.5 9l3.5 3.5L13.5 9M4 15.5h12',
}

/** 自定义 CSS 变量写进 inline style：React 的 CSSProperties 不含自定义属性，这里只做一次窄化 */
export const cssVar = (name: string, value: string | number): React.CSSProperties =>
  ({ [name]: value }) as unknown as React.CSSProperties

export function Icon({ n, cls }: { n: string; cls?: string }): JSX.Element {
  const p = ICON[n] ?? ICON.other
  return (
    <svg className={`i ${cls || ''}`} viewBox="0 0 20 20" aria-hidden="true">
      {Array.isArray(p) ? (
        <>
          <path d={p[0]} />
          <path className="f" d={p[1]} />
        </>
      ) : (
        <path d={p} />
      )}
    </svg>
  )
}

export function CatIcon({ k, cls }: { k: string; cls?: string }): JSX.Element {
  return (
    <svg className={`i ${cls || ''}`} viewBox="0 0 20 20" aria-hidden="true">
      <path d={CAT_ICON[k] ?? CAT_ICON.other} />
    </svg>
  )
}

/* ---------- formatting ---------- */
export function splitMoney(v: number): { neg: boolean; int: string; dec: string } {
  const s = formatMoneyExact(Math.abs(Number(v) || 0))
  const [i, d = '00'] = s.split('.')
  return { neg: Number(v) < 0, int: i, dec: d }
}

export const F = (n: number, d?: number): string => formatMoney(Number(n) || 0, d)

/** 紧凑读数：12600 → 12.6K */
export function kf(n: number): string {
  if (n >= 1000) {
    const k = n / 1000
    const s = k >= 10 ? k.toFixed(1) : k.toFixed(2)
    return s.replace(/\.?0+$/, '') + 'K'
  }
  return String(Math.round(n))
}

export const p2 = (n: number | string): string => String(n).padStart(2, '0')

const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const MEN = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function weekday(date: string): string {
  const d = new Date(date + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? '' : WD[d.getDay()]
}
export function monthEn(ym: string): string {
  return MEN[Number(ym.slice(5, 7))] || ''
}
export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}
export function shiftDay(date: string, k: number): string {
  const d = new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8) + k)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}
export function dateLabel(date: string): string {
  const t = todayStr()
  if (date === t) return '今天'
  if (date === shiftDay(t, -1)) return '昨天'
  if (date === shiftDay(t, 1)) return '明天'
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`
}
export function daysInMonth(ym: string): number {
  return new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate()
}
export function shortKey(ym: string): string {
  return ym.replace('-', '.')
}

/* ---------- money display ---------- */
export function Money({ v, cls }: { v: number; cls?: string }): JSX.Element {
  const m = splitMoney(v)
  return (
    <span className={`money ${cls || ''}`}>
      {m.neg ? '−' : ''}¥{m.int}
      <span className="d">.{m.dec}</span>
    </span>
  )
}

export function HeroAmount({ v, cls }: { v: number; cls?: string }): JSX.Element {
  const m = splitMoney(v)
  const len = m.int.length
  const size = len > 8 ? 'xs' : len > 6 ? 'sm' : ''
  return (
    <div className={`amt-hero ${size} ${cls || ''}`}>
      <span className="cur">{m.neg ? '−¥' : '¥'}</span>
      <span className="int">{m.int}</span>
      <span className="dec">.{m.dec}</span>
    </div>
  )
}

/* ---------- building blocks ---------- */
export function Mod({
  id,
  title,
  en,
  right,
  className,
  children,
  style,
}: {
  id?: string
  title?: React.ReactNode
  en?: React.ReactNode
  right?: React.ReactNode
  className?: string
  children?: React.ReactNode
  style?: React.CSSProperties
}): JSX.Element {
  return (
    <article className={`mod ${className || ''}`} style={style}>
      {title !== undefined && (
        <div className="mh">
          {id && <span className="id">{id}</span>}
          <h2>{title}</h2>
          {en && <span className="lb">{en}</span>}
          <span className="sp" />
          {right}
        </div>
      )}
      {children}
    </article>
  )
}

export function Ro({
  cn,
  en,
  v,
  cls,
  unit,
}: {
  cn: string
  en: string
  v: number | string
  cls?: string
  unit?: string
}): JSX.Element {
  return (
    <div className={`ro ${cls || ''}`}>
      <span className="lb">
        <b>{cn}</b>
        {en}
      </span>
      <span className="v num">
        {typeof v === 'number' ? <Money v={v} /> : v}
        {unit && <small className="u">{unit}</small>}
      </span>
    </div>
  )
}

export function Seg<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: Array<[T, string]>
  className?: string
}): JSX.Element {
  return (
    <div className={`seg ${className || ''}`} role="tablist">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={v === value}
          className={v === value ? 'on' : ''}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function MonthSwitch({
  ym,
  onChange,
  max,
  ticks = true,
}: {
  ym: string
  onChange: (v: string) => void
  max?: string
  ticks?: boolean
}): JSX.Element {
  const limit = max || todayStr().slice(0, 7)
  const atMax = ym >= limit
  const shift = (k: number): void => {
    const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + k, 1)
    const next = `${d.getFullYear()}-${p2(d.getMonth() + 1)}`
    if (next > limit) return
    onChange(next)
  }
  return (
    <>
      <div className="mon">
        <button type="button" onClick={() => shift(-1)} aria-label="上个月">
          <Icon n="l" cls="s" />
        </button>
        <span className="mv">{shortKey(ym)}</span>
        <button type="button" onClick={() => shift(1)} disabled={atMax} aria-label="下个月">
          <Icon n="r" cls="s" />
        </button>
      </div>
      {ticks && (
        <span className="mscale" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => {
            const d = new Date(+limit.slice(0, 4), +limit.slice(5, 7) - 1 - 5 + i, 1)
            const k = `${d.getFullYear()}-${p2(d.getMonth() + 1)}`
            return <i key={k} className={k === ym ? 'on' : ''} />
          })}
        </span>
      )}
    </>
  )
}
