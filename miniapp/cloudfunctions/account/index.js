/**
 * account 云函数 — 微信身份 ↔ 账本 ownerId 映射（v1.2.0 方案B）
 *
 * 小程序启动时调用：
 *   wx.cloud.callFunction({ name:'account', data:{ action:'resolve', claimOwnerId:'<本机现有同步码，可空>' } })
 *
 * 返回：{ ok:true, ownerId:'ABCD2345EFGH', isNew:true }
 * 失败：{ ok:false, code:'NO_OPENID'|'OWNER_TAKEN'|'BAD_ACTION'|'INTERNAL', error:'...' }
 *
 * 设计要点：
 * - openid 只在服务端出现，客户端拿到的始终是同步码 ownerId；
 * - accounts 集合权限建议「仅管理端可读写」，客户端从不直接读；
 * - 首次调用会把本机现有同步码“认领”到当前微信身份，老账本无缝保留。
 */
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const {
  newOwnerId, normalizeOwnerId, isValidOwnerId, decideAccount,
} = require('./accountCore')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const COLLECTION = 'accounts'

/** 自动创建 accounts 集合；已存在/并发创建都视为就绪 */
async function ensureCollection() {
  try {
    await db.createCollection(COLLECTION)
    return 'created'
  } catch (e) {
    return 'exists'
  }
}

/** 按 openid 查映射（最多一条） */
async function findByOpenid(openid) {
  const res = await db.collection(COLLECTION).where({ openid }).limit(1).get()
  return (res.data && res.data[0]) || null
}

/** 该 ownerId 是否已被别的 openid 占用 */
async function isOwnerTakenByOther(ownerId, openid) {
  const res = await db.collection(COLLECTION).where({ ownerId }).limit(1).get()
  const doc = (res.data && res.data[0]) || null
  return !!doc && doc.openid !== openid
}

/** 稳定的文档 ID：sha256(openid) 前 32 位，防并发插重复 */
function accountDocId(openid) {
  return crypto.createHash('sha256').update(String(openid)).digest('hex').slice(0, 32)
}

/**
 * 生成安卓配对用的小程序码（v1.2.1）
 * 输入：{ action:'createMiniCode', pairToken:'16位随机hex' }
 * 输出：{ ok:true, imageBase64:'<PNG base64>' }
 *
 * 说明：这个动作由安卓 App 通过 CloudBase HTTP API 调用，不带微信 OPENID；
 * 小程序码的 scene = p=<pairToken>，扫开后进入 pages/pair/index 自动确认。
 */
async function handleCreateMiniCode(event) {
  const token = String(event.pairToken || '').trim()
  if (!/^[A-Za-z0-9]{8,32}$/.test(token)) {
    return { ok: false, code: 'BAD_TOKEN', error: '配对令牌格式不对' }
  }
  try {
    const res = await cloud.openapi.wxacode.getUnlimited({
      scene: 'p=' + token,
      page: 'pages/pair/index',
      width: 280,
      checkPath: false,
    })
    // wx-server-sdk 可能返回 { buffer: Buffer, contentType }，也可能直接返回 Buffer。
    // 注意 Node Buffer 自身也有 .buffer（ArrayBuffer）属性，必须先判断 Buffer。
    const raw = Buffer.isBuffer(res) ? res : (res && res.buffer) || res
    if (!raw) throw new Error('微信未返回小程序码图片')
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
    return { ok: true, imageBase64: buffer.toString('base64') }
  } catch (e) {
    console.error('[account] createMiniCode failed:', e)
    return { ok: false, code: 'MINI_CODE_FAILED', error: (e && (e.message || e.errMsg)) || String(e) }
  }
}

/** 写入/更新某个 openid 的账本映射 */
async function saveAccount(openid, ownerId) {
  const existing = await findByOpenid(openid)
  const now = Date.now()
  await db.collection(COLLECTION).doc(accountDocId(openid)).set({
    data: {
      openid,
      ownerId,
      createdAt: (existing && existing.createdAt) || now,
      updatedAt: now,
    },
  })
}

/** 解析身份（首次会认领本机旧同步码） */
async function handleResolve(event, openid) {
  await ensureCollection()

  const existing = await findByOpenid(openid)
  if (existing && isValidOwnerId(existing.ownerId)) {
    return { ok: true, ownerId: existing.ownerId, isNew: false }
  }

  const claim = normalizeOwnerId(event.claimOwnerId)
  const taken = isValidOwnerId(claim)
    ? await isOwnerTakenByOther(claim, openid)
    : false

  const decision = decideAccount({
    existingOwnerId: existing && existing.ownerId,
    claimOwnerId: claim,
    claimTakenByOther: taken,
    generate: newOwnerId,
  })

  if (decision.error === 'OWNER_TAKEN') {
    return { ok: false, code: 'OWNER_TAKEN', error: '这个账本已绑定其他微信，请在小程序「高级（备用同步码）」里换一个码' }
  }

  await saveAccount(openid, decision.ownerId)
  return { ok: true, ownerId: decision.ownerId, isNew: true }
}

/**
 * 手动把当前微信绑定到指定账本码（高级功能：加入/换新码/清空数据后重置）。
 * 与 resolve 的区别：不认领旧码，直接以传入的 ownerId 为准。
 */
async function handleBind(event, openid) {
  const target = normalizeOwnerId(event.ownerId)
  if (!isValidOwnerId(target)) {
    return { ok: false, code: 'BAD_OWNER', error: '同步码格式不对（至少 8 位字母或数字）' }
  }
  await ensureCollection()

  if (await isOwnerTakenByOther(target, openid)) {
    return { ok: false, code: 'OWNER_TAKEN', error: '这个账本已绑定其他微信' }
  }
  await saveAccount(openid, target)
  return { ok: true, ownerId: target }
}

exports.main = async (event = {}) => {
  const action = event.action || 'resolve'
  const allowed = ['resolve', 'bind', 'reset', 'createMiniCode']
  if (!allowed.includes(action)) {
    return { ok: false, code: 'BAD_ACTION', error: '未知操作：' + action }
  }

  // 安卓 App 调用的动作：不需要微信 OPENID
  if (action === 'createMiniCode') {
    try {
      return await handleCreateMiniCode(event)
    } catch (e) {
      console.error('[account] createMiniCode failed:', e)
      return { ok: false, code: 'INTERNAL', error: (e && (e.message || e.errMsg)) || String(e) }
    }
  }

  const { OPENID } = cloud.getWXContext()
  if (!OPENID) {
    return { ok: false, code: 'NO_OPENID', error: '未取到微信身份，请在小程序内使用' }
  }

  try {
    if (action === 'bind') return await handleBind(event, OPENID)
    if (action === 'reset') return await handleBind({ ...event, ownerId: newOwnerId() }, OPENID)
    return await handleResolve(event, OPENID)
  } catch (e) {
    console.error('[account] ' + action + ' failed:', e)
    return { ok: false, code: 'INTERNAL', error: (e && (e.message || e.errMsg)) || String(e) }
  }
}
