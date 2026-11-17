/* 计序 · 夜航仪表 — Night Instrument demo */
(function () {
'use strict';
const J = window.JX, TODAY = J.TODAY, CUR = TODAY.slice(0, 7), D = document, R = D.documentElement;
const $ = (s, r) => (r || D).querySelector(s), $$ = (s, r) => Array.from((r || D).querySelectorAll(s));
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const desk = () => innerWidth >= 1024;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const F = (n, o) => J.fmt(n, o);
const p2 = n => String(n).padStart(2, '0');
const dim = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
const mN = ym => +ym.slice(5, 7);
const r2 = n => Math.round(n * 100) / 100;
const shift = (d, k) => { const x = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8) + k); return x.getFullYear() + '-' + p2(x.getMonth() + 1) + '-' + p2(x.getDate()); };
const YDAY = shift(TODAY, -1), TMRW = shift(TODAY, 1);
const raf2 = f => requestAnimationFrame(() => requestAnimationFrame(f));
const kf = n => n >= 10000 ? (n / 1000).toFixed(1) + 'K' : n >= 1000 ? (n / 1000).toFixed(2) + 'K' : String(Math.round(n));
const MEN = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const CODE = 'G4ZW-DHPW-KTEL';

/* ---------- icons: 20px grid, 1.5 monoline ---------- */
const C = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const IC = {
  home: 'M4.3 14.6A6.6 6.6 0 1 1 15.7 14.6M10 10.4l3-3.4M3.5 17h13',
  add: 'M10 4.5v11M4.5 10h11',
  log: 'M7.5 5.5h9M7.5 10h9M7.5 14.5h6M3.5 5.5h.01M3.5 10h.01M3.5 14.5h.01',
  stats: 'M3.5 16.5h13M5.5 13.5v-3M9 13.5v-8M12.5 13.5v-5.5M16 13.5V11',
  more: 'M4 4h4.5v4.5H4zM11.5 4H16v4.5h-4.5zM4 11.5h4.5V16H4zM11.5 11.5H16V16h-4.5z',
  cyc: 'M15.6 8.2A6 6 0 0 0 4.7 7M4.4 3.8V7h3.2M4.4 11.8a6 6 0 0 0 10.9 1.2M15.6 16.2V13h-3.2',
  todo: 'M4 4h12v12H4zM7.2 10.2l2 2 3.8-4.2',
  tag: 'M3.5 3.5h6.2l6.8 6.8-6.2 6.2-6.8-6.8zM7 7h.01',
  trash: 'M4 6h12M8 6V3.8h4V6M5.8 6l.8 10.2h6.8L14.2 6M8.6 9v4.4M11.4 9v4.4',
  exp: 'M10 12.5V3.5M6.5 7 10 3.5 13.5 7M4 11.5v4.5h12v-4.5',
  db: 'M4.5 5.5c0-1.1 2.5-2 5.5-2s5.5.9 5.5 2-2.5 2-5.5 2-5.5-.9-5.5-2zM4.5 5.5v9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-9M4.5 10c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2',
  up: 'M10 11v5.5M7 16.5h6M7.2 7.8a4 4 0 0 1 5.6 0M4.9 5.5a7.2 7.2 0 0 1 10.2 0' + C(10, 10.3, .8),
  theme: [C(10, 10, 6.5), 'M10 3.5a6.5 6.5 0 0 0 0 13z'],
  kb: 'M2.5 5.5h15v9h-15zM5.5 8.5h.01M8.5 8.5h.01M11.5 8.5h.01M14.5 8.5h.01M7 11.5h6',
  search: C(9, 9, 5.2) + 'M13 13l3.5 3.5',
  rcpt: 'M5.5 3h9v14l-1.8-1.2-1.8 1.2-1.8-1.2-1.8 1.2-1.8-1.2-1.8 1.2zM8 7h4M8 10h4M8 13h2',
  edit: 'M4 16l.8-3.6 8.4-8.4 2.8 2.8-8.4 8.4zM11.6 5.6l2.8 2.8',
  x: 'M5.5 5.5l9 9M14.5 5.5l-9 9',
  l: 'M12 4.5 6.5 10l5.5 5.5', r: 'M8 4.5l5.5 5.5L8 15.5',
  ok: 'M4.5 10.5l3.5 3.5 7.5-8',
  bs: 'M7.5 4.5h9v11h-9L3 10zM10 8l4 4M14 8l-4 4',
  cal: 'M3.5 5h13v11.5h-13zM3.5 8.5h13M7 3v3.5M13 3v3.5',
  cam: 'M3 6.5h3l1.5-2h5l1.5 2h3v9.5H3z' + C(10, 11, 2.8),
  restore: 'M5 8.5 2.5 6 5 3.5M2.5 6h9a5 5 0 0 1 0 10h-4',
  copy: 'M7 7h9v9H7zM4 13V4h9'
};
const CI = {
  food: 'M3 10.5h14c0 3.6-3.1 6-7 6s-7-2.4-7-6zM11.2 3.5 8.8 8M15.5 4l-4 4',
  transport: 'M5.5 3.5h9a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2zM3.5 9.5h13M7 12.3h.01M13 12.3h.01M6.5 15l-1.5 2.5M13.5 15l1.5 2.5',
  shopping: 'M4.5 7h11l-1 9.5h-9zM7.5 7V6a2.5 2.5 0 0 1 5 0v1',
  housing: 'M3 9.2 10 3.5l7 5.7M5 7.8v8.7h10V7.8M8.5 16.5v-4h3v4',
  entertainment: 'M8 14.5V5l8-1.5V13' + C(6.3, 14.5, 1.7) + C(14.3, 13, 1.7),
  medical: 'M4 4h12v12H4zM10 7v6M7 10h6',
  education: 'M10 5.5C8.2 4.2 6 3.7 3.5 4v11c2.5-.3 4.7.2 6.5 1.5 1.8-1.3 4-1.8 6.5-1.5V4c-2.5-.3-4.7.2-6.5 1.5zM10 5.5v11',
  social: 'M3.5 8h13v3h-13zM4.5 11v5.5h11V11M10 8v8.5M10 8C8.6 5.2 6.2 4.8 6.2 6.4S8.4 8 10 8c1.6 0 3.8 0 3.8-1.6S11.4 5.2 10 8z',
  finance: C(10, 10, 6.5) + 'M7.5 6.8 10 9.6l2.5-2.8M10 9.6v4.6M7.6 10.8h4.8M7.6 12.6h4.8',
  pet: C(5.8, 8.3, 1.3) + C(8.6, 5.6, 1.3) + C(11.4, 5.6, 1.3) + C(14.2, 8.3, 1.3) + 'M10 10.3c-2.5 0-4.4 2.6-4.4 4.4 0 1.3 1 1.8 2.2 1.6.9-.2 1.4-.5 2.2-.5s1.3.3 2.2.5c1.2.2 2.2-.3 2.2-1.6 0-1.8-1.9-4.4-4.4-4.4z',
  other: 'M3.5 6.5 10 3.5l6.5 3v7L10 16.5l-6.5-3zM3.5 6.5 10 9.5l6.5-3M10 9.5v7'
};
const ic = (k, c) => { const p = IC[k]; return `<svg class="i ${c || ''}" viewBox="0 0 20 20" aria-hidden="true">${Array.isArray(p) ? `<path d="${p[0]}"/><path class="f" d="${p[1]}"/>` : `<path d="${p}"/>`}</svg>`; };
const cic = (k, c) => `<svg class="i ${c || ''}" viewBox="0 0 20 20" aria-hidden="true"><path d="${CI[k]}"/></svg>`;
const short = k => J.cat[k].name.slice(0, 2);

/* ---------- state ---------- */
const fresh = o => Object.assign({ type: 'expense', expr: '', cat: null, sub: null, date: TODAY, time: J.NOW_TIME, note: '', person: '我', photo: false, edit: null }, o || {});
const S = {
  route: null, prev: 'home', ym: CUR, level: 'main', ri: 0, rl: [], dirty: {}, tm: R.dataset.themeSrc === 'fixed' ? R.dataset.theme : 'auto',
  h: { ym: CUR, type: 'all', cat: null, sub: null, q: '', from: '' }, hl: [], hn: 0, hlast: '', hday: {}, sel: new Set(),
  a: fresh(), aerr: '', cal: false, calYm: CUR, lastTx: null, trash: [], sync: 'ok', syncAt: Date.now() - 120000, undo: null, catOpen: false
};
const ROUTES = ['home', 'add', 'history', 'stats', 'more'];
const TITLES = { home: ['总览', 'OVERVIEW', '01'], add: ['记一笔', 'ENTRY', '02'], history: ['账单', 'LOG', '03'], stats: ['统计', 'ANALYSIS', '04'], more: ['更多', 'SYSTEM', '05'] };
const V = {}; $$('.view').forEach(v => { V[v.dataset.view] = v; });
const main = $('#main');
let uid = 0;

const FAV = {};
['expense', 'income'].forEach(t => {
  const m = {};
  J.records.forEach(r => { if (r.type === t) { const k = r.categoryKey + '|' + r.subcategoryKey; m[k] = (m[k] || 0) + 1; } });
  FAV[t] = Object.keys(m).sort((a, b) => m[b] - m[a]).slice(0, 6).map(k => ({ c: k.split('|')[0], s: k.split('|')[1], n: m[k] }));
});

/* ---------- clock ---------- */
const T0 = Date.now(), BASE = +J.NOW_TIME.slice(0, 2) * 3600 + +J.NOW_TIME.slice(3) * 60;
const nowS = () => BASE + Math.floor((Date.now() - T0) / 1000);
const clk = () => { const s = nowS(); return p2(Math.floor(s / 3600) % 24) + ':' + p2(Math.floor(s / 60) % 60) + ':' + p2(s % 60); };

/* ---------- rolling digits ---------- */
const DIG = Array.from({ length: 10 }, (_, i) => `<span>${i}</span>`).join('');
const rollH = (s, init) => { let k = 0; return [...s].map(c => /\d/.test(c) ? `<span class="dg"><span class="ds" style="--d:${init ? init[k++] : c}">${DIG}</span></span>` : `<span class="dc">${c}</span>`).join(''); };
const rollS = (s, c) => `<span class="roll ${c || ''}" data-v="${s}">${rollH(s)}</span>`;
function aim(el, nd) { const ds = $$('.ds', el); ds.forEach((d, i) => { d.style.transitionDelay = (ds.length - 1 - i) * 30 + 'ms'; d.style.setProperty('--d', nd[i]); }); }
function rset(el, s, from) {
  const old = from != null ? from : (el.dataset.v || '');
  if (from == null && old === s) return;
  el.dataset.v = s;
  const tp = x => x.replace(/\d/g, '0'), nd = s.replace(/\D/g, '');
  if (RM) { el.innerHTML = rollH(s); return; }
  if (old && tp(old) === tp(s) && $$('.ds', el).length === nd.length && from == null) { aim(el, nd); return; }
  const od = old.replace(/\D/g, '');
  const init = nd.split('').map((_, i) => od[od.length - (nd.length - i)] || '0');
  el.innerHTML = rollH(s, init);
  raf2(() => aim(el, nd));
}
const money = n => { const m = J.splitMoney(n); return `<span class="sg">${m.neg ? '−' : ''}</span><small class="cur">¥</small>${rollS(m.int, 'int')}${rollS('.' + m.dec, 'dec')}`; };
function swap(el, html) {
  if (!el) return;
  const olds = $$('.roll', el).map(x => x.dataset.v), nd = $('.ndl', el), oa = nd && nd.style.transform;
  el.innerHTML = html;
  $$('.roll', el).forEach((x, i) => { const o = olds[i]; if (o != null && o !== x.dataset.v) rset(x, x.dataset.v, o); });
  const n2 = $('.ndl', el);
  if (n2 && oa && !RM) { const t = n2.style.transform; n2.style.transform = oa; raf2(() => { n2.style.transform = t; }); }
}

