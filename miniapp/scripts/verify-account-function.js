/**
 * account 云函数模拟数据库回归测试（不连真云）
 * 运行：node scripts/verify-account-function.js
 *
 * 用内存 Mock 替代 wx-server-sdk，覆盖：
 * 1) 首次认领本机旧同步码
 * 2) 同一微信再次进入 → 返回同一个 ownerId（换手机找回）
 * 3) 另一个微信想认领同一个码 → OWNER_TAKEN
 * 4) 高级 bind 换到另一个账本
 * 5) 高级 reset 换一个全新账本
 */
const assert = require('node:assert')
const path = require('node:path')
const Module = require('node:module')

// ---------- 内存数据库 Mock ----------
const collections = new Map()
function ensure(name) {
  if (!collections.has(name)) collections.set(name, [])
}
function matches(doc, query) {
  return Object.keys(query).every((k) => doc[k] === query[k])
}
function makeQuery(name, query) {
  let limitN = Infinity
  return {
    limit(n) { limitN = n; return this },
    async get() {
      ensure(name)
      return { data: collections.get(name).filter((d) => matches(d, query)).slice(0, limitN) }
    },
  }
}
const db = {
  async createCollection(name) { ensure(name) },
  collection(name) {
    ensure(name)
    return {
      where(query) { return makeQuery(name, query) },
      doc(id) {
        return {
          async set({ data }) {
            const list = collections.get(name)
            const i = list.findIndex((d) => d._id === id)
            const doc = { _id: id, ...data }
            if (i >= 0) list[i] = doc
            else list.push(doc)
          },
        }
      },
    }
  },
}

let currentOpenid = ''
const cloudMock = {
  DYNAMIC_CURRENT_ENV: 'test-env',
  init() {},
  database() { return db },
  getWXContext() { return { OPENID: currentOpenid } },
  openapi: {
    wxacode: {
      async getUnlimited(opts) {
        assert.strictEqual(opts.page, 'pages/pair/index')
        assert.ok(String(opts.scene || '').startsWith('p='))
        return { buffer: Buffer.from('fake-png') }
      },
    },
  },
}

// 让 index.js 里的 require('wx-server-sdk') 拿到 Mock
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return cloudMock
  return origLoad.call(this, request, parent, isMain)
}

const { main } = require(path.join(__dirname, '..', 'cloudfunctions', 'account', 'index.js'))

async function call(openid, data) {
  currentOpenid = openid
  return main(data)
}

;(async () => {
  // 1) 首次认领
  let r = await call('openid-A', { action: 'resolve', claimOwnerId: 'ABCD-2345-EFGH' })
  assert.deepStrictEqual(r, { ok: true, ownerId: 'ABCD2345EFGH', isNew: true }, '首次认领')

  // 2) 同一微信再次进入 → 同一个 ownerId
  r = await call('openid-A', { action: 'resolve', claimOwnerId: 'ZZZZ2345YYYY' })
  assert.deepStrictEqual(r, { ok: true, ownerId: 'ABCD2345EFGH', isNew: false }, '重复进入返回同一账本')

  // 3) 另一个微信抢同一个码 → OWNER_TAKEN
  r = await call('openid-B', { action: 'resolve', claimOwnerId: 'ABCD2345EFGH' })
  assert.strictEqual(r.ok, false, '抢码失败')
  assert.strictEqual(r.code, 'OWNER_TAKEN', '抢码错误码')

  // 4) 高级 bind：B 绑到自己的新账本
  r = await call('openid-B', { action: 'bind', ownerId: 'WXYZ2345QRST' })
  assert.deepStrictEqual(r, { ok: true, ownerId: 'WXYZ2345QRST' }, 'bind 成功')

  // 5) 高级 reset：B 换成全新账本，不再等于 bind 的码
  r = await call('openid-B', { action: 'reset' })
  assert.strictEqual(r.ok, true, 'reset 成功')
  assert.ok(/^[A-Z0-9]{12}$/.test(r.ownerId), 'reset 返回 12 位账本码')
  assert.notStrictEqual(r.ownerId, 'WXYZ2345QRST', 'reset 确实换了新码')

  // 6) 无 openid 调用 → NO_OPENID（微信身份动作必须在小程序内）
  r = await call('', { action: 'resolve' })
  assert.strictEqual(r.code, 'NO_OPENID', '小程序外调用被拒')

  // 7) createMiniCode 不需要 openid，返回 base64 小程序码
  r = await call('', { action: 'createMiniCode', pairToken: 'abcd1234efgh5678' })
  assert.strictEqual(r.ok, true, '生成小程序码成功')
  assert.strictEqual(r.imageBase64, Buffer.from('fake-png').toString('base64'), '返回 base64 图片')

  console.log('account 云函数模拟数据库回归：7 项全部通过')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
