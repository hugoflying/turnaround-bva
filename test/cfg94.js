// v3.36 : admin compagnies (démo). 1) réglages d'origine publiés = app identique ; 2) une modification change bien EOBT, HLE, types et cibles
const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{ localStorage.setItem('whatsNewSeen','maj-2026-10-30'); sessionStorage.setItem('pv_auth','1'); });
await p.goto('http://localhost:8803/admin.html'); await p.waitForTimeout(400);
const DEF = await p.evaluate(()=>JSON.stringify(DEFAULTS));
await p.evaluate(()=>{ localStorage.removeItem('adminCfg'); localStorage.removeItem('adminCfgDraft'); });
await p.goto('http://localhost:8803/'); await p.waitForTimeout(2500);
const out = await p.evaluate(async(DEF)=>{ const W=ms=>new Promise(r=>setTimeout(r,ms));
  const R=Date, T0=new R(2026,9,28,9,50).getTime(); window.Date=class extends R{ constructor(...a){ if(a.length) super(...a); else super(T0); } static now(){ return T0; } };
  const ids=JSON.parse(localStorage.flightTabs); switchTab(ids[0]); uiTab('timing'); switchTimingPanel('tl'); await W(300);
  const sv=(id,v)=>{ const e=document.getElementById(id); if(e) e.value=v; };
  const combos=[];
  for(const c of ['FR','RK','W6','W4','V7','H4','U5']) for(const t of ['B738','A320','A321','A21N','A319','']) for(const from of ['ORY','BVA']) for(const crew of ['','09:05']) for(const aibt of ['09:00','09:20']) for(const lid of ['ELID','PAPER'])
    combos.push({c,t,from,crew,aibt,lid});
  const snap=()=>combos.map(k=>{ sv('Cie',k.c); sv('TypeAvion',k.t); sv('From',k.from); sv('To','BVA'===k.from?'MAD':'BVA'); sv('SIBT','09:00'); sv('AIBT',k.aibt); sv('SOBT','09:40'); sv('ArrPNT',k.crew); sv('Date','2026-10-28');
    try{ setLidMode(k.lid); }catch(e){}
    updateEOBT(); try{ updateHLE&&updateHLE(); }catch(e){} try{ typeof updateTimers==='function'&&updateTimers(); }catch(e){} renderTimeline();
    return JSON.stringify(k)+'|'+document.getElementById('timer-eobt').textContent+'|'+(document.getElementById('timer-h40')||{}).textContent+'|'+document.getElementById('timelineCanvas').innerHTML+'|'+document.getElementById('timelineLabelCol').innerText; });
  const A=snap();
  localStorage.setItem('adminCfg',DEF); cfgLoad(); const B=snap();
  const diff=A.map((x,i)=>x===B[i]?null:x+'  ≠  '+B[i]).filter(Boolean);
  // 2) modification : W6 A321 rotation 40, HLE 50, A321 embarquement −20, nouvelle compagnie U2 (EZY)
  const cfg=JSON.parse(DEF); cfg.al.W6.hle=50; cfg.al.W6.types.A321.mtt=40; cfg.al.W6.types.A321.steps.find(s=>s.k==='Embarquement').a[1]=-20;
  cfg.al.U2={n:'easyJet',icao:'EZY',hle:45,types:{A320:{mtt:28,crew:null,steps:[{k:'Embarquement',a:['EOBT',-25],b:['EOBT',-6]}]}}};
  localStorage.setItem('adminCfg',JSON.stringify(cfg)); cfgLoad(); cfgPatchUI();
  sv('Cie','W6'); sv('TypeAvion','A321'); sv('From','ORY'); sv('To','BVA'); sv('SIBT','09:00'); sv('AIBT','09:05'); sv('SOBT','09:40'); sv('ArrPNT','');
  updateEOBT(); try{ typeof updateTimers==='function'&&updateTimers(); }catch(e){} renderTimeline(); await W(50);
  const tlMod=document.getElementById('timelineCanvas').innerHTML;
  const e1=document.getElementById('timer-eobt').textContent, h1=(document.getElementById('timer-h40')||{}).textContent;
  syncIvChips(); const typesW6=[...document.querySelectorAll('#ivTypeChips button[data-v]')].map(x=>x.dataset.v).join(',');
  sv('Cie','U2'); syncIvChips(); const typesU2=[...document.querySelectorAll('#ivTypeChips button[data-v]')].map(x=>x.dataset.v).join(',');
  const chipU2=!!document.querySelector('#ivCieChips button[data-v="U2"]'), cs=cieFromFF('EZY12AB');
  sv('TypeAvion','A320'); updateEOBT(); renderTimeline(); const e2=document.getElementById('timer-eobt').textContent;
  const lbl=document.getElementById('timelineLabelCol').innerText.replace(/\s+/g,' ');
  localStorage.removeItem('adminCfg'); cfgLoad();
  sv('Cie','W6'); sv('TypeAvion','A321'); sv('AIBT','09:05'); updateEOBT(); renderTimeline(); const tlOrig=document.getElementById('timelineCanvas').innerHTML;
  return {tlChanged: tlMod!==tlOrig,n:combos.length, diff:diff.slice(0,5), nd:diff.length, e1, h1, typesW6, typesU2, chipU2, cs, e2, lbl};
}, DEF);
console.log(JSON.stringify(out,null,1)); console.log(errs.join(';')||'no errors');
await b.close(); })();
