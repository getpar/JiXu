import Taro from '@tarojs/taro'
import { sumAmounts } from './money'
import { getSavingsCloudCollection, getOwnerId, getDeviceSource } from './cloud'

/** 存钱记录（需求评估-02）：独立小账本，不参与账单统计。 */
export interface SavingsItem {
  id: string
  direction: 'in' | 'out'
  amount: number
  date: string
  note: string
  createdAt: number
  updatedAt: number
  deleted: number
  reviveCount: number
}

export interface SavingsSummary {
  total: number
  totalIn: number
  totalOut: number
  monthIn: number
  monthOut: number
}

const KEY = 'daily_savings'

function readAll(): SavingsItem[] {
  const raw = Taro.getStorageSync(KEY)
  if (!raw) return []
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function writeAll(list: SavingsItem[]): void {
  Taro.setStorageSync(KEY, JSON.stringify(sortSavings(list)))
}

function sortSavings(list: SavingsItem[]): SavingsItem[] {
  return list.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
}

function idOf(): string {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function getSavingsRecords(): SavingsItem[] {
  return sortSavings(readAll().filter((x) => !x.deleted))
}

export function getDeletedSavings(): SavingsItem[] {
  return sortSavings(readAll().filter((x) => !!x.deleted))
}

export function getSavingsSummary(): SavingsSummary {
  const alive = readAll().filter((x) => !x.deleted)
  const month = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })()
  const totalIn = sumAmounts(alive.filter((x) => x.direction === 'in').map((x) => x.amount))
  const totalOut = sumAmounts(alive.filter((x) => x.direction === 'out').map((x) => x.amount))
  const monthIn = sumAmounts(alive.filter((x) => x.direction === 'in' && x.date.startsWith(month)).map((x) => x.amount))
  const monthOut = sumAmounts(alive.filter((x) => x.direction === 'out' && x.date.startsWith(month)).map((x) => x.amount))
  return { total: totalIn - totalOut, totalIn, totalOut, monthIn, monthOut }
}

export function addSaving(direction: 'in' | 'out', amount: number, date: string, note: string): SavingsItem {
  const now = Date.now()
  const item: SavingsItem = {
    id: idOf(), direction, amount, date, note: note.trim(), createdAt: now, updatedAt: now, deleted: 0, reviveCount: 0,
  }
  const all = readAll()
  all.push(item)
  writeAll(all)
  pushSavingsSoon()
  return item
}

export function updateSaving(id: string, amount: number, date: string, note: string): void {
  const all = readAll()
  const idx = all.findIndex((x) => x.id === id && !x.deleted)
  if (idx < 0) return
  all[idx] = { ...all[idx], amount, date, note: note.trim(), updatedAt: Date.now() }
  writeAll(all)
  pushSavingsSoon()
}

export function deleteSaving(id: string): void {
  const all = readAll()
  const idx = all.findIndex((x) => x.id === id && !x.deleted)
  if (idx < 0) return
  all[idx] = { ...all[idx], deleted: 1, updatedAt: Date.now() }
  writeAll(all)
  pushSavingsSoon()
}

export function restoreSaving(id: string): void {
  const all = readAll()
  const idx = all.findIndex((x) => x.id === id && x.deleted)
  if (idx < 0) return
  all[idx] = { ...all[idx], deleted: 0, reviveCount: (all[idx].reviveCount || 0) + 1, updatedAt: Date.now() }
  writeAll(all)
  pushSavingsSoon()
}

export interface SavingsSyncResult {
  ok: boolean
  pushed: number
  applied: number
  error?: string
}

function applyCloudSavings(items: any[]): number {
  const all = readAll()
  const byId = new Map(all.map((x) => [x.id, x]))
  let changed = 0
  for (const it of items) {
    const id = String(it?.id || '')
    if (!id) continue
    const updatedAt = Number(it.updatedAt) || 0
    const existing = byId.get(id)
    if (existing && existing.updatedAt >= updatedAt) continue
    if (!existing && it.deleted) continue
    const next: SavingsItem = {
      id,
      direction: it.direction === 'out' ? 'out' : 'in',
      amount: Number(it.amount) || 0,
      date: String(it.date || ''),
      note: String(it.note || ''),
      createdAt: Number(it.createdAt) || updatedAt || Date.now(),
      updatedAt: updatedAt || Date.now(),
      deleted: it.deleted ? 1 : 0,
      reviveCount: Number(it.reviveCount) || 0,
    }
    byId.set(id, next)
    changed++
  }
  if (changed > 0) writeAll([...byId.values()])
  return changed
}

/** 独立存钱云同步：按 entityId 取最新快照，本地新则补传，云端新则覆盖。 */
export async function syncSavingsNow(): Promise<SavingsSyncResult> {
  try {
    const cloud = getSavingsCloudCollection()
    const ownerId = getOwnerId()
    const docs = await cloud.listAll(ownerId) as any[]
    const latest = new Map<string, { updatedAt: number; data: any }>()
    for (const doc of docs || []) {
      if (doc.kind !== 'savings') continue
      const id = String(doc.entityId || '')
      if (!id || !doc.data) continue
      const updatedAt = Number(doc.updatedAt) || 0
      const prev = latest.get(id)
      if (!prev || updatedAt > prev.updatedAt) latest.set(id, { updatedAt, data: doc.data })
    }

    const local = readAll()
    const localById = new Map(local.map((x) => [x.id, x]))
    const toApply: any[] = []
    for (const [id, cloudItem] of latest) {
      const l = localById.get(id)
      if (!l || cloudItem.updatedAt > l.updatedAt) toApply.push({ ...cloudItem.data, updatedAt: cloudItem.updatedAt })
    }

    let pushed = 0
    for (const item of local) {
      const cloudItem = latest.get(item.id)
      if (cloudItem && cloudItem.updatedAt >= item.updatedAt) continue
      const res = await cloud.add({
        kind: 'savings',
        entityId: item.id,
        ownerId,
        updatedAt: item.updatedAt || Date.now(),
        source: getDeviceSource(),
        data: {
          id: item.id,
          direction: item.direction,
          amount: item.amount,
          date: item.date,
          note: item.note || '',
          createdAt: item.createdAt || item.updatedAt || Date.now(),
          deleted: !!item.deleted,
          reviveCount: item.reviveCount || 0,
        },
      } as any)
      if (res) pushed++
    }

    const applied = applyCloudSavings(toApply)
    return { ok: true, pushed, applied }
  } catch (e: any) {
    return { ok: false, pushed: 0, applied: 0, error: e?.errMsg || e?.message || String(e) }
  }
}

export function pushSavingsSoon(): void {
  syncSavingsNow().catch(() => { /* 下次进存钱页补传 */ })
}
