/**
 * 导出 Android（Kotlin）端一致性金标准 → android/fixtures/
 *
 * 运行：cd miniapp && npm run export:android
 *
 * 1. golden-vectors.json：金额格式化/校验、去重键、同步码、周期推算的「输入 → 输出」对照表，
 *    全部由线上 TS 源码（cloudCore.ts / money.ts / dates.ts）实时算出。
 * 2. sync-traces.json：跑一遍 verify-sync.js 全部场景，把小程序引擎每次 runSync 的
 *    全部输入（云端文档、本地行、待上传凭条、实体快照、时钟）与全部对外调用（上传了什么、
 *    让本地入账/标删/复活/物理删多少、回写什么实体）按顺序录下来。
 *    Kotlin 引擎喂同样的输入，必须产生逐条相同的调用序列 —— 这是三端对账一致的硬门槛。
 * verify-sync 有任何一项失败则不写文件（失败的运行不能当金标准）。
 */
const fs = require('fs')
const path = require('path')

const OUT_DIR = path.join(__dirname, '..', '..', 'android', 'fixtures')
const BUILD = path.join(__dirname, '..', '.sync-verify')
const core = require(path.join(BUILD, 'cloudCore.js'))
const money = require(path.join(BUILD, 'money.js'))
const dates = require(path.join(BUILD, 'dates.js'))

const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)))

// ---------- 1. 金标准对照表 ----------

