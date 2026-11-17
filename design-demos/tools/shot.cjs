// node tools/shot.cjs <demo> <route> <w> <h> <out.png> [clip="x,y,w,h"] [scale]
const puppeteer = require('D:/tmp/jixu-fonts/node_modules/puppeteer-core');
const [demo, route, w, h, out, clip, scale] = process.argv.slice(2);
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--allow-file-access-from-files', '--hide-scrollbars'] });
  const p = await b.newPage();
  await p.setViewport({ width: +w, height: +h, deviceScaleFactor: +(scale || 2) });
  await p.goto(`file:///D:/CodexDemo/JiXu/design-demos/${demo}/index.html?theme=light#${route}`);
  await p.waitForFunction(() => document.documentElement.dataset.ready === '1', { timeout: 8000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  const opt = { path: out };
  if (clip) { const [x, y, cw, ch] = clip.split(',').map(Number); opt.clip = { x, y, width: cw, height: ch }; }
  await p.screenshot(opt);
  await b.close();
})();
