/**
 * 微信身份 + 扫码配对 — 小程序端（v1.2.0 方案B）
 *
 * 背景：账本唯一标识仍是 12 位同步码 ownerId，但不再要求用户手抄。
 * 小程序启动时调用云函数 `account`，用微信 OPENID 换回本用户的 ownerId：
 * - 首次使用会把本机现有同步码“认领”到当前微信身份（老账本无缝保留）；
 * - 换手机 / 重装小程序，用同一个微信打开会拿回同一个 ownerId，账本自动回来。
 *
 * 配对协议（复用 records 集合，零新增集合）：
 * - 电脑端生成 pair_req + 二维码 → 手机扫码 → 手机写 pair_ack（带 targetOwnerId）→ 电脑轮询取走；
 * - 手机生成 pair_invite（6 位码，带 targetOwnerId）→ 安卓 App 输入 → 安卓取走。
 * - 安卓生成 pair_req + pairToken → 小程序码（scene=p=<token>）→ 微信扫一扫打开配对页 → 写 pair_ack。
 *
 * ⚠️ 配对文档绝对不能出现名为 `ownerId` 的字段（v1.2.0 协议修正）：
 * 同步引擎 listAll(ownerId) 会把带 ownerId 的文档当成账本文档拉进来，
 * 所以回执 / 邀请里交账本码一律用 `targetOwnerId`，由电脑端 / 安卓端读取。
 */

import Taro from '@tarojs/taro'
import { getCloudDatabase, getEnvId, getOwnerId, setLocalOwnerId, taroStore } from './cloud'
import { isValidOwnerId, normalizeOwnerId } from './cloudCore'

// wx 是微信小程序全局对象（Taro 编译产物中可用），此处不做类型依赖
declare const wx: any

/** 配对码有效期：所有请求 / 邀请 / 回执统一 5 分钟 */
const PAIR_TTL_MS = 5 * 60 * 1000

/** 配对文档所在的集合（与账单共用，协议不改集合权限） */
const RECORDS_COLLECTION = 'records'

/** 本机微信身份状态（Taro Storage 标记，供 UI 直接读取） */
const WECHAT_BOUND_KEY = 'wechat_bound'
const WECHAT_ERROR_KEY = 'wechat_account_error'

export interface WechatAccountResult {
  /** 云函数是否成功解析出微信身份（false = 用了本机同步码兜底） */
  ok: boolean
  /** 本机是否已绑定微信身份（云函数返回了合法 ownerId） */
  bound: boolean
  /** 当前生效的同步码（成功 = 微信身份对应的码；失败 = 本机原码） */
  ownerId: string
  /** true = 没连真云，纯本地模式（此时不调用云函数） */
  localMode: boolean
  /** 云函数是否新建了映射（首次认领 / 首次使用） */
  isNew?: boolean
  /** 失败原因（已截断成一句人话，可直接展示） */
  error?: string
}

export interface PairResult {
  ok: boolean
  /** 对端设备名（电脑端 pair_req 里的 deviceName，展示用） */
  deviceName?: string
  error?: string
}

export interface PhoneInviteResult {
  ok: boolean
  shortCode?: string
  expiresAt?: number
  error?: string
}

// ---- 小工具 ----

function errText(e: any): string {
  if (!e) return ''
  return String(e.errMsg || e.message || e)
}

function saveWechatState(bound: boolean, error: string): void {
  taroStore.set(WECHAT_BOUND_KEY, bound ? '1' : '0')
  // 空字符串 = 清除错误（taroStore.get 对空串返回 null）
  taroStore.set(WECHAT_ERROR_KEY, error || '')
}

/** 本机是否已绑定微信身份（云函数成功返回过合法 ownerId） */
export function isWechatBound(): boolean {
  return taroStore.get(WECHAT_BOUND_KEY) === '1'
}

/** 最近一次微信身份解析失败的原因（成功时为空串） */
export function getWechatAccountError(): string {
  return taroStore.get(WECHAT_ERROR_KEY) || ''
}

// ---- 微信身份：调用 account 云函数 ----