/* ---------- shared pieces ---------- */
const lb = (cn, en) => `<span class="lb"><b>${cn}</b>${en}</span>`;
const mh = (id, t, en, right) => `<div class="mh"><span class="id">${id}</span><h2>${t}</h2><span class="lb">${en}</span><span class="sp"></span>${right || ''}</div>`;
const seg = (id, act, opts, cur, cls) => { const i = Math.max(0, opts.findIndex(o => o[0] === cur)); return `<div class="seg ${cls || ''}" id="${id}" style="--n:${opts.length};--i:${i}" role="tablist"><i class="th"></i>${opts.map(o => `<button data-a="${act}" data-v="${o[0]}" class="${o[0] === cur ? 'on' : ''}" role="tab" aria-selected="${o[0] === cur}">${o[1]}</button>`).join('')}</div>`; };
function segSet(el, v) { if (!el) return; $$('button', el).forEach((b, i) => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); if (on) el.style.setProperty('--i', i); }); }
const syncTxt = sh => { if (S.sync === 'busy') return sh ? '同步中' : '同步中 · UPLINK'; const m = Math.floor((Date.now() - S.syncAt) / 60000); return sh ? (m < 1 ? '刚刚同步' : '已同步') : (m < 1 ? '刚刚已同步' : m + ' 分钟前已同步'); };
const syncChip = sh => `<button class="sync" data-a="sync" data-sync="${S.sync}" aria-label="云同步"><i class="led"></i><span class="stt">${syncTxt(sh)}</span><span class="scanbar"><i></i></span>${sh ? '' : `<span class="code">${CODE}</span>`}</button>`;
const themeBtn = () => `<button class="ghost ic" data-a="theme" aria-label="切换日间 / 夜航">${ic('theme')}</button>`;
function mhead(r) {
  const t = TITLES[r];
  if (r === 'add') return `<div class="mhead"><button class="ghost ic" data-a="back" aria-label="返回">${ic('l')}</button><div><h1>${S.a.edit ? '编辑记录' : '记一笔'}</h1><span class="lb">${t[2]} · ${t[1]}</span></div><span class="sp"></span>${themeBtn()}</div>`;
  return `<div class="mhead"><div><h1>${r === 'home' ? '计序' : t[0]}</h1><span class="lb">${r === 'home' ? 'JIXU · NIGHT INSTRUMENT' : t[2] + ' · ' + t[1]}</span></div><span class="sp"></span>${syncChip(1)}${themeBtn()}</div>`;
}
const monSw = () => { const i = J.MONTHS.indexOf(S.ym); return `<div class="mon"><button data-a="mon" data-d="-1" ${i <= 0 ? 'disabled' : ''} aria-label="上个月">${ic('l', 's')}</button><span class="mv">${rollS(S.ym.replace('-', '.'))}</span><button data-a="mon" data-d="1" ${i >= J.MONTHS.length - 1 ? 'disabled' : ''} aria-label="下个月">${ic('r', 's')}</button></div><span class="mscale" aria-hidden="true">${J.MONTHS.map(m => `<i class="${m === S.ym ? 'on' : ''}"></i>`).join('')}</span>`; };
const ro = (cn, en, n, cls) => `<div class="ro ${cls || ''}">${lb(cn, en)}<span class="v num">${money(n)}</span></div>`;
const roN = (cn, en, n, unit) => `<div class="ro">${lb(cn, en)}<span class="v num">${rollS(String(n))}<small class="u">${unit}</small></span></div>`;
const hiq = (s, q) => {
  s = String(s || ''); if (!q) return esc(s);
  const lo = s.toLowerCase(), ql = q.toLowerCase(); let i = 0, out = '', j;
  while ((j = lo.indexOf(ql, i)) >= 0) { out += esc(s.slice(i, j)) + '<mark>' + esc(s.slice(j, j + q.length)) + '</mark>'; i = j + q.length; }
  return out + esc(s.slice(i));
};
function rowH(r, h, q) {
  const inc = r.type === 'income';
  return `<div class="row${h ? ' hrow' + (S.sel.has(r.id) ? ' on' : '') : ''}" data-id="${r.id}"><div class="rw">${h ? `<button class="sel" data-a="sel" aria-label="选择"><span class="chk">${ic('ok', 's')}</span></button>` : ''}<span class="pict">${cic(r.categoryKey)}</span><span class="tx"><b>${hiq(r.subcategoryName, q)}</b><i>${hiq(r.note || r.categoryName, q)}${q && r.note && r.categoryName.toLowerCase().includes(q.toLowerCase()) ? ' · ' + hiq(r.categoryName, q) : ''}</i></span><span class="who${r.person === '阿念' ? ' n' : ''}">${r.person}</span><span class="tm">${r.time}</span><span class="ph" ${r.photo ? 'title="有小票照片"' : ''}>${r.photo ? ic('rcpt', 's') : ''}</span><span class="mt"><span class="who${r.person === '阿念' ? ' n' : ''}">${r.person}</span><i>·</i><span>${r.time}</span>${r.photo ? '<i>·</i><span class="phx">小票</span>' : ''}</span><span class="amt${inc ? ' in' : ''}">${inc ? '+' : '−'}${F(r.amount)}</span>${h ? `<span class="acts"><button class="ib" data-a="edit" aria-label="编辑">${ic('edit', 's')}</button><button class="ib del" data-a="del" aria-label="删除">${ic('trash', 's')}</button></span>` : ''}</div>${h ? `<div class="sw"><button class="e0" data-a="edit">${ic('edit')}编辑</button><button class="d0" data-a="del">${ic('trash')}删除</button></div>` : ''}</div>`;
}
const hlNum = s => esc(s).replace(/¥[\d,]+(\.\d+)?|\d+(\.\d+)?%/g, '<span class="num">$&</span>');

/* ---------- budget dial ---------- */
function bud(ym) {
  const b = J.budget(ym), n = dim(ym), cur = ym === CUR, day = cur ? +TODAY.slice(8) : n, pace = day / n, exp = r2(b.budget * pace), ahead = r2(b.spent - exp);
  const st = b.ratio > 1 ? 'over' : (ahead > b.budget * .05 ? 'warn' : 'ok');
  return Object.assign({}, b, { n, cur, day, pace, exp, ahead, st, daysLeft: cur ? b.daysLeft : 0, perDay: cur ? b.perDay : 0 });
}
const A0 = 135, SW = 270, ang = f => A0 + SW * Math.max(0, Math.min(1, f));
const pt = (r, a) => { const t = a * Math.PI / 180; return (150 + r * Math.cos(t)).toFixed(1) + ' ' + (150 + r * Math.sin(t)).toFixed(1); };
const arc = (r, f0, f1) => `M${pt(r, ang(f0))}A${r} ${r} 0 ${SW * (f1 - f0) > 180 ? 1 : 0} 1 ${pt(r, ang(f1))}`;
function dialSvg(b) {
  let s = '';
  for (let d = 0; d <= b.n; d++) { const a = ang(d / b.n), mj = d % 5 === 0 || d === b.n; s += `<path class="tk${d <= b.day ? ' el' : ''}${mj ? ' mj' : ''}" d="M${pt(mj ? 118 : 123, a)}L${pt(131, a)}"/>`; }
  const fv = Math.min(b.ratio, 1), pa = ang(b.pace);
  const lbl = (t, f) => { const p = pt(94, ang(f)).split(' '); return `<text class="lbl" x="${p[0]}" y="${p[1]}" text-anchor="middle" dominant-baseline="middle">${t}</text>`; };
  return `<svg class="dial ${b.st}" viewBox="0 0 300 300" aria-hidden="true">${s}<path class="trk" d="${arc(108, 0, 1)}"/>${b.st !== 'ok' && fv > b.pace ? `<path class="zone" d="${arc(108, b.pace, fv)}"/>` : ''}${fv > .003 ? `<path class="val" d="${arc(108, 0, fv)}"/>` : ''}<path class="bug" d="M${pt(136, pa)}L${pt(146, pa - 2.6)}L${pt(146, pa + 2.6)}Z"/>${lbl('0', 0)}${lbl('4K', .5)}${lbl('8K', 1)}</svg>`;
}
function dialH(ym) {
  const b = bud(ym), over = b.remain < 0;
  return `<div class="dialw ${b.st}">${dialSvg(b)}<div class="ndl" style="transform:rotate(${ang(b.ratio).toFixed(1)}deg)"><i></i><b></b></div><div class="dialc${over ? ' over' : ''}">${lb(over ? '已超支' : '剩余可花', over ? 'OVER' : 'REMAIN')}<span class="big num">${money(Math.abs(b.remain))}</span><span class="sub">${b.cur ? `日均可花 <b>¥${F(b.perDay)}</b> · 余 ${b.daysLeft} 天` : (over ? '本月已结算 · 超出预算' : '本月已结算 · 未超预算')}</span></div></div>
  <div class="pace ${b.st}"><i class="led ${b.st === 'ok' ? '' : b.st === 'warn' ? 'amb' : 'cor'}"></i><span>${b.st === 'over' ? '<b>超出预算</b>' : b.st === 'warn' ? '花费<b>超前节奏</b>' : '<b>节奏正常</b>'}</span><span class="num">${b.st === 'over' ? '+¥' + F(b.spent - b.budget) : (b.ahead >= 0 ? '+' : '−') + '¥' + F(Math.abs(b.ahead))}</span></div>
  <div class="ros dros">${ro('已花', 'SPENT', b.spent)}${ro('线性应花', 'PACE', b.exp)}${roN('进度', 'DAY', p2(b.day), '/' + b.n)}</div>`;
}

