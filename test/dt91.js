// v3.33 : heures rattachées à la date du vol (Récap, barre, anneau, timeline) ; sans date = ancien calcul
const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{ localStorage.setItem('whatsNewSeen','maj-2026-10-18c'); sessionStorage.setItem('pv_auth','1'); });
await p.goto('http://localhost:8803/'); await p.waitForTimeout(2500);
console.log(await p.evaluate(async()=>{ const W=ms=>new Promise(r=>setTimeout(r,ms)); const o=[];
 window.refreshAKTab=async()=>{};
 const ids=JSON.parse(localStorage.flightTabs); const A=ids[0]; switchTab(A); uiTab('vol'); await W(300);
 const hm=m=>{ m=((Math.round(m)%1440)+1440)%1440; return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); };
 const iso=t=>{ const x=new Date(t); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
 const sv=(id,v)=>{ const e=document.getElementById(id); e.value=v; };
 // Vol « hier soir » : SIBT −14h25, AIBT −14h45, AOBT −14h11, SOBT −13h55 (comme FR7704)
 const setFlight=async(shiftH, date)=>{ const c=clockMin()-shiftH*60;
   sv('SIBT',hm(c-30)); sv('AIBT',hm(c-50)); sv('SOBT',hm(c)); sv('AOBT',hm(c-16)); sv('Date', date);
   document.getElementById('SOBT').dispatchEvent(new Event('change',{bubbles:true})); await W(1300); saveCurrentTabData(); };
 const bar=()=>{ const w=document.getElementById('fhProgWrap'); return w.classList.contains('is-empty')?'vide':Math.round(parseFloat(document.getElementById('fhProg').style.width))+'%'; };
 await setFlight(14, iso(Date.now()-14*36e5));
 o.push('veille: barre '+bar()+' état onglet:'+(uiTabState(A)||'-')+' NOW timeline:'+(()=>{ switchTimingPanel('tl'); renderTimeline(); return !!document.querySelector('.tl-now-line'); })());
 uiTab('vol'); await setFlight(0.2, iso(Date.now()));
 o.push('aujourd hui (parti il y a 28 min): barre '+bar()+' état onglet:'+(uiTabState(A)||'-'));
 await setFlight(14, '');
 o.push('sans date (repli): barre '+bar());
 return o.join(' | '); }), errs.join(';'));
await b.close(); })();
