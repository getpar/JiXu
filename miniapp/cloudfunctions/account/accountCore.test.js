/** accountCore 纯逻辑自测：node accountCore.test.js */
const assert = require('node:assert')
const { newOwnerId, normalizeOwnerId, isValidOwnerId, decideAccount } = require('./accountCore')

// 1) 生成规则：12 位、字符集内
for (let i = 0; i < 200; i++) {
  const id = newOwnerId()
  assert.strictEqual(id.length, 12)
  assert.ok(/^[A-Z0-9]{12}$/.test(id))
  assert.ok(!/[IOU]/.test(id))
}

// 2) 归一化
assert.strictEqual(normalizeOwnerId(' abcd-2345 efgh '), 'ABCD2345EFGH')
assert.strictEqual(normalizeOwnerId(null), '')
assert.strictEqual(normalizeOwnerId(undefined), '')

// 3) 合法性
assert.ok(isValidOwnerId('ABCD2345'))
assert.ok(!isValidOwnerId('ABCD234'))
assert.ok(!isValidOwnerId('abcd2345'))

// 4) 已有映射优先
assert.deepStrictEqual(
  decideAccount({ existingOwnerId: 'EXIST2345ABC', claimOwnerId: 'CLAIM2345ABC', claimTakenByOther: false }),
  { ownerId: 'EXIST2345ABC', isNew: false },
)

// 5) 首次认领本机旧码
assert.deepStrictEqual(
  decideAccount({ existingOwnerId: null, claimOwnerId: 'claim-2345-abc', claimTakenByOther: false }),
  { ownerId: 'CLAIM2345ABC', isNew: true },
)

// 6) 旧码被别的微信占用
assert.deepStrictEqual(
  decideAccount({ existingOwnerId: null, claimOwnerId: 'CLAIM2345ABC', claimTakenByOther: true }),
  { error: 'OWNER_TAKEN' },
)

// 7) 没旧码 → 用注入生成器
assert.deepStrictEqual(
  decideAccount({ existingOwnerId: null, claimOwnerId: '', claimTakenByOther: false, generate: () => 'GENERATED123' }),
  { ownerId: 'GENERATED123', isNew: true },
)

console.log('accountCore: all assertions passed')
