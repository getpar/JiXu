/** v0.7.0 一次性脚本：给全部页面根节点接入 theme-dark（挂 useThemeDark hook + 根 View 类名） */
const fs = require('fs')
const path = require('path')

const pages = ['add', 'categories', 'history', 'index', 'recurring', 'stats', 'todos']
for (const p of pages) {
  const f = path.join(__dirname, '..', 'src', 'pages', p, 'index.tsx')
  let s = fs.readFileSync(f, 'utf8')
  if (s.includes('useThemeDark')) { console.log('skip (already hooked):', p); continue }
  const before = s
  // 1. import（放在 './index.scss' 之前）
  s = s.replace(/import '\.\/index\.scss'/, "import { useThemeDark } from '../../utils/theme'\nimport './index.scss'")
  // 2. 组件函数体首行插入 hook
  s = s.replace(/(export default function \w+[^\n]*\{\r?\n)/, "$1  const dark = useThemeDark()\n")
  // 3. 根节点类名
  s = s.replace(/<View className='wrap'>/g, "<View className={`wrap${dark ? ' theme-dark' : ''}`}>")
  const ok = s.includes("useThemeDark()") && s.includes("theme-dark' : ''}")
  if (s !== before) { fs.writeFileSync(f, s); console.log(ok ? 'hooked:' : 'PARTIAL(check manually):', p) }
  else console.log('NO CHANGE (check):', p)
}
