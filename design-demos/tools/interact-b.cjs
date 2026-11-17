/* B 版交互回归：筛选 / 搜索 / 下钻 / 左滑 / 记账撤销 / 主题 */
const puppeteer = require('D:/tmp/jixu-fonts/node_modules/puppeteer-core');
const URL = 'file:///D:/CodexDemo/JiXu/design-demos/b-instrument/index.html?theme=light';
const P = (sel) => sel;

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await p.goto(URL + '#history');
  await p.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await new Promise((r) => setTimeout(r, 400));

  const q = (fn) => p.evaluate(fn);
  const log = [];
  const rows = () => q(() => document.querySelectorAll('#hl .hrow').length);
  log.push('初始行数 ' + await rows());

  // 1 类型筛选
  await q(() => [...document.querySelectorAll('#h-type button')].find(b=>b.textContent.trim()==='收入').click());
  await new Promise((r) => setTimeout(r, 400));
  log.push('切收入后行数 ' + await rows());
  await q(() => [...document.querySelectorAll('#h-type button')].find(b=>b.textContent.trim()==='全部').click());
  await new Promise((r) => setTimeout(r, 400));

  // 2 月份筛选
  await q(() => document.querySelector('.chips.hym .chip:nth-child(7)').click());
  await new Promise((r) => setTimeout(r, 400));
  log.push('切月份后行数 ' + await rows() + ' / 计数 ' + await q(() => document.querySelector('#hcount').textContent));

  // 3 搜索
  await q(() => { const i = document.querySelector('#hq'); i.value = '猫'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await new Promise((r) => setTimeout(r, 500));
  log.push('搜「猫」后行数 ' + await rows() + ' 高亮 ' + await q(() => document.querySelectorAll('#hl mark').length));

  // 4 清除
  await q(() => document.querySelector('#hq').closest('.search').querySelector('.x').click());
  await new Promise((r) => setTimeout(r, 400));
  log.push('清除搜索后行数 ' + await rows());

  // 5 分类筛选
  await q(() => document.querySelector('.hcm .chip:nth-child(3)').click());
  await new Promise((r) => setTimeout(r, 400));
  log.push('分类筛选后行数 ' + await rows());

  // 6 左滑露出操作
  await q(() => { const r = document.querySelectorAll('.hrow')[0]; const rw = r.querySelector('.rw'); const o = { bubbles: true, clientX: 300, clientY: rw.getBoundingClientRect().top + 20, pointerId: 1, isPrimary: true, pointerType: 'touch' };
    rw.dispatchEvent(new PointerEvent('pointerdown', o)); rw.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: 200 })); rw.dispatchEvent(new PointerEvent('pointerup', { ...o, clientX: 200 })); });
  await new Promise((r) => setTimeout(r, 400));
  log.push('左滑后 open=' + await q(() => document.querySelectorAll('#hl .row.open').length) + ' 操作可见=' + await q(() => { const s = document.querySelector('#hl .row.open .sw'); return s ? getComputedStyle(s).display : 'none'; }));

  // 7 编辑按钮进入记账页
  await q(() => document.querySelector('#hl .row.open .sw .e0').click());
  await new Promise((r) => setTimeout(r, 600));
  log.push('点编辑后路由 ' + await q(() => location.hash) + ' 金额 ' + await q(() => (document.querySelector('#lcd-v') || {}).textContent));

  // 8 保存（编辑）
  await q(() => document.querySelector('#k-ok')?.click() || document.querySelector('[data-a="save"]')?.click());
  await new Promise((r) => setTimeout(r, 700));
  log.push('保存后 toast ' + await q(() => (document.querySelector('.toast') || {}).className));

  // 9 统计下钻
  await q(() => window.demo.go('stats'));
  await new Promise((r) => setTimeout(r, 600));
  await q(() => document.querySelector('.rkr[data-i]')?.click());
  await new Promise((r) => setTimeout(r, 700));
  log.push('下钻后路由 ' + await q(() => location.hash) + ' 行数 ' + await rows());

  // 10 主题切换
  await q(() => document.querySelector('.ghost.ic')?.click() || document.querySelector('[data-a="theme"]')?.click());
  await new Promise((r) => setTimeout(r, 600));
  log.push('主题 ' + await q(() => document.documentElement.dataset.theme));

  console.log(log.join('\n'));
  console.log('errors', errs.slice(0, 5));
  await b.close();
})();
