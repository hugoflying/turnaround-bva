// v3.28 : vol pas encore arrivé → barre et anneau en attente, démarrage à l'AIBT
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp';
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{ localStorage.setItem('whatsNewSeen','maj-2026-10-30'); sessionStorage.setItem('pv_auth','1'); });
await p.goto('http://localhost:8803/'); await p.waitForTimeout(2500);
const r=await p.evaluate(async()=>{ const W=ms=>new Promise(r=>setTimeout(r,ms)); const o=[];
 const set=(id,v)=>{ const e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); };
 const ids=JSON.parse(localStorage.flightTabs); switchTab(ids[0]); uiTab('vol'); await W(300);
 window.refreshAKTab=async()=>{};
 const st=()=>{ const w=document.getElementById('fhProgWrap'), ring=document.querySelector('#tab-bar .flt.is-on .flt-cie'); return 'barre:'+(w.classList.contains('is-wait')?'attente':w.classList.contains('is-empty')?'vide':document.getElementById('fhProg').style.width)+' anneau:'+(ring.classList.contains('wait')?'attente':ring.style.getPropertyValue('--p')); };
 ['AIBT','AOBT'].forEach(f=>set(f,'')); set('SIBT','09:00'); set('SOBT','10:30'); await W(1300); o.push('pas arrivé '+st());
 set('AIBT','09:40'); await W(1300); o.push('AIBT '+st());
 set('AIBT',''); set('SIBT',''); await W(1300); o.push('sans arrivée '+st());
 // anneau d'un onglet en arrière-plan pas arrivé
 set('SIBT','09:00'); await W(200); saveCurrentTabData(); switchTab(ids[1]); await W(1300);
 const bg=document.querySelector('#tab-bar .flt[data-tab="'+ids[0]+'"] .flt-cie'); o.push('arrière-plan anneau:'+(bg.classList.contains('wait')?'attente':bg.style.getPropertyValue('--p')));
 switchTab(ids[0]); await W(300);
 return o.join(' | '); });
console.log(r, errs.length?'ERR '+errs.join(';'):''); await p.screenshot({path:out+'/wt.png', clip:{x:0,y:0,width:390,height:240}}); await b.close(); })();
