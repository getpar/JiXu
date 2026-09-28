/**
 * 到期提醒推送 — 前端（v0.9.2）
 *
 * 微信只给普通小程序开放「一次性订阅」：用户授权一次 = 1 条发送额度。
 * 本模块只做两件事：
 *   1. 请求订阅授权（⚠️ 必须在「用户点击」的回调里调用，否则会失败）
 *   2. 把「最近的到期项 + 额度」上报到云端集合 push_subs
 * 真正发送在云函数 dailyReminder（定时触发器）里完成。
 *
 * ⚠️ 用户勾选弹窗里的「总是保持以上选择，不再询问」后，之后调用不再弹窗、
 *    直接沿用上次选择——这是"不打扰地攒额度"的关键。
 */
import Taro from '@tarojs/taro'
import { getCloudDatabase, getOwnerId } from './cloud'
import { getTodos, localDateStr } from './storage'

/** ⚠️ 在微信公众平台申请订阅消息模板后，把模板 ID 填到这里（需与云函数里的一致） */
export const PUSH_TMPL_ID = '6vnLtfnk_r7n7IpsCVJU06ZWRhKWD9v0Do2A6THWsZ8'

const COLLECTION = 'push_subs'

export type PushResult =
  | 'accepted'    // 用户同意（+1 额度）
  | 'rejected'    // 用户拒绝
  | 'unavailable' // 未在点击上下文中调用 / 基础库不支持
  | 'no-template' // 还没填模板 ID
  | 'no-cloud'    // 未连接真云（本地模拟云下推送无效）

/** 模板 ID 是否已配置 */
export function isPushConfigured(): boolean {
  return !!PUSH_TMPL_ID && PUSH_TMPL_ID.indexOf('REPLACE') !== 0
}

/**
 * 请求订阅授权。
 * ⚠️ 微信要求必须在用户点击事件的回调里调用；用户已勾选「总是保持」时不再弹窗。
 */
export async function requestPushAuth(): Promise<PushResult> {
  if (!isPushConfigured()) return 'no-template'
  try {
    const res: any = await Taro.requestSubscribeMessage({ tmplIds: [PUSH_TMPL_ID] })
    return res && res[PUSH_TMPL_ID] === 'accept' ? 'accepted' : 'rejected'
  } catch {
    // 常见：不在点击回调里调用、基础库过低
    return 'unavailable'
  }
}

export type PushItem = { dueDate: string; title: string; note: string }

/**
 * 收集「所有未完成的活跃待办」上报给云函数。
 * 云函数再按发送当天筛出「已到期」的那些，组装成**一条概括消息**（方案甲），
 * 所以点一次额度就能覆盖一整天内的全部待办。
 * 只上报日期 / 标题 / 备注，不含金额等隐私内容。
 */
async function collectItems(): Promise<PushItem[]> {
  const today = localDateStr()
  const todos = (await getTodos()).filter((t) => t.isActive && !t.completedDates.includes(today))
  return todos
    .map((t) => ({ dueDate: t.nextDate, title: t.title, note: t.note || '' }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 50) // 上限，避免文档过大
}

// wx 是微信小程序全局对象（Taro 编译产物中可用），此处不做类型依赖
declare const wx: any

/**
 * 请云函数补建 push_subs 集合。
 * 用途：用户可能没在「云开发」控制台手动建集合（甚至找不到那个入口），
 * 这时前端第一次写入会失败 —— 我们让有管理员权限的云函数替我们建。
 */
async function ensureCollectionViaCloud(): Promise<boolean> {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) return false
  try {
    getCloudDatabase() // 内部会按需 wx.cloud.init
    const res: any = await wx.cloud.callFunction({
      name: 'dailyReminder',
      data: { action: 'ensureCollection' },
    })
    return !!(res && res.result && res.result.ok)
  } catch {
    return false
  }
}

/** 真正写一次（集合已存在时调用） */
async function writeState(db: any, col: any, base: Record<string, any>, addQuota: number): Promise<void> {
  const existing = await col.limit(1).get()
  const doc = existing && existing.data && existing.data[0]
  if (doc) {
    const data: Record<string, any> = { ...base }
    if (addQuota > 0) data.remaining = db.command.inc(addQuota)
    await col.doc(doc._id).update({ data })
  } else {
    // createdAt 供云函数填「创建日期」字段（只在首次建档时写入）
    await col.add({ data: { ...base, remaining: Math.max(addQuota, 0), sentFor: '', createdAt: Date.now() } })
  }
}

/**
 * 把当前到期项与额度写入云端（没有则新建）。
 * 集合不存在时自动请云函数补建后重试一次（用户无需手动去控制台建集合）。
 * @param addQuota 本次新增的额度（拿到一次授权传 1，否则传 0）
 */
