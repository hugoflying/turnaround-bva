// v3.39 : démo = saisies gardées jusqu'à Réinitialiser (plus de remise à zéro 4 h) + scénario « Vols de démo » de l'admin
const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
await p.addInitScript(()=>{ localStorage.setItem('whatsNewSeen','maj-2026-10-30'); sessionStorage.setItem('pv_auth','1'); });
await p.goto('http://localhost:8803/'); await p.evaluate(()=>{ localStorage.clear(); localStorage.setItem('whatsNewSeen','maj-2026-10-30'); }); await p.reload(); await p.waitForTimeout(4500);
const o={};
o.def = await p.evaluate(()=>JSON.parse(localStorage.flightTabs).map(id=>JSON.parse(localStorage.getItem('tab-'+id)).NVol).join(','));
// saisie gardée après 5 h
await p.evaluate(()=>{ const id=JSON.parse(localStorage.flightTabs)[0]; switchTab(id); const e=document.getElementById('Parking'); e.value='99'; e.dispatchEvent(new Event('input',{bubbles:true})); saveCurrentTabData(); window._t0=String(Date.now()-5*3600e3); localStorage.setItem('demoT0', window._t0); sessionStorage.setItem('t0', window._t0); });
await p.reload(); await p.waitForTimeout(2500);
o.kept5h = await p.evaluate(()=>JSON.parse(localStorage.getItem('tab-'+JSON.parse(localStorage.flightTabs)[0])).Parking + ' T0 gardé=' + (localStorage.demoT0===sessionStorage.getItem('t0')));
// scénario admin
await p.goto('http://localhost:8803/admin.html'); await p.waitForTimeout(600);
await p.evaluate(()=>{ go('demo'); const f=dEdit(); f.forEach(x=>x.open=false);
  f[0]=Object.assign(f[0],{open:true,cie:'W6',arr:'4401',dep:'4402',ap:'KUT',type:'A321',park:'15',sibt:'-30',aibt:'-25',sobt:'+10',ctot:'',aobt:'non',fill:'auto',dl:''});
  f[1]=Object.assign(f[1],{open:true,cie:'FR',arr:'100',dep:'101',ap:'DUB',sibt:'+20',aibt:'non',sobt:'+45',fill:'none',dl:''});
  save(); render(); publish(); });
await p.screenshot({path:process.argv[2]+'/demo-admin.png'});
await p.goto('http://localhost:8803/'); await p.waitForTimeout(3000);
o.scen = await p.evaluate(()=>JSON.parse(localStorage.flightTabs).map(id=>{ const d=JSON.parse(localStorage.getItem('tab-'+id)); return [d.Cie+d.NVol,d.From,d.Parking,'AIBT='+(d.AIBT||'-'),'AOBT='+(d.AOBT||'-'),'PremDeb='+(d.PremierDebarque||'-'),'ArrBAGS='+(d.ArrBAGS||'-')].join(' '); }));
o.list = await p.evaluate(async()=>{ openAKPicker(); await new Promise(r=>setTimeout(r,1500)); return document.querySelectorAll('#akList .akc-row').length; });
await p.evaluate(()=>localStorage.removeItem('adminCfg'));
console.log(JSON.stringify(o,null,1)); console.log(errs.join(';')||'no errors'); await b.close(); })();
