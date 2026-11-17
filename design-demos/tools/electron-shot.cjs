/* 用 Electron 真机截图验收桌面端：先 `cd desktop && npx electron-vite build`，再
 *   node design-demos/tools/electron-shot.cjs [routes...]
 * 产物：design-demos/_shots/desktop-app/<route>.png + console 错误清单
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('D:/tmp/jixu-fonts/node_modules/puppeteer-core');

const DESKTOP = path.resolve(__dirname, '../../desktop');
const OUT = path.resolve(__dirname, '../_shots/desktop-app');
const ROUTES = process.argv.slice(2).length ? process.argv.slice(2) : ['home', 'add', 'history', 'stats', 'categories', 'recurring', 'todos', 'recycle-bin'];
const PORT = 9333;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const el = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['electron', '.', `--remote-debugging-port=${PORT}`], {
    cwd: DESKTOP, env: { ...process.env, ELECTRON_RUN_AS_NODE: '' }, shell: process.platform === 'win32'
  });
  el.stdout.on('data', (d) => process.stdout.write('[electron] ' + d));
  el.stderr.on('data', (d) => process.stdout.write('[electron!] ' + d));

  let browser = null;
  for (let i = 0; i < 40 && !browser; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null }); } catch (e) { /* retry */ }
  }
  if (!browser) { console.error('electron 未在 20s 内就绪'); el.kill(); process.exit(1); }

  const pages = await browser.pages();
  const page = pages.find((p) => !p.url().startsWith('devtools://')) || pages[0];
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  await page.setViewport({ width: 1440, height: 900 });
  await new Promise((r) => setTimeout(r, 1200));

  for (const r of ROUTES) {
    await page.evaluate((r) => { location.hash = '#/' + r; }, r);
    await new Promise((x) => setTimeout(x, 900));
    await page.screenshot({ path: path.join(OUT, r + '.png') });
    const info = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      theme: document.documentElement.dataset.theme || '(none)',
      title: document.title
    }));
    console.log(r, JSON.stringify(info));
  }
  // 暗色
  await page.evaluate(() => { const b = document.querySelector('[aria-label*="主题"], [data-theme-toggle], .theme-t'); if (b) b.click(); });
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate(() => { location.hash = '#/home'; });
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: path.join(OUT, 'home-dark.png') });
  console.log('theme now', await page.evaluate(() => document.documentElement.dataset.theme || '(none)'));
  console.log('errors', errs.slice(0, 10));
  browser.disconnect();
  el.kill();
  process.exit(0);
})();