/**
 * 缓存 Promise，保证同一环境一次会话只跑一次。
 * v1.2.0 追加：缓存按环境 ID 区分 —— 用户切了自定义云环境后必须重新解析，
 * 否则会继续用旧环境的微信身份去同步新环境（账本对不上）。
 */
let ensurePromise: Promise<WechatAccountResult> | null = null
let ensureEnv = ''

async function resolveWechatAccount(): Promise<WechatAccountResult> {
  const localOwnerId = getOwnerId()

  // 未连真云（没配环境 / 没有 wx.cloud）：保持本机同步码照常使用，不报错打扰
  if (!getEnvId() || typeof wx === 'undefined' || !wx.cloud || typeof wx.cloud.callFunction !== 'function') {
    const msg = '未连接云环境，当前使用本机同步码'
    saveWechatState(false, msg)
    return { ok: false, bound: false, ownerId: localOwnerId, localMode: true, error: msg }
  }

  // 触发 wx.cloud.init（callFunction 前必须先初始化；getCloudDatabase 内部按环境 ID 幂等 init）
  const db = getCloudDatabase()
  if (!db) {
    const msg = '云环境初始化失败，当前使用本机同步码'
    saveWechatState(false, msg)
    return { ok: false, bound: false, ownerId: localOwnerId, localMode: true, error: msg }
  }

  try {
    const res: any = await wx.cloud.callFunction({
      name: 'account',
      data: { action: 'resolve', claimOwnerId: localOwnerId },
    })
    const r = res && res.result
    if (!r) {
      const msg = '微信身份服务未返回结果（account 云函数可能还没部署）'
      saveWechatState(false, msg)
      return { ok: false, bound: false, ownerId: localOwnerId, localMode: false, error: msg }
    }
    if (r.ok && isValidOwnerId(String(r.ownerId || ''))) {
      const ownerId = String(r.ownerId)
      setLocalOwnerId(ownerId)
      saveWechatState(true, '')
      return { ok: true, bound: true, ownerId, localMode: false, isNew: !!r.isNew }
    }
    const msg = String(r.error || (r.code === 'OWNER_TAKEN' ? '这个账本已绑定其他微信' : '微信身份解析失败'))
    saveWechatState(false, msg)
    return { ok: false, bound: false, ownerId: localOwnerId, localMode: false, error: msg }
  } catch (e: any) {
    const msg = `微信身份服务暂不可用：${errText(e) || '网络异常'}`
    saveWechatState(false, msg)
    return { ok: false, bound: false, ownerId: localOwnerId, localMode: false, error: msg }
  }
}

/**
 * 确保本机已解析出微信身份（缓存 Promise，同环境只跑一次）。
 * 成功 = 云函数返回合法 ownerId → 写入本机；失败 = 保留本机同步码、记录错误，绝不阻塞记账。
 */
export function ensureWechatAccount(): Promise<WechatAccountResult> {
  const env = getEnvId()
  if (!ensurePromise || ensureEnv !== env) {
    ensureEnv = env
    ensurePromise = resolveWechatAccount().catch((e: any) => {
      const msg = `微信身份服务异常：${errText(e) || '未知错误'}`
      saveWechatState(false, msg)
      return { ok: false, bound: false, ownerId: getOwnerId(), localMode: false, error: msg }
    })
  }
  return ensurePromise
}

/** 用户点「点此重试」：清掉缓存重跑一次（例如刚才没网 / 云函数刚部署好） */
export function retryWechatAccount(): Promise<WechatAccountResult> {
  ensurePromise = null
  ensureEnv = ''
  return ensureWechatAccount()
}

/** 把「已绑定」结果写回缓存，后续 ensure 不再重新解析旧环境/旧映射 */
function rememberBoundResult(ownerId: string): WechatAccountResult {
  ensureEnv = getEnvId()
  const r: WechatAccountResult = { ok: true, bound: true, ownerId, localMode: false }
  ensurePromise = Promise.resolve(r)
  return r
}

