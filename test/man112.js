// v3.51.9 : vol ajouté à la main (akMeta sans id, ex. CTOT ou n° d'arrivée saisis) → aucun rafraîchissement AK automatique, ↻ grisé
// Usage : node test/man112.js (serveur statique du repo sur http://localhost:8803)
const { chromium } = require('playwright');
(async () => {
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
await ctx.route('https://timing-demo.pages.dev/**', r => r.fulfill({ status:200, contentType:'application/json', body:'{"at":0,"cfg":null}' }));
await ctx.addInitScript(() => { sessionStorage.setItem('pv_auth', '1'); localStorage.setItem('whatsNewSeen', 'maj-2026-10-30'); });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8803/'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('whatsNewSeen', 'maj-2026-10-30'); }); await p.reload(); await p.waitForTimeout(4500);
const r = await p.evaluate(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  const ids = JSON.parse(localStorage.flightTabs); const id = ids[0];
  const d = JSON.parse(localStorage.getItem('tab-' + id)); d.akMeta = { arrFF:'FR1234', ctotHistory:[] }; localStorage.setItem('tab-' + id, JSON.stringify(d));
  uiOpenFlight(id); uiTab('vol'); await w(300);
  let calls = 0; const orig = window.refreshAKTab; window.refreshAKTab = async () => { calls++; };
  const set = (k, v) => { const e = document.getElementById(k); e.value = v; e.dispatchEvent(new Event('change', { bubbles:true })); };
  set('AIBT', ''); set('AIBT', '10:00'); set('AvionPremierEmbarque', '10:20'); await w(700);
  // vol AK (avec id) : toujours rafraîchi
  const d2 = JSON.parse(localStorage.getItem('tab-' + ids[1])); uiOpenFlight(ids[1]); uiTab('vol'); await w(300);
  set('AIBT', ''); set('AIBT', '10:05'); await w(700);
  window.refreshAKTab = orig;
  try{ renderTabs(); }catch(e){}
  const btn = document.querySelector('#tab-bar .tab-wrap[data-tab="' + id + '"] .tab-refresh');
  return { calls, akId:!!(d2.akMeta && d2.akMeta.id), disabled: btn ? btn.disabled : null };
});
const ok = r.calls === 1 && r.akId && r.disabled === true && !errs.length;
console.log(JSON.stringify(r), errs.join(' | ') || 'no errors'); console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1); })();
