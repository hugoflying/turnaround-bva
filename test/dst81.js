// v3.19 : jour du passage à l'heure d'hiver (25/10/2026), FR AIBT 19:50 → EOBT 20:15 ; à 20:00:05 il reste 14:55 (pas +45:05)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, timezoneId: 'Europe/Paris' });
  const p = await ctx.newPage();
  await p.addInitScript(() => { const RD = Date; const off = new RD('2026-10-25T20:00:05+01:00').getTime() - RD.now();
    class D extends RD { constructor(...a) { if (a.length) super(...a); else super(RD.now() + off); } static now() { return RD.now() + off; } } window.Date = D; });
  await p.route(/\/api\/ak/, r => r.fulfill({ json: [] }));
  await p.goto('http://localhost:8803/'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('whatsNewSeen', 'x'); sessionStorage.setItem('pv_auth', '1'); });
  await p.reload(); await p.waitForTimeout(6000);
  const r = await p.evaluate(async () => {
    const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } return !!e; };
    const ok = [set('Date', '2026-10-25'), set('Cie', 'FR'), set('From', 'RBA'), set('SIBT', '18:20'), set('SOBT', '18:45'), set('AOBT', ''), set('AIBT', '19:50')];
    try { updateAllCalculations(); } catch (e) {}
    await new Promise(r => setTimeout(r, 1500));
    return ok.join(',') + ' eobt=' + document.getElementById('timer-eobt')?.textContent + ' cd=' + document.getElementById('timer-cd')?.textContent;
  });
  console.log(r); await b.close();
})();
