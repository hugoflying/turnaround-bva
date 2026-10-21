/* Heures, mode sombre/UTC, Timeline, réglages (découpé de app.js, chargé dans l'ordre de index.html) */
/* ===== Affichage de la durée en heures sur les DL (ex: 575 → 9h35) ===== */
function fmtMinToHM(mins){
  const m = Math.max(0, parseInt(mins,10) || 0);
  return Math.floor(m/60) + 'h' + String(m % 60).padStart(2,'0');
}

// Ajoute "(9h35)" au libellé du champ dès que la durée dépasse 60 min
function updateDLHourHints(){
  [1,2,3].forEach(i=>{
    const el = document.getElementById('DLduree' + i);
    if(!el) return;
    const field = el.closest('.field') || el.parentElement?.parentElement;
    const lbl   = field ? field.querySelector('label.label, .label, .ld-stat-label') : null;
    if(!lbl) return;

    // Mémorise le libellé d'origine une seule fois
    if(!lbl.dataset.baseLabel) lbl.dataset.baseLabel = (lbl.textContent || '').trim();
    const base = lbl.dataset.baseLabel;

    const v = parseInt(el.value, 10) || 0;
    if(v > 60){
      // "DL Durée 1 (min)" → "DL Durée 1 (9h35)" (on évite le double parenthésage)
      const stem = base.replace(/\s*\(min\)\s*$/i, '');
      lbl.textContent = `${stem} (${fmtMinToHM(v)})`;
    } else {
      lbl.textContent = base;
    }
  });
}


/* Utils time */
function fireTimeEvents(input){
  if(!input) return;
  input.dispatchEvent(new Event('input',  { bubbles:true }));
  input.dispatchEvent(new Event('change', { bubbles:true }));
}

function setNow(fieldId) {
  const input = document.getElementById(fieldId);
  if(!input) return;

  const now = new Date();
  const hh = isUTC ? now.getUTCHours() : now.getHours();
  const mm = isUTC ? now.getUTCMinutes() : now.getMinutes();

  input.value = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  fireTimeEvents(input); // ✅
}

function adjustTime(fieldId, delta) {
  const input = document.getElementById(fieldId);
  if (!input || !input.value) return;

  let [hh, mm] = input.value.split(':').map(Number);
  let total = hh * 60 + mm + delta;
  if (total < 0) total += 1440;
  if (total >= 1440) total -= 1440;

  hh = Math.floor(total / 60);
  mm = total % 60;

  input.value = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  fireTimeEvents(input); // ✅
}
  
/* Switches */
function setDarkMode(enable, fromInit=false){
  const currentlyDark = document.body.classList.contains('dark');

  if (enable && !currentlyDark) document.body.classList.add('dark');
  if (!enable && currentlyDark) document.body.classList.remove('dark');

  // ✅ applique aussi sur <html> pour les variables CSS
  document.documentElement.classList.toggle('dark', enable);

  const dt = document.getElementById('darkToggle');
  if(dt) dt.checked = enable;

  const darkLabel = document.getElementById('darkLabel');
  if(darkLabel) darkLabel.textContent = enable ? 'Sombre' : 'Clair';

  localStorage.setItem('modeDark', enable ? '1' : '0');

  updateHeaderOffset();
  renderTimeline();
}

function setTimeModeUTC(enable, fromInit=false){
  const offsetHours = -new Date().getTimezoneOffset() / 60;

  if (!fromInit && enable !== isUTC) {
    const inputs = document.querySelectorAll('input[type="time"]');
    inputs.forEach(input => {
      if (!input.value) return;
      let [hh, mm] = input.value.split(':').map(Number);
      let newH = enable ? hh - offsetHours : hh + offsetHours;
      let totalMin = Math.round(newH * 60 + mm);
      totalMin = ((totalMin % 1440) + 1440) % 1440;
      const outH = Math.floor(totalMin / 60);
      const outM = totalMin % 60;
      input.value = `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`;
    });

    // ✅ CTOT est type="hidden" — le convertir séparément
    const ctotEl = document.getElementById('CTOT');
    if(ctotEl && ctotEl.value && ctotEl.value.includes(':')) {
      let [hh, mm] = ctotEl.value.split(':').map(Number);
      let totalMin = Math.round((enable ? hh - offsetHours : hh + offsetHours) * 60 + mm);
      totalMin = ((totalMin % 1440) + 1440) % 1440;
      ctotEl.value = String(Math.floor(totalMin/60)).padStart(2,'0') + ':' + String(totalMin%60).padStart(2,'0');
      // Mettre à jour l'affichage timer-ctot
      const timerCtot = document.getElementById('timer-ctot');
      if(timerCtot) timerCtot.textContent = ctotEl.value;
    }
  }

  isUTC = enable;

  const ut = document.getElementById('utcToggle');
  if(ut) ut.checked = enable;

  const tzLabel = document.getElementById('tzLabel');
  if(tzLabel) tzLabel.textContent = enable ? 'UTC' : 'Local';
  const tzB = document.getElementById('fhTz');
  if(tzB){ tzB.textContent = enable ? 'UTC' : 'LT'; tzB.classList.toggle('utc', !!enable); tzB.title = enable ? 'Heures en UTC' : 'Heures locales'; }
  localStorage.setItem('modeUTC', enable ? '1' : '0');

  // ✅ Convertir les valeurs de temps dans TOUS les onglets en localStorage
  if(!fromInit){
    const offsetHours = -new Date().getTimezoneOffset() / 60;
    const timeFields = ['SIBT','AIBT','SOBT','AOBT','CTOT',
      'ArriveeFuel','PremierDebarque','PremierDebarqueL2','DernierDebarque',
      'ArriveeLiftArr','DepartLiftArr','ArrPNT','ArrPNC',
      'AvionPremierEmbarque','AvionDernierEmbarque',
      'ArriveeLift','DepartLift','DepartFuel','ArriveeINAD',
      'RemiseLID','FermeturePorteAvion'];

    const tabs = JSON.parse(localStorage.getItem('flightTabs') || '[]');
    tabs.forEach(tid => {
      if(tid === currentTabId) return; // onglet courant déjà mis à jour par les inputs
      try{
        const data = JSON.parse(localStorage.getItem('tab-'+tid) || '{}');
        let changed = false;
        timeFields.forEach(fid => {
          const val = data[fid];
          if(!val || !val.includes(':')) return;
          let [hh, mm] = val.split(':').map(Number);
          let totalMin = Math.round((enable ? hh - offsetHours : hh + offsetHours) * 60 + mm);
          totalMin = ((totalMin % 1440) + 1440) % 1440;
          data[fid] = String(Math.floor(totalMin/60)).padStart(2,'0') + ':' + String(totalMin%60).padStart(2,'0');
          changed = true;
        });
        if(changed) localStorage.setItem('tab-'+tid, JSON.stringify(data));
      }catch(_){}
    });
  }

  // Resync TOUS les tw-displays immédiatement après conversion
  twSyncAll();
  updateAllCalculations();

  // ✅ Resync timer-ctot (type="hidden", non couvert par twSyncAll)
  const ctotEl2 = document.getElementById('CTOT');
  const timerCtot2 = document.getElementById('timer-ctot');
  if(ctotEl2 && timerCtot2) timerCtot2.textContent = ctotEl2.value || '--:--';

  // Si le popup regulation CTOT est ouvert, on le redessine pour que l'heure
  // et l'historique suivent le nouveau mode (local/UTC) sans le refermer.
  const ctotModal = document.getElementById('ctotRegModal');
  if(ctotModal && ctotModal.style.display === 'flex' && typeof showCtotRegulation === 'function'){
    showCtotRegulation();
  }

}

