// usage: node probe.cjs <demo> <route> <width> "<js expression returning JSON-able>"
const puppeteer = require('D:/tmp/jixu-fonts/node_modules/puppeteer-core');
const [demo, route, width, expr] = process.argv.slice(2);
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage();
  const w = +width || 1440;
  await p.setViewport({ width: w, height: w < 800 ? 844 : 900, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.goto(`file:///D:/CodexDemo/JiXu/design-demos/${demo}/index.html?theme=light#${route}`);
  await p.waitForFunction(() => document.documentElement.dataset.ready === '1', { timeout: 8000 }).catch(() => console.log('NOT READY'));
  await new Promise((r) => setTimeout(r, 300));
  const out = await p.evaluate(new Function('return (' + expr + ')'));
  console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
  await b.close();
})();
