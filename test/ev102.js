// v3.41.5 : un événement ouvert (vide) reste sur son vol, pas sur les autres
const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{ localStorage.setItem('whatsNewSeen','maj-2026-10-30'); sessionStorage.setItem('pv_auth','1'); });
await p.goto('http://localhost:8803/'); await p.evaluate(()=>{ localStorage.clear(); localStorage.setItem('whatsNewSeen','maj-2026-10-30'); }); await p.reload(); await p.waitForTimeout(4500);
const st = () => p.evaluate(()=>['gpu','push','tapis'].map(k=>k+':'+(document.getElementById('panel-'+k).style.display!=='none'?'ouvert':'-')).join(' '));
const o={};
await p.evaluate(()=>{ const ids=JSON.parse(localStorage.flightTabs); switchTab(ids[0]); toggleDepExtra('gpu'); toggleDepExtra('tapis'); });
o.vol1 = await st();
await p.evaluate(()=>switchTab(JSON.parse(localStorage.flightTabs)[1])); o.vol2 = await st();
await p.evaluate(()=>toggleDepExtra('push')); o.vol2b = await st();
await p.evaluate(()=>switchTab(JSON.parse(localStorage.flightTabs)[0])); o.retourVol1 = await st();
await p.evaluate(()=>switchTab(JSON.parse(localStorage.flightTabs)[1])); o.retourVol2 = await st();
await p.reload(); await p.waitForTimeout(3000);
await p.evaluate(()=>switchTab(JSON.parse(localStorage.flightTabs)[0])); o.apresRechargeVol1 = await st();
await p.evaluate(()=>createNewTab()); o.nouveauVol = await st();
console.log(JSON.stringify(o,null,1)); console.log(errs.join(';')||'no errors'); await b.close(); })();
