// v3.30 : vol parti il y a plus de 12 h (veille au soir) = quitte la bande ; parti à l'instant = reste
const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844}});
await p.addInitScript(()=>{ localStorage.setItem('whatsNewSeen','maj-2026-10-18c'); sessionStorage.setItem('pv_auth','1'); });
await p.goto('http://localhost:8803/'); await p.waitForTimeout(2500);
console.log(await p.evaluate(async()=>{ const W=ms=>new Promise(r=>setTimeout(r,ms)); const o=[];
 const ids=JSON.parse(localStorage.flightTabs); const A=ids[0], B=ids[1];
 const hm=m=>{ m=((Math.round(m)%1440)+1440)%1440; return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); };
 switchTab(B); await W(300);
 for(const [lbl,ago] of [['il y a 14 h',840],['il y a 20 h',1200],['il y a 10 min',10],['il y a 45 min',45]]){
   const d=JSON.parse(localStorage.getItem('tab-'+A)); d.AOBT=hm(clockMin()-ago); localStorage.setItem('tab-'+A, JSON.stringify(d));
   o.push(lbl+':'+(uiTabState(A)||'en cours'));
 }
 return o.join(' | '); }));
await b.close(); })();