function goldenVectors() {
  const rec = (amount) => ({ date: '2026-11-03', amount, subcategoryKey: 'lunch', type: 'expense' })
  const amounts = [25, 2, 2400, 18, 12.5, 0.1, 0.5, 100.05, 1234567.89, 999999999.99, 0.1 + 0.2, 1.1e125, 1e21, 1e-7, 0.000001, 123456789.12, 30.1, 19.99]
  const fm = [
    [0, 2], [1234.5, 2], [99999.99, 2], [99999999, 2], [123456789, 2], [1e12, 2], [9999.995, 2], [0.005, 2], [1.005, 2],
    [-1234.5, 2], [2.2e125, 2], [NaN, 2], [Infinity, 2], [123456789, 1], [15000, 1], [8888, 0], [0.4, 0], [99995, 1],
  ]
  const fme = [0, 123456, 0.1 + 0.2, 1.005, -5.5, 999999999.99, 1e12, 1.1e125, NaN, -Infinity]
  const parseIn = ['', '.', '0', '0.00', '12', '12.3', '12.34', '12.345', '1.', '.5', '12.3.4', '1e5', 'abc', '999999999.99', '1000000000', '1,234.5', ' 8 ', '-5', '0012', '9999999999.99']
  const sanIn = ['', 'abc', '12.3.4', '1e5', '00012', '0.123', '12345678901234', '¥12.5', '1,234.56', '.5', '1.', '0', '00.5', '1E3']
  const sums = [[0.1, 0.2], [1.005, 2.005], [NaN, 5, Infinity, 1.5], [], [19.99, 0.01, 30]]
  const adv = [
    ['2026-01-31', 'monthly'], ['2024-01-31', 'monthly'], ['2026-03-31', 'monthly'], ['2026-12-31', 'monthly'], ['2026-12-15', 'monthly'],
    ['2026-02-28', 'monthly'], ['2024-02-29', 'yearly'], ['2023-02-28', 'yearly'], ['2026-07-31', 'yearly'],
    ['2026-02-28', 'daily'], ['2024-02-28', 'daily'], ['2026-12-31', 'daily'], ['2026-12-29', 'weekly'], ['2026-02-25', 'weekly'],
    ['2026-11-03', 'once'], ['2026-11-03', 'unknown'],
  ]
  const owners = ['abcd-efgh-jkmn', ' ab cd 12 34 ', 'ABCD1EFG2HJK', 'abc', '', 'ab_cd-ef.gh!ij']
  return {
    _说明: '由 miniapp/scripts/export-android-fixtures.js 从线上 TS 源码实时生成，勿手改。数字 NaN/Infinity 在 JSON 里写成字符串 "NaN"/"Infinity"/"-Infinity"。',
    amountToKeyString: amounts.map((a) => ({ amount: num(a), key: core.recordKey(rec(a)) })),
    parseRecordKey: ['2026-11-03|25|lunch|expense', '2026-11-03|12.5|snack|income', 'a|b|c', '2026-11-03|abc|lunch|expense', '', '2026-11-03|1e+21|x|expense']
      .map((k) => ({ key: k, result: clone(core.parseRecordKey(k)) })),
    formatMoney: fm.map(([v, d]) => ({ value: num(v), decimals: d, result: money.formatMoney(v, d) })),
    formatMoneyExact: fme.map((v) => ({ value: num(v), result: money.formatMoneyExact(v) })),
    parseAmountInput: parseIn.map((s) => ({ input: s, result: money.parseAmountInput(s) })),
    sanitizeAmountInput: sanIn.map((s) => ({ input: s, result: money.sanitizeAmountInput(s) })),
    sumAmounts: sums.map((l) => ({ values: l.map(num), result: money.sumAmounts(l) })),
    isValidAmount: [0, 0.01, 5, 999999999.99, 1e9, -1, NaN, Infinity].map((v) => ({ value: num(v), result: money.isValidAmount(v) })),
    isSuspiciousAmount: [5, 999999999.99, 1e9, NaN, Infinity].map((v) => ({ value: num(v), result: money.isSuspiciousAmount(v) })),
    advanceDate: adv.map(([d, c]) => ({ date: d, cycle: c, result: dates.advanceDate(d, c) })),
    normalizeOwnerId: owners.map((s) => ({ input: s, result: core.normalizeOwnerId(s) })),
    formatOwnerId: ['ABCD1EFG2HJK', 'ABCDEFGH', 'ABC', ''].map((s) => ({ input: s, result: core.formatOwnerId(s) })),
    isValidOwnerId: ['ABCD1EFG2HJK', 'ABCDEFGH', 'ABCDEFG', 'abcdefgh', 'ABCD-EFGH', ''].map((s) => ({ input: s, result: core.isValidOwnerId(s) })),
    docLabel: [
      { date: '2026-11-03', categoryName: '餐饮饮食', subcategoryName: '午餐', amount: 25, note: '公司楼下', type: 'expense', subcategoryKey: 'lunch', categoryKey: 'food' },
      { date: '2026-11-03', categoryName: '', subcategoryName: '', categoryKey: 'pet', subcategoryKey: 'pet_food', amount: 1.1e125, note: '', type: 'expense' },
    ].map((r) => ({ record: r, result: core.docLabel(r) })),
    cloudToLocal: [{ _id: 'abc123', type: 'expense', amount: 25, categoryKey: 'food', categoryName: '餐饮饮食', subcategoryKey: 'lunch', subcategoryName: '午餐', note: '', date: '2026-11-03', updatedAt: 1790000000000, source: 'desktop', ownerId: 'ABCD1EFG2HJK' },
      { _id: 'def456', type: 'income', amount: 8000, categoryKey: 'finance', categoryName: '', subcategoryKey: 'invest', subcategoryName: '', note: '工资', person: '我', date: '2026-11-01', createdAt: 1789000000000, updatedAt: 1790000000000 }]
      .map((r) => ({ cloud: r, local: core.cloudToLocal(r) })),
    localToCloud: [{ id: '1790000000000', type: 'expense', amount: 18, categoryKey: 'food', categoryName: '餐饮饮食', subcategoryKey: 'snack', subcategoryName: '零食饮料', note: '拿铁', date: '2026-11-03', deleted: 1, reviveCount: 2 }]
      .map((r) => ({ local: r, source: 'android', now: 1790000000500, ownerId: 'ABCD1EFG2HJK', cloud: core.localToCloud(r, 'android', 1790000000500, 'ABCD1EFG2HJK') })),
  }
}

