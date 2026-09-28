/**
 * 每日到期提醒云函数（v0.9.2）
 *
 * 定时触发器每天 08:00 运行：扫描集合 push_subs 里「今天到期 / 已逾期」的待办，
 * 对还有「订阅额度」的用户下发一条订阅消息（微信「服务通知」）。
 *
 * 背景：微信只给普通小程序开放「一次性订阅」——用户授权一次 = 1 条发送额度。
 * 前端每次拿到一次授权就把 remaining +1，这里每成功发送一条就 -1。
 *
 * ⚠️ 使用前必做（详见 cloudfunctions/README.md）：
 *   1. 在微信公众平台申请订阅消息模板，把模板 ID 填到下面的 TEMPLATE_ID ✅ 已填
 *   2. 核对 buildData() 的字段名与你模板「详细内容」的占位符一致 ✅ 已对齐
 *      （当前模板：thing2 提醒内容 / thing13 计划标题 / thing10 事项名称 / time3 到期日期 / time9 创建日期）
 *   3. 集合 push_subs 无需手动建 —— ensureCollection() 会自动创建
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const COLLECTION = 'push_subs'

// ⚠️⚠️ 替换为你在公众平台申请到的订阅消息模板 ID（形如 8 位以上的一串字符）
const TEMPLATE_ID = '6vnLtfnk_r7n7IpsCVJU06ZWRhKWD9v0Do2A6THWsZ8'

// 用户点击消息后跳转到的小程序页面
const TARGET_PAGE = 'pages/todos/index'

// 消息下发的小程序版本：正式版用 'formal'；用开发版/体验版测试时改成 'developer' / 'trial'
const MINIPROGRAM_STATE = 'formal'

// 单次运行最多处理多少条
const MAX_PER_RUN = 200

/** 北京时间的 YYYY-MM-DD（云函数时区不保证，这里显式 +8 小时算） */
function beijingDateStr(d) {
  const t = new Date((d ? d.getTime() : Date.now()) + 8 * 3600 * 1000)
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

/** 北京时间的 "YYYY-MM-DD HH:mm:ss"（微信 time 类型要求的格式，如 2020-07-28 09:58:44） */
function beijingDateTimeStr(ts) {
  const base = ts == null ? Date.now() : (ts instanceof Date ? ts.getTime() : Number(ts))
  const t = new Date(base + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`
}

/**
 * 组装消息内容。
 * ⚠️ 字段名必须与「公众平台 → 订阅消息 → 我的模板」里该模板的占位符**完全一致**，否则报 47003。
 * 本模板（标题「待办事项提醒」，模版编号 4890，类目「记账」）的字段是：
 *   提醒内容 thing2 / 计划标题 thing13 / 事项名称 thing10 / 到期日期 time3 / 创建日期 time9
 * 若以后换模板，请对照新模板的「详细内容」逐个改这里的 key。
 */
function buildData(item) {
  // thing 类型：20 个字符以内
  const title = String(item.title || '待办提醒').slice(0, 20)
  const note = String(item.note || '今天有件事该做啦').slice(0, 20)
  // 到期日期：待办本身只存了日期（YYYY-MM-DD），补一个早 8 点
  const dueStr = /^\d{4}-\d{2}-\d{2}$/.test(String(item.dueDate || ''))
    ? `${item.dueDate} 08:00:00`
    : beijingDateTimeStr()
  // 创建日期：优先用文档里的 createdAt，没有就用当前时间
  const createdStr = item.createdAt ? beijingDateTimeStr(item.createdAt) : beijingDateTimeStr()

  return {
    thing2: { value: note },     // 提醒内容
    thing13: { value: title },   // 计划标题
    thing10: { value: title },   // 事项名称
    time3: { value: dueStr },    // 到期日期
    time9: { value: createdStr },// 创建日期
  }
}

/** 分页拉取 dueDate <= today 的文档（单次 get 上限 100 条） */
async function fetchCandidates(today) {
  const out = []
  const PAGE = 100
  for (let skip = 0; skip < 2000; skip += PAGE) {
    const res = await db.collection(COLLECTION)
      .where({ dueDate: _.lte(today) })
      .skip(skip).limit(PAGE).get()
    out.push(...res.data)
    if (res.data.length < PAGE) break
  }
  return out
}

/**
 * 确保 push_subs 集合存在。
 * 云函数以「管理员权限」运行，可以自己建集合 —— 这样用户就不必在云开发控制台手动建，
 * 找不到「云开发」入口也能跑通。已存在时静默跳过（幂等）。
 */
async function ensureCollection() {
  try {
    await db.createCollection(COLLECTION)
    return 'created'
  } catch (e) {
    // 已存在 / 并发创建 等错误都视为「已就绪」
    return 'exists'
  }
}

/**
 * 「立即测试一条」：给当前调用者马上发一条，用来验证模板字段/额度是否正常。
 * 前端在小程序里点「立即测试一条」时触发，省去用户去云开发控制台手动跑函数。
 */
async function sendNow() {
  const openid = cloud.getWXContext().OPENID
  if (!openid) return { ok: false, reason: '未取到 openid（请从小程序内调用）' }

  const res = await db.collection(COLLECTION).where({ _openid: openid }).limit(1).get()
  const item = res.data && res.data[0]
  if (!item) {
    return { ok: false, reason: '还没有订阅记录，请先点「开启到期提醒」并允许通知' }
  }

  try {
    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId: TEMPLATE_ID,
      page: TARGET_PAGE,
      data: buildData(item),
      miniprogramState: MINIPROGRAM_STATE,
    })
    await db.collection(COLLECTION).doc(item._id).update({
      data: { remaining: _.inc(-1), updatedAt: Date.now() },
    })
    return { ok: true, action: 'sendNow', sent: 1 }
  } catch (e) {
    return { ok: false, action: 'sendNow', code: e && e.errCode, msg: e && e.errMsg }
  }
}

exports.main = async (event) => {
  const today = beijingDateStr()

  // 前端「开启到期提醒」时若发现集合不存在，会调这里让云函数补建
  if (event && event.action === 'ensureCollection') {
    const r = await ensureCollection()
    return { ok: true, action: 'ensureCollection', collection: r }
  }

  if (!TEMPLATE_ID || TEMPLATE_ID.indexOf('REPLACE') === 0) {
    return { ok: false, reason: '未配置 TEMPLATE_ID，请在 cloudfunctions/dailyReminder/index.js 中填写' }
  }

  // 集合存在性（幂等，已存在时无副作用）
  await ensureCollection()

  // 前端「立即测试一条」
  if (event && event.action === 'sendNow') {
    return await sendNow()
  }

  const candidates = await fetchCandidates(today)
  const todo = candidates
    .filter((it) => it.dueDate && (it.remaining || 0) > 0 && it.sentFor !== it.dueDate)
    .slice(0, MAX_PER_RUN)

  let sent = 0
  let noQuota = 0
  const errors = []

  for (const item of todo) {
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: item._openid,
        templateId: TEMPLATE_ID,
        page: TARGET_PAGE,
        data: buildData(item),
        miniprogramState: MINIPROGRAM_STATE,
      })
      sent++
      await db.collection(COLLECTION).doc(item._id).update({
        data: { remaining: _.inc(-1), sentFor: item.dueDate, updatedAt: Date.now() },
      })
    } catch (e) {
      const code = e && e.errCode
      if (code === 43101) {
        // 用户拒收 / 已取消订阅：清零额度，之后不再尝试，避免每次空跑
        await db.collection(COLLECTION).doc(item._id).update({
          data: { remaining: 0, updatedAt: Date.now() },
        }).catch(() => {})
        noQuota++
      } else {
        errors.push({ id: item._id, code: code, msg: e && e.errMsg })
      }
    }
  }

  return { ok: true, date: today, candidates: candidates.length, tried: todo.length, sent, noQuota, errors }
}
