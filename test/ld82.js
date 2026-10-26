// v3.20 : eLID FR → pas de section Zones, TOB pas en rouge ; poids corrigé seulement avec des GB
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 400, height: 860 } });
  await p.route(/\/api\/ak/, r => r.fulfill({ json: [] }));
  await p.goto('http://localhost:8803/'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('whatsNewSeen', 'x'); sessionStorage.setItem('pv_auth', '1'); });
  await p.reload(); await p.waitForTimeout(6000);
  const r = await p.evaluate(async () => {
    const W = ms => new Promise(r => setTimeout(r, ms));
    const ids = JSON.parse(localStorage.getItem('flightTabs'));
    const fr = ids.find(id => /^(FR|RK)$/i.test(JSON.parse(localStorage.getItem('tab-' + id) || '{}').Cie || ''));
    switchTab(fr); await W(300); openLDM('final'); await W(400);
    const vis = id => { const e = document.getElementById(id); return !!e && e.offsetParent !== null; };
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
    const out = [];
    switchLidMode('LID'); await W(200); switchLidMode('ELID'); await W(300);
    set('FinalGB', ''); await W(1200);
    out.push('elid zones:' + vis('ldZonesBox'), 'tobInvalid:' + document.getElementById('FinalTOB').classList.contains('is-invalid'), 'pcNoGB:' + vis('FinalPoidsCorrige'));
    set('FinalGB', '2'); await W(1200); out.push('pcGB:' + vis('FinalPoidsCorrige'));
    switchLidMode('LID'); await W(1200); out.push('paper zones:' + vis('ldZonesBox'));
    return out.join(' ');
  });
  console.log(r); await b.close();
})();
