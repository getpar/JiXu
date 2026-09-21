/** v0.7.0 暗色模式一次性换色脚本：把各页面 scss 的"结构性颜色"替换为 CSS 变量
 * 只替换：主/次/弱/淡文字色、卡片白底、浅灰底、边框线；强调色（橙红绿蓝紫等 chip 配色）全部保留
 * 运行：node scripts/apply-dark-theme.js（在 miniapp 目录下）
 */
const fs = require('fs')
const path = require('path')

const pagesDir = path.join(__dirname, '..', 'src', 'pages')

// [正则, 替换] —— 逐行应用；.wrap 行特殊处理（页面背景 → var(--bg)）
const RULES = [
  [/color:\s*#1E293B\b/gi, 'color: var(--text)'],
  [/color:\s*#334155\b/gi, 'color: var(--text)'],
  [/color:\s*#64748B\b/gi, 'color: var(--sub)'],
  [/color:\s*#94A3B8\b/gi, 'color: var(--muted)'],
  [/color:\s*#CBD5E1\b/gi, 'color: var(--faint)'],
  [/background(-color)?:\s*#FFFFFF\b/gi, 'background: var(--card)'],
  [/background(-color)?:\s*#FFF\b/gi, 'background: var(--card)'],
  [/background(-color)?:\s*#F1F5F9\b/gi, 'background: var(--soft)'],
  [/background(-color)?:\s*#F8FAFC\b/gi, 'background: var(--soft)'],
  [/background(-color)?:\s*#FFFBF8\b/gi, 'background: var(--soft)'],
  [/background(-color)?:\s*#EEF2FF\b/gi, 'background: var(--soft)'],
  [/background(-color)?:\s*#E2E8F0\b/gi, 'background: var(--line)'],
  [/solid\s+#E2E8F0\b/gi, 'solid var(--line)'],
  [/solid\s+#F1F5F9\b/gi, 'solid var(--soft)'],
  [/solid\s+#F8FAFC\b/gi, 'solid var(--soft)'],
  [/solid\s+#CBD5E1\b/gi, 'solid var(--line)'],
]

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p) : p.endsWith('.scss') ? [p] : []
  })
}

let totalHits = 0
for (const file of walk(pagesDir)) {
  const src = fs.readFileSync(file, 'utf8')
  const out = src.split('\n').map((line) => {
    if (line.includes('.wrap')) {
      // 页面根容器背景一律换成页面底色变量
      const wrapped = line.replace(/background(-color)?:\s*#[0-9A-Fa-f]{3,8}\b/gi, 'background: var(--bg)')
      totalHits += wrapped === line ? 0 : 1
      return wrapped
    }
    let cur = line
    for (const [re, rep] of RULES) {
      const before = cur
      cur = cur.replace(re, rep)
      if (cur !== before) totalHits++
    }
    return cur
  }).join('\n')
  if (out !== src) {
    fs.writeFileSync(file, out, 'utf8')
    console.log('updated:', path.relative(path.join(__dirname, '..'), file))
  }
}
console.log('total replacements:', totalHits)

// 剩余 hex 统计（应只剩强调色）
const left = {}
for (const file of walk(pagesDir)) {
  for (const m of fs.readFileSync(file, 'utf8').matchAll(/#[0-9A-Fa-f]{3,8}\b/g)) {
    left[m[0].toUpperCase()] = (left[m[0].toUpperCase()] || 0) + 1
  }
}
console.log('remaining hex colors (accent, expected):', JSON.stringify(left))
