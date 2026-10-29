// v3.42 : l'onglet d'une rotation montre l'arrivée jusqu'au dernier débarqué, puis le départ
const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{ localStorage.setItem('whatsNewSeen','maj-2026-10-18c'); sessionStorage.setItem('pv_auth','1'); });
await p.goto('http://localhost:8803/'); await p.evaluate(()=>{ localStorage.clear(); localStorage.setItem('whatsNewSeen','maj-2026-10-18c'); }); await p.reload(); await p.waitForTimeout(4500);
const tabs = () => p.evaluate(()=>[...document.querySelectorAll('#tab-bar .flt-go')].map(x=>x.innerText.replace(/\s+/g,' ').trim()).join(' / '));
const o={};
o.debut = await tabs();
await p.evaluate(()=>{ const ids=JSON.parse(localStorage.flightTabs); const id=ids.find(i=>{ const d=JSON.parse(localStorage.getItem('tab-'+i)); return !d.DernierDebarque; }); switchTab(id); window._t=id; });
o.ouvert = await tabs();
await p.evaluate(()=>{ const e=document.getElementById('DernierDebarque'); e.value='12:00'; e.dispatchEvent(new Event('input',{bubbles:true})); });
await p.waitForTimeout(300); o.apresDernierDebarque = await tabs();
await p.evaluate(()=>{ const e=document.getElementById('DernierDebarque'); e.value=''; e.dispatchEvent(new Event('input',{bubbles:true})); });
await p.waitForTimeout(300); o.efface = await tabs();
await p.screenshot({path:'../s41/tab104.png', clip:{x:0,y:0,width:390,height:140}});
console.log(JSON.stringify(o,null,1)); console.log(errs.join(';')||'no errors'); await b.close(); })();