/** 把「本机兜底」结果写回缓存：本会话不再尝试解析（避免刚清空又被旧微信映射拉回旧账本） */
function rememberFallbackResult(error: string, localMode = false): WechatAccountResult {
  ensureEnv = getEnvId()
  const r: WechatAccountResult = { ok: false, bound: false, ownerId: getOwnerId(), localMode, error }
  saveWechatState(false, error)
  ensurePromise = Promise.resolve(r)
  return r
}

function hasRealCloud(): boolean {
  return !!getEnvId() && typeof wx !== 'undefined' && !!wx.cloud && typeof wx.cloud.callFunction === 'function'
}

/**
 * v1.2.0 手动绑定：把当前微信直接绑到指定账本码（加入 / 换新码 / 清空后重置用）。
 * 与 resolve 不同 —— 不认领本机旧码，以传入的 ownerId 为准；已被其他微信占用会失败。
 */
export async function bindWechatAccount(ownerId: string): Promise<WechatAccountResult> {
  const target = normalizeOwnerId(ownerId)
  const localOwnerId = getOwnerId()
  if (!isValidOwnerId(target)) {
    return { ok: false, bound: isWechatBound(), ownerId: localOwnerId, localMode: false, error: '同步码格式不对（至少 8 位字母或数字）' }
  }
  if (!hasRealCloud() || !getCloudDatabase()) {
    return { ok: false, bound: isWechatBound(), ownerId: localOwnerId, localMode: true, error: '未连接云环境，微信身份未更新' }
  }
  try {
    const res: any = await wx.cloud.callFunction({ name: 'account', data: { action: 'bind', ownerId: target } })
    const r = res && res.result
    if (r && r.ok && isValidOwnerId(String(r.ownerId || target))) {
      const finalId = String(r.ownerId || target)
      setLocalOwnerId(finalId)
      saveWechatState(true, '')
      return rememberBoundResult(finalId)
    }
    const msg = String((r && r.error) || '微信身份绑定失败')
    return { ok: false, bound: isWechatBound(), ownerId: localOwnerId, localMode: false, error: msg }
  } catch (e: any) {
    return { ok: false, bound: isWechatBound(), ownerId: localOwnerId, localMode: false, error: `微信身份绑定失败：${errText(e) || '网络异常'}` }
  }
}

/**
 * v1.2.0 重置微信身份：让云函数给当前微信换一个新账本码（清空本机数据后用）。
 * 失败时返回 error，调用方退回本机新码兜底。
 */
export async function resetWechatAccount(): Promise<WechatAccountResult> {
  if (!hasRealCloud() || !getCloudDatabase()) {
    return rememberFallbackResult('未连接云环境，已使用本机新码', true)
  }
  try {
    const res: any = await wx.cloud.callFunction({ name: 'account', data: { action: 'reset' } })
    const r = res && res.result
    if (r && r.ok && isValidOwnerId(String(r.ownerId || ''))) {
      const finalId = String(r.ownerId)
      setLocalOwnerId(finalId)
      saveWechatState(true, '')
      return rememberBoundResult(finalId)
    }
    const msg = String((r && r.error) || '微信身份重置失败')
    return rememberFallbackResult(msg)
  } catch (e: any) {
    return rememberFallbackResult(`微信身份重置失败：${errText(e) || '网络异常'}`)
  }
}

// ---- 配对：创建 pair_ack / pair_invite ----

/** 云数据库是否可用（未连真云时返回 null + 人话错误） */
function requireDb(): any | null {
  const db = getCloudDatabase()
  return db || null
}

const NO_CLOUD_ERROR = '未连接云环境'

/** 创建一条 pair_ack 回执（把本机当前账本码交给发起方；字段名用 targetOwnerId，绝不能叫 ownerId） */
async function createPairAck(pairingId: string, expiresAt?: number): Promise<boolean> {
  const db = requireDb()
  if (!db) return false
  const now = Date.now()
  await db.collection(RECORDS_COLLECTION).add({
    data: {
      kind: 'pair_ack',
      pairingId,
      targetOwnerId: getOwnerId(),
      createdAt: now,
      expiresAt: expiresAt && expiresAt > now ? expiresAt : now + PAIR_TTL_MS,
    },
  })
  return true
}

