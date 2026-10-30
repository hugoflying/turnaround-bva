// v3.46 (v3.47 : passe par la page Vérifier et publier) : « Publier » envoie sur Cloudflare (functions/api/config.js simulé avec un KV en mémoire) : code admin, historique, retour à une version,
// et la démo lit la dernière version. Usage : node test/pub106.js (serveur statique du repo sur http://localhost:8803)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), os = require('os');
(async()=>{
const fn = path.join(os.tmpdir(), 'cfg-fn-' + process.pid + '.mjs'); fs.copyFileSync(path.join(__dirname, '..', 'functions', 'api', 'config.js'), fn);
const { onRequest } = await import(fn); fs.unlinkSync(fn);
const store = new Map(), env = { ADMIN_CODE:'secret42', CFG_KV:{ get: async (k, t) => { const v = store.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, put: async (k, v) => store.set(k, v), delete: async k => store.delete(k) } };
const b = await chromium.launch(), errs = [], o = {};
const ctx = await b.newContext({ viewport:{ width:1280, height:860 } });
await ctx.route('https://timing-demo.pages.dev/api/config**', async r => { const q = r.request();
  const res = await onRequest({ env, request: new Request(q.url(), { method:q.method(), headers:q.headers(), body: ['GET','OPTIONS'].includes(q.method()) ? undefined : q.postData() }) });
  r.fulfill({ status:res.status, headers:Object.fromEntries(res.headers), body:await res.text() }); });
await ctx.addInitScript(() => { sessionStorage.setItem('pv_auth', '1'); localStorage.setItem('whatsNewSeen', 'maj-2026-10-18c'); });
const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
await p.goto('http://localhost:8803/admin.html'); await p.waitForTimeout(500);
await p.evaluate(() => go('publication'));
await p.fill('#admCode', 'faux'); await p.click('text=Enregistrer'); await p.waitForTimeout(1500); o.bad = await p.evaluate(() => histErr);
await p.fill('#admCode', 'secret42'); await p.click('text=Enregistrer'); await p.waitForTimeout(400); o.good = await p.evaluate(() => codeMsg);
await p.evaluate(() => { go('words'); words().push('Pushback'); save(); }); await p.click('#pubBtn'); await p.waitForTimeout(300); o.rv = (o.rv || []).concat(await p.evaluate(() => nChanges())); await p.click('#pubGo'); await p.waitForTimeout(400);
o.msg = await p.textContent('#pubtxt');
await p.evaluate(() => { go('compagnies'); const k = Object.keys(C.al)[0]; C.al[k].hle = (C.al[k].hle || 60) + 5; save(); }); await p.click('#pubBtn'); await p.waitForTimeout(300); o.rv = (o.rv || []).concat(await p.evaluate(() => nChanges())); await p.click('#pubGo'); await p.waitForTimeout(400);
await p.evaluate(() => go('publication')); await p.waitForTimeout(300);
o.hist = await p.evaluate(() => hist.map(h => h.sum));
const hle0 = JSON.parse(store.get('v:' + JSON.parse(store.get('hist'))[1].id)).al;
await p.locator('button:has-text("Revenir à cette version")').first().click(); await p.waitForTimeout(500);
o.after = await p.evaluate(() => hist.map(h => h.sum)); o.rolledBack = JSON.stringify(JSON.parse(store.get('latest')).cfg.al) === JSON.stringify(hle0);
// visiteur de la démo : rien en local, reçoit la dernière version
const q = await ctx.browser().newContext({ viewport:{ width:390, height:844 } }); await q.route('https://timing-demo.pages.dev/api/config**', r => r.fulfill({ status:200, contentType:'application/json', body:store.get('latest') }));
await q.addInitScript(() => { sessionStorage.setItem('pv_auth', '1'); localStorage.setItem('whatsNewSeen', 'maj-2026-10-18c'); });
const v = await q.newPage(); v.on('pageerror', e => errs.push(e.message)); await v.goto('http://localhost:8803/'); await v.waitForTimeout(4000);
o.visitor = await v.evaluate(() => ({ cfg: !!window.CFG, words: (window.CFG && window.CFG.words || []).slice(-1) }));
console.log(JSON.stringify(o, null, 1)); console.log(errs.join(';') || 'no errors'); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
