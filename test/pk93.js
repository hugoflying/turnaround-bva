// v3.35 : parking en bloc blanc devant le numéro de vol (option B), pastille masquée, rien sans parking
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp';
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844}, deviceScaleFactor:2});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{ localStorage.setItem('whatsNewSeen','maj-2026-10-18c'); sessionStorage.setItem('pv_auth','1'); });
await p.goto('http://localhost:8803/'); await p.waitForTimeout(2500);
const r=await p.evaluate(async()=>{ const W=ms=>new Promise(r=>setTimeout(r,ms)); const o=[];
 const ids=JSON.parse(localStorage.flightTabs); const vis=id=>!document.getElementById(id).hidden;
 for(const id of ids){ switchTab(id); uiTab('vol'); await W(1300); o.push(document.getElementById('fhFno').textContent+' bloc:'+(vis('fhPkB')?document.getElementById('fhPkBn').textContent:'non')+' pastille:'+vis('fhPk')+' paf:'+(vis('fhPaf')?document.getElementById('fhPaf').textContent:'-')); }
 return o.join(' | '); });
console.log(r, errs.join(';'));
await p.addStyleTag({content:'#popup,.demo-bar{display:none!important}'}); await p.waitForTimeout(300);
await p.screenshot({path:out+'/pk.png', clip:{x:0,y:0,width:390,height:300}}); await b.close(); })();