/**
 * 按 pairingId 确认配对请求 → 创建 pair_ack。
 * 会先查电脑端创建的 pair_req（校验存在 + 未过期），再写回执。
 */
export async function confirmPairByRequest(pairingId: string, deviceName?: string): Promise<PairResult> {
  const pid = (pairingId || '').trim()
  if (!pid) return { ok: false, error: '配对请求为空' }
  const db = requireDb()
  if (!db) return { ok: false, error: NO_CLOUD_ERROR }

  let req: any = null
  try {
    // pairingId 本身唯一，不需要 orderBy（也避免给 records 集合额外建复合索引）
    const res = await db.collection(RECORDS_COLLECTION)
      .where({ kind: 'pair_req', pairingId: pid })
      .limit(1)
      .get()
    req = (res && res.data && res.data[0]) || null
  } catch (e: any) {
    return { ok: false, error: `读取配对请求失败：${errText(e) || '网络异常'}` }
  }

  // 找不到请求文档：多数是二维码过期后被电脑删了，或扫到了别的环境的码
  if (!req) return { ok: false, error: '没有找到这个配对请求，请在电脑上重新生成二维码' }

  const expiresAt = Number(req.expiresAt || 0)
  if (expiresAt > 0 && expiresAt <= Date.now()) {
    return { ok: false, error: '配对码已过期，请在电脑上重新生成' }
  }

  try {
    await createPairAck(pid, expiresAt)
  } catch (e: any) {
    return { ok: false, error: `回执写入失败：${errText(e) || '网络异常'}` }
  }
  return { ok: true, deviceName: String(req.deviceName || deviceName || '电脑') }
}

/** 解析二维码内容：标准 JSON / 纯 pairingId 都兼容 */
function parsePairQr(raw: string): { pairingId: string; deviceName?: string } | null {
  const text = (raw || '').trim()
  if (!text) return null
  try {
    const o = JSON.parse(text)
    if (o && typeof o === 'object' && (o.t === 'jixu-pair' || o.pid)) {
      const pid = String(o.pid || '').trim()
      if (pid) return { pairingId: pid, deviceName: o.name ? String(o.name) : undefined }
    }
  } catch {
    // 不是 JSON → 按“纯 pairingId”再试一次
  }
  // 纯 pairingId：字母数字/下划线/中划线（不限制 32 位，兼容未来格式）
  if (/^[A-Za-z0-9_-]{8,128}$/.test(text)) return { pairingId: text }
  return null
}

/**
 * 扫码绑定电脑：Taro.scanCode → 解析二维码 → 创建 pair_ack。
 * 二维码格式：{"v":1,"t":"jixu-pair","pid":"...","code":"...","name":"Windows 电脑"}
 */
export async function scanAndConfirmPair(): Promise<PairResult> {
  let raw = ''
  try {
    const res: any = await Taro.scanCode({ onlyFromCamera: false, scanType: ['qrCode', 'barCode'] })
    raw = String((res && (res.result || res.rawData)) || '')
  } catch (e: any) {
    const msg = errText(e)
    if (/cancel/i.test(msg)) return { ok: false, error: '已取消' }
    return { ok: false, error: `扫码失败：${msg || '请重试'}` }
  }

  const parsed = parsePairQr(raw)
  if (!parsed) return { ok: false, error: '这不是计序配对二维码，请在电脑上重新生成' }
  return confirmPairByRequest(parsed.pairingId, parsed.deviceName)
}

/**
 * 手动输入电脑端显示的 6 位配对码 → 查最新的 pair_req → 创建 pair_ack。
 * 用于扫码不方便时（摄像头权限 / 电脑在另一间屋）。
 */