/* ---------- home ---------- */
function top3H(ym) {
  const l = J.byCategory(ym).slice(0, 3);
  if (!l.length) return '<div class="empty-s">本月还没有支出</div>';
  const mx = l[0].share;
  return `<div class="t3h">${lb('支出前三', 'TOP 3')}</div>` + l.map(c => `<button class="t3" data-a="drill" data-c="${c.categoryKey}" data-src="总览"><span class="pict">${cic(c.categoryKey)}</span><span class="nm">${c.name}</span><span class="br"><i style="--s:${(c.share / mx).toFixed(3)}"></i></span><span class="a num">¥${F(c.total)}</span><span class="p">${Math.round(c.share * 100)}%</span></button>`).join('');
}
function miniLog(list) {
  let out = '', d = '';
  list.forEach(r => {
    if (r.date !== d) {
      d = r.date; const day = list.filter(x => x.date === d), e = day.filter(x => x.type === 'expense').reduce((s, x) => s + x.amount, 0);
      out += `<div class="lh"><b>${J.dateLabel(d)}</b><span>${J.weekday(d)}</span><span class="sp"></span><span class="num">${day.length} 笔 · −${F(e)}</span></div>`;
    }
    out += rowH(r);
  });
  return out || '<div class="empty-s">这个月还没有记录</div>';
}
function logH(ym) {
  const list = ym === CUR ? J.records.filter(r => r.date === TODAY).concat(J.records.filter(r => r.date < TODAY).slice(0, 3)) : J.records.filter(r => r.date.slice(0, 7) === ym).slice(0, 8);
  return mh('M-03', ym === CUR ? '今天' : mN(ym) + '月记录', ym === CUR ? 'TODAY · LOG' : 'RECENT', `<button class="lnk" data-a="go" data-r="history">全部账单${ic('r', 's')}</button>`) + `<div class="rows">${miniLog(list)}</div>`;
}
function repH(ym) {
  const L = J.report(ym).slice(), b = bud(ym);
  if (b.cur && b.st === 'warn') L.push(`按线性节奏，到今天应花 ¥${F(b.exp)}，目前超前 ¥${F(b.ahead)}；剩下 ${b.daysLeft} 天，每天控制在 ¥${F(b.perDay)} 以内就不会超支。`);
  else if (b.cur) L.push(`节奏平稳，剩下 ${b.daysLeft} 天每天还能花 ¥${F(b.perDay)}。`);
  else if (b.st === 'over') L.push(`这个月超出预算 ¥${F(b.spent - b.budget)}。`);
  return mh('M-04', '月度报告', 'REPORT · ' + MEN[mN(ym)]) + `<div class="rep">${L.map((s, i) => `<p data-n="${p2(i + 1)}">${hlNum(s)}</p>`).join('')}</div>`;
}
const nextBills = () => J.recurring.filter(x => x.enabled && x.next >= TODAY).sort((a, b) => a.next.localeCompare(b.next));
const daysTo = d => Math.round((new Date(d) - new Date(TODAY)) / 864e5);
function billH() {
  const l = nextBills(), b = l[0];
  return mh('M-05', '下一笔周期账单', 'NEXT BILL', `<button class="lnk" data-a="go" data-r="more/rec">全部${ic('r', 's')}</button>`) + `<div class="bill"><div class="when"><b>${+b.next.slice(8)}</b><span>${MEN[mN(b.next)]}</span></div><div class="bi"><b>${b.name}</b><span>${b.cycle} · ${daysTo(b.next)} 天后</span></div><span class="num">¥${F(b.amount)}</span></div><div class="nx">${l.slice(1, 3).map(x => `<div><span>${x.name}</span><span class="m">${J.dateLabel(x.next)}</span><span class="num">¥${F(x.amount)}</span></div>`).join('')}</div>`;
}
function dueTag(t) {
  if (t.done) return `<span class="tag">已完成</span>`;
  const tm = t.time ? ' ' + t.time : '';
  if (t.due < TODAY) return `<span class="tag cor">已逾期</span>`;
  if (t.due === TODAY) return `<span class="tag amb">今天${tm}</span>`;
  if (t.due === TMRW) return `<span class="tag ac">明天${tm}</span>`;
  return `<span class="tag">${J.dateLabel(t.due)}</span>`;
}
const todoRow = t => `<div class="td${t.done ? ' done' : ''}" data-id="${t.id}"><button class="cbtn" data-a="todo" data-id="${t.id}" role="checkbox" aria-checked="${t.done}" aria-label="完成 ${t.title}"><span class="chk${t.done ? ' on' : ''}">${ic('ok', 's')}</span></button><div class="tt"><b>${t.title}</b><span>${dueTag(t)} ${t.repeat}</span></div><div class="r">${t.amount ? `<span class="num">¥${F(t.amount, { trim: 1 })}</span>` : ''}${!t.done && t.amount ? `<button class="mini" data-a="todoRec" data-id="${t.id}">记账</button>` : ''}</div></div>`;
function todoH(all) {
  const l = J.todos.slice().sort((a, b) => (a.done - b.done) || a.due.localeCompare(b.due)).filter(t => all || !t.done || t._tog);
  const open = J.todos.filter(t => !t.done).length;
  return mh(all ? 'P-02' : 'M-06', '待办', 'TODO · ' + open + ' OPEN', all ? '' : `<button class="lnk" data-a="go" data-r="more/todo">${J.todos.length - open} 已完成${ic('r', 's')}</button>`) + `<div class="tds">${l.map(todoRow).join('')}</div>`;
}
const syncBody = () => `${lb('同步码', 'SYNC CODE')}<div class="code-big">${CODE.split('-').map(s => `<span>${s}</span>`).join('')}</div><div class="st" data-sync="${S.sync}"><i class="led"></i><span class="stt">${syncTxt()}</span><span class="scanbar"><i></i></span></div><button class="sbtn" data-a="sync">${ic('up', 's')}立即同步</button>`;
function homeH() {
  const ym = S.ym, t = J.totals(ym);
  return mhead('home') + `<div class="grid hg">
<article class="mod s-7 hero" id="m-hero">${heroH(ym, t)}</article>
<article class="mod s-5" id="m-dial">${mh('M-02', '预算', 'BUDGET · ¥8,000 / MO')}${dialH(ym)}</article>
<div class="col s-5 c-log"><article class="mod" id="m-log">${logH(ym)}</article></div>
<div class="col s-4 c-rep"><article class="mod" id="m-rep">${repH(ym)}</article><article class="mod" id="m-bill">${billH()}</article></div>
<div class="col s-3 c-todo"><article class="mod" id="m-todo">${todoH()}</article><article class="mod syncm" id="m-sync">${mh('M-07', '云同步', 'UPLINK')}${syncBody()}</article></div></div>`;
}
const heroH = (ym, t) => mh('M-01', '本月支出', 'CH-01 · EXPENSE', monSw()) + `<div class="amt-hero num">${money(t.expense)}</div><div class="ros">${ro('收入', 'INCOME', t.income, 'inc')}${ro('结余', 'BALANCE', t.balance, t.balance < 0 ? 'neg' : '')}${roN('笔数', 'ENTRIES', t.count, '笔')}</div><div class="top3">${top3H(ym)}</div>`;
function homeMonth() {
  const ym = S.ym, t = J.totals(ym), v = V.home;
  swap($('#m-hero', v), heroH(ym, t));
  swap($('#m-dial', v), mh('M-02', '预算', 'BUDGET · ¥8,000 / MO') + dialH(ym));
  $('#m-log', v).innerHTML = logH(ym);
  $('#m-rep', v).innerHTML = repH(ym);
  ['#m-log', '#m-rep'].forEach(s => fade($(s, v)));
}
const fade = el => { if (el && !RM) el.animate([{ opacity: .2 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' }); };

/* ---------- add ---------- */
const evalE = e => r2(e.split('+').reduce((s, p) => s + (parseFloat(p) || 0), 0));
const typing = s => { const p = s.split('.'); return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (p.length > 1 ? '.' + p[1] : ''); };
const pending = () => { const e = S.a.expr; return e.includes('+') && !/\+$/.test(e); };
function lcdV() {
  const e = S.a.expr, has = e.includes('+');
  return `<span class="ex">${has ? esc(e.replace(/\+/g, ' + ')) + ' =' : ''}</span><small>¥</small><span class="${e ? '' : 'num0'}">${has ? F(evalE(e)) : (e ? typing(e) : '0.00')}</span><i class="caret"></i>`;
}
function lcdB() {
  const a = S.a;
  return `<span>${a.cat ? short(a.cat) + ' · ' + J.subName(a.cat, a.sub) : '未选分类 · NO CAT'}</span><span>${J.dateLabel(a.date)} ${a.time} · ${a.person}${a.photo ? ' · 小票' : ''}</span>`;
}
const txH = () => { const r = S.lastTx || J.records[0]; return `<span class="lb">${S.lastTx ? 'TX · 刚刚' : 'LAST'}</span><span class="pk">${cic(r.categoryKey, 's')}<b>${r.subcategoryName}</b><span class="num">${r.type === 'income' ? '+' : '−'}¥${F(r.amount)}</span><span>${J.dateLabel(r.date)} ${r.time}</span></span><span class="sp"></span><span class="ack">${S.lastTx ? '已入账' : ''}</span>`; };
function catH() {
  const a = S.a, c = a.cat && J.cat[a.cat];
  return mh('A-02', '分类', 'CATEGORY', a.cat ? `<span class="tag ac">${short(a.cat)} · ${J.subName(a.cat, a.sub)}</span>` : '') +
    `<div class="lb sl"><b>常用</b>FREQUENT</div><div class="chips scroll favs">${FAV[a.type].map(f => `<button class="chip${a.cat === f.c && a.sub === f.s ? ' on' : ''}" data-a="fav" data-c="${f.c}" data-s="${f.s}">${cic(f.c)}${J.subName(f.c, f.s)}</button>`).join('')}</div>
<div class="cats${S.aerr === 'cat' ? ' err' : ''}" id="a-cats">${J.categories.map((x, i) => `<button class="cat${a.cat === x.key ? ' on' : ''}" data-a="cat" data-c="${x.key}" aria-pressed="${a.cat === x.key}"><span class="k">${p2(i + 1)}</span>${cic(x.key)}<span>${short(x.key)}</span></button>`).join('')}<button class="cat mg" data-a="go" data-r="more/cat">${ic('tag')}<span>管理</span></button></div>
<div class="sect">${lb('二级', 'SUB' + (c ? ' · ' + c.en.toUpperCase() : ''))}<div class="chips subs">${c ? c.subs.map(s => `<button class="chip${a.sub === s.key ? ' on' : ''}" data-a="sub" data-s="${s.key}">${s.name}</button>`).join('') : '<span class="hint0">先选一个一级分类</span>'}</div></div>`;
}
function calH() {
  const ym = S.calYm, n = dim(ym), f = new Date(+ym.slice(0, 4), mN(ym) - 1, 1).getDay(), i = J.MONTHS.indexOf(ym);
  let g = '日一二三四五六'.split('').map(x => `<span>${x}</span>`).join('') + '<i></i>'.repeat(f);
  for (let d = 1; d <= n; d++) { const ds = ym + '-' + p2(d); g += `<button data-a="cald" data-v="${ds}" class="${ds === S.a.date ? 'on' : ''}${ds === TODAY ? ' td0' : ''}" ${ds > TODAY ? 'disabled' : ''}>${d}</button>`; }
  return `<div class="ch"><button data-a="calm" data-d="-1" ${i <= 0 ? 'disabled' : ''} aria-label="上个月">${ic('l', 's')}</button><span>${ym.replace('-', '.')}</span><button data-a="calm" data-d="1" ${i >= J.MONTHS.length - 1 ? 'disabled' : ''} aria-label="下个月">${ic('r', 's')}</button></div><div class="gd">${g}</div>`;
}
const fk = (cn, en) => `<span class="fk">${cn}<i>${en}</i></span>`;
function fieldsH() {
  const a = S.a, pick = a.date !== TODAY && a.date !== YDAY;
  return `${fk('日期', 'DATE')}<div class="fv"><button class="chip${a.date === TODAY ? ' on' : ''}" data-a="date" data-v="t">今天</button><button class="chip${a.date === YDAY ? ' on' : ''}" data-a="date" data-v="y">昨天</button><button class="chip${pick ? ' on' : ''}" data-a="date" data-v="p" aria-expanded="${S.cal}">${ic('cal', 's')}${pick ? J.dateLabel(a.date) : '选择日期'}</button><div class="cal${S.cal ? ' on' : ''}">${calH()}</div></div>
${fk('时间', 'TIME')}<div class="fv"><input class="tinp" type="time" id="a-time" value="${a.time}" aria-label="时间"><span class="sp"></span>${seg('a-per', 'per', [['我', '我'], ['阿念', '阿念']], a.person, 'per')}</div>
${fk('备注', 'NOTE')}<div class="fv"><input class="inp" id="a-note" placeholder="写点什么，比如：和同事拼饭" value="${esc(a.note)}" maxlength="40" autocomplete="off"></div>
${fk('小票', 'RECEIPT')}<div class="fv">${a.photo ? `<button class="photo on" data-a="photo"><svg class="rcpt" viewBox="0 0 22 28" aria-hidden="true"><rect x=".5" y=".5" width="21" height="27" rx="1"/><line x1="4" y1="7" x2="18" y2="7"/><line x1="4" y1="11" x2="14" y2="11"/><line x1="4" y1="15" x2="16" y2="15"/><line x1="4" y1="21" x2="18" y2="21"/></svg>小票已附加 · IMG_2041</button><button class="ib" data-a="photox" aria-label="移除小票">${ic('x', 's')}</button>` : `<button class="photo" data-a="photo">${ic('cam', 's')}拍照 / 附加小票</button>`}</div>`;
}
const KEYS = [['7'], ['8'], ['9'], ['bs', ic('bs'), 'BKSP'], ['4'], ['5'], ['6'], ['+', '+', 'ADD'], ['1'], ['2'], ['3'], ['ok'], ['c', 'C', 'ESC'], ['0'], ['.', '.', 'DOT']];
const saveKey = () => pending() ? '<span style="font:300 26px/1 var(--mono)">=</span><span class="kbd">ENTER</span>' : `${S.a.edit ? '更新' : '保存'}<span class="kbd">ENTER</span>`;
const padH = () => KEYS.map(k => k[0] === 'ok' ? `<button class="key save${S.a.type === 'income' ? ' inc' : ''}" data-a="k" data-k="ok" id="k-ok">${saveKey()}</button>` : `<button class="key${/\d/.test(k[0]) ? '' : ' fn'}" data-a="k" data-k="${k[0]}" aria-label="${k[2] || k[0]}">${k[2] ? `<small>${k[2]}</small>` : ''}${k[1] || k[0]}</button>`).join('');
function addH() {
  const a = S.a, inc = a.type === 'income';
  return `<div class="addv grid"><div class="up col s-7">${mhead('add')}
<article class="mod" id="a-main">${mh('A-01', a.edit ? '编辑记录' : '金额', a.edit ? 'EDIT · #' + a.edit : 'AMOUNT', seg('a-type', 'type', [['expense', '支出'], ['income', '收入']], a.type, inc ? 'inc' : ''))}
<div class="lcd${inc ? ' inc' : ''}" id="lcd"><i class="fl"></i><i class="scanl"></i><div class="top"><span id="lcd-ch">${inc ? 'CH-02 · IN · INCOME' : 'CH-01 · OUT · EXPENSE'}</span><span>REC ${clk().slice(0, 5)}</span></div><div class="val" id="lcd-v">${lcdV()}</div><div class="bot" id="lcd-b">${lcdB()}</div></div>
<div class="err-t" id="a-err" role="alert"></div><div class="txlog" id="txlog">${txH()}</div></article>
<article class="mod" id="a-cat">${catH()}</article></div>
<div class="col s-5 c-side"><article class="mod" id="a-meta">${mh('A-03', '详情', 'DETAILS')}<div class="fields" id="a-f">${fieldsH()}</div>
<button class="savebtn${inc ? ' inc' : ''}" data-a="save">${a.edit ? '更新这笔记录' : '保存这笔记录'}<span class="kbd">ENTER</span></button>
<div class="hints"><span><i class="kbd">0–9</i>直接输入</span><span><i class="kbd">+</i>连加</span><span><i class="kbd">Enter</i>保存</span><span><i class="kbd">Esc</i>清空</span><span><i class="kbd">Tab</i>下一项</span><span><i class="kbd">Ctrl+Shift+N</i>随时记一笔</span></div></article>
<article class="mod dock" id="a-pad">${mh('A-04', '键盘', 'KEYPAD · 键盘同步')}<div class="pad">${padH()}</div></article></div></div>`;
}
function updLcd() {
  const lcd = $('#lcd'); if (!lcd) return;
  $('#lcd-v').innerHTML = lcdV(); $('#lcd-b').innerHTML = lcdB();
  const k = $('#k-ok'); if (k) k.innerHTML = saveKey();
}
function updAdd(parts) {
  const a = S.a, inc = a.type === 'income';
  if (parts.includes('type')) {
    segSet($('#a-type'), a.type); $('#a-type').classList.toggle('inc', inc);
    $('#lcd').classList.toggle('inc', inc); $('#lcd-ch').textContent = inc ? 'CH-02 · IN · INCOME' : 'CH-01 · OUT · EXPENSE';
    $$('.savebtn,#k-ok').forEach(b => b.classList.toggle('inc', inc));
  }
  if (parts.includes('cat')) $('#a-cat').innerHTML = catH();
  if (parts.includes('f')) $('#a-f').innerHTML = fieldsH();
  updLcd();
}
function flashLcd() { const f = $('#lcd .fl'); if (f && !RM) f.animate([{ opacity: .1 }, { opacity: 0 }], { duration: 180, easing: 'ease-out' }); }
function shake(el) { if (el && !RM) el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }], { duration: 260 }); }
function setErr(k) {
  S.aerr = k; const e = $('#a-err'); if (!e) return;
  e.innerHTML = k ? ic('x', 's') + (k === 'amt' ? '请输入金额 · 金额要大于 0' : '请选择一个分类 · 点上方任意分类或常用') : '';
  $('#lcd').classList.toggle('err', k === 'amt'); const c = $('#a-cats'); if (c) c.classList.toggle('err', k === 'cat');
}
function input(k) {
  let e = S.a.expr; const parts = e.split('+'), last = parts[parts.length - 1];
  if (k === 'bs') e = e.slice(0, -1);
  else if (k === 'c') e = '';
  else if (k === '+') { if (!last || last === '.' || /\.$/.test(last)) return shake($('#lcd')); e += '+'; }
  else if (k === '.') { if (last.includes('.')) return shake($('#lcd')); e += last === '' ? '0.' : '.'; }
  else { if (/\.\d\d$/.test(last) || last.replace('.', '').length >= 8) return shake($('#lcd')); if (last === '0') e = e.slice(0, -1); e += k; }
  S.a.expr = e; if (S.aerr === 'amt') setErr(''); updLcd(); flashLcd();
}
function keyFx(k) { const b = $(`.key[data-k="${k === 'Enter' ? 'ok' : k}"]`); if (!b) return; b.classList.add('dn'); setTimeout(() => b.classList.remove('dn'), 110); }
function insertRec(r) { const k = r.date + r.time; let i = J.records.findIndex(x => (x.date + x.time) <= k); if (i < 0) i = J.records.length; J.records.splice(i, 0, r); }
function removeRec(id) { const i = J.records.findIndex(x => x.id === id); return i >= 0 ? J.records.splice(i, 1)[0] : null; }
function dirty(except) { ROUTES.forEach(r => { if (r !== except) S.dirty[r] = true; }); idle(); }
function makeRec(o) {
  const c = J.cat[o.cat], sub = o.sub || c.subs[0].key;
  return { id: 'n' + (++uid), type: o.type, amount: o.amount, categoryKey: o.cat, categoryName: c.name, subcategoryKey: sub, subcategoryName: J.subName(o.cat, sub), note: o.note || '', date: o.date, time: o.time, person: o.person || '我', photo: !!o.photo };
}
function save() {
  const a = S.a;
  if (pending()) { a.expr = String(evalE(a.expr)); updLcd(); flashLcd(); return; }
  const v = evalE(a.expr);
  if (!(v > 0)) { setErr('amt'); shake($('#lcd')); return; }
  if (!a.cat) { setErr('cat'); shake($('#a-cats')); const c = $('#a-cat'); if (c && !desk()) c.scrollIntoView({ block: 'center', behavior: RM ? 'auto' : 'smooth' }); return; }
  setErr('');
  const snap = Object.assign({}, a), nr = makeRec(Object.assign({}, a, { amount: v }));
  let undo;
  if (a.edit) {
    const rec = J.records.find(x => x.id === a.edit), before = Object.assign({}, rec);
    removeRec(rec.id); Object.assign(rec, nr, { id: rec.id }); insertRec(rec); S.lastTx = rec;
    undo = () => { removeRec(rec.id); Object.assign(rec, before); insertRec(rec); restoreForm(snap); };
  } else {
    insertRec(nr); S.lastTx = nr;
    undo = () => { removeRec(nr.id); restoreForm(snap); };
  }
  transmit();
  dirty('add');
  S.a = fresh({ type: a.type, cat: a.cat, sub: a.sub, date: a.date, person: a.person, time: clk().slice(0, 5) });
  setTimeout(() => {
    if (S.route !== 'add') return;
    if (snap.edit) { render('add'); return; }
    updAdd(['f']); const tx = $('#txlog'); tx.innerHTML = txH();
    if (!RM) $('.pk', tx).animate([{ transform: 'translateY(12px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,.7,.1,1)' });
  }, 420);
  toast(`${snap.edit ? '已更新' : '已记录'} ${J.subName(nr.categoryKey, nr.subcategoryKey)} <span class="num">${a.type === 'income' ? '+' : '−'}¥${F(v)}</span>`, undo);
}
function restoreForm(snap) { S.a = Object.assign({}, snap); S.lastTx = null; S.dirty.add = true; dirty(); if (S.route === 'add') render('add'); else if (S.route) render(S.route); }
function transmit() {
  const lcd = $('#lcd');
  if (lcd && !RM) $('.scanl', lcd).animate([{ transform: 'translateX(-72px)', opacity: 1 }, { transform: `translateX(${lcd.clientWidth}px)`, opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.5,0,.2,1)' });
  blink();
}
const blink = () => { if (!RM) $$('.led').forEach(l => l.animate([{ opacity: 1 }, { opacity: .1 }, { opacity: 1 }], { duration: 220, iterations: 3 })); };

/* ---------- history ---------- */
function hFilter() {
  const h = S.h, q = h.q.trim().toLowerCase();
  return J.records.filter(r => (h.ym === 'all' || r.date.slice(0, 7) === h.ym) && (h.type === 'all' || r.type === h.type) && (!h.cat || r.categoryKey === h.cat) && (!h.sub || r.subcategoryKey === h.sub) && (!q || (r.note + ' ' + r.categoryName + ' ' + r.subcategoryName).toLowerCase().includes(q)));
}
function histH() {
  const h = S.h;
  return mhead('history') + `<div class="mod hf"><div class="fbar"><label class="search${h.q ? ' has' : ''}">${ic('search', 's')}<input id="hq" type="search" placeholder="搜索备注或分类，例如：午餐、猫" value="${esc(h.q)}" autocomplete="off" aria-label="搜索"><span class="kbd dk">/</span><button class="x" data-a="qx" aria-label="清除搜索">${ic('x', 's')}</button></label>
${seg('h-type', 'htype', [['all', '全部'], ['expense', '支出'], ['income', '收入']], h.type)}
<div class="chips scroll hym">${[['all', '全部月份']].concat(J.MONTHS.slice().reverse().map(m => [m, mN(m) + '月'])).map(m => `<button class="chip${h.ym === m[0] ? ' on' : ''}" data-a="hym" data-v="${m[0]}">${m[1]}</button>`).join('')}</div></div>
<div class="chips scroll hcm" id="hcm"></div></div>
<div class="hlay"><article class="mod logm"><div class="batch" id="batch"></div>${mh('L-01', '账单', 'LOG', '<span id="hfrom"></span><span class="lb" id="hcount"></span>')}<div id="hl" class="hl"></div><div class="more-rows" id="hmore"></div></article>
<aside class="side"><article class="mod" id="hside"></article></aside></div>`;
}
function hRefresh(keep) {
  const v = V.history; if (!v.firstChild) return;
  const L = hFilter(), sc = main.scrollTop, n = keep ? Math.max(40, S.hn) : 40;
  S.hl = L; S.hn = 0; S.hlast = ''; S.hday = {};
  let te = 0, ti = 0;
  L.forEach(r => { const d = S.hday[r.date] || (S.hday[r.date] = { n: 0, e: 0, i: 0 }); d.n++; if (r.type === 'expense') { d.e += r.amount; te += r.amount; } else { d.i += r.amount; ti += r.amount; } });
  const hl = $('#hl', v); hl.innerHTML = '';
  if (!L.length) hl.innerHTML = `<div class="nosig"><svg viewBox="0 0 320 64" aria-hidden="true"><path d="M0 32h120l8-14 8 28 8-14h176" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="${S.h.q ? '0' : '4 4'}"/></svg>${lb('NO SIGNAL', '')}<b>没有找到匹配的记录</b><p>${S.h.q ? `「${esc(S.h.q)}」` : '当前筛选'}下没有账单，换个关键词或放宽筛选试试。</p><button class="mini ac" data-a="hclr">清除全部筛选</button></div>`;
  else hChunk(n);
  $('#hcount', v).textContent = L.length + ' 笔';
  $('#hfrom', v).innerHTML = S.h.from ? `<span class="from">${esc(S.h.from)}<button data-a="fromx" aria-label="清除来源筛选">${ic('x', 's')}</button></span>` : '';
  const base = J.records.filter(r => (S.h.ym === 'all' || r.date.slice(0, 7) === S.h.ym) && (S.h.type === 'all' || r.type === S.h.type)), cnt = {};
  base.forEach(r => { cnt[r.categoryKey] = (cnt[r.categoryKey] || 0) + 1; });
  $('#hside', v).innerHTML = mh('L-02', '读数', 'READOUT') + `<div class="ro">${lb('筛选结果', 'MATCHED')}<span class="v num">${rollS(String(L.length))}<small class="u">笔</small></span></div>${ro('支出合计', 'OUT', te)}${ro('收入合计', 'IN', ti, 'inc')}
<div class="sect">${lb('分类', 'CATEGORY')}<div class="clist"><button class="cl${!S.h.cat ? ' on' : ''}" data-a="hcat" data-c="">${ic('more', 's')}<span>全部分类</span><span class="num">${base.length}</span></button>${J.categories.map(c => `<button class="cl${S.h.cat === c.key ? ' on' : ''}" data-a="hcat" data-c="${c.key}" ${cnt[c.key] ? '' : 'disabled'}>${cic(c.key, 's')}<span>${c.name}</span><span class="num">${cnt[c.key] || 0}</span></button>`).join('')}</div></div>`;
  $('#hcm', v).innerHTML = [['', '全部分类']].concat(J.categories.filter(c => cnt[c.key]).map(c => [c.key, short(c.key)])).map(c => `<button class="chip${(S.h.cat || '') === c[0] ? ' on' : ''}" data-a="hcat" data-c="${c[0]}">${c[0] ? cic(c[0]) : ''}${c[1]}${c[0] ? ` <span class="num">${cnt[c[0]]}</span>` : ''}</button>`).join('');
  updBatch();
  if (keep) main.scrollTop = sc;
}
function hChunk(k) {
  const L = S.hl, a = S.hn, b = Math.min(L.length, a + k), hl = $('#hl'), q = S.h.q.trim();
  if (a >= b) return;
  let i = a, cont = '', html = '';
  while (i < b && L[i].date === S.hlast) cont += rowH(L[i++], 1, q);
  if (cont) $('.rows', hl.lastElementChild).insertAdjacentHTML('beforeend', cont);
  while (i < b) {
    const d = L[i].date, t = S.hday[d]; let rows = '';
    while (i < b && L[i].date === d) rows += rowH(L[i++], 1, q);
    html += `<div class="day"><div class="dh"><b>${J.dateLabel(d)}</b><span class="m">${d.slice(5).replace('-', '.')} ${J.weekday(d)}</span><span class="sum"><span>${t.n} 笔</span>${t.e ? `<span>−${F(t.e)}</span>` : ''}${t.i ? `<span class="in">+${F(t.i)}</span>` : ''}</span></div><div class="rows">${rows}</div></div>`;
    S.hlast = d;
  }
  if (html) hl.insertAdjacentHTML('beforeend', html);
  S.hn = b;
  const m = $('#hmore'); m.textContent = S.hn < L.length ? `已载入 ${S.hn} / ${L.length} · 继续下滑` : (L.length ? `— END OF LOG · 共 ${L.length} 笔 —` : '');
  if (S.hn < L.length && io) { io.unobserve(m); io.observe(m); }
}
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { es.forEach(e => { if (e.isIntersecting && S.route === 'history') hChunk(60); }); }, { root: main, rootMargin: '0px 0px 700px 0px' }) : null;
function updBatch() {
  const b = $('#batch'), hl = $('#hl'); if (!b) return;
  const ids = [...S.sel], recs = J.records.filter(r => S.sel.has(r.id)), sum = recs.reduce((s, r) => s + (r.type === 'expense' ? -r.amount : r.amount), 0);
  b.classList.toggle('on', ids.length > 0); hl.classList.toggle('selm', ids.length > 0);
  b.innerHTML = ids.length ? `<span>已选 <b class="num">${ids.length}</b> 笔</span><span class="num">合计 ${sum < 0 ? '−' : '+'}¥${F(Math.abs(sum))}</span><span class="sp"></span><button data-a="bclr">取消</button><button class="bd" data-a="bdel">${ic('trash', 's')} 删除</button>` : '';
}
function delRecs(ids) {
  const els = ids.map(id => $(`.hrow[data-id="${id}"]`)).filter(Boolean);
  els.forEach(e => e.classList.add('out'));
  setTimeout(() => {
    const recs = ids.map(removeRec).filter(Boolean);
    recs.forEach(r => S.trash.unshift(r)); S.sel.clear(); dirty('history'); hRefresh(true);
    toast(`已删除 ${recs.length} 笔 · 可在回收站找回`, () => { recs.forEach(r => { insertRec(r); const i = S.trash.indexOf(r); if (i >= 0) S.trash.splice(i, 1); }); dirty(); render(S.route); });
  }, RM ? 0 : 220);
}

/* ---------- stats ---------- */
const arcD = (r, a0, a1) => { const P = a => { const t = a * Math.PI / 180; return (120 + r * Math.cos(t)).toFixed(2) + ' ' + (120 + r * Math.sin(t)).toFixed(2); }; return `M${P(a0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${P(a1)}`; };
function ringSvg(l) {
  let s = '', a = -90;
  for (let k = 0; k < 60; k++) { const t = k * 6 * Math.PI / 180, r1 = k % 5 ? 113 : 110; s += `<path class="bz" d="M${(120 + r1 * Math.cos(t)).toFixed(1)} ${(120 + r1 * Math.sin(t)).toFixed(1)}L${(120 + 116 * Math.cos(t)).toFixed(1)} ${(120 + 116 * Math.sin(t)).toFixed(1)}"/>`; }
  l.forEach((c, i) => { const sw = c.share * 360, g = l.length > 1 ? 1.4 : 0, a0 = a + g / 2, a1 = Math.min(a + sw - g / 2, a0 + 359.9); if (a1 > a0 + .3) s += `<path class="sg${i === S.ri ? ' on' : ''}" data-a="seg" data-i="${i}" d="${arcD(96, a0, a1)}" style="opacity:${i === S.ri ? 1 : Math.max(.24, 1 - i * .13).toFixed(2)}"/>`; a += sw; });
  return `<svg class="ring" viewBox="0 0 240 240" aria-hidden="true"><circle class="ot" cx="120" cy="120" r="82"/>${s}</svg>`;
}
const ringC = (c, n) => c ? `${lb(p2(S.ri + 1) + ' / ' + p2(n) + ' ', 'RANK')}<span class="nm">${c.name}</span><span class="v">¥${F(c.total)}</span><span class="p">${(c.share * 100).toFixed(1)}% · ${c.count} 笔</span>` : '<span class="nm">本月无支出</span>';
function ringModH() {
  const l = J.byCategory(S.ym, S.level); S.rl = l; if (S.ri >= l.length) S.ri = 0;
  const mx = l[0] ? l[0].share : 1, top = l.slice(0, 8), rest = l.slice(8), rs = rest.reduce((s, x) => s + x.total, 0);
  return mh('S-02', '分类构成', 'COMPOSITION · ' + l.length + ' CH', seg('s-lvl', 'lvl', [['main', '一级'], ['sub', '二级']], S.level)) +
    `<div class="ringw"><div class="ringbox">${ringSvg(l)}<div class="ringc" id="ringc">${ringC(l[S.ri], l.length)}</div></div><div class="rk">${top.map((c, i) => `<button class="rkr${i === S.ri ? ' on' : ''}" data-a="drill" data-c="${c.categoryKey}" data-s="${S.level === 'sub' ? c.key : ''}" data-i="${i}" data-src="统计"><span class="n0">${p2(i + 1)}</span><span class="pict">${cic(c.categoryKey)}</span><span class="nm"><span>${c.name}</span><i style="--s:${(c.share / mx).toFixed(3)}"></i></span><span class="a">¥${F(c.total)}</span><span class="p">${(c.share * 100).toFixed(1)}%</span>${ic('r', 's go')}</button>`).join('')}${rest.length ? `<div class="rkr rest"><span class="n0">··</span><span></span><span class="nm"><span>其余 ${rest.length} 项</span></span><span class="a">¥${F(rs)}</span><span class="p">${(rest.reduce((s, x) => s + x.share, 0) * 100).toFixed(1)}%</span><span></span></div>` : ''}${!l.length ? '<div class="empty-s">这个月还没有支出</div>' : ''}</div></div>`;
}
function oscH(ym) {
  const d = J.daily(ym), n = d.length, cnt = {};
  J.inMonth(ym, 'expense').forEach(r => { cnt[r.date] = (cnt[r.date] || 0) + 1; });
  const v = d.map(x => x.total).sort((a, b) => b - a);
  let cap = v[0] || 100; if (v[1] && v[0] > v[1] * 2.4) cap = v[1] * 1.3;
  const p = Math.pow(10, Math.floor(Math.log10(cap))) / 2; cap = Math.ceil(cap / p) * p;
  const bl = 8000 / n, ti = d.findIndex(x => x.date === TODAY), mi = d.findIndex(x => x.total === v[0]);
  S.osc = { d, n, cnt, i: ti >= 0 ? ti : mi };
  const bars = d.map((x, i) => `<div class="b${x.future ? ' fu' : ''}${x.date === TODAY ? ' td' : ''}${x.total > cap ? ' ov' : ''}"><i style="height:${x.future ? 100 : Math.max(x.total ? 1.5 : 0, Math.min(100, x.total / cap * 100)).toFixed(1)}%"></i></div>`).join('');
  const ovt = d.map((x, i) => x.total > cap ? `<span class="ovt" style="left:${((i + .5) / n * 100).toFixed(2)}%">↑${kf(x.total)}</span>` : '').join('');
  const xl = [1, 5, 10, 15, 20, 25, n].map(k => `<span class="${k === 1 ? 'first' : k === n ? 'last' : ''}" style="left:${((k - .5) / n * 100).toFixed(2)}%">${p2(k)}</span>`).join('');
  return `<div class="osc" id="osc"><span class="yl" style="top:4px">${kf(cap)}</span><span class="yl mid" style="top:50%">${kf(cap / 2)}</span><div class="pl">${bl < cap ? `<div class="bl" style="bottom:${(bl / cap * 100).toFixed(1)}%"><span>日均预算 ${F(bl, { decimals: 0 })}</span></div>` : ''}<div class="bars">${bars}</div>${ovt}<div class="xh" id="xh"><div class="rd"></div></div></div><div class="xl">${xl}</div></div>`;
}
function oscSet(i) {
  const o = S.osc, xh = $('#xh'); if (!o || !xh) return;
  i = Math.max(0, Math.min(o.n - 1, i)); o.i = i; const x = o.d[i];
  xh.style.transform = `translateX(${((i + .5) / o.n * 100).toFixed(2)}%)`;
  xh.classList.toggle('l', i > o.n * .62);
  $('.rd', xh).innerHTML = `${mN(x.date)}月${+x.date.slice(8)}日 ${J.weekday(x.date)}<b>${x.future ? '未到 · —' : '¥' + F(x.total)}</b>${x.future ? 'NOT YET' : (o.cnt[x.date] || 0) + ' 笔' + (x.date === TODAY ? ' · 今天' : '')}`;
  $$('#osc .b').forEach((b, k) => b.classList.toggle('hi', k === i));
}
function sixH() {
  const m = J.monthly(), mx = Math.max(...m.map(x => Math.max(x.expense, x.income))) || 1, te = m.reduce((s, x) => s + x.expense, 0), tn = m.reduce((s, x) => s + x.income, 0);
  return mh('S-04', '近六个月', '6-MONTH · OUT / IN') + `<div class="pairs">${m.map(x => `<button class="pr${x.month === S.ym ? ' on' : ''}" data-a="mgo" data-v="${x.month}" aria-label="${x.label} 支出 ${F(x.expense)} 收入 ${F(x.income)}"><span class="bb"><i class="e" style="height:${(x.expense / mx * 100).toFixed(1)}%"><span class="tv">${kf(x.expense)}</span></i><i class="n" style="height:${(x.income / mx * 100).toFixed(1)}%"></i></span><span class="ml">${x.label}</span></button>`).join('')}</div><div class="legend"><span><i class="le"></i>支出 OUT</span><span><i class="ln"></i>收入 IN</span></div><div class="ros six">${ro('六月累计支出', 'Σ OUT', te)}${ro('累计收入', 'Σ IN', tn, 'inc')}</div>`;
}
const totH = () => { const t = J.totals(S.ym), d = J.daily(S.ym), past = d.filter(x => !x.future), mxd = past.reduce((m, x) => x.total > m.total ? x : m, past[0] || d[0]); return mh('S-01', '收支总览', 'TOTALS', monSw()) + `${lb('支出', 'EXPENSE')}<div class="amt-hero num">${money(t.expense)}</div><div class="ros">${ro('收入', 'INCOME', t.income, 'inc')}${ro('结余', 'BALANCE', t.balance)}</div><div class="kv"><span>日均支出</span><span class="num">¥${F(t.expense / Math.max(1, past.length))}</span></div><div class="kv"><span>最高单日 · ${J.dateLabel(mxd.date)}</span><span class="num">¥${F(mxd.total)}</span></div><div class="kv"><span>记账笔数</span><span class="num">${t.count} 笔</span></div>`; };
const oscMod = () => mh('S-03', '每日走势', 'DAILY · OSCILLOSCOPE', `<span class="lb">${desk() ? '悬停读数' : '点按读数'}</span>`) + oscH(S.ym);
function statsH() {
  return mhead('stats') + `<div class="grid">
<article class="mod s-4 tot" id="s-tot">${totH()}</article>
<article class="mod s-8" id="s-ring">${ringModH()}</article>
<article class="mod s-8" id="s-osc">${oscMod()}</article>
<article class="mod s-4" id="s-6m">${sixH()}</article></div>`;
}
function statsMonth(lvlOnly) {
  const v = V.stats;
  if (!lvlOnly) { swap($('#s-tot', v), totH()); $('#s-osc', v).innerHTML = oscMod(); oscSet(S.osc.i); fade($('#s-osc', v)); $('#s-6m', v).innerHTML = sixH(); }
  S.ri = 0; $('#s-ring', v).innerHTML = ringModH(); fade($('.ringw', v));
}
function ringSel(i) {
  if (i === S.ri || !S.rl[i]) return; S.ri = i; const box = $('#s-ring');
  $$('.sg', box).forEach(p => { const on = +p.dataset.i === i; p.classList.toggle('on', on); p.style.opacity = on ? 1 : Math.max(.24, 1 - p.dataset.i * .13).toFixed(2); });
  $$('.rkr', box).forEach(p => p.classList.toggle('on', +p.dataset.i === i));
  $('#ringc').innerHTML = ringC(S.rl[i], S.rl.length);
}

/* ---------- more ---------- */
function recH() {
  const mo = J.recurring.filter(x => x.enabled && x.cycle.startsWith('每月')).reduce((s, x) => s + x.amount, 0);
  return mh('P-01', '周期账单', 'RECURRING', `<span class="lb">每月固定 <b class="num">¥${F(mo)}</b></span>`) + J.recurring.map(x => `<div class="rec${x.enabled ? '' : ' off'}"><span class="pict">${cic(x.categoryKey)}</span><div class="tt"><b>${x.name}</b><span>${x.cycle} · 下次 ${J.dateLabel(x.next)}${x.next.slice(0, 4) !== '2026' ? ' ' + x.next.slice(0, 4) : ''}</span></div><span class="num">¥${F(x.amount)}</span><button class="tg${x.enabled ? ' on' : ''}" data-a="recTg" data-id="${x.id}" role="switch" aria-checked="${x.enabled}" aria-label="启用 ${x.name}"></button><button class="mini" data-a="recNow" data-id="${x.id}" ${x.enabled ? '' : 'disabled'}>立即记录</button></div>`).join('');
}
function trashH() {
  return S.trash.length ? `<div class="rows trash">${S.trash.slice(0, 3).map(r => `<div class="row"><div class="rw"><span class="pict">${cic(r.categoryKey)}</span><span class="tx"><b>${r.subcategoryName}</b><i>${J.dateLabel(r.date)} ${r.time}</i></span><span class="amt">−${F(r.amount)}</span><button class="ib" data-a="restore" data-id="${r.id}" aria-label="恢复">${ic('restore', 's')}</button></div></div>`).join('')}</div>` : '<p>回收站是空的。删除的记录会在这里保留 30 天。</p>';
}
function moreH() {
  const tile = (id, k, t, en, body, acts) => `<article class="mod tile" id="${id}"><span class="ic0">${ic(k)}</span><span class="lb">${en}</span><b>${t}</b>${body}<div class="acts0">${acts || ''}</div></article>`;
  return mhead('more') + `<div class="grid mg0">
<article class="mod s-7" id="mo-rec">${recH()}</article>
<article class="mod s-5" id="mo-todo">${todoH(true)}</article>
<article class="mod s-4 syncm" id="mo-sync">${mh('P-03', '云同步', 'UPLINK · 2 DEVICES')}${syncBody()}<div class="kv"><span>本机 · Windows</span><span class="tag ac">在线</span></div><div class="kv"><span>阿念的手机 · Android</span><span class="tag">2 分钟前</span></div><div class="kv"><span>自动同步</span><button class="tg on" data-a="tgl" role="switch" aria-checked="true" aria-label="自动同步"></button></div></article>
<div class="s-8 tiles">
${tile('mo-cat', 'tag', '分类管理', 'CATEGORIES', `<p>11 个一级分类 · ${J.categories.reduce((s, c) => s + c.subs.length, 0)} 个二级分类</p><div class="pv">${J.categories.map(c => cic(c.key)).join('')}</div>${S.catOpen ? `<div class="cgrid">${J.categories.map(c => `<div><b>${c.name}</b><span>${c.subs.map(s => s.name).join(' · ')}</span></div>`).join('')}</div>` : ''}`, `<button class="mini" data-a="catm">${S.catOpen ? '收起' : '查看与编辑'}</button>`)}
${tile('mo-trash', 'trash', '回收站', 'TRASH · ' + S.trash.length, trashH(), S.trash.length ? `<button class="mini" data-a="restoreAll">全部恢复</button>` : '')}
${tile('mo-exp', 'exp', '导出数据', 'EXPORT', `<p>导出全部 ${J.records.length} 笔账单，含分类、成员与备注。</p>`, `<button class="mini" data-a="exp" data-v="xlsx">Excel</button><button class="mini" data-a="exp" data-v="csv">CSV</button>`)}
${tile('mo-bak', 'db', '备份与恢复', 'BACKUP', `<p>上次备份 11月1日 09:12 · 本地加密文件</p>`, `<button class="mini" data-a="bak" data-v="b">立即备份</button><button class="mini" data-a="bak" data-v="r">从文件恢复</button>`)}
${tile('mo-theme', 'theme', '外观 · 暗色模式', 'APPEARANCE', `<p>夜航为深色仪表，日间为纸灰面板。</p>`, seg('m-tm', 'tm', [['auto', '跟随系统'], ['light', '日间'], ['dark', '夜航']], S.tm))}
${tile('mo-key', 'kb', '快捷键', 'SHORTCUTS', `<div class="kcap"><span>随时记一笔</span><span class="kbd">Ctrl+Shift+N</span></div><div class="kcap"><span>保存 / 清空</span><span class="kbd">Enter · Esc</span></div><div class="kcap"><span>搜索账单</span><span class="kbd">/</span></div>`, '')}
</div></div>`;
}

/* ---------- toast ---------- */
let TT = 0, TI = 0;
function toast(msg, undo) {
  const el = $('#toast'); clearTimeout(TT); clearInterval(TI);
  S.undo = undo || null;
  el.innerHTML = `<i class="ok"></i><span class="msg">${msg}</span>${undo ? `<button class="ud" data-a="undo"><span class="cd"><svg viewBox="0 0 24 24" aria-hidden="true"><circle class="t" cx="12" cy="12" r="10"/><circle class="p" cx="12" cy="12" r="10"/></svg><span id="cdn">5</span></span>撤销</button>` : ''}`;
  el.classList.remove('on'); requestAnimationFrame(() => el.classList.add('on'));
  if (undo) { let n = 5; TI = setInterval(() => { n--; const c = $('#cdn'); if (c) c.textContent = Math.max(n, 0); if (n <= 0) clearInterval(TI); }, 1000); }
  TT = setTimeout(() => { el.classList.remove('on'); S.undo = null; }, undo ? 5000 : 2600);
}

/* ---------- theme & sync ---------- */
function setTheme(t, fx) {
  if (fx && !RM) { const f = $('#flash'); f.classList.remove('go'); requestAnimationFrame(() => { R.dataset.theme = t; f.classList.add('go'); }); } else R.dataset.theme = t;
}
const sysTheme = () => matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (S.tm === 'auto') setTheme(sysTheme(), 1); });
function setSync(st) { S.sync = st; $$('[data-sync]').forEach(el => { el.dataset.sync = st; const t = $('.stt', el); if (t) t.textContent = syncTxt(!!el.closest('.mhead')); }); }
function doSync() {
  if (S.sync === 'busy') return; setSync('busy');
  setTimeout(() => { S.syncAt = Date.now(); setSync('ok'); blink(); toast('云同步完成 · 2 台设备数据一致'); }, 1600);
}

/* ---------- shell ---------- */
const NAV = [['home', 'home', '首页'], ['add', 'add', '记账'], ['history', 'log', '账单'], ['stats', 'stats', '统计']];
$('#railMain').innerHTML = NAV.map(n => `<a class="ri" href="#${n[0]}" data-r="${n[0]}" aria-label="${n[2]}">${ic(n[1])}<span>${n[2]}</span></a>`).join('');
$('#railSys').innerHTML = [['more/rec', 'cyc', '周期'], ['more/todo', 'todo', '待办'], ['more', 'more', '更多']].map(n => `<a class="ri" href="#${n[0]}" data-r="${n[0]}" aria-label="${n[2]}">${ic(n[1])}<span>${n[2]}</span></a>`).join('');
$('#railEnd').innerHTML = `<button class="ri sm" data-a="theme" aria-label="切换日间 / 夜航">${ic('theme')}</button>`;
$('#tabs').innerHTML = [['home', 'home', '首页'], ['history', 'log', '账单'], ['add', 'add', '记一笔'], ['stats', 'stats', '统计'], ['more', 'more', '更多']].map(n => n[0] === 'add' ? `<a class="tb fab" href="#add" data-r="add" aria-label="记一笔"><span class="k">${ic('add')}</span></a>` : `<a class="tb" href="#${n[0]}" data-r="${n[0]}">${ic(n[1])}<span>${n[2]}</span></a>`).join('');
$('#bar').innerHTML = `<div class="crumb"><span class="m" id="cr-n">01</span><b id="cr-t">总览</b><span class="m" id="cr-e">OVERVIEW</span></div><div class="clock"><span>${TODAY} ${J.weekday(TODAY)}</span><i class="sep"></i><b id="clk">${clk()}</b><i class="sep"></i><span>LOCAL</span></div><div class="bar-r">${syncChip(0)}${themeBtn()}<button class="cta" data-a="go" data-r="add">${ic('add', 's')}记一笔<span class="kbd">Ctrl⇧N</span></button></div>`;
let ticks = 0;
setInterval(() => { if (desk()) $('#clk').textContent = clk(); if (++ticks % 20 === 0 && S.sync === 'ok') setSync('ok'); }, 1000);

const H = { home: homeH, add: addH, history: histH, stats: statsH, more: moreH };
function render(r) {
  V[r].innerHTML = H[r](); S.dirty[r] = false;
  if (r === 'history') hRefresh();
  if (r === 'stats') oscSet(S.osc.i);
}
let idleT = 0;
function idle() {
  clearTimeout(idleT);
  idleT = setTimeout(function step() {
    const r = ROUTES.find(x => x !== S.route && S.dirty[x]);
    if (!r) return; render(r); idleT = setTimeout(step, 60);
  }, 400);
}
function navSet(r, sub) {
  const key = sub && r === 'more' && (sub === 'rec' || sub === 'todo') ? 'more/' + sub : r;
  $$('[data-r]').forEach(a => { if (a.matches('.ri,.tb')) { const on = a.dataset.r === key; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); } });
  const t = TITLES[r]; $('#cr-n').textContent = t[2]; $('#cr-t').textContent = t[0]; $('#cr-e').textContent = t[1];
  D.title = t[0] + ' · 计序';
}
function power(v) {
  if (RM) { v.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140 }); return; }
  $$(desk() ? '.mod' : '.mhead,.mod', v).filter(m => !m.closest('.tiles') || m.matches('.tile')).slice(0, 12).forEach((m, i) => m.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: .9, offset: .45 }, { opacity: .55, offset: .6 }, { opacity: 1, transform: 'translateY(0)' }], { duration: 340, delay: Math.min(i, 7) * 30, easing: 'cubic-bezier(.2,.7,.1,1)', fill: 'backwards' }));
}
function show(r, sub) {
  const v = V[r];
  if (S.dirty[r] || !v.firstChild) render(r);
  if (S.route !== r) {
    if (S.route) V[S.route].classList.remove('on');
    S.prev = S.route || 'home'; S.route = r; R.dataset.route = r;
    v.classList.add('on'); main.scrollTop = 0; power(v);
    if (r === 'history') { const m = $('#hmore'); if (io && m) { io.unobserve(m); io.observe(m); } }
  }
  navSet(r, sub);
  if (sub) {
    const t = $({ rec: '#mo-rec', todo: '#mo-todo', cat: '#mo-cat', sync: '#mo-sync' }[sub] || '#x', v);
    if (t) { if (sub === 'cat' && !S.catOpen) { S.catOpen = true; render('more'); return show(r, null); } t.scrollIntoView({ block: 'start' }); main.scrollTop -= 16; if (!RM) t.animate([{ outlineColor: 'transparent' }, { outlineColor: 'var(--ac)' }, { outlineColor: 'transparent' }], { duration: 0 }); t.classList.add('ping'); setTimeout(() => t.classList.remove('ping'), 900); }
  }
}
const parse = () => { const h = location.hash.slice(1).split('/'); return [ROUTES.includes(h[0]) ? h[0] : 'home', h[1]]; };
function go(r) { const p = r.split('/'); if (location.hash !== '#' + r) history.pushState(null, '', '#' + r); show(ROUTES.includes(p[0]) ? p[0] : 'home', p[1]); }
addEventListener('popstate', () => { const p = parse(); show(p[0], p[1]); });
addEventListener('hashchange', () => { const p = parse(); show(p[0], p[1]); });
window.demo = { go };

