// v3.34 : compagnie depuis l'indicatif OACI quand AK n'a pas de numéro (RYR → FR, WMT → W4, privé → aucune)
const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{ localStorage.setItem('whatsNewSeen','maj-2026-10-18c'); sessionStorage.setItem('pv_auth','1'); });
await p.goto('http://localhost:8803/'); await p.waitForTimeout(2500);
console.log(await p.evaluate(async()=>{ const W=ms=>new Promise(r=>setTimeout(r,ms)); const o=[];
 const t=new Date(Date.now()+3*36e5).toISOString();
 const mk=(id,cs,ff,reg)=>({ id, callsign:cs, fullFlightNumber:ff, reg, sibt:t, adepIata:'LEY', acTypeIcao:'B38M', pkg:'P3' });
 window.akDemoData = flow => flow==='ARR' ? [mk('a1','SUZ9','', 'PHZIZ'), mk('a2','RYR2LT','', 'EIABC'), mk('a3','WMT5AB','', '9HWAB'), mk('a4','RYR77','FR7703','EIXYZ')] : [];
 openAKPicker(); await W(1200);
 o.push('pastilles: '+[...document.querySelectorAll('#akFilters .akc-chip')].map(c=>c.textContent).filter(Boolean).join(','));
 for(const id of ['a2','a1']){ try{ _akClickFlight(id,'ARR'); }catch(e){ o.push('err '+e.message); } await W(1500);
   const ok=document.getElementById('akConfirm')||document.querySelector('#akPopover .btn-primary'); 
   o.push(id+' Cie='+JSON.stringify(document.getElementById('Cie').value)+' NVol='+document.getElementById('NVol').value+' onglet='+(document.querySelector('#tab-bar .flt.is-on .flt-cie b')||{}).textContent);
   openAKPicker(); await W(800); }
 return o.join(' | '); }), errs.join(';'));
await b.close(); })();
