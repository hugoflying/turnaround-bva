// v3.30/v3.31 : temps depuis l'AOBT, avec la date du vol (sinon modulo 24 h) ; parti depuis 30 min = quitte la bande
const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844}});
await p.addInitScript(()=>{ localStorage.setItem('whatsNewSeen','maj-2026-10-18c'); sessionStorage.setItem('pv_auth','1'); });
await p.goto('http://localhost:8803/'); await p.waitForTimeout(2500);
console.log(await p.evaluate(async()=>{ const W=ms=>new Promise(r=>setTimeout(r,ms)); const o=[];
 const ids=JSON.parse(localStorage.flightTabs); const A=ids[0], B=ids[1];
 const hm=m=>{ m=((Math.round(m)%1440)+1440)%1440; return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); };
 switchTab(B); await W(300);
 for(const [lbl,ago] of [['il y a 14 h',840],['il y a 20 h',1200],['il y a 10 min',10],['il y a 45 min',45]]){
   const d=JSON.parse(localStorage.getItem('tab-'+A)); d.AOBT=hm(clockMin()-ago); d.SOBT=d.AOBT; d.Date=''; localStorage.setItem('tab-'+A, JSON.stringify(d));
   o.push(lbl+' sans date:'+(uiTabState(A)||'en cours'));
 }
 const iso=t=>{ const x=new Date(t); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
 for(const [lbl,ago] of [['daté, il y a 10 min',10],['daté, il y a 45 min',45],['daté veille, il y a 24 h 10',1450],['daté veille, il y a 14 h',840]]){
   const t=Date.now()-ago*60000, d=JSON.parse(localStorage.getItem('tab-'+A)); d.AOBT=hm(clockMin()-ago); d.SOBT=d.AOBT; d.Date=iso(t); localStorage.setItem('tab-'+A, JSON.stringify(d));
   o.push(lbl+':'+(uiTabState(A)||'en cours'));
 }
 return o.join(' | '); }));
await b.close(); })();
