// v3.38 : vol annulé → ligne barrée, confirmation avant ouverture, pastille ANNULÉ dans l'en-tête et onglet barré
const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{ localStorage.setItem('whatsNewSeen','maj-2026-10-30'); sessionStorage.setItem('pv_auth','1'); localStorage.setItem('oldAskDay', new Date(Date.now()-3*36e5).toDateString()); });
await p.goto('http://localhost:8803/'); await p.waitForTimeout(2500);
await p.evaluate(()=>openAKPicker()); await p.waitForTimeout(1500);
const o = await p.evaluate(()=>({ rows:[...document.querySelectorAll('.akc-cx .akc-fn')].map(x=>x.textContent).join(','), tabs:JSON.parse(localStorage.flightTabs).length }));
await p.screenshot({path:process.argv[2]+'/cx-list.png'});
await p.click('.akc-cx.akc-dep'); await p.waitForTimeout(300);
o.modal = await p.evaluate(()=>document.getElementById('akCxModal').style.display + ' ' + document.querySelector('.akcx-t').textContent);
await p.screenshot({path:process.argv[2]+'/cx-modal.png'});
await p.click('.akcx-no'); await p.waitForTimeout(200);
o.afterRetour = await p.evaluate(()=>JSON.parse(localStorage.flightTabs).length);
await p.click('.akc-cx.akc-dep'); await p.click('.akcx-ok'); await p.waitForTimeout(1200);
o.afterOpen = await p.evaluate(()=>({ tabs:JSON.parse(localStorage.flightTabs).length, ak:document.getElementById('AkAnnule').value, hero:document.getElementById('fhCx').hidden?'':document.getElementById('fhCx').textContent, tabCx:!!document.querySelector('#tab-bar .flt.is-on.is-cx') }));
await p.screenshot({path:process.argv[2]+'/cx-open.png'});
console.log(JSON.stringify(o)); console.log(errs.join(';')||'no errors'); await b.close(); })();
