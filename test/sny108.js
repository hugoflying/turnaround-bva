// v3.48 (Hugo, option C) : SNY « DERUHU 12C » → zone FWD/MID/AFT selon le type (FR/RK), encadré « SNY à bord » dans LOAD FINAL.
// Usage : node test/sny108.js (serveur statique du repo sur http://localhost:8803)
const { chromium } = require('playwright');
(async()=>{ const b = await chromium.launch(), p = await b.newPage({ viewport:{ width:390, height:844 } }), errs = [], o = {};
p.on('pageerror', e => errs.push(e.message));
await p.route('https://timing-demo.pages.dev/**', r => r.fulfill({ status:200, contentType:'application/json', body:'{"at":0,"cfg":null}' }));
await p.addInitScript(() => { localStorage.setItem('whatsNewSeen', 'maj-2026-10-18c'); sessionStorage.setItem('pv_auth', '1'); });
await p.goto('http://localhost:8803/'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('whatsNewSeen', 'maj-2026-10-18c'); }); await p.reload(); await p.waitForTimeout(4500);
o.zones = await p.evaluate(() => [['B738','5C'],['B738','6A'],['B738','29F'],['B38M','6A'],['B38M','7A'],['B38M','35F'],['A320','10A'],['A320','21C'],['B738','40A']].map(([t, s]) => t + ' ' + s + '=' + snyZone('FR', t, s)).join(' ') + ' | W6=' + snyZone('W6', 'A320', '1A'));
await p.evaluate(() => { const id = JSON.parse(localStorage.flightTabs)[0]; switchTab(id); const set = (i, v) => { const e = document.getElementById(i); e.value = v; e.dispatchEvent(new Event('input', { bubbles:true })); };
  set('Cie', 'FR'); set('TypeAvion', 'B38M'); set('FaitsSaillants', ''); uiTab('notes'); });
await p.waitForTimeout(400);
o.add = await p.evaluate(() => { document.querySelector('[data-nj-tag="SNY"]').click(); const i = document.querySelector('#bnTextMode .nj-input');
  i.value = 'deruhu 12c'; i.dispatchEvent(new Event('input')); const hint = document.querySelector('.nj-zone').textContent;
  document.querySelector('#bnTextMode .nj-go').click();
  document.querySelector('[data-nj-tag="SNY"]').click(); i.value = 'AMIEZV 3A XYZABC'; i.dispatchEvent(new Event('input')); document.querySelector('#bnTextMode .nj-go').click();
  return { hint, notes: document.getElementById('FaitsSaillants').value }; });
await p.evaluate(() => uiTab('load')); await p.waitForTimeout(400);
await p.evaluate(() => { const b = [...document.querySelectorAll('#ldmModal button, #ldmModal [role=tab]')].find(x => /^FINAL$/i.test(x.textContent.trim())); b && b.click(); }); await p.waitForTimeout(400);
o.box = await p.evaluate(() => { const b = document.getElementById('ldSnyBox'); return b.hidden ? 'hidden' : b.innerText.replace(/\s+/g, ' '); });
await p.screenshot({ path:(process.argv[2] || '.') + '/sny108.png' });
await p.evaluate(() => { const e = document.getElementById('Cie'); e.value = 'W6'; e.dispatchEvent(new Event('input', { bubbles:true })); syncSnyBox(); });
o.boxW6 = await p.evaluate(() => document.getElementById('ldSnyBox').hidden);
o.pass = /B738 5C=FWD B738 6A=MID B738 29F=AFT B38M 6A=FWD B38M 7A=MID B38M 35F=AFT A320 10A=FWD A320 21C=AFT B738 40A=null \| W6=null/.test(o.zones)
  && /SNY · DERUHU 12C MID$/m.test(o.add.notes) && /SNY · AMIEZV 3A FWD XYZABC$/m.test(o.add.notes) && /MID/.test(o.add.hint)
  && /^SNY FWD MID zone \?$/.test(o.box) && o.boxW6 === true;
console.log(JSON.stringify(o, null, 1)); console.log(errs.join(';') || 'no errors'); await b.close(); })();