export async function confirmPairByCode(shortCode: string): Promise<PairResult> {
  const code = (shortCode || '').trim()
  if (!/^\d{6}$/.test(code)) return { ok: false, error: '请输入 6 位数字配对码' }
  const db = requireDb()
  if (!db) return { ok: false, error: NO_CLOUD_ERROR }

  let req: any = null
  try {
    // 6 位码理论可能撞码：取最近 10 条再在本地按 createdAt 选最新，避免依赖复合索引
    const res = await db.collection(RECORDS_COLLECTION)
      .where({ kind: 'pair_req', shortCode: code })
      .limit(10)
      .get()
    const candidates = (res && res.data) || []
    req = candidates.slice().sort((a: any, b: any) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0] || null
  } catch (e: any) {
    return { ok: false, error: `读取配对码失败：${errText(e) || '网络异常'}` }
  }

  if (!req) return { ok: false, error: '没有找到这个配对码，请确认电脑上显示的是 6 位数字' }
  const expiresAt = Number(req.expiresAt || 0)
  if (expiresAt > 0 && expiresAt <= Date.now()) {
    return { ok: false, error: '配对码已过期，请在电脑上重新生成' }
  }

  const pairingId = String(req.pairingId || '').trim()
  if (!pairingId) return { ok: false, error: '配对请求不完整，请在电脑上重新生成' }
  try {
    await createPairAck(pairingId, expiresAt)
  } catch (e: any) {
    return { ok: false, error: `回执写入失败：${errText(e) || '网络异常'}` }
  }
  return { ok: true, deviceName: String(req.deviceName || '电脑') }
}

/**
 * v1.2.0 安卓「小程序码」配对：安卓创建 pair_req 时带 16 位随机 pairToken，
 * 用户把安卓显示的小程序码保存到相册 → 微信扫一扫 → 打开 pages/pair/index?scene=p%3D<token>。
 * 本函数按 pairToken 找到最新的 pair_req（校验有效期），再写 pair_ack（targetOwnerId）。
 */
export async function confirmAndroidPairByToken(token: string): Promise<PairResult> {
  const t = (token || '').trim()
  if (!/^[A-Za-z0-9]{8,32}$/.test(t)) {
    return { ok: false, error: '配对参数无效，请在安卓 App 重新生成小程序码' }
  }
  const db = requireDb()
  if (!db) return { ok: false, error: NO_CLOUD_ERROR }

  let list: any[] = []
  try {
    const res = await db.collection(RECORDS_COLLECTION)
      .where({ kind: 'pair_req', pairToken: t })
      .limit(10)
      .get()
    list = (res && res.data) || []
  } catch (e: any) {
    return { ok: false, error: `读取配对请求失败：${errText(e) || '网络异常'}` }
  }
  if (list.length === 0) {
    return { ok: false, error: '没有找到这个配对请求，请在安卓 App 重新生成小程序码' }
  }

  // 同一 token 理论上只有一条；万一有历史重复，按 createdAt 取最新一条
  list.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
  const req = list[0]
  const expiresAt = Number(req.expiresAt || 0)
  if (expiresAt <= Date.now()) {
    return { ok: false, error: '配对码已过期，请在安卓 App 重新生成小程序码' }
  }
  const pairingId = String(req.pairingId || '').trim()
  if (!pairingId) {
    return { ok: false, error: '配对请求不完整，请在安卓 App 重新生成小程序码' }
  }

  try {
    await createPairAck(pairingId, expiresAt)
  } catch (e: any) {
    return { ok: false, error: `回执写入失败：${errText(e) || '网络异常'}` }
  }
  return { ok: true, deviceName: String(req.deviceName || '安卓手机') }
}

/**
 * 生成手机绑定码（给安卓 App 用）：
 * 6 位数字（随机，理论可能重复但 5 分钟内基本不会遇到），5 分钟有效。
 */
export async function createPhoneInvite(): Promise<PhoneInviteResult> {
  const db = requireDb()
  if (!db) return { ok: false, error: NO_CLOUD_ERROR }
  const now = Date.now()
  const shortCode = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = now + PAIR_TTL_MS
  try {
    await db.collection(RECORDS_COLLECTION).add({
      data: {
        kind: 'pair_invite',
        shortCode,
        targetOwnerId: getOwnerId(),
        deviceType: 'android',
        createdAt: now,
        expiresAt,
      },
    })
  } catch (e: any) {
    return { ok: false, error: `生成绑定码失败：${errText(e) || '网络异常'}` }
  }
  return { ok: true, shortCode, expiresAt }
}