/* Popup */
function showPopup(message, color = "#2563eb", duration = 2000) {
  const popup = document.createElement('div');
  popup.id = "popup";
  popup.textContent = message;
  popup.style.background = color;
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), duration);
}

/* Timeline helpers */
let showTimeLabels = true;
let timelineUserScrolled = false;

function parseHHMM(str){
  if(!str || !/^\d{2}:\d{2}$/.test(str)) return null;
  const [h,m] = str.split(':').map(Number);
  return h*60 + m;
}
function fmtHHMM(mins){
  mins = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(mins/60), m = mins%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function toExtended(t, min, max){
  const wraps = (max > 1440);
  if (!wraps) return t;
  const startMod = ((min % 1440) + 1440) % 1440;
  return (t < startMod) ? t + 1440 : t;
}
function computeTimelineWindow(allTimes){
  const H40  = parseHHMM((document.getElementById('timer-h40')?.textContent || '').replace('--:--',''));
  const SIBT = parseHHMM(document.getElementById('SIBT')?.value || '');
  const AIBT = parseHHMM(document.getElementById('AIBT')?.value || '');

  const SOBT = parseHHMM(document.getElementById('SOBT')?.value || '');
  const AOBT = parseHHMM(document.getElementById('AOBT')?.value || '');
  const EOBT = parseHHMM((document.getElementById('timer-eobt')?.textContent || '').replace('--:--',''));
  const CTOT = parseHHMM(document.getElementById('CTOT')?.value || '');

  // Des que l'AIBT est connu, le turnaround commence reellement la : on ignore
  // SIBT et H40 (derives du SOBT programme) qui rendent la fenetre enorme
  // sur un vol tres retarde. Avant l'arrivee, on garde l'ancien comportement.
  let starts = (AIBT != null) ? [AIBT] : [H40, SIBT].filter(v => v != null);

  // Filet de securite : aucun evenement saisi ne doit sortir de la fenetre
  const evTimes = (allTimes || []).filter(v => v != null);
  if(starts.length && evTimes.length){
    const evMin = Math.min(...evTimes);
    if(evMin < Math.min(...starts)) starts = starts.concat([evMin]);
  }

  const ends = [SOBT, AOBT, EOBT, CTOT, ...(allTimes || [])].filter(v => v != null);

  // Avion au bloc et pas encore parti : la fenetre va jusqu'a maintenant (ligne NOW
  // visible, barres en cours non coupees), dans la limite de 6 h apres l'arrivee.
  if(AIBT != null && AOBT == null){
    const d = new Date();
    const nowM = (typeof isUTC !== 'undefined' && isUTC) ? d.getUTCHours()*60 + d.getUTCMinutes() : d.getHours()*60 + d.getMinutes();
    const since = ((nowM - AIBT) % 1440 + 1440) % 1440;
    if(since <= 360) ends.push(AIBT + since + 3);
  }

  if(starts.length && ends.length){
    let startRef = Math.min(...starts);
    let endRef   = Math.max(...ends);

    if(endRef <= startRef) endRef += 1440;

    let min = startRef - 5;
    let max = endRef + 5;

    if(max - min < 30){ min -= 10; max += 10; }

    return { min, max };
  }

  if(allTimes && allTimes.length){
    let min = Math.min(...allTimes) - 10;
    let max = Math.max(...allTimes) + 10;
    if(max <= min) max += 1440;
    if(max - min < 30){ min -= 10; max += 10; }
    return {min, max};
  }

  return {min:0, max:60};
}

function getPairWindow(idA, idB){
  const elA = document.getElementById(idA);
  const elB = document.getElementById(idB);
  if(!elA || !elB) return null;
  const a = parseHHMM(elA.value || '');
  const b = parseHHMM(elB.value || '');
  if(a==null || b==null) return null;
  // Minuit : b n'est le lendemain que si l'écart dépasse 12 h.
  // v2.73 : une fin saisie juste avant le début (11:04 → 11:02) n'est plus lue comme 24 h
  if(b < a && a - b > 720) return [a, b + 1440];
  return [Math.min(a, b), Math.max(a, b)];
}

function collectTimelineData(){
  const fixedPoints = [];
  const addPoint = (label, t, cls='tl--std')=>{
    if(t==null) return;
    fixedPoints.push({label, t, cls});
  };

  const SIBT = parseHHMM(document.getElementById('SIBT')?.value || '');
  const AIBT = parseHHMM(document.getElementById('AIBT')?.value || '');
  const SOBT = parseHHMM(document.getElementById('SOBT')?.value || '');
  const AOBT = parseHHMM(document.getElementById('AOBT')?.value || '');

  // EOBT affichée = peut être ajustée CTOT (timer). On garde comme avant pour le point fixe.
  const EOBT = parseHHMM((document.getElementById('timer-eobt')?.textContent || '').replace('--:--',''));

  const CTOT = parseHHMM(document.getElementById('CTOT')?.value || '');
  const H15  = parseHHMM((document.getElementById('timer-h15')?.textContent || '').replace('--:--',''));
  const H40  = parseHHMM((document.getElementById('timer-h40')?.textContent || '').replace('--:--',''));

  addPoint('SIBT', SIBT, 'tl--std'); addPoint('AIBT', AIBT, 'tl--std');
  addPoint('SOBT', SOBT, 'tl--std'); addPoint('AOBT', AOBT, 'tl--std');
  addPoint('EOBT', EOBT, 'tl--eobt'); addPoint('CTOT', CTOT, 'tl--ctot');
  addPoint('HLE',  H40,  'tl--turn');
  addPoint('H-15', H15,  'tl--turn');

  const singles = [
    ['ArrPNT','Arrivée PNT'],
    ['ArrPNC','Arrivée PNC'],
    ['FermeturePorteAvion','Fermeture porte avion'],
    ['ReouverturePorteAvion','Réouverture porte'],
    ['MiseEnPlaceTapis','Tapis bagages'],
    ['FermetureSouteAV','Fermeture soute AV'],
    ['FermetureSouteAR','Fermeture soute AR'],
    ['RetraitEchelleAV','Retrait échelle AV'],
    ['RetraitEchelleAR','Retrait échelle AR'],
    ['ConnexionPush','Connexion push'],
    ['ChangementPush','Changement de push'],
  ];
  singles.forEach(([id,label])=>{
    const t = parseHHMM(document.getElementById(id)?.value || '');
    if(t!=null) fixedPoints.push({label, t, cls:'tl--std'});
  });
  // Autres heures d'événements (début seul compris) : elles élargissent la fenêtre
  ['ConnexionAgentCasque','AnnonceINAD','ArriveeINAD','AppelNayak','ArriveeNayak','DepartNayak','RechercheBagDebut','RechercheBagFin',
   'DebutDechargementBagages','DebutRepositionnement','DebutChargementBagages','DebutComptageBagages'].forEach(id=>{
    const t = parseHHMM(document.getElementById(id)?.value || '');
    if(t!=null) fixedPoints.push({label:id, t, cls:'tl--ev'});
  });

  // ===== Cabin release (Dernier débarqué -> Premier embarqué)
  // Affiché SAUF si (SOBT - SIBT) > 35 ou si Arr PNT/PNC rempli
  const hasArrCrew = !!(
    (document.getElementById('ArrPNC')?.value || '').trim() ||
    (document.getElementById('ArrPNT')?.value || '').trim()
  );

  let turnMin = null;
  if(SIBT != null && SOBT != null){
    turnMin = SOBT - SIBT;
    if(turnMin < 0) turnMin += 1440; // gère minuit
  }

  const cabinPair = getPairWindow('DernierDebarque','AvionPremierEmbarque');
  const fromTL    = (document.getElementById('From')?.value || '').toUpperCase().trim();
  const toTL      = (document.getElementById('To')?.value   || '').toUpperCase().trim();
  const bvaCase   = fromTL === 'BVA' || toTL === 'BVA';   // pas de Cabin tidy si BVA départ/arrivée
  // FR/RK : un changement d'equipage ne masque plus le Cabin tidy, il porte
  // seulement sa duree max de 3 a 10 min (voir cabinMaxMin dans renderTimeline).
  const cieTL    = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const isFRRKTL = (cieTL === 'FR' || cieTL === 'RK');
  // Cabin cleaning/tidy : toujours present des qu'il y a une escale hors BVA
  // (From/To != BVA), quelle que soit la compagnie et la duree d'escale.
  const showCabinRelease = !!cabinPair && !bvaCase;

  const rows = [
    {label:'Débarquement', pair:getPairWindow('PremierDebarque','DernierDebarque'), cls:'tl--turn', color:null},

    ...(showCabinRelease
      ? [{label:'Cabin release', pair:cabinPair, cls:'tl--std', color:null}]
      : []),

    {label:'Embarquement', pair:getPairWindow('AvionPremierEmbarque','AvionDernierEmbarque'), cls:'tl--ops',  color:null},
    {label:'Avitair',      pair:getPairWindow('ArriveeFuel','DepartFuel'), cls:'tl--std', color:'#f59e0b'},
    {label:'Lift (Arr)',   pair:getPairWindow('ArriveeLiftArr','DepartLiftArr'), cls:'tl--std', color:'#a855f7'},
    {label:'Lift (Dep)',   pair:getPairWindow('ArriveeLift','DepartLift'), cls:'tl--std', color:'#16a34a'},
    {label:'Déchargement', pair:getPairWindow('DebutDechargementBagages','FinDechargementBagages'), cls:'tl--std', color:'#15803d'},
    {label:'Repositionnement', pair:getPairWindow('DebutRepositionnement','FinRepositionnement'), cls:'tl--std', color:'#3273dc'},
    {label:'Chargement', pair:getPairWindow('DebutChargementBagages','FinChargementBagages'), cls:'tl--std', color:'#0f766e'},
    {label:'Comptage bagages', pair:getPairWindow('DebutComptageBagages','FinComptageBagages'), cls:'tl--std', color:'#0d9488'},
    {label:'Recherche bag', pair:getPairWindow('RechercheBagDebut','RechercheBagFin'), cls:'tl--std', color:'#ec4899'},
    {label:'Nayak', pair:getPairWindow('ArriveeNayak','DepartNayak'), cls:'tl--std', color:'#FFAD00'},
    {label:'Cleaning cabine', pair:getPairWindow('DebutCleaningCabine','FinCleaningCabine'), cls:'tl--std', color:'#0891b2'},
    {label:'Vidange toilettes', pair:getPairWindow('DebutVidangeToilettes','FinVidangeToilettes'), cls:'tl--std', color:'#78716c'},
    {label:'Eau potable', pair:getPairWindow('DebutEauPotable','FinEauPotable'), cls:'tl--std', color:'#2563eb'},
    {label:'Dégivrage', pair:getPairWindow('DebutDegivrage','FinDegivrage'), cls:'tl--std', color:'#0ea5e9'},
  ];

  const durations = rows
    .filter(r=>r.pair!=null)
    .map(r=>({label:r.label, a:r.pair[0], b:r.pair[1], cls:r.cls, color:r.color}));

  const allTimes = [ ...fixedPoints.map(p=>p.t), ...durations.flatMap(d=>[d.a,d.b]) ];
  const windowInfo = computeTimelineWindow(allTimes);

  return {fixedPoints, durations, windowInfo};
}
  
function renderTimeline(){
  const scroller  = document.getElementById('timelineScroll');
  const canvas    = document.getElementById('timelineCanvas');
  const labelCol  = document.getElementById('timelineLabelCol');
  if(!scroller || !canvas || !labelCol) return;

  canvas.innerHTML   = '';
  labelCol.innerHTML = '';

  const {fixedPoints, durations, windowInfo} = collectTimelineData();
  const {min, max} = windowInfo;
  if(min === undefined) return;

  window._timelineCurrentRange = {min, max};
  const total = Math.max(1, max - min);

  // ── Constantes layout ─────────────────────────────────────────
  const LABEL_W    = 104;
  const LEFT_PAD   = 10;
  const viewport   = scroller.clientWidth || 360;
  // v2.12 « Gantt épuré » : à 100 % toute l'escale tient dans la largeur, le zoom agrandit
  // v2.46 (Hugo) : le 100 % affiché correspond à l'ancien 200 % (50 % = toute l'escale dans la largeur)
  const TL_BASE    = 2;
  const trackW     = Math.max(120, Math.round((viewport - LEFT_PAD - 12) * timelineZoom * TL_BASE));
  canvas.style.width = (trackW + LEFT_PAD) + 'px';

  const PPM        = trackW / total;
  let   AXIS_H     = 40;
  const ROW_H      = 38;
  const BAR_H      = 12;
  const BAR_PAD    = (ROW_H - BAR_H) / 2;
  let   CONTENT_TOP = AXIS_H;

  const toPx = t => LEFT_PAD + ((toExtended(t, min, max) - min) / total) * trackW;

  // ── Tick adaptatif ────────────────────────────────────────────
  const tickStep = [5,10,15,20,30,60].find(s => s * PPM >= 46) || 60;

  // ── Couleurs ──────────────────────────────────────────────────
  const barColors = {
    'Débarquement': '#ef4444', 'Cabin release': '#64748b',
    'Avitair':      '#f59e0b', 'Lift (Arr)':    '#a855f7',
    'Embarquement': '#2563eb', 'Lift (Dep)':    '#16a34a',
  };
  const getColor = d => d.color || barColors[d.label] || '#64748b';

  // ── Config cibles turnaround par compagnie (minutes après AIBT) ──
  const cie        = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const isFRRK     = cie === 'FR' || cie === 'RK';
  const isW4W6     = cie === 'W4' || cie === 'W6';
  const isV7       = cie === 'V7';
  // Cibles affichées dès que EOBT+AIBT sont renseignés, pour toutes les compagnies
  const hasTargets = true;

  const from        = (document.getElementById('From')?.value || '').toUpperCase().trim();
  const fromBVA     = from === 'BVA';
  const toDest      = (document.getElementById('To')?.value || '').toUpperCase().trim();
  const toBVA       = toDest === 'BVA';
  // Pas de Cabin tidy quand BVA est au départ (From) OU à l'arrivée (To)
  const hideCabinTidy = fromBVA || toBVA;

  const crewChange = !!( (document.getElementById('ArrPNT')?.value||'').trim() ||
                         (document.getElementById('ArrPNC')?.value||'').trim() );
  // Cabin tidy FR/RK : 3 min max entre dernier debarque et premier embarque,
  // porte a 10 min quand il y a un changement d'equipage (Arr PNT / Arr PNC).
  const cabinMaxMin = (isFRRK && crewChange) ? 10 : 3;

  // Remise LID (FR/RK) : depend du toggle eLID / Paper LID du LOAD FINAL
  //   eLID      -> EOBT - 5, libelle "Remise eLID"
  //   Paper LID -> EOBT - 8, libelle "Remise LID"
  const elidMode  = isFRRK && (typeof isELID === 'function') && isELID();
  const lidOffset = elidMode ? -5 : -8;
  const lidLabel  = elidMode ? 'Envoi eLID' : 'Remise LID';

  const TARGETS_FRRK_BASE = {
    'Débarquement':        { ref:'EOBT', fromRef:'AIBT', from:  2, to:-13, fromField:null,              toOffset:null, label:null              },
    'Cabin release':       { ref:'EOBT', from:-13, to:-10, fromField:'DernierDebarque', toOffset:cabinMaxMin, label:'Cabin tidy'      },
    'Embarquement':        { ref:'EOBT', from:-13, to: -5, fromField:null,              toOffset:null, label:null              },
    'Avitair':             { ref:'EOBT', from:-25, to: -5, fromField:null,              toOffset:null, label:null              },
    'Lift (Dep)':          { ref:'EOBT', from:-25, to: -5, fromField:null,              toOffset:null, label:null              },
    'RemiseLID':           { ref:'EOBT', from: lidOffset, to: lidOffset, fromField:null,              toOffset:null, label: lidLabel },
    'FermeturePorteAvion': { ref:'EOBT', from: -5, to: -5, fromField:null,              toOffset:null, label:'Fermeture porte' },
    'ArrPNT':              { ref:'EOBT', from:-45, to:-45, fromField:null,              toOffset:null, label:'Arrivée PNT'     },
    'ArrPNC':              { ref:'EOBT', from:-45, to:-45, fromField:null,              toOffset:null, label:'Arrivée PNC'     },
  };

  const TARGETS_FRRK = fromBVA ? {
    ...TARGETS_FRRK_BASE,
    'Embarquement': { ref:'EOBT', from:-35, to:-5, fromField:null, toOffset:null, label:null },
    'RemiseLID':    { ref:'EOBT', from: lidOffset, to: lidOffset, fromField:null, toOffset:null, label: lidLabel },
  } : TARGETS_FRRK_BASE;

  // Label par défaut pour toutes les autres compagnies
  const DEFAULT_LABELS = {
    'Lift (Dep)':          'Lift (Dep)',
    'RemiseLID':           isFRRK ? lidLabel : 'Remise LDS/LDF',
    'FermeturePorteAvion': 'Fermeture porte',
    'ConnexionCasque':     'Connexion casque',
    'ArriveeINAD':         'Arrivée INAD',
    'ArriveeNayak':        'Arrivée Nayak',
    'Cabin release':       isFRRK ? 'Cabin tidy' : 'Cabin cleaning',
    'ArrPNT':              'Arrivée PNT',
    'ArrPNC':              'Arrivée PNC',
  };

  // W4/W6 — TAT selon type avion (relatif à AIBT)
  const typeAvion  = (document.getElementById('TypeAvion')?.value || '').toUpperCase();
  const isA321fam  = typeAvion.includes('321') || typeAvion.includes('21N');

  // W4/W6 — A320/A20N (EOBT-relatif)
  const TARGETS_W4W6_A320 = {
    'Débarquement':       { ref:'EOBT', from:-27, to:-20, fromField:null,              toOffset:null, label:null              },
    'Cabin release':      { ref:'EOBT', from:-19, to:-15, fromField:'DernierDebarque', toOffset:null, label:'Cabin cleaning'  },
    'Embarquement':       { ref:'EOBT', from:-14, to: -3, fromField:null,              toOffset:null, label:null              },
    'Avitair':            { ref:'EOBT', from:-27, to: -5, fromField:null,              toOffset:null, label:null              },
    'RemiseLID':          { ref:'EOBT', from: -7, to: -7, fromField:null,              toOffset:null, label:'Remise LDS/LDF'  },
    'FermeturePorteAvion':{ ref:'EOBT', from: -2, to: -2, fromField:null,              toOffset:null, label:'Fermeture porte' },
  };

  // W4/W6 — A321/A21N (EOBT-relatif)
  const TARGETS_W4W6_A321 = {
    'Débarquement':       { ref:'EOBT', from:-32, to:-24, fromField:null,              toOffset:null, label:null              },
    'Cabin release':      { ref:'EOBT', from:-23, to:-18, fromField:'DernierDebarque', toOffset:null, label:'Cabin cleaning'  },
    'Embarquement':       { ref:'EOBT', from:-17, to: -3, fromField:null,              toOffset:null, label:null              },
    'Avitair':            { ref:'EOBT', from:-32, to: -5, fromField:null,              toOffset:null, label:null              },
    'RemiseLID':          { ref:'EOBT', from: -9, to: -9, fromField:null,              toOffset:null, label:'Remise LDS/LDF'  },
    'FermeturePorteAvion':{ ref:'EOBT', from: -2, to: -2, fromField:null,              toOffset:null, label:'Fermeture porte' },
  };

  const TARGETS_W4W6 = isA321fam ? TARGETS_W4W6_A321 : TARGETS_W4W6_A320;

  // V7 (Volotea) — MTT 30 min, cibles EOBT-relatif
  const TARGETS_V7 = {
    'Débarquement':        { ref:'EOBT', from:-28, to:-23, fromField:null,              toOffset:null, label:null              },
    'Cabin release':       { ref:'EOBT', from:-23, to:-21, fromField:'DernierDebarque', toOffset:null, label:'Cabin cleaning'  },
    'Embarquement':        { ref:'EOBT', from:-20, to: -7, fromField:null,              toOffset:null, label:null              },
    'FermeturePorteAvion': { ref:'EOBT', from: -5, to: -5, fromField:null,              toOffset:null, label:'Fermeture porte' },
  };
  const FRRK_TARGETS = isFRRK ? TARGETS_FRRK : isW4W6 ? TARGETS_W4W6 : isV7 ? TARGETS_V7 : {};
  const aibt = parseHHMM((document.getElementById('AIBT')?.value || '').trim());

  // Mapping champs DOM pour chaque action
  const ACTION_FIELDS = {
    'Débarquement':        { start:'PremierDebarque',     end:'DernierDebarque'      },
    'Cabin release':       { start:'DernierDebarque',      end:'AvionPremierEmbarque' },
    'Embarquement':        { start:'AvionPremierEmbarque', end:'AvionDernierEmbarque' },
    'Avitair':             { start:'ArriveeFuel',          end:'DepartFuel'           },
    'Lift (Dep)':          { start:'ArriveeLift',          end:'DepartLift'           },
    'RemiseLID':           { start:'RemiseLID',             end:'RemiseLID'            },
    'FermeturePorteAvion': { start:'FermeturePorteAvion',  end:'FermeturePorteAvion'  },
    'ConnexionCasque':     { start:'ConnexionAgentCasque', end:'ConnexionAgentCasque' },
    'ArriveeINAD':         { start:'ArriveeINAD',           end:'ArriveeINAD'          },
    'ArriveeNayak':        { start:'ArriveeNayak',          end:'ArriveeNayak'         },
    'ArrPNT':              { start:'ArrPNT',                end:'ArrPNT'               },
    'ArrPNC':              { start:'ArrPNC',                end:'ArrPNC'               },
  };

  const POINT_EVENTS = new Set(['FermeturePorteAvion','RemiseLID','ConnexionCasque','ArriveeINAD','ArriveeNayak','ArrPNT','ArrPNC']);

  // v2.22 : événements ajoutés → une ligne dès qu'une heure est saisie (début seul = barre en cours)
  const EV_SPANS = [
    ['Déchargement',     'DebutDechargementBagages', 'FinDechargementBagages'],
    ['Repositionnement', 'DebutRepositionnement',    'FinRepositionnement'],
    ['Chargement',       'DebutChargementBagages',   'FinChargementBagages'],
    ['Comptage bagages', 'DebutComptageBagages',     'FinComptageBagages'],
    ['Recherche bag',    'RechercheBagDebut',        'RechercheBagFin'],
    ['Nayak',            'ArriveeNayak',             'DepartNayak'],
    ['Cleaning cabine',  'DebutCleaningCabine',      'FinCleaningCabine'],
    ['Vidange toilettes','DebutVidangeToilettes',    'FinVidangeToilettes'],
    ['Eau potable',      'DebutEauPotable',          'FinEauPotable'],
    ['Dégivrage',        'DebutDegivrage',           'FinDegivrage'],
  ];
  const EV_POINTS = [
    ['MiseEnPlaceTapis','Tapis bagages'], ['ReouverturePorteAvion','Réouverture porte'],
    ['FermetureSouteAV','Soute AV fermée'], ['FermetureSouteAR','Soute AR fermée'],
    ['RetraitEchelleAV','Retrait échelle AV'], ['RetraitEchelleAR','Retrait échelle AR'],
    ['ConnexionPush','Connexion push'], ['ChangementPush','Changement push'],
    ['AnnonceINAD','Annonce INAD'], ['AppelNayak','Appel Nayak'],
  ];
  EV_POINTS.forEach(([id]) => POINT_EVENTS.add(id));
  function eventRows(){
    const out = [];
    EV_SPANS.forEach(([label, s, e]) => {
      const done = durations.find(d => d.label === label);
      if(done){ out.push({ ...done, status:'complete', displayLabel: label }); return; }
      const a = parseHHMM(document.getElementById(s)?.value || '');
      if(a !== null) out.push({ label, a, b:null, cls:'tl--std', color:null, status:'in-progress', displayLabel: label });
    });
    EV_POINTS.forEach(([id, label]) => {
      const a = parseHHMM(document.getElementById(id)?.value || '');
      if(a !== null) out.push({ label:id, a, b:a, cls:'tl--std', color:null, status:'complete', displayLabel: label });
    });
    return out.sort((x, y) => toExtended(x.a, min, max) - toExtended(y.a, min, max));
  }

  const ORDER = ['Débarquement','Cabin release','Avitair','Lift (Arr)','Embarquement','Lift (Dep)',
                 'ArrPNT','ArrPNC','RemiseLID','FermeturePorteAvion','ConnexionCasque','ArriveeINAD']
                 .filter(l => !(hideCabinTidy && l === 'Cabin release'));

  // Ces 5 lignes s'affichent toujours avec leurs cibles, même sans données saisies
  const ALWAYS_SHOW = new Set(
    ['Débarquement','Cabin release','Embarquement','RemiseLID','FermeturePorteAvion']
      .filter(l => !(hideCabinTidy && l === 'Cabin release'))
  );

  let rows;
  if(hasTargets && aibt !== null){
    // FR/RK / W4/W6 : inclure actions en cours et non démarrées
    rows = ORDER.map(label => {
      // Action complète déjà dans durations ?
      const complete = durations.find(d => d.label === label);
      const tDef = FRRK_TARGETS[label];
      const dLabel = tDef?.label || DEFAULT_LABELS[label] || label;
      if(complete) return { ...complete, status:'complete', displayLabel: dLabel };

      // Point events : start === end → toujours 'complete' quand rempli
      const fields = ACTION_FIELDS[label];
      if(POINT_EVENTS.has(label) && fields){
        const startV = parseHHMM(document.getElementById(fields.start)?.value || '');
        if(startV !== null)
          return { label, a:startV, b:startV, cls:'tl--std', color:barColors[label]||null, status:'complete', displayLabel: dLabel };
      }

      // Action commencée (start seulement) ?
      if(fields){
        const startV = parseHHMM(document.getElementById(fields.start)?.value || '');
        // Cabin release W4/W6 : ne pas afficher en in-progress (trop ambigu)
        if(startV !== null && !(isW4W6 && label === 'Cabin release')){
          return { label, a:startV, b:null, cls:'tl--std', color:barColors[label]||null, status:'in-progress', displayLabel: dLabel };
        }
      }

      // Pas de données → montrer la cible vide (toujours pour les 5 lignes clés)
      if(FRRK_TARGETS[label] !== undefined || ALWAYS_SHOW.has(label))
        return { label, a:null, b:null, cls:'tl--std', color:barColors[label]||null, status:'not-started', displayLabel: dLabel };

      return null;
    // Toujours garder les 5 lignes clés même sans données
    }).filter(r => r !== null && (r.status !== 'not-started' || ALWAYS_SHOW.has(r.label)));
  } else {
    // Compagnies sans targets : 5 lignes clés toujours présentes + point events si remplis
    rows = ORDER.map(label => {
      const dLabel = DEFAULT_LABELS[label] || label;
      const complete = durations.find(d => d.label === label);
      if(complete) return { ...complete, status:'complete', displayLabel: dLabel };
      if(POINT_EVENTS.has(label)){
        const fields = ACTION_FIELDS[label];
        if(fields){
          const startV = parseHHMM(document.getElementById(fields.start)?.value || '');
          if(startV !== null)
            return { label, a:startV, b:startV, cls:'tl--std', color:null, status:'complete', displayLabel: dLabel };
        }
      }
      // Toujours afficher les 5 lignes clés même sans données ni cibles
      if(ALWAYS_SHOW.has(label))
        return { label, a:null, b:null, cls:'tl--std', color:barColors[label]||null, status:'not-started', displayLabel: dLabel };
      return null;
    }).filter(r => r !== null);
  }

  rows = rows.concat(eventRows());

  // v2.44 : repères verticaux (SIBT, AIBT, SOBT, AOBT, EOBT, CTOT, TOBT, NOW) calculés avant le dessin,
  // pour réserver autant de rangées de puces que nécessaire au-dessus de l'axe
  const _nowD   = new Date();
  const _nowExt = toExtended(isUTC ? _nowD.getUTCHours()*60 + _nowD.getUTCMinutes() : _nowD.getHours()*60 + _nowD.getMinutes(), min, max);
  const rawMarkers = [];
  const ptOf = l => fixedPoints.find(p => p.label === l);
  const MK = {
    SIBT:{ bg:'var(--surface-2)', color:'var(--muted)', lineClass:'tl-sched-line', pr:1 },
    SOBT:{ bg:'var(--surface-2)', color:'var(--muted)', lineClass:'tl-sched-line', pr:1 },
    AIBT:{ bg:'var(--ok)',        color:'#fff',         lineClass:'tl-act-line',   pr:2 },
    AOBT:{ bg:'var(--ok)',        color:'#fff',         lineClass:'tl-act-line',   pr:2 },
    EOBT:{ bg:'var(--tl-eobt)',   color:'var(--surface)', lineClass:'tl-eobt-line', pr:3 },
    CTOT:{ bg:'#f59e0b',          color:'#000',         lineClass:'tl-ctot-line',  pr:4 },
  };
  ['SIBT','AIBT','SOBT','AOBT','EOBT','CTOT'].forEach(l => {
    const pt = ptOf(l); if(!pt) return;
    const e = toExtended(pt.t, min, max);
    if(e < min || e > max) return;
    rawMarkers.push({ x: toPx(pt.t), label: l, ...MK[l] });
  });
  const ctotP = ptOf('CTOT');
  if(ctotP){
    const tobtT = toExtended(ctotP.t - 15, min, max);
    if(tobtT >= min && tobtT <= max) rawMarkers.push({ x: toPx(tobtT), label:'TOBT', bg:'#fb923c', color:'#fff', lineClass:'tl-tobt-line', pr:3 });
  }
  if(_nowExt >= min && _nowExt <= max)
    rawMarkers.push({ x: LEFT_PAD + ((_nowExt - min)/total)*trackW, label:'NOW', bg:'var(--yellow)', color:'#1b1b1b', lineClass:'tl-now-line', pr:5 });
  // Repères à la même minute : une seule puce « SOBT · EOBT », la ligne la plus importante gagne
  const allMarkers = [];
  rawMarkers.sort((a, b) => a.x - b.x).forEach(m => {
    const same = allMarkers.find(o => Math.abs(o.x - m.x) < 1 && o.label !== 'NOW' && m.label !== 'NOW');
    if(!same){ allMarkers.push({ ...m, labels:[m.label] }); return; }
    same.labels.push(m.label);
    if(m.pr > same.pr){ Object.assign(same, { bg:m.bg, color:m.color, lineClass:m.lineClass, pr:m.pr }); }
  });
  const CHIP_H = 20, CHIP_GAP = 3;
  const chipRows = [];
  allMarkers.forEach(m => {
    m.text = m.labels.join(' · ');
    const w = m.text.length * 6.2 + 12;
    // Puce gardée dans le cadre aux deux bords
    const cx = Math.min(Math.max(m.x, w/2 + 2), trackW + LEFT_PAD - w/2 - 2);
    if(cx !== m.x) m.cx = cx;
    m.xStart = cx - w/2; m.xEnd = cx + w/2;
    // 2 rangées au maximum : sinon la puce se décale à droite dans la rangée la moins chargée
    const MAX_ROWS = 2;
    const fits = r => !(chipRows[r] || []).some(o => m.xStart < o.xEnd + CHIP_GAP && m.xEnd + CHIP_GAP > o.xStart);
    let r = 0;
    while(r < MAX_ROWS && !fits(r)) r++;
    if(r === MAX_ROWS){
      const lastEnd = k => Math.max(...chipRows[k].map(o => o.xEnd));
      r = lastEnd(0) <= lastEnd(1) ? 0 : 1;
      const dx = lastEnd(r) + CHIP_GAP - m.xStart;
      m.xStart += dx; m.xEnd += dx; m.cx = (m.cx ?? m.x) + dx;
    }
    (chipRows[r] = chipRows[r] || []).push(m);
    m.row = r;
  });
  const nChipRows = Math.max(1, chipRows.length);
  AXIS_H = Math.max(40, 18 + nChipRows * (CHIP_H + CHIP_GAP));
  CONTENT_TOP = AXIS_H;

  // ── Hauteur totale (min 140px même sans actions) ──────────────
  const contentH = Math.max(140, CONTENT_TOP + Math.max(rows.length, 1) * ROW_H);
  canvas.style.height   = contentH + 'px';
  labelCol.style.width  = LABEL_W + 'px';
  labelCol.style.height = contentH + 'px';

  // ─────────────────────────────────────────────────────────────
  // COLONNE GAUCHE : axe spacer + labels
  // ─────────────────────────────────────────────────────────────
  // Spacer axe + chip strip
  const lcAxis = document.createElement('div');
  lcAxis.className = 'tl-lc-cell tl-lc-axis';
  lcAxis.style.height = AXIS_H + 'px';
  labelCol.appendChild(lcAxis);

  // Labels des actions
  rows.forEach((d, i) => {
    const cell = document.createElement('div');
    cell.className = 'tl-lc-cell';
    cell.style.height = ROW_H + 'px';

    const name = document.createElement('span');
    name.textContent = d.displayLabel || d.label;
    name.style.cssText = 'font-size:11.5px; font-weight:700; line-height:1.15; color:var(--fg); white-space:normal;';
    cell.appendChild(name);

    // Statut (uniquement si action complète et cible connue)
    if(d.status === 'complete' && hasTargets){
      const tDef = FRRK_TARGETS[d.label];
      if(tDef){
        const eobtRef = window._eobtRawMins ?? null;
        const ref     = (tDef.ref === 'EOBT') ? eobtRef : aibt;
        if(ref !== null){
          const fromFieldT2 = tDef.fromField
            ? parseHHMM(document.getElementById(tDef.fromField)?.value || '')
            : null;
          const deadline = tDef.toOffset !== null && fromFieldT2 !== null
            ? fromFieldT2 + tDef.toOffset
            : ref + tDef.to;
          const endT = Math.max(d.a, d.b);
          let endAdj = endT;
          while(endAdj - ref >  720) endAdj -= 1440;
          while(ref - endAdj >  720) endAdj += 1440;
          const onTime = endAdj <= deadline;
          const badge = document.createElement('span');
          badge.textContent = onTime ? 'À l\'heure' : 'Retard';
          badge.style.cssText = `font-size:10px;font-weight:700;color:${onTime ? 'var(--ok)' : 'var(--crit)'};`;
          cell.appendChild(badge);
        }
      }
    }

    labelCol.appendChild(cell);
  });

  if(!rows.length){
    const cell = document.createElement('div');
    cell.className = 'tl-lc-cell';
    cell.style.height = ROW_H + 'px';
    labelCol.appendChild(cell);
  }

  // ─────────────────────────────────────────────────────────────
  // CANVAS : grille + axe + barres
  // ─────────────────────────────────────────────────────────────

  // 1. Grille verticale — trait fin chaque minute, medium à 5min, major au tickStep
  for(let t = Math.ceil(min/tickStep)*tickStep; t <= max; t += tickStep){
    const x = toPx(t);
    const line = document.createElement('div');
    line.className = 'tl-vgrid';
    line.style.cssText = `left:${x}px; top:${CONTENT_TOP}px; height:${contentH - CONTENT_TOP}px;`;
    canvas.appendChild(line);
  }

  // 2. Axe temps
  const axisRow = document.createElement('div');
  axisRow.className = 'tl-axis-row';
  axisRow.style.height = AXIS_H + 'px';
  const axisTrack = document.createElement('div');
  axisTrack.className = 'tl-axis-track';
  axisTrack.style.height = '100%';
  for(let t = Math.ceil(min/tickStep)*tickStep; t <= Math.floor(max/tickStep)*tickStep; t += tickStep){
    const lbl = document.createElement('div');
    lbl.className = 'tl-axis-label';
    if(toPx(t) < 16) continue;   // libellé qui serait coupé par le bord gauche
    lbl.style.left = toPx(t) + 'px';
    lbl.textContent = fmtHHMM(t);
    axisTrack.appendChild(lbl);
  }
  axisRow.appendChild(axisTrack);
  canvas.appendChild(axisRow);

  // 3. Barres d'actions
  const nowD   = new Date();
  const nowM   = isUTC ? nowD.getUTCHours()*60 + nowD.getUTCMinutes()
                       : nowD.getHours()*60    + nowD.getMinutes();
  const nowExt = toExtended(nowM, min, max);

  rows.forEach((d, i) => {
    const color   = getColor(d);
    const tDefCheck   = FRRK_TARGETS[d.label];
    // Une action peut avoir une référence différente pour le début (fromRef) et la fin (toRef).
    // On exige que toutes les références réellement utilisées soient disponibles.
    const _refAvail   = (r)=> (r === 'AIBT') ? (aibt !== null) : (window._eobtRawMins != null);
    const refOk       = !!tDefCheck
                        && _refAvail(tDefCheck.fromRef || tDefCheck.ref)
                        && _refAvail(tDefCheck.toRef   || tDefCheck.ref);
    const hasTarget   = hasTargets && !!tDefCheck && refOk;
    const targetDef    = hasTarget ? FRRK_TARGETS[d.label] : null;
    const displayLabel = targetDef?.label || DEFAULT_LABELS[d.label] || d.label;

    // Référence temporelle : EOBT brut (sans CTOT) ou AIBT selon l'action.
    // Le début et la fin peuvent avoir une référence différente (fromRef / toRef).
    const eobt        = window._eobtRawMins ?? null;
    const _resolveRef = (r)=> (r === 'AIBT') ? aibt : eobt;
    const refFromTime = hasTarget ? _resolveRef(targetDef.fromRef || targetDef.ref) : null;
    const refToTime   = hasTarget ? _resolveRef(targetDef.toRef   || targetDef.ref) : null;

    const fromFieldT = hasTarget && targetDef.fromField
      ? parseHHMM(document.getElementById(targetDef.fromField)?.value || '')
      : null;
    const targetFrom = hasTarget && refFromTime !== null
      ? (fromFieldT !== null ? fromFieldT : refFromTime + targetDef.from)
      : null;
    const targetTo = hasTarget && refToTime !== null
      ? (targetDef.toOffset !== null && fromFieldT !== null
          ? fromFieldT + targetDef.toOffset
          : refToTime + targetDef.to)
      : null;

    const deadlineExt    = hasTarget ? toExtended(targetTo,   min, max) : null;
    const targetStartExt = hasTarget ? toExtended(targetFrom, min, max) : null;
    const deadlinePassed = hasTarget && nowExt > deadlineExt;

    const row = document.createElement('div');
    row.className = 'tl-gantt-row';
    row.style.height = ROW_H + 'px';

    const track = document.createElement('div');
    track.className = 'tl-row-track';

    // ── 1. Barre cible en pointillé (toujours si cible définie, même sans données) ─
    if(hasTarget && targetFrom !== null && !POINT_EVENTS.has(d.label)){
      // Début de la cible : targetFrom (AIBT+offset)
      const targetL = toPx(targetStartExt);
      const targetW = Math.max(4, toPx(deadlineExt) - targetL);
      const dashColor = '#94a3b8';

      const tBar = document.createElement('div');
      tBar.className = 'tl-target';
      tBar.style.cssText = [
        `left:${targetL}px`, `width:${targetW}px`,
        `height:${BAR_H}px`, `top:${BAR_PAD}px`,
      ].join(';');
      track.appendChild(tBar);
    }

    // ── 1b. Cercle cible gris pour events ponctuels sans données ─
    if(hasTarget && d.a === null && POINT_EVENTS.has(d.label) && targetTo !== null){
      const cx  = toPx(toExtended(targetTo, min, max));
      const cy  = ROW_H / 2;
      const R   = 6;
      const dot = document.createElement('div');
      dot.className = 'tl-pt';
      dot.style.cssText = `left:${cx - R}px; top:${cy - R}px;`;
      track.appendChild(dot);
    }

    // ── 2. Barre de progression / réelle (ou cercle pour event ponctuel) ─
    if(d.a !== null){
      const aExt = toExtended(d.a, min, max);
      const isPointEvent = POINT_EVENTS.has(d.label);

      if(isPointEvent){
        // Cercle vide centré sur l'heure
        const cx = toPx(aExt);
        const cy = ROW_H / 2;
        const R  = 6;
        const onTime = hasTarget ? (aExt <= deadlineExt) : true;
        const dot = document.createElement('div');
        dot.className = 'tl-pt done' + (onTime ? '' : ' late');
        dot.style.cssText = `left:${cx - R}px; top:${cy - R}px;`;
        track.appendChild(dot);
      } else {
        // Fin : d.b si complété, sinon NOW plafonné à deadline+15min
        let endExt;
        // Fin non saisie mais l'étape suivante a commencé (ou l'avion est parti) :
        // l'action est forcément finie, la barre s'arrête là (« ≤ N′ »)
        const NEXT_STEP = {
          'Débarquement':  ['AvionPremierEmbarque','AvionDernierEmbarque','FermeturePorteAvion'],
          'Cabin release': ['AvionDernierEmbarque','FermeturePorteAvion'],
          'Embarquement':  ['FermeturePorteAvion'],
        };
        let capExt = null;
        if(d.status === 'in-progress'){
          [...(NEXT_STEP[d.label] || []), 'AOBT'].forEach(id => {
            const t = parseHHMM(document.getElementById(id)?.value || '');
            if(t == null) return;
            const e = toExtended(t, min, max);
            if(e >= aExt && (capExt == null || e < capExt)) capExt = e;
          });
        }
        const open = capExt != null;
        if(d.status === 'complete'){
          endExt = toExtended(d.b, min, max);
        } else if(open){
          endExt = capExt;
        } else {
          // En cours : jusqu'à maintenant (la fenêtre inclut NOW), plafonné au bord
          endExt = Math.min(nowExt, max);
        }

        const barL = toPx(aExt);
        const barW = Math.max(4, toPx(Math.max(aExt, endExt)) - barL);

        // Bleu = réel, rouge = hors cible, rayé = en cours
        const isLate = hasTarget && endExt > deadlineExt;

        const durMin = d.status === 'complete'
          ? Math.round(Math.abs(d.b - d.a))
          : open ? Math.round(endExt - aExt)
          : Math.round(Math.abs(nowM - d.a) % 1440);
        const running = d.status === 'in-progress' && !open;

        const bar = document.createElement('div');
        bar.className = 'tl-actual' + (isLate ? ' late' : '') + (running ? ' run' : '') + (open ? ' open' : '');
        bar.style.cssText = `left:${barL}px; width:${barW}px; top:${BAR_PAD + 2}px; height:${BAR_H - 4}px;`;
        bar.title = (d.displayLabel || d.label) + ' · ' + (running ? `${durMin}′ en cours` : open ? `fin non saisie, ${durMin}′ au plus` : `${durMin}′`);

      if(showTimeLabels){
        const bl = document.createElement('span');
        bl.className = 'tl-dur' + (isLate ? ' late' : '');
        // Pas la place à droite (bord de la timeline) : la durée passe à gauche de la barre
        const lblX = (barL + barW + 40 > LEFT_PAD + trackW && barL > 40) ? barL - 36 : barL + barW + 4;
        bl.style.cssText = `left:${lblX}px; top:${BAR_PAD - 1}px;`;
        bl.textContent = running ? `${durMin}′…` : open ? `≤ ${durMin}′` : `${durMin}′`;
        track.appendChild(bl);
      }

      track.appendChild(bar);
      } // fin else (barre normale)
    }

    row.appendChild(track);
    canvas.appendChild(row);
  });

  if(!rows.length){
    const empty = document.createElement('div');
    empty.style.cssText = `
      position:absolute; inset:0;
      display:flex; align-items:center; justify-content:center;
      font-size:.85rem; color:var(--muted); font-style:italic; pointer-events:none;
    `;
    empty.textContent = 'Renseignez les timings pour voir le jalonage';
    canvas.appendChild(empty);
  }

  // 4. Lignes verticales + puces en haut (calculées plus haut, v2.44)
  const overlayTop = AXIS_H;
  const overlayH   = contentH - AXIS_H;
  allMarkers.forEach(m => {
    const line = document.createElement('div');
    line.className = m.lineClass;
    line.style.cssText = `left:${m.x}px; top:${overlayTop}px; height:${overlayH}px;`;
    canvas.appendChild(line);
  });
  allMarkers.forEach(m => {
    const el = document.createElement('div');
    el.className = 'tl-marker-chip';
    el.textContent = m.text;
    el.style.cssText = `left:${m.cx ?? m.x}px; top:${1 + m.row * (CHIP_H + CHIP_GAP)}px; background:${m.bg}; color:${m.color}; transform:translateX(-50%); z-index:20;`;
    canvas.appendChild(el);
  });

  // 5. Auto-scroll
  // Option « Suivre Now » : recentre sauf si l'utilisateur a touché la timeline il y a moins de 8 s
  const followNow = (()=>{ try{ return localStorage.getItem('tlFollowNow') !== '0'; }catch(e){ return true; } })();
  const userIdle  = (Date.now() - (window._tlLastTouch || 0)) > 8000;
  if(followNow ? userIdle : !timelineUserScrolled){
    const targetT = (nowExt >= min && nowExt <= max) ? nowExt : (min + max) / 2;
    const targetX = toPx(targetT);
    scroller.scrollLeft = Math.max(0, targetX - viewport / 2);
  }

  const zlbl = document.getElementById('timelineZoomLabel');
  if(zlbl) zlbl.textContent = `${Math.round(timelineZoom*100)}%`;
}





function escapeHtml(s){
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

function pickBestTimeForList(f, flow){
  const iso = (v)=> v ? new Date(v) : null;
  const toHHMM = (d)=>{
    if(!d || isNaN(d.getTime())) return '';
    const hh = String(isUTC ? d.getUTCHours() : d.getHours()).padStart(2,'0');
    const mm = String(isUTC ? d.getUTCMinutes() : d.getMinutes()).padStart(2,'0');
    return `${hh}:${mm}`;
  };
  // Retourne { time, suffix } selon la source
  if(flow === 'DEP'){
    if(f.aobt) return { time: toHHMM(iso(f.aobt)), suffix: 'A' };
    if(f.sobt) return { time: toHHMM(iso(f.sobt)), suffix: 'S' };
    if(f.eobt) return { time: toHHMM(iso(f.eobt)), suffix: 'E' };
    if(f.atot) return { time: toHHMM(iso(f.atot)), suffix: 'A' };
    if(f.etot) return { time: toHHMM(iso(f.etot)), suffix: 'E' };
    return { time: '', suffix: '' };
  }
  if(f.aibt) return { time: toHHMM(iso(f.aibt)), suffix: 'A' };
  if(f.sibt) return { time: toHHMM(iso(f.sibt)), suffix: 'S' };
  if(f.eibt) return { time: toHHMM(iso(f.eibt)), suffix: 'E' };
  if(f.aldt) return { time: toHHMM(iso(f.aldt)), suffix: 'A' };
  if(f.eldt) return { time: toHHMM(iso(f.eldt)), suffix: 'E' };
  return { time: '', suffix: '' };
}

  /* ===== SETTINGS MENU ===== */
function openSettingsMenu(){
  const b = document.getElementById('settingsBackdrop');
  const m = document.getElementById('settingsMenu');
  if(b) b.style.display = '';
  if(m) m.style.display = 'block';
}
function closeSettingsMenu(){
  const b = document.getElementById('settingsBackdrop');
  const m = document.getElementById('settingsMenu');
  if(m) m.style.display = 'none';
  if(b) b.style.display = 'none';
}
function toggleSettingsMenu(){
  const m = document.getElementById('settingsMenu');
  const isOpen = m && m.style.display !== 'none' && m.style.display !== '';
  if(isOpen) closeSettingsMenu();
  else openSettingsMenu();
}

// ESC ferme aussi le menu settings
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape') closeSettingsMenu();
});