export async function reportPushState(addQuota = 0): Promise<boolean> {
  const db = getCloudDatabase()
  if (!db) return false

  const items = await collectItems()
  const first = items[0]
  const base: Record<string, any> = {
    ownerId: getOwnerId(),
    items, // 全部未完成待办，供云函数筛「当天到期」并组装概括消息
    // 冗余存「最早的到期日」，便于云函数按 dueDate 建索引查询
    dueDate: first ? first.dueDate : '',
    title: first ? first.title : '',
    note: first ? first.note : '',
    updatedAt: Date.now(),
  }

  const col = db.collection(COLLECTION)
  try {
    await writeState(db, col, base, addQuota)
    return true
  } catch {
    // 大概率是集合还不存在 → 让云函数补建，再试一次
    const ensured = await ensureCollectionViaCloud()
    if (!ensured) return false
    try {
      await writeState(db, col, base, addQuota)
      return true
    } catch {
      return false
    }
  }
}

/** 读取当前推送状态（供界面展示剩余额度） */
export async function getPushState(): Promise<{ remaining: number; dueDate: string } | null> {
  const db = getCloudDatabase()
  if (!db) return null
  try {
    const res = await db.collection(COLLECTION).limit(1).get()
    const doc = res && res.data && res.data[0]
    if (!doc) return { remaining: 0, dueDate: '' }
    return { remaining: doc.remaining || 0, dueDate: doc.dueDate || '' }
  } catch {
    return null
  }
}

/**
 * 「开启到期提醒」按钮的点击处理：请求授权（+1 额度）→ 上报。
 * 必须在 onClick 里调用。
 */
export async function enablePushFromTap(): Promise<PushResult> {
  const auth = await requestPushAuth()
  if (auth === 'no-template') return auth
  const ok = await reportPushState(auth === 'accepted' ? 1 : 0)
  if (!ok) return 'no-cloud'
  return auth
}

/** 用户明确拒绝过订阅后，就不再自动打扰（本地标记） */
const AUTO_DECLINED_KEY = 'push_auto_declined'

/**
 * 「顺手攒额度」：挂在用户已有的高频动作（如「完成待办」）的点击回调里。
 *
 * ⚠️ 微信硬性要求：订阅请求必须在**用户点击的同步回调**里发起。
 *    所以本函数返回 Promise，但内部 `requestSubscribeMessage` 是**同步发起**的 ——
 *    调用方直接写 `autoRequestPushOnAction()` 不要 await，之后再取结果即可。
 *
 * 用户勾选弹窗里的「总是保持以上选择，不再询问」后，之后不再弹窗、静默 +1 条额度。
 * 用户若明确拒绝过，则本地记一笔，之后不再打扰。
 */
export function autoRequestPushOnAction(): Promise<void> {
  if (!isPushConfigured()) return Promise.resolve()
  try {
    if (Taro.getStorageSync(AUTO_DECLINED_KEY)) return Promise.resolve()
  } catch { /* Storage 不可用则照常尝试 */ }

  const p = requestPushAuth() // ← 同步发起
  return p
    .then(async (r) => {
      if (r === 'rejected') {
        try { Taro.setStorageSync(AUTO_DECLINED_KEY, '1') } catch { /* ignore */ }
        return
      }
      if (r === 'accepted') {
        await reportPushState(1)
      }
    })
    .catch(() => { /* 静默失败，不打扰用户 */ })
}

/**
 * 「立即测试一条」：让云函数马上给当前用户发一条，用来验证模板字段 / 额度是否正常。
 * 好处：不用去云开发控制台手动跑云函数，在小程序里点一下就知道成没成。
 */
export async function sendTestReminder(): Promise<{ ok: boolean; text: string }> {
  if (!isPushConfigured()) return { ok: false, text: '尚未配置订阅消息模板' }
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
    return { ok: false, text: '当前环境不支持云函数调用（需在真机或已连云的开发者工具里操作）' }
  }
  getCloudDatabase() // 确保 wx.cloud 已 init
  try {
    const res: any = await wx.cloud.callFunction({
      name: 'dailyReminder',
      data: { action: 'sendNow' },
    })
    const r = res && res.result
    if (r && r.ok) return { ok: true, text: '测试消息已发出，请打开微信「服务通知」查看' }
    if (r && r.code === 43101) {
      return { ok: false, text: '你还没允许接收通知：请先点「开启到期提醒」并在弹窗里点「允许」' }
    }
    if (r && r.reason) return { ok: false, text: String(r.reason) }
    if (r && r.code) return { ok: false, text: `发送失败（${r.code}）：${r.msg || '字段或模板不匹配'}` }
    return { ok: false, text: '云函数没有返回结果，可能还没上传成功' }
  } catch (e: any) {
    return { ok: false, text: `调用失败：${e?.errMsg || e?.message || '云函数未部署或网络异常'}` }
  }
}

/** 把结果转成人话提示 */
export function pushResultText(r: PushResult): string {
  switch (r) {
    case 'accepted': return '已开启到期提醒（额度 +1）'
    case 'rejected': return '未开启提醒，可稍后再试'
    case 'no-template': return '尚未配置订阅消息模板'
    case 'no-cloud': return '未连接云环境，提醒不会跨设备发送'
    case 'unavailable': return '订阅弹窗未打开，请重试'
    default: return '操作完成'
  }
}
