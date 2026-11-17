const puppeteer = require('D:/tmp/jixu-fonts/node_modules/puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--allow-file-access-from-files', '--hide-scrollbars'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await p.goto('file:///D:/CodexDemo/JiXu/design-demos/b-instrument/index.html?theme=light#history');
  await p.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await new Promise((r) => setTimeout(r, 400));
  await p.screenshot({ path: '_shots/b-instrument/hist-top.png', clip: { x: 0, y: 0, width: 390, height: 420 } });
  await p.evaluate(() => { const r = document.querySelectorAll('.hrow')[1]; r.classList.add('open'); r.querySelector('.rw').style.transform = 'translateX(-136px)'; });
  await new Promise((r) => setTimeout(r, 350));
  await p.screenshot({ path: '_shots/b-instrument/hist-swipe.png', clip: { x: 0, y: 300, width: 390, height: 260 } });
  await b.close();
})();
