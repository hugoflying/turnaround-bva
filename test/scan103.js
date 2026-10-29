// v3.41.6 : événement Embarquement (premier / dernier scanné) sous Nayak
const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{ localStorage.setItem('whatsNewSeen','maj-2026-10-18c'); sessionStorage.setItem('pv_auth','1'); });
await p.goto('http://localhost:8803/'); await p.evaluate(()=>{ localStorage.clear(); localStorage.setItem('whatsNewSeen','maj-2026-10-18c'); }); await p.reload(); await p.waitForTimeout(4500);
const o={};
o.list = await p.evaluate(async()=>{ uiTab('timing'); switchTimingPanel('dep'); uiEvOpen('dep'); await new Promise(r=>setTimeout(r,400)); return [...document.querySelectorAll('.ev-list [data-k]')].map(x=>x.dataset.k).join(','); });
await p.screenshot({path:'../s41/scan-sheet.png'});
await p.evaluate(()=>{ document.querySelector('.ev-list [data-k="scan"]').click(); });
await p.waitForTimeout(400);
await p.evaluate(()=>{ const s=(id,v)=>{const e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event('input',{bubbles:true}));}; s('PremierScanne','12:00'); s('DernierScanne','12:14'); saveCurrentTabData(); });
o.panel = await p.evaluate(()=>document.getElementById('panel-scan').style.display+' '+document.querySelector('#panel-scan .ev-h').innerText.replace(/\s+/g,' '));
o.vals = await p.evaluate(()=>[document.getElementById('PremierScanne').value, document.querySelectorAll('[id=PremierScanne]').length, JSON.parse(localStorage.getItem('tab-'+currentTabId)).PremierScanne]);
o.tl = await p.evaluate(()=>{ switchTimingPanel('tl'); renderTimeline(); return /Scan embarquement/.test(document.getElementById('timelineCard').innerText); });
await p.evaluate(()=>switchTimingPanel('dep')); await p.screenshot({path:'../s41/scan-panel.png'});
console.log(JSON.stringify(o)); console.log(errs.join(';')||'no errors'); await b.close(); })();
