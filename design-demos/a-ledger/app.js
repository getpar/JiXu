/* 计序 · 朱印账簿 Vermilion Ledger — demo A */
(function () {
  'use strict';
  const JX = window.JX, D = document, H = D.documentElement;
  const $ = (s, el) => (el || D).querySelector(s);
  const $$ = (s, el) => Array.from((el || D).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const ROUTES = ['home', 'add', 'history', 'stats', 'more'];
  const ZHM = ['', '一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  const ENM = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const ENW = { 周日: 'SUN', 周一: 'MON', 周二: 'TUE', 周三: 'WED', 周四: 'THU', 周五: 'FRI', 周六: 'SAT' };
  const TODAY = JX.TODAY, CUR = TODAY.slice(0, 7);
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const reduce = () => RM.matches;
  const desk = () => innerWidth >= 1024;
  const EASE = 'cubic-bezier(.2,.7,.1,1)';
  const SYNC_CODE = 'G4ZW-DHPW-KTEL';

  const dIn = (ym) => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
  const toD = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const addDays = (s, n) => { const d = toD(s); d.setDate(d.getDate() + n); return iso(d); };
  const diffDays = (a, b) => Math.round((toD(b) - toD(a)) / 864e5);
  const md = (s) => (+s.slice(5, 7)) + '月' + (+s.slice(8, 10)) + '日';
  const rel = (s) => { const n = diffDays(TODAY, s); return n === 0 ? '今天' : n === 1 ? '明天' : n === 2 ? '后天' : n > 0 ? n + ' 天后' : md(s); };
  const f0 = (n) => JX.fmt(n, { decimals: 0 });

  /* ---------- icons: 24 grid, 1.5 stroke, butt caps ---------- */
  const ic = (p, c) => `<svg class="ic${c ? ' ' + c : ''}" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const I = {
    l: ic('<path d="M14.5 5.5 8 12l6.5 6.5"/>'),
    r: ic('<path d="M9.5 5.5 16 12l-6.5 6.5"/>'),
    dn: ic('<path d="M6.5 9.5 12 15l5.5-5.5"/>'),
    x: ic('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
    ok: ic('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    search: ic('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>'),
    sync: ic('<path d="M19 12a7 7 0 0 1-12.3 4.6M5 12a7 7 0 0 1 12.3-4.6"/><path d="M17.8 3.8v4h-4M6.2 20.2v-4h4"/>'),
    rcpt: ic('<path d="M6.5 3.5h11v17l-1.8-1.3-1.9 1.3-1.8-1.3-1.8 1.3-1.9-1.3-1.8 1.3z"/><path d="M9.5 8h5M9.5 11.5h5M9.5 15h3"/>', 'rc'),
    pen: ic('<path d="M4.5 19.5h4l10-10-4-4-10 10z"/><path d="M12.5 7.5l4 4"/>'),
    del: ic('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5"/><path d="M10.5 10.5v6M13.5 10.5v6"/>'),
    sun: ic('<circle cx="12" cy="12" r="3.8"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>', 'sun'),
    moon: ic('<path d="M18.5 14.6A7.2 7.2 0 0 1 9.4 5.5a7.2 7.2 0 1 0 9.1 9.1z"/>', 'moon'),
    bk: ic('<path d="M9 5.5h11v13H9l-5.5-6.5z"/><path d="M12 9.5l5 5M17 9.5l-5 5"/>'),
    cam: ic('<path d="M3.5 8h4l1.6-2.5h5.8L16.5 8h4v11h-17z"/><circle cx="12" cy="13.2" r="3.4"/>'),
    clock: ic('<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>'),
    cal: ic('<path d="M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5V7M15.5 3.5V7"/>'),
    plus: ic('<path d="M12 5v14M5 12h14"/>'),
    multi: ic('<path d="M4.5 4.5h6v6h-6zM4.5 13.5h6v6h-6z"/><path d="M13.5 7.5h6M13.5 16.5h6"/>'),
    exp: ic('<path d="M12 3.5v11M7.5 8 12 3.5 16.5 8M4.5 14v6h15v-6"/>'),
    cloud: ic('<path d="M7 18.5h10.3a4 4 0 0 0 .4-8 5.9 5.9 0 0 0-11.4 1.7A3.2 3.2 0 0 0 7 18.5z"/>'),
    rep: ic('<path d="M4.5 11V7.5h13M14.5 4.5l3 3-3 3M19.5 13v3.5h-13M9.5 19.5l-3-3 3-3"/>'),
    copy: ic('<path d="M8.5 8.5h11v11h-11z"/><path d="M15.5 8.5V4.5h-11v11h4"/>')
  };
  const RECEIPT = '<svg class="rcpt-art" viewBox="0 0 40 52" aria-hidden="true"><path class="pa" d="M4 2h32v46l-4-3-4 3-4-3-4 3-4-3-4 3-4-3-4 3z"/><path class="ln" d="M10 11h20M10 17h14M10 23h18M10 29h10"/><path class="ln b" d="M10 37h20"/></svg>';

  const seal = (ck, c) => `<i class="seal${c ? ' ' + c : ''}" aria-hidden="true">${JX.cat[ck].glyph}</i>`;
  const m$ = (n, sign) => { const s = JX.splitMoney(n); return `<span class="m">${sign ? `<i class="sg">${sign}</i>` : ''}<i class="y">¥</i>${s.int}<i class="dc">.${s.dec}</i></span>`; };
  const DIG = Array.from({ length: 10 }, (_, i) => `<i>${i}</i>`).join('');
  const odo = (s) => [...s].map((ch) => (ch >= '0' && ch <= '9'
    ? `<span class="od"><span class="odc" data-v="${ch}" style="transform:translateY(-${ch * 10}%)">${DIG}</span></span>`
    : `<span class="ods">${ch}</span>`)).join('');

  /* ---------- state ---------- */
  const fresh = (keep) => ({ type: keep ? keep.type : 'expense', expr: '', cat: '', sub: '', date: keep ? keep.date : TODAY, time: JX.NOW_TIME, person: keep ? keep.person : '我', note: '', photo: false, err: '' });
  const S = {
    route: '', ym: CUR, sym: CUR, lvl: 'main',
    hf: { ym: 'all', type: 'all', cat: '', sub: '', q: '' },
    batch: false, sel: new Set(), form: fresh(), edit: '', sync: 'idle', synced: '2 分钟前',
    open: { sync: true }, trash: [], undo: null, seq: 0, theme: H.dataset.theme || 'light', themeMode: 'auto', exported: '', backedUp: ''
  };
  const FREQ = (() => {
    const m = {};
    JX.records.forEach((r) => { if (r.type === 'expense') { const k = r.categoryKey + '/' + r.subcategoryKey; m[k] = (m[k] || 0) + 1; } });
    return Object.keys(m).sort((a, b) => m[b] - m[a]).slice(0, 6).map((k) => k.split('/'));
  })();

  /* ---------- shared fragments ---------- */
  function syncHTML() {
    const st = S.sync, t = st === 'ing' ? '正在同步…' : st === 'done' ? '同步完成' : S.synced + '已同步';
    const icon = st === 'ing' ? I.sync : st === 'done' ? I.ok : '<i class="dot"></i>';
    return `<button class="sync s-${st}" data-act="sync" title="同步码 ${SYNC_CODE} · 点击立即同步"><span class="sy-i">${icon}</span><span class="sy-t">${t}</span></button>`;
  }
  const themeBtn = () => `<button class="ib theme-t" data-act="theme" aria-label="切换暗色模式">${I.moon}${I.sun}</button>`;
  const folio = (a, b) => `<footer class="folio"><span>P. ${pad(a)}</span><span>JIXU · VERMILION LEDGER · 2026</span><span>P. ${pad(b)}</span></footer>`;
  const sh = (zh, micro, right) => `<h3 class="sh"><span class="zh">${zh}</span>${micro ? `<span class="micro">${micro}</span>` : ''}${right ? `<span class="sh-r">${right}</span>` : ''}</h3>`;

  function hl(s, q) {
    s = esc(s);
    if (!q) return s;
    const re = new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return s.replace(re, (m) => `<mark>${m}</mark>`);
  }
  function rowHTML(r, q, hist) {
    const inc = r.type === 'income';
    return `<li class="row${inc ? ' inc' : ''}${S.sel.has(r.id) ? ' sel' : ''}" data-id="${r.id}">` +
      (hist ? `<div class="ra"><button class="ra-e" data-act="edit" aria-label="编辑">${I.pen}<span>编辑</span></button><button class="ra-d" data-act="del" aria-label="删除">${I.del}<span>删除</span></button></div>` : '') +
      `<div class="ri">${hist ? `<span class="ck" aria-hidden="true">${I.ok}</span>` : ''}<time class="rt">${r.time}</time>${seal(r.categoryKey)}` +
      `<span class="rm"><b>${hl(r.subcategoryName, q)}</b>${r.note ? `<span class="rn">${hl(r.note, q)}</span>` : ''}<span class="rmeta">${r.time} · ${r.person}${r.photo ? ' · 附小票' : ''}</span></span>` +
      `<span class="rp${r.person === '我' ? '' : ' her'}">${r.person}</span><span class="rph" title="${r.photo ? '附小票' : ''}">${r.photo ? I.rcpt : ''}</span>` +
      `<span class="ram">${m$(r.amount, inc ? '+' : '−')}${inc ? '<i class="tag">收</i>' : ''}</span></div></li>`;
  }

  /* ---------- HOME ---------- */
  function budgetOf(ym) {
    const n = dIn(ym);
    if (ym === CUR) return Object.assign({ n, day: +TODAY.slice(8), cur: true }, JX.budget(ym));
    const spent = JX.totals(ym).expense;
    return { budget: 8000, spent, remain: Math.round((8000 - spent) * 100) / 100, ratio: spent / 8000, daysLeft: 0, perDay: 0, n, day: n, cur: false };
  }
  function mastHTML(ym, act) {
    const m = +ym.slice(5), i = JX.MONTHS.indexOf(ym);
    return `<span class="mv zh">${ZHM[m]}</span><span class="mn num" aria-hidden="true">${odo(pad(m))}</span>` +
      `<span class="mr"><span class="micro">LEDGER · No.${pad(m)}</span><span class="micro">${ENM[m]} · ${ym.slice(0, 4)}</span>` +
      `<span class="msw"><button class="ib" data-act="${act}" data-d="-1" aria-label="上个月"${i ? '' : ' disabled'}>${I.l}</button>` +
      `<button class="ib" data-act="${act}" data-d="1" aria-label="下个月"${i < JX.MONTHS.length - 1 ? '' : ' disabled'}>${I.r}</button></span></span>`;
  }
  function heroHTML(n) {
    const s = JX.splitMoney(n);
    return `<span class="hy">¥</span><span class="hi">${odo(s.int)}</span><span class="hd"><span class="ods">.</span>${odo(s.dec)}</span>`;
  }
  function pairHTML(ym) {
    const t = JX.totals(ym);
    return `<div><span class="lbl zh">收入</span><b class="pv pine">${m$(t.income, '+')}</b></div>` +
      `<div><span class="lbl zh">结余</span><b class="pv${t.balance < 0 ? ' neg' : ''}">${m$(t.balance, t.balance < 0 ? '−' : '+')}</b></div>` +
      `<div><span class="lbl zh">笔数</span><b class="pv"><span class="m">${t.count}</span><i class="u">笔</i></b></div>`;
  }
  function rulerHTML(ym) {
    const b = budgetOf(ym), over = b.spent > b.budget, max = over ? b.spent * 1.06 : b.budget;
    const P = (v) => (Math.min(v, max) / max * 100).toFixed(3) + '%';
    const unit = b.budget / b.n;
    let tk = '';
    for (let d = 1; d <= b.n; d++) {
      const mj = d % 5 === 0 || d === 1;
      tk += `<i class="tk${mj ? ' mj' : ''}${b.cur && d < b.day ? ' past' : ''}" style="left:${P(unit * d)}"></i>` + (mj ? `<span class="tl" style="left:${P(unit * d)}">${d}</span>` : '');
    }
    const pace = unit * b.day, used = b.spent / unit, sp = Math.min(b.spent, max) / max;
    const lim = over ? `<span class="lim" style="left:${P(b.budget)}"><em>预算 ¥${f0(b.budget)}</em></span>` : '';
    const ghost = b.cur ? `<span class="gh" style="left:${P(pace)}"><em>匀速 · 第 ${b.day} 天</em></span>` : '';
    const ahead = b.spent > pace;
    const say = b.cur
      ? `按匀速，第 ${b.day} 天应花到 <b>¥${f0(pace)}</b>；实际已用去 <b class="${ahead ? 'zt' : ''}">${used.toFixed(1)} 天</b>的额度。${ahead ? `往后每天守住 <b>¥${JX.fmt(b.perDay)}</b>，月底刚好用完。` : '节奏稳当，可以按计划花。'}`
      : over ? `这个月预算 ¥${f0(b.budget)}，实际花了 ¥${f0(b.spent)}，<b class="zt">超出 ¥${f0(b.spent - b.budget)}</b>。` : `这个月预算 ¥${f0(b.budget)}，实际花了 ¥${f0(b.spent)}，<b>结余 ¥${f0(b.budget - b.spent)}</b>。`;
    const rem = b.remain;
    return sh('预算尺', `BUDGET · ¥${f0(b.budget)}`, `<span class="micro">${Math.round(b.ratio * 100)}% USED</span>`) +
      `<div class="ruler${over ? ' over' : ''}" role="img" aria-label="预算 8000 元，已用 ${JX.fmt(b.spent)} 元">` +
      `<div class="rl-top"><span class="nd${sp > 0.72 ? ' r' : ''}" style="left:${P(b.spent)}"><em>已用 ¥${JX.fmt(b.spent)}</em></span>${lim}</div>` +
      `<div class="rl"><i class="rf" style="transform:scaleX(${sp.toFixed(4)})"></i>${tk}<i class="ndl" style="left:${P(b.spent)}"></i>${b.cur ? `<i class="ghl" style="left:${P(pace)}"></i>` : ''}</div>` +
      `<div class="rl-bot">${ghost}</div></div>` +
      `<div class="bstats"><div><span class="lbl zh">已用</span><b class="bv">${m$(b.spent)}</b><span class="bs">占预算 ${Math.round(b.ratio * 100)}%</span></div>` +
      `<div><span class="lbl zh">剩余可花</span><b class="bv${rem < 0 ? ' zt' : ''}">${m$(rem, rem < 0 ? '−' : '')}</b><span class="bs">${b.cur ? `本月还有 ${b.daysLeft} 天` : '本月已结束'}</span></div>` +
      `<div><span class="lbl zh">日均可花</span><b class="bv">${b.cur ? m$(b.perDay) : '<span class="m">—</span>'}</b><span class="bs">${b.cur ? `按 ${b.daysLeft} 天平摊` : '无需再算'}</span></div></div>` +
      `<p class="say">${say}</p>`;
  }
  function reportHTML(ym) {
    const lines = JX.report(ym), cats = JX.byCategory(ym), m = +ym.slice(5);
    const share = cats.length ? Math.round(cats[0].share * 100) : 0;
    const txt = lines.map((l) => esc(l).replace(/¥([\d,]+\.\d\d)/g, '<b class="ra">¥$1</b>').replace(/「([^」]+)」/g, '「<b>$1</b>」')).join('');
    return sh('月度报告', `NOTE · ${ENM[m]}`) + `<p class="rep"><span class="drop num">${share}<small>%</small></span>${txt}</p>`;
  }
  function top3HTML(ym) {
    const cs = JX.byCategory(ym).slice(0, 3);
    return sh('分类前三', 'TOP 3', `<button class="lk" data-act="tostats">统计${I.r}</button>`) +
      `<ol class="t3">${cs.map((c, i) => `<li><button data-act="drill" data-k="${c.key}" data-lv="main" data-y="${ym}">` +
        `<span class="t3-n num">${pad(i + 1)}</span>${seal(c.key, i ? '' : 'z')}<span class="t3-m"><b>${esc(c.name)}</b><span class="bar"><i style="transform:scaleX(${c.share.toFixed(3)})"></i></span></span>` +
        `<span class="t3-a">${m$(c.total)}</span><span class="t3-p num">${Math.round(c.share * 100)}<small>%</small></span></button></li>`).join('')}</ol>`;
  }
  function dueHTML() {
    const lim = addDays(TODAY, 2);
    const list = JX.todos.filter((t) => t.due >= TODAY && t.due <= lim).sort((a, b) => (a.due + a.time).localeCompare(b.due + b.time));
    return sh('待办', 'DUE SOON', `<button class="lk" data-act="goto" data-sec="todos">全部${I.r}</button>`) +
      `<ul class="dl">${list.map((t) => `<li class="du${t.done ? ' done' : ''}${t.due === TODAY ? ' now' : ''}" data-id="${t.id}">` +
        `<span class="du-d"><b class="num">${t.due.slice(8)}</b><em>${rel(t.due)}</em></span>` +
        `<span class="du-m"><b>${esc(t.title)}</b><span>${t.time ? t.time + ' 到期 · ' : ''}${t.repeat} · ${JX.cat[t.categoryKey].name}</span></span>` +
        `<span class="du-a">${t.amount ? m$(t.amount) : ''}</span>` +
        `<span class="du-b"><button class="btn-l${t.done ? ' on' : ''}" data-act="todo-done" aria-pressed="${t.done}">${t.done ? I.ok + '已完成' : '完成'}</button>${t.amount && !t.done ? `<button class="btn-l" data-act="todo-add">记账</button>` : ''}</span></li>`).join('')}</ul>`;
  }
  function todayHTML() {
    const rs = JX.records.filter((r) => r.date === TODAY);
    const sum = rs.reduce((s, r) => s + (r.type === 'expense' ? r.amount : 0), 0);
    return sh('今天', `${TODAY.slice(5).replace('-', '.')} · ${ENW[JX.weekday(TODAY)]} · ${rs.length} ENTRIES`, `<span class="sum">${m$(sum, '−')}</span>`) +
      `<ul class="rows">${rs.map((r) => rowHTML(r)).join('')}</ul>` +
      `<button class="qadd" data-go="add">${I.plus}<span>再记一笔</span><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>N</kbd></button>`;
  }
  function nextBillHTML() {
    const r = JX.recurring.filter((x) => x.enabled).sort((a, b) => a.next.localeCompare(b.next))[0];
    if (!r) return sh('周期账单', 'NEXT') + '<p class="hint">没有启用的周期账单</p>';
    return sh('周期账单', 'NEXT BILL', `<button class="lk" data-act="goto" data-sec="recur">全部${I.r}</button>`) +
      `<div class="nb">${seal(r.categoryKey)}<span class="nb-m"><b>${esc(r.name)}</b><span>${r.cycle} · 下次 ${md(r.next)}</span></span>` +
      `<span class="nb-c"><b class="num">${diffDays(TODAY, r.next)}</b><span>天后</span></span><span class="nb-a">${m$(r.amount)}</span></div>`;
  }
  function recentHTML() {
    const rs = JX.records.filter((r) => r.date < TODAY).slice(0, 7);
    let html = '', last = '';
    rs.forEach((r) => {
      if (r.date !== last) { last = r.date; html += `<li class="rdh"><span>${JX.dateLabel(r.date)}</span><span class="micro">${ENW[JX.weekday(r.date)]} · ${r.date.slice(5).replace('-', '.')}</span></li>`; }
      html += rowHTML(r);
    });
    return sh('最近', 'RECENT') + `<ul class="rows">${html}</ul><button class="more-b" data-go="history"><span>翻看全部 ${JX.records.length} 笔账</span>${I.r}</button>`;
  }
  function homeHTML(boot) {
    const ym = S.ym, t = JX.totals(ym), di = (i) => (boot ? ` data-in style="--i:${i}"` : '');
    return `<header class="mtop"><span class="brand"><span class="zh">计序</span><i></i></span>${syncHTML()}${themeBtn()}</header>` +
      `<div class="spread home"><div class="lp">` +
      `<div class="mast" id="hMast"${di(0)}>${mastHTML(ym, 'hm')}</div>` +
      `<div class="hero"${di(1)}><div class="h-lbl"><span class="zh" id="hLbl">${ym === CUR ? '本月支出' : '当月支出'}</span><span class="micro">EXPENSE · CNY</span></div>` +
      `<div class="hero-n" id="heroN" role="img" aria-label="¥${JX.fmt(t.expense)}">${heroHTML(t.expense)}</div>` +
      `<div class="pair" id="hPair">${pairHTML(ym)}</div></div>` +
      `<section class="sec ruler-s" id="hRuler"${di(2)}>${rulerHTML(ym)}</section>` +
      `<section class="sec report" id="hReport"${di(5)}>${reportHTML(ym)}</section>` +
      `<section class="sec top3" id="hTop"${di(6)}>${top3HTML(ym)}</section>` +
      `</div><div class="rp">` +
      `<section class="sec due" id="hDue"${di(3)}>${dueHTML()}</section>` +
      `<section class="sec today" id="hToday"${di(4)}>${todayHTML()}</section>` +
      `<section class="sec nextbill"${di(7)}>${nextBillHTML()}</section>` +
      `<section class="sec recent" id="hRecent">${recentHTML()}</section>` +
      `</div></div>${folio(1, 2)}`;
  }

  /* ---------- ADD ---------- */
  const KP = ['1', '2', '3', 'back', '4', '5', '6', '+', '7', '8', '9', 'save', '.', '0', '00'];
  function addHTML() {
    return `<div class="spread add"><div class="lp">` +
      `<div class="add-h"><button class="ib m-only" data-act="back" aria-label="返回">${I.x}</button>` +
      `<h2 class="title zh" id="aTitle">记一笔</h2><span class="micro" id="aNo"></span>` +
      `<div class="seg" id="aType"><button data-act="type" data-v="expense"><span class="zh">支出</span></button><button data-act="type" data-v="income"><span class="zh">收入</span></button><i class="seg-m"></i></div></div>` +
      `<div class="amt" id="amt" tabindex="0" role="textbox" aria-label="金额，可直接键入数字">` +
      `<div class="amt-e" id="amtE"></div><div class="amt-n"><span class="hy">¥</span><span class="amt-v" id="amtV">0</span><i class="caret"></i></div>` +
      `<p class="msg" id="amtMsg" role="alert">金额还空着，先写下多少钱</p></div>` +
      `<p class="kbh"><span><kbd>0</kbd>–<kbd>9</kbd> 键入金额</span><span><kbd>+</kbd> 连加</span><span><kbd>Enter</kbd> 保存</span><span><kbd>Esc</kbd> 清空</span><span><kbd>Tab</kbd> 下一项</span></p>` +
      `<div class="fields">` +
      `<div class="f f-date"><span class="fl zh">日期</span><div class="fc chips" id="aDate"></div></div>` +
      `<div class="f f-time"><span class="fl zh">时间</span><label class="fc tin">${I.clock}<input type="time" id="aTime" aria-label="时间"></label></div>` +
      `<div class="f f-who"><span class="fl zh">记账人</span><div class="fc seg2" id="aWho"><button data-act="who" data-v="我">我</button><button data-act="who" data-v="阿念">阿念</button></div></div>` +
      `<div class="f f-note"><span class="fl zh">备注</span><label class="fc nin"><input id="aNote" type="text" maxlength="40" placeholder="写一句备注，比如：和同事拼饭" autocomplete="off" aria-label="备注"></label></div>` +
      `<div class="f f-photo"><span class="fl zh">小票</span><div class="fc" id="aPhoto"></div></div></div>` +
      `<div class="save"><button class="sealbtn" data-act="save" aria-label="保存这一笔"><span class="zh">记</span></button>` +
      `<span class="save-t"><b class="zh">盖章入账</b><span><kbd>Enter</kbd> 保存 · <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>N</kbd> 随时唤起</span></span></div>` +
      `</div><div class="rp">` +
      `<div class="cat-s" id="aCatS">${sh('分类', 'CATEGORY', '<span class="csel" id="aCatSel"></span>')}` +
      `<div class="freq"><span class="fq-l zh">常用</span><div class="fq" id="aFreq"></div></div>` +
      `<div class="cats" id="aCats"></div><div class="subs" id="aSubs"></div>` +
      `<p class="msg" id="catMsg" role="alert">还没选分类，点一个印章</p></div>` +
      `<section class="justnow">${sh('今天', 'WRITTEN TODAY')}<ul class="rows" id="aToday"></ul></section>` +
      `</div></div>` +
      `<div class="keypad" role="group" aria-label="数字键盘">${KP.map((k) => (k === 'save'
        ? '<button class="k k-save" data-act="save" aria-label="保存"><span class="zh">记</span></button>'
        : k === 'back' ? `<button class="k k-fn" data-k="back" aria-label="退格">${I.bk}</button>`
          : `<button class="k${k === '+' ? ' k-fn' : ''}" data-k="${k}">${k}</button>`)).join('')}</div>`;
  }
  const terms = () => S.form.expr.split('+');
  const total = () => Math.round(terms().reduce((s, t) => s + (parseFloat(t) || 0), 0) * 100) / 100;
  function typed(t) {
    if (!t) return '';
    const [a, b] = t.split('.');
    const int = (a || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return b === undefined ? int : `${int}<span class="dd">.${b}</span>`;
  }
  function updAmt(pulse) {
    const e = S.form.expr, multi = e.includes('+');
    const box = $('#amt');
    if (!box) return;
    $('#amtE').innerHTML = multi ? e.split('+').map((t) => `<span>${esc(t || '…')}</span>`).join('<i>+</i>') + '<i>=</i>' : '';
    let main;
    if (multi) { const s = JX.splitMoney(total()); main = `${s.int}<span class="dd">.${s.dec}</span>`; } else main = e ? typed(e) : '0';
    $('#amtV').innerHTML = main;
    box.classList.toggle('empty', !e);
    box.classList.toggle('multi', multi);
    if (pulse && !reduce()) $('#amtV').animate([{ transform: 'translateY(4%)', opacity: 0.55 }, { transform: 'none', opacity: 1 }], { duration: 160, easing: EASE });
  }
  function bump(el) { if (!reduce() && el) el.animate([{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }], { duration: 300, easing: 'ease-out' }); }
  function key(k) {
    let e = S.form.expr;
    const ts = e.split('+'), last = ts[ts.length - 1];
    if (k === 'back') e = e.slice(0, -1);
    else if (k === '+') { if (!last || last === '0.' || ts.length > 5) return bump($('#amtV')); if (last.endsWith('.')) e = e.slice(0, -1); e += '+'; }
    else if (k === '.') { if (last.includes('.')) return bump($('#amtV')); e += last ? '.' : '0.'; }
    else {
      if (last.includes('.') && last.split('.')[1].length >= 2) return bump($('#amtV'));
      if (!last.includes('.') && last.replace(/^0+/, '').length >= 7) return bump($('#amtV'));
      if (last === '0') e = e.slice(0, -1);
      if (k === '00' && (!last || last === '0')) k = '0';
      e += k;
    }
    S.form.expr = e;
    if (S.form.err === 'amt' && total() > 0) setErr('');
    updAmt(true);
  }
  function setErr(err) {
    S.form.err = err;
    const a = $('#amt'), c = $('#aCatS');
    if (!a) return;
    a.classList.toggle('bad', err === 'amt');
    c.classList.toggle('bad', err === 'cat');
    if (err) bump(err === 'amt' ? a : c);
  }
  function dateChips() {
    const f = S.form, y = addDays(TODAY, -1), other = f.date !== TODAY && f.date !== y;
    return `<button class="chip" data-act="date" data-v="${TODAY}" aria-pressed="${f.date === TODAY}">今天</button>` +
      `<button class="chip" data-act="date" data-v="${y}" aria-pressed="${f.date === y}">昨天</button>` +
      `<label class="chip dpick${other ? ' on' : ''}">${I.cal}<span>${other ? md(f.date) : '选择日期'}</span><input type="date" id="aDateIn" min="2026-06-01" max="${TODAY}" value="${f.date}" aria-label="选择日期"></label>`;
  }
  function photoHTML() {
    return S.form.photo
      ? `<button class="ph on" data-act="photo">${RECEIPT}<span class="ph-t"><b>已附小票</b><span>IMG_1105.jpg · 点此移除</span></span></button>`
      : `<button class="ph" data-act="photo">${I.cam}<span class="ph-t"><b>添加小票照片</b><span>拍照或从相册选择</span></span></button>`;
  }
  function syncAdd() {
    const f = S.form, p = $('#p-add');
    if (!p || !$('#amt', p)) return;
    $('#aTitle').textContent = S.edit ? '改一笔' : '记一笔';
    $('#aNo').textContent = S.edit ? 'EDIT · ' + S.edit.toUpperCase() : 'NEW ENTRY · No.' + (JX.records.length + 1);
    p.classList.toggle('editing', !!S.edit);
    $$('#aType button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === f.type));
    $('#aType').classList.toggle('inc', f.type === 'income');
    p.classList.toggle('inc', f.type === 'income');
    $$('#aWho button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === f.person));
    $('#aDate').innerHTML = dateChips();
    if ($('#aTime').value !== f.time) $('#aTime').value = f.time;
    if ($('#aNote').value !== f.note) $('#aNote').value = f.note;
    $('#aPhoto').innerHTML = photoHTML();
    $('#aFreq').innerHTML = FREQ.map(([c, s]) => `<button class="chip fqc" data-act="pick" data-c="${c}" data-s="${s}" aria-pressed="${f.cat === c && f.sub === s}">${seal(c, 'xs')}<span>${JX.subName(c, s)}</span></button>`).join('');
    $('#aCats').innerHTML = JX.categories.map((c) => `<button class="cat" data-act="cat" data-k="${c.key}" aria-pressed="${f.cat === c.key}">${seal(c.key)}<span>${c.name}</span></button>`).join('');
    const c = JX.cat[f.cat];
    $('#aSubs').innerHTML = c ? c.subs.map((s) => `<button class="chip" data-act="sub" data-k="${s.key}" aria-pressed="${f.sub === s.key}">${s.name}</button>`).join('') : '<span class="hint">先点一个印章，再挑子类</span>';
    $('#aCatSel').innerHTML = c ? `${c.name} · ${JX.subName(f.cat, f.sub)}` : '未选';
    updAmt();
    setErr(f.err);
    fillToday();
  }
  function fillToday(newId) {
    const ul = $('#aToday');
    if (!ul) return;
    ul.innerHTML = JX.records.filter((r) => r.date === TODAY).map((r) => rowHTML(r)).join('') || '<li class="hint">今天还没记账</li>';
    if (newId) { const li = $(`[data-id="${newId}"]`, ul); if (li) li.classList.add('wr'); }
  }
  function insertRec(rec) {
    const k = rec.date + rec.time;
    let i = JX.records.findIndex((r) => r.date + r.time <= k);
    if (i < 0) i = JX.records.length;
    JX.records.splice(i, 0, rec);
  }
  function resort() { JX.records.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)); }
  function removeRec(id) { const i = JX.records.findIndex((r) => r.id === id); if (i >= 0) JX.records.splice(i, 1); }
  const label$ = (r) => `${r.subcategoryName} ${r.type === 'income' ? '+' : '−'}¥${JX.fmt(r.amount)}`;
  function save() {
    const f = S.form, v = total();
    if (!(v > 0)) return setErr('amt');
    if (!f.cat) return setErr('cat');
    const c = JX.cat[f.cat], snap = Object.assign({}, f, { err: '' });
    const rec = { id: S.edit || 'n' + (++S.seq), type: f.type, amount: v, categoryKey: f.cat, categoryName: c.name, subcategoryKey: f.sub, subcategoryName: JX.subName(f.cat, f.sub), note: f.note.trim(), date: f.date, time: f.time || JX.NOW_TIME, person: f.person, photo: f.photo };
    stamp($('#amt'));
    if (S.edit) {
      const old = JX.records.find((r) => r.id === S.edit), before = Object.assign({}, old), id = S.edit;
      Object.assign(old, rec); resort();
      S.edit = ''; S.form = fresh(f);
      touch();
      setTimeout(() => go('history'), reduce() ? 200 : 620);
      toast('已改好 · ' + label$(old), () => { Object.assign(old, before); resort(); S.edit = id; S.form = snap; touch(); syncAdd(); go('add'); });
    } else {
      insertRec(rec);
      S.form = fresh(f); syncAdd(); fillToday(rec.id);
      touch('add');
      toast('已记入账簿 · ' + label$(rec), () => { removeRec(rec.id); S.form = snap; syncAdd(); touch('add'); if (S.route !== 'add') go('add'); });
    }
  }
  function loadForm(r) {
    S.form = { type: r.type, expr: String(r.amount), cat: r.categoryKey, sub: r.subcategoryKey, date: r.date, time: r.time, person: r.person, note: r.note, photo: r.photo, err: '' };
  }

  /* ---------- HISTORY ---------- */
  function histData() {
    const f = S.hf, q = f.q.trim().toLowerCase();
    return JX.records.filter((r) => (f.ym === 'all' || r.date.startsWith(f.ym)) && (f.type === 'all' || r.type === f.type) &&
      (!f.cat || r.categoryKey === f.cat) && (!f.sub || r.subcategoryKey === f.sub) &&
      (!q || (r.note + ' ' + r.categoryName + ' ' + r.subcategoryName).toLowerCase().includes(q)));
  }
  function hIdxHTML() {
    const f = S.hf, cnt = {}, months = ['all'].concat(JX.MONTHS.slice().reverse());
    JX.records.forEach((r) => { const k = r.date.slice(0, 7); cnt[k] = (cnt[k] || 0) + 1; });
    const c = JX.cat[f.cat];
    return `<div class="hidx-in"><h2 class="title zh">账单</h2><p class="micro">LEDGER INDEX · ${JX.records.length} ENTRIES</p>` +
      `<div class="fg"><h4 class="micro">MONTH · 月份</h4><ul class="mi">${months.map((m) => `<li><button data-act="hf" data-f="ym" data-v="${m}" aria-pressed="${f.ym === m}">` +
        `<span class="${m === 'all' ? 'mi-a' : 'zh'}">${m === 'all' ? '全部月份' : ZHM[+m.slice(5)]}</span><i class="lead"></i><span class="mi-c">${m === 'all' ? JX.records.length : cnt[m] || 0}</span></button></li>`).join('')}</ul></div>` +
      `<div class="fg"><h4 class="micro">TYPE · 收支</h4><div class="seg3">${[['all', '全部'], ['expense', '支出'], ['income', '收入']].map(([v, l]) => `<button data-act="hf" data-f="type" data-v="${v}" aria-pressed="${f.type === v}">${l}</button>`).join('')}</div></div>` +
      `<div class="fg"><h4 class="micro">CATEGORY · 分类</h4><div class="cg">${JX.categories.map((x) => `<button data-act="hf" data-f="cat" data-v="${x.key}" aria-pressed="${f.cat === x.key}" title="${x.name}">${seal(x.key)}<span>${x.name.slice(0, 2)}</span></button>`).join('')}</div>` +
      (c ? `<div class="cg-sub">${c.subs.map((s) => `<button class="chip" data-act="hf" data-f="sub" data-v="${s.key}" aria-pressed="${f.sub === s.key}">${s.name}</button>`).join('')}</div>` : '') + '</div>' +
      `<button class="clr" data-act="hf-clear"${f.ym === 'all' && f.type === 'all' && !f.cat && !f.q ? ' disabled' : ''}>${I.x}清除全部筛选</button></div>`;
  }
  function hChipsHTML() {
    const f = S.hf;
    return `<label class="sel"><select data-f="ym" aria-label="月份"><option value="all">全部月份</option>${JX.MONTHS.slice().reverse().map((m) => `<option value="${m}"${f.ym === m ? ' selected' : ''}>${+m.slice(5)}月</option>`).join('')}</select>${I.dn}</label>` +
      `<div class="seg3">${[['all', '全部'], ['expense', '支出'], ['income', '收入']].map(([v, l]) => `<button data-act="hf" data-f="type" data-v="${v}" aria-pressed="${f.type === v}">${l}</button>`).join('')}</div>` +
      `<label class="sel"><select data-f="cat" aria-label="分类"><option value="">全部分类</option>${JX.categories.map((c) => `<option value="${c.key}"${f.cat === c.key ? ' selected' : ''}>${c.name}</option>`).join('')}</select>${I.dn}</label>` +
      (f.sub ? `<button class="chip on" data-act="hf" data-f="sub" data-v="${f.sub}" aria-pressed="true">${JX.subName(f.cat, f.sub)}${I.x}</button>` : '');
  }
  function histHTML() {
    return `<div class="spread hist"><aside class="lp hidx" id="hIdx">${hIdxHTML()}</aside><div class="rp hmain">` +
      `<div class="htool"><div class="ht-row"><h2 class="title zh m-only">账单</h2>` +
      `<label class="search">${I.search}<input id="hq" type="search" placeholder="搜索备注、分类" autocomplete="off" aria-label="搜索账单"><kbd class="d-only">/</kbd><button class="ib sx" data-act="hq-x" aria-label="清除搜索">${I.x}</button></label>` +
      `<button class="tbtn d-only" data-act="batch" aria-pressed="false">${I.multi}<span>多选</span></button></div>` +
      `<div class="hchips" id="hChips">${hChipsHTML()}</div><p class="hsum" id="hSum"></p></div>` +
      `<div class="hlist" id="hList"></div>` +
      `<div class="bbar" id="bbar" aria-live="polite"><span class="bb-n">已选 <b id="bN">0</b> 笔</span><span class="bb-s" id="bS"></span><span class="bb-g"><button class="btn-l" data-act="b-all">全选已显示</button><button class="btn-l danger" data-act="b-del">${I.del}删除</button><button class="btn-l" data-act="batch">完成</button></span></div>` +
      `</div></div>`;
  }
  const HL = { groups: [], gi: 0, rows: 0, lastYm: '', io: null };
  function groupList(list) {
    const g = [];
    let cur = null;
    list.forEach((r) => { if (!cur || cur.date !== r.date) { cur = { date: r.date, rows: [], exp: 0, inc: 0 }; g.push(cur); } cur.rows.push(r); if (r.type === 'expense') cur.exp += r.amount; else cur.inc += r.amount; });
    return g;
  }
  function groupHTML(g, q) {
    const d = g.date, lab = JX.dateLabel(d);
    let pre = '';
    if (S.hf.ym === 'all' && d.slice(0, 7) !== HL.lastYm) {
      HL.lastYm = d.slice(0, 7);
      pre = `<div class="mdiv"><span class="zh">${ZHM[+d.slice(5, 7)]}</span><span class="micro">${ENM[+d.slice(5, 7)]} ${d.slice(0, 4)}</span><i></i></div>`;
    }
    return pre + `<section class="day"><h4 class="dh"><span class="dh-n num">${d.slice(8)}</span><span class="dh-t">${+d.slice(5, 7)}月 · ${JX.weekday(d)}${lab.length <= 2 ? `<em>${lab}</em>` : ''}</span>` +
      `<span class="dh-s">${g.exp ? `<span>支 ${m$(g.exp)}</span>` : ''}${g.inc ? `<span class="pine">收 ${m$(g.inc)}</span>` : ''}</span></h4>` +
      `<ul class="rows">${g.rows.map((r) => rowHTML(r, q, true)).join('')}</ul></section>`;
  }
  function renderList(keep) {
    const box = $('#hList');
    if (!box) return;
    const list = histData();
    HL.groups = groupList(list); HL.gi = 0; HL.rows = 0; HL.lastYm = '';
    const exp = list.reduce((s, r) => s + (r.type === 'expense' ? r.amount : 0), 0), inc = list.reduce((s, r) => s + (r.type === 'income' ? r.amount : 0), 0);
    $('#hSum').innerHTML = `<span>共 <b>${list.length}</b> 笔</span><span>支出 ${m$(exp)}</span><span class="pine">收入 ${m$(inc)}</span>`;
    if (!list.length) {
      const q = S.hf.q.trim();
      box.innerHTML = `<div class="empty"><svg class="em-art" viewBox="0 0 160 120" aria-hidden="true"><path class="pg" d="M20 8h120v104H20z"/><path class="ln" d="M32 34h96M32 50h96M32 66h96M32 82h96M32 98h60"/><g class="es"><rect x="92" y="54" width="44" height="44" rx="3"/><text x="114" y="85" text-anchor="middle">空</text></g></svg>` +
        `<h4 class="zh">这一页还是空白</h4><p>${q ? `没有找到与「${esc(q)}」相关的账目。` : '这个筛选条件下没有账目。'}换个关键词，或放宽筛选试试。</p>` +
        `<button class="btn" data-act="hf-clear">清除筛选</button></div>`;
      return;
    }
    box.innerHTML = '';
    more(Math.max(40, keep || 0));
    if ('requestIdleCallback' in window) requestIdleCallback(() => { if (HL.rows < 160) more(80); }, { timeout: 1500 });
  }
  function more(n) {
    const box = $('#hList'), q = S.hf.q.trim();
    let html = '', c = 0;
    while (HL.gi < HL.groups.length && c < n) { const g = HL.groups[HL.gi++]; html += groupHTML(g, q); c += g.rows.length; }
    HL.rows += c;
    const old = $('.sentinel', box);
    if (old) old.remove();
    const done = HL.gi >= HL.groups.length;
    box.insertAdjacentHTML('beforeend', html + (done ? '<p class="endmark"><span>本账簿到此为止</span></p>' : '<div class="sentinel" aria-hidden="true"><i></i><i></i><i></i></div>'));
    if (!done) {
      if (!HL.io) HL.io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) more(80); }, { root: $('#p-history'), rootMargin: '0px 0px 900px 0px' });
      HL.io.disconnect();
      HL.io.observe($('.sentinel', box));
    }
  }
  function updBatch() {
    const p = $('#p-history');
    p.classList.toggle('batch', S.batch);
    $$('[data-act="batch"]', p).forEach((b) => b.setAttribute('aria-pressed', S.batch));
    const sel = JX.records.filter((r) => S.sel.has(r.id));
    $('#bN').textContent = sel.length;
    const e = sel.reduce((s, r) => s + (r.type === 'expense' ? r.amount : -r.amount), 0);
    $('#bS').innerHTML = sel.length ? '合计 ' + m$(Math.abs(e), e >= 0 ? '−' : '+') : '点选账目即可勾选';
    $$('.row', p).forEach((li) => li.classList.toggle('sel', S.sel.has(li.dataset.id)));
  }
  function refreshHist(keep) { $('#hIdx').innerHTML = hIdxHTML(); $('#hChips').innerHTML = hChipsHTML(); renderList(keep); }
  function delRecs(ids, rows) {
    const recs = JX.records.filter((r) => ids.includes(r.id));
    if (!recs.length) return;
    const finish = () => {
      recs.forEach((r) => { removeRec(r.id); S.sel.delete(r.id); });
      S.trash = recs.concat(S.trash);
      const sc = $('#p-history').scrollTop;
      refreshHist(HL.rows); updBatch();
      $('#p-history').scrollTop = sc;
      touch('history');
    };
    rows.forEach((li) => li.classList.add('gone'));
    setTimeout(finish, reduce() ? 0 : 240);
    const sum = recs.reduce((s, r) => s + r.amount, 0);
    toast(`已删除 ${recs.length} 笔 · ¥${JX.fmt(sum)}`, () => {
      recs.forEach((r) => { insertRec(r); const i = S.trash.indexOf(r); if (i >= 0) S.trash.splice(i, 1); });
      if (S.route === 'history') { refreshHist(HL.rows); updBatch(); }
      touch(S.route === 'history' ? 'history' : '');
    });
  }

  /* ---------- STATS ---------- */
  function stTotHTML(ym) {
    const t = JX.totals(ym);
    return `<div class="tt-e"><span class="lbl zh">支出</span><b class="tv">${m$(t.expense)}</b></div>` +
      `<div><span class="lbl zh">收入</span><b class="tv pine">${m$(t.income, '+')}</b></div>` +
      `<div><span class="lbl zh">结余</span><b class="tv${t.balance < 0 ? ' neg' : ''}">${m$(t.balance, t.balance < 0 ? '−' : '+')}</b></div>`;
  }
  function strataHTML() {
    const ym = S.sym, list = JX.byCategory(ym, S.lvl), cnt = list.reduce((s, c) => s + c.count, 0);
    const head = sh('分类占比', `INK STRATA · ${S.lvl === 'main' ? 'LEVEL 1' : 'LEVEL 2'}`, `<span class="micro">${cnt} ENTRIES</span>`);
    if (!list.length) return head + '<p class="hint">这个月还没有支出。</p>';
    let rows = list;
    if (list.length > 8) {
      const rest = list.slice(7);
      rows = list.slice(0, 7).concat([{ rest: true, key: '', name: `其余 ${rest.length} 项`, total: rest.reduce((s, c) => s + c.total, 0), share: rest.reduce((s, c) => s + c.share, 0), count: rest.reduce((s, c) => s + c.count, 0) }]);
    }
    const RH = 60, GAP = 2, HH = rows.length * RH, avail = HH - GAP * (rows.length - 1);
    let hs = rows.map((c) => Math.max(4, c.share * avail));
    const k = avail / hs.reduce((a, b) => a + b, 0);
    hs = hs.map((h) => h * k);
    let y = 0;
    const mids = [];
    const segs = rows.map((c, i) => { mids.push(y + hs[i] / 2); y += hs[i] + GAP; return `<i class="sg s${i}" style="height:${hs[i].toFixed(1)}px"></i>`; }).join('');
    const lead = rows.map((c, i) => `<path class="${i ? '' : 'z'}" d="M0 ${mids[i].toFixed(1)}H10L46 ${i * RH + RH / 2}H56"/>`).join('');
    return head + `<div class="strata" style="--H:${HH}px">` +
      `<div class="scol" aria-hidden="true">${segs}</div><svg class="slead" width="56" height="${HH}" viewBox="0 0 56 ${HH}" aria-hidden="true">${lead}</svg>` +
      `<div class="sbar" aria-hidden="true">${rows.map((c, i) => `<i class="sg s${i}" style="flex:${Math.max(c.share, 0.006).toFixed(4)} 0 0"></i>`).join('')}</div>` +
      `<ol class="srank">${rows.map((c, i) => `<li><button data-act="drill" data-k="${c.key}" data-c="${c.categoryKey || ''}" data-lv="${S.lvl}" data-y="${ym}"${c.rest ? ' disabled' : ''}>` +
        `<span class="sr-n num">${pad(i + 1)}</span>${c.rest ? '<i class="seal ghost" aria-hidden="true">余</i>' : seal(c.categoryKey, i ? '' : 'z')}` +
        `<span class="sr-m"><b>${esc(c.name)}</b><span>${S.lvl === 'sub' && !c.rest ? JX.cat[c.categoryKey].name + ' · ' : ''}${c.count} 笔</span></span>` +
        `<span class="sr-a">${m$(c.total)}</span><span class="sr-p num">${c.share >= 0.01 ? Math.round(c.share * 100) : '<1'}<small>%</small></span>${c.rest ? '' : I.r}</button></li>`).join('')}</ol></div>`;
  }
  function dailyHTML(ym) {
    const ds = JX.daily(ym), act = ds.filter((d) => !d.future), vals = act.map((d) => d.total).sort((a, b) => b - a);
    const sum = act.reduce((s, d) => s + d.total, 0), avg = act.length ? sum / act.length : 0;
    const top = vals[0] || 1, second = vals[1] || top;
    const cap = top > second * 2.2 ? second * 1.2 : top;
    const bars = ds.map((d) => {
      const today = d.date === TODAY;
      if (d.future) return `<div class="db fu" title="${md(d.date)} · 未到"><i></i></div>`;
      if (!d.total) return `<div class="db z${today ? ' td' : ''}" title="${md(d.date)} · 未花钱"><i></i></div>`;
      const clip = d.total > cap, h = Math.max(3, Math.min(1, d.total / cap) * 100);
      return `<div class="db${clip ? ' cl' : ''}${today ? ' td' : ''}" title="${md(d.date)} · ¥${JX.fmt(d.total)}"><i style="height:${h.toFixed(1)}%"></i>${clip ? `<span class="dv">${f0(d.total)}</span>` : ''}</div>`;
    }).join('');
    const ap = Math.min(100, avg / cap * 100);
    return sh('每日', `DAILY · ${act.length}/${ds.length} DAYS`, `<span class="sum">日均 ${m$(avg)}</span>`) +
      `<div class="dc" style="--n:${ds.length}">${bars}<div class="avg" style="transform:translateY(-${(ap * 1.6).toFixed(1)}px)"><span>AVG ${f0(avg)}</span></div></div>` +
      `<div class="dx" style="--n:${ds.length}">${ds.map((d) => `<span class="${d.date === TODAY ? 'td' : ''}">${d.day === 1 || d.day % 5 === 0 || d.date === TODAY ? (d.date === TODAY ? '今' : d.day) : ''}</span>`).join('')}</div>` +
      `<p class="dlg"><span><i class="k-b"></i>已花</span><span><i class="k-f"></i>未到的日子</span>${top > cap ? '<span><i class="k-c"></i>超出刻度，已折断</span>' : ''}</p>`;
  }
  function sixHTML(ym) {
    const ms = JX.monthly(), max = Math.max.apply(null, ms.map((m) => Math.max(m.expense, m.income)));
    return sh('近六月', 'EXPENSE / INCOME', '<span class="lg"><i class="lg-e"></i>支出<i class="lg-i"></i>收入</span>') +
      `<ol class="sx">${ms.map((m) => {
        const bal = m.income - m.expense;
        return `<li class="${m.month === ym ? 'cur' : ''}"><button data-act="sx" data-y="${m.month}" aria-pressed="${m.month === ym}"><span class="sx-m zh">${ZHM[+m.month.slice(5)]}</span>` +
          `<span class="sx-bars"><span class="sx-e"><i style="transform:scaleX(${(m.expense / max).toFixed(4)})"></i></span>` +
          `<span class="sx-i"><i style="transform:scaleX(${(m.income / max).toFixed(4)})"></i></span></span>` +
          `<span class="sx-v"><b>${f0(m.expense)}</b><span>${f0(m.income)}</span></span>` +
          `<span class="sx-n${bal < 0 ? ' neg' : ''}"><em>结余</em>${bal < 0 ? '−' : '+'}${f0(Math.abs(bal))}</span></button></li>`;
      }).join('')}</ol>`;
  }
  function statsHTML() {
    const ym = S.sym;
    return `<div class="spread stats"><div class="st-top">` +
      `<div class="mast sm" id="sMast">${mastHTML(ym, 'sm')}</div><div class="st-tot" id="sTot">${stTotHTML(ym)}</div>` +
      `<div class="seg st-lv" id="sLv"><button data-act="lvl" data-v="main" aria-pressed="${S.lvl === 'main'}"><span class="zh">一级</span></button><button data-act="lvl" data-v="sub" aria-pressed="${S.lvl === 'sub'}"><span class="zh">二级</span></button><i class="seg-m"></i></div></div>` +
      `<div class="lp"><section class="sec strata-s" id="sCat">${strataHTML()}</section></div>` +
      `<div class="rp"><section class="sec daily" id="sDaily">${dailyHTML(ym)}</section><section class="sec six" id="sSix">${sixHTML(ym)}</section></div></div>${folio(5, 6)}`;
  }

  /* ---------- MORE ---------- */
  function recHTML() {
    return sh('周期账单', `RECURRING · ${JX.recurring.length}`) + `<ul class="rec">${JX.recurring.map((r) => `<li class="rc${r.enabled ? '' : ' off'}" data-id="${r.id}">${seal(r.categoryKey)}` +
      `<span class="rc-m"><b>${esc(r.name)}</b><span>${r.cycle} · ${JX.subName(r.categoryKey, r.subcategoryKey)}</span></span>` +
      `<span class="rc-n"><b>${md(r.next)}</b><span>${r.enabled ? diffDays(TODAY, r.next) + ' 天后' : '已暂停'}</span></span><span class="rc-a">${m$(r.amount)}</span>` +
      `<span class="rc-b"><button class="sw" role="switch" aria-checked="${r.enabled}" data-act="rec-tog" aria-label="启用${esc(r.name)}"><i></i></button>` +
      `<button class="btn-l" data-act="rec-now"${r.enabled ? '' : ' disabled'}>立即记录</button></span></li>`).join('')}</ul>`;
  }
  function todosHTML() {
    const list = JX.todos.slice().sort((a, b) => (a.done - b.done) || a.due.localeCompare(b.due));
    return sh('待办', `TO-DO · ${list.filter((t) => !t.done).length} OPEN`) + `<ul class="tdl">${list.map((t) => {
      const late = !t.done && (t.due < TODAY || (t.due === TODAY && t.time && t.time < JX.NOW_TIME));
      return `<li class="td${t.done ? ' done' : ''}" data-id="${t.id}"><button class="cb" role="checkbox" aria-checked="${t.done}" data-act="todo-done" aria-label="完成 ${esc(t.title)}">${I.ok}</button>` +
        `<span class="td-m"><b>${esc(t.title)}</b><span><em class="${late ? 'zt' : ''}">${rel(t.due)}${t.time ? ' ' + t.time : ''}${late ? ' · 已过时' : ''}</em> · ${t.repeat} · ${JX.cat[t.categoryKey].name}</span></span>` +
        `<span class="td-a">${t.amount ? m$(t.amount) : ''}</span>${t.amount && !t.done ? '<button class="btn-l" data-act="todo-add">记账</button>' : '<span class="td-x"></span>'}</li>`;
    }).join('')}</ul>`;
  }
  const TOC = [
    ['cat', '分类管理', 'CATEGORIES', () => `${JX.categories.length} 类 · ${JX.categories.reduce((s, c) => s + c.subs.length, 0)} 子类`],
    ['trash', '回收站', 'TRASH', () => (S.trash.length ? `${S.trash.length} 笔可恢复` : '空')],
    ['export', '导出', 'EXCEL / CSV', () => S.exported ? '刚刚导出' : 'Excel · CSV'],
    ['backup', '备份与恢复', 'BACKUP', () => (S.backedUp ? '刚刚备份' : '上次 11月1日')],
    ['sync', '云同步设置', 'CLOUD SYNC', () => SYNC_CODE],
    ['dark', '暗色模式', 'NIGHT READING', () => ({ auto: '跟随系统', light: '浅色', dark: '夜读' }[S.themeMode])],
    ['keys', '快捷键设置', 'SHORTCUTS', () => 'Ctrl+Shift+N']
  ];
  function tocDetail(k) {
    if (k === 'cat') return `<div class="cm">${JX.categories.map((c) => `<span class="cm-i">${seal(c.key)}<b>${c.name}</b><em>${c.subs.map((s) => s.name).slice(0, 3).join(' · ')}${c.subs.length > 3 ? ' 等 ' + c.subs.length + ' 项' : ''}</em></span>`).join('')}</div>`;
    if (k === 'trash') return S.trash.length ? `<ul class="rows tr">${S.trash.map((r) => `<li class="trw" data-id="${r.id}">${seal(r.categoryKey)}<span class="rm"><b>${esc(r.subcategoryName)}</b><span class="rn">${md(r.date)} · ${esc(r.note)}</span></span><span class="ram">${m$(r.amount, r.type === 'income' ? '+' : '−')}</span><button class="btn-l" data-act="restore">恢复</button></li>`).join('')}</ul>` : '<p class="hint">回收站是空的。删掉的账目会在这里保留 30 天，随时可以恢复。</p>';
    if (k === 'export') return `<div class="dt-row"><button class="btn" data-act="export" data-v="xlsx">${I.exp}导出 Excel</button><button class="btn" data-act="export" data-v="csv">${I.exp}导出 CSV</button></div><p class="dt-s">${S.exported ? `${I.ok}已生成 <b>${S.exported}</b>，共 ${JX.records.length} 笔` : `将导出全部 ${JX.records.length} 笔，含小票标记与记账人`}</p>`;
    if (k === 'backup') return `<div class="dt-row"><button class="btn" data-act="backup">${I.cloud}立即备份</button><button class="btn ghost" data-act="restore-bk">从备份恢复</button></div><p class="dt-s">${S.backedUp ? `${I.ok}${S.backedUp}` : '自动备份：每周日 03:00 · 最近一次 11月1日，631 笔'}</p>`;
    if (k === 'sync') return `<div class="code"><span class="micro">SYNC CODE · 同步码</span><b>${SYNC_CODE.split('-').map((s) => `<span>${s}</span>`).join('<i>-</i>')}</b><button class="ib" data-act="copy" aria-label="复制同步码">${I.copy}</button></div><div class="dt-row">${syncHTML()}<span class="dt-s">两台设备输入同一同步码即可共用账本</span></div>`;
    if (k === 'dark') return `<div class="seg3 dm">${[['auto', '跟随系统'], ['light', '浅色'], ['dark', '夜读']].map(([v, l]) => `<button data-act="dm" data-v="${v}" aria-pressed="${S.themeMode === v}">${l}</button>`).join('')}</div>`;
    if (k === 'keys') return `<dl class="keys">${[['Ctrl Shift N', '在任何页面唤起记一笔'], ['0–9 . +', '直接键入金额，+ 连加'], ['Enter', '保存这一笔'], ['Esc', '清空金额'], ['Tab', '移到下一项'], ['/', '在账单里搜索']].map(([a, b]) => `<div><dt>${a.split(' ').map((x) => `<kbd>${x}</kbd>`).join('')}</dt><dd>${b}</dd></div>`).join('')}</dl>`;
    return '';
  }
  function tocHTML() {
    return sh('目录', 'SETTINGS · CONTENTS') + `<ol class="toc">${TOC.map(([k, zh, en, v], i) => `<li class="${S.open[k] ? 'open' : ''}" data-k="${k}"><button class="toc-b" data-act="sec" aria-expanded="${!!S.open[k]}">` +
      `<span class="toc-n num">${pad(i + 1)}</span><span class="toc-t"><b class="zh">${zh}</b><span class="micro">${en}</span></span><i class="lead"></i><span class="toc-v">${v()}</span>${I.dn}</button>` +
      `<div class="toc-d">${S.open[k] ? tocDetail(k) : ''}</div></li>`).join('')}</ol>`;
  }
  function moreHTML() {
    return `<header class="mtop"><h2 class="title zh">更多</h2>${themeBtn()}</header><div class="spread more"><div class="lp">` +
      `<section class="sec" id="mRec">${recHTML()}</section><section class="sec" id="mTodo">${todosHTML()}</section></div>` +
      `<div class="rp"><section class="sec" id="mToc">${tocHTML()}</section></div></div>${folio(7, 8)}`;
  }

  /* ---------- pages / router ---------- */
  const R = { home: homeHTML, add: addHTML, history: histHTML, stats: statsHTML, more: moreHTML };
  const TITLE = { home: ['首页', 'HOME'], add: ['记一笔', 'NEW ENTRY'], history: ['账单', 'LEDGER'], stats: ['统计', 'STATISTICS'], more: ['更多', 'MORE'] };
  const rendered = {}, dirty = new Set();
  const page = (r) => $('#p-' + r);
  function render(r, boot) {
    const p = page(r), sc = p.scrollTop;
    p.innerHTML = R[r](boot);
    rendered[r] = true; dirty.delete(r);
    if (r === 'history') { $('#hq').value = S.hf.q; renderList(); updBatch(); }
    if (r === 'add') syncAdd();
    if (r === 'home') roll($('#heroN'), boot ? '' : null);
    p.scrollTop = sc;
  }
  let dT = 0;
  function touch(except) {
    ROUTES.forEach((r) => { if (rendered[r] && r !== except) dirty.add(r); });
    clearTimeout(dT);
    dT = setTimeout(() => dirty.forEach((r) => { if (r !== S.route) render(r); }), 450);
  }
  function roll(el, from) {
    if (!el || reduce() || from === null) return;
    const cols = $$('.odc', el), n = cols.length, fd = (from || '').replace(/\D/g, '');
    cols.forEach((c, i) => {
      const v = +c.dataset.v, f = +(fd[fd.length - (n - i)] || 0);
      if (from && f === v) return;
      c.animate([{ transform: `translateY(-${f * 10}%)` }, { transform: `translateY(-${v * 10}%)` }], { duration: 640, delay: (n - 1 - i) * 30, easing: EASE, fill: 'backwards' });
    });
  }
  function swap(el, html) {
    el.innerHTML = html;
    if (!reduce()) el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE });
  }
  let tT = 0;
  function show(r, boot) {
    if (!R[r]) r = 'home';
    const prev = S.route;
    if (r === prev) return;
    if (!rendered[r] || dirty.has(r)) render(r, boot);
    const to = page(r), from = prev && page(prev);
    $$('.page.in,.page.out').forEach((p) => p.classList.remove('in', 'out'));
    S.route = r; H.dataset.route = r;
    to.classList.add('on');
    if (from) {
      from.classList.remove('on');
      const back = ROUTES.indexOf(r) < ROUTES.indexOf(prev);
      $('#stage').classList.toggle('back', back);
      from.classList.add('out'); to.classList.add('in');
      clearTimeout(tT);
      tT = setTimeout(() => { from.classList.remove('out'); to.classList.remove('in'); }, 380);
    }
    $$('[data-go]').forEach((a) => a.classList.toggle('on', a.dataset.go === r));
    $('#rhT').textContent = TITLE[r][0]; $('#rhE').textContent = TITLE[r][1];
    D.title = TITLE[r][0] + ' · 计序';
    if (r === 'add' && desk()) setTimeout(() => { const a = $('#amt'); if (a && S.route === 'add') a.focus({ preventScroll: true }); }, 40);
  }
  let skipHash = '';
  function go(r) {
    if (!R[r]) r = 'home';
    show(r);
    if (location.hash !== '#' + r) { skipHash = r; location.hash = r; }
  }
  addEventListener('hashchange', () => { const r = location.hash.slice(1); if (r === skipHash) { skipHash = ''; return; } skipHash = ''; show(R[r] ? r : 'home'); });
  function newEntry() { if (S.edit) { S.edit = ''; S.form = fresh(); syncAdd(); } go('add'); }
  function gotoSec(id) {
    go('more');
    setTimeout(() => { const el = $('#' + id), p = page('more'); if (el) p.scrollTo({ top: el.offsetTop - 24, behavior: reduce() ? 'auto' : 'smooth' }); }, 60);
  }

  /* ---------- feedback: stamp, toast, sync, theme ---------- */
  let stT = 0;
  function stamp(anchor) {
    const s = $('#stamp'), r = anchor.getBoundingClientRect();
    s.style.left = (r.left + r.width * (desk() ? 0.62 : 0.72)) + 'px';
    s.style.top = (r.top + r.height * 0.5) + 'px';
    s.classList.remove('go');
    void s.offsetWidth;
    s.classList.add('go');
    clearTimeout(stT);
    stT = setTimeout(() => s.classList.remove('go'), 1500);
  }
  let toT = 0, toI = 0;
  function toast(msg, undo) {
    const t = $('#toast');
    clearTimeout(toT); clearInterval(toI);
    S.undo = undo || null;
    let n = 5;
    t.innerHTML = (undo ? '<span class="tr"><svg viewBox="0 0 24 24" aria-hidden="true"><circle class="t0" cx="12" cy="12" r="10"/><circle class="t1" cx="12" cy="12" r="10"/></svg><b id="tN">5</b></span>' : `<span class="tr ok">${I.ok}</span>`) +
      `<span class="tm">${esc(msg)}</span>${undo ? '<button class="tu" data-act="undo">撤销</button>' : ''}`;
    t.classList.remove('on');
    void t.offsetWidth;
    t.classList.add('on');
    if (undo) toI = setInterval(() => { n -= 1; const el = $('#tN'); if (el && n > 0) el.textContent = n; }, 1000);
    toT = setTimeout(hideToast, undo ? 5000 : 2400);
  }
  function hideToast() { clearTimeout(toT); clearInterval(toI); S.undo = null; $('#toast').classList.remove('on'); }
  function setSync(st) { S.sync = st; $$('.sync').forEach((el) => { el.outerHTML = syncHTML(); }); }
  function doSync() {
    if (S.sync === 'ing') return;
    setSync('ing');
    setTimeout(() => { S.synced = '刚刚'; setSync('done'); setTimeout(() => setSync('idle'), 2200); }, 1600);
  }
  function applyTheme(t, anim) {
    if (t === S.theme) return;
    S.theme = t;
    if (anim && !reduce()) {
      const w = D.createElement('div');
      w.className = 'wash';
      D.body.appendChild(w);
      requestAnimationFrame(() => { H.dataset.theme = t; w.classList.add('go'); setTimeout(() => w.remove(), 520); });
    } else H.dataset.theme = t;
    const mc = $('meta[name=theme-color]');
    if (mc) mc.content = t === 'dark' ? '#13120F' : '#F2EEE5';
  }
  const sysDark = matchMedia('(prefers-color-scheme: dark)');
  sysDark.addEventListener('change', () => { if (S.themeMode === 'auto') applyTheme(sysDark.matches ? 'dark' : 'light', true); });
  function refreshToc() { const el = $('#mToc'); if (el) el.innerHTML = tocHTML(); }

  /* ---------- actions ---------- */
  const rowOf = (el) => el.closest('[data-id]');
  const ACT = {
    hm(b) {
      const i = JX.MONTHS.indexOf(S.ym) + +b.dataset.d, ym = JX.MONTHS[i];
      if (!ym) return;
      const old = S.ym, oe = JX.fmt(JX.totals(old).expense);
      S.ym = ym;
      $('#hMast').innerHTML = mastHTML(ym, 'hm'); roll($('#hMast'), pad(+old.slice(5)));
      const t = JX.totals(ym), hn = $('#heroN');
      hn.innerHTML = heroHTML(t.expense); hn.setAttribute('aria-label', '¥' + JX.fmt(t.expense)); roll(hn, oe);
      $('#hLbl').textContent = ym === CUR ? '本月支出' : '当月支出';
      swap($('#hPair'), pairHTML(ym)); swap($('#hRuler'), rulerHTML(ym)); swap($('#hReport'), reportHTML(ym)); swap($('#hTop'), top3HTML(ym));
    },
    sm(b) { const ym = JX.MONTHS[JX.MONTHS.indexOf(S.sym) + +b.dataset.d]; if (ym) setStatsMonth(ym); },
    sx(b) { setStatsMonth(b.dataset.y); },
    lvl(b) { if (S.lvl === b.dataset.v) return; S.lvl = b.dataset.v; $$('#sLv button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.v === S.lvl)); swap($('#sCat'), strataHTML()); },
    drill(b) {
      const sub = b.dataset.lv === 'sub';
      S.hf = { ym: b.dataset.y, type: 'expense', cat: sub ? b.dataset.c : b.dataset.k, sub: sub ? b.dataset.k : '', q: '' };
      S.batch = false; S.sel.clear();
      if (rendered.history) { $('#hq').value = ''; refreshHist(); updBatch(); page('history').scrollTop = 0; }
      go('history');
    },
    tostats() { S.sym = S.ym; dirty.add('stats'); go('stats'); },
    sync: doSync,
    theme() { const t = S.theme === 'dark' ? 'light' : 'dark'; S.themeMode = t; applyTheme(t, true); refreshToc(); },
    dm(b) { S.themeMode = b.dataset.v; applyTheme(b.dataset.v === 'auto' ? (sysDark.matches ? 'dark' : 'light') : b.dataset.v, true); refreshToc(); },
    goto(b) { gotoSec({ recur: 'mRec', todos: 'mTodo', toc: 'mToc' }[b.dataset.sec]); },
    type(b) { S.form.type = b.dataset.v; syncAdd(); },
    cat(b) { const c = JX.cat[b.dataset.k]; S.form.cat = c.key; S.form.sub = c.subs[0].key; if (S.form.err === 'cat') S.form.err = ''; syncAdd(); },
    sub(b) { S.form.sub = b.dataset.k; syncAdd(); },
    pick(b) { S.form.cat = b.dataset.c; S.form.sub = b.dataset.s; if (S.form.err === 'cat') S.form.err = ''; syncAdd(); },
    date(b) { S.form.date = b.dataset.v; syncAdd(); },
    who(b) { S.form.person = b.dataset.v; syncAdd(); },
    photo() { S.form.photo = !S.form.photo; $('#aPhoto').innerHTML = photoHTML(); },
    save,
    back() { history.length > 1 && S.prev ? history.back() : go('home'); },
    undo() { const u = S.undo; hideToast(); if (u) u(); },
    hf(b) {
      const f = S.hf, k = b.dataset.f, v = b.dataset.v;
      if (k === 'cat') { f.cat = f.cat === v ? '' : v; f.sub = ''; } else if (k === 'sub') f.sub = f.sub === v ? '' : v; else f[k] = v;
      refreshHist(); page('history').scrollTop = 0;
    },
    'hf-clear'() { S.hf = { ym: 'all', type: 'all', cat: '', sub: '', q: '' }; $('#hq').value = ''; refreshHist(); },
    'hq-x'() { S.hf.q = ''; $('#hq').value = ''; renderList(); $('#hq').focus(); },
    batch() { S.batch = !S.batch; if (!S.batch) S.sel.clear(); updBatch(); },
    'b-all'() { $$('#hList .row').forEach((li) => S.sel.add(li.dataset.id)); updBatch(); },
    'b-del'() { const ids = Array.from(S.sel); if (!ids.length) return; delRecs(ids, $$('#hList .row.sel')); S.batch = false; updBatch(); },
    edit(b) { const r = JX.records.find((x) => x.id === rowOf(b).dataset.id); if (!r) return; S.edit = r.id; loadForm(r); closeSwipe(); syncAdd(); go('add'); },
    del(b) { const li = rowOf(b); closeSwipe(); delRecs([li.dataset.id], [li]); },
    'todo-done'(b) {
      const t = JX.todos.find((x) => x.id === rowOf(b).dataset.id);
      t.done = !t.done;
      ['#hDue', '#mTodo'].forEach((s) => { const el = $(s); if (el) el.innerHTML = s === '#hDue' ? dueHTML() : todosHTML(); });
      const li = $$(`[data-id="${t.id}"]`).find((x) => x.closest('#' + (S.route === 'home' ? 'hDue' : 'mTodo')));
      if (li && t.done && !reduce()) li.classList.add('strike');
    },
    'todo-add'(b) {
      const t = JX.todos.find((x) => x.id === rowOf(b).dataset.id), c = JX.cat[t.categoryKey];
      const sub = c.subs.find((s) => t.title.includes(s.name.slice(0, 2))) || { finance: c.subs[2], housing: c.subs[2] }[c.key] || c.subs[0];
      S.edit = ''; S.form = Object.assign(fresh(), { expr: String(t.amount), cat: c.key, sub: sub.key, note: t.title });
      syncAdd(); go('add');
    },
    'rec-tog'(b) { const r = JX.recurring.find((x) => x.id === rowOf(b).dataset.id); r.enabled = !r.enabled; $('#mRec').innerHTML = recHTML(); dirty.add('home'); },
    'rec-now'(b) {
      const r = JX.recurring.find((x) => x.id === rowOf(b).dataset.id), c = JX.cat[r.categoryKey];
      const rec = { id: 'n' + (++S.seq), type: 'expense', amount: r.amount, categoryKey: c.key, categoryName: c.name, subcategoryKey: r.subcategoryKey, subcategoryName: JX.subName(c.key, r.subcategoryKey), note: r.name + ' · 周期账单', date: TODAY, time: JX.NOW_TIME, person: '我', photo: false };
      insertRec(rec); stamp(rowOf(b)); touch();
      toast('已记入账簿 · ' + label$(rec), () => { removeRec(rec.id); touch(); });
    },
    sec(b) { const k = b.closest('li').dataset.k; S.open[k] = !S.open[k]; refreshToc(); const d = $(`.toc li[data-k="${k}"] .toc-d`); if (d && S.open[k] && !reduce()) d.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE }); },
    restore(b) {
      const id = rowOf(b).dataset.id, i = S.trash.findIndex((r) => r.id === id);
      if (i < 0) return;
      const [r] = S.trash.splice(i, 1);
      insertRec(r); refreshToc(); touch('more'); toast('已恢复 · ' + label$(r));
    },
    export(b) { S.exported = `计序账簿_2026-11-05.${b.dataset.v}`; refreshToc(); toast('导出完成 · ' + S.exported); },
    backup() { S.backedUp = `刚刚备份到云端 · ${JX.records.length} 笔`; refreshToc(); toast('备份完成'); },
    'restore-bk'() { toast('已载入 11月1日 的备份（演示数据不会被覆盖）'); },
    copy() { if (navigator.clipboard) navigator.clipboard.writeText(SYNC_CODE).catch(() => {}); toast('同步码已复制'); }
  };
  function setStatsMonth(ym) {
    if (ym === S.sym) return;
    const old = S.sym;
    S.sym = ym;
    $('#sMast').innerHTML = mastHTML(ym, 'sm'); roll($('#sMast'), pad(+old.slice(5)));
    swap($('#sTot'), stTotHTML(ym)); swap($('#sCat'), strataHTML()); swap($('#sDaily'), dailyHTML(ym));
    $$('#sSix li').forEach((li) => { const b = $('button', li), on = b.dataset.y === ym; li.classList.toggle('cur', on); b.setAttribute('aria-pressed', on); });
  }

  D.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); if (g.dataset.go === 'add') newEntry(); else go(g.dataset.go); return; }
    const k = e.target.closest('.keypad [data-k]');
    if (k) { key(k.dataset.k); return; }
    const a = e.target.closest('[data-act]');
    if (a && !a.disabled && ACT[a.dataset.act]) { ACT[a.dataset.act](a, e); return; }
    const row = e.target.closest('#hList .row');
    if (row) {
      if (S.batch) { S.sel.has(row.dataset.id) ? S.sel.delete(row.dataset.id) : S.sel.add(row.dataset.id); updBatch(); } else if (row.classList.contains('open')) closeSwipe();
    }
  });
  D.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'hq') { S.hf.q = t.value; clearTimeout(t._d); t._d = setTimeout(() => { renderList(); $('#hIdx .clr').disabled = false; }, 90); }
    if (t.id === 'aNote') S.form.note = t.value;
  });
  D.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'aTime') S.form.time = t.value;
    if (t.id === 'aDateIn' && t.value) { S.form.date = t.value > TODAY ? TODAY : t.value; syncAdd(); }
    if (t.matches('#hChips select')) { const f = t.dataset.f; S.hf[f] = t.value; if (f === 'cat') S.hf.sub = ''; refreshHist(); }
  });
  const isField = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  D.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'N' || e.key === 'n')) { e.preventDefault(); newEntry(); return; }
    if (e.key === 'Escape' && S.undo && !isField(e.target) && S.route !== 'add') { hideToast(); return; }
    if (S.route === 'history') {
      if (e.key === '/' && !isField(e.target)) { e.preventDefault(); $('#hq').focus(); }
      else if (e.key === 'Escape' && S.batch) ACT.batch();
      return;
    }
    if (S.route !== 'add' || e.ctrlKey || e.metaKey || e.altKey) return;
    const fld = isField(e.target);
    if (e.key === 'Enter' && !e.isComposing) { if (!fld && e.target.tagName === 'BUTTON' && e.target !== $('#amt')) return; e.preventDefault(); save(); return; }
    if (e.key === 'Escape') { e.preventDefault(); if (fld) e.target.blur(); if (S.form.expr) { S.form.expr = ''; updAmt(true); } else { S.form = fresh(S.form); syncAdd(); } $('#amt').focus({ preventScroll: true }); return; }
    if (fld) return;
    if (/^[0-9]$/.test(e.key) || e.key === '.' || e.key === '+') { e.preventDefault(); key(e.key); } else if (e.key === 'Backspace') { e.preventDefault(); key('back'); }
  });

  /* ---------- swipe-to-reveal (touch) ---------- */
  const OPEN = 144;
  let sw = null;
  function closeSwipe(except) { $$('#hList .row.open').forEach((li) => { if (li !== except) li.classList.remove('open'); }); }
  D.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || S.batch) return;
    const row = e.target.closest('#hList .row');
    if (!row || e.target.closest('.ra')) return;
    closeSwipe(row);
    sw = { row, inner: $('.ri', row), x: e.clientX, y: e.clientY, base: row.classList.contains('open') ? -OPEN : 0, lock: '', dx: 0 };
  }, { passive: true });
  D.addEventListener('pointermove', (e) => {
    if (!sw) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (!sw.lock) { if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { sw.lock = 'x'; sw.row.classList.add('drag'); } else if (Math.abs(dy) > 8) { sw = null; return; } }
    if (sw.lock === 'x') { sw.dx = dx; const x = Math.max(-OPEN - 28, Math.min(0, sw.base + dx)); sw.inner.style.transform = `translateX(${x}px)`; }
  }, { passive: true });
  const endSwipe = () => {
    if (!sw) return;
    const { row, inner, base, dx, lock } = sw;
    sw = null;
    if (lock !== 'x') return;
    row.classList.remove('drag');
    inner.style.transform = '';
    row.classList.toggle('open', base + dx < -OPEN / 2);
  };
  D.addEventListener('pointerup', endSwipe);
  D.addEventListener('pointercancel', endSwipe);

  /* ---------- boot ---------- */
  function chrome() {
    $('#spine').innerHTML = `<a class="sp-brand" href="#home" data-go="home" aria-label="计序 首页"><span class="zh">计序</span><i></i></a>` +
      `<a class="sp-seal" href="#add" data-go="add" aria-label="记一笔 (Ctrl+Shift+N)"><span class="zh">记</span></a>` +
      `<div class="sp-nav">${[['home', '首页', '01'], ['history', '账单', '02'], ['stats', '统计', '03'], ['more', '更多', '04']].map(([r, l, n]) => `<a class="sp-i" href="#${r}" data-go="${r}"><span class="micro">${n}</span><span class="zh">${l}</span></a>`).join('')}</div>` +
      `<div class="sp-grp"><span class="micro">MORE</span><button class="zh" data-act="goto" data-sec="recur">周期</button><button class="zh" data-act="goto" data-sec="todos">待办</button><button class="zh" data-act="goto" data-sec="toc">设置</button></div>` +
      `<div class="sp-ft">${themeBtn()}</div>`;
    $('#runhead').innerHTML = `<span class="micro">LEDGER · No.11 · NOV 2026</span><span class="rh-s"><span class="zh" id="rhT"></span><span class="micro" id="rhE"></span></span>` +
      `<span class="rh-r">${syncHTML()}<span class="rh-k"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>N</kbd><span>记一笔</span></span></span>`;
    $('#tabbar').innerHTML = [['home', '首页'], ['history', '账单'], ['add', '记'], ['stats', '统计'], ['more', '更多']].map(([r, l]) => (r === 'add'
      ? `<a class="tb-seal" href="#add" data-go="add" aria-label="记一笔"><span class="zh">记</span></a>`
      : `<a class="tb" href="#${r}" data-go="${r}"><i class="tb-m"></i><span class="zh">${l}</span></a>`)).join('');
  }
  if (new URLSearchParams(location.search).get('theme')) S.themeMode = S.theme;
  chrome();
  const first = R[location.hash.slice(1)] ? location.hash.slice(1) : 'home';
  H.classList.add('boot');
  show(first, true);
  window.demo = { go };
  const rest = ['stats', 'history', 'add', 'more', 'home'].filter((r) => r !== first);
  const pre = () => { const r = rest.shift(); if (!r) return; if (!rendered[r]) render(r); setTimeout(pre, 16); };
  requestAnimationFrame(() => setTimeout(pre, 0));
  Promise.all([D.fonts.ready, new Promise((r) => setTimeout(r, reduce() ? 80 : 720))]).then(() => {
    H.classList.remove('boot');
    H.dataset.ready = '1';
  });
})();
