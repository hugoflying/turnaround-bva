// v3.21 : Guide LID en écran (sans image) : choix d'un cas, 6 cases, tableau replié
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const out = process.argv[2] || '/tmp';
(async () => {
  const b = await chromium.launch();
  for (const [w, h, name, dark] of [[400, 860, 'ph', false], [800, 1280, 'tab', false], [400, 860, 'ph-dark', true]]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.route(/\/api\/ak/, r => r.fulfill({ json: [] }));
    await p.goto('http://localhost:8803/'); await p.evaluate(d => { localStorage.clear(); localStorage.setItem('whatsNewSeen', 'maj-2026-10-18c'); sessionStorage.setItem('pv_auth', '1'); if (d) localStorage.setItem('theme', 'dark'); }, dark);
    await p.reload(); await p.waitForTimeout(6000);
    const r = await p.evaluate(async d => {
      const W = ms => new Promise(r => setTimeout(r, ms));
      if (d) setDarkMode(true);
      const ids = JSON.parse(localStorage.getItem('flightTabs'));
      const fr = ids.find(id => /^(FR|RK)$/i.test(JSON.parse(localStorage.getItem('tab-' + id) || '{}').Cie || ''));
      switchTab(fr); await W(300); openLDM('final'); await W(500);
      document.getElementById('lidGuideBtn').click(); await W(300);
      const box = document.getElementById('finalImageBox');
      const ok = [box.style.display !== 'none', document.querySelectorAll('#lidGuide .lg-c').length, document.querySelectorAll('#lidGuide .lg-t').length];
      document.querySelector('#lidGuide .lg-c[data-i="4"]').click(); await W(200);
      ok.push(document.querySelector('#lidGuide .lg-h b').textContent, [...document.querySelectorAll('#lidGuide .lg-t b')].map(x => x.textContent).join('/'), !!document.querySelector('#lidGuide .lg-note'));
      box.scrollIntoView({ block: 'start' }); window.scrollBy(0, -220); document.querySelector('#ldmModal .ldm-body, #ldmModal')?.scrollBy?.(0, -220); await W(300);
      window.__more = () => document.querySelector('#lidGuide .lg-more').click();
      return ok.join(' ');
    }, dark);
    console.log(name, r);
    await p.screenshot({ path: out + '/lg-' + name + '.jpg', type: 'jpeg', quality: 70 });
    await p.evaluate(async () => { window.__more(); await new Promise(r => setTimeout(r, 200)); document.querySelector('#lidGuide .lg-more').scrollIntoView({ block: 'start' }); });
    console.log(name, 'rows', await p.evaluate(() => document.querySelectorAll('#lidGuide .lg-tbl tr[data-i]').length));
    await p.screenshot({ path: out + '/lg-' + name + '-tbl.jpg', type: 'jpeg', quality: 70 });
    continue;
    await p.screenshot({ path: out + '/lg-' + name + '.jpg', type: 'jpeg', quality: 70 });
    await p.close();
  }
  await b.close();
})();
