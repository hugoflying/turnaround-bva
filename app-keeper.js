/* Airport Keeper, import, prestations, validation (découpé de app.js, chargé dans l'ordre de index.html) */
// ===== Airport Keeper (AK) =====
const AK_BASE    = "/api/ak";
// AK_TOKEN géré côté serveur (Cloudflare Pages Function)
const AK_AIRPORT = "LFOB";

// Ouvrir/Fermer
function openAKPicker(){
  // Édition sans Keeper (turnaround-bva) : le « + » crée un vol manuel et ouvre sa fiche
  if(window.APP_EDITION === 'bva'){
    createManualFlight();
    return;
  }
  const b = document.getElementById('akBackdrop');
  const p = document.getElementById('akPopover');
  const flowSel = document.getElementById('akFlow');

  if(flowSel) flowSel.value = 'DEP';

  document.body.classList.add('ak-open');   // ✅ AJOUT
  if(typeof updateHeaderOffset === 'function') requestAnimationFrame(updateHeaderOffset);

  if(b) b.style.display = '';
  if(p) p.style.display = 'flex';
  loadAKFlights();
}

function closeAKPicker(){
  const b = document.getElementById('akBackdrop');
  const p = document.getElementById('akPopover');

  if(p) p.style.display = 'none';
  if(b) b.style.display = 'none';

  document.body.classList.remove('ak-open'); // ✅ AJOUT
  if(typeof updateHeaderOffset === 'function') requestAnimationFrame(updateHeaderOffset);

  // Arrêter le poll
}

async function fetchAK(flow, from, to) {
  // v2.59 : en mode démo, liste AK fictive (ui.js akDemoData)
  if(window.demoActive && window.demoActive() && window.akDemoData) return window.akDemoData(flow);
  const url =
    `${AK_BASE}?airport=${encodeURIComponent(AK_AIRPORT)}` +
    `&flow=${encodeURIComponent(flow)}` +
    `&from=${encodeURIComponent(from)}` +
    `&to=${encodeURIComponent(to)}`;

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`AK error ${res.status}`);

  const data = await res.json();
  return Array.isArray(data) ? data : (Array.isArray(data?.flights) ? data.flights : []);
}

// ===== Temps + linking (immat) =====
function arrTimeMs(f){
  return Date.parse(f?.aibt || f?.eibt || f?.sibt || f?.aldt || f?.eldt || f?.afat || f?.efat || '') || null;
}

// DEP : si pas d'AOBT, on privilégie EOBT/POBT/CTOT (réaliste) plutôt que SOBT (souvent "ancien plan")
function depTimeMs(f){
  return Date.parse(
    f?.aobt || f?.eobt || f?.pobt || f?.ctot || f?.etot || f?.sobt || ''
  ) || null;
}

