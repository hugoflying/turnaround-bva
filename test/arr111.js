// v3.51.7 : « N° vol arrivée » dans Modifier le vol → akMeta.arrFF (bandeau, onglet) ; masqué si To = BVA ; vidé au changement de vol
// Usage : node test/arr111.js (serveur statique du repo sur http://localhost:8803)
const { chromium } = require('playwright');
(async () => {
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
await ctx.route('https://timing-demo.pages.dev/**', r => r.fulfill({ status:200, contentType:'application/json', body:'{"at":0,"cfg":null}' }));
await ctx.addInitScript(() => { sessionStorage.setItem('pv_auth', '1'); localStorage.setItem('whatsNewSeen', 'maj-2026-10-30'); });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8803/'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('whatsNewSeen', 'maj-2026-10-30'); }); await p.reload(); await p.waitForTimeout(4500);
const o = {};
await p.evaluate(() => { const ids = JSON.parse(localStorage.flightTabs); uiOpenFlight(ids[0]); uiTab('vol'); toggleInfoVolEdit(); });
await p.waitForTimeout(300);
o.pre = await p.evaluate(() => [document.getElementById('NVolArr').value, JSON.parse(localStorage.getItem('tab-' + currentTabId)).akMeta.arrFF, document.getElementById('ivNVolArrF').hidden]);
await p.fill('#NVolArr', ''); await p.type('#NVolArr', '1234');
o.after = await p.evaluate(() => [JSON.parse(localStorage.getItem('tab-' + currentTabId)).akMeta.arrFF, document.getElementById('kvArrVol').textContent]);
await p.evaluate(() => { const t = document.getElementById('To'); t.value = 'BVA'; t.dispatchEvent(new Event('input', { bubbles:true })); });
o.hidBva = await p.evaluate(() => document.getElementById('ivNVolArrF').hidden);
await p.evaluate(() => { toggleInfoVolEdit(); const ids = JSON.parse(localStorage.flightTabs); uiOpenFlight(ids[1]); uiTab('vol'); toggleInfoVolEdit(); });
await p.waitForTimeout(300);
o.other = await p.evaluate(() => [document.getElementById('NVolArr').value, JSON.parse(localStorage.getItem('tab-' + currentTabId)).akMeta.arrFF]);
const ok = o.pre[0] && o.pre[1].endsWith(o.pre[0]) && !o.pre[2] && /1234$/.test(o.after[0]) && o.after[1] === o.after[0] && o.hidBva
  && o.other[0] !== '1234' && o.other[1].endsWith(o.other[0]) && !errs.length;
console.log(JSON.stringify(o), errs.join(' | ') || 'no errors'); console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1); })();
