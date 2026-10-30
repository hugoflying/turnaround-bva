// v3.51 (Hugo) : feuille Nightstop & tour avion pour les vols basés (From ou To = BVA) : services, fouille soutes (retour basé),
// silhouette en plein écran (tournée de 90° en portrait), croix enregistrées, rapport.
// Usage : node test/ns109.js (serveur statique du repo sur http://localhost:8803)
const { chromium } = require('playwright');
(async()=>{ const b = await chromium.launch(), p = await b.newPage({ viewport:{ width:390, height:844 } }), errs = [], o = {};
p.on('pageerror', e => errs.push(e.message));
await p.route('https://timing-demo.pages.dev/**', r => r.fulfill({ status:200, contentType:'application/json', body:'{"at":0,"cfg":null}' }));
await p.addInitScript(() => { localStorage.setItem('whatsNewSeen', 'maj-2026-10-30'); sessionStorage.setItem('pv_auth', '1'); });
await p.goto('http://localhost:8803/'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('whatsNewSeen', 'maj-2026-10-30'); }); await p.reload(); await p.waitForTimeout(4500);
const set = (i, v) => p.evaluate(([i, v]) => { const e = document.getElementById(i); e.value = v; e.dispatchEvent(new Event('input', { bubbles:true })); e.dispatchEvent(new Event('change', { bubbles:true })); }, [i, v]);
await p.evaluate(() => { switchTab(JSON.parse(localStorage.flightTabs)[0]); uiTab('retard'); });
await set('From', 'OPO'); await set('To', 'OPO'); await p.waitForTimeout(1200);
o.hiddenOutside = await p.evaluate(() => document.getElementById('nsRow').hidden);
await set('From', 'BVA'); await p.waitForTimeout(1200);
o.dep = await p.evaluate(() => [nsMode(), document.getElementById('nsRowT').textContent, document.getElementById('nsRowSt').textContent]);
await set('From', 'OPO'); await set('To', 'BVA'); await p.waitForTimeout(1200);
await p.click('#nsRow'); await p.waitForTimeout(400);
// v3.51.3 : cases par défaut du retour basé, interrupteur GPU
o.def = await p.evaluate(() => { const d = JSON.parse(document.getElementById('Nightstop').value).sv; return [d.toilV, d.eauV, d.men, d.gpu, d.dec, !!d.toilR, document.querySelector('[data-tg="ech"]').textContent, nsSummary().started]; });
await p.click('[data-tg="ech"]'); o.tg = await p.evaluate(() => [document.querySelector('[data-tg="ech"]').textContent, JSON.parse(document.getElementById('Nightstop').value).sv.ech]);
await p.click('[data-sv="toilR"]'); await p.click('[data-one="men"][data-v="DI"]'); await p.click('[data-one="tr"][data-v="ASSISTAIR"]');
await p.click('[data-hs="on"]'); await p.waitForTimeout(200); o.hsShown = await p.locator('[data-hsok]').count();
await p.click('#nsFullBtn'); await p.waitForTimeout(500);
const r = await p.evaluate(() => { const q = document.querySelector('#nsFullPlane img').getBoundingClientRect(); return { x:q.left, y:q.top, w:q.width, h:q.height, rot:document.getElementById('nsFull').classList.contains('rot') }; });
await p.mouse.click(r.x + r.w * 0.5, r.y + r.h * 0.3);            // portrait : u = 0.3, v = 0.5
await p.mouse.click(r.x + r.w * 0.5, r.y + r.h * 0.3 + 2);        // même endroit : retire la croix
await p.mouse.click(r.x + r.w * 0.2, r.y + r.h * 0.6);            // u = 0.6, v = 0.8
// appui long sur la croix restante (u 0.6, v 0.8) puis glissé vers u 0.4 (portrait : x = right - v*w, y = top + u*h)
await p.mouse.move(r.x + r.w * 0.2, r.y + r.h * 0.6); await p.mouse.down(); await p.waitForTimeout(500);
await p.mouse.move(r.x + r.w * 0.2, r.y + r.h * 0.5, { steps:4 }); await p.mouse.move(r.x + r.w * 0.2, r.y + r.h * 0.4, { steps:4 }); await p.mouse.up();
o.drag = await p.evaluate(() => JSON.parse(document.getElementById('Nightstop').value).ta.x);
await p.evaluate(() => nsFullClose());
o.data = await p.evaluate(() => { const d = JSON.parse(document.getElementById('Nightstop').value); return { sv:d.sv, x:d.ta.x, dm:d.ta.dm, hs:d.hs.on }; });
// v3.51.1 : croix présente = Non désactivé et sans effet, plus de bloc Équipage, plus de plein écran système
o.v511 = await p.evaluate(() => { const n = document.querySelector('[data-ta="dm"][data-v="NON"]'); n.disabled = false; n.click(); const d = JSON.parse(document.getElementById('Nightstop').value);
  return { dm:d.ta.dm, noCrew:!document.querySelector('#nsBody [data-name="c"]') && !/Équipage/.test(document.getElementById('nsBody').textContent), fs:!document.fullscreenElement }; });
o.report = await p.evaluate(() => nsReport().split('\n').filter(Boolean).slice(0, 6).join(' | '));
const ok = o.hiddenOutside && o.dep[0] === 'dep' && /départ basé/.test(o.dep[1]) && o.dep[2] === 'Facultatif' && o.hsShown === 1 && r.rot
  && o.data.sv.toilV && o.data.sv.men === 'DI' && o.data.sv.tr === 'ASSISTAIR' && o.data.x.length === 1
  && o.def.join() === 'true,true,S,true,true,false,Non,false' && o.tg.join() === 'Oui,true' && o.data.sv.toilR && o.drag.length === 1 && Math.abs(o.drag[0][0] - 0.4) < 0.02 && Math.abs(o.drag[0][1] - 0.8) < 0.02  && o.data.dm === 'OUI' && /RETOUR BASE/.test(o.report) && o.v511.dm === 'OUI' && o.v511.noCrew && o.v511.fs && !/EQUIPAGE/.test(o.report) && !errs.length;
console.log(JSON.stringify(o), errs.join(' | ') || 'no errors'); console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1); })();
