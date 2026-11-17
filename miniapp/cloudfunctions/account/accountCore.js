/**
 * account 云函数纯逻辑（可脱离 wx-server-sdk 单测）
 * 与小程序 cloudCore.ts / 桌面 cloudbase.ts 的同步码规则保持一致：
 * - 12 位大写字母数字（去掉易混淆的 I/O/U）
 * - 至少 8 位才合法
 */

const CHARS = 'ABCDEFGHJKLMNPQRSTVWXYZ023456789'

/** 生成 12 位同步码（与三端 newOwnerId 同规则） */
function newOwnerId() {
  let out = ''
  for (let i = 0; i < 12; i++) out += CHARS[Math.floor(Math.random() * CHARS.length)]
  return out
}

/** 归一化：去空格/连字符、转大写 */
function normalizeOwnerId(raw) {
  return String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** 合法性：至少 8 位大写字母数字 */
function isValidOwnerId(id) {
  return /^[A-Z0-9]{8,}$/.test(String(id || ''))
}

/**
 * 决定新用户使用哪个 ownerId。
 * @param {object} p
 * @param {string|null} p.existingOwnerId 该 openid 已有映射
 * @param {string} p.claimOwnerId 客户端希望认领的旧同步码
 * @param {boolean} p.claimTakenByOther 该旧码是否已被别的 openid 占用
 * @param {() => string} [p.generate] 生成器（测试可注入）
 */
function decideAccount({ existingOwnerId, claimOwnerId, claimTakenByOther, generate }) {
  if (existingOwnerId && isValidOwnerId(existingOwnerId)) {
    return { ownerId: existingOwnerId, isNew: false }
  }
  const claim = normalizeOwnerId(claimOwnerId)
  if (isValidOwnerId(claim)) {
    if (claimTakenByOther) return { error: 'OWNER_TAKEN' }
    return { ownerId: claim, isNew: true }
  }
  const ownerId = (typeof generate === 'function' ? generate : newOwnerId)()
  return { ownerId, isNew: true }
}

module.exports = { CHARS, newOwnerId, normalizeOwnerId, isValidOwnerId, decideAccount }
