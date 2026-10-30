/* v3.36 : réglages compagnies publiés depuis admin.html (repo démo seulement pour l'instant).
   v3.40 : « Publier » écrit config.json dans le repo démo (visible par tous) ; copie locale 'adminCfg' sur l'appareil de l'admin,
   copie du fichier en ligne 'adminCfgRemote'. La plus récente (champ at) gagne.
   v3.46 : publication sur Cloudflare (functions/api/config.js, KV) avec historique ; config.json reste lu si rien n'y est publié.
   Hors démo, ou tant que rien n'est publié, CFG reste null et l'app garde ses valeurs codées.
   Forme : { v:1, al:{ FR:{ n, icao, hle, types:{ B737:{ mtt, crew, steps:[{k, a:[ref,off], b:[ref,off]|null}] }, B738:{ mtt, crew, like:'B737' } } } } } */
window.CFG = null;
function cfgLoad(){
  window.CFG = null;
  if(window.APP_EDITION !== 'demo') return;
  const rd = k => { try{ const c = JSON.parse(localStorage.getItem(k) || 'null'); return (c && c.v === 1) ? c : null; }catch(e){ return null; } };
  const a = rd('adminCfg'), b = rd('adminCfgRemote');
  const c = (a && b) ? ((+a.at || 0) >= (+b.at || 0) ? a : b) : (a || b);
  if(c && c.al) window.CFG = c;            // un fichier « réinitialisé » n'a pas de al → réglages d'origine
}
cfgLoad();
// Fichier en ligne : s'il a changé depuis la dernière visite, on le garde et on recharge une fois
// v3.41.1 : relu aussi au retour dans l'app (PWA restée ouverte en arrière-plan sur le téléphone), au plus une fois par minute
let _cfgFetchAt = 0;
const CFG_URL = 'https://timing-demo.pages.dev/api/config';
function cfgFetch(){
  if(window.APP_EDITION !== 'demo' || typeof fetch !== 'function' || Date.now() - _cfgFetchAt < 60000) return;
  _cfgFetchAt = Date.now();
  // v3.46 : d'abord Cloudflare (publication de l'admin, avec historique) ; rien publié là-bas → ancien fichier config.json
  const old = () => fetch('./config.json?t=' + Date.now(), { cache:'no-store' }).then(r => r.ok ? r.text() : null);
  fetch(CFG_URL, { cache:'no-store' }).then(r => r.ok ? r.json() : null).then(j => j && j.cfg ? JSON.stringify(j.cfg) : old(), old).then(t => {
    if(t == null) return;
    try{ JSON.parse(t); }catch(e){ return; }
    if(t.trim() === (localStorage.getItem('adminCfgRemote') || '').trim()) return;
    const before = JSON.stringify(window.CFG);
    localStorage.setItem('adminCfgRemote', t); cfgLoad();
    const last = +(sessionStorage.getItem('cfgReloadAt') || 0);
    if(JSON.stringify(window.CFG) !== before && Date.now() - last > 30000){ sessionStorage.setItem('cfgReloadAt', String(Date.now())); location.reload(); }
  }).catch(() => {});
}
cfgFetch();
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') cfgFetch(); });

// Compagnie configurée, ou null (l'app reprend alors ses règles codées)
function cfgAl(cie){
  return (window.CFG && window.CFG.al[String(cie || '').toUpperCase().trim()]) || null;
}
// Type avion de la compagnie ; type inconnu ou vide → premier type de la liste
function cfgType(cie, type){
  const a = cfgAl(cie); if(!a) return null;
  const keys = Object.keys(a.types || {}); if(!keys.length) return {};
  const t = String(type || '').toUpperCase().trim();
  return a.types[t] || a.types[keys[0]];
}
// Étapes cibles d'un type (suit « comme A320 » une seule fois), [] si aucune
function cfgSteps(cie, type){
  const a = cfgAl(cie), x = cfgType(cie, type); if(!x) return null;
  const y = x.steps ? x : (x.like && a.types[x.like]) || {};
  return y.steps || [];
}
// Cibles au format de renderTimeline (TARGETS_*), null si la compagnie n'est pas configurée
function cfgTargets(cie, type){
  const st = cfgSteps(cie, type); if(!st) return null;
  const out = {};
  st.forEach(s => {
    if(!s || !s.k || !s.a) return;
    const b = s.b || s.a;
    out[s.k] = { ref:b[0], fromRef:s.a[0], toRef:b[0], from:+s.a[1], to:+b[1],
                 fromField: s.k === 'Cabin release' ? 'DernierDebarque' : null, toOffset:null, label: s.l || null };
  });
  return out;
}

