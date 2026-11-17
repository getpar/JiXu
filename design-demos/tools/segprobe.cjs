const puppeteer = require('D:/tmp/jixu-fonts/node_modules/puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto('file:///D:/CodexDemo/JiXu/design-demos/b-instrument/index.html?theme=dark#history');
  await p.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await new Promise((r) => setTimeout(r, 500));
  console.log(await p.evaluate(() => {
    const seg = document.querySelector('#h-type');
    const th = seg.querySelector('.th'), on = seg.querySelector('button.on');
    const cs = getComputedStyle(th), cb = getComputedStyle(on);
    return `theme=${document.documentElement.dataset.theme} thBg=${cs.backgroundColor} thW=${th.style.width} thT=${th.style.transform} btnColor=${cb.color} btnBg=${cb.backgroundColor} acF=${getComputedStyle(document.documentElement).getPropertyValue('--acF')}`;
  }));
  await b.close();
})();
