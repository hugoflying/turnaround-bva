// v3.40 : « Publier » écrit config.json via l'API GitHub (simulée) ; un autre visiteur reçoit les réglages au lancement
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const CFG = path.join(__dirname, '..', 'config.json');
(async()=>{ const b=await chromium.launch(); const errs=[]; let put=null, gets=0;
const ctx=await b.newContext({viewport:{width:1280,height:860}}); const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
await ctx.route('https://api.github.com/**', async r => { const q=r.request();
  if(q.method()==='GET'){ gets++; return r.fulfill({status: q.url().includes('/contents/') ? 404 : 200, contentType:'application/json', body: q.url().includes('/contents/') ? '{}' : JSON.stringify({permissions:{push:true}})}); }
  put = { url:q.url(), auth:q.headers()['authorization'], body:JSON.parse(q.postData()) }; return r.fulfill({status:201, contentType:'application/json', body:'{"content":{"sha":"x"}}'}); });
await p.addInitScript(()=>{ sessionStorage.setItem('pv_auth','1'); });
await p.goto('http://localhost:8803/admin.html'); await p.evaluate(()=>{ localStorage.clear(); }); await p.reload(); await p.waitForTimeout(500);
const o={};
await p.evaluate(()=>go('publication')); await p.fill('#ghTok','github_pat_TEST'); await p.click('text=Enregistrer'); await p.click('text=Vérifier'); await p.waitForTimeout(300);
o.tok = await p.evaluate(()=>tokMsg);
await p.evaluate(()=>{ go('words'); words().push('Pushback'); save(); }); await p.click('#pubBtn'); await p.waitForTimeout(500);
o.msg = await p.evaluate(()=>document.getElementById('pubtxt').textContent);
await p.screenshot({path:process.argv[2]+'/pub-admin.png'});
await p.evaluate(()=>go('publication')); await p.screenshot({path:process.argv[2]+'/pub-token.png'});
o.put = put && { url:put.url.replace(/^https:\/\/api.github.com/,''), auth:put.auth, branch:put.body.branch, msg:put.body.message };
const text = Buffer.from(put.body.content,'base64').toString('utf8'); fs.writeFileSync(CFG, text);
// visiteur : autre navigateur, rien en local
const v=await b.newContext({viewport:{width:390,height:844}}); const q=await v.newPage(); q.on('pageerror',e=>errs.push(e.message));
await q.addInitScript(()=>{ localStorage.setItem('whatsNewSeen','maj-2026-10-18c'); sessionStorage.setItem('pv_auth','1'); });
await q.goto('http://localhost:8803/'); await q.waitForTimeout(5000);
o.visitor = await q.evaluate(()=>({ words:[...document.querySelectorAll('#bnTextMode .nj-quick button')].map(x=>x.textContent).join(','), cfg: !!window.CFG }));
fs.unlinkSync(CFG);
console.log(JSON.stringify(o,null,1)); console.log(errs.join(';')||'no errors'); await b.close(); })().catch(e=>{ try{ fs.unlinkSync(CFG); }catch(_){} console.error(e); process.exit(1); });
