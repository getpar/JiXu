const puppeteer = require('D:/tmp/jixu-fonts/node_modules/puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--allow-file-access-from-files', '--hide-scrollbars'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await p.goto('file:///D:/CodexDemo/JiXu/design-demos/index.html');
  await new Promise((r) => setTimeout(r, 2500));
  await p.screenshot({ path: '_shots/hub-phone.png' });
  await p.click('#segDevice button[data-v="desk"]');
  await new Promise((r) => setTimeout(r, 2500));
  await p.screenshot({ path: '_shots/hub-desk.png' });
  console.log('errors', errs.slice(0, 5));
  await b.close();
})();
