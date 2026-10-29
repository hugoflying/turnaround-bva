// v3.41.3 : Android, case du LOAD sous l'en-tête collé → ramenée entre l'en-tête et le clavier
const { chromium, devices } = require('playwright');
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext({...devices['Galaxy S9+'], viewport:{width:412,height:880}, userAgent:'Mozilla/5.0 (Linux; Android 14; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'}); const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{ localStorage.setItem('whatsNewSeen','maj-2026-10-18c'); sessionStorage.setItem('pv_auth','1'); });
await p.goto('http://localhost:8803/'); await p.evaluate(()=>{ localStorage.clear(); localStorage.setItem('whatsNewSeen','maj-2026-10-18c'); }); await p.reload(); await p.waitForTimeout(4500);
const o={};
await p.evaluate(()=>{ const ids=JSON.parse(localStorage.flightTabs); switchTab(ids[1]); uiTab('load'); });   // W4 : champs PreviPOIDS_OTHER
await p.waitForTimeout(600);
await p.evaluate(()=>{ const t=[...document.querySelectorAll('.ldm-tabs *, [data-ldm], button')].find(x=>x.textContent.trim()==='PREVI'); if(t) t.click(); });
await p.waitForTimeout(400);
const info = () => p.evaluate(()=>{ const el=document.activeElement, r=el.getBoundingClientRect(), h=document.querySelector('.ldm-header').getBoundingClientRect(), fh=document.querySelector('.fixed-header').getBoundingClientRect(); return {id:el.id, top:Math.round(r.top), bottom:Math.round(r.bottom), headerBottom:Math.round(Math.max(fh.bottom,h.bottom)), vh:innerHeight}; });
await p.evaluate(()=>{ const el=document.getElementById('PreviPOIDS_OTHER'); el.focus({preventScroll:true}); const r=el.getBoundingClientRect(); window.scrollBy(0, r.top - 90); });   // Chrome Android la place sous l'en-tête
o.before = await info();
await p.setViewportSize({width:412,height:470}); await p.waitForTimeout(900);
o.after = await info();
// case du bas sous le clavier
await p.evaluate(()=>{ const el=document.getElementById('PreviPoussettesPorte'); el.focus({preventScroll:true}); const r=el.getBoundingClientRect(); window.scrollBy(0, r.top - 520); });
await p.waitForTimeout(900); o.bottomCase = await info(); await p.screenshot({path:'../s41/kb.png'});
console.log(JSON.stringify(o)); console.log(errs.join(';')||'no errors'); await b.close(); })();
