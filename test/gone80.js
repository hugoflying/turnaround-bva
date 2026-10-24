// v3.18 : un vol parti rouvert depuis Récap reste ouvert quand on change d'onglet du bas
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 400, height: 860 } });
  await p.route(/\/api\/ak/, r => r.fulfill({ json: [] }));
  await p.goto('http://localhost:8803/'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('whatsNewSeen', 'x'); sessionStorage.setItem('pv_auth', '1'); });
  await p.reload(); await p.waitForTimeout(6000);
  const r = await p.evaluate(async () => {
    const W = ms => new Promise(r => setTimeout(r, ms));
    const ids = JSON.parse(localStorage.getItem('flightTabs')); const gone = String(ids[0]);
    switchTab(gone);
    const n = new Date(Date.now() - 40 * 60000), hm = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
    const s = new Date(Date.now() - 50 * 60000), sh = String(s.getHours()).padStart(2, '0') + ':' + String(s.getMinutes()).padStart(2, '0');
    document.getElementById('SOBT').value = sh; document.getElementById('AOBT').value = hm; saveCurrentTabData();
    uiTab('vols'); await W(300); uiTab('vol'); await W(300);
    const after1 = String(currentTabId);           // doit avoir quitté le vol parti
    uiOpenFlight(gone); await W(300);
    const out = [after1 !== gone, String(currentTabId) === gone];
    for (const t of ['timing', 'retard', 'vol', 'vols', 'vol']) { uiTab(t); await W(300); out.push(t + ':' + (String(currentTabId) === gone)); }
    window.uiTabsSync(); await W(200);
    out.push('tabVisible:' + !!document.querySelector('#tab-bar .flt[data-tab="' + gone + '"]'));
    return out;
  });
  console.log(r.join(' ')); await b.close();
})();