// ===== Linking : priorité linkedId, sinon reg+temps =====
// Helper: clé YYYY-MM-DD selon mode UTC/Locale
function dayKeyFromMs(ms){
  if(ms == null) return null;
  const d = new Date(ms);

  // isUTC est déjà dans ton code (toggle)
  if(window.isUTC){
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth()+1).padStart(2,'0');
    const da = String(d.getUTCDate()).padStart(2,'0');
    return `${y}-${m}-${da}`;
  }else{
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const da = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${da}`;
  }
}

function sameOpDay(msA, msB){
  const a = dayKeyFromMs(msA);
  const b = dayKeyFromMs(msB);
  return !!a && !!b && a === b;
}

// ===== Linking : ARR -> DEP (uniquement même jour) =====
function findLinkedDepForArr(arr){
  if(!arr) return null;

  const arrT = arrTimeMs(arr);
  if(arrT == null) return null;

  // 1) linkedId direct + garde-fou date
  const lid = (arr?.linkedId || '').trim();
  if(lid){
    const dep = (window._akCache?.dep || []).find(d => String(d?.id) === lid);
    if(dep){
      const depT = depTimeMs(dep);
      if(depT != null && sameOpDay(arrT, depT)) return dep;
      return null; // ❌ autre jour => pas lié
    }
  }

  // 2) fallback reg + premier DEP après ARR, mais même jour
  const reg = (arr?.reg || '').toUpperCase().trim();
  if(!reg) return null;

  const deps = window._akCache?.dep || [];
  let best = null;
  let bestT = Infinity;

  for(const d of deps){
    const r = (d?.reg || '').toUpperCase().trim();
    if(r !== reg) continue;

    const t = depTimeMs(d);
    if(t == null) continue;

    if(t < arrT) continue;                 // après l'arrivée
    if(!sameOpDay(arrT, t)) continue;      // ✅ même jour obligatoire

    if(t < bestT){ best = d; bestT = t; }
  }

  return best;
}

// ===== Linking : DEP -> ARR (uniquement même jour) =====
function findLinkedArrForDep(dep){
  if(!dep) return null;

  const depT = depTimeMs(dep);
  if(depT == null) return null;

  // 1) linkedId direct + garde-fou date
  const lid = (dep?.linkedId || '').trim();
  if(lid){
    const arr = (window._akCache?.arr || []).find(a => String(a?.id) === lid);
    if(arr){
      const arrT = arrTimeMs(arr);
      if(arrT != null && sameOpDay(arrT, depT)) return arr;
      return null; // ❌ autre jour => pas lié
    }
  }

  // 2) fallback reg + dernier ARR avant DEP, mais même jour
  const reg = (dep?.reg || '').toUpperCase().trim();
  if(!reg) return null;

  const arrs = window._akCache?.arr || [];
  let best = null;
  let bestT = -Infinity;

  for(const a of arrs){
    const r = (a?.reg || '').toUpperCase().trim();
    if(r !== reg) continue;

    const t = arrTimeMs(a);
    if(t == null) continue;

    if(t > depT) continue;                 // avant le départ
    if(!sameOpDay(t, depT)) continue;      // ✅ même jour obligatoire

    if(t > bestT){ best = a; bestT = t; }
  }

  return best;
}


function depAtotTooOld(dep, minutes = 15){
  // ATOT = info Keeper uniquement (non affichée)
  const iso = dep?.atot || dep?.aobt; // fallback sécurité
  if(!iso) return false;

  const t = Date.parse(iso);
  if(!t) return false;

  return (Date.now() - t) > minutes * 60 * 1000;
}

// ===== Chargement liste (vols du jour) - ARR+DEP groupés =====
async function loadAKFlights(){
  const st   = document.getElementById('akStatus');
  const list = document.getElementById('akList');
  if(st) st.textContent = 'Chargement…';
  if(list) list.innerHTML = '';

  const now = new Date();
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,0,0,0);
  const endDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59,999);
  const linkFrom = new Date(startDay.getTime() - 12*3600*1000).toISOString().replace(/\.\d{3}Z$/,"Z");
  const linkTo   = new Date(endDay.getTime()   + 12*3600*1000).toISOString().replace(/\.\d{3}Z$/,"Z");

  try{
    const [arrAll, depAll] = await Promise.all([fetchAK('ARR',linkFrom,linkTo), fetchAK('DEP',linkFrom,linkTo)]);
    window._akCache = { arr: arrAll, dep: depAll };

    const inToday = (f, fl) => {
      const t = Date.parse(fl==='DEP' ? (f.sobt||f.eobt||f.aobt||f.atot||'') : (f.sibt||f.eibt||f.aibt||''));
      return t && t >= startDay.getTime() && t <= endDay.getTime();
    };

    let arrFlights = arrAll.filter(f => inToday(f,'ARR'));
    let depFlights = depAll.filter(f => inToday(f,'DEP')).filter(d => !depAtotTooOld(d,15));
    arrFlights = arrFlights.filter(arr => { const nd=findLinkedDepForArr(arr); return !nd || !depAtotTooOld(nd,15); });

    const usedDep = new Set(), pairs = [];
    for(const arr of arrFlights){
      const dep = findLinkedDepForArr(arr);
      if(dep && !usedDep.has(dep.id)){ pairs.push({arr,dep}); usedDep.add(dep.id); }
      else { pairs.push({arr, dep:null}); }
    }
    for(const dep of depFlights){ if(!usedDep.has(dep.id)) pairs.push({arr:null,dep}); }

    pairs.sort((a,b)=>{
      const ta = a.arr ? arrTimeMs(a.arr) : (a.dep ? depTimeMs(a.dep) : null);
      const tb = b.arr ? arrTimeMs(b.arr) : (b.dep ? depTimeMs(b.dep) : null);
      if(ta==null&&tb==null) return 0; if(ta==null) return 1; if(tb==null) return -1;
      return ta-tb;
    });

    if(st) st.textContent = pairs.length + ' vol(s)';
    renderAKList(pairs);

  }catch(e){
    if(st) st.textContent = `Erreur (${String(e.message || e)})`;
  }
}

/* =========================
   BADGES RETARD (référence app.js)
   ========================= */

const EIBT_CORRECTION_MIN = -4;

function addMinutesToIso(iso, minutes){
  const t = Date.parse(iso || "");
  if(!Number.isFinite(t)) return "";
  return new Date(t + minutes * 60000).toISOString();
}

function delayMinFrom(plannedIso, actualIso){
  const p = Date.parse(plannedIso || "");
  const a = Date.parse(actualIso || "");
  if(!Number.isFinite(p) || !Number.isFinite(a)) return null;
  return Math.round((a - p) / 60000);
}

function actualDepIso(f){
  return f?.aobt || f?.eobt || "";
}

function actualArrIso(f){
  if(f?.aibt) return f.aibt;

  if(f?.eibt){
    return addMinutesToIso(f.eibt, EIBT_CORRECTION_MIN);
  }

  return "";
}



// ===== Couleur bandeau retard (identique au dashboard) =====
function delayBarColor(mins){
  if(mins == null) return null;
  if(mins <= -11)  return '#3b82f6'; // bleu — en avance (<= -11min)
  if(mins <= 5)    return '#16a34a'; // vert — à l'heure (-10 à +5min)
  if(mins < 15)    return '#f97316'; // orange — retard < 15min
  return             '#ef4444';     // rouge — retard >= 15min
}

// ===== Rendu liste : ARR = provenance, DEP = destination =====

function renderAKList(pairs){
  const list = document.getElementById('akList');
  if(!list) return;
  _renderAKListWithRza(pairs, list, {});
}

function _renderAKListWithRza(pairs, list, akIdToRza){

  // ── Cache global : stocke chaque objet vol par son id ──────────────────────
  // Évite d'inliner le JSON (parfois très volumineux) dans les attributs onclick,
  // ce qui causait des échecs silencieux sur les vols DEP avec routeIcao long.
  window._akFlightById = window._akFlightById || {};
  pairs.forEach(p => {
    if(p.arr && p.arr.id) window._akFlightById[String(p.arr.id)] = p.arr;
    if(p.dep && p.dep.id) window._akFlightById[String(p.dep.id)] = p.dep;
  });

  function getStatus(f, flow){
    let s = (f?.status||f?.milestone||'').toString().toUpperCase();
    if(s==='SCHEDULED')  return 'PRÉVU';
    if(s==='CANCELLED')  return 'ANNULÉ';
    if(s==='SUSPENDED')  return 'SUSPENDU';
    if(flow==='DEP'){ if(s==='IN_FLIGHT') return 'DÉCOLLÉ'; }
    else{
      if(s==='TERMINATED') return 'ARRIVÉ';
      if(s==='IN_FLIGHT') return 'EN VOL';
      const nd = findLinkedDepForArr(f);
      if(nd){ const ds=(nd.status||nd.milestone||'').toString().toUpperCase(); if(ds==='IN_FLIGHT'||!!nd.atot) return 'DÉCOLLÉ'; }
    }
    return s||'';
  }

  // Couleur du retard -> classe (mêmes seuils que delayBarColor)
  function delayClass(mins){
    const c = delayBarColor(mins);
    if(c === '#3b82f6') return 'c-early';
    if(c === '#16a34a') return 'c-ok';
    if(c === '#f97316') return 'c-warn';
    if(c === '#ef4444') return 'c-crit';
    return '';
  }

  const toHM = iso => {
    const d = iso ? new Date(iso) : null;
    if(!d || isNaN(d.getTime())) return '';
    return String(isUTC ? d.getUTCHours() : d.getHours()).padStart(2,'0') + ':' + String(isUTC ? d.getUTCMinutes() : d.getMinutes()).padStart(2,'0');
  };

  // v2.43 : une moitié de la rotation (arrivée à gauche, départ à droite)
  function side(f, flow, done){
    const fl = flow.toLowerCase();
    if(!f) return '<div class="akc-s akc-' + fl + ' akc-none"><span class="akc-tm">--:--</span><span class="akc-fn">' + (flow==='ARR' ? "Pas d'arrivée liée" : 'Pas de départ lié') + '</span></div>';
    const ff   = (f.fullFlightNumber||f.callsign||'').trim().toUpperCase();
    // v2.60 : l'heure en gros est l'horaire programmé (SIBT / SOBT), l'écart réel/estimé reste à côté
    const sched = toHM(flow==='ARR' ? f.sibt : f.sobt);
    const best = sched ? null : pickBestTimeForList(f, flow);
    const t = sched || best.time, sx = sched ? 'S' : best.suffix;
    const iata = flow==='ARR' ? (f.adepIata||f.adepIcao||'') : (f.adesIata||f.adesIcao||'');
    const dly  = delayMinFrom(flow==='ARR'?(f.sibt||''):(f.sobt||''), flow==='ARR'?actualArrIso(f):actualDepIso(f));
    const dCls = delayClass(dly);
    const delta = (dly != null && dly !== 0) ? '<small class="akc-d ' + dCls + '">' + (dly > 0 ? '+' : '−') + Math.abs(dly) + '</small>' : '';
    const safeId = escapeHtml(String(f.id || f._id || ''));
    const lbl = sx === 'A' ? (flow==='ARR' ? 'AIBT' : 'AOBT') : (sx === 'S' ? (flow==='ARR' ? 'SIBT' : 'SOBT') : 'Estimé');
    return '<button type="button" class="akc-s akc-' + fl + (done ? ' akc-done' : '') + '" onclick="_akClickFlight(\'' + safeId + '\',\'' + flow + '\')" title="' + lbl + '">'
      + '<span class="akc-tm num">' + escapeHtml(t || '--:--') + delta + '</span>'
      + '<span class="akc-ap">' + escapeHtml(iata || '---') + '</span>'
      + '<span class="akc-fn">' + escapeHtml(ff || '—') + '</span>'
      + '</button>';
  }

  window._akPairs = pairs;
  const cieOf = p => (((p.arr||p.dep||{}).fullFlightNumber || (p.arr||p.dep||{}).callsign || '') + '').trim().slice(0,2).toUpperCase();

  // Filtres compagnie + recherche
  const fbox = document.getElementById('akFilters');
  const cies = [...new Set(pairs.map(cieOf).filter(Boolean))].sort();
  const curCie = window._akCie && cies.includes(window._akCie) ? window._akCie : '';
  const q = ((document.querySelector('.akc-q')||{}).value || '').trim().toUpperCase();
  if(fbox){
    const chips = fbox.querySelector('.akc-chips');
    chips.innerHTML = ['', ...cies].map(c => '<button type="button" class="akc-chip' + (c===curCie ? ' on' : '') + '" onclick="akSetCie(\'' + c + '\')">' + (c || 'Tous') + '</button>').join('')
      + '<button type="button" class="akc-chip akc-find' + (fbox.classList.contains('searching') ? ' on' : '') + '" onclick="akToggleSearch()" aria-label="Rechercher"><svg class="ico"><use href="#i-search"/></svg></button>';
  }

  const match = p => {
    if(curCie && cieOf(p) !== curCie) return false;
    if(!q) return true;
    const hay = [p.arr, p.dep].filter(Boolean).map(f => [f.fullFlightNumber, f.callsign, f.reg, f.adepIata, f.adesIata, f.pkg].join(' ')).join(' ').toUpperCase().replace(/-/g,'');
    return hay.includes(q.replace(/-/g,''));
  };
  const shown = pairs.filter(match);

  if(!pairs.length){ list.innerHTML = '<p class="akc-empty">Aucun vol.</p>'; return; }
  if(!shown.length){ list.innerHTML = '<p class="akc-empty">Aucun vol pour ce filtre.</p>'; return; }

  const groups = { cur:[], next:[], done:[] };
  shown.forEach(p => {
    const aSt = p.arr ? getStatus(p.arr,'ARR') : '';
    const dSt = p.dep ? getStatus(p.dep,'DEP') : '';
    const ref = p.arr || p.dep;
    let g = 'next', chip = ['Prévu','g'];
    if(dSt === 'DÉCOLLÉ' || aSt === 'DÉCOLLÉ'){ g = 'done'; chip = ['Décollé','g']; }
    else if(aSt === 'ARRIVÉ'){ g = 'cur'; chip = ['Au sol','ok']; }
    else if(aSt === 'EN VOL'){ chip = ['En vol','w']; }
    if(aSt === 'ANNULÉ' || dSt === 'ANNULÉ') chip = ['Annulé','c'];
    else if(aSt === 'SUSPENDU' || dSt === 'SUSPENDU') chip = ['Suspendu','c'];
    const arrDone = aSt === 'ARRIVÉ' || g === 'done';
    const depDone = g === 'done';
    const late = [[p.arr,'ARR',arrDone],[p.dep,'DEP',depDone]].some(([f,fl,dn]) => {
      if(!f || dn) return false;
      const d = delayMinFrom(fl==='ARR'?(f.sibt||''):(f.sobt||''), fl==='ARR'?actualArrIso(f):actualDepIso(f));
      return d != null && d >= 15;
    });
    const stand = ((p.arr && p.arr.pkg) || (p.dep && p.dep.pkg) || '').toString().replace(/^P/i,'');
    const reg  = ((p.dep && p.dep.reg) || (p.arr && p.arr.reg) || '').trim();
    const type = (ref.acTypeIcao || ref.acTypeIata || (p.dep||{}).acTypeIcao || '').toUpperCase();
    const cie  = cieOf(p);
    const linked = !!(p.arr && p.dep);
    groups[g].push('<div class="akc-row' + (late ? ' late' : '') + '">'
      + side(p.arr, 'ARR', arrDone)
      + '<div class="akc-mid' + (linked ? '' : ' broken') + '" title="' + (linked ? 'Rotation liée' : 'Pas de rotation liée') + '"><i></i><span class="num">' + (stand ? 'P' + escapeHtml(stand) : '—') + '</span><i></i></div>'
      + side(p.dep, 'DEP', depDone)
      + '<div class="akc-foot">' + (cie ? '<span class="ak-cie">' + escapeHtml(cie) + '</span>' : '')
      + '<span class="akc-reg">' + escapeHtml([reg, type].filter(Boolean).join(' · ') || '—') + '</span>'
      + '<span class="akc-st ' + chip[1] + '">' + chip[0] + '</span></div>'
      + '</div>');
  });
  const sec = (t, arr) => arr.length ? '<div class="akc-sec">' + t + '<span>' + arr.length + '</span></div>' + arr.join('') : '';
  list.innerHTML = sec('En cours', groups.cur) + sec('À venir', groups.next) + sec('Terminés', groups.done);
}

function akSetCie(c){ window._akCie = c; if(window._akPairs) renderAKList(window._akPairs); }
function akToggleSearch(){
  const box = document.getElementById('akFilters'); if(!box) return;
  const on = box.classList.toggle('searching');
  const inp = document.querySelector('.akc-q');
  if(on){ inp.focus(); } else { inp.value = ''; if(window._akPairs) renderAKList(window._akPairs); }
  const f = box.querySelector('.akc-find'); if(f) f.classList.toggle('on', on);
}

// ── Gestionnaire de clic AK — lookup par ID dans le cache ──────────────────
function _akClickFlight(id, flow){
  const f = window._akFlightById && window._akFlightById[id];
  if(!f){
    console.warn('[AK] Vol introuvable dans le cache, id=', id);
    return;
  }
  applyAKFlight(f, flow);
}
  
// ===== Import : règles BVA =====
function akBuildSI(f, allowDL = true, opts = {}){
  const includeDL = opts.includeDL !== undefined ? !!opts.includeDL : true;

  const parts = [];

  const rmk = (f?.remarks || '').trim();
  if(rmk) parts.push(rmk);

  // DL AK : uniquement si autorisé ET includeDL=true
  if(allowDL && includeDL){
    const tb = f?.dlCodes?.typeb;
    if(Array.isArray(tb) && tb.length){
      parts.push(`DL: ${tb.map(x => `${x.code} +${x.delay}`).join(' / ')}`);
    }
  }

  return parts.join('\n').trim();
}

function storeAKMetaForTab(meta){
  if(!currentTabId) return;

  const data = JSON.parse(localStorage.getItem('tab-'+currentTabId) || '{}');

  // ── Historique des CTOT ────────────────────────────────────────────────
  // On conserve chaque valeur de CTOT vue, avec l'heure de constatation.
  // Permet de suivre l'evolution du slot (ex: 07:35 -> 07:30 -> 06:00).
  const prevHist = Array.isArray(data.akMeta?.ctotHistory)
    ? data.akMeta.ctotHistory : [];
  let ctotHistory = prevHist;
  if(meta.ctotIso){
    const d = new Date(meta.ctotIso);
    if(!isNaN(d.getTime())){
      const hhmm = String(isUTC ? d.getUTCHours() : d.getHours()).padStart(2,'0')
        + ':' + String(isUTC ? d.getUTCMinutes() : d.getMinutes()).padStart(2,'0');
      const last = prevHist.length ? prevHist[prevHist.length-1] : null;
      // On n'ajoute que si la valeur a change (evite les doublons a chaque refresh)
      if(!last || last.iso !== meta.ctotIso){
        ctotHistory = prevHist.concat([{
          iso: meta.ctotIso,
          hhmm: hhmm,
          seenAt: Date.now()
        }]);
      }
    }
  }

  data.akMeta = {
    ctotHistory: ctotHistory,

    flow: meta.flow || null,

    // ✅ clé la plus fiable
    id: String(meta.id || ''),
    linkedId: String(meta.linkedId || ''),

    // Regulation CTOT (cause du creneau) : conservee telle quelle depuis AK
    regulation: meta.regulation || null,

    // v2.71 : heure de décollage réelle (Keeper), pour l'état « Décollé » du Récap
    atot: meta.atotIso || '',

    // ✅ fallback
    reg:  (meta.reg  || '').toUpperCase().trim(),
    ff:   (meta.ff   || '').toUpperCase().trim(),     // fullFlightNumber du vol sélectionné
    timeISO: (meta.timeISO || ''),                    // SOBT (DEP) ou SIBT (ARR)

    // ton bandeau
    arrFF:(meta.arrFF|| '').toUpperCase().trim(),
    depFF:(meta.depFF|| '').toUpperCase().trim(),
    pkg:  (meta.pkg  || '') + '',
    bc:   (meta.bc   || '').toUpperCase().trim(),

    ts: Date.now()
  };

  localStorage.setItem('tab-'+currentTabId, JSON.stringify(data));
}

function parseIsoMs(iso){
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? t : null;
}

function findBestAKMatch(list, meta, flow){
  if(!Array.isArray(list) || !meta) return null;

  // ✅ 1) match direct par ID (zéro ambiguïté)
  if(meta.id){
    const byId = list.find(f => String(f?.id) === String(meta.id));
    if(byId) return byId;
  }

  // ✅ 2) fallback reg + ff + timeISO
  const wantReg = (meta.reg || '').toUpperCase().trim();
  if(!wantReg) return null;

  const wantFF = (meta.ff || '').toUpperCase().trim();
  const wantT  = parseIsoMs(meta.timeISO);

  let best = null;
  let bestScore = Infinity;

  for(const f of list){
    const reg = ((f?.reg || '') + '').toUpperCase().trim();
    if(reg !== wantReg) continue;

    const ff = ((f?.fullFlightNumber || f?.callsign || '') + '').toUpperCase().trim();
    if(wantFF && ff && wantFF !== ff) continue;

    const candT = parseIsoMs(
      flow === 'DEP'
        ? (f?.sobt || f?.eobt || f?.aobt || f?.atot || null)
        : (f?.sibt || f?.eibt || f?.aibt || f?.aldt || null)
    );

    let score = 999999999;
    if(wantT != null && candT != null) score = Math.abs(candT - wantT);
    else score = 60 * 60 * 1000;

    if(score < bestScore){
      best = f;
      bestScore = score;
    }
  }

  if(best && wantT != null && bestScore > 12 * 60 * 60 * 1000) return null;
  return best;
}

async function refreshAKTab(tabId){
  const data = JSON.parse(localStorage.getItem('tab-'+tabId) || '{}');
  const meta = data.akMeta;
  if(!meta){
    showPopup("Pas de données AK à rafraîchir", "#ef4444", 1600);
    return;
  }

  const now = new Date();
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,0,0,0);
  const endDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59,999);
  const linkFrom = new Date(startDay.getTime() - 12*60*60*1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const linkTo   = new Date(endDay.getTime()   + 12*60*60*1000).toISOString().replace(/\.\d{3}Z$/, "Z");

  try{
    const [arrAll, depAll] = await Promise.all([
      fetchAK('ARR', linkFrom, linkTo),
      fetchAK('DEP', linkFrom, linkTo),
    ]);

    window._akCache = { arr: arrAll, dep: depAll };

    const flow = meta.flow || 'DEP';
    const list = flow === 'DEP' ? depAll : arrAll;
    const match = findBestAKMatch(list, meta, flow);

    if(!match){
      showPopup("Vol AK introuvable", "#ef4444", 1800);
      return;
    }

    if(currentTabId !== tabId) switchTab(tabId);

    applyAKFlight(match, flow, { refresh: true });
    saveCurrentTabData();

    showPopup("AK rafraîchi", "#16a34a", 1400);

  }catch(e){
    showPopup(`Erreur AK (${String(e.message || e)})`, "#ef4444", 2000);
  }
}

function applyAKFlight(f, flow, opts = {}){
  // Nouvelle selection : si ce vol est deja ouvert, on demande confirmation
  if(!opts.refresh){
    const key = akRotKey(f, flow);
    const dup = findTabByFlightKey(key, null);
    if(dup){
      openDupFlightModal(()=>{
        // Synchro suspendue : le nouvel onglet est vide, il ne doit surtout
        // pas ecraser les saisies deja faites sur le vol d'origine.
        _syncSuspended = true;
        try{
          _doApplyAKFlight(f, flow, opts);
          const newTab = currentTabId;
          seedTabFromSibling(newTab, dup);   // on recopie l'existant vers le neuf
          if(typeof loadTabData === 'function') loadTabData(newTab);
        } finally {
          _syncSuspended = false;
        }
        // Les deux onglets sont maintenant identiques : on peut sauver normalement
        if(typeof saveCurrentTabData === 'function') saveCurrentTabData();
        if(typeof uiTab === 'function') uiTab('vol');   // v2.94 : vol AK ouvert sur Vol
      });
      return;
    }
  }
  _doApplyAKFlight(f, flow, opts);
  // v2.88 : en démo, le vol importé arrive rempli comme un vrai vol
  if(!opts.refresh && window.demoActive && window.demoActive() && window.demoFillImported) window.demoFillImported(f);
  // v2.94 (Hugo) : un vol ouvert depuis AK s'affiche toujours sur l'onglet Vol
  if(!opts.refresh && typeof uiTab === 'function') uiTab('vol');
}

function _doApplyAKFlight(f, flow, opts = {}){
  const isRefresh = !!opts.refresh;

  // Créer un nouvel onglet seulement si c'est une nouvelle sélection
  if(!isRefresh){
    createNewTab();
  }

  try{
    /* ===== champs communs ===== */
    setValAK('Immat', (f.reg || ''));

    const stand = (f.pkg || '').toString().replace(/^P/i,'').trim();
    if(stand) setValAK('Parking', stand);

    const ac = (f.acTypeIcao || f.acTypeIata || '').toUpperCase().trim();
    if(ac) setValAK('TypeAvion', ac);

    const ff = (f.fullFlightNumber || f.callsign || '').toUpperCase().trim();
    // ✅ Callsign brut AK
    if(f.callsign) setValAK('Callsign', f.callsign);
    if(ff){
      const m = ff.match(/^([A-Z0-9]{2})([0-9]{1,6})$/);
      if(m){
        const cie  = m[1];
        const nvol = m[2];
        // Cie est maintenant un input texte libre — on injecte directement
        setValAK('Cie', cie);
        setValAK('NVol', nvol);
      }else{
        setValAK('NVol', ff);
      }
    }

    /* ================= DEP ================= */
    let prevArrUsed = null;
    let nextDepUsed = null;

    if(flow === 'DEP'){
      setValAK('To', (f.adesIata || '') || 'BVA');

      setTimeFromISOAK('SOBT', f.sobt || f.eobt);
      setTimeFromISOAK('AOBT', f.aobt);
      // CTOT : mis à jour depuis AK, et effacé si AK n'en a plus
      if(f.ctot){
        setTimeFromISOAK('CTOT', f.ctot);
      } else {
        const ctotEl = document.getElementById('CTOT');
        if(ctotEl && ctotEl.dataset.ak === '1'){
          setValAK('CTOT', '');
        }
      }

      const siDep = akBuildSI(f, true, { includeDL:false });
      mergeSIFromAK('PreviSI', siDep);
      mergeSIFromAK('FinalSI', siDep);

      const prevArr = findLinkedArrForDep(f); // (déjà filtré "même jour" chez toi)
      if(prevArr){
        prevArrUsed = prevArr;

        setValAK('From', (prevArr.adepIata || '') || 'BVA');
        setTimeFromISOIfEmptyOrAK('SIBT', prevArr.sibt || prevArr.eibt);
        setTimeFromISOIfEmptyOrAK('AIBT', prevArr.aibt);

        if(prevArr?.paxNb != null) setIfEmptyOrAK('ArrPAX_MAIN', String(prevArr.paxNb));

        // v3.00 (Hugo) : poids des bagages à l'arrivée pour toutes les compagnies (FR/RK : bags ≈ poids ÷ 13)
        if(prevArr?.bags != null){
          setIfEmptyOrAK('ArrPOIDS', String(prevArr.bags));
        }

        const siArr = akBuildSI(prevArr, false, { includeDL:false });
        mergeSIFromAK('ArrSI', siArr);
      }else{
        setValAK('From', 'BVA');
      }

    /* ================= ARR ================= */
    }else{
      // provenance (From)
      setValAK('From', (f.adepIata || '') || 'BVA');

      // ✅ par défaut: avion reste à BVA (nuit / pas de rota)
      setValAK('To', 'BVA');

      setTimeFromISOAK('SIBT', f.sibt || f.eibt);
      setTimeFromISOAK('AIBT', f.aibt);

      if(f?.paxNb != null) setIfEmptyOrAK('ArrPAX_MAIN', String(f.paxNb));

      // v3.00 (Hugo) : poids des bagages à l'arrivée pour toutes les compagnies (FR/RK : bags ≈ poids ÷ 13)
      if(f?.bags != null){
        setIfEmptyOrAK('ArrPOIDS', String(f.bags));
      }

      const siArr = akBuildSI(f, false, { includeDL:false });
      mergeSIFromAK('ArrSI', siArr);

      const nextDep = findLinkedDepForArr(f); // (déjà filtré "même jour" chez toi)
      if(nextDep){
        nextDepUsed = nextDep;

        setValAK('To', (nextDep.adesIata || '') || 'BVA');

        setTimeFromISOIfEmptyOrAK('SOBT', nextDep.sobt || nextDep.eobt);
        setTimeFromISOIfEmptyOrAK('AOBT', nextDep.aobt);
        if(nextDep.ctot){
          setTimeFromISOAK('CTOT', nextDep.ctot);
        } else {
          const ctotEl = document.getElementById('CTOT');
          if(ctotEl && ctotEl.dataset.ak === '1'){
            setValAK('CTOT', '');
          }
        }

        const siDep = akBuildSI(nextDep, true, { includeDL:false });
        mergeSIFromAK('PreviSI', siDep);
        mergeSIFromAK('FinalSI', siDep);
      }
    }

    /* ===== BANDEAU ESSENTIEL (akMeta arrFF/depFF) ===== */
    let arrFF = '';
    let depFF = '';
    let bcForStrip = '';

    if(flow === 'ARR'){
      // ✅ le vol ARR sélectionné DOIT être affiché avant la flèche
      arrFF = (f.fullFlightNumber || f.callsign || '').toUpperCase().trim();
      bcForStrip = (f.borderControl || '').toUpperCase().trim();

      if(nextDepUsed){
        depFF = (nextDepUsed.fullFlightNumber || nextDepUsed.callsign || '').toUpperCase().trim();
      }
    }else{
      // DEP sélectionné après la flèche
      depFF = (f.fullFlightNumber || f.callsign || '').toUpperCase().trim();

      if(prevArrUsed){
        arrFF = (prevArrUsed.fullFlightNumber || prevArrUsed.callsign || '').toUpperCase().trim();
        bcForStrip = (prevArrUsed.borderControl || '').toUpperCase().trim();
      }
    }

    // v2.41 : callsigns ATC (ex. RYR2VL) affichés dans le bandeau
    const csOf = x => ((x && x.callsign) || '').toUpperCase().trim();
    const arrCS = flow === 'ARR' ? csOf(f) : csOf(prevArrUsed);
    const depCS = flow === 'DEP' ? csOf(f) : csOf(nextDepUsed);
    if(arrCS) setValAK('CallsignArr', arrCS);
    if(depCS) setValAK('CallsignDep', depCS);

    // ID du vol lié résolu par les fonctions de linking (plus fiable que f.linkedId)
    const resolvedLinkedId = flow === 'DEP'
      ? (prevArrUsed?.id || f.linkedId || '')
      : (nextDepUsed?.id || f.linkedId || '');

    // Le CTOT et sa regulation appartiennent au vol DEP :
    // c'est 'f' si on a selectionne un DEP, sinon le DEP lie a l'ARR.
    const depForReg = (flow === 'DEP') ? f : (nextDepUsed || null);
    const regInfo   = (depForReg && depForReg.regulation) ? depForReg.regulation : null;
    const ctotIso   = (depForReg && depForReg.ctot) ? depForReg.ctot : '';
    const atotIso   = (depForReg && depForReg.atot) ? depForReg.atot : '';

    storeAKMetaForTab({
      flow,
      id: f.id,
      linkedId: resolvedLinkedId,
      regulation: regInfo,
      ctotIso: ctotIso,
      atotIso: atotIso,
      reg: f.reg || '',
      ff: (f.fullFlightNumber || f.callsign || ''),
      timeISO: (flow === 'DEP')
        ? (f.sobt || f.eobt || f.aobt || f.atot || '')
        : (f.sibt || f.eibt || f.aibt || f.aldt || ''),
      pkg: f.pkg || '',
      arrFF,
      depFF,
      bc: bcForStrip
    });

    updateAllCalculations();
    updateTabLabelInstant();
  }catch(e){
    showPopup(`Erreur import AK (${String(e.message || e)})`, "#ef4444", 2200);
  }finally{
    // ✅ fermeture auto du picker après sélection (sauf refresh)
    if(!isRefresh){
      closeAKPicker();
      const flowSel = document.getElementById('akFlow');
      if(flowSel) flowSel.value = 'DEP';
      showPopup("Vol importé", "#16a34a", 1600);
      // Basculer sur l'onglet DÉPART si FROM=BVA, sinon ARRIVÉE
      if(typeof switchTimingPanel === 'function'){
        const fromVal = (document.getElementById('From')?.value || '').toUpperCase().trim();
        switchTimingPanel(fromVal === 'BVA' ? 'dep' : 'arr');
        if(fromVal === 'BVA') autoOpenCrewIfBVA();
      }
    }
  }}


function updateLidGuideVisibility(){
  const cie = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const btn = document.querySelector('#ldmFinal button[onclick="toggleFinalImage()"]');
  if(!btn) return;

  // v3.24 (Hugo) : guide LID seulement en Paper LID
  const show = (cie === 'FR' || cie === 'RK') && !(typeof isELID === 'function' && isELID());
  btn.style.display = show ? '' : 'none';
  const box = document.getElementById('finalImageBox');
  if(!show && box) box.style.display = 'none';
}

function updateDelayCodesVisibility(){
  const cie = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const btn = document.getElementById('delayCodesBtn');
  const box = document.getElementById('delayCodesBox');
  const show = true;   // v2.98 : liste des codes pour toutes les compagnies

  if(btn) btn.style.display = show ? '' : 'none';
  if(window.dlcSync) window.dlcSync();

  if(box){
    if(show){
      box.style.display = 'none';
    } else {
      box.style.display = 'none';
    }
  }
}
  
/* validateForm */
// ══════════════ PRESTATIONS + ASSISTANCES MODALS ══════════════

const PRESTATIONS_DEF = [
  { id:'asu',          label:'ASU',                   type:'yn' },
  { id:'rza',          label:'Flux par le RZA',        type:'yn' },
  { id:'eauPotable',   label:'Eau potable',            type:'yn' },
  { id:'vidange',      label:'Vidange toilettes',      type:'yn' },
  { id:'menageAssist', label:'Ménage Assist\'Air',     type:'yn' },
  { id:'menageGSF',label:'Ménage GSF',         type:'choice', choices:['N','S','DC','DI'] },
  { id:'collecte',     label:'Collecte ordures',       type:'yn', default:'Y' },
  { id:'echelle',      label:'Échelle supplémentaire', type:'yn' },
  { id:'degivrage',    label:'Dégivrage',              type:'yn' },
  { id:'toiletKit',    label:'Toilet Kit',             type:'yn' },
  { id:'pushPull',     label:'Push-pull',              type:'yn' },
  { id:'cargo',        label:'Cargo',                  type:'cargo' },
  { id:'roues',        label:'Roues',                  type:'roues' },
];

let _prestationsData  = {};
let _assistancesData  = {};
let _validateCallback = null;

// ── Prestations ───────────────────────────────────────────────
function openPrestationsModal(callback){
  const from   = (document.getElementById('From')?.value||'').toUpperCase().trim();
  const to     = (document.getElementById('To')?.value||'').toUpperCase().trim();
  const fromBVA = from === 'BVA', toBVA = to === 'BVA';

  const defaults = { collecte:'Y' };
  if(fromBVA){ defaults.eauPotable = 'Y'; defaults.collecte = 'N'; }
  if(toBVA){   defaults.collecte   = 'Y'; defaults.vidange  = 'Y'; }
  const init = Object.keys(_prestationsData).length ? _prestationsData : defaults;

  const body = document.getElementById('prestationsBody');
  body.innerHTML = '';

  PRESTATIONS_DEF.forEach(p => {
    const cur = init[p.id] !== undefined ? init[p.id] : (p.default || 'N');

    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; min-height:38px;';

    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:.88rem; font-weight:600; color:var(--text); flex:1;';
    lbl.textContent = p.label;
    row.appendChild(lbl);

    if(p.type === 'yn'){
      row.appendChild(buildToggle(p.id, ['N','Y'], cur));

    } else if(p.type === 'choice'){
      row.appendChild(buildToggle(p.id, p.choices, cur));

    } else if(p.type === 'cargo'){
      // Multi-select Arrivée / Départ + champ poids inline
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex; align-items:center; gap:6px; flex-wrap:wrap; justify-content:flex-end;';

      ['Arrivée','Départ'].forEach(opt => {
        const active = Array.isArray(cur) ? cur.includes(opt) : false;
        const btn = document.createElement('button');
        btn.dataset.cargoOpt = opt;
        btn.textContent = opt;
        btn.style.cssText = `padding:5px 6px; width:72px; box-sizing:border-box; text-align:center; border-radius:6px; border:1.5px solid ${active?'#2563eb':'var(--field-border)'}; background:${active?'#2563eb':'transparent'}; color:${active?'#fff':'var(--text)'}; font-size:.78rem; font-weight:700; cursor:pointer;`;
        btn.onclick = () => {
          const isNow = btn.style.background.includes('2563eb') || btn.style.background === 'rgb(37, 99, 235)';
          btn.style.background  = isNow ? 'transparent' : '#2563eb';
          btn.style.color       = isNow ? 'var(--text)'  : '#fff';
          btn.style.borderColor = isNow ? 'var(--field-border)' : '#2563eb';
          updateCargoWeight();
        };
        wrap.appendChild(btn);
      });

      // Poids inline
      const poidsWrap = document.createElement('div');
      poidsWrap.id = 'cargoPoidsWrap';
      const anyActive = Array.isArray(cur) && cur.length > 0;
      poidsWrap.style.cssText = `display:${anyActive?'flex':'none'}; align-items:center; gap:4px;`;
      const poidsInput = document.createElement('input');
      poidsInput.id = 'poidsCargo';
      poidsInput.type = 'number';
      poidsInput.value = _prestationsData.poidsCargo || '';
      poidsInput.placeholder = 'Poids';
      poidsInput.style.cssText = 'width:72px; padding:5px 7px; border:1.5px solid var(--field-border); border-radius:6px; background:var(--field); color:var(--text); font-size:.82rem; font-weight:600; text-align:center;';
      const poidsLbl = document.createElement('span');
      poidsLbl.style.cssText = 'font-size:.78rem; color:var(--muted); font-weight:600;';
      poidsLbl.textContent = 'kg';
      poidsWrap.appendChild(poidsInput);
      poidsWrap.appendChild(poidsLbl);
      wrap.appendChild(poidsWrap);

      row.appendChild(wrap);

    } else if(p.type === 'roues'){
      // Roues : nombre + poids (kg a l'exterieur)
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex; align-items:center; gap:6px; justify-content:flex-end;';

      const nbInput = document.createElement('input');
      nbInput.id = 'rouesNb';
      nbInput.type = 'number';
      nbInput.value = _prestationsData.rouesNb || '';
      nbInput.placeholder = 'Nb';
      nbInput.style.cssText = 'width:72px; padding:5px 7px; border:1.5px solid var(--field-border); border-radius:6px; background:var(--field); color:var(--text); font-size:.82rem; font-weight:600; text-align:center;';
      wrap.appendChild(nbInput);

      const rPoidsInput = document.createElement('input');
      rPoidsInput.id = 'rouesPoids';
      rPoidsInput.type = 'number';
      rPoidsInput.value = _prestationsData.rouesPoids || '';
      rPoidsInput.placeholder = 'Poids';
      rPoidsInput.style.cssText = 'width:72px; padding:5px 7px; border:1.5px solid var(--field-border); border-radius:6px; background:var(--field); color:var(--text); font-size:.82rem; font-weight:600; text-align:center;';
      wrap.appendChild(rPoidsInput);

      const rKgLbl = document.createElement('span');
      rKgLbl.style.cssText = 'font-size:.78rem; color:var(--muted); font-weight:600;';
      rKgLbl.textContent = 'kg';
      wrap.appendChild(rKgLbl);

      row.appendChild(wrap);
    }

    body.appendChild(row);
    const sep = document.createElement('div');
    sep.style.cssText = 'height:1px; background:var(--field-border); opacity:.4; margin:0 -4px;';
    body.appendChild(sep);
  });

  _validateCallback = callback;
  document.getElementById('prestationsModal').style.display = 'flex';
}

function updateCargoWeight(){
  const btns = document.querySelectorAll('#prestationsBody button[data-cargo-opt]');
  const any  = [...btns].some(b => b.style.background.includes('2563eb') || b.style.background === 'rgb(37, 99, 235)');
  const wrap = document.getElementById('cargoPoidsWrap');
  if(wrap) wrap.style.display = any ? 'flex' : 'none';
}

function buildToggle(id, options, selected){
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex; gap:4px;';
  options.forEach(opt => {
    const active = opt === selected;
    const btn = document.createElement('button');
    btn.dataset.toggleId  = id;
    btn.dataset.toggleVal = opt;
    btn.textContent = opt;
    btn.style.cssText = `padding:5px 11px; border-radius:6px; border:1.5px solid ${active?'#2563eb':'var(--field-border)'}; background:${active?'#2563eb':'transparent'}; color:${active?'#fff':'var(--text)'}; font-size:.78rem; font-weight:700; cursor:pointer;`;
    btn.onclick = () => {
      wrap.querySelectorAll('button').forEach(b => {
        const isMe = b.dataset.toggleVal === opt;
        b.style.background  = isMe ? '#2563eb' : 'transparent';
        b.style.color       = isMe ? '#fff'    : 'var(--text)';
        b.style.borderColor = isMe ? '#2563eb' : 'var(--field-border)';
      });
    };
    wrap.appendChild(btn);
  });
  return wrap;
}

function closePrestationsModal(){
  document.getElementById('prestationsModal').style.display = 'none';
}

function confirmPrestations(){
  _prestationsData = {};
  PRESTATIONS_DEF.forEach(p => {
    if(p.type === 'cargo'){
      const btns   = document.querySelectorAll('#prestationsBody button[data-cargo-opt]');
      const chosen = [...btns].filter(b => b.style.background.includes('2563eb') || b.style.background === 'rgb(37, 99, 235)').map(b => b.dataset.cargoOpt);
      _prestationsData.cargo = chosen.length ? chosen : ['N'];
      const inp = document.getElementById('poidsCargo');
      if(inp) _prestationsData.poidsCargo = inp.value;
    } else if(p.type === 'roues'){
      const nb = document.getElementById('rouesNb');
      const pd = document.getElementById('rouesPoids');
      if(nb) _prestationsData.rouesNb    = nb.value;
      if(pd) _prestationsData.rouesPoids = pd.value;
    } else {
      const btns = document.querySelectorAll(`#prestationsBody button[data-toggle-id="${p.id}"]`);
      btns.forEach(b => {
        if(b.style.background.includes('2563eb') || b.style.background === 'rgb(37, 99, 235)')
          _prestationsData[p.id] = b.dataset.toggleVal;
      });
    }
  });
  closePrestationsModal();
  // Ecrire tout de suite dans l'onglet (sinon perdu si l'app se ferme avant
  // le prochain evenement de sauvegarde)
  if(typeof saveCurrentTabData === 'function') saveCurrentTabData();
  openAssistancesModal(_validateCallback);
}

