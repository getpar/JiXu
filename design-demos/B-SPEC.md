# B · 夜航 · 仪表 — 三端落地规格

源文件（唯一视觉基准）：`design-demos/b-instrument/`（`style.css` 令牌与组件、`app.js` 结构与交互）。
本文是三端移植时的速查表；与 demo 冲突时以 demo 为准。

## 1. 令牌

| 语义 | 深色（默认） | 浅色 |
|---|---|---|
| bg 页面底 | `#0A0B0D` | `#ECEDE9` |
| p1 面板 | `#111316` | `#F8F8F5` |
| p2 面板浮起 / hover | `#171A1E` | `#FFFFFF` |
| p3 按压 | `#1E2227` | `#E4E5E0` |
| ln 发丝线 | `rgba(255,255,255,.08)` | `rgba(0,0,0,.09)` |
| ln2 强线 | `rgba(255,255,255,.16)` | `rgba(0,0,0,.16)` |
| tx 主文字 | `#E9EBEE` | `#0C0D0F` |
| dim 次文字 | `#8B919A` | `#5E636B` |
| fnt 弱文字 | `#555B64` | `#9AA0A6` |
| acF 强调填充 | `#D4FF3F` | `#D4FF3F` |
| onAc 强调上的字 | `#0A0B0D` | `#0C0D0F` |
| ac 强调描边/文字 | `#D4FF3F` | `#4B6400` |
| acS 强调底 | `rgba(212,255,63,.12)` | `rgba(75,100,0,.09)` |
| amb 警示 | `#FFB020` | `#B26A00` |
| cor 危险 | `#FF5B45` | `#C8321E` |
| inc 收入 | `#3FE0A5` | `#0F7A55` |
| grid 网格线 | `rgba(255,255,255,.05)` | `rgba(0,0,0,.06)` |

强调色只占屏幕 ≤5%：主按钮、当前读数、焦点环、今天。绝不做大面积底色。

## 2. 字体

- 数字与英文微标签：**Martian Mono**（300/400/500/700）。金额、时间、百分比、模块编号、`0–9` 键盘、`ENTER` 等。
- 拉丁正文：**Inter Tight**。
- 中文：系统黑体栈 `"PingFang SC","HarmonyOS Sans SC","MiSans","Microsoft YaHei UI","Microsoft YaHei",system-ui`。
- 字距：金额 `-.02em`；微标签 `letter-spacing:.12em; text-transform:uppercase`。
- 字号（桌面）：模块标题 14/700；微标签 10；正文 13；表格 13；主金额 112（首页）/ 64（统计）；微读数 22。
- 手机：主金额 60，模块标题 14，微标签 9，正文 12.5。

## 3. 布局

- 桌面：左 84px 图标轨（顶部 logo 方块、页面图标 + 竖排中文、底部系统组）→ 顶栏 48px（左：`NN · 标题 EN`；中：日期 时间 LOCAL；右：同步胶囊 + 同步码 + 主题 + `+ 记一笔`）→ 内容区 `max-width:1520; padding:24`，卡片间距 16，12 列网格。
- 手机：无左轨；页面顶部一行标题 + 同步 + 主题；底部固定 64px 标签栏（5 项，中间凸起圆形「+」），`env(safe-area-inset-bottom)`。
- 平板 600–1023：保留左轨，内容两列。

## 4. 组件配方

**模块 `.mod`**：1px `ln` 边框、直角（`--r:2px`）、内边距 16/20；四角有 6px 的角标（`::before/::after` 用两条 1px 渐变线画 L 形）；头行 `.mh`：编号（mono 9px `fnt`）+ 标题（14/700）+ 英文微标签（`dim`）+ 右侧插槽。

**金额 `.amt-hero`**：mono 300，`¥` 28px `dim`，整数 112px，小数 40px `dim`，基线下沉 8px。

**分段 `.seg`**：外框 1px `ln2`，内 2px padding；选中项填 `acF`、文字 `onAc`、700；未选中 `dim`。高度 32（手机 38）。

**筹码 `.chip`**：胶囊，1px `ln`，32 高（手机 38）；选中 `tx` 底 + `bg` 字。

**小按钮 `.mini`**：28 高（手机 38），1px `ln2`，12px 字；主操作 `.mini.ac` 填 `acF`。

**开关 `.tg`**：40×24（手机 46×28），圆角全，开= `acF` 底 + 深色圆点。

**列表行 `.rw`**：网格；桌面 `图标 28 | 文字 1fr | 人 44 | 时间 16 | 小票 | 金额`，行高 48，`padding 6 8`，下边框 `ln`；悬停 `p2`。手机改为 `图标 34 | 文字 1fr | 金额` 两行（第二行 `人 · 时间 · 小票`），行高 58，左滑露出 136px 的「编辑 / 删除」。

**日期分隔 `.dh`**：高 36，`p2` 底，左「今天」700 + `11.05 周四` dim，右 `5 笔` + `−199.00`。

**表盘（预算）**：SVG 270° 弧，刻度每天一格；已用弧用 `amb`（超节奏）/ `acF`（正常）；虚线为匀速参考；中心「剩余可花」+ 日均 + 剩余天数。

**环形（分类构成）**：SVG 环，段间 1.4° 间隙，选中段 100% 不透明、其余 0.24–0.7；中心显示名次 / 分类 / 金额 / 占比。

**走势（每日）**：细柱，`tx` 82%；今天 `ac`；超刻度用条纹；未到的日子只画 3px 基线刻度。悬停/点按出竖线读数，默认不显示。

**六月对比**：每列两根柱（支出实心 `tx`，收入斜纹 `inc`），当前月支出用 `ac`；数值标签在柱顶上方 13px，最后一列右对齐。

## 5. 动效（只能动 transform / opacity）

- 时长：按压 90ms，悬停 120ms，切换 260ms，入场 420ms；曲线 `cubic-bezier(.2,.7,.1,1)`。
- 页面切换：旧页 `opacity` 1→0（140ms），新页 `translateY(6px)` + fade in（260ms）；模块入场按 40ms 递增，最多 8 个。
- 保存：扫描线扫过 LCD + 指示灯闪 + 行滑入；撤销 toast 从底部推入。
- 尊重 `prefers-reduced-motion`：全部降为 0.01ms 的瞬时状态。

## 6. 三端映射

| 概念 | 桌面 (React) | 小程序 (Taro) | 安卓 (Compose) |
|---|---|---|---|
| 令牌 | CSS 变量 `:root[data-theme]` | SCSS 变量 + `page` 类 | `Color.kt` + `MaterialTheme` 自定义扩展 |
| 面板角标 | `::before/::after` 渐变 | 伪元素（支持） | `drawWithContent` 画四角线 |
| 网格 | CSS grid | flex + 百分比（grid 兼容差，用 flex 为主） | `Row/Column` + `weight` |
| 数字字体 | `@font-face` Martian Mono | 内嵌 woff→base64 或系统等宽（体积优先时用 `font-family: monospace`） | 打包 ttf 到 `res/font` |
| 动效 | CSS transition / Web Animations | CSS + `transform` | `animateFloatAsState` / `AnimatedVisibility` |
| 暗色 | `html[data-theme]` | `app.scss` 变量 + `wx.setBackgroundColor` | `isSystemInDarkTheme` / 本地偏好 |

## 7. 不能动的东西

- 所有 IPC 通道名、数据结构、云同步字段（`cloud_id` / `updatedAt` / `deleted` / 凭条队列）、金额精度处理（分）、月份分片存储、金标准 fixtures。
- 三端一致性：任何 UI 改动不得改变写入语义、同步触发时机、去重键。
