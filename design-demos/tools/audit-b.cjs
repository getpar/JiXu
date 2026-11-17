/* B 版全量验收：多视口 × 双主题 × 五页，查报错/横向溢出/越界元素/点击目标过小 */
const puppeteer = require('D:/tmp/jixu-fonts/node_modules/puppeteer-core');
const ROOT = 'D:/CodexDemo/JiXu/design-demos/b-instrument/index.html';
const VPS = [
  { n: 'desk-1440', w: 1440, h: 900, dpr: 1, mobile: false },
  { n: 'desk-1280', w: 1280, h: 800, dpr: 1, mobile: false },
  { n: 'tab-768', w: 768, h: 1024, dpr: 1, mobile: true },
  { n: 'm-390', w: 390, h: 844, dpr: 2, mobile: true },
  { n: 'm-360', w: 360, h: 780, dpr: 2, mobile: true }
];
const ROUTES = ['home', 'add', 'history', 'stats', 'more'];

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--allow-file-access-from-files', '--hide-scrollbars'] });
  const out = [];
  for (const vp of VPS) {
    for (const theme of ['light', 'dark']) {
      const p = await b.newPage();
      const errs = [];
      p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
      p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 120)); });
      await p.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr, isMobile: vp.mobile, hasTouch: vp.mobile });
      await p.goto(`${ROOT}?theme=${theme}#home`);
      await p.waitForFunction(() => document.documentElement.dataset.ready === '1', { timeout: 8000 }).catch(() => errs.push('ready timeout'));
      for (const r of ROUTES) {
        await p.evaluate((r) => window.demo.go(r), r);
        await new Promise((x) => setTimeout(x, 520));
        const info = await p.evaluate((w) => {
          const bad = [];
          document.querySelectorAll('.view.on *').forEach((el) => {
            const s = getComputedStyle(el);
            if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return;
            let p = el.parentElement, clipped = false;
            while (p && p !== document.body) { const ps = getComputedStyle(p); if (/(hidden|auto|scroll|clip)/.test(ps.overflowX + ps.overflow)) { clipped = true; break; } p = p.parentElement; }
            if (clipped) return;
            if (r.right > w + 1.5 || r.left < -1.5) bad.push((el.className || el.tagName) + ' @' + Math.round(r.left) + '..' + Math.round(r.right));
          });
          return {
            overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
            bad: [...new Set(bad)].slice(0, 6)
          };
        }, vp.w);
        // 移动端：可点元素 < 40px 的计数（排除内联文本链接）
        let small = 0;
        if (vp.mobile) {
          small = await p.evaluate(() => {
            let n = 0;
            document.querySelectorAll('.view.on button, .view.on [data-a], .view.on input').forEach((el) => {
              const s = getComputedStyle(el);
              if (s.display === 'none' || s.visibility === 'hidden') return;
              const r = el.getBoundingClientRect();
              if (r.width && r.height && (r.height < 38 || r.width < 38)) n++;
            });
            return n;
          });
        }
        out.push({ vp: vp.n, theme, route: r, overflowX: info.overflowX, bad: info.bad, small, errs: errs.slice(0, 4) });
        errs.length = 0;
        await p.screenshot({ path: `D:/CodexDemo/JiXu/design-demos/_shots/b-audit/${vp.n}-${theme}-${r}.png` });
      }
      await p.close();
    }
  }
  const problems = out.filter((o) => o.overflowX || o.bad.length || o.errs.length);
  console.log('cells', out.length, 'problem cells', problems.length);
  problems.forEach((o) => console.log(JSON.stringify(o)));
  const smallCells = out.filter((o) => o.small > 0).map((o) => `${o.vp}/${o.route}:${o.small}`);
  console.log('small-target cells', smallCells.join(' '));
  await b.close();
})();
