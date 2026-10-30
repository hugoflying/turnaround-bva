// v3.47.1 (Hugo) : démo à la minute pile (AIBT 11:13 saisi = 11:13 dans l'app), SIBT/SOBT sur 0 ou 5, SOBT ≥ SIBT + rotation mini.
// Usage : node test/dm107.js (serveur statique du repo sur http://localhost:8803)
const { chromium } = require('playwright');
(async()=>{ const b = await chromium.launch(), p = await b.newPage({ viewport:{ width:1400, height:900 } }), errs = [], o = {};
p.on('pageerror', e => errs.push(e.message));
await p.route('https://timing-demo.pages.dev/**', r => r.fulfill({ status:200, contentType:'application/json', body:'{"at":0,"cfg":null}' }));
await p.addInitScript(() => { localStorage.setItem('whatsNewSeen', 'maj-2026-10-18c'); sessionStorage.setItem('pv_auth', '1'); });
const hm = m => String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0') + ':' + String(((m % 60) + 60) % 60).padStart(2, '0');
const mn = s => +s.slice(0, 2) * 60 + +s.slice(3);
const check = async () => p.evaluate(() => { const mn = s => +s.slice(0, 2) * 60 + +s.slice(3); const r = []; Object.keys(localStorage).filter(k => k.startsWith('tab-')).forEach(k => { const d = JSON.parse(localStorage.getItem(k));
  const s = mn(d.SIBT), e = mn(d.SOBT), t = ((e - s) % 1440 + 1440) % 1440, mt = ['FR','RK'].includes(d.Cie) ? 25 : ['W4','W6'].includes(d.Cie) ? 30 : 0;
  r.push({ f:d.Cie + d.NVol, SIBT:d.SIBT, SOBT:d.SOBT, AIBT:d.AIBT || '', ok5: s % 5 === 0 && e % 5 === 0, okTurn: t >= mt }); }); return r; });
await p.goto('http://localhost:8803/'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('whatsNewSeen', 'maj-2026-10-18c'); }); await p.reload(); await p.waitForTimeout(4500);
o.def = await check();
o.t0Minute = await p.evaluate(() => +localStorage.demoT0 % 60000 === 0);
const now = new Date(), base = now.getHours() * 60 + now.getMinutes(), aibt = hm(base - 3);
await p.goto('http://localhost:8803/admin.html'); await p.waitForTimeout(600);
o.adminLine = await p.evaluate(a => { go('demo'); const f = dEdit(); f.forEach(x => x.open = false);
  Object.assign(f[0], { open:true, cie:'FR', arr:'594', dep:'595', ap:'OPO', type:'B38M', park:'4', tat:25, sibt:'-12', aibt:a, sobt:'', ctot:'', aobt:'', fill:'auto', dl:'', cx:false });
  Object.assign(f[1], { open:true, cie:'FR', arr:'100', dep:'101', ap:'DUB', type:'B738', park:'5', tat:25, sibt:'-70', aibt:'', sobt:'', ctot:'', aobt:'', fill:'auto', dl:'', cx:false, lid:'LID' });
  Object.assign(f[2], { open:true, cie:'RK', arr:'200', dep:'201', ap:'STN', type:'B738', park:'6', tat:25, sibt:'-70', aibt:'', sobt:'', ctot:'', aobt:'', fill:'auto', dl:'', cx:false }); delete f[2].lid;
  save(); render(); publish(); return dLine(f[0], 0).replace(/<[^>]+>/g, ''); }, aibt);
await p.goto('http://localhost:8803/'); await p.waitForTimeout(3500);
o.cus = await check(); o.aibtTyped = aibt;
o.lid = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('tab-')).map(k => { const d = JSON.parse(localStorage.getItem(k)); return [d.Cie + d.NVol, d.LidMode, 'A=' + d.FinalADULT, 'C=' + (d.FinalCHILD || ''), 'OA=' + (d.FinalOA || ''), 'TOB=' + (d.FinalTOB || '')].join(' '); }));
o.pass = o.t0Minute && o.def.every(x => x.ok5 && x.okTurn) && o.cus.length === 3 && o.cus.find(x => x.f === 'FR595').AIBT === aibt && o.cus.every(x => x.ok5 && x.okTurn) && o.lid.some(x => /^FR101 LID A=\d+ C=\d+ OA=\d+/.test(x)) && o.lid.some(x => /^RK201 ELID A=\d+ C= OA= /.test(x)) && o.adminLine.includes('AIBT ' + aibt);
console.log(JSON.stringify(o, null, 1)); console.log(errs.join(';') || 'no errors'); await b.close(); })();