// ── Assistances ───────────────────────────────────────────────
function openAssistancesModal(callback){
  const prev = _assistancesData;
  const body = document.getElementById('assistancesBody');
  body.innerHTML = '';

  ['WCHR','WCHS','WCHC','Autre'].forEach(type => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:38px;';

    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:.88rem; font-weight:700; color:var(--text); letter-spacing:.04em;';
    lbl.textContent = type;
    row.appendChild(lbl);

    const inp = document.createElement('input');
    inp.id = 'assist_' + type;
    inp.type = 'number';
    inp.min  = '0';
    inp.value = prev['assist_' + type] || '';
    inp.placeholder = '0';
    inp.style.cssText = 'width:72px; padding:7px 10px; border:1.5px solid var(--field-border); border-radius:8px; background:var(--field); color:var(--text); font-size:1rem; font-weight:700; text-align:center;';
    row.appendChild(inp);

    body.appendChild(row);
    const sep = document.createElement('div');
    sep.style.cssText = 'height:1px; background:var(--field-border); opacity:.4;';
    body.appendChild(sep);
  });

  _validateCallback = callback;
  document.getElementById('assistancesModal').style.display = 'flex';
}

function closeAssistancesModal(){
  document.getElementById('assistancesModal').style.display = 'none';
}

