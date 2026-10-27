// v3.29 : la timeline ne se recale plus toute seule quand Now est hors de l'escale ; Suivre Now marche toujours
const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{ localStorage.setItem('whatsNewSeen','maj-2026-10-18c'); sessionStorage.setItem('pv_auth','1'); localStorage.removeItem('tlFollowNow'); });
await p.goto('http://localhost:8803/'); await p.waitForTimeout(2500);
console.log(await p.evaluate(async()=>{ const W=ms=>new Promise(r=>setTimeout(r,ms)); const o=[];
 const ids=JSON.parse(localStorage.flightTabs); switchTab(ids[0]); uiTab('timing'); switchTimingPanel('tl'); await W(500);
 const sc=document.getElementById('timelineScroll');
 timelineZoom=2; renderTimeline(); await W(200);
 sc.scrollLeft=0; window._tlLastTouch=Date.now()-20000; renderTimeline(); await W(100);
 o.push('Now dans l escale, inactif: recentre='+(sc.scrollLeft>0));
 sc.dispatchEvent(new Event('touchstart')); sc.scrollLeft=5; await W(200); window._tlLastTouch=Date.now()-3000; renderTimeline(); await W(100);
 o.push('geste récent: garde='+(sc.scrollLeft===5));
 // vol fini : heures loin de maintenant
 const set=(id,v)=>{ const e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); };
 const h=Math.floor(clockMin()/60), f=x=>String((h+x+24)%24).padStart(2,'0');
 document.querySelectorAll('input').forEach(e=>{ if(/^\d{1,2}:\d{2}$/.test(e.value)) e.value=''; }); const sv=(id,v)=>{ document.getElementById(id).value=v; }; sv('SIBT','07:00'); sv('AIBT','07:00'); sv('SOBT','07:40'); sv('AOBT','07:45'); await W(300);
 const R=Date, off=((((15-h)%24)+24)%24)*3600e3; window.Date=class extends R{ constructor(...a){ if(a.length) super(...a); else super(R.now()+off); } static now(){ return R.now()+off; } };
 renderTimeline(); await W(100); sc.scrollLeft=7; await W(200); window._tlLastTouch=Date.now()-60000; renderTimeline(); await W(100);
 o.push('vol fini, 60 s après: garde='+(sc.scrollLeft===7));
 return o.join(' | '); }), errs.join(';'));
await b.close(); })();
