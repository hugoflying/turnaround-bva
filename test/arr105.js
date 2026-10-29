// v3.43 : pastille SIBT (rouge = SIBT dépassée sans AIBT, vert = avant, rien avec AIBT)
const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{ localStorage.setItem('whatsNewSeen','maj-2026-10-18c'); sessionStorage.setItem('pv_auth','1'); });
await p.goto('http://localhost:8803/'); await p.evaluate(()=>{ localStorage.clear(); localStorage.setItem('whatsNewSeen','maj-2026-10-18c'); }); await p.reload(); await p.waitForTimeout(4500);
const st = () => p.evaluate(()=>{ uiSyncArrDot(); const w=document.querySelector('.time-wrap[data-id="SIBT"]'); return w.classList.contains('arr-late')?'rouge':w.classList.contains('arr-ok')?'vert':'rien'; });
const set = (id,v) => p.evaluate(([id,v])=>{ const e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event('change',{bubbles:true})); },[id,v]);
const hm = d => p.evaluate(d=>{ const n=new Date(Date.now()+d*60000), u=isUTC; const h=u?n.getUTCHours():n.getHours(), m=u?n.getUTCMinutes():n.getMinutes(); return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'); }, d);
const o={};
await set('AIBT',''); await set('SIBT', await hm(-53)); o.passee53 = await st();
await p.evaluate(()=>{ uiTab('vol'); window.scrollTo(0,0); }); await p.waitForTimeout(400);
await p.screenshot({path:'../s41/arr105.png', clip:{x:0,y:0,width:390,height:560}});
await set('SIBT', await hm(20)); o.dans20 = await st();
await set('SIBT', await hm(0)); o.maintenant = await st();
await set('SIBT', await hm(-53)); await set('AIBT', await hm(-2)); o.avecAIBT = await st();
await set('SIBT',''); await set('AIBT',''); o.sansSIBT = await st();
console.log(JSON.stringify(o)); console.log(errs.join(';')||'no errors'); await b.close(); })();
