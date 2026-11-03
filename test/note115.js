// v3.56.3 : le texte tapé (pas encore envoyé) dans Notes > Clavier reste sur son vol, il ne suit plus les autres onglets
// Usage : node test/note115.js (serveur statique du repo sur http://localhost:8803)
const { chromium } = require('playwright');
(async () => {
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
await ctx.route('https://timing-demo.pages.dev/**', r => r.fulfill({ status:200, contentType:'application/json', body:'{"at":0,"cfg":null}' }));
await ctx.addInitScript(() => { sessionStorage.setItem('pv_auth', '1'); localStorage.setItem('whatsNewSeen', 'maj-2026-10-30'); });
let p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8803/'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('whatsNewSeen', 'maj-2026-10-30'); }); await p.reload(); await p.waitForTimeout(4500);
const step = async () => p.evaluate(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  const ids = JSON.parse(localStorage.flightTabs), inp = document.querySelector('#bnTextMode .nj-input');
  const val = () => document.querySelector('#bnTextMode .nj-input').value;
  const tag = () => document.querySelector('#bnTextMode .nj-tag b')?.textContent;
  uiOpenFlight(ids[0]); uiTab('notes'); await w(300);
  inp.value = '28 embarq arriere'; inp.dispatchEvent(new Event('input', { bubbles:true }));
  uiOpenFlight(ids[1]); await w(200); const other = val();
  document.querySelector('#bnTextMode [data-nj-tag="PMR"]').click(); inp.value = 'WCHR 3A'; inp.dispatchEvent(new Event('input', { bubbles:true }));
  uiOpenFlight(ids[0]); await w(200); const back = val(), backTag = document.querySelector('#bnTextMode .nj-tag').hidden ? '' : tag();
  uiOpenFlight(ids[1]); await w(200); const b2 = val(), b2Tag = tag();
  return { other, back, backTag, b2, b2Tag };
});
const r = await step();
const r2 = await p.evaluate(() => { const ids = JSON.parse(localStorage.flightTabs), d = JSON.parse(localStorage.njDraft || '{}'); return { a: d[ids[0]]?.t }; });   // gardé dans localStorage (survit à la fermeture de l'app)
const ok = r.other === '' && r.back === '28 embarq arriere' && r.backTag === '' && r.b2 === 'WCHR 3A' && r.b2Tag === 'PMR' && r2.a === '28 embarq arriere' && !errs.length;
console.log(JSON.stringify(r), JSON.stringify(r2), errs.join(' | ') || 'no errors'); console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1); })();
