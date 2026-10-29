/* v3.36 : réglages compagnies publiés depuis admin.html (repo démo seulement pour l'instant).
   admin.html enregistre la configuration dans ce navigateur (localStorage 'adminCfg').
   Hors démo, ou tant que rien n'est publié, CFG reste null et l'app garde ses valeurs codées.
   Forme : { v:1, al:{ FR:{ n, icao, hle, types:{ B737:{ mtt, crew, steps:[{k, a:[ref,off], b:[ref,off]|null}] }, B738:{ mtt, crew, like:'B737' } } } } } */
window.CFG = null;
function cfgLoad(){
  window.CFG = null;
  if(window.APP_EDITION !== 'demo') return;
  try{ const c = JSON.parse(localStorage.getItem('adminCfg') || 'null'); if(c && c.v === 1 && c.al) window.CFG = c; }catch(e){}
}
cfgLoad();

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
function cfgEvFields(e){ return e.kind === 'span' ? ['CxD_' + e.id, 'CxF_' + e.id] : ['Cx_' + e.id]; }
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
