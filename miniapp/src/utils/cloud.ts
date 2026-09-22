/**
 * CloudBase 云同步 — 小程序端接入层
 *
 * 同步算法在 cloudCore.ts（纯逻辑，可脱离小程序环境验证），
 * 本文件只负责两件事：
 * 1. 提供两种"云集合"实现：wx.cloud 真云 / 本地模拟云，接口一致、自动切换
 * 2. 提供 Taro Storage 的键值存储适配
 *
 * ★═══════════ 激活真云的步骤（拿到 AppID 后照做，除第 1 步外不用改代码）═══════★
 * 1. 把下方 DEFAULT_CLOUD_ENV_ID 填入你的 CloudBase 环境 ID（形如 'daily-notes-3gxxxxxxxxxx'）
 *    （v0.7.1 方案B：不改源码也能换环境——在 Storage 里设 cloud_env_id = 自己的环境 ID 即可覆盖默认值；
 *     界面上故意不暴露入口，防普通用户误触把账本“换丢”）
 * 2. 腾讯云开发控制台 → 环境设置 → 小程序认证 → 扫码授权，关联你的微信小程序 AppID
 *    （关联后小程序才能通过 wx.cloud 免域名备案直接访问该环境）
 * 3. 控制台数据库中新建集合：records，权限设置为「所有用户可读，仅创建者可读写」
 * 4. 桌面端无需改动：在侧边栏 ☁️ 云同步里填同一个环境 ID 即可双端打通
 *
 * 环境 ID 为空时自动使用「本地模拟云」（数据存在本机 Storage 的
 * mock_cloud_records 键中），同步逻辑照常运行，仅不会真正跨设备。
 */

import Taro from '@tarojs/taro'
import {
  CloudCollection, CloudDoc, NewCloudDoc, createMockCloud, KVStore,
  newOwnerId, normalizeOwnerId, isValidOwnerId, lastSyncKey,
} from './cloudCore'

// ---- 配置：默认环境 ID 已填入（2026-09-20 开通）；Storage 可用 cloud_env_id 覆盖（方案B），清空则回退本地模拟云 ----

const DEFAULT_CLOUD_ENV_ID = 'daily-notes-d3gaotrwyc09ff44a'
const ENV_OVERRIDE_KEY = '***'

/** 当前生效的环境 ID：Storage 自定义覆盖优先，其次内置默认值，都没有 = 空（走模拟云） */
export function getEnvId(): string {
  try {
    const custom = taroStore.get(ENV_OVERRIDE_KEY)
    if (custom && typeof custom === 'string' && custom.trim()) return custom.trim()
  } catch { /* Storage 不可用时退回默认环境 */ }
  return DEFAULT_CLOUD_ENV_ID
}

// ---- 同步码（户标识，多用户隔离）----
// 每个微信小程序用户首次使用时自动生成自己的码，互不可见；
// 想和桌面端共用一本账，就在两端输入同一个码（方案 B）。

const OWNER_KEY = 'cloud_owner_id'

/** 获取本机同步码（没有则自动生成一个） */
export function getOwnerId(): string {
  let id = taroStore.get(OWNER_KEY)
  if (!id || !isValidOwnerId(id)) {
    id = newOwnerId()
    taroStore.set(OWNER_KEY, id)
  }
  return id
}

/** 加入指定户：输入另一端显示的同步码，成功返回 true */
export function joinOwnerId(raw: string): boolean {
  const id = normalizeOwnerId(raw)
  if (!isValidOwnerId(id)) return false
  taroStore.set(OWNER_KEY, id)
  return true
}

/** 换新户：重新生成一个随机同步码 */
export function regenerateOwnerId(): string {
  const id = newOwnerId()
  taroStore.set(OWNER_KEY, id)
  return id
}

// wx 是微信小程序全局对象（Taro 编译产物中可用），此处不做类型依赖
declare const wx: any

// v0.7.1 真实连接状态可见化：init 失败原因留底，供云同步弹窗展示（不再假确认）
let lastInitError = ''

// ---- Taro Storage 键值适配 ----

