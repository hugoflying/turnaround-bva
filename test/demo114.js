// v3.52 : Récap (démo) « Réinitialiser les vols démo » (2 appuis, T0 = maintenant) ; admin : heures en T-60 / T+15 / T0, affichage T0
// Usage : node test/demo114.js (serveur statique du repo sur http://localhost:8803)
const { chromium } = require('playwright');
(async () => {
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
await ctx.route('https://timing-demo.pages.dev/**', r => r.fulfill({ status:200, contentType:'application/json', body:'{"at":0,"cfg":null}' }));
await ctx.addInitScript(() => { sessionStorage.setItem('pv_auth', '1'); localStorage.setItem('whatsNewSeen', 'maj-2026-10-30'); });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8803/'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('whatsNewSeen', 'maj-2026-10-30'); }); await p.reload(); await p.waitForTimeout(4500);
const o = {};
await p.evaluate(() => { localStorage.setItem('demoT0', String(Date.now() - 3 * 3600e3)); uiTab('vols'); });   // démo ouverte il y a 3 h
await p.waitForTimeout(400);
o.shown = await p.evaluate(() => !document.getElementById('rcDemoReset').hidden);
await p.click('#rcDemoReset'); o.ask = await p.evaluate(() => document.getElementById('rcDemoReset').classList.contains('is-ask'));
await Promise.all([p.waitForNavigation(), p.click('#rcDemoReset')]); await p.waitForTimeout(4500);
o.t0age = await p.evaluate(() => Math.round((Date.now() - +localStorage.getItem('demoT0')) / 60000));
// admin
const a = await ctx.newPage(); a.on('pageerror', e => errs.push('admin: ' + e.message));
await a.goto('http://localhost:8803/admin.html'); await a.waitForTimeout(1500);
o.adm = await a.evaluate(() => [dRel('T-30'), dRel('T0'), dRel('T + 15'), dRel('t-5'), dRel('-20'), dHM(-30), dHM(0), dHM(12)]);
const ok = o.shown && o.ask && o.t0age <= 1 && JSON.stringify(o.adm) === JSON.stringify([-30, 0, 15, -5, -20, 'T-30', 'T0', 'T+12']) && !errs.length;
console.log(JSON.stringify(o), errs.join(' | ') || 'no errors'); console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1); })();
