// v3.25 : FUEL, plusieurs UPLIFT (ajout, total, ×, persistance par vol)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const out = process.argv[2] || '/tmp';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 400, height: 860 } });
  await p.route(/\/api\/ak/, r => r.fulfill({ json: [] }));
  await p.goto('http://localhost:8803/'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('whatsNewSeen', 'maj-2026-10-30'); sessionStorage.setItem('pv_auth', '1'); });
  await p.reload(); await p.waitForTimeout(6000);
  const r = await p.evaluate(async () => {
    const W = ms => new Promise(r => setTimeout(r, ms));
    const ids = JSON.parse(localStorage.getItem('flightTabs')); const A = ids[0], B = ids[1];
    switchTab(A); await W(300); openLDM('fuel'); await W(500);
    const vis = id => { const e = document.getElementById(id); return !!e && e.offsetParent !== null; };
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
    const o = [];
    o.push('debut u2:' + vis('FuelUplift2') + ' add:' + vis('upAdd'));
    set('FuelUplift', '3000');
    document.getElementById('upAdd').click(); await W(100); set('FuelUplift2', '1200');
    document.getElementById('upAdd').click(); await W(100); set('FuelUplift3', '500');
    o.push('u2:' + vis('FuelUplift2') + ' u3:' + vis('FuelUplift3') + ' tot:' + document.getElementById('upTot').textContent);
    document.querySelector('.up-x[data-k="3"] .up-del').click(); await W(100);
    o.push('apres× u3:' + vis('FuelUplift3') + ' tot:' + document.getElementById('upTot').textContent);
    saveCurrentTabData(); switchTab(B); await W(300); openLDM('fuel'); await W(1200);
    o.push('volB u2:' + vis('FuelUplift2') + ' val:' + document.getElementById('FuelUplift2').value);
    switchTab(A); await W(300); openLDM('fuel'); await W(1200);
    o.push('retourA u2:' + document.getElementById('FuelUplift2').value + ' tot:' + document.getElementById('upTot').textContent);
    return o.join(' | ');
  });
  console.log(r); await p.screenshot({ path: out + '/up.jpg', type: 'jpeg', quality: 75 }); await b.close();
})();
