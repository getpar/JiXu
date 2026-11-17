/**
 * 存钱罐独立云同步（渲染进程，需求评估-02 §A.5）。
 *
 * 独立集合 savings，文档格式与 Android / 小程序完全一致：
 * { kind:'savings', entityId, ownerId, updatedAt, source, data:{id,direction,amount,date,note,createdAt,deleted,reviveCount} }
 * 不与 records 账单集合、现有 performSync 发生任何关系。
 */
import { getDb, getDeviceSource, getOwnerId, isConnected } from './cloudbase'

const COLLECTION = 'savings'

export interface SavingsSyncResult {
  success: boolean
  pushed: number
  applied: number
  error?: string
}

interface CloudSavingsDoc {
  _id?: string
  kind?: string
  entityId?: string
  ownerId?: string
  updatedAt?: number
  source?: string
  data?: Record<string, any>
}

async function downloadAllSavings(): Promise<CloudSavingsDoc[]> {
  const db = getDb()
  if (!db) throw new Error('未连接云端')
  const all = new Map<string, CloudSavingsDoc>()
  let offset = 0
  const limit = 100
  while (true) {
    const res = await db.collection(COLLECTION)
      .where({ ownerId: getOwnerId() })
      .skip(offset).limit(limit).orderBy('updatedAt', 'desc').orderBy('_id', 'desc').get()
    if (!res.data || res.data.length === 0) break
    for (const d of res.data as CloudSavingsDoc[]) all.set(String(d._id), d)
    if (res.data.length < limit) break
    offset += limit
  }
  return [...all.values()]
}

/**
 * 执行一次独立同步：云端/本地按 entityId 取 updatedAt 最新，云端新则覆盖本地，本地新则追加快照。
 */
export async function runSavingsSync(): Promise<SavingsSyncResult> {
  if (!isConnected() || !getDb()) {
    return { success: false, pushed: 0, applied: 0, error: '未连接云端' }
  }
  try {
    const local = await window.electronAPI.getSavingsForSync()
    const cloudDocs = await downloadAllSavings()
    const latest = new Map<string, { updatedAt: number; data: Record<string, any> }>()

    for (const doc of cloudDocs) {
      if (doc.kind !== 'savings') continue
      const id = String(doc.entityId || '')
      if (!id || !doc.data) continue
      const updatedAt = Number(doc.updatedAt) || 0
      const prev = latest.get(id)
      if (!prev || updatedAt > prev.updatedAt) {
        latest.set(id, { updatedAt, data: doc.data })
      }
    }

    const localById = new Map(local.map((x: any) => [String(x.id), x]))
    const toApply: Array<Record<string, any>> = []
    for (const [id, cloud] of latest) {
      const l = localById.get(id)
      const localUpdated = Number(l?.updatedAt) || 0
      if (!l || cloud.updatedAt > localUpdated) {
        toApply.push({ ...cloud.data, updatedAt: cloud.updatedAt })
      }
    }

    let pushed = 0
    const db = getDb()
    for (const item of local as any[]) {
      const cloud = latest.get(String(item.id))
      const localUpdated = Number(item.updatedAt) || 0
      if (cloud && cloud.updatedAt >= localUpdated) continue
      const res = await db.collection(COLLECTION).add({
        kind: 'savings',
        entityId: item.id,
        ownerId: getOwnerId(),
        updatedAt: localUpdated || Date.now(),
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
      })
      if (res?.id) pushed++
    }

    let applied = 0
    if (toApply.length > 0) {
      const r = await window.electronAPI.applyCloudSavings(toApply)
      applied = r?.changed || 0
    }
    return { success: true, pushed, applied }
  } catch (e: any) {
    console.error('[SavingsCloud] 同步失败:', e)
    return { success: false, pushed: 0, applied: 0, error: e?.message || String(e) }
  }
}
