/* v3.36 : réglages compagnies publiés depuis admin.html (repo démo seulement pour l'instant).
   v3.40 : « Publier » écrit config.json dans le repo démo (visible par tous) ; copie locale 'adminCfg' sur l'appareil de l'admin,
   copie du fichier en ligne 'adminCfgRemote'. La plus récente (champ at) gagne.
   v3.46 : publication sur Cloudflare (functions/api/config.js, KV) avec historique ; config.json reste lu si rien n'y est publié.
   Hors démo, ou tant que rien n'est publié, CFG reste null et l'app garde ses valeurs codées.
   Forme : { v:1, al:{ FR:{ n, icao, hle, types:{ B737:{ mtt, crew, steps:[{k, a:[ref,off], b:[ref,off]|null}] }, B738:{ mtt, crew, like:'B737' } } } } } */
window.CFG = null;
// v3.47 : l'admin affiche la vraie app dans un téléphone (iframe ?preview=1) avec ses réglages en brouillon (« Après »)
// ou publiés (« Avant ») : copie posée par l'admin dans localStorage 'adminCfgPreview'
window.CFG_PREVIEW = /[?&]preview=1\b/.test(location.search) && window.parent !== window;
function cfgLoad(){
  window.CFG = null;
  if(window.APP_EDITION !== 'demo') return;
  if(window.CFG_PREVIEW){ try{ const c = JSON.parse(localStorage.getItem('adminCfgPreview') || 'null'); if(c && c.v === 1 && c.al) window.CFG = c; }catch(e){} return; }
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
  if(window.APP_EDITION !== 'demo' || window.CFG_PREVIEW || typeof fetch !== 'function' || Date.now() - _cfgFetchAt < 60000) return;
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
// v3.48 (Hugo, option C) : siège d'un SNY → zone FWD / MID / AFT, FR/RK seulement, selon le type avion.
// [dernier rang FWD, dernier rang MID, dernier rang AFT], d'après les fiches avion Ryanair envoyées par Hugo (29/10) :
// B737-800W 189 sièges FWD 1-5 / MID 6-28 / AFT 29-33 ; B737-8200 197 sièges 1-6 / 7-29 / 30-35 ; A320 180 sièges 1-10 / 11-20 / 21-30.
// Réglables par type dans l'admin (types[t].sny), qui gagnent sur ces valeurs.
const SNY_ZONES0 = { B737:[5,28,33], B738:[5,28,33], B38M:[6,29,35], A320:[10,20,30] };
function cfgSnyZones(cie, type){
  cie = String(cie || '').toUpperCase().trim(); type = String(type || '').toUpperCase().trim();
  if(cie !== 'FR' && cie !== 'RK') return null;
  const a = cfgAl(cie), x = a && a.types && a.types[type];
  if(x && Array.isArray(x.sny) && x.sny.length === 3 && x.sny.every(n => +n > 0)) return x.sny.map(Number);
  return SNY_ZONES0[type] || null;
}
function snyZone(cie, type, seat){
  const m = /^(\d{1,2})[A-K]$/.exec(String(seat || '').toUpperCase()), z = cfgSnyZones(cie, type);
  if(!m || !z) return null;
  const r = +m[1];
  return r < 1 ? null : r <= z[0] ? 'FWD' : r <= z[1] ? 'MID' : r <= z[2] ? 'AFT' : null;
}
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
// v3.47 : événements de l'app, leurs actions (champ, nom, rôle h = une heure, d = début, f = fin) ; l'admin s'en sert aussi
const EV_BUILTIN = {
  crew:{ t:'Crew', side:'dep', c:'#334155', it:[['ArrPNT','Arrivée PNT','h'],['ArrPNC','Arrivée PNC','h']] },
  'recherche-bag':{ t:'Recherche bag', side:'dep', c:'#ec4899', it:[['RechercheBagDebut','Début de recherche','d'],['RechercheBagFin','Fin de recherche','f']] },
  inad:{ t:'INAD', side:'dep', c:'#D7263D', it:[['AnnonceINAD','Annonce INAD','h'],['ArriveeINAD','Arrivée INAD','h']] },
  gpu:{ t:'Nayak', side:'dep', c:'#FFAD00', it:[['AppelNayak','Appel Nayak','h'],['ArriveeNayak','Arrivée Nayak','d'],['DepartNayak','Départ Nayak','f']] },
  scan:{ t:'Embarquement', side:'dep', c:'#0f766e', it:[['PremierScanne','Premier scanné','d'],['DernierScanne','Dernier scanné','f']] },
  casque:{ t:'Connexion casque', side:'dep', c:'#7c3aed', it:[['ConnexionAgentCasque','Connexion casque','h']] },
  push:{ t:'Push', side:'dep', c:'#3273dc', it:[['ConnexionPush','Connexion push','h'],['ChangementPush','Changement de push','h']] },
  soutes:{ t:'Portes de soute', side:'dep', c:'#7f1d1d', it:[['FermetureSouteAV','Fermeture soute AV','h'],['FermetureSouteAR','Fermeture soute AR','h']] },
  echelles:{ t:'Retrait échelles', side:'dep', c:'#636363', it:[['RetraitEchelleAV','Retrait échelle AV','h'],['RetraitEchelleAR','Retrait échelle AR','h']] },
  reouverture:{ t:'Réouverture porte', side:'dep', c:'#D7263D', it:[['ReouverturePorteAvion','Réouverture porte','h']] },
  comptage:{ t:'Comptage bagages', side:'dep', c:'#15803d', it:[['DebutComptageBagages','Début comptage','d'],['FinComptageBagages','Fin comptage','f']] },
  chargement:{ t:'Chargement bagages', side:'dep', c:'#15803d', it:[['DebutChargementBagages','Début chargement','d'],['FinChargementBagages','Fin chargement','f']] },
  degivrage:{ t:'Dégivrage', side:'dep', c:'#0ea5e9', it:[['DebutDegivrage','Début dégivrage','d'],['FinDegivrage','Fin dégivrage','f']] },
  tapis:{ t:'Tapis bagages', side:'arr', c:'#0d9488', it:[['MiseEnPlaceTapis','Mise en place tapis','h']] },
  dechargement:{ t:'Déchargement bagages', side:'arr', c:'#15803d', it:[['DebutDechargementBagages','Début déchargement','d'],['FinDechargementBagages','Fin déchargement','f']] },
  repositionnement:{ t:'Repositionnement avion', side:'arr', c:'#3273dc', it:[['DebutRepositionnement','Début repositionnement','d'],['FinRepositionnement','Fin repositionnement','f']] },
  cleaning:{ t:'Cleaning cabine', side:'both', c:'#0891b2', it:[['DebutCleaningCabine','Début cleaning','d'],['FinCleaningCabine','Fin cleaning','f']] },
  vidange:{ t:'Vidange toilettes', side:'both', c:'#78716c', it:[['DebutVidangeToilettes','Début vidange','d'],['FinVidangeToilettes','Fin vidange','f']] },
  eau:{ t:'Eau potable', side:'both', c:'#2563eb', it:[['DebutEauPotable','Début eau potable','d'],['FinEauPotable','Fin eau potable','f']] }
};
// Réglages de l'admin sur un événement de l'app : { t: nom, c: couleur, cies: [FR, RK] } ; nom d'une action : CFG.lbl[champ]
function cfgEvEdit(k){ const m = window.CFG && window.CFG.evEdit; return (m && m[k]) || null; }
function cfgLbl(id, def){ const m = window.CFG && window.CFG.lbl; return (m && typeof m[id] === 'string' && m[id].trim()) ? m[id].trim() : def; }
// Nom d'un événement de l'app à partir d'un de ses champs (barre de la timeline), sinon def
function cfgEvTitle(field, def){
  for(const k in EV_BUILTIN) if(EV_BUILTIN[k].it.some(x => x[0] === field)){ const e = cfgEvEdit(k); return (e && e.t) || def; }
  return def;
}
// En-têtes des cartes d'événements (nom, couleur) une fois le formulaire créé
function cfgEvPaint(root){
  if(!window.CFG || !root) return;
  root.querySelectorAll('.ev-h').forEach(h => {
    const m = /toggleDepExtra\('([^']+)'\)/.exec(h.innerHTML), e = m && cfgEvEdit(m[1]); if(!e) return;
    const b = h.querySelector('b'), i = h.querySelector('i');
    if(e.t && b) b.textContent = e.t;
    if(e.c && i) i.style.background = e.c;
  });
}
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
  // v3.47.1 (Hugo) : plus d'entrée « Admin compagnies » dans le menu de l'app, l'admin s'ouvre seulement par son lien (PC)
  cfgPatchUI();
});
// Publication depuis l'admin dans un autre onglet : on relit tout de suite
window.addEventListener('storage', e => {
  if(e.key !== 'adminCfg') return;
  cfgLoad(); cfgPatchUI();
  try{ if(typeof updateEOBT === 'function') updateEOBT(); if(typeof renderTimeline === 'function') renderTimeline(); }catch(err){}
});
