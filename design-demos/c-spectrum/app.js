/* 计序 · 方向 C「色谱 · 日子」 */
(function () {
  'use strict';
  const JX = window.JX, D = document, R = D.documentElement;
  const TODAY = JX.TODAY, CUR = TODAY.slice(0, 7);
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE = 'cubic-bezier(.2,.7,.1,1)';
  const CHIP = {
    light: { social: '#F05A5E', housing: '#EE823E', food: '#F2B83A', pet: '#9DCF50', finance: '#41C092', medical: '#4DC3CF', transport: '#4FA8E7', education: '#697FE1', entertainment: '#AD78DA', shopping: '#F072A8', other: '#949CA9' },
    dark: { social: '#EA7372', housing: '#EB9462', food: '#F2C36A', pet: '#ADD676', finance: '#6AC59F', medical: '#73C9D3', transport: '#6EB1E3', education: '#778BDA', entertainment: '#B288D6', shopping: '#ED87B1', other: '#9EA5B0' }
  };
  const TILEC = { light: '#FFFFFF', dark: '#1C1A21' };
  const CNAME = { social: ['石榴红', 'Pomegranate', 22], housing: ['陶土橙', 'Terracotta', 50], food: ['万寿菊', 'Marigold', 82], pet: ['青柠', 'Lime', 128], finance: ['翡翠', 'Jade', 165], medical: ['湖水青', 'Lagoon', 205], transport: ['晴空蓝', 'Sky', 242], education: ['靛蓝', 'Indigo', 272], entertainment: ['紫罗兰', 'Violet', 308], shopping: ['莓果粉', 'Berry', 355], other: ['石板灰', 'Slate', 260] };
  const CK = JX.categories.map((c) => c.key);
  const ROUTES = ['home', 'add', 'history', 'stats', 'more'];
  const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

  const $ = (s, el) => (el || D).querySelector(s);
  const $$ = (s, el) => Array.from((el || D).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const theme = () => R.dataset.theme;
  const desk = () => innerWidth >= 1024;
  const cv = (k) => `--c:var(--c-${k});--d:var(--d-${k});--t:var(--t-${k});--k:var(--k-${k})`;
  const mon = (ym) => +ym.slice(5, 7);
  const ymCN = (ym) => CN[mon(ym)] + '月';
  const daysIn = (ym) => new Date(+ym.slice(0, 4), mon(ym), 0).getDate();
  const r2 = (n) => Math.round(n * 100) / 100;
  const raf2 = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 30));
  const wan = (n) => (n >= 10000 ? (n / 10000).toFixed(2).replace(/0$/, '') + '万' : JX.fmt(n, { decimals: 0 }));
  const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

  const IC = {
    home: 'M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z',
    list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
    stats: 'M5 20v-8M12 20V5M19 20v-5',
    more: 'M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z',
    plus: 'M12 5v14M5 12h14',
    sun: 'M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6zM12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
    moon: 'M19.5 14.6A7.6 7.6 0 0 1 9.4 4.5a7.6 7.6 0 1 0 10.1 10.1z',
    cloud: 'M7 18.5a4.5 4.5 0 0 1-.7-8.95A6 6 0 0 1 17.8 8.6a4.5 4.5 0 0 1-.3 9.9z',
    refresh: 'M19.5 11A7.5 7.5 0 0 0 6 6.6L4.5 8M4.5 4v4h4M4.5 13A7.5 7.5 0 0 0 18 17.4l1.5-1.4M19.5 20v-4h-4',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    receipt: 'M6.5 3.5h11v17l-2.75-1.75L12 20.5l-2.75-1.75L6.5 20.5zM9.5 8.5h5M9.5 12h5',
    search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.8-4.8',
    pen: 'M4.5 19.5h4l10-10-4-4-10 10zM13 7l4 4',
    trash: 'M4.5 7h15M10 11v6M14 11v6M6.5 7l.9 12.5h9.2L17.5 7M9.5 7V4.5h5V7',
    close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
    chevL: 'M14.5 5.5 8 12l6.5 6.5',
    chevR: 'M9.5 5.5 16 12l-6.5 6.5',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    back: 'M9 5.5h11v13H9L3.5 12zM12.5 9.5l5 5M17.5 9.5l-5 5',
    cal: 'M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5v4M15.5 3.5v4',
    clock: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2',
    repeat: 'M16.5 3l3 3-3 3M4.5 11V9.5a3.5 3.5 0 0 1 3.5-3.5h11.5M7.5 21l-3-3 3-3M19.5 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4.5',
    todo: 'M4.5 5h4v4h-4zM4.5 15h4v4h-4zM12 7h8M12 17h8',
    palette: 'M4.5 4.5h6v15h-6zM10.5 8.5l5-2.8 4 13.8-9 1M7.5 16.5h.01',
    download: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14',
    box: 'M4 5h16v4.5H4zM5.5 9.5v10h13v-10M10 13h4',
    key: 'M3.5 6.5h17v11h-17zM7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M8 14h8',
    bin: 'M4.5 7h15M6.5 7l.9 12.5h9.2L17.5 7M9.5 7V4.5h5V7M9.5 13.5 12 11l2.5 2.5M12 11v5.5',
    camera: 'M4 8.5h3.2l1.8-2.7h6l1.8 2.7H20V19H4zM12 10.5a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z',
    user: 'M12 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM5 20a7 7 0 0 1 14 0'
  };
  const ic = (n, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${IC[n]}"/></svg>`;

  /* ---------- state ---------- */
  const S = {
    homeYm: CUR, statsYm: CUR, level: 'main',
    H: { month: 'all', type: 'all', ck: 'all', sk: null, q: '' },
    sel: new Set(), selMode: false,
    trash: [], todos: JX.todos.map((t) => Object.assign({}, t)), recur: JX.recurring.map((r) => Object.assign({}, r)),
    sync: 'idle', syncText: '2 分钟前已同步', dirty: new Set(), rendered: new Set(),
    A: null
  };
  let ver = 0, nid = 0, cur = null;
  const cache = {};
  const memo = (key, fn) => { const k = key + '|' + ver; if (!(k in cache)) cache[k] = fn(); return cache[k]; };

  /* ---------- data helpers ---------- */
  const byCat = (ym, level, type) => memo('bc' + ym + level + (type || ''), () => JX.byCategory(ym, level, type));
  const totals = (ym) => memo('tt' + ym, () => JX.totals(ym));
  function monthColor(ym) {
    return memo('mc' + ym, () => {
      const m = {}; let tot = 0;
      JX.inMonth(ym, 'expense').forEach((r) => { if (r.subcategoryKey === 'rent') return; m[r.categoryKey] = (m[r.categoryKey] || 0) + r.amount; tot += r.amount; });
      const best = Object.keys(m).sort((a, b) => m[b] - m[a])[0] || 'other';
      return { key: best, total: m[best] || 0, share: tot ? (m[best] || 0) / tot : 0 };
    });
  }
  function dayMap(ym) {
    return memo('dm' + ym, () => {
      const m = {};
      JX.inMonth(ym, 'expense').forEach((r) => { const d = m[r.date] || (m[r.date] = { total: 0, cats: {}, n: 0 }); d.total += r.amount; d.n++; d.cats[r.categoryKey] = (d.cats[r.categoryKey] || 0) + r.amount; });
      Object.keys(m).forEach((k) => { const c = m[k].cats; m[k].dom = Object.keys(c).sort((a, b) => c[b] - c[a])[0]; });
      return m;
    });
  }
  function freq(type) {
    return memo('fq' + type, () => {
      const m = {};
      JX.records.forEach((r) => { if (r.type !== type || r.subcategoryKey === 'rent') return; const k = r.categoryKey + '/' + r.subcategoryKey; m[k] = (m[k] || 0) + 1; });
      return Object.keys(m).sort((a, b) => m[b] - m[a]).slice(0, 4).map((k) => { const p = k.split('/'); return { ck: p[0], sk: p[1], n: m[k] }; });
    });
  }
  function budgetOf(ym) {
    const b = JX.budget(ym), n = daysIn(ym), past = ym < CUR;
    const day = past ? n : +TODAY.slice(8, 10);
    const expected = b.budget * day / n;
    return { budget: b.budget, spent: b.spent, remain: b.remain, ratio: b.ratio, n, past, expected, daysLeft: past ? 0 : b.daysLeft, perDay: past ? 0 : b.perDay, pace: b.spent - expected };
  }
  function subColor(ck, idx) {
    const hex = CHIP[theme()][ck], base = TILEC[theme()];
    const t = [0, .3, .5, .64, .74, .82][Math.min(idx, 5)];
    const p = (h, i) => parseInt(h.slice(i, i + 2), 16);
    return '#' + [1, 3, 5].map((i) => Math.round(p(hex, i) * (1 - t) + p(base, i) * t).toString(16).padStart(2, '0')).join('');
  }
  function subItems(ym) {
    const list = byCat(ym, 'sub'), seen = {};
    const order = byCat(ym, 'main').map((c) => c.key);
    const out = [];
    order.forEach((ck) => list.filter((s) => s.categoryKey === ck).forEach((s) => { const i = seen[ck] = (seen[ck] == null ? 0 : seen[ck] + 1); out.push({ k: s.key, v: s.total, ck, name: s.name, color: subColor(ck, i), share: s.share }); }));
    return out;
  }
  const mainItems = (ym) => byCat(ym, 'main').map((c) => ({ k: c.key, v: c.total, ck: c.key, name: c.name, share: c.share }));
  function dueLabel(d) { const n = dayDiff(TODAY, d); return n === 0 ? '今天' : n === 1 ? '明天' : n === 2 ? '后天' : n < 0 ? '已过期' : mon(d) + '月' + (+d.slice(8)) + '日'; }
  function dataChanged() {
    ver++;
    ['home', 'history', 'stats', 'more'].forEach((r) => { if (r !== cur) S.dirty.add(r); });
    idle(flushDirty);
  }
  function flushDirty() { S.dirty.forEach((r) => { if (r !== cur) render(r); }); S.dirty.clear(); }
  function insertRecord(rec, at) {
    const list = JX.records;
    if (at == null) { const key = rec.date + rec.time; at = list.findIndex((r) => (r.date + r.time) <= key); if (at < 0) at = list.length; }
    list.splice(at, 0, rec);
  }
  function removeRecord(id) { const i = JX.records.findIndex((r) => r.id === id); if (i < 0) return null; const r = JX.records[i]; JX.records.splice(i, 1); return { r, i }; }

  /* ---------- atoms ---------- */
  function mny(n, o) {
    o = o || {}; const s = JX.splitMoney(n);
    const sign = o.sign != null ? o.sign : (s.neg ? '−' : '');
    return `<span class="mn${o.cls ? ' ' + o.cls : ''}">${sign ? `<span class="sg">${sign}</span>` : ''}<span class="cu">¥</span><span class="in">${s.int}</span><span class="de">.${s.dec}</span></span>`;
  }
  const mk = (k, size, bg) => `<span class="mk${size ? ' ' + size : ''}" style="${cv(k)}${bg ? ';--c:' + bg : ''}" aria-hidden="true">${JX.cat[k].glyph}</span>`;
  function hl(text, q) {
    if (!q) return esc(text);
    const lo = text.toLowerCase(), ql = q.toLowerCase(); let i = 0, out = '', j;
    while ((j = lo.indexOf(ql, i)) >= 0) { out += esc(text.slice(i, j)) + '<mark>' + esc(text.slice(j, j + q.length)) + '</mark>'; i = j + q.length; }
    return out + esc(text.slice(i));
  }
  function recHTML(r, o) {
    o = o || {}; const inc = r.type === 'income', q = o.q || '';
    const tools = o.tools ? `<div class="rec-tools"><button data-act="edit" data-id="${r.id}" aria-label="编辑">${ic('pen')}</button><button class="del" data-act="del" data-id="${r.id}" aria-label="删除">${ic('trash')}</button></div>` : '';
    return `<div class="rec${inc ? ' inc' : ''}${S.sel.has(r.id) ? ' sel' : ''}" data-id="${r.id}" style="${cv(r.categoryKey)}">${o.tools ? `<div class="rec-act"><button data-act="edit" data-id="${r.id}">${ic('pen')}<span>编辑</span></button><button class="del" data-act="del" data-id="${r.id}">${ic('trash')}<span>删除</span></button></div>` : ''}<div class="rec-f"${o.open ? ` data-act="edit" data-id="${r.id}"` : ''}>${o.tools ? `<button class="ck" data-act="sel" data-id="${r.id}" aria-pressed="${S.sel.has(r.id)}" aria-label="选择">${ic('check')}</button>` : ''}${mk(r.categoryKey)}<div class="rec-m"><div class="rec-t">${hl(r.subcategoryName, q)}${r.note ? `<span class="rec-n">${hl(r.note, q)}</span>` : ''}</div><div class="rec-s"><span class="who ${r.person === '我' ? 'w-me' : 'w-nian'}" aria-label="${r.person}">${r.person === '我' ? '我' : '念'}</span><span>${r.person}</span><span aria-hidden="true">·</span><span class="tm">${r.time}</span>${r.photo ? `<span class="ph" aria-label="有小票照片">${ic('receipt')}小票</span>` : ''}</div></div><div class="amt">${inc ? '<span class="amt-tag">收入</span>' : ''}<span class="amt-v">${inc ? '+' : '−'}${JX.fmt(r.amount)}</span></div>${tools}</div></div>`;
  }

  /* odometer: digits roll via translateY only */
  const STRIP = '0<br>1<br>2<br>3<br>4<br>5<br>6<br>7<br>8<br>9';
  function odo(el, n, anim) {
    if (!el) return;
    const s = JX.fmt(Math.abs(n)), neg = n < 0, key = s + neg;
    if (el._k === key) return;
    const digits = s.replace(/\D/g, '').split('').map(Number), prev = el._d, start = [];
    let i = 0;
    const col = () => { const off = prev ? prev.length - digits.length + i : -1; const from = anim && prev ? (off >= 0 ? prev[off] : 0) : digits[i]; start.push(from); const h = `<span class="od"><span class="og">${digits[i]}</span><span class="os" style="transform:translateY(${-from * 10}%)">${STRIP}</span></span>`; i++; return h; };
    const p = s.split('.');
    el.innerHTML = `${neg ? '<span class="sg">−</span>' : ''}<span class="cu">¥</span><span class="in">${p[0].replace(/[\d,]/g, (c) => (c === ',' ? '<span class="cm">,</span>' : col()))}</span><span class="de">.${p[1].replace(/\d/g, col)}</span>`;
    el.setAttribute('aria-label', (neg ? '负' : '') + '¥' + s);
    el._k = key; el._d = digits;
    if (anim && !RM) {
      const ss = $$('.os', el);
      raf2(() => ss.forEach((x, j) => { if (start[j] === digits[j]) return; x.style.transition = `transform 700ms ${EASE} ${(ss.length - 1 - j) * 26}ms`; x.style.transform = `translateY(${-digits[j] * 10}%)`; }));
    }
  }

  /* ---------- spectrum band ---------- */
  const bandHTML = (id, keys, cls) => `<div class="bandw"><div class="band${cls ? ' ' + cls : ''}" id="${id}" role="img">${keys.map((k) => `<i class="seg" data-k="${k}"></i>`).join('')}</div><div class="btip"></div></div>`;
  function layBand(band, items, mode, from) {
    if (!band) return;
    const W = band.clientWidth || band._W || 600; band._W = W;
    const vis = items.filter((it) => it.v > 0), total = vis.reduce((s, it) => s + it.v, 0) || 1;
    const g = band.classList.contains('thin') ? 2 : W > 520 ? 3 : 2, avail = W - g * Math.max(0, vis.length - 1);
    const geo = {}; let x = 0;
    vis.forEach((it) => { const w = Math.max(2, it.v / total * avail); geo[it.k] = { x, w, it, share: it.v / total }; x += w + g; });
    band._geo = geo; band._items = items;
    band.setAttribute('aria-label', vis.slice(0, 5).map((it) => `${it.name} ${Math.round(it.v / total * 100)}%`).join('，'));
    const segs = $$('.seg', band);
    const anim = mode !== 'none' && !RM;
    segs.forEach((s, idx) => {
      const k = s.dataset.k, gm = geo[k];
      const it = items.find((t) => t.k === k);
      if (it && it.color) s.style.background = it.color; else if (!s.style.background) s.style.background = `var(--c-${k})`;
      const tf = gm ? `translateX(${gm.x}px) scaleX(${gm.w / W})` : `translateX(${s._x || 0}px) scaleX(0)`;
      if (gm) s._x = gm.x;
      if (!anim) { s.style.transition = 'none'; s.style.transform = tf; return; }
      if (mode === 'grow' || from) {
        const f = from && from[k];
        s.style.transition = 'none';
        s.style.transform = f ? `translateX(${f.x}px) scaleX(${f.w / W})` : `translateX(${gm ? gm.x : 0}px) scaleX(0)`;
        s._tf = tf; s._dl = mode === 'grow' ? Math.min(idx, 7) * 45 : 0;
      } else {
        s.style.transition = `transform 460ms ${EASE}, opacity .22s`;
        s.style.transform = tf;
      }
    });
    if (anim && (mode === 'grow' || from)) {
      const order = vis.map((it) => it.k);
      raf2(() => segs.forEach((s) => { const o = order.indexOf(s.dataset.k); s.style.transition = `transform ${mode === 'grow' ? 640 : 480}ms ${EASE} ${mode === 'grow' ? Math.min(Math.max(o, 0), 7) * 45 : 0}ms, opacity .22s`; s.style.transform = s._tf; }));
    }
  }
  function bandFocus(band, k) {
    if (!band) return;
    band.classList.toggle('focus', !!k);
    $$('.seg', band).forEach((s) => s.classList.toggle('on', s.dataset.k === k));
    const tip = band.parentNode.querySelector('.btip');
    if (!tip) return;
    const gm = k && band._geo && band._geo[k];
    if (!gm) { tip.classList.remove('on'); return; }
    const it = gm.it;
    tip.innerHTML = `${mk(it.ck, 's', it.color)}<b>${esc(it.name)}</b><span class="num">¥${JX.fmt(it.v)}</span><span>${(gm.share * 100).toFixed(gm.share < .1 ? 1 : 0)}%</span>`;
    const tw = tip.offsetWidth, W = band._W;
    tip.style.transform = `translateX(${Math.max(0, Math.min(W - tw, gm.x + gm.w / 2 - tw / 2))}px)`;
    tip.classList.add('on');
  }
  function bandAt(band, clientX) {
    const r = band.getBoundingClientRect(), x = clientX - r.left, geo = band._geo || {};
    let best = null, bd = 1e9;
    Object.keys(geo).forEach((k) => { const g = geo[k], c = g.x + g.w / 2, d = x >= g.x - 1.5 && x <= g.x + g.w + 1.5 ? -1 : Math.abs(x - c); if (d < bd) { bd = d; best = k; } });
    return bd < 12 ? best : null;
  }

  /* ---------- shared bits ---------- */
  const monthSwitch = (scope, ym) => { const i = JX.MONTHS.indexOf(ym); return `<div class="msw"><button class="msw-b" data-act="mstep" data-scope="${scope}" data-d="-1" ${i <= 0 ? 'disabled' : ''} aria-label="上个月">${ic('chevL')}</button><span class="msw-l" id="${scope}-ml" aria-live="polite"><b>${mon(ym)}月</b><span>${ym.slice(0, 4)}</span></span><button class="msw-b" data-act="mstep" data-scope="${scope}" data-d="1" ${i >= JX.MONTHS.length - 1 ? 'disabled' : ''} aria-label="下个月">${ic('chevR')}</button></div>`; };
  const syncChip = () => `<button class="sync${S.sync === 'ing' ? ' ing' : S.sync === 'ok' ? ' ok' : ''}" data-act="sync" aria-label="云同步：${S.syncText}，点击立即同步"><span class="sy-i">${ic('cloud', 'i-cl')}${ic('refresh', 'i-rf')}${ic('check', 'i-ck')}<i class="sy-dot"></i></span><span class="sy-t"><b>${S.sync === 'ing' ? '同步中…' : S.syncText}</b></span></button>`;
  const themeBtn = () => `<button class="iconbtn" data-act="theme" aria-label="切换${theme() === 'dark' ? '浅色' : '暗色'}模式">${ic(theme() === 'dark' ? 'sun' : 'moon')}</button>`;
  const seg2 = (act, opts, val) => `<div class="seg2" role="group">${opts.map((o) => `<button data-act="${act}" data-v="${o[0]}" aria-pressed="${o[0] === val}">${o[1]}</button>`).join('')}<i class="thumb"></i></div>`;
  function fitSeg(root) {
    $$('.seg2', root).forEach((g) => { const on = $('[aria-pressed=true]', g), th = $('.thumb', g); if (!on || !th) return; th.style.width = on.offsetWidth + 'px'; th.style.transform = `translateX(${on.offsetLeft - 4}px)`; });
  }
  const rise = (n) => `rise" style="--n:${n}`;
  const headline = (ym) => { const c = monthColor(ym); return `${ym === CUR ? '这个月' : ymCN(ym)}是<span class="sw-dot" style="${cv(c.key)}"></span><em style="${cv(c.key)}">${CNAME[c.key][0]}</em>色的`; };

  /* ---------- HOME ---------- */
  function top3HTML(ym) {
    const list = byCat(ym, 'main').slice(0, 3);
    return list.map((c, i) => `<button class="lg" data-act="drill" data-ck="${c.key}" data-ym="${ym}" data-hover="${c.key}"><span class="rank">0${i + 1}</span>${mk(c.key)}<span class="lg-t"><span class="lg-n">${esc(c.name)}<i>${Math.round(c.share * 100)}%</i></span>${mny(c.total)}</span></button>`).join('') || '<p class="eb">这个月还没有支出</p>';
  }
  function swatchHTML(ym) {
    const c = monthColor(ym), n = CNAME[c.key];
    return `<div class="sw-field"><div class="sw-top"><span>JX ${String(mon(ym)).padStart(2, '0')}·${String(n[2]).padStart(3, '0')}</span><span>${ym.slice(0, 4)}</span></div><span class="sw-glyph">${JX.cat[c.key].glyph}</span><span class="sw-share">${Math.round(c.share * 100)}<small>%</small></span></div><div class="sw-label"><span class="eb">${ym === CUR ? '本月色' : ymCN(ym) + '色'} · <span class="lat">Colour of the month</span></span><h3>${n[0]}<span class="lat">${n[1]}</span></h3><p class="sw-note">房租之外，「${esc(JX.cat[c.key].name)}」花得最多，共 ¥${JX.fmt(c.total, { trim: true })}。</p></div>`;
  }
  function budgetHTML(ym) {
    const b = budgetOf(ym), cats = byCat(ym, 'main');
    const fill = Math.min(1, b.ratio), paceY = Math.min(1, b.expected / b.budget) * 100;
    const big = b.past ? (b.remain >= 0 ? b.remain : -b.remain) : b.remain;
    let pace;
    if (b.past) pace = b.remain >= 0 ? `${ymCN(ym)}已结束，<b>省下 ¥${JX.fmt(b.remain, { trim: true })}</b>。` : `${ymCN(ym)}已结束，<b>超出预算 ¥${JX.fmt(-b.remain, { trim: true })}</b>，房租占了大头。`;
    else {
      const big1 = JX.inMonth(ym, 'expense').slice().sort((x, y) => y.amount - x.amount)[0];
      pace = `<span class="pdot"></span>按匀速，今天应花到 ¥${JX.fmt(b.expected, { decimals: 0 })}；现在${b.pace >= 0 ? `<b>快了 ¥${JX.fmt(b.pace, { decimals: 0 })}</b>` : `<b>慢了 ¥${JX.fmt(-b.pace, { decimals: 0 })}</b>`}${big1 && b.pace > 0 && big1.amount > b.pace * .6 ? `，主要是「${esc(big1.note || big1.subcategoryName)}」一次性支出。` : '。'}`;
    }
    return `<div class="tile-h"><h3>预算</h3><span class="meta">每月 ¥${JX.fmt(b.budget, { decimals: 0 })} · 已用 ${Math.round(b.ratio * 100)}%</span></div>
    <div class="bd"><div class="jarw"><div class="jar-ticks" aria-hidden="true"><span>0</span><span>2k</span><span>4k</span><span>6k</span><span>8k</span></div><div class="jar${b.ratio > 1 ? ' over' : ''}" id="jar" role="img" aria-label="已用 ${Math.round(b.ratio * 100)}%"><div class="jar-fill" style="transform:scaleY(${fill})">${cats.map((c) => `<i style="flex:${c.total} 0 0;background:var(--c-${c.categoryKey})"></i>`).join('')}</div><i class="jar-pace" style="transform:translateY(${-paceY}%)"></i></div></div>
    <div class="bd-n"><div><span class="eb">${b.past ? (b.remain >= 0 ? '结余预算' : '超出预算') : '剩余可花'}</span><div class="bd-big num${b.remain < 0 ? ' neg' : ''}">${mny(big, { sign: b.remain < 0 ? '−' : '' })}</div></div>
    ${b.past ? `<div><span class="eb">本月共花</span><div class="bd-mid num">${mny(b.spent)}</div></div>` : `<div><span class="eb">日均可花 · 还剩 ${b.daysLeft} 天</span><div class="bd-mid num">${mny(b.perDay)}</div></div>`}
    <p class="pace">${pace}</p></div></div>`;
  }
  function reportHTML(ym) {
    const lines = JX.report(ym).slice();
    const recs = JX.inMonth(ym), me = recs.filter((r) => r.person === '我').length;
    if (recs.length) lines.push(`这个月你记了 ${me} 笔，阿念记了 ${recs.length - me} 笔。`);
    const fmtL = (l) => esc(l).replace(/¥[\d,]+(\.\d+)?/g, '<b class="rn">$&</b>').replace(/「([^」]+)」/g, (m, n) => { const c = JX.categories.find((x) => x.name === n); return c ? `<span class="rc" style="${cv(c.key)}">${n}</span>` : '「' + n + '」'; });
    const cats = byCat(ym, 'main');
    return `<div class="tile-h"><h3>月度报告 <span class="eb">${ymCN(ym)}</span></h3></div><div class="rp">${lines.map((l) => `<p>${fmtL(l)}</p>`).join('')}</div><div class="rp-strip" aria-hidden="true">${cats.map((c) => `<i style="flex:${c.total} 0 0;background:var(--c-${c.categoryKey})"></i>`).join('')}</div>`;
  }
  function todoRows(list, full) {
    return list.map((t) => {
      const due = dueLabel(t.due), n = dayDiff(TODAY, t.due);
      return `<div class="td${t.done ? ' done' : ''}" data-tid="${t.id}" style="${cv(t.categoryKey)}">${full ? `<button class="tck" data-act="todo" data-id="${t.id}" aria-pressed="${t.done}" aria-label="完成">${ic('check')}</button>` : ''}<div class="td-m"><b>${full ? '' : mk(t.categoryKey, 's')}${esc(t.title)}</b><span><span class="td-due${n > 0 ? ' soon' : ''}">${due}${t.time ? ' ' + t.time : ''}</span>· ${t.repeat}</span></div><span class="td-amt">${t.amount ? '¥' + JX.fmt(t.amount, { trim: true }) : ''}</span>${full ? '' : `<div class="td-act"><button class="pill" data-act="todo" data-id="${t.id}">${ic('check')}${t.done ? '已完成' : '完成'}</button>${t.amount ? `<button class="pill ink" data-act="todo-rec" data-id="${t.id}">${ic('plus')}记账</button>` : ''}</div>`}</div>`;
    }).join('');
  }
  function nextRecur() { return S.recur.filter((r) => r.enabled).sort((a, b) => a.next.localeCompare(b.next))[0]; }
  function recurHTML() {
    const r = nextRecur(); if (!r) return '<p class="eb">没有启用的周期账单</p>';
    const n = dayDiff(TODAY, r.next);
    return `<span class="eb">下一笔周期账单</span><h3>${mk(r.categoryKey, 's')}${esc(r.name)}</h3><div class="rc-amt num">${mny(r.amount)}</div><p class="rc-when"><b>${n} 天后</b> · ${mon(r.next)}月${+r.next.slice(8)}日 · ${r.cycle}</p><button class="pill" data-act="recur-now" data-id="${r.id}">${ic('repeat')}立即记录</button>`;
  }
  function todayHTML() {
    const today = JX.records.filter((r) => r.date === TODAY), recent = JX.records.filter((r) => r.date < TODAY).slice(0, Math.max(3, 6 - today.length));
    const sum = today.reduce((s, r) => s + (r.type === 'expense' ? r.amount : 0), 0);
    return `<div class="tile-h"><h3>今天 <span class="eb">${mon(TODAY)}月${+TODAY.slice(8)}日 ${JX.weekday(TODAY)}</span></h3><button class="lnk" data-go="history">全部账单${ic('chevR')}</button></div>
    <div class="today-cols"><div><div class="sub-h"><span class="eb">${today.length} 笔 · 支出 ¥${JX.fmt(sum)}</span></div>${today.map((r) => recHTML(r, { open: 1 })).join('') || '<p class="eb">今天还没记账</p>'}</div>
    <div><div class="sub-h"><span class="eb">最近</span></div>${recent.map((r) => recHTML(r, { open: 1 })).join('')}</div></div>`;
  }
  function homeHTML() {
    const ym = S.homeYm, t = totals(ym), mc = monthColor(ym);
    const pending = S.todos.filter((x) => !x.done).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 2);
    return `<div class="vw"><header class="vh"><div class="vh-l"><p class="greet">${mon(TODAY)}月${+TODAY.slice(8)}日 ${JX.weekday(TODAY)} · 晚上好</p><h1 class="ttl" id="h-ttl">${headline(ym)}</h1></div><div class="vh-r">${syncChip()}<span class="m-only">${themeBtn()}</span><button class="btn-ink d-only" data-go="add">${ic('plus')}<span>记一笔</span><kbd>Ctrl</kbd><kbd>⇧</kbd><kbd>N</kbd></button></div></header>
    <div class="bento">
      <article class="tile hero c8 ${rise(0)}"><div class="hero-top">${monthSwitch('home', ym)}<div class="hero-io" id="h-io"><div><span class="eb">收入</span>${mny(t.income)}</div><div><span class="eb">结余</span>${mny(t.balance)}</div></div></div>
        <span class="eb hero-lab" id="h-lab">${ymCN(ym)} · 支出 · ${t.count} 笔</span><div class="hero-num odo num" id="h-num"></div>${bandHTML('h-band', CK)}<div class="legend" id="h-top3">${top3HTML(ym)}</div></article>
      <article class="tile swatch c4 st ${rise(1)}" id="h-sw" style="${cv(mc.key)}">${swatchHTML(ym)}</article>
      <article class="tile budget c5 ${rise(2)}" id="h-bud">${budgetHTML(ym)}</article>
      <article class="tile todo c4 t3 ${rise(3)}"><div class="tile-h"><h3>待办</h3><button class="lnk" data-go="more">全部${ic('chevR')}</button></div>${todoRows(pending)}</article>
      <article class="tile recur c3 t3 st ${rise(4)}" id="h-rc" style="${cv((nextRecur() || { categoryKey: 'other' }).categoryKey)}">${recurHTML()}</article>
      <article class="tile today c7 ${rise(5)}">${todayHTML()}</article>
      <article class="tile report c5 st ${rise(6)}" id="h-rp">${reportHTML(ym)}</article>
    </div></div>`;
  }
  function homeMount(first) {
    odo($('#h-num'), totals(S.homeYm).expense, false);
    layBand($('#h-band'), mainItems(S.homeYm), first ? 'grow' : 'none');
  }
  function homeMonth(dir) {
    const ym = S.homeYm, t = totals(ym), mc = monthColor(ym);
    odo($('#h-num'), t.expense, true);
    layBand($('#h-band'), mainItems(ym), 'flip');
    tick($('#home-ml'), ym, dir);
    swapIn($('#h-top3'), top3HTML(ym));
    $('#h-io').innerHTML = `<div><span class="eb">收入</span>${mny(t.income)}</div><div><span class="eb">结余</span>${mny(t.balance)}</div>`;
    $('#h-lab').textContent = `${ymCN(ym)} · 支出 · ${t.count} 笔`;
    $('#h-ttl').innerHTML = headline(ym);
    const sw = $('#h-sw'); sw.setAttribute('style', cv(mc.key)); swapIn(sw, swatchHTML(ym));
    const b = budgetOf(ym), bud = $('#h-bud');
    const oldFill = $('.jar-fill', bud), oldT = oldFill && oldFill.style.transform, oldP = $('.jar-pace', bud).style.transform;
    bud.innerHTML = budgetHTML(ym);
    const nf = $('.jar-fill', bud), np = $('.jar-pace', bud), tf = nf.style.transform, tp = np.style.transform;
    if (!RM) { nf.style.transition = np.style.transition = 'none'; nf.style.transform = oldT; np.style.transform = oldP; raf2(() => { nf.style.transition = np.style.transition = ''; nf.style.transform = tf; np.style.transform = tp; }); }
    swapIn($('.bd-n', bud));
    swapIn($('#h-rp'), reportHTML(ym));
    void b;
  }
  function tick(el, ym, dir) { if (!el) return; el.innerHTML = `<b>${mon(ym)}月</b><span>${ym.slice(0, 4)}</span>`; el.classList.remove('up', 'dn'); void el.offsetWidth; el.classList.add(dir > 0 ? 'up' : 'dn'); }
  function swapIn(el, html) { if (!el) return; if (html != null) el.innerHTML = html; if (RM) return; el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE }); }

  /* ---------- ADD ---------- */
  function freshForm(keep) {
    return Object.assign({ type: 'expense', expr: '', ck: null, sk: null, note: '', date: TODAY, time: JX.NOW_TIME, person: '我', photo: false, editId: null }, keep || {});
  }
  S.A = freshForm();
  const termOk = (t) => /^\d*(\.\d{0,2})?$/.test(t);
  function exprVal(e) { return r2(e.split('+').reduce((s, t) => s + (parseFloat(t) || 0), 0)); }
  function dispTerm(t) { if (!t) return ''; const p = t.split('.'); return (p[0] ? (+p[0]).toLocaleString('en-US') : '0') + (p.length > 1 ? '.' + p[1] : ''); }
  function addHTML() {
    const A = S.A, fq = freq(A.type);
    const metaChips = `<div class="chipg" role="group" aria-label="日期"><button data-act="date" data-v="today" aria-pressed="${A.date === TODAY}">今天</button><button data-act="date" data-v="yday" aria-pressed="${dayDiff(A.date, TODAY) === 1}">昨天</button><label aria-pressed="${dayDiff(A.date, TODAY) > 1}">${ic('cal')}<span class="a-dl">${dayDiff(A.date, TODAY) > 1 ? mon(A.date) + '月' + (+A.date.slice(8)) + '日' : '选择日期'}</span><input type="date" data-in="date" max="${TODAY}" value="${A.date}" aria-label="选择日期"></label></div>
      <div class="chipg"><label>${ic('clock')}<span class="tmv a-tm">${A.time}</span><input type="time" data-in="time" value="${A.time}" aria-label="时间"></label></div>
      <div class="chipg" role="group" aria-label="记账人">${['我', '阿念'].map((p) => `<button data-act="person" data-v="${p}" aria-pressed="${A.person === p}">${p}</button>`).join('')}</div>
      <div class="chipg"><button class="photo-b${A.photo ? ' has' : ''}" data-act="photo" aria-pressed="${A.photo}">${A.photo ? '<span class="rcpt"></span>小票已附' : ic('camera') + '拍小票'}</button></div>`;
    return `<div class="vw"><header class="vh add-h"><button class="iconbtn m-only" data-act="close-add" aria-label="关闭">${ic('close')}</button><div class="vh-l d-only"><p class="greet">${A.editId ? '编辑这笔' : '记一笔 · 键盘直接输入'}</p><h1 class="ttl">${A.editId ? '编辑账单' : '记一笔'}</h1></div>${seg2('atype', [['expense', '支出'], ['income', '收入']], A.type)}<div class="astrip d-only" id="a-strip-d"></div><span class="m-only" style="width:44px"></span></header>
    <div class="astrip m-only" id="a-strip-m"></div>
    <div class="bento add-b">
      <section class="tile apanel c7 ${rise(0)}${A.type === 'income' ? ' inc' : ''}" id="apanel"><div class="ap-bg" id="ap-bg"></div><div class="ap-in">
        <div class="ap-top"><span class="ap-cat" id="a-cat"></span><span class="eb d-only" id="a-when"></span></div>
        <div class="ap-amt"><div class="ap-expr" id="a-expr"></div><div class="ap-num num" id="a-num" aria-live="polite"></div><p class="ap-err" id="a-err"></p></div>
        <input class="ap-note" id="a-note" data-in="note" placeholder="添加备注，比如：和阿念吃火锅" maxlength="40" value="${esc(A.note)}" aria-label="备注">
        <div class="ap-meta">${metaChips}</div>
        <div class="ap-foot d-only"><div class="kbds"><span><kbd>0</kbd>–<kbd>9</kbd> 金额</span><span><kbd>+</kbd> 连加</span><span><kbd>Tab</kbd> 下一项</span><span><kbd>Esc</kbd> 清空</span><span><kbd>Ctrl</kbd><kbd>⇧</kbd><kbd>N</kbd> 随时记一笔</span></div><button class="btn-save" data-act="save">保存<kbd>Enter</kbd></button></div>
      </div></section>
      <section class="tile apick c5 ${rise(1)}" id="apick">
        <div class="pk-sec"><div class="pk-h"><span class="eb">常用</span><span class="need-t" id="a-need"></span></div><div class="freq">${fq.map((f) => `<button class="fq" data-act="pick" data-ck="${f.ck}" data-sk="${f.sk}" style="${cv(f.ck)}">${mk(f.ck)}<span><b>${esc(JX.subName(f.ck, f.sk))}</b><small>${esc(JX.cat[f.ck].name)} · ${f.n} 次</small></span></button>`).join('')}</div></div>
        <div class="pk-sec"><div class="pk-h"><span class="eb">分类</span></div><div class="cgrid">${JX.categories.map((c) => `<button class="cb" data-act="cat" data-ck="${c.key}" aria-pressed="${A.ck === c.key}" style="${cv(c.key)}">${mk(c.key)}<span>${c.name.slice(0, 2)}</span></button>`).join('')}</div></div>
        <div class="pk-sec"><div class="pk-h"><span class="eb" id="a-subl">细分</span></div><div class="subs" id="a-subs"></div></div>
      </section>
      <div class="mmeta m-only">${metaChips}</div>
      <div class="kp m-only" id="kp">${['1', '2', '3', 'back', '4', '5', '6', '+', '7', '8', '9', 'save', '.', '0', '00'].map((k) => k === 'back' ? `<button class="k-fn" data-k="back" aria-label="退格">${ic('back')}</button>` : k === 'save' ? `<button class="k-save" data-k="save">${ic('check')}保存</button>` : `<button data-k="${k}"${k === '+' ? ' class="k-fn k-plus" aria-label="加"' : ''}>${k}</button>`).join('')}</div>
    </div></div>`;
  }
  function addMount() { addSync(true); stripRender(); fitSeg($('#v-add')); }
  function addSync(full) {
    const A = S.A, p = $('#apanel'); if (!p) return;
    const v = A.expr.split('+'), last = v[v.length - 1];
    const multi = v.length > 1;
    const shown = multi ? JX.fmt(exprVal(A.expr), { trim: true }) : dispTerm(last);
    const num = $('#a-num');
    num.innerHTML = `<span class="cu">¥</span>${shown ? `<span>${shown}</span>` : '<span class="ph0">0</span>'}${!multi ? '<i class="caret"></i>' : ''}`;
    num.classList.toggle('sm', shown.length > 7); num.classList.toggle('xs', shown.length > 10);
    $('#a-expr').textContent = multi ? v.map(dispTerm).join(' + ') + ' =' : '';
    const cat = $('#a-cat');
    if (A.ck) { cat.className = 'ap-cat'; cat.innerHTML = `${mk(A.ck)}${esc(JX.cat[A.ck].name)}${A.sk ? ' · ' + esc(JX.subName(A.ck, A.sk)) : ''}`; }
    else { cat.className = 'ap-cat none'; cat.textContent = '还没选分类'; }
    const w = $('#a-when'); if (w) w.textContent = `${A.date === TODAY ? '今天' : JX.dateLabel(A.date)} ${A.time} · ${A.person}`;
    $$('.k-save').forEach((b) => { b.classList.toggle('c-on', !!A.ck && A.type === 'expense'); if (A.ck) b.setAttribute('style', cv(A.ck)); });
    if (!full) return;
    $$('.cb', p.parentNode).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ck === A.ck)));
    subsRender(false);
    paintPanel(null, true);
  }
  function subsRender(anim) {
    const A = S.A, box = $('#a-subs'); if (!box) return;
    $('#a-subl').textContent = A.ck ? JX.cat[A.ck].name + ' · 细分' : '细分';
    box.innerHTML = A.ck ? JX.cat[A.ck].subs.map((s) => `<button class="sb" data-act="sub" data-sk="${s.key}" aria-pressed="${s.key === A.sk}" style="${cv(A.ck)}">${esc(s.name)}</button>`).join('') : '<span class="hint">先选一个分类，细分会出现在这里</span>';
    box.classList.remove('in'); if (anim && !RM) { void box.offsetWidth; box.classList.add('in'); }
  }
  function panelColor() { const A = S.A; return A.type === 'income' ? 'var(--inc-field)' : A.ck ? `var(--c-${A.ck})` : 'var(--tile)'; }
  function paintPanel(fromEl, instant) {
    const p = $('#apanel'), bg = $('#ap-bg'); if (!p) return;
    const color = panelColor(), inc = S.A.type === 'income';
    p.classList.toggle('c-on', !!S.A.ck && !inc);
    if (instant || RM) { bg.style.background = color; p.classList.toggle('inc', inc); $$('.fl', bg).forEach((x) => x.remove()); return; }
    const pr = p.getBoundingClientRect();
    let cx = pr.width / 2, cy = pr.height / 2;
    if (fromEl) { const r = fromEl.getBoundingClientRect(); cx = Math.max(0, Math.min(pr.width, r.left + r.width / 2 - pr.left)); cy = Math.max(0, Math.min(pr.height, r.top + r.height / 2 - pr.top)); }
    const rad = Math.ceil(Math.hypot(Math.max(cx, pr.width - cx), Math.max(cy, pr.height - cy))) + 2;
    const c = D.createElement('i'); c.className = 'fl';
    c.style.cssText = `width:${rad * 2}px;height:${rad * 2}px;left:${cx - rad}px;top:${cy - rad}px;background:${color}`;
    bg.appendChild(c);
    setTimeout(() => p.classList.toggle('inc', inc), 150);
    c.animate([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.3,.6,.2,1)' }).onfinish = () => { bg.style.background = color; $$('.fl', bg).forEach((x) => { if (x === c || x.compareDocumentPosition(c) & 4) x.remove(); }); };
  }
  function pickCat(ck, sk, el) {
    const A = S.A, changed = A.ck !== ck;
    A.ck = ck; A.sk = sk || (A.ck && changed ? bestSub(ck) : A.sk) || JX.cat[ck].subs[0].key;
    $('#apick').classList.remove('need'); $('#a-need').textContent = '';
    $$('.cb').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ck === ck)));
    if (changed) { subsRender(true); if (A.type === 'expense') paintPanel(el); else p2(); } else subsRender(false);
    addSync(false); err('');
    function p2() { $('#apanel').classList.remove('c-on'); }
  }
  function bestSub(ck) { const f = {}; JX.records.forEach((r) => { if (r.categoryKey === ck && r.type === S.A.type) f[r.subcategoryKey] = (f[r.subcategoryKey] || 0) + 1; }); return Object.keys(f).sort((a, b) => f[b] - f[a])[0]; }
  function err(msg, which) {
    const e = $('#a-err'); if (!e) return;
    e.textContent = msg; e.classList.toggle('on', !!msg);
    if (!msg) return;
    const el = which === 'cat' ? $('#apick') : $('#a-num');
    if (which === 'cat') { el.classList.add('need'); $('#a-need').textContent = '请选择分类'; }
    if (!RM) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
  }
  function keyIn(k) {
    const A = S.A; let e = A.expr;
    const terms = e.split('+'), last = terms[terms.length - 1];
    if (k === 'back') e = e.slice(0, -1);
    else if (k === 'clear') e = '';
    else if (k === '+') { if (last && last !== '.') e += '+'; }
    else if (k === '.') { if (!last.includes('.')) e += last ? '.' : '0.'; }
    else if (/^\d+$/.test(k)) {
      const nt = (last === '0' && !k.startsWith('.') ? '' : last) + k;
      if (termOk(nt) && nt.split('.')[0].length <= 8) e = e.slice(0, e.length - last.length) + (last === '0' ? k.replace(/^0+(?=\d)/, '') : nt);
    }
    if (e === A.expr) return;
    A.expr = e; err(''); addSync(false);
    const n = $('#a-num'); if (!RM) { n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); }
  }
  function stripRender(grow) {
    const ym = CUR, t = totals(ym);
    ['#a-strip-d', '#a-strip-m'].forEach((id) => {
      const el = $(id); if (!el) return;
      el.innerHTML = `<span class="as-t">本月色谱<b class="num">¥${JX.fmt(t.expense)}</b></span>${bandHTML(id.slice(1) + '-b', CK, 'thin')}<span class="as-inc" title="本月收入">收入 ¥${wan(t.income)}</span>`;
    });
    raf2(() => { layBand($('#a-strip-d-b'), mainItems(ym), 'none'); layBand($('#a-strip-m-b'), mainItems(ym), 'none'); });
  }
  function stripUpdate(ck, inc) {
    const ym = CUR, t = totals(ym);
    ['#a-strip-d', '#a-strip-m'].forEach((id) => {
      const el = $(id); if (!el || !el.offsetParent) return;
      $('.as-t b', el).textContent = '¥' + JX.fmt(t.expense);
      const ai = $('.as-inc', el); ai.textContent = '收入 ¥' + wan(t.income);
      if (inc) { ai.classList.add('pop'); setTimeout(() => ai.classList.remove('pop'), 320); }
      const b = $('.band', el); layBand(b, mainItems(ym), 'flip');
      if (ck && !inc && !RM) { const s = $(`.seg[data-k="${ck}"]`, b); if (s) setTimeout(() => s.animate([{ opacity: 1 }, { opacity: .35 }, { opacity: 1 }], { duration: 520, easing: EASE }), 200); }
    });
  }
  function visibleStrip() { return [$('#a-strip-d'), $('#a-strip-m')].find((x) => x && x.offsetParent); }
  function save() {
    const A = S.A, v = exprVal(A.expr);
    if (!(v > 0)) return err('先输入金额', 'amt');
    if (!A.ck) return err('选一个分类', 'cat');
    if (v > 99999999) return err('金额太大了', 'amt');
    const c = JX.cat[A.ck];
    const rec = { id: A.editId || 'n' + (++nid), type: A.type, amount: v, categoryKey: A.ck, categoryName: c.name, subcategoryKey: A.sk, subcategoryName: JX.subName(A.ck, A.sk), note: A.note.trim(), date: A.date, time: A.time, person: A.person, photo: A.photo };
    const snap = Object.assign({}, A);
    let old = null;
    if (A.editId) old = removeRecord(A.editId);
    insertRecord(rec);
    dataChanged();
    S.A = freshForm({ type: A.type, ck: A.ck, sk: A.sk, date: A.date, person: A.person });
    const wasEdit = !!snap.editId;
    flight(rec, () => stripUpdate(rec.categoryKey, rec.type === 'income'));
    const noteEl = $('#a-note'); if (noteEl) noteEl.value = '';
    $$('.photo-b').forEach((b) => { b.classList.remove('has'); b.setAttribute('aria-pressed', 'false'); b.innerHTML = ic('camera') + '拍小票'; });
    addSync(false);
    if (wasEdit) { render('add'); }
    toast(`${mk(rec.categoryKey)}<span>${wasEdit ? '已更新' : '已记下'} · ${esc(rec.subcategoryName)} <span class="num">${rec.type === 'income' ? '+' : '−'}¥${JX.fmt(rec.amount)}</span></span>`, () => {
      removeRecord(rec.id); if (old) insertRecord(old.r, old.i);
      dataChanged(); S.A = snap;
      if (cur === 'add') { render('add'); } else S.dirty.add('add');
      stripUpdate(null);
    });
  }
  function flight(rec, done) {
    const strip = visibleStrip(), num = $('#a-num');
    if (RM || !strip || !num) { done(); return; }
    const band = $('.band', strip), target = rec.type === 'income' ? $('.as-inc', strip) : band;
    const tr = target.getBoundingClientRect();
    let tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
    if (rec.type !== 'income') {
      const items = mainItems(CUR), W = band.clientWidth, total = items.reduce((s, i) => s + i.v, 0), g = 2, avail = W - g * (items.length - 1);
      let x = 0; for (const it of items) { const w = Math.max(2, it.v / total * avail); if (it.k === rec.categoryKey) { tx = tr.left + x + w / 2; break; } x += w + g; }
    }
    const nr = num.getBoundingClientRect();
    const el = D.createElement('div'); el.className = 'fly'; el.setAttribute('style', cv(rec.categoryKey) + (rec.type === 'income' ? ';--c:var(--inc-field);--d:var(--inc-ink)' : ''));
    el.innerHTML = `${mk(rec.categoryKey)}<b>${JX.fmt(rec.amount, { trim: true })}</b>`;
    D.body.appendChild(el);
    const w = el.offsetWidth, h = el.offsetHeight, sx = nr.left + 4, sy = nr.top + nr.height / 2 - h / 2;
    const dx = tx - w / 2 - sx, dy = ty - h / 2 - sy;
    el.animate([
      { transform: `translate(${sx}px,${sy}px) scale(1)`, opacity: 0 },
      { transform: `translate(${sx}px,${sy - 8}px) scale(1.04)`, opacity: 1, offset: .14 },
      { transform: `translate(${sx + dx * .45}px,${sy + dy * .3 - 40}px) scale(.72)`, opacity: 1, offset: .55 },
      { transform: `translate(${sx + dx}px,${sy + dy}px) scale(.16)`, opacity: .4 }
    ], { duration: 640, easing: 'cubic-bezier(.45,0,.2,1)' }).onfinish = () => { el.remove(); done(); };
  }

  /* ---------- HISTORY ---------- */
  const HL = { rows: [], n: 0, sums: {}, io: null };
  function histHTML() {
    const H = S.H;
    return `<div class="vw"><header class="vh"><div class="vh-l"><p class="greet">账单 · <span class="lat">Ledger</span></p><h1 class="ttl">每一笔，都有颜色</h1></div><div class="vh-r"><label class="search">${ic('search')}<input id="h-q" data-in="q" type="search" placeholder="搜索备注、分类" value="${esc(H.q)}" autocomplete="off" aria-label="搜索账单"><button class="x" data-act="qclear" aria-label="清空搜索" ${H.q ? '' : 'hidden'}>${ic('close')}</button></label><button class="btn-line d-only" data-act="selmode" aria-pressed="${S.selMode}">${ic('check')}多选</button></div></header>
    <div class="bento hist-b"><aside class="hist-side c4 ${rise(0)}"><section class="tile fl-t" id="h-filt"></section><section class="tile sum-t" id="h-sum"></section></aside>
    <section class="tile list-t c8 ${rise(1)}${S.selMode ? ' selm' : ''}" id="h-lt"><div class="lt-h"><span class="meta" id="h-cnt"></span><button class="lnk m-only" data-act="selmode">${S.selMode ? '完成' : '多选'}</button></div><div id="h-list"></div><div class="more-ld" id="h-sent" hidden><i><b style="background:var(--c-food)"></b><b style="background:var(--c-shopping)"></b><b style="background:var(--c-transport)"></b></i></div></section></div>
    <div class="batch" id="batch"><b>已选 <span id="b-n">0</span> 笔</b><span class="num" id="b-sum"></span><button class="pill del" data-act="bdel">${ic('trash')}删除</button><button class="pill" data-act="bcancel">取消</button></div></div>`;
  }
  function filtHTML() {
    const H = S.H;
    const mc = (v, l) => `<button class="mc" data-act="hf" data-f="month" data-v="${v}" aria-pressed="${H.month === v}">${l}</button>`;
    return `<div class="fsec"><span class="eb">月份</span><div class="mchips">${mc('all', '近半年')}${JX.MONTHS.slice().reverse().map((m) => mc(m, mon(m) + '月')).join('')}</div></div>
    <div class="fsec"><span class="eb">类型</span>${seg2('htype', [['all', '全部'], ['expense', '支出'], ['income', '收入']], H.type)}</div>
    <div class="fsec"><span class="eb">分类</span><div class="fcats"><button class="fc all" data-act="hf" data-f="ck" data-v="all" aria-pressed="${H.ck === 'all'}">全部</button>${JX.categories.map((c) => `<button class="fc" data-act="hf" data-f="ck" data-v="${c.key}" aria-pressed="${H.ck === c.key}" style="${cv(c.key)}" aria-label="${c.name}" title="${c.name}">${mk(c.key)}</button>`).join('')}</div>${H.sk ? `<button class="subtag" style="${cv(H.ck)}" data-act="hf" data-f="sk" data-v="">${esc(JX.subName(H.ck, H.sk))}${ic('close')}</button>` : ''}</div>`;
  }
  function histFilter() {
    const H = S.H, q = H.q.trim().toLowerCase();
    return JX.records.filter((r) => (H.month === 'all' || r.date.slice(0, 7) === H.month) && (H.type === 'all' || r.type === H.type) && (H.ck === 'all' || r.categoryKey === H.ck) && (!H.sk || r.subcategoryKey === H.sk) && (!q || (r.note + ' ' + r.categoryName + ' ' + r.subcategoryName).toLowerCase().includes(q)));
  }
  function histRender(keepScroll) {
    const list = $('#h-list'); if (!list) return;
    const v = $('#v-history'), st = v.scrollTop;
    $('#h-filt').innerHTML = filtHTML(); fitSeg($('#h-filt'));
    HL.rows = histFilter(); HL.n = 0; HL.sums = {};
    HL.rows.forEach((r) => { const s = HL.sums[r.date] || (HL.sums[r.date] = { e: 0, i: 0 }); if (r.type === 'expense') s.e += r.amount; else s.i += r.amount; });
    list.innerHTML = '';
    if (!HL.rows.length) list.innerHTML = emptyHTML();
    else histMore(40);
    sumRender();
    if (keepScroll) v.scrollTop = st;
  }
  function dayHead(d) {
    const s = HL.sums[d], rel = d === TODAY ? '今天' : dayDiff(d, TODAY) === 1 ? '昨天' : '';
    return `<div class="dh"><span><b>${mon(d)}月${+d.slice(8)}日</b><span class="wd">${JX.weekday(d)}</span>${rel ? `<span class="rel">${rel}</span>` : ''}</span><span class="dsum">${s.e ? `<span>支出 <span class="num">${JX.fmt(s.e)}</span></span>` : ''}${s.i ? `<span>收入 <span class="num">${JX.fmt(s.i)}</span></span>` : ''}</span></div>`;
  }
  function histMore(k) {
    const list = $('#h-list'); if (!list || HL.n >= HL.rows.length) return;
    const end = Math.min(HL.rows.length, HL.n + k), q = S.H.q.trim();
    let lastG = list.lastElementChild, html = '', open = false, lastD = lastG && lastG.dataset.date;
    for (let i = HL.n; i < end; i++) {
      const r = HL.rows[i];
      if (r.date === lastD && !open) { lastG.insertAdjacentHTML('beforeend', recHTML(r, { tools: 1, q })); continue; }
      if (r.date !== lastD) { if (open) html += '</div>'; html += `<div class="dg" data-date="${r.date}">${dayHead(r.date)}`; open = true; lastD = r.date; }
      html += recHTML(r, { tools: 1, q });
    }
    if (open) html += '</div>';
    list.insertAdjacentHTML('beforeend', html);
    HL.n = end;
    $('#h-sent').hidden = HL.n >= HL.rows.length;
    $('#h-cnt').textContent = `共 ${HL.rows.length} 笔${HL.n < HL.rows.length ? ` · 已显示 ${HL.n}` : ''}`;
  }
  function sumRender() {
    const el = $('#h-sum'); if (!el) return;
    let e = 0, i = 0; const m = {};
    HL.rows.forEach((r) => { if (r.type === 'expense') { e += r.amount; m[r.categoryKey] = (m[r.categoryKey] || 0) + r.amount; } else i += r.amount; });
    const items = Object.keys(m).sort((a, b) => m[b] - m[a]).map((k) => ({ k, v: m[k], ck: k, name: JX.cat[k].name }));
    el.innerHTML = `<div class="sm-row"><div><span class="eb">筛选结果 · 支出</span><div class="sum-big num">${mny(e)}</div></div><div class="sum-sm"><span class="eb">收入</span>${mny(i)}</div></div>${bandHTML('hs-band', CK)}<p class="sm-c">${HL.rows.length} 笔 · ${S.H.month === 'all' ? '近半年' : ymCN(S.H.month)}${S.H.ck !== 'all' ? ' · ' + JX.cat[S.H.ck].name : ''}${S.H.q ? ` · 含「${esc(S.H.q)}」` : ''}</p>`;
    raf2(() => layBand($('#hs-band'), items, 'none'));
  }
  function emptyHTML() {
    const q = S.H.q.trim();
    return `<div class="empty"><svg viewBox="0 0 168 120" aria-hidden="true" fill="none" stroke-width="1.8" stroke-linejoin="round"><g transform="rotate(-12 60 70)"><rect x="34" y="20" width="56" height="84" rx="10" stroke="var(--line-2)"/></g><g transform="rotate(8 108 70)"><rect x="80" y="20" width="56" height="84" rx="10" stroke="var(--line-2)"/></g><rect x="56" y="12" width="56" height="88" rx="10" fill="var(--tile)" stroke="var(--ink-2)"/><rect x="62" y="18" width="44" height="48" rx="6" fill="var(--well)" stroke="none"/><path d="M66 78h24M66 86h14" stroke="var(--ink-2)" stroke-linecap="round"/><circle cx="84" cy="42" r="10" stroke="var(--ink-3)" stroke-dasharray="3 4"/></svg><h4>${q ? `没有找到「${esc(q)}」` : '这里还是一张空白色卡'}</h4><p>${q ? '换个关键词试试，或者清除筛选条件。' : '当前筛选条件下没有账单。'}</p><button class="btn-line" data-act="hreset">清除筛选</button></div>`;
  }
  function histMount() {
    histRender();
    if (HL.io) HL.io.disconnect();
    HL.io = new IntersectionObserver((es) => { if (es[0].isIntersecting) histMore(60); }, { root: $('#v-history'), rootMargin: '900px 0px' });
    HL.io.observe($('#h-sent'));
  }
  function delRecords(ids) {
    const removed = [];
    ids.forEach((id) => { const x = removeRecord(id); if (x) removed.push(x); });
    if (!removed.length) return;
    removed.forEach((x) => S.trash.unshift(x.r));
    ver++; S.sel.clear(); batchSync();
    const rows = ids.map((id) => $(`#h-list .rec[data-id="${id}"]`)).filter(Boolean);
    const finish = () => {
      const list = $('#h-list'); if (!list) return;
      const sibs = $$('.dg, .rec', list).slice(0, 80), before = new Map(sibs.map((s) => [s, s.getBoundingClientRect().top]));
      rows.forEach((r) => { const g = r.parentNode; r.remove(); if (g && !$('.rec', g)) g.remove(); });
      removed.forEach((x) => { const s = HL.sums[x.r.date]; if (s) { if (x.r.type === 'expense') s.e -= x.r.amount; else s.i -= x.r.amount; } });
      $$('.dg', list).forEach((g) => { if (removed.some((x) => x.r.date === g.dataset.date)) g.querySelector('.dh').outerHTML = dayHead(g.dataset.date); });
      HL.rows = HL.rows.filter((r) => !ids.includes(r.id)); HL.n = Math.max(0, HL.n - rows.length);
      $('#h-cnt').textContent = `共 ${HL.rows.length} 笔`;
      if (!HL.rows.length) list.innerHTML = emptyHTML();
      if (!RM) sibs.forEach((s) => { if (!s.isConnected) return; const d = before.get(s) - s.getBoundingClientRect().top; if (Math.abs(d) > 1) s.animate([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration: 300, easing: EASE }); });
      sumRender();
    };
    rows.forEach((r) => r.classList.add('gone'));
    setTimeout(finish, RM ? 0 : 230);
    ['home', 'stats', 'more'].forEach((r) => S.dirty.add(r)); idle(flushDirty);
    const one = removed[0].r;
    toast(removed.length > 1 ? `<span>已删除 ${removed.length} 笔，可在回收站找回</span>` : `${mk(one.categoryKey)}<span>已删除 · ${esc(one.subcategoryName)} <span class="num">¥${JX.fmt(one.amount)}</span></span>`, () => {
      removed.slice().sort((a, b) => a.i - b.i).forEach((x) => { insertRecord(x.r, x.i); const t = S.trash.indexOf(x.r); if (t >= 0) S.trash.splice(t, 1); });
      dataChanged(); histRender(true);
      removed.forEach((x) => { const el = $(`#h-list .rec[data-id="${x.r.id}"]`); if (el) el.classList.add('back'); });
    });
  }
  function batchSync() {
    const b = $('#batch'); if (!b) return;
    const n = S.sel.size; b.classList.toggle('on', n > 0);
    $('#b-n').textContent = n;
    const sum = JX.records.filter((r) => S.sel.has(r.id)).reduce((s, r) => s + (r.type === 'expense' ? -r.amount : r.amount), 0);
    $('#b-sum').textContent = (sum < 0 ? '−' : '+') + '¥' + JX.fmt(Math.abs(sum));
  }

  /* ---------- STATS ---------- */
  function calHTML(ym) {
    const days = JX.daily(ym), dm = dayMap(ym), max = Math.max(1, ...days.map((d) => d.total));
    const first = (new Date(+ym.slice(0, 4), mon(ym) - 1, 1).getDay() + 6) % 7;
    let h = '<div class="cal-w" aria-hidden="true">' + '一二三四五六日'.split('').map((w) => `<span>${w}</span>`).join('') + '</div><div class="cal in">';
    for (let i = 0; i < first; i++) h += '<span class="cd void"></span>';
    days.forEach((d, i) => {
      const inf = dm[d.date], s = inf ? Math.max(.2, Math.sqrt(d.total / max)) : 0;
      h += `<button class="cd${d.future ? ' fut' : inf ? '' : ' zero'}${d.date === TODAY ? ' now' : ''}${s > .62 ? ' big' : ''}" data-act="day" data-date="${d.date}" data-tip="day" style="--s:${s.toFixed(3)};--r:${Math.floor((first + i) / 7)}${inf ? ';' + cv(inf.dom) : ''}" aria-label="${mon(ym)}月${d.day}日 ${d.future ? '未到' : inf ? '支出 ' + JX.fmt(d.total) + ' 元' : '无支出'}"><i class="dot"></i><span class="dn">${d.day}</span></button>`;
    });
    return h + '</div>';
  }
  function trendHTML(ym) {
    const days = JX.daily(ym), dm = dayMap(ym);
    const vals = days.map((d) => d.total).filter((v) => v > 0).sort((a, b) => b - a);
    const top = vals[0] || 1; let cap = (vals[1] || top) * 1.25; const broken = top > cap * 1.3; if (!broken) cap = top;
    const b = ym === CUR ? budgetOf(ym) : null;
    const past = days.filter((d) => !d.future), avg = past.length ? past.reduce((s, d) => s + d.total, 0) / past.length : 0;
    const bars = days.map((d) => {
      const inf = dm[d.date];
      if (d.future) return `<div class="tb fut" data-tip="day" data-date="${d.date}"><i style="height:${Math.min(100, (b ? b.perDay : 0) / cap * 100).toFixed(1)}%"></i></div>`;
      const v = d.total, h = Math.max(1.5, Math.min(100, v / cap * 100));
      return `<div class="tb${v ? '' : ' zero'}${d.date === TODAY ? ' now' : ''}${broken && v === top ? ' brk' : ''}" data-act="day" data-tip="day" data-date="${d.date}" style="${inf ? cv(inf.dom) : ''}"><i style="height:${h.toFixed(1)}%"></i>${broken && v === top ? `<span class="bl">¥${JX.fmt(v, { decimals: 0 })}</span>` : ''}</div>`;
    }).join('');
    const avgY = Math.min(100, avg / cap * 100);
    return `<div class="trend in" role="img" aria-label="${ymCN(ym)}每日支出">${bars}<i class="tr-avg" style="bottom:${avgY.toFixed(1)}%"><span>日均 ¥${JX.fmt(avg, { decimals: 0 })}</span></i></div><div class="tr-x" aria-hidden="true">${days.map((d) => `<span>${[1, 5, 10, 15, 20, 25, 30].includes(d.day) ? d.day : ''}</span>`).join('')}</div>`;
  }
  function sixHTML(ym) {
    const ms = JX.monthly(), max = Math.max(...ms.map((m) => Math.max(m.expense, m.income))) || 1;
    return `<div class="six in">${ms.map((m) => `<div class="mo${m.month === ym ? ' cur' : ''}" data-act="pickm" data-ym="${m.month}" data-tip="mo" title="${m.label}：支出 ¥${JX.fmt(m.expense)}，收入 ¥${JX.fmt(m.income)}"><div class="mo-bars"><div class="mb exp" style="height:${(m.expense / max * 100).toFixed(1)}%">${byCat(m.month, 'main').map((c) => `<i style="flex:${c.total} 0 0;background:var(--c-${c.categoryKey})"></i>`).join('')}</div><div class="mb inc" style="height:${Math.max(.6, m.income / max * 100).toFixed(1)}%"></div></div><div class="mo-l">${m.label}</div><div class="mo-v">支 ${wan(m.expense)}<br>收 ${wan(m.income)}</div></div>`).join('')}</div>`;
  }
  function rankHTML(ym, level) {
    const list = byCat(ym, level), max = list[0] ? list[0].share : 1, seen = {};
    if (!list.length) return '<p class="eb">这个月还没有支出</p>';
    return `<div class="rk-list in">${list.slice(0, level === 'sub' ? 12 : 11).map((c) => {
      const ck = c.categoryKey, i = seen[ck] = seen[ck] == null ? 0 : seen[ck] + 1, bg = level === 'sub' ? subColor(ck, Math.min(i, 3)) : null;
      return `<button class="rk" data-act="drill" data-ck="${ck}" data-sk="${level === 'sub' ? c.key : ''}" data-ym="${ym}" data-hover="${c.key}" style="${cv(ck)}${bg ? ';--c:' + bg : ''}">${mk(ck, '', bg)}<span class="rk-n">${esc(c.name)}<small>${level === 'sub' ? esc(JX.cat[ck].name) + ' · ' : ''}${c.count} 笔</small></span><span class="rk-bar"><i style="transform:scaleX(${(c.share / max).toFixed(3)})"></i></span><span class="rk-v"><span class="num">¥${JX.fmt(c.total)}</span><small>${(c.share * 100).toFixed(1)}%</small></span></button>`;
    }).join('')}</div>`;
  }
  function statsHTML() {
    const ym = S.statsYm, t = totals(ym);
    return `<div class="vw"><header class="vh"><div class="vh-l"><p class="greet">统计 · <span class="lat">Spectrum</span></p><h1 class="ttl" id="s-ttl">${headline(ym)}</h1></div><div class="vh-r">${monthSwitch('stats', ym)}${seg2('level', [['main', '一级'], ['sub', '二级']], S.level)}</div></header>
    <div class="bento">
      <article class="tile s-hero c8 ${rise(0)}"><div class="sh-row"><div><span class="eb" id="s-lab">${ymCN(ym)} · 支出</span><div class="sh-num odo num" id="s-num"></div></div><div class="sh-io" id="s-io">${statsIO(t)}</div></div>
      ${bandHTML('s-band', [], 'tall')}<div class="scale" aria-hidden="true"><span>0</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div><div class="slegend" id="s-leg"></div></article>
      <article class="tile c4 st ${rise(1)}"><div class="tile-h"><h3>颜色日历</h3><span class="meta">点大小 = 当天花了多少</span></div><div id="s-cal">${calHTML(ym)}</div><div class="cal-f"><span><i class="k1"></i>颜色 = 当天花得最多的分类</span><span><i class="k2"></i>今天</span><span><i class="k3"></i>未到</span></div></article>
      <article class="tile c5 ${rise(2)}"><div class="tile-h"><h3>分类排行</h3><span class="meta">点一行，查看这些账单</span></div><div id="s-rank">${rankHTML(ym, S.level)}</div></article>
      <article class="tile c7 ${rise(3)}"><div class="tile-h"><h3>每日支出</h3><span class="tr-ghost" id="s-gh">${ym === CUR ? '<i></i>虚线柱 = 以后每天可花' : ''}</span></div><div id="s-trend">${trendHTML(ym)}</div></article>
      <article class="tile c7 ${rise(4)}"><div class="tile-h"><h3>近六个月</h3><span class="six-k"><span><i class="ke"></i>支出（按分类着色）</span><span><i class="ki"></i>收入</span></span></div><div id="s-six">${sixHTML(ym)}</div></article>
    </div></div>`;
  }
  const statsIO = (t) => `<div><span class="eb">收入</span>${mny(t.income)}</div><div><span class="eb">结余</span>${mny(t.balance)}</div><div><span class="eb">笔数</span><span class="mn">${t.count}</span></div>`;
  const statsItems = () => (S.level === 'sub' ? subItems(S.statsYm) : mainItems(S.statsYm));
  function statsBand(mode, from) {
    const band = $('#s-band'); if (!band) return;
    const items = statsItems();
    if (band._lvl !== S.level) { band.innerHTML = (S.level === 'sub' ? subKeys() : CK).map((k) => `<i class="seg" data-k="${k}"></i>`).join(''); band._lvl = S.level; }
    layBand(band, items, mode, from);
    const leg = $('#s-leg'); if (leg) leg.innerHTML = mainItems(S.statsYm).map((it) => `<span style="${cv(it.k)}"><i></i>${esc(it.name)} ${(it.share * 100).toFixed(it.share < .01 ? 1 : 0)}%</span>`).join('');
  }
  const subKeys = () => { const out = []; JX.categories.forEach((c) => c.subs.forEach((s) => out.push(s.key))); return out; };
  function statsMount(first) { odo($('#s-num'), totals(S.statsYm).expense, false); statsBand(first ? 'grow' : 'none'); fitSeg($('#v-stats')); }
  function statsMonth(dir) {
    const ym = S.statsYm, t = totals(ym);
    odo($('#s-num'), t.expense, true); statsBand('flip'); tick($('#stats-ml'), ym, dir);
    $('#s-lab').textContent = `${ymCN(ym)} · 支出`; $('#s-ttl').innerHTML = headline(ym);
    swapIn($('#s-io'), statsIO(t));
    $('#s-cal').innerHTML = calHTML(ym); $('#s-rank').innerHTML = rankHTML(ym, S.level); $('#s-trend').innerHTML = trendHTML(ym); $('#s-six').innerHTML = sixHTML(ym);
    $('#s-gh').innerHTML = ym === CUR ? '<i></i>虚线柱 = 以后每天可花' : '';
    $$('[data-act=mstep][data-scope=stats]').forEach((b) => { const i = JX.MONTHS.indexOf(ym) + +b.dataset.d; b.disabled = i < 0 || i >= JX.MONTHS.length; });
  }
  function setLevel(lv) {
    if (lv === S.level) return;
    const band = $('#s-band'), geo = band._geo || {}, from = {};
    if (lv === 'sub') subItems(S.statsYm).forEach((it) => { if (geo[it.ck]) from[it.k] = geo[it.ck]; });
    else { const acc = {}; subItems(S.statsYm).forEach((it) => { const g = geo[it.k]; if (!g) return; const a = acc[it.ck] || (acc[it.ck] = { x: g.x, w: 0 }); a.w = g.x + g.w - a.x; }); Object.assign(from, acc); }
    S.level = lv; statsBand('flip', from);
    $('#s-rank').innerHTML = rankHTML(S.statsYm, lv);
    $$('[data-act=level]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === lv))); fitSeg($('#v-stats'));
  }

  /* ---------- MORE ---------- */
  function moreHTML() {
    const trash = S.trash.slice(0, 3);
    return `<div class="vw more-g"><header class="vh"><div class="vh-l"><p class="greet">更多 · <span class="lat">Settings</span></p><h1 class="ttl">把日子安排好</h1></div><div class="vh-r">${syncChip()}</div></header>
    <div class="bento">
      <article class="tile c7 ${rise(0)}"><div class="tile-h"><h3>${ic('repeat')}周期账单</h3><span class="meta">到期自动记一笔</span></div><div class="rl">${S.recur.map((r) => `<div class="rr${r.enabled ? '' : ' off'}" style="${cv(r.categoryKey)}">${mk(r.categoryKey)}<div class="rr-n"><b>${esc(r.name)}</b><span>${r.cycle} · 下次 ${mon(r.next)}月${+r.next.slice(8)}日${r.next.slice(0, 4) !== TODAY.slice(0, 4) ? '（' + r.next.slice(0, 4) + '）' : ''}</span></div><span class="num">¥${JX.fmt(r.amount)}</span><button class="pill" data-act="recur-now" data-id="${r.id}">立即记录</button><button class="sw" role="switch" data-act="recur-tog" data-id="${r.id}" aria-checked="${r.enabled}" aria-label="启用${esc(r.name)}"></button></div>`).join('')}</div></article>
      <article class="tile c5 st ${rise(1)}"><div class="tile-h"><h3>${ic('todo')}待办</h3><span class="meta">${S.todos.filter((t) => !t.done).length} 件未完成</span></div><div class="tdl">${todoRows(S.todos.slice().sort((a, b) => a.done - b.done || a.due.localeCompare(b.due)), true)}</div></article>
      <article class="tile c5 ${rise(2)}"><div class="tile-h"><h3>${ic('palette')}分类管理</h3><button class="lnk" data-act="soon" data-msg="分类编辑">编辑${ic('chevR')}</button></div><div class="palette">${JX.categories.map((c) => `<button class="pc" style="${cv(c.key)}" data-act="soon" data-msg="${c.name}"><i>${c.glyph}</i><span>${c.name}<small>${CNAME[c.key][1]} · ${c.subs.length} 项</small></span></button>`).join('')}</div></article>
      <article class="tile c4 ${rise(3)}"><div class="tile-h"><h3>${ic('cloud')}云同步</h3></div><span class="eb">同步码（在另一台设备输入即可配对）</span><div class="code" aria-label="同步码 G4ZW-DHPW-KTEL">G4ZW<span>-</span>DHPW<span>-</span>KTEL</div><p class="set-p">我和阿念的手机、电脑共用这一本账。</p><div class="set-row">${syncChip()}<button class="pill" data-act="copy">复制同步码</button></div></article>
      <article class="tile c3 theme-t ${rise(4)}"><div class="tile-h"><h3>${ic('moon')}暗色模式</h3></div><div class="th-vis" aria-hidden="true"><div class="tl"><i></i><i></i></div><div class="td2"><i></i><i></i></div></div><div class="th-row"><span>${theme() === 'dark' ? '已开启' : '已关闭'}</span><button class="sw" role="switch" data-act="theme" aria-checked="${theme() === 'dark'}" aria-label="暗色模式"></button></div></article>
      <article class="tile c4"><div class="tile-h"><h3>${ic('download')}导出</h3></div><p class="set-p">导出全部 ${JX.records.length} 笔账单，含分类、备注和记账人。</p><div class="expf"><button class="ex" data-act="export" data-v="xlsx"><b>Excel</b><span>.xlsx 表格</span><i class="pg"></i></button><button class="ex" data-act="export" data-v="csv"><b>CSV</b><span>通用格式</span><i class="pg"></i></button></div></article>
      <article class="tile c4"><div class="tile-h"><h3>${ic('box')}备份与恢复</h3></div><p class="set-p">上次备份：今天 09:12 · 自动备份每天一次，保留 30 天。</p><div class="set-row"><button class="pill ink" data-act="backup">${ic('box')}立即备份</button><button class="pill" data-act="soon" data-msg="从备份恢复">从备份恢复</button></div></article>
      <article class="tile c4"><div class="tile-h"><h3>${ic('bin')}回收站</h3><span class="meta">${S.trash.length} 笔 · 30 天后清除</span></div><div class="bin-l">${trash.length ? trash.map((r) => `<div class="rec" style="${cv(r.categoryKey)}"><div class="rec-f">${mk(r.categoryKey)}<div class="rec-m"><div class="rec-t">${esc(r.subcategoryName)}<span class="rec-n">${esc(r.note)}</span></div><div class="rec-s">${JX.dateLabel(r.date)} ${r.time}</div></div><button class="pill" data-act="restore" data-id="${r.id}">恢复</button></div></div>`).join('') : `<p class="bin-e">${ic('check')}回收站是空的。删除的账单会在这里保留 30 天。</p>`}</div></article>
      <article class="tile c12"><div class="tile-h"><h3>${ic('key')}快捷键</h3><button class="lnk" data-act="soon" data-msg="自定义快捷键">自定义${ic('chevR')}</button></div><div class="keys">${[['随时记一笔', ['Ctrl', '⇧', 'N']], ['保存', ['Enter']], ['清空金额', ['Esc']], ['连加', ['+']], ['搜索账单', ['/']], ['上 / 下个月', ['[', ']']], ['切换暗色', ['Ctrl', '⇧', 'L']], ['跳到首页', ['G', 'H']]].map((k) => `<div class="kr"><span>${k[0]}</span><span>${k[1].map((x) => `<kbd>${x}</kbd>`).join('')}</span></div>`).join('')}</div></article>
    </div></div>`;
  }

  /* ---------- toast ---------- */
  const T = { timer: 0, tick: 0, undo: null };
  function toast(html, undo, ms) {
    ms = ms || 5000;
    const t = $('#toast'); clearTimeout(T.timer); clearInterval(T.tick);
    T.undo = undo || null;
    t.innerHTML = `<span class="ts-m">${html}</span>${undo ? `<button class="ts-u" data-act="undo">撤销<span class="ts-n" id="ts-n">${Math.round(ms / 1000)}</span></button><i class="ts-bar"></i>` : ''}`;
    t.classList.add('on');
    if (undo) {
      const bar = $('.ts-bar', t); bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: ms, easing: 'linear', fill: 'forwards' });
      let left = Math.round(ms / 1000); T.tick = setInterval(() => { left--; const n = $('#ts-n'); if (n) n.textContent = Math.max(0, left); }, 1000);
    }
    T.timer = setTimeout(hideToast, ms);
  }
  function hideToast() { clearInterval(T.tick); T.undo = null; $('#toast').classList.remove('on'); }

  /* ---------- nav ---------- */
  const NAV = [['home', '首页', 'home'], ['history', '账单', 'list'], ['add', '记一笔', 'plus'], ['stats', '统计', 'stats'], ['more', '更多', 'more']];
  function navRender() {
    const mc = monthColor(CUR);
    R.style.setProperty('--accent', `var(--c-${mc.key})`); R.style.setProperty('--accent-d', `var(--d-${mc.key})`);
    const logo = `<span class="logo-m" aria-hidden="true">${mainItems(CUR).slice(0, 4).map((it, i) => `<i style="height:${[22, 15, 10, 7][i]}px;background:var(--c-${it.k})"></i>`).join('')}</span>`;
    $('#rail').innerHTML = `<span class="logo" title="计序">${logo}</span>${NAV.map((n) => `<a href="#${n[0]}" class="ri${n[0] === 'add' ? ' add' : ''}" data-label="${n[1]}${n[0] === 'add' ? ' · Ctrl⇧N' : ''}" aria-label="${n[1]}">${ic(n[2])}</a>`).join('')}<span class="sep"></span><button class="ri" data-act="theme" data-label="切换${theme() === 'dark' ? '浅色' : '暗色'}" aria-label="切换主题">${ic(theme() === 'dark' ? 'sun' : 'moon')}</button>`;
    $('#tabbar').innerHTML = NAV.map((n) => n[0] === 'add' ? `<a href="#add" class="tb-add" aria-label="记一笔">${ic('plus')}</a>` : `<a href="#${n[0]}" class="tb-i" aria-label="${n[1]}">${ic(n[2])}<span>${n[1]}</span><i class="bar"></i></a>`).join('');
    navActive();
  }
  function navActive() { $$('.ri[href], .tb-i, .tb-add').forEach((a) => { if (a.getAttribute('href') === '#' + cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }); }

  /* ---------- render & router ---------- */
  const VIEWS = { home: [homeHTML, homeMount], add: [addHTML, addMount], history: [histHTML, histMount], stats: [statsHTML, statsMount], more: [moreHTML, null] };
  function render(r, first) {
    const v = $('#v-' + r); v.innerHTML = VIEWS[r][0]();
    S.rendered.add(r); S.dirty.delete(r);
    if (VIEWS[r][1]) VIEWS[r][1](first);
    fitSeg(v);
  }
  let flip = false;
  function show(r, first) {
    if (r === cur) return;
    const prev = cur && $('#v-' + cur), next = $('#v-' + r);
    if (!S.rendered.has(r) || S.dirty.has(r)) render(r);
    if (prev) { prev.classList.remove('on', 'e0', 'ea', 'eb'); if (!RM) { prev.classList.add('leave'); setTimeout(() => prev.classList.remove('leave'), 150); } }
    next.classList.remove('leave', 'e0', 'ea', 'eb');
    next.classList.add('on', first ? 'e0' : (flip = !flip) ? 'ea' : 'eb');
    cur = r;
    D.body.className = 'r-' + r;
    navActive();
    D.title = `计序 · ${{ home: '首页', add: '记一笔', history: '账单', stats: '统计', more: '更多' }[r]}`;
    hideTip();
    if (r === 'add') { addSync(true); stripRender(); if (desk()) setTimeout(() => { const a = D.activeElement; if (!a || a === D.body) $('#v-add').focus({ preventScroll: true }); }, 0); }
    if (r !== 'history') { S.sel.clear(); }
  }
  function route() { let r = location.hash.slice(1); if (!ROUTES.includes(r)) r = 'home'; show(r); }
  function go(r) { if (!ROUTES.includes(r)) r = 'home'; if (location.hash.slice(1) === r) show(r); else location.hash = r; }

  /* ---------- tooltip ---------- */
  function showTip(el) {
    const tip = $('#tip'), d = el.dataset.date;
    if (!d) return;
    const dm = dayMap(d.slice(0, 7))[d], fut = d > TODAY;
    tip.innerHTML = `<b>${mon(d)}月${+d.slice(8)}日 ${JX.weekday(d)}</b>${fut ? '<span class="num">还没到</span>' : dm ? `<span class="num">¥${JX.fmt(dm.total)}</span>${dm.n} 笔 · 主要是${JX.cat[dm.dom].name}` : '<span class="num">¥0</span>没有支出'}`;
    const r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.transform = `translate(${Math.max(8, Math.min(innerWidth - tw - 8, r.left + r.width / 2 - tw / 2))}px,${Math.max(8, r.top - th - 8)}px)`;
    tip.classList.add('on');
  }
  const hideTip = () => $('#tip').classList.remove('on');

  /* ---------- theme ---------- */
  function setTheme(t, from) {
    const fl = $('#flood');
    const apply = () => { R.dataset.theme = t; navRender(); ['home', 'more', 'add'].forEach((r) => S.rendered.has(r) && $$('[data-act=theme]', $('#v-' + r)).forEach((b) => { if (b.classList.contains('sw')) { b.setAttribute('aria-checked', String(t === 'dark')); const l = b.previousElementSibling; if (l) l.textContent = t === 'dark' ? '已开启' : '已关闭'; } else b.innerHTML = ic(t === 'dark' ? 'sun' : 'moon'); })); if (S.rendered.has('stats')) { statsBand('none'); $('#s-rank').innerHTML = rankHTML(S.statsYm, S.level); } };
    if (RM || !from) { apply(); return; }
    const r = from.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const rad = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy));
    fl.style.cssText = `width:${rad * 2}px;height:${rad * 2}px;left:${cx - rad}px;top:${cy - rad}px;background:${t === 'dark' ? '#121116' : '#F7F4EF'};visibility:visible`;
    fl.animate([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 340, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).onfinish = () => {
      apply();
      requestAnimationFrame(() => fl.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1)' }], { duration: 260, easing: 'ease-out', fill: 'forwards' }).onfinish = () => { fl.style.visibility = 'hidden'; fl.getAnimations().forEach((a) => a.cancel()); });
    };
  }

  /* ---------- sync ---------- */
  function doSync() {
    if (S.sync === 'ing') return;
    S.sync = 'ing'; syncPaint();
    setTimeout(() => { S.sync = 'ok'; S.syncText = '刚刚已同步'; syncPaint(); setTimeout(() => { S.sync = 'idle'; syncPaint(); }, 2400); }, 1400);
  }
  function syncPaint() { $$('.sync').forEach((b) => { b.classList.toggle('ing', S.sync === 'ing'); b.classList.toggle('ok', S.sync === 'ok'); $('b', b).textContent = S.sync === 'ing' ? '同步中…' : S.syncText; }); }

  /* ---------- events ---------- */
  function monthStep(scope, d) {
    const key = scope === 'home' ? 'homeYm' : 'statsYm', i = JX.MONTHS.indexOf(S[key]) + d;
    if (i < 0 || i >= JX.MONTHS.length) return;
    S[key] = JX.MONTHS[i];
    $$(`[data-act=mstep][data-scope=${scope}]`).forEach((b) => { const j = i + +b.dataset.d; b.disabled = j < 0 || j >= JX.MONTHS.length; });
    if (scope === 'home') homeMonth(d); else statsMonth(d);
  }
  function drill(ck, sk, ym) {
    S.H = { month: ym || 'all', type: 'expense', ck: ck || 'all', sk: sk || null, q: '' };
    S.dirty.add('history'); go('history');
    $('#v-history').scrollTop = 0;
  }
  function todoRec(id) {
    const t = S.todos.find((x) => x.id === id); if (!t) return;
    const sk = t.title.includes('物业') ? 'property' : t.categoryKey === 'finance' ? 'loan' : JX.cat[t.categoryKey].subs[0].key;
    S.A = freshForm({ expr: String(t.amount), ck: t.categoryKey, sk, note: t.title });
    S.dirty.add('add'); go('add');
  }
  function recurNow(id) {
    const r = S.recur.find((x) => x.id === id); if (!r) return;
    const c = JX.cat[r.categoryKey];
    const rec = { id: 'n' + (++nid), type: 'expense', amount: r.amount, categoryKey: r.categoryKey, categoryName: c.name, subcategoryKey: r.subcategoryKey, subcategoryName: JX.subName(r.categoryKey, r.subcategoryKey), note: r.name + '（周期）', date: TODAY, time: JX.NOW_TIME, person: '我', photo: false };
    insertRecord(rec); dataChanged(); navRender();
    toast(`${mk(r.categoryKey)}<span>已记录 · ${esc(r.name)} <span class="num">¥${JX.fmt(r.amount)}</span></span>`, () => { removeRecord(rec.id); dataChanged(); });
  }
  function toggleTodo(id) {
    const t = S.todos.find((x) => x.id === id); if (!t) return;
    t.done = !t.done;
    $$(`[data-tid="${id}"]`).forEach((row) => { row.classList.toggle('done', t.done); $$('[data-act=todo]', row).forEach((b) => { if (b.classList.contains('tck')) b.setAttribute('aria-pressed', String(t.done)); else b.innerHTML = ic('check') + (t.done ? '已完成' : '完成'); }); });
    ['home', 'more'].forEach((r) => r !== cur && S.dirty.add(r));
    if (t.done) toast(`<span>「${esc(t.title)}」已完成</span>`, () => toggleTodo(id));
  }
  function editRec(id) {
    const r = JX.records.find((x) => x.id === id); if (!r) return;
    S.A = freshForm({ type: r.type, expr: String(r.amount), ck: r.categoryKey, sk: r.subcategoryKey, note: r.note, date: r.date, time: r.time, person: r.person, photo: r.photo, editId: r.id });
    S.dirty.add('add'); go('add');
  }

  D.addEventListener('click', (e) => {
    const go1 = e.target.closest('[data-go]'); if (go1) { go(go1.dataset.go); return; }
    const a = e.target.closest('[data-act]'); if (!a) { closeSwipe(); if (!e.target.closest('.band')) $$('.band.focus').forEach((b) => bandFocus(b, null)); return; }
    const act = a.dataset.act, id = a.dataset.id;
    switch (act) {
      case 'theme': setTheme(theme() === 'dark' ? 'light' : 'dark', a); break;
      case 'sync': doSync(); break;
      case 'mstep': monthStep(a.dataset.scope, +a.dataset.d); break;
      case 'drill': drill(a.dataset.ck, a.dataset.sk, a.dataset.ym); break;
      case 'day': { const d = a.dataset.date; if (d > TODAY) break; S.H = { month: d.slice(0, 7), type: 'all', ck: 'all', sk: null, q: '' }; S.dirty.add('history'); go('history'); requestAnimationFrame(() => { const g = $(`#h-list .dg[data-date="${d}"]`); if (g) $('#v-history').scrollTop = g.offsetTop - 12; }); break; }
      case 'pickm': if (a.dataset.ym !== S.statsYm) { const d = JX.MONTHS.indexOf(a.dataset.ym) - JX.MONTHS.indexOf(S.statsYm); S.statsYm = a.dataset.ym; statsMonth(d); } break;
      case 'level': setLevel(a.dataset.v); break;
      case 'todo': toggleTodo(id); break;
      case 'todo-rec': todoRec(id); break;
      case 'recur-now': recurNow(id); break;
      case 'recur-tog': { const r = S.recur.find((x) => x.id === id); r.enabled = !r.enabled; a.setAttribute('aria-checked', String(r.enabled)); a.closest('.rr').classList.toggle('off', !r.enabled); S.dirty.add('home'); break; }
      case 'undo': if (T.undo) { const u = T.undo; hideToast(); u(); } break;
      case 'close-add': if (history.length > 1) history.back(); else go('home'); break;
      case 'atype': if (S.A.type !== a.dataset.v) { S.A.type = a.dataset.v; $$('[data-act=atype]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === S.A.type))); fitSeg($('#v-add')); const fq = $('.freq'); if (fq) fq.innerHTML = freq(S.A.type).map((f) => `<button class="fq" data-act="pick" data-ck="${f.ck}" data-sk="${f.sk}" style="${cv(f.ck)}">${mk(f.ck)}<span><b>${esc(JX.subName(f.ck, f.sk))}</b><small>${esc(JX.cat[f.ck].name)} · ${f.n} 次</small></span></button>`).join(''); paintPanel(a); addSync(false); } break;
      case 'cat': pickCat(a.dataset.ck, null, a); break;
      case 'pick': pickCat(a.dataset.ck, a.dataset.sk, a); break;
      case 'sub': S.A.sk = a.dataset.sk; $$('.sb').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sk === S.A.sk))); addSync(false); break;
      case 'date': S.A.date = a.dataset.v === 'today' ? TODAY : JX.records.length && new Date(new Date(TODAY) - 86400000).toISOString().slice(0, 10); syncMeta(); break;
      case 'person': S.A.person = a.dataset.v; syncMeta(); break;
      case 'photo': S.A.photo = !S.A.photo; syncMeta(); if (S.A.photo) toast(`${ic('receipt')}<span>已附上小票照片（演示）</span>`); break;
      case 'save': save(); break;
      case 'hf': { const f = a.dataset.f; S.H[f] = a.dataset.v || null; if (f === 'ck') S.H.sk = null; histRender(); $('#v-history').scrollTop = 0; break; }
      case 'htype': S.H.type = a.dataset.v; histRender(); break;
      case 'qclear': S.H.q = ''; $('#h-q').value = ''; a.hidden = true; histRender(); break;
      case 'hreset': S.H = { month: 'all', type: 'all', ck: 'all', sk: null, q: '' }; render('history'); break;
      case 'selmode': S.selMode = !S.selMode; S.sel.clear(); $('#h-lt').classList.toggle('selm', S.selMode); $$('[data-act=selmode]').forEach((b) => { b.setAttribute('aria-pressed', String(S.selMode)); if (b.classList.contains('lnk')) b.textContent = S.selMode ? '完成' : '多选'; }); $$('#h-list .rec.sel').forEach((r) => r.classList.remove('sel')); $$('#h-list .ck').forEach((c) => c.setAttribute('aria-pressed', 'false')); batchSync(); break;
      case 'sel': { if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id); a.setAttribute('aria-pressed', String(S.sel.has(id))); a.closest('.rec').classList.toggle('sel', S.sel.has(id)); batchSync(); break; }
      case 'bdel': delRecords(Array.from(S.sel)); break;
      case 'bcancel': S.sel.clear(); $$('#h-list .rec.sel').forEach((r) => r.classList.remove('sel')); $$('#h-list .ck').forEach((c) => c.setAttribute('aria-pressed', 'false')); batchSync(); break;
      case 'edit': if (!a.closest('.rec-f') || a.closest('.rec-tools') || a.dataset.act === 'edit') { closeSwipe(); editRec(id); } break;
      case 'del': closeSwipe(); delRecords([id]); break;
      case 'restore': { const i = S.trash.findIndex((r) => r.id === id); if (i >= 0) { const r = S.trash.splice(i, 1)[0]; insertRecord(r); dataChanged(); render('more'); toast(`${mk(r.categoryKey)}<span>已恢复 · ${esc(r.subcategoryName)}</span>`); } break; }
      case 'export': { const ex = a; ex.classList.remove('run'); void ex.offsetWidth; ex.classList.add('run'); setTimeout(() => { ex.classList.remove('run'); toast(`${ic('download')}<span>已生成「计序_${TODAY.replace(/-/g, '')}.${a.dataset.v}」（演示）</span>`); }, 1150); break; }
      case 'backup': toast(`${ic('check')}<span>已备份 ${JX.records.length} 笔账单 · 今天 ${JX.NOW_TIME}</span>`); break;
      case 'copy': toast(`${ic('check')}<span>同步码已复制</span>`); break;
      case 'soon': toast(`<span>「${esc(a.dataset.msg)}」在正式版中打开（演示）</span>`); break;
    }
  });
  function syncMeta() {
    const A = S.A, old = dayDiff(A.date, TODAY) > 1;
    $$('#v-add [data-act=date]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === 'today' ? A.date === TODAY : dayDiff(A.date, TODAY) === 1)));
    $$('#v-add label:has(input[type=date])').forEach((l) => l.setAttribute('aria-pressed', String(old)));
    $$('#v-add .a-dl').forEach((s) => (s.textContent = old ? mon(A.date) + '月' + (+A.date.slice(8)) + '日' : '选择日期'));
    $$('#v-add input[type=date]').forEach((i) => (i.value = A.date));
    $$('#v-add .a-tm').forEach((s) => (s.textContent = A.time));
    $$('#v-add [data-act=person]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === A.person)));
    $$('#v-add .photo-b').forEach((b) => { b.classList.toggle('has', A.photo); b.setAttribute('aria-pressed', String(A.photo)); b.innerHTML = A.photo ? '<span class="rcpt"></span>小票已附' : ic('camera') + '拍小票'; });
    addSync(false);
  }
  D.addEventListener('input', (e) => {
    const k = e.target.dataset && e.target.dataset.in; if (!k) return;
    if (k === 'note') S.A.note = e.target.value;
    else if (k === 'date') { if (e.target.value) { S.A.date = e.target.value > TODAY ? TODAY : e.target.value; syncMeta(); } }
    else if (k === 'time') { if (e.target.value) { S.A.time = e.target.value; syncMeta(); } }
    else if (k === 'q') { S.H.q = e.target.value; const x = $('.search .x'); if (x) x.hidden = !S.H.q; clearTimeout(HL.qt); HL.qt = setTimeout(() => { histRender(); $('#v-history').scrollTop = 0; }, 80); }
  });

  /* keypad (pointer-driven springs) */
  D.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.kp button'); if (!b) return;
    b.classList.remove('up'); b.classList.add('dn');
  });
  const kpUp = (e) => {
    const b = e.target.closest && e.target.closest('.kp button.dn'); $$('.kp button.dn').forEach((x) => { x.classList.remove('dn'); if (!RM) { void x.offsetWidth; x.classList.add('up'); } });
    if (!b || e.type !== 'pointerup') return;
    const k = b.dataset.k; if (k === 'save') save(); else keyIn(k);
  };
  D.addEventListener('pointerup', kpUp);
  D.addEventListener('pointercancel', kpUp);
  D.addEventListener('animationend', (e) => { if (e.target.classList && e.target.classList.contains('up')) e.target.classList.remove('up'); });

  D.addEventListener('keydown', (e) => {
    const k = e.key, inText = e.target.matches && e.target.matches('input:not([type=date]):not([type=time]), textarea');
    if (e.ctrlKey && e.shiftKey && (k === 'N' || k === 'n')) { e.preventDefault(); go('add'); return; }
    if (e.ctrlKey && e.shiftKey && (k === 'L' || k === 'l')) { e.preventDefault(); setTheme(theme() === 'dark' ? 'light' : 'dark'); return; }
    if (cur === 'history') {
      if (k === '/' && !inText) { e.preventDefault(); $('#h-q').focus(); }
      if (k === 'Escape') { if (S.sel.size) { S.sel.clear(); $$('#h-list .rec.sel').forEach((r) => r.classList.remove('sel')); $$('#h-list .ck').forEach((c) => c.setAttribute('aria-pressed', 'false')); batchSync(); } else if (inText) e.target.blur(); }
      return;
    }
    if ((cur === 'home' || cur === 'stats') && !inText && (k === '[' || k === ']')) { monthStep(cur, k === '[' ? -1 : 1); return; }
    if (cur !== 'add' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'Enter' && !(e.target.matches && e.target.matches('button'))) { e.preventDefault(); save(); return; }
    if (k === 'Escape') { e.preventDefault(); if (inText && e.target.value) { e.target.value = ''; S.A.note = ''; } else { if (inText) e.target.blur(); keyIn('clear'); } return; }
    if (inText) return;
    if (/^[0-9]$/.test(k) || k === '.' || k === '+') { e.preventDefault(); keyIn(k); }
    else if (k === 'Backspace') { e.preventDefault(); keyIn('back'); }
  });

  /* band hover / touch */
  D.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const band = e.target.closest('.band');
    if (band) { bandFocus(band, bandAt(band, e.clientX)); return; }
    const hv = e.target.closest('[data-hover]');
    $$('.band.focus').forEach((b) => { if (!hv) bandFocus(b, null); });
    if (hv) { const v = hv.closest('.view'), b = v && $('.band:not(.thin)', v); if (b && b._geo && b._geo[hv.dataset.hover]) bandFocus(b, hv.dataset.hover); }
    const tt = e.target.closest('[data-tip]');
    if (tt && tt.dataset.tip === 'day') showTip(tt); else hideTip();
  }, { passive: true });
  D.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const band = e.target.closest('.band'); if (band) { const k = bandAt(band, e.clientX); bandFocus(band, band.classList.contains('focus') && $('.seg.on', band) && $('.seg.on', band).dataset.k === k ? null : k); }
  }, { passive: true });

  /* swipe-to-reveal on mobile rows */
  const SW = { el: null, x0: 0, y0: 0, dx: 0, on: false, open: null };
  function closeSwipe() { if (SW.open) { const f = $('.rec-f', SW.open); f.style.transition = `transform .3s ${EASE}`; f.style.transform = ''; SW.open.classList.remove('open'); SW.open = null; } }
  D.addEventListener('touchstart', (e) => {
    const row = e.target.closest('#h-list .rec'); if (!row || desk()) return;
    if (SW.open && SW.open !== row) closeSwipe();
    const t = e.touches[0]; SW.el = row; SW.x0 = t.clientX; SW.y0 = t.clientY; SW.dx = 0; SW.on = false; SW.base = row === SW.open ? -148 : 0;
  }, { passive: true });
  D.addEventListener('touchmove', (e) => {
    if (!SW.el) return;
    const t = e.touches[0], dx = t.clientX - SW.x0, dy = t.clientY - SW.y0;
    if (!SW.on) { if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) SW.on = true; else if (Math.abs(dy) > 10) { SW.el = null; return; } else return; }
    SW.dx = Math.max(-176, Math.min(0, SW.base + dx));
    const f = $('.rec-f', SW.el); f.style.transition = 'none'; f.style.transform = `translateX(${SW.dx}px)`;
  }, { passive: true });
  D.addEventListener('touchend', () => {
    if (!SW.el || !SW.on) { SW.el = null; return; }
    const row = SW.el, f = $('.rec-f', row), open = SW.dx < -64;
    f.style.transition = `transform .34s ${'cubic-bezier(.3,1.3,.5,1)'}`; f.style.transform = open ? 'translateX(-148px)' : '';
    row.classList.toggle('open', open); SW.open = open ? row : null; SW.el = null;
  });

  /* resize: re-measure bands */
  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => {
    if (S.rendered.has('home')) layBand($('#h-band'), mainItems(S.homeYm), 'none');
    if (S.rendered.has('stats')) statsBand('none');
    if (S.rendered.has('history')) layBand($('#hs-band'), ($('#hs-band') || {})._items || [], 'none');
    if (S.rendered.has('add')) stripRender();
    $$('.view').forEach(fitSeg);
  }, 120); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => { if (!R.dataset.themeLock && !R.dataset.userTheme) setTheme(e.matches ? 'dark' : 'light'); });
  addEventListener('hashchange', route);

  /* ---------- boot ---------- */
  navRender();
  let r0 = location.hash.slice(1); if (!ROUTES.includes(r0)) r0 = 'home';
  render(r0, true);
  show(r0, true);
  $('#v-add').tabIndex = -1;
  window.demo = { go };
  const t0 = performance.now();
  const rest = ['home', 'stats', 'history', 'add', 'more'].filter((r) => r !== r0);
  let ri = 0;
  const step = () => { if (ri < rest.length) { const r = rest[ri++]; if (!S.rendered.has(r)) render(r); setTimeout(step, 16); } else rendered(); };
  let readyBits = 0; const bit = () => { if (++readyBits === 3) R.dataset.ready = '1'; };
  const rendered = bit;
  setTimeout(step, 60);
  D.fonts.ready.then(() => { $$('.view.on').forEach(fitSeg); if (S.rendered.has('home')) layBand($('#h-band'), mainItems(S.homeYm), 'none'); bit(); });
  setTimeout(bit, Math.max(0, (RM ? 200 : 700) - (performance.now() - t0)));
})();
