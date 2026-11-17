const puppeteer = require('D:/tmp/jixu-fonts/node_modules/puppeteer-core');
const [route, w, y, out] = process.argv.slice(2);
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--allow-file-access-from-files', '--hide-scrollbars'] });
  const p = await b.newPage();
  await p.setViewport({ width: +w, height: 844, deviceScaleFactor: 2 });
  await p.goto(`file:///D:/CodexDemo/JiXu/design-demos/b-instrument/index.html?theme=light#${route}`);
  await p.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await new Promise((r) => setTimeout(r, 400));
  await p.evaluate((y) => { document.querySelector('.main').scrollTop = y; }, +y);
  await new Promise((r) => setTimeout(r, 400));
  await p.screenshot({ path: out });
  await b.close();
})();
