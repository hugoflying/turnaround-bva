// v3.51.5 : en passant d'une case LOAD à l'autre (blur puis focus), la marge du bas reste : la page ne raccourcit pas et ne remonte pas
// Usage : node test/kb110.js (serveur statique du repo sur http://localhost:8803)
const { chromium } = require('playwright');
(async () => {
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{ width:390, height:500 } });
await ctx.route('https://timing-demo.pages.dev/**', r => r.fulfill({ status:200, contentType:'application/json', body:'{"at":0,"cfg":null}' }));
await ctx.addInitScript(() => { sessionStorage.setItem('pv_auth', '1'); localStorage.setItem('whatsNewSeen', 'maj-2026-10-30'); });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8803/'); await p.waitForTimeout(4500);
const r = await p.evaluate(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  switchTab(JSON.parse(localStorage.flightTabs)[0]); uiTab('load'); await w(600);
  const f = [...document.querySelectorAll('#ldmModal .ld-stat input:not([readonly])')].filter(i => i.offsetParent);
  const a = f[f.length - 1], c = f[f.length - 2];
  a.focus(); await w(100); window.scrollTo(0, document.documentElement.scrollHeight); await w(100);
  const y0 = window.scrollY;
  a.blur(); await w(30); const y1 = window.scrollY;        // entre deux cases
  c.focus(); await w(800); const pad = document.body.classList.contains('kb-pad');
  c.blur(); await w(900); const padOff = !document.body.classList.contains('kb-pad');
  return { y0, y1, pad, padOff, n:f.length };
});
const ok = r.n > 2 && r.y0 > 100 && r.y1 === r.y0 && r.pad && r.padOff && !errs.length;
console.log(JSON.stringify(r), errs.join(' | ') || 'no errors'); console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1); })();
