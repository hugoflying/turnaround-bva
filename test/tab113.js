// v3.51.10 : vol manuel avec n° d'arrivée saisi → l'onglet suit la phase (arrivée puis départ) et le Récap montre le départ
// Usage : node test/tab113.js (serveur statique du repo sur http://localhost:8803)
const { chromium } = require('playwright');
(async () => {
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
await ctx.route('https://timing-demo.pages.dev/**', r => r.fulfill({ status:200, contentType:'application/json', body:'{"at":0,"cfg":null}' }));
await ctx.addInitScript(() => { sessionStorage.setItem('pv_auth', '1'); localStorage.setItem('whatsNewSeen', 'maj-2026-10-30'); });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8803/'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('whatsNewSeen', 'maj-2026-10-30'); }); await p.reload(); await p.waitForTimeout(4500);
const r = await p.evaluate(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  const ids = JSON.parse(localStorage.flightTabs), id = ids[0];
  uiOpenFlight(ids[1]); await w(300);
  const d = JSON.parse(localStorage.getItem('tab-' + id));
  // vol « manuel » : plus d'infos de la liste, juste le n° d'arrivée saisi
  d.akMeta = { arrFF:'FR1111' }; d.Cie = 'FR'; d.NVol = '2222'; d.From = 'OPO'; d.To = 'MAD'; d.DernierDebarque = ''; d.AvionPremierEmbarque = ''; d.AOBT = '';
  localStorage.setItem('tab-' + id, JSON.stringify(d));
  uiOpenFlight(id); uiTab('vol'); await w(300);
  const lbl = () => document.querySelector('#tab-bar .tab-wrap[data-tab="' + id + '"]')?.textContent.replace(/\s+/g, ' ').trim();
  renderTabs(); const arr = lbl();
  const e = document.getElementById('DernierDebarque'); e.value = '10:00'; e.dispatchEvent(new Event('input', { bubbles:true })); e.dispatchEvent(new Event('change', { bubbles:true }));
  await w(300); saveCurrentTabData(); renderTabs(); const dep = lbl();
  return { arr, dep };
});
const ok = /1111/.test(r.arr) && /OPO/.test(r.arr) && /2222/.test(r.dep) && /MAD/.test(r.dep) && !errs.length;
console.log(JSON.stringify(r), errs.join(' | ') || 'no errors'); console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1); })();