function setMonth(ym) {
  if (ym === S.ym || !J.MONTHS.includes(ym)) return; S.ym = ym;
  if (S.route === 'home') homeMonth(); else if (S.route === 'stats') statsMonth();
  ROUTES.forEach(r => { if (r !== S.route && (r === 'home' || r === 'stats')) S.dirty[r] = true; });
  $$('.mon', V[S.route]).forEach(m => { const i = J.MONTHS.indexOf(ym); m.querySelectorAll('button')[0].disabled = i <= 0; m.querySelectorAll('button')[1].disabled = i >= J.MONTHS.length - 1; });
  idle();
}
function drill(cat, sub, src) {
  S.h = { ym: S.ym, type: 'expense', cat, sub: sub || null, q: '', from: `来自${src || '统计'} · ${sub ? J.subName(cat, sub) : J.cat[cat].name} · ${mN(S.ym)}月` };
  S.sel.clear(); S.dirty.history = true; go('history');
}
function editRec(id) {
  const r = J.records.find(x => x.id === id); if (!r) return;
  S.a = fresh({ type: r.type, expr: String(r.amount), cat: r.categoryKey, sub: r.subcategoryKey, date: r.date, time: r.time, note: r.note, person: r.person, photo: r.photo, edit: r.id });
  S.calYm = r.date.slice(0, 7); S.dirty.add = true; go('add');
}