function confirmAssistances(){
  _assistancesData = {};
  ['WCHR','WCHS','WCHC','Autre'].forEach(type => {
    const inp = document.getElementById('assist_' + type);
    if(inp) _assistancesData['assist_' + type] = inp.value || '0';
  });
  closeAssistancesModal();
  if(typeof saveCurrentTabData === 'function') saveCurrentTabData();
  openRzaModal(_validateCallback);
}

// ── RZA + Résumé ──────────────────────────────────────────────
let _rzaData = {};

function openRzaModal(callback){
  _validateCallback = callback;

  // Champ RZA
  const inp = document.getElementById('rzaInitialesInput');
  if(inp) inp.value = _rzaData.initiales || '';

  // Récupération des timings clés
  const v = id => (document.getElementById(id)?.value || '').trim();
  const aibtVal  = v('AIBT');
  const eobtVal  = (document.getElementById('timer-eobt')?.textContent || '').replace('--:--','').trim();
  const aobtVal  = v('AOBT');
  const parseHM  = s => { const [h,m]=(s||'').split(':').map(Number); return (isNaN(h)||isNaN(m)) ? null : h*60+m; };
  const fmt      = m => m == null ? '--:--' : `${String(Math.floor(((m%1440)+1440)%1440/60)).padStart(2,'0')}:${String(((m%1440)+1440)%1440%60).padStart(2,'0')}`;
  const fmtDur   = m => m == null ? '—' : `${Math.floor(Math.abs(m)/60)}h${String(Math.abs(m)%60).padStart(2,'0')}`;

  const aibtM = parseHM(aibtVal), aobtM = parseHM(aobtVal);
  let tat = null, ret = null;
  if(aibtM != null && aobtM != null){
    tat = aobtM - aibtM; if(tat < 0) tat += 1440;
    const sobtM = parseHM(v('SOBT'));
    if(sobtM != null){ ret = aobtM - sobtM; if(ret < 0) ret += 1440; if(ret > 720) ret -= 1440; if(ret < 0) ret = 0; }
  }

  // Remplissage du résumé
  const rows = [
    ['AIBT', aibtVal || '—'],
    ['EOBT', eobtVal || '—'],
    ['AOBT', aobtVal || '—'],
    ['Turnaround', tat != null ? fmtDur(tat) : '—'],
    ['Retard total', ret == null ? '—' : (ret > 0 ? `+${fmtDur(ret)}` : '0')],
  ];
  const table = document.getElementById('rzaSummaryTable');
  if(table){
    table.innerHTML = rows.map(([k,vv]) =>
      `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--field-border);font-size:.88rem;">
        <span style="color:var(--muted);font-weight:600;">${k}</span>
        <span style="font-weight:800;color:var(--text);">${vv}</span>
      </div>`
    ).join('');
  }

  // Détection d'incohérences
  const warnings = [];
  if(aibtM != null && aobtM != null){
    if(tat < 5) warnings.push('⚠️ AOBT très proche ou avant AIBT');
  }

  // Durées d'actions anormales
  const actionPairs = [
    ['Débarquement', 'PremierDebarque', 'DernierDebarque'],
    // Cabin tidy/cleaning exclu (durée courte normale)
    ['Embarquement', 'AvionPremierEmbarque', 'AvionDernierEmbarque'],
    ['Avitair', 'ArriveeFuel', 'DepartFuel'],
    ['Lift arr', 'ArriveeLiftArr', 'DepartLiftArr'],
    ['Lift dep', 'ArriveeLift', 'DepartLift'],
  ];
  actionPairs.forEach(([name, startId, endId]) => {
    const s = parseHM(v(startId)), e = parseHM(v(endId));
    if(s == null || e == null) return;
    let dur = e - s; if(dur < -720) dur += 1440;
    if(dur < 0) warnings.push(`⚠️ ${name} : fin avant début`);
    else if(dur < 5) warnings.push(`⚠️ ${name} : durée anormalement courte (${dur}min)`);
    else if(dur > 120) warnings.push(`⚠️ ${name} : durée anormalement longue (${fmtDur(dur)})`);
  });

  const warnEl = document.getElementById('rzaWarnings');
  if(warnEl){
    if(warnings.length){
      warnEl.style.display = 'block';
      warnEl.innerHTML = warnings.map(w =>
        `<div style="padding:5px 8px;background:color-mix(in srgb,#f59e0b 12%,transparent);border-left:3px solid #f59e0b;border-radius:4px;font-size:.82rem;font-weight:600;color:var(--text);">${w}</div>`
      ).join('');
    } else {
      warnEl.style.display = 'none';
      warnEl.innerHTML = '';
    }
  }

  document.getElementById('rzaModal').style.display = 'flex';
}

