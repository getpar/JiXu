/* 截图 + 流畅度探针：node design-demos/tools/shoot.cjs [demo目录...] [--only=desktop|mobile] [--theme=light|dark] [--routes=home,stats]
 * 产物：design-demos/_shots/<demo>/<viewport>-<theme>-<route>.png 与 report.json
 * Demo 约定：hash 路由 #home/#add/#history/#stats；?theme=light|dark；入场动画结束后置 document.documentElement.dataset.ready='1'；
 * 暴露 window.demo.go(route) 用于切页。
 */
const path = require('path');
const fs = require('fs');
const puppeteer = require('D:/tmp/jixu-fonts/node_modules/puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const args = process.argv.slice(2);
const flag = (k, d) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const demos = args.filter((a) => !a.startsWith('--'));
const list = demos.length ? demos : fs.readdirSync(ROOT).filter((d) => /^[a-z]-/.test(d) && fs.existsSync(path.join(ROOT, d, 'index.html')));
const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
};
const vps = flag('only') ? [flag('only')] : Object.keys(VIEWPORTS);
const themes = flag('theme') ? [flag('theme')] : ['light', 'dark'];
const routes = (flag('routes') || 'home,add,history,stats').split(',');

async function waitReady(page) {
  try {
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', { timeout: 6000 });
  } catch (e) { return false; }
  return true;
}

async function frameProbe(page, route, ms) {
  return page.evaluate((route, ms) => new Promise((resolve) => {
    const deltas = []; let last = performance.now(); const start = last;
    let longTask = 0;
    let po;
    try { po = new PerformanceObserver((l) => l.getEntries().forEach((e) => { longTask += e.duration; })); po.observe({ type: 'longtask', buffered: false }); } catch (e) { /* ignore */ }
    function tick(t) { deltas.push(t - last); last = t; if (t - start < ms) requestAnimationFrame(tick); else { if (po) po.disconnect(); const jank = deltas.filter((d) => d > 25).length; const worst = Math.max.apply(null, deltas); resolve({ frames: deltas.length, fps: Math.round(deltas.length / (ms / 1000)), jankFrames: jank, worstFrameMs: Math.round(worst), longTaskMs: Math.round(longTask) }); } }
    requestAnimationFrame((t) => { last = t; window.demo && window.demo.go(route); requestAnimationFrame(tick); });
  }), route, ms);
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--allow-file-access-from-files', '--font-render-hinting=none', '--hide-scrollbars'] });
  for (const demo of list) {
    const outDir = path.join(ROOT, '_shots', demo);
    fs.mkdirSync(outDir, { recursive: true });
    const report = { demo, errors: [], shots: [], perf: {} };
    const url = 'file:///' + path.join(ROOT, demo, 'index.html').replace(/\\/g, '/');
    for (const vp of vps) {
      for (const theme of themes) {
        for (const route of routes) {
          const page = await browser.newPage();
          await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
          page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') report.errors.push(`[${vp}/${theme}/${route}] console.${m.type()}: ${m.text()}`); });
          page.on('pageerror', (e) => report.errors.push(`[${vp}/${theme}/${route}] pageerror: ${e.message}`));
          page.on('requestfailed', (r) => report.errors.push(`[${vp}/${theme}/${route}] requestfailed: ${r.url().slice(0, 140)}`));
          await page.setViewport(VIEWPORTS[vp]);
          await page.goto(url + '?theme=' + theme + '#' + route, { waitUntil: 'load' });
          const ok = await waitReady(page);
          if (!ok) report.errors.push(`[${vp}/${theme}/${route}] ready flag not set within 6s`);
          await new Promise((r) => setTimeout(r, 250));
          const file = `${vp}-${theme}-${route}.png`;
          await page.screenshot({ path: path.join(outDir, file), fullPage: flag('full', '0') === '1' });
          const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
          if (overflowX) report.errors.push(`[${vp}/${theme}/${route}] horizontal overflow (scrollWidth ${await page.evaluate(() => document.documentElement.scrollWidth)} > ${VIEWPORTS[vp].width})`);
          report.shots.push(file);
          await page.close();
        }
      }
    }
    // 流畅度：手机视口 + 4x CPU 降速（模拟中低端安卓），测首屏与切页动画掉帧
    if (vps.includes('mobile')) {
      const page = await browser.newPage();
      await page.setViewport(VIEWPORTS.mobile);
      const cdp = await page.target().createCDPSession();
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const t0 = Date.now();
      await page.goto(url + '?theme=light#home', { waitUntil: 'load' });
      const loadMs = Date.now() - t0;
      await waitReady(page);
      const readyMs = Date.now() - t0;
      const paint = await page.evaluate(() => { const p = performance.getEntriesByName('first-contentful-paint')[0]; return p ? Math.round(p.startTime) : null; });
      report.perf.cpu4x = { loadMs, readyMs, fcpMs: paint, transitions: {} };
      for (const r of ['stats', 'history', 'add', 'home']) {
        report.perf.cpu4x.transitions[r] = await frameProbe(page, r, 1200);
      }
      const scrollProbe = await page.evaluate(() => new Promise((resolve) => {
        const sc = document.scrollingElement; const el = [...document.querySelectorAll('*')].find((n) => n.scrollHeight > n.clientHeight + 200 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) || sc;
        const deltas = []; let last = performance.now(); const start = last; let y = 0;
        function tick(t) { deltas.push(t - last); last = t; y += 24; el.scrollTop = y; if (t - start < 1500) requestAnimationFrame(tick); else resolve({ frames: deltas.length, jankFrames: deltas.filter((d) => d > 25).length, worstFrameMs: Math.round(Math.max.apply(null, deltas)) }); }
        requestAnimationFrame(tick);
      }));
      report.perf.cpu4x.scrollHome = scrollProbe;
      await page.close();
    }
    const kb = (p) => Math.round(fs.statSync(p).size / 1024);
    const own = fs.readdirSync(path.join(ROOT, demo)).filter((f) => /\.(html|css|js)$/.test(f));
    report.weightKB = Object.fromEntries(own.map((f) => [f, kb(path.join(ROOT, demo, f))]));
    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ demo, shots: report.shots.length, errors: report.errors.slice(0, 20), errorCount: report.errors.length, perf: report.perf, weightKB: report.weightKB }, null, 1));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