/* ---------- events ---------- */
D.addEventListener('click', e => {
  const nav = e.target.closest('a[data-r]');
  if (nav) { e.preventDefault(); go(nav.dataset.r); return; }
  if (!e.target.closest('.hrow.open')) $$('.hrow.open').forEach(closeSw);
  const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
  const a = b.dataset.a, d = b.dataset, row = b.closest('[data-id]'), rid = row && row.dataset.id;
  switch (a) {
    case 'go': go(d.r); break;
    case 'back': go(S.prev && S.prev !== 'add' ? S.prev : 'home'); break;
    case 'theme': S.tm = R.dataset.theme === 'dark' ? 'light' : 'dark'; setTheme(S.tm, 1); segSet($('#m-tm'), S.tm); break;
    case 'tm': S.tm = d.v; segSet($('#m-tm'), d.v); setTheme(d.v === 'auto' ? sysTheme() : d.v, 1); break;
    case 'sync': doSync(); break;
    case 'mon': setMonth(J.MONTHS[J.MONTHS.indexOf(S.ym) + +d.d]); break;
    case 'mgo': setMonth(d.v); $$('#s-6m .pr').forEach(p => p.classList.toggle('on', p.dataset.v === d.v)); break;
    case 'k': keyFx(d.k); if (d.k === 'ok') save(); else input(d.k); break;
    case 'save': b.classList.add('dn'); setTimeout(() => b.classList.remove('dn'), 110); save(); break;
    case 'type': if (S.a.type !== d.v) { S.a.type = d.v; S.a.cat = null; S.a.sub = null; updAdd(['type', 'cat']); flashLcd(); } break;
    case 'cat': S.a.cat = d.c; S.a.sub = J.cat[d.c].subs[0].key; if (S.aerr === 'cat') setErr(''); updAdd(['cat']); flashLcd(); break;
    case 'fav': S.a.cat = d.c; S.a.sub = d.s; if (S.aerr === 'cat') setErr(''); updAdd(['cat']); flashLcd(); break;
    case 'sub': S.a.sub = d.s; updAdd(['cat']); break;
    case 'date': if (d.v === 'p') { S.cal = !S.cal; S.calYm = S.a.date.slice(0, 7); } else { S.a.date = d.v === 't' ? TODAY : YDAY; S.cal = false; } updAdd(['f']); break;
    case 'cald': S.a.date = d.v; S.cal = false; updAdd(['f']); break;
    case 'calm': S.calYm = J.MONTHS[J.MONTHS.indexOf(S.calYm) + +d.d]; $('#a-f .cal').innerHTML = calH(); break;
    case 'per': S.a.person = d.v; segSet($('#a-per'), d.v); updLcd(); break;
    case 'photo': if (!S.a.photo) { S.a.photo = true; updAdd(['f']); } break;
    case 'photox': S.a.photo = false; updAdd(['f']); break;
    case 'undo': if (S.undo) { const u = S.undo; S.undo = null; u(); $('#toast').classList.remove('on'); clearInterval(TI); } break;
    case 'todo': { const t = J.todos.find(x => x.id === d.id); t.done = !t.done; t._tog = true; const el = b.closest('.td'); el.classList.toggle('done', t.done); b.setAttribute('aria-checked', t.done); $('.chk', b).classList.toggle('on', t.done); dirty(S.route); setTimeout(() => { const host = b.closest('#m-todo,#mo-todo'); if (host) host.innerHTML = todoH(host.id === 'mo-todo'); }, 600); break; }
    case 'todoRec': { const t = J.todos.find(x => x.id === d.id); S.a = fresh({ expr: String(t.amount), cat: t.categoryKey, sub: J.cat[t.categoryKey].subs[0].key, note: t.title }); S.dirty.add = true; go('add'); break; }
    case 'recTg': { const x = J.recurring.find(y => y.id === d.id); x.enabled = !x.enabled; $('#mo-rec').innerHTML = recH(); dirty('more'); break; }
    case 'recNow': { const x = J.recurring.find(y => y.id === d.id), r = makeRec({ type: 'expense', amount: x.amount, cat: x.categoryKey, sub: x.subcategoryKey, note: x.name + ' · 周期', date: TODAY, time: clk().slice(0, 5) }); insertRec(r); dirty(); blink(); toast(`已记录 ${x.name} <span class="num">−¥${F(x.amount)}</span>`, () => { removeRec(r.id); dirty(); }); break; }
    case 'htype': S.h.type = d.v; segSet($('#h-type'), d.v); hRefresh(); break;
    case 'hym': S.h.ym = d.v; S.h.from = ''; $$('.hym .chip').forEach(c => c.classList.toggle('on', c.dataset.v === d.v)); hRefresh(); break;
    case 'hcat': S.h.cat = d.c || null; S.h.sub = null; S.h.from = ''; hRefresh(); break;
    case 'fromx': S.h.cat = null; S.h.sub = null; S.h.from = ''; hRefresh(); break;
    case 'qx': S.h.q = ''; $('#hq').value = ''; $('.search').classList.remove('has'); hRefresh(); $('#hq').focus(); break;
    case 'hclr': S.h = { ym: 'all', type: 'all', cat: null, sub: null, q: '', from: '' }; render('history'); break;
    case 'sel': { if (S.sel.has(rid)) S.sel.delete(rid); else S.sel.add(rid); row.classList.toggle('on', S.sel.has(rid)); updBatch(); break; }
    case 'bclr': S.sel.clear(); $$('.hrow.on').forEach(r => r.classList.remove('on')); updBatch(); break;
    case 'bdel': delRecs([...S.sel]); break;
    case 'edit': editRec(rid); break;
    case 'del': delRecs([rid]); break;
    case 'lvl': if (S.level !== d.v) { S.level = d.v; segSet($('#s-lvl'), d.v); statsMonth(1); } break;
    case 'seg': if (desk()) { const c = S.rl[+d.i]; drill(c.categoryKey, S.level === 'sub' ? c.key : '', '统计'); } else ringSel(+d.i); break;
    case 'drill': drill(d.c, d.s, d.src); break;
    case 'restore': { const i = S.trash.findIndex(r => r.id === d.id); if (i >= 0) { const r = S.trash.splice(i, 1)[0]; insertRec(r); dirty('more'); $('#mo-trash').outerHTML = $('#mo-trash', D.createRange().createContextualFragment(moreH())).outerHTML; toast(`已恢复 ${r.subcategoryName} <span class="num">¥${F(r.amount)}</span>`); } break; }
    case 'restoreAll': S.trash.splice(0).forEach(insertRec); dirty(); render('more'); toast('回收站已全部恢复'); break;
    case 'catm': S.catOpen = !S.catOpen; render('more'); break;
    case 'exp': toast(`已导出 计序_全部账单.${d.v} · ${J.records.length} 笔`); break;
    case 'bak': toast(d.v === 'b' ? '备份完成 · 计序_备份_20261105.jxb' : '请选择备份文件 · 恢复前会自动备份当前数据'); break;
    case 'tgl': b.classList.toggle('on'); b.setAttribute('aria-checked', b.classList.contains('on')); break;
  }
});
D.addEventListener('pointerover', e => {
  if (S.route !== 'stats' || e.pointerType === 'touch') return;
  const t = e.target.closest('.sg,.rkr[data-i]'); if (t) ringSel(+t.dataset.i);
});
let oscRect = null;
let oscActT = 0;
function oscPt(e) {
  const pl = e.target.closest('#osc .pl'); if (!pl || !S.osc) return;
  const r = oscRect || (oscRect = pl.getBoundingClientRect());
  oscSet(Math.floor((e.clientX - r.left) / r.width * S.osc.n));
  const el = $('#osc');
  if (el) { el.classList.add('act'); clearTimeout(oscActT); oscActT = setTimeout(() => el.classList.remove('act'), e.pointerType === 'mouse' ? 400 : 2600); }
}
D.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') oscPt(e); });
D.addEventListener('pointerdown', e => { oscRect = null; oscPt(e); });
main.addEventListener('scroll', () => { oscRect = null; }, { passive: true });
addEventListener('resize', () => { oscRect = null; });
D.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'hq') { S.h.q = t.value; S.h.from = S.h.from && ''; t.parentNode.classList.toggle('has', !!t.value); cancelAnimationFrame(hq); hq = requestAnimationFrame(() => hRefresh()); }
  else if (t.id === 'a-note') S.a.note = t.value;
  else if (t.id === 'a-time') { S.a.time = t.value || S.a.time; updLcd(); }
});
let hq = 0;
D.addEventListener('keydown', e => {
  const t = e.target, txt = t.tagName === 'INPUT';
  if (e.ctrlKey && e.shiftKey && (e.key === 'N' || e.key === 'n')) { e.preventDefault(); go('add'); return; }
  if (S.route === 'history' && e.key === '/' && !txt) { e.preventDefault(); $('#hq').focus(); return; }
  if (S.route !== 'add' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Enter' && !e.isComposing) { if (t.tagName === 'BUTTON' && t.dataset.a !== 'save' && t.dataset.a !== 'k') return; e.preventDefault(); keyFx('ok'); save(); return; }
  if (e.key === 'Escape') { if (S.cal) { S.cal = false; updAdd(['f']); return; } keyFx('c'); input('c'); return; }
  if (txt) return;
  if (/^[0-9.+]$/.test(e.key)) { e.preventDefault(); input(e.key); keyFx(e.key); }
  else if (e.key === 'Backspace') { e.preventDefault(); input('bs'); keyFx('bs'); }
});

/* mobile swipe-to-reveal on history rows */
let sw = null;
const closeSw = r => { r.classList.remove('open'); $('.rw', r).style.transform = ''; };
main.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' || S.route !== 'history') return;
  const rw = e.target.closest('.hrow .rw'); if (!rw || e.target.closest('.sw')) return;
  const row = rw.parentNode; sw = { rw, row, x: e.clientX, y: e.clientY, dx: 0, on: false, base: row.classList.contains('open') ? -136 : 0 };
}, { passive: true });
main.addEventListener('pointermove', e => {
  if (!sw) return; const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (!sw.on) { if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { sw.on = true; sw.rw.style.transition = 'none'; $$('.hrow.open').forEach(r => { if (r !== sw.row) closeSw(r); }); } else if (Math.abs(dy) > 8) { sw = null; return; } }
  if (sw.on) { sw.dx = dx; sw.rw.style.transform = `translateX(${Math.min(0, Math.max(-176, sw.base + dx))}px)`; }
}, { passive: true });
const swEnd = () => { if (sw && sw.on) { const open = sw.base + sw.dx < -56; sw.rw.style.transition = ''; sw.row.classList.toggle('open', open); sw.rw.style.transform = open ? 'translateX(-136px)' : ''; } sw = null; };
main.addEventListener('pointerup', swEnd); main.addEventListener('pointercancel', swEnd);

/* ---------- boot ---------- */
const first = parse();
show(first[0], first[1]);
if (first[0] === 'home' && !RM) {
  const v = V.home;
  $$('.amt-hero .roll, .dialc .roll', v).forEach(el => rset(el, el.dataset.v, ''));
  const n = $('.ndl', v), t = n.style.transform; n.style.transform = 'rotate(135deg)'; raf2(() => { n.style.transform = t; });
}
const pre = new Promise(res => {
  const list = ROUTES.filter(r => r !== S.route);
  (function step() { const r = list.shift(); if (!r) return res(); if (!V[r].firstChild) render(r); setTimeout(step, 16); })();
});
Promise.all([D.fonts.ready, pre, new Promise(r => setTimeout(r, 720))]).then(() => { R.dataset.ready = '1'; });
})();