export const taroStore: KVStore = {
  get(key: string): string | null {
    try {
      const v = Taro.getStorageSync(key)
      return v === '' || v === null || v === undefined ? null : String(v)
    } catch {
      return null
    }
  },
  set(key: string, value: string): void {
    try {
      Taro.setStorageSync(key, value)
    } catch { /* 存储写入失败不影响业务 */ }
  },
}

// ---- 真云驱动：wx.cloud（微信云开发，与 CloudBase 同底座） ----

let wxInitedEnv = '' // 已 init 过的环境 ID（切换环境时自动重新 init）

function createWxCloudCollection(): CloudCollection | null {
  const envId = getEnvId()
  if (!envId) return null
  if (typeof wx === 'undefined' || !wx.cloud) {
    lastInitError = '当前环境不支持 wx.cloud（开发者工具未勾选云开发或未关联环境）'
    console.warn('[Cloud] 当前环境不支持 wx.cloud，回退到本地模拟云')
    return null
  }
  try {
    if (wxInitedEnv !== envId) {
      wx.cloud.init({ env: envId, traceUser: true })
      wxInitedEnv = envId
    }
    lastInitError = ''
    const db = wx.cloud.database()
    const col = db.collection('records')
    return {
      async listAll(ownerId: string): Promise<CloudDoc[]> {
        // 只拉本户（同同步码）的文档（账单+删除凭证+撤销凭条混合）
        // ⚠️ v0.8.4 关键修正：微信小程序端 collection.get 单次上限是 20 条（非 100）！
        // 传 limit(100) 不报错但被微信静默截断返回 20，旧代码据此误判"已拉完"停止翻页，
        // 导致云端超过 20 条后的新数据（另一端刚传的）永远拉不到 — "只存不拉"真正根因
        const all: CloudDoc[] = []
        let offset = 0
        const limit = 20
        while (true) {
          const res = await col.where({ ownerId }).orderBy('updatedAt', 'asc').skip(offset).limit(limit).get()
          const rows = (res.data || []) as CloudDoc[]
          if (rows.length === 0) break
          all.push(...rows)
          if (rows.length < limit) break
          offset += limit
        }
        return all
      },
      async add(record: NewCloudDoc): Promise<string | null> {
        const res = await col.add({ data: record as any })
        return res._id || null
      },
    }
  } catch (e: any) {
    lastInitError = e?.errMsg || e?.message || String(e)
    console.error('[Cloud] wx.cloud 初始化失败，回退到本地模拟云:', e?.message || e)
    return null
  }
}

/** v0.7.1 真实连通性自检：实际去云端跑一趟，返回状态与失败原因（云同步弹窗展示用）
 * 典型失败：环境未关联小程序 AppID（-501000 无权限/环境不存在）、网络不通 */
export async function testCloud(): Promise<{ real: boolean; detail: string }> {
  if (!getEnvId()) return { real: false, detail: '未配置云环境 ID，当前为本地模拟云（不会跨设备同步）' }
  const col = createWxCloudCollection()
  if (!col) return { real: false, detail: `连接真云失败：${lastInitError || '未知原因'}（数据仅存本机，不会跨设备同步）` }
  try {
    await col.listAll(getOwnerId()) // 轻量真实查询：能跑通 = 环境已关联且可读
    return { real: true, detail: '已连接云环境 ✓' }
  } catch (e: any) {
    const msg = e?.errMsg || e?.message || String(e)
    return { real: false, detail: `读写云端失败：${msg}（最常见原因：CloudBase 控制台未关联本小程序 AppID）` }
  }
}

// ---- 模拟云驱动：Taro Storage 里的一个 JSON 数组 ----

const mockCloud: CloudCollection = createMockCloud(taroStore)

// ---- 对外统一出口 ----

/** 当前是否连接的是真云（false = 本地模拟云） */
export function usingRealCloud(): boolean {
  return !!getEnvId() && typeof wx !== 'undefined' && !!wx.cloud
}

/** 获取当前生效的云集合实现（真云优先，自动回退模拟云） */
export function getCloudCollection(): CloudCollection {
  return createWxCloudCollection() || mockCloud
}

/** 是否首次使用（本机这个同步码还没和云同步过，仅用于引导提示） */
export function hasSyncedBefore(): boolean {
  return taroStore.get(lastSyncKey(getOwnerId())) !== null
}