// v3.37 : événements ajoutés, événements masqués, mots rapides du journal, codes retard par compagnie
const cfgId = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
function cfgEvents(){
  if(!window.CFG || !Array.isArray(window.CFG.events)) return [];
  return window.CFG.events.filter(e => e && cfgId(e.id) && e.t).map(e => ({ ...e, id: cfgId(e.id) }));
}
// v3.41 : un événement regroupe 1 à 4 actions, chacune avec son nom et son rôle : h = une heure, d = début, f = fin
// (Nayak : Appel h, Arrivée d, Départ f). Les événements v3.37 (kind point / span) restent lus tels quels.
function cfgEvItems(e){
  if(Array.isArray(e.items) && e.items.length)
    return e.items.filter(x => x && String(x.t || '').trim()).slice(0, 4).map((x, j) => ({ f: x.f || ('Cx_' + e.id + '_' + (cfgId(x.id) || j)), t: String(x.t).trim(), r: ['d','f'].includes(x.r) ? x.r : 'h' }));
  return e.kind === 'span' ? [{ f:'CxD_' + e.id, t:'Début ' + e.t, r:'d' }, { f:'CxF_' + e.id, t:'Fin ' + e.t, r:'f' }] : [{ f:'Cx_' + e.id, t:e.t, r:'h' }];
}
function cfgEvFields(e){ return cfgEvItems(e).map(x => x.f); }
// Chaque début va avec la fin qui le suit : [[début, fin]] ; le reste se lit comme des heures seules
function cfgEvSplit(e){
  const it = cfgEvItems(e), pairs = [], used = new Set();
  it.forEach((x, j) => { if(x.r !== 'd') return; const k = it.findIndex((y, n) => n > j && y.r === 'f' && !used.has(n)); if(k > 0){ used.add(j); used.add(k); pairs.push([x, it[k]]); } });
  return { pairs, points: it.filter((x, j) => !used.has(j)) };
}
function cfgEvDesc(e){ return e.d || cfgEvItems(e).map(x => x.t).join(', '); }
function cfgEvHidden(k){ return !!(window.CFG && Array.isArray(window.CFG.evHide) && window.CFG.evHide.includes(k)); }
function cfgWords(){ return (window.CFG && Array.isArray(window.CFG.words) && window.CFG.words.length) ? window.CFG.words.map(String) : null; }
// Liste de codes retard propre à la compagnie (ou à celle qu'elle copie), sinon null
function cfgDl(cie){
  const a = cfgAl(cie); if(!a) return null;
  if(a.dl && Array.isArray(a.dl.codes)) return a.dl;
  const b = a.dlLike ? cfgAl(a.dlLike) : null;
  return (b && b.dl && Array.isArray(b.dl.codes)) ? b.dl : null;
}
function cfgDlLike(cie){ const a = cfgAl(cie); return (a && a.dlLike) || null; }

// Compagnies ajoutées dans l'admin : pastille dans « Modifier le vol » et indicatif OACI → code IATA
function cfgPatchUI(){
  if(!window.CFG) return;
  const words = cfgWords(), quick = document.querySelector('#bnTextMode .nj-quick');
  if(words && quick){
    quick.innerHTML = '';
    words.forEach(w => { const b = document.createElement('button'); b.type = 'button'; b.dataset.njTag = w; b.textContent = w; quick.appendChild(b); });
  }
  const box = document.getElementById('ivCieChips'), other = box && box.querySelector('.iv-other');
  Object.keys(window.CFG.al).forEach(c => {
    const a = window.CFG.al[c];
    if(a.icao && typeof CS_TO_IATA === 'object') CS_TO_IATA[String(a.icao).toUpperCase()] = c;
    if(box && other && !box.querySelector('button[data-v="' + c + '"]')){
      const b = document.createElement('button'); b.type = 'button'; b.dataset.v = c; b.textContent = c; box.insertBefore(b, other);
    }
  });
}
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('adminBtn'); if(btn) btn.hidden = window.APP_EDITION !== 'demo';
  cfgPatchUI();
});
// Publication depuis l'admin dans un autre onglet : on relit tout de suite
window.addEventListener('storage', e => {
  if(e.key !== 'adminCfg') return;
  cfgLoad(); cfgPatchUI();
  try{ if(typeof updateEOBT === 'function') updateEOBT(); if(typeof renderTimeline === 'function') renderTimeline(); }catch(err){}
});