function closeRzaModal(){
  document.getElementById('rzaModal').style.display = 'none';
}

function confirmRza(){
  const inp = document.getElementById('rzaInitialesInput');
  const val = (inp?.value || '').toUpperCase().trim();
  if(val.length < 2){
    inp?.focus();
    inp?.style && (inp.style.borderColor = '#dc2626');
    return;
  }
  _rzaData.initiales = val;
  closeRzaModal();
  if(_validateCallback) _validateCallback();
}

const AC_REQUIRED = false; // remettre à true pour imposer l'auto-contrôle Ryanair avant validation

function validateForm() {
  const err = checkValidateRules();
  showValidateError(err);
  if(err){
    showPopup(err.popup, '#ef4444', 2500);
    return;
  }
  // v2.55 : FR/RK (hors CL35) passent d'abord par l'auto-contrôle Ryanair
  // v2.81 : phase de test, l'auto-contrôle n'est plus imposé (AC_REQUIRED = false)
  if(AC_REQUIRED && typeof acNeeded === 'function' && acNeeded()){
    acSteps(true);
    uiAutoCtrlOpen(() => openPrestationsModal(doValidate));
    return;
  }
  if(typeof acSteps === 'function') acSteps(false);
  openPrestationsModal(doValidate);
}

function doValidate() {
  const val = id => (document.getElementById(id)?.value || "");

  const dateRaw = val("Date");
  const [yyyy, mm, dd] = (dateRaw || "").split("-");
  const dateTitre = (yyyy && mm && dd) ? `${dd}-${mm}-${yyyy}` : "";

  const cie      = val("Cie");
  const vol      = val("NVol");
  const from     = val("From");
  const to       = val("To");
  const immat    = val("Immat");
  const typeAvion= val("TypeAvion");
  const rza      = _rzaData.initiales || '';

  const titre = `[TIMING] ${dateTitre} / ${cie}${vol} ${from}-${to} / ${immat} / ${rza}`;

  // ── Helpers ──────────────────────────────────────────────────────────────
  const v   = id => (document.getElementById(id)?.value || '').trim();
  const hhmm = val => {
    if(!val) return '';
    if(val.includes('T') || (val.endsWith('Z') && val.length > 10)){
      try{
        const d = new Date(val);
        if(!isNaN(d.getTime())){
          const h = isUTC ? d.getUTCHours() : d.getHours();
          const m = isUTC ? d.getUTCMinutes() : d.getMinutes();
          return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
        }
      }catch(e){}
    }
    return val;
  };
  const t  = id => hhmm(v(id));
  const r  = (label, value) => value ? `${label} : ${value}\n` : '';
  const s  = () => `\n- - - - - - - - - - - - - - - - - - - -\n\n`;
  const br = () => '\n';

  // ── INFO VOL ─────────────────────────────────────────────────────────────
  let body = '';

  body += r('DATE',        dateTitre);
  body += r('CIE',         cie);
  body += r('N° DE VOL',   `${cie}${vol}`);
  body += r('FROM',        from);
  body += r('TO',          to);
  body += r('RZA',         rza);
  body += r('IMMAT',       immat);
  body += r('TYPE',        typeAvion);
  body += r('CALLSIGN',    v('Callsign'));
  body += r('PARKING',     v('Parking'));
  body += r('MODE',        isUTC ? 'UTC' : 'LOCAL');

  // ── HORAIRES ─────────────────────────────────────────────────────────────
  body += s();
  body += r('SIBT', t('SIBT') || '--:--');
  body += r('AIBT', t('AIBT') || '--:--');
  body += r('SOBT', t('SOBT') || '--:--');
  body += r('AOBT', t('AOBT') || '--:--');
  if(t('EOBT')) body += r('EOBT', t('EOBT'));
  if(t('CTOT')) body += r('CTOT', t('CTOT'));

  // ── TIMINGS ───────────────────────────────────────────────────────────────
  body += s();

  if(t('ArrPNT'))            { body += r('ARRIVEE PNT', t('ArrPNT')); }
  if(t('ArrPNC'))            { body += r('ARRIVEE PNC', t('ArrPNC')); }

  body += br();
  if(t('PremierDebarque'))   { body += r('PREMIER DEBARQUE (AV)', t('PremierDebarque')); }
  if(t('PremierDebarqueL2')) { body += r('PREMIER DEBARQUE (AR)', t('PremierDebarqueL2')); }
  if(t('DernierDebarque'))   { body += r('DERNIER DEBARQUE',      t('DernierDebarque')); }

  body += br();
  if(t('ArriveeLiftArr') || t('DepartLiftArr'))
    body += r('LIFT ARR', `${t('ArriveeLiftArr')||'--:--'} → ${t('DepartLiftArr')||'--:--'}`);
  if(t('MiseEnPlaceTapis')) body += r('TAPIS BAGAGES', t('MiseEnPlaceTapis'));
  if(t('DebutDechargementBagages') || t('FinDechargementBagages'))
    body += r('DECHARGEMENT', `${t('DebutDechargementBagages')||'--:--'} → ${t('FinDechargementBagages')||'--:--'}`);
  if(t('DebutRepositionnement') || t('FinRepositionnement'))
    body += r('REPOSITIONNEMENT', `${t('DebutRepositionnement')||'--:--'} → ${t('FinRepositionnement')||'--:--'}`);
  [['CLEANING CABINE','DebutCleaningCabine','FinCleaningCabine'],['VIDANGE TOILETTES','DebutVidangeToilettes','FinVidangeToilettes'],
   ['EAU POTABLE','DebutEauPotable','FinEauPotable'],['DEGIVRAGE','DebutDegivrage','FinDegivrage']].forEach(([lb,a,b])=>{
    if(t(a) || t(b)) body += r(lb, `${t(a)||'--:--'} → ${t(b)||'--:--'}`);
  });

  body += br();
  if(t('AvionPremierEmbarque')) { body += r('PREMIER EMBARQUE',  t('AvionPremierEmbarque')); }
  if(t('AvionDernierEmbarque')) { body += r('DERNIER EMBARQUE',  t('AvionDernierEmbarque')); }

  body += br();
  if(t('DebutChargementBagages') || t('FinChargementBagages'))
    body += r('CHARGEMENT', `${t('DebutChargementBagages')||'--:--'} → ${t('FinChargementBagages')||'--:--'}`);
  if(t('ArriveeLift') || t('DepartLift'))
    body += r('LIFT DEP', `${t('ArriveeLift')||'--:--'} → ${t('DepartLift')||'--:--'}`);
  if(t('ArriveeFuel') || t('DepartFuel'))
    body += r('AVITAIR',  `${t('ArriveeFuel')||'--:--'} → ${t('DepartFuel')||'--:--'}`);

  body += br();
  if(t('RemiseLID'))            { body += r('REMISE LID',       t('RemiseLID')); }
  if(t('FermeturePorteAvion'))  { body += r('FERMETURE PORTE',  t('FermeturePorteAvion')); }
  if(t('ConnexionAgentCasque')) { body += r('CONNEXION CASQUE', t('ConnexionAgentCasque')); }
  if(t('ReouverturePorteAvion')) { body += r('REOUVERTURE PORTE', t('ReouverturePorteAvion')); }
  if(t('FermetureSouteAV'))     { body += r('FERMETURE SOUTE AV', t('FermetureSouteAV')); }
  if(t('FermetureSouteAR'))     { body += r('FERMETURE SOUTE AR', t('FermetureSouteAR')); }
  if(t('RetraitEchelleAV'))     { body += r('RETRAIT ECHELLE AV', t('RetraitEchelleAV')); }
  if(t('RetraitEchelleAR'))     { body += r('RETRAIT ECHELLE AR', t('RetraitEchelleAR')); }
  if(t('ConnexionPush'))        { body += r('CONNEXION PUSH',     t('ConnexionPush')); }
  if(t('ChangementPush'))       { body += r('CHANGEMENT PUSH',    t('ChangementPush')); }
  if(t('DebutComptageBagages') || t('FinComptageBagages'))
    body += r('COMPTAGE BAGAGES', `${t('DebutComptageBagages')||'--:--'} → ${t('FinComptageBagages')||'--:--'}`);

  // ── OPS : INAD / NAYAK ───────────────────────────────────────────────────
  const hasInad = t('ArriveeINAD') || v('ArrSI') || v('PreviSI');
  if(hasInad){
    body += s();
    if(t('ArriveeINAD')) body += r('INAD / NAYAK', t('ArriveeINAD'));
    if(v('ArrSI'))       body += r('SI (ARR)',      v('ArrSI'));
    if(v('PreviSI'))     body += r('SI (PREVI)',    v('PreviSI'));
  }

  // ── LOAD FINAL ────────────────────────────────────────────────────────────
  const hasFinal = v('FinalTOB') || v('FinalADULT') || v('FinalMALE') || v('FinalBAGS');
  if(hasFinal){
    body += s();
    body += '[ LOAD FINAL ]\n\n';

    if(v('FinalTOB'))    body += r('TOB', v('FinalTOB'));

    const paxDetails = [
      v('FinalADULT')  && `ADULT ${v('FinalADULT')}`,
      v('FinalMALE')   && `M ${v('FinalMALE')}`,
      v('FinalFEMALE') && `F ${v('FinalFEMALE')}`,
      v('FinalCHILD')  && `CH ${v('FinalCHILD')}`,
      v('FinalINFANT') && `INF ${v('FinalINFANT')}`,
    ].filter(Boolean).join('  ');
    if(paxDetails) body += paxDetails + '\n';

    body += br();
    if(v('FinalBAGS'))  body += r('BAGS',  v('FinalBAGS'));
    if(v('FinalGB'))    body += r('GB',    v('FinalGB') + ' pcs');
    if(v('FinalPOIDS')) body += r('POIDS', v('FinalPOIDS') + ' kg');

    body += br();
    ['FinalOA','FinalOB','FinalOC','FinalOD'].forEach(id => {
      if(v(id)) body += r(id.replace('Final',''), v(id));
    });

    body += br();
    const isW4W6email = (cie === 'W4' || cie === 'W6');
    const h1lbl = isW4W6email ? 'CP1' : 'H1';
    const h2lbl = isW4W6email ? 'CP2' : 'H2';
    const h3lbl = isW4W6email ? 'CP3' : 'H3';
    const h4lbl = isW4W6email ? 'CP4' : 'H4';
    [[`FinalH1`,h1lbl],[`FinalH2`,h2lbl],[`FinalH3`,h3lbl],[`FinalH4`,h4lbl]].forEach(([id,lbl]) => {
      if(v(id)) body += r(lbl, v(id));
    });

    body += br();
    if(v('CommChiffresPorte')) body += r('COMM. CHIFFRES PORTE', v('CommChiffresPorte'));
    if(v('CommChargementPiste')) body += r('COMM. CHARGEMENT PISTE', v('CommChargementPiste'));
    if(v('FinalSI'))           body += r('SI (FINAL)', v('FinalSI'));
  }

  // ── RETARDS ───────────────────────────────────────────────────────────────
  const hasDL = v('DLcode1') || v('DLcode2') || v('DLcode3');
  if(hasDL){
    body += s();
    body += '[ RETARDS ]\n\n';
    // "575 min (9h35)" dès que la durée dépasse 60 min
    const dlDur = (id)=>{
      const raw = v(id);
      if(!raw) return '?';
      const m = parseInt(raw, 10);
      return (Number.isFinite(m) && m > 60) ? `${raw} min (${fmtMinToHM(m)})` : `${raw} min`;
    };
    if(v('DLcode1')) body += `DL ${v('DLcode1')}  /  ${dlDur('DLduree1')}\n`;
    if(v('DLcode2')) body += `DL ${v('DLcode2')}  /  ${dlDur('DLduree2')}\n`;
    if(v('DLcode3')) body += `DL ${v('DLcode3')}  /  ${dlDur('DLduree3')}\n`;
  }

  // ── PRESTATIONS ───────────────────────────────────────────────────────────
  const prestLabels = {
    asu:'ASU', rza:'Flux RZA', eauPotable:'Eau potable', vidange:'Vidange toilettes',
    menageAssist:'Ménage Assist\'Air', menageGSF:'Ménage GSF',
    collecte:'Collecte ordures', echelle:'Échelle supp.', degivrage:'Dégivrage',
    toiletKit:'Toilet Kit', pushPull:'Push-pull',
  };
  if(Object.keys(_prestationsData).length){
    body += s();
    body += '[ PRESTATIONS ]\n\n';
    Object.entries(prestLabels).forEach(([k,lbl]) => {
      const v2 = _prestationsData[k];
      if(v2 !== undefined) body += `${lbl} : ${v2}\n`;
    });
    // Cargo
    const cargo = _prestationsData.cargo;
    if(cargo){
      const cargoVal = Array.isArray(cargo) ? (cargo.includes('N') ? 'N' : cargo.join(' + ')) : cargo;
      let cargoLine  = `Cargo : ${cargoVal}`;
      if(cargoVal !== 'N' && _prestationsData.poidsCargo) cargoLine += ` (${_prestationsData.poidsCargo} kg)`;
      body += cargoLine + '\n';
    }
  }

  // ── ASSISTANCES ───────────────────────────────────────────────────────────
  const assistTotal = ['WCHR','WCHS','WCHC','Autre'].reduce((s,t) => s + parseInt(_assistancesData['assist_'+t]||0), 0);
  if(assistTotal > 0){
    body += s();
    body += '[ ASSISTANCES PMR ]\n\n';
    ['WCHR','WCHS','WCHC','Autre'].forEach(t => {
      const n = parseInt(_assistancesData['assist_'+t]||0);
      if(n > 0) body += `${t} : ${n}\n`;
    });
  }

  // ── AUTO-CONTRÔLE RYANAIR ─────────────────────────────────────────────────
  if(typeof acNeeded === 'function' && acNeeded() && (AC_REQUIRED || acSummary().done > 0 || acSummary().signe)){
    const ac = acSummary();
    body += s();
    body += '[ AUTO-CONTROLE RYANAIR ]\n\n';
    body += `VERIFIE : ${ac.done}/${ac.total}\n`;
    body += r('REMISE LID', ac.lid);
    body += r('RZA', ac.nom);
    body += `SIGNATURE : ${ac.signe ? 'OUI' : 'NON'}\n`;
  }

  // ── DOMMAGES (photos à envoyer à part depuis le menu Dommages) ─────────────
  const dmgTxt = v('Dommages');
  if(dmgTxt){
    const nb = dmgTxt.split(', ').length;
    body += s();
    body += '[ DOMMAGES ]\n\n';
    body += dmgTxt.split(', ').join('\n') + '\n';
    body += `PHOTOS : ${nb} (envoyées à part)\n`;
  }

  // ── BLOC NOTE ─────────────────────────────────────────────────────────────
  const faitsTxt = v('FaitsSaillants');
  if(faitsTxt){
    body += s();
    body += '[ BLOC NOTE ]\n\n';
    body += faitsTxt + '\n';
  }

  window.location.href =
    `mailto:?subject=${encodeURIComponent(titre)}&body=${encodeURIComponent(body)}`;
}
   
/* Rappel immat + type en haut de l'onglet FUEL (evite de fermer la fenetre) */
function updateFuelAcHeader(){
  const sec = document.getElementById('ldmFuel');
  if(!sec) return;

  let hd = document.getElementById('fuelAcHeader');
  if(!hd){
    hd = document.createElement('div');
    hd.id = 'fuelAcHeader';
    hd.className = 'fuel-ac';
    sec.insertAdjacentElement('afterbegin', hd);
  }

  const immat = (document.getElementById('Immat')?.value || '').toUpperCase().trim() || '------';
  const type  = (document.getElementById('TypeAvion')?.value || '').toUpperCase().trim() || '----';
  hd.textContent = `${immat} \u00b7 ${type}`;
}
