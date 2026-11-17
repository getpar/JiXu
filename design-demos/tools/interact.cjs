const puppeteer = require('D:/tmp/jixu-fonts/node_modules/puppeteer-core');
const DEMOS = {
  'a-ledger': { theme: '.theme-t', keys: ['.keypad [data-k="1"]', '.keypad [data-k="2"]', '.keypad [data-k="0"]'], cat: '.cat', save: '[data-act="save"]', undo: '.toast .tu' },
  'b-instrument': { theme: '[data-a="theme"]', keys: ['.pad [data-k="1"]', '.pad [data-k="2"]', '.pad [data-k="0"]'], cat: '[data-a="cat"]', save: '[data-a="save"], .key.save', undo: '.toast button' },
  'c-spectrum': { theme: '[data-act="theme"]', keys: ['.kp [data-k="1"]', '.kp [data-k="2"]', '.kp [data-k="0"]'], cat: '.cb', save: '.k-save', undo: '.toast button' }
};
const click2 = (p, q, scope) => p.evaluate((q, scoped) => {
  const v = scoped ? document : (document.querySelector('.page.on, .view.on') || document);
  const els = [...v.querySelectorAll(q)]; const el = els.find((e) => e.offsetParent !== null) || els[0]; if (!el) return false;
  const r = el.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, isPrimary: true, pointerType: 'touch' };
  el.dispatchEvent(new PointerEvent('pointerdown', o));
  el.dispatchEvent(new PointerEvent('pointerup', o));
  el.click(); return true;
}, q, !!scope);

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--allow-file-access-from-files'] });
  for (const [demo, sel] of Object.entries(DEMOS)) {
    const p = await b.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await p.goto(`file:///D:/CodexDemo/JiXu/design-demos/${demo}/index.html?theme=light#add`);
    await p.waitForFunction(() => document.documentElement.dataset.ready === '1', { timeout: 8000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
    const before = await p.evaluate(() => document.querySelectorAll('[data-id]').length);
    const click = async (q) => p.evaluate((q) => {
      const v = document.querySelector('.page.on, .view.on') || document;
      const el = v.querySelector(q); if (!el) return false;
      const r = el.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, isPrimary: true, pointerType: 'touch' };
      el.dispatchEvent(new PointerEvent('pointerdown', o));
      el.dispatchEvent(new PointerEvent('pointerup', o));
      el.click();
      return true;
    }, q);
    for (const k of sel.keys) { await click(k); await new Promise((r) => setTimeout(r, 80)); }
    await click(sel.cat);
    await new Promise((r) => setTimeout(r, 150));
    const amt = await p.evaluate(() => (document.querySelector('#amtV, #lcd-v, #a-num') || {}).textContent);
    await click2(p, sel.save);
    await new Promise((r) => setTimeout(r, 500));
    const after = await p.evaluate(() => document.querySelectorAll('[data-id]').length);
    const toast = await p.evaluate(() => { const t = document.querySelector('.toast'); return t ? (t.className + ' :: ' + t.textContent.trim().slice(0, 40)) : 'NO TOAST'; });
    await p.screenshot({ path: `_shots/${demo}/saved-m.png` });
    // undo
    await click2(p, sel.undo, true); await new Promise((r) => setTimeout(r, 400));
    const undone = await p.evaluate(() => document.querySelectorAll('[data-id]').length);
    // theme toggle
    await p.evaluate((q) => { const v = document.querySelector('.page.on, .view.on') || document; const el = v.querySelector(q) || document.querySelector(q); if (el) el.click(); }, sel.theme); await new Promise((r) => setTimeout(r, 700));
    const themeAfter = await p.evaluate(() => document.documentElement.dataset.theme);
    await p.screenshot({ path: `_shots/${demo}/dark-m.png` });
    console.log(demo, '| amt', amt, '| rows', before, '->', after, '| toast:', toast, '| after undo', undone, '| theme', themeAfter, '| errs', errs.slice(0, 3));
    await p.close();
  }
  await b.close();
})();