function num(v) {
  if (Number.isNaN(v)) return 'NaN'
  if (v === Infinity) return 'Infinity'
  if (v === -Infinity) return '-Infinity'
  return v
}

// ---------- 2. 同步引擎调用录像 ----------

const traces = []
let scenario = '(未开始)'
const origLog = console.log
console.log = (...args) => {
  const s = args.map(String).join(' ')
  const m = s.match(/【场景[^】]*】.*/)
  if (m) scenario = m[0]
  origLog(...args)
}

const origRunSync = core.runSync
core.runSync = async function tracedRunSync(deps) {
  const t = { scenario, source: deps.source, legacySources: deps.legacySources || [], ownerId: deps.ownerId, inputs: {}, calls: [], result: null }
  const call = (fn, args, ret) => { t.calls.push({ fn, ...clone(args), ret: clone(ret) }); return ret }
  const input = (name, v) => { if (name in t.inputs) throw new Error(`引擎重复读取输入 ${name}，录像格式需要扩展`); t.inputs[name] = clone(v); return v }
  const wrapSpec = (name, spec) => spec && {
    getLocal: async () => input(`${name}Local`, await spec.getLocal()),
    apply: async (items) => call(`${name}.apply`, { items }, await spec.apply(items)),
  }
  const wrapped = {
    ...deps,
    cloud: {
      listAll: async (owner) => input('cloudDocs', await deps.cloud.listAll(owner)),
      add: async (doc) => call('cloud.add', { doc }, await deps.cloud.add(doc)),
    },
    getLocal: async () => input('local', await deps.getLocal()),
    addLocal: async (records) => call('addLocal', { records }, await deps.addLocal(records)),
    markLocal: async (key, count) => call('markLocal', { key, count }, await deps.markLocal(key, count)),
    markAlive: async (key, count) => call('markAlive', { key, count }, await deps.markAlive(key, count)),
    purgeLocal: deps.purgeLocal && (async (key, count) => call('purgeLocal', { key, count }, await deps.purgeLocal(key, count))),
    purges: deps.purges && {
      getPending: () => input('pendingPurges', deps.purges.getPending()),
      clearPending: (pids) => { call('purges.clearPending', { pids }, null); deps.purges.clearPending(pids) },
    },
    store: { get: (k) => deps.store.get(k), set: (k, v) => { call('store.set', { key: k, value: v }, null); deps.store.set(k, v) } },
    todos: wrapSpec('todos', deps.todos),
    recurring: wrapSpec('recurring', deps.recurring),
    now: () => { const v = deps.now ? deps.now() : Date.now(); t.inputs.now = v; return v },
  }
  t.capabilities = { purgeLocal: !!deps.purgeLocal, purges: !!deps.purges, todos: !!deps.todos, recurring: !!deps.recurring }
  const res = await origRunSync(wrapped)
  t.result = clone(res)
  traces.push(t)
  return res
}

process.on('exit', (code) => {
  console.log = origLog
  if (code !== 0) { console.error('[export-android-fixtures] verify-sync 未全部通过，不导出金标准'); return }
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const vectors = goldenVectors()
  fs.writeFileSync(path.join(OUT_DIR, 'golden-vectors.json'), JSON.stringify(vectors, null, 2) + '\n')
  fs.writeFileSync(path.join(OUT_DIR, 'sync-traces.json'), JSON.stringify({
    _说明: '由 miniapp/scripts/export-android-fixtures.js 录制 verify-sync.js 全部场景生成，勿手改。每条 = 一次 runSync：inputs 为引擎读到的全部输入，calls 为引擎按顺序发出的全部调用（ret = 该调用的返回值，回放时原样喂回），result 为最终返回。',
    traces,
  }, null, 1) + '\n')
  console.log(`[export-android-fixtures] 已导出 ${traces.length} 次同步录像 + ${Object.keys(vectors).length - 1} 组金标准 → ${path.relative(process.cwd(), OUT_DIR)}`)
})

require('./verify-sync.js')
