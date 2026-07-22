/* Collapse */
function toggleCardBody(headerEl){
  const card = headerEl.closest('.card');
  if(!card) return;
  const content = card.querySelector('.card-content');
  if(!content) return;
  const collapsed = content.classList.toggle('collapsed-body');
  const icon = headerEl.querySelector('.icon');
  if(icon) icon.textContent = collapsed ? '›' : '⌄';
}

let _scrollY = 0;

function lockScroll(){
  _scrollY = window.scrollY || document.documentElement.scrollTop || 0;

  document.documentElement.classList.add('modal-open');
  document.body.classList.add('modal-open');

  // iOS-proof
  document.body.style.position = 'fixed';
  document.body.style.top = `-${_scrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
}

function unlockScroll(){
  document.documentElement.classList.remove('modal-open');
  document.body.classList.remove('modal-open');

  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';

  window.scrollTo(0, _scrollY);
}

/* Header height */
function updateHeaderOffset(){
  const header = document.getElementById('fixedHeader');
  const footer = document.getElementById('fixedFooter');

  if(header){
    const h = Math.ceil(header.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--fixed-header-h', h + 'px');
  }

  if(footer){
    const fh = Math.ceil(footer.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--fixed-footer-h', fh + 'px');
  }
}

/* Vars */
let isUTC=false;

let manualSOBT=false;
let currentTabId=null;
let saveTimer=null;

let settingFromAK = false;

/* ===== AK managed fields helpers ===== */
function isEmptyVal(el){
  return !el || ((el.value || '').trim() === '');
}

function setValAK(id, v){
  const el = document.getElementById(id);
  if(!el) return;

  settingFromAK = true;
  el.value = (typeof v === 'string') ? (v ?? '').toUpperCase() : (v ?? '');
  el.dataset.ak = '1';
  el.dispatchEvent(new Event('input',  { bubbles:true }));
  el.dispatchEvent(new Event('change', { bubbles:true }));
  settingFromAK = false;

  // Sync affichage CTOT
  if(id === 'CTOT'){
    const d = document.getElementById('timer-ctot');
    if(d) d.textContent = el.value || '--:--';
  }
}

function setTimeFromISOAK(id, iso){
  if(!iso) return;
  const d = new Date(iso);
  if(isNaN(d.getTime())) return;

  const hh = String(isUTC ? d.getUTCHours() : d.getHours()).padStart(2,'0');
  const mm = String(isUTC ? d.getUTCMinutes() : d.getMinutes()).padStart(2,'0');

  setValAK(id, `${hh}:${mm}`);
}

function setTimeFromISOIfEmptyOrAK(id, iso){
  const el = document.getElementById(id);
  if(!el) return;
  if(isEmptyVal(el) || el.dataset.ak === '1'){
    setTimeFromISOAK(id, iso);
  }
}

function siLines(txt){
  return (txt || '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
}

function normLine(s){
  return (s || '').trim().toUpperCase();
}

// clé simple : avant 1er espace ou "+"
function siKey(line){
  const up = normLine(line);
  return up.split(/\s|\+/)[0] || up;
}

function getTabData(){
  if(!currentTabId) return {};
  try{ return JSON.parse(localStorage.getItem('tab-'+currentTabId) || '{}'); }
  catch(e){ return {}; }
}

function setTabData(data){
  if(!currentTabId) return;
  localStorage.setItem('tab-'+currentTabId, JSON.stringify(data));
}

/**
 * Merge SI depuis AK sans écraser les ajouts manuels.
 * Cas spécial: si tu as prolongé la ligne AK ("1R/19C + 1234"),
 * et que AK devient "1R/19C + 1TEST/85C", alors on veut:
 * "1R/19C + 1TEST/85C + 1234" (une seule ligne)
 */
function mergeSIFromAK(fieldId, newAkText){
  const el = document.getElementById(fieldId);
  if(!el) return;

  const data = getTabData();
  data.akSI = data.akSI || {};

  const oldAkText = data.akSI[fieldId] || '';
  const existing  = el.value || '';

  const newAkLines = siLines(newAkText);
  const oldAkLines = siLines(oldAkText);
  const existLines = siLines(existing);

  const oldNormSet = new Set(oldAkLines.map(normLine));
  const newNormSet = new Set(newAkLines.map(normLine));

  // map old base par key
  const oldByKey = new Map();
  oldAkLines.forEach(l => oldByKey.set(siKey(l), l));

  // index des lignes AK nouvelles par key (pour pouvoir remplacer)
  const newIndexByKey = new Map();
  newAkLines.forEach((l, idx) => {
    const k = siKey(l);
    if(!newIndexByKey.has(k)) newIndexByKey.set(k, idx);
  });

  // résultat = copie des lignes AK
  const finalLines = [...newAkLines];

  // lignes manuelles séparées (qui ne sont pas du prolongement)
  const manualOut = [];

  for(const line of existLines){
    const n = normLine(line);

    // ancienne ligne AK pure -> on la drop (remplacée par newAk)
    if(oldNormSet.has(n)) continue;

    // tentative de "prolongement" d'une ancienne ligne AK
    const k = siKey(line);
    const oldBase = oldByKey.get(k);

    if(oldBase && newIndexByKey.has(k)){
      const oldBaseNorm = normLine(oldBase);
      const lineNorm = normLine(line);

      if(lineNorm.startsWith(oldBaseNorm)){
        const idx = newIndexByKey.get(k);
        const newBase = finalLines[idx];

        const suffix = line.slice(oldBase.length).trim(); // ce que tu as ajouté
        const mergedLine = suffix ? `${newBase} ${suffix}` : `${newBase}`;

        // remplace la ligne AK par la version enrichie
        finalLines[idx] = mergedLine;

        // met à jour le set de doublons (au cas où)
        newNormSet.add(normLine(mergedLine));

        continue; // IMPORTANT: on n'ajoute pas en manuelOut
      }
    }

    // vraie ligne manuelle séparée -> on garde si pas doublon avec AK
    if(!newNormSet.has(n)) manualOut.push(line);
  }

  const merged = [...finalLines, ...manualOut].join('\n').trim();

  settingFromAK = true;
  el.value = merged;
  el.dispatchEvent(new Event('input',  { bubbles:true }));
  el.dispatchEvent(new Event('change', { bubbles:true }));
  settingFromAK = false;

  // mémorise la dernière version AK pour le prochain refresh
  data.akSI[fieldId] = (newAkText || '').trim();
  setTabData(data);
}

function setIfEmptyOrAK(id, v){
  const el = document.getElementById(id);
  if(!el) return;

  // si champ vide OU déjà piloté AK -> on écrase
  if(isEmptyVal(el) || el.dataset.ak === '1'){
    setValAK(id, (v ?? ''));
  }
}

/* Si l'utilisateur modifie un champ manuellement -> il n'est plus piloté AK */
document.addEventListener('input', (e)=>{
  const t = e.target;
  if(!t || !t.dataset) return;
  if(settingFromAK) return;
  if(t.dataset.ak === '1') delete t.dataset.ak;
}, true);

// Auto-ouverture du panneau Crew (FR/RK + BVA au départ ou turnaround ≥ 35 min).
// Écouteur délégué car AOBT/AIBT sont injectés dynamiquement.
['input','change'].forEach(ev=>{
  document.addEventListener(ev, (e)=>{
    const id = e.target?.id;
    if(id === 'Cie' || id === 'From' || id === 'AIBT' || id === 'AOBT'){
      autoOpenCrewIfNeeded();
    }
  }, true);
});

/* Timeline */
let timelineZoom = 1;
const TL_ZOOM_MIN = 0.5;
const TL_ZOOM_MAX = 8;
const TL_ZOOM_STEP = 0.25;
window._timelineCurrentRange = null;

/* EOBT brut + EOBT affiché */
window._eobtRawMins = null;
window._eobtAdjMins = null;

/* DL */
let lastDLChanged = 1;

/* digits only */
function digitsOnly(el){ el.value = (el.value || '').replace(/[^0-9]/g,''); }

/* ===== H1–H4 vs BAGS (ARR / EXP / FINAL) ===== */
function updateFinalTHOB(){
  const tobEl  = document.getElementById('FinalTOB');
  const crew   = (document.getElementById('FinalCREW')?.value || '').trim();
  const thobEl = document.getElementById('FinalTHOB');
  if(!thobEl) return;

  if(!tobEl?.value || !crew){
    thobEl.value = '';
    return;
  }

  // TOB format: "152 + 2" (adults + infant)
  const tobParts = tobEl.value.split('+').map(s => parseInt(s.trim(), 10));
  const tobTotal = tobParts.reduce((s, v) => s + (isNaN(v) ? 0 : v), 0);

  // Crew format: "2/4" → pnc=2, pnt=4
  const crewParts = crew.split('/').map(s => parseInt(s.trim(), 10));
  const crewTotal = crewParts.reduce((s, v) => s + (isNaN(v) ? 0 : v), 0);

  thobEl.value = tobTotal + crewTotal;
  thobEl.dispatchEvent(new Event('change', {bubbles:true}));
}

function updateHWeights(){
  const cie  = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const to   = (document.getElementById('To')?.value  || '').toUpperCase().trim();
  const show = (cie === 'FR' || cie === 'RK');
  const mult = (to === 'AMM') ? 15 : 13;

  ['FinalH1','FinalH2','FinalH3','FinalH4'].forEach(id => {
    const inp = document.getElementById(id);
    const lbl = document.getElementById(id + 'w');
    if(!inp) return;
    if(lbl){
      lbl.style.display = show ? '' : 'none';
      if(show){
        const bags = parseInt(inp.value, 10);
        lbl.textContent = isNaN(bags) || bags === 0 ? '' : `${bags * mult} kg`;
      }
    }
  });
}

function updateCrewThobVisibility(){
  const cie  = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const show = (cie === 'FR' || cie === 'RK');
  const crew = document.getElementById('crewField');
  const thob = document.getElementById('thobField');
  if(crew) crew.style.display = show ? '' : 'none';
  if(thob) thob.style.display = show ? '' : 'none';
}

function updateHBagsValidity(mode){
  if(mode !== 'final') return;

  const bagsEl = document.getElementById('FinalBAGS');
  if(!bagsEl) return;

  const bags = parseInt(bagsEl.value || '0', 10);
  const ids = ['FinalH1','FinalH2','FinalH3','FinalH4'];

  let sum = 0;
  ids.forEach(id=>{
    const el = document.getElementById(id);
    if(el) sum += parseInt(el.value || '0', 10);
  });

  bagsEl.classList.toggle('is-invalid', bags > 0 && sum !== bags);
}

function syncAdultGenderLocks(){
  const elM = document.getElementById('FinalMALE');
  const elF = document.getElementById('FinalFEMALE');
  const elA = document.getElementById('FinalADULT');
  if(!elM || !elF || !elA) return;

  const m = (elM.value || '').trim();
  const f = (elF.value || '').trim();
  const a = (elA.value || '').trim();

  const hasGender = (m !== '' || f !== '');
  const hasAdult  = (a !== '');

  // Règle 1 : si MALE ou FEMALE rempli -> ADULT verrouillé
  if(hasGender){
    elA.value = '';                 // optionnel : vide ADULT pour éviter incohérence
    elA.readOnly = true;
    elA.classList.add('is-static'); // look "bloqué" (Bulma)
  }else{
    elA.readOnly = false;
    elA.classList.remove('is-static');
  }

  // Règle 2 : si ADULT rempli (et genders vides) -> MALE/FEMALE verrouillés
  if(!hasGender && hasAdult){
    elM.readOnly = true; elF.readOnly = true;
    elM.classList.add('is-static'); elF.classList.add('is-static');
  }else{
    elM.readOnly = false; elF.readOnly = false;
    elM.classList.remove('is-static'); elF.classList.remove('is-static');
  }
}


/* ===== POIDS : FR/RK = BAGS*13 auto (sans GB), autres = libre ===== */
function updateFinalWeightIfNeeded(){

  const cie = (document.getElementById('Cie').value || '').toUpperCase();
  const poidsField = document.getElementById('FinalPOIDS');

  // ✈️ CAS FR / RK → POIDS = BAGS * 13 seulement (GB n'entre pas dans POIDS)
  if(cie === 'FR' || cie === 'RK'){
    const bags = parseInt(document.getElementById('FinalBAGS').value) || 0;
    poidsField.readOnly = true;
    poidsField.value = bags * 13;
    updatePoidsCorrige();
    return;
  }

  // ✈️ TOUS LES AUTRES → POIDS libre, pas de calcul GB dedans
  poidsField.readOnly = false;
  updatePoidsCorrige();
}

/* ===== POIDS CORRIGÉ = POIDS + GB*13 (si GB > 0, sinon = POIDS) ===== */
function updatePoidsCorrige(){
  const poids = parseInt(document.getElementById('FinalPOIDS')?.value) || 0;
  const gb    = parseInt(document.getElementById('FinalGB')?.value)    || 0;
  const el    = document.getElementById('FinalPoidsCorrige');
  if(!el) return;
  el.value = gb > 0 ? poids + (gb * 13) : (poids || '');
}

/* ===== POIDS auto FR / RK : ARR + EXP ===== */
function updateArrExpWeightIfNeeded(){
  const cie = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  if(cie !== 'FR' && cie !== 'RK') return;

  // EXP uniquement (ARR désactivé)
  const bagsExp = asInt('ExpBAGS');
  const poidsExpEl = document.getElementById('ExpPOIDS');
  if(bagsExp != null && poidsExpEl && (poidsExpEl.value || '').trim() === ''){
    poidsExpEl.value = String(bagsExp * 13);
  }
}

/* ===== Validation rouge persistante — max plateau ===== */
const _dangerSet = new Set(); // IDs des champs en dépassement

function _applyDanger(id){
  const el = document.getElementById(id);
  if(el) el.classList.add('is-danger');
}
function _clearDanger(id){
  _dangerSet.delete(id);
  const el = document.getElementById(id);
  if(el) el.classList.remove('is-danger');
}
function revalidateDangerFields(){
  // Réapplique is-danger sur tous les champs mémorisés comme en dépassement
  _dangerSet.forEach(id => _applyDanger(id));
}
function checkDangerField(id){
  const el = document.getElementById(id);
  if(!el) return;
  const phMatch = (el.placeholder || '').match(/^(\d+)/);
  if(!phMatch){ _dangerSet.delete(id); return; }
  const max = parseInt(phMatch[1], 10);
  const val = parseInt(el.value, 10);
  if(!isNaN(val) && val > max){ _dangerSet.add(id); el.classList.add('is-danger'); }
  else { _dangerSet.delete(id); el.classList.remove('is-danger'); }
}



// ===== FLEET DATABASE : immat → config avion =====
const FLEET_DB = (function(){
  const WZZ_186Y_ZONES = { OA:'60 (1-10)', OB:'66 (11-21)', OC:'60 (22-31)' };
  const WZZ_HOLDS      = { H1:'3402 kg', H2:'', H3:'2426 kg', H4:'2110 kg' };

  // Wizz subtype WV008 — MTOM 73.5 t
  const WV008 = {
    airline:'W6', acType:'A320', config:'A320-186Y WV008 (73.5t)',
    zones: WZZ_186Y_ZONES, holds: WZZ_HOLDS,
    mtom: 73500, mzfm: 61000, mldm: 64500
  };
  // Wizz subtype WV013 — MTOM 71.5 t
  const WV013 = {
    airline:'W4', acType:'A320', config:'A320-186Y WV013 (71.5t)',
    zones: WZZ_186Y_ZONES, holds: WZZ_HOLDS,
    mtom: 71500, mzfm: 61000, mldm: 64500
  };

  // ─── Volotea ───────────────────────────────────────────────────
  // Chargement standard A319 : H4 d'abord (85 pcs), H5→H2 (max 30), H1 (reste+spécial+COMAT)
  // Zones OA/OB/OC : à définir (document en attente)
  const VOE_A319_HOLDS = { H1:'Reste + Spécial + COMAT', H2:'Max 30 pcs (H5)', H3:'', H4:'85 pcs en 1er' };
  // Chargement standard A320 : H1 (95), H3 (55), H4 (reste+spécial / COMAT), H5=NIL
  const VOE_A320_HOLDS = { H1:'95 pcs en 1er', H2:'', H3:'55 pcs suivants', H4:'Reste + Spécial / COMAT' };
  const VOE_ZONES_TBD  = { OA:'', OB:'', OC:'' }; // zones à définir

  const VOE_A319_138 = {
    airline:'V7', acType:'A319', config:'A319 Y138',
    zones: VOE_ZONES_TBD, holds: VOE_A319_HOLDS,
    mtom: 68000, mzfm: 57000, mldm: 61000
  };
  const VOE_A319_150 = {
    airline:'V7', acType:'A319', config:'A319 Y150',
    zones: VOE_ZONES_TBD, holds: VOE_A319_HOLDS,
    mtom: 68000, mzfm: 57000, mldm: 61000
  };
  const VOE_A319_156 = {
    airline:'V7', acType:'A319', config:'A319 Y156',
    zones: VOE_ZONES_TBD, holds: VOE_A319_HOLDS,
    mtom: 68000, mzfm: 57000, mldm: 61000
  };
  const VOE_A320_180 = {
    airline:'V7', acType:'A320', config:'A320 Y180',
    zones: VOE_ZONES_TBD, holds: VOE_A320_HOLDS,
    mtom: 73500, mzfm: 61000, mldm: 64500
  };

  const DB = {};

  // WV008
  ['9H-WZQ'].forEach(r => DB[r.replace('-','')] = WV008);

  // WV013
  ['9H-WAU','9H-WAV','9H-WBO','9H-WBP','9H-WBQ','9H-WDA','9H-WZR','9H-WZW'].forEach(r => DB[r.replace('-','')] = WV013);

  // Volotea Y138
  ['EC-NDH'].forEach(r => DB[r.replace('-','')] = VOE_A319_138);

  // Volotea Y150
  ['EC-NDG'].forEach(r => DB[r.replace('-','')] = VOE_A319_150);

  // Volotea Y156
  ['EC-MTC','EC-MTD','EC-MTE','EC-MTF','EC-MTM','EC-MTN','EC-MUC','EC-MUT','EC-MUU','EC-MUY','EC-MUX','EC-NCB','EC-NGL','EC-NHP'].forEach(r => DB[r.replace('-','')] = VOE_A319_156);

  // Volotea Y180 (A320)
  ['EC-ISI','EC-KMI','EC-MBK','EC-NNY','EC-NNZ','EC-NOL','EC-NOM','EC-NON','EC-NOP','EC-NOQ','EC-NOR','EC-NOS','EC-NOY','EC-NPB','EC-NPC','EC-NQM','EC-NQN','EC-NTU','EC-NTL','EC-NTM','EC-OEI','EC-OEH','EC-OJT','EC-OOC'].forEach(r => DB[r.replace('-','')] = VOE_A320_180);

  return DB;
})();

function getAcConfig(immat){
  if(!immat) return null;
  const key = immat.toUpperCase().replace(/[-\s]/g,'');
  return FLEET_DB[key] || null;
}

function applyAircraftConfig(){
  const immat = (document.getElementById('Immat')?.value || '').trim();
  const cfg = getAcConfig(immat);
  const setPH = (id, txt) => { const el = document.getElementById(id); if(el) el.placeholder = txt || ''; };

  if(!cfg){
    updateFinalPlaceholdersFRRK();
    return;
  }

  // Auto-remplir TypeAvion si vide
  const typeEl = document.getElementById('TypeAvion');
  if(typeEl && !typeEl.value.trim()){
    typeEl.value = cfg.acType;
    typeEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Immat Wizz A320-186 connue → pré-sélectionner la version cabine 186
  if((cfg.airline === 'W4' || cfg.airline === 'W6') && cfg.acType === 'A320'
     && /186/.test(cfg.config || '')){
    setA320Ver('186');
    updateInfoStrip();  // rafraîchit le badge
  }

  // Appliquer zones et holds en placeholder
  if(cfg.zones){
    setPH('FinalOA', cfg.zones.OA || '');
    setPH('FinalOB', cfg.zones.OB || '');
    setPH('FinalOC', cfg.zones.OC || '');
    setPH('FinalOD', cfg.zones.OD || '');
  }
  if(cfg.holds){
    setPH('FinalH1', cfg.holds.H1 || '');
    setPH('FinalH2', cfg.holds.H2 || '');
    setPH('FinalH3', cfg.holds.H3 || '');
    setPH('FinalH4', cfg.holds.H4 || '');
  }
}

function updateFinalPlaceholdersFRRK(){
  const cie  = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const type = (document.getElementById('TypeAvion')?.value || '').toUpperCase().trim();

  const isFRRK = (cie === 'FR' || cie === 'RK');
  const isW4W6 = (cie === 'W4' || cie === 'W6');

  const setPH = (id, txt)=>{
    const el = document.getElementById(id);
    if(!el) return;
    el.placeholder = txt || '';
  };

  // reset
  ['FinalOA','FinalOB','FinalOC','FinalOD','FinalH1','FinalH2','FinalH3','FinalH4'].forEach(id=>setPH(id,''));
  if(!isFRRK && !isW4W6) return;

  // ===== FR / RK =====
  if(isFRRK){
    if(type === 'B38M'){
      setPH('FinalOA', '32 (1-6)');
      setPH('FinalOB', '129 (7-29)');
      setPH('FinalOC', '36 (30-35)');
      setPH('FinalH1', '5 pcs');
      setPH('FinalH2', '100 pcs');
      setPH('FinalH3', 'Remainder');
      setPH('FinalH4', 'Over-spill H3');
      return;
    }
    if(type === 'B738'){
      setPH('FinalOA', '27 (1-5)');
      setPH('FinalOB', '132 (6-28)');
      setPH('FinalOC', '30 (29-33)');
      setPH('FinalH1', '30 pcs');
      setPH('FinalH2', '160 pcs');
      setPH('FinalH3', 'Remainder');
      setPH('FinalH4', 'Over-spill H3');
      return;
    }
    if(type === 'A320'){
      setPH('FinalOA', '60 (1-10)');
      setPH('FinalOB', '60 (11-20)');
      setPH('FinalOC', '60 (21-30)');
      setPH('FinalH1', '160 pcs');
      setPH('FinalH2', 'Overflow');
      setPH('FinalH3', 'Overflow');
      setPH('FinalH4', 'Not planned');
      return;
    }
    return;
  }

  // ===== W4 / W6 =====
  if(isW4W6){
    if(type === 'A20N'){
      setPH('FinalOA', '60 (1-10)');
      setPH('FinalOB', '66 (11-21)');
      setPH('FinalOC', '60 (22-31)');
      setPH('FinalH1', '3402 kg');   // CP1
      // CP2 masqué pour A20N
      setPH('FinalH3', '2426 kg');   // CP3
      setPH('FinalH4', '2110 kg');   // CP4
      return;
    }
    if(type === 'A320'){
      // Version cabine choisie par l'agent (défaut 180) — voir badge ⚠ dans le bandeau
      if(getA320Ver() === '186'){
        setPH('FinalOA', '60 (1-10)');
        setPH('FinalOB', '66 (11-21)');
        setPH('FinalOC', '60 (22-31)');
      } else {
        setPH('FinalOA', '66 (1-11)');
        setPH('FinalOB', '60 (12-21)');
        setPH('FinalOC', '54 (22-30)');
      }
      setPH('FinalH1', '3402 kg');   // CP1
      // CP2 masqué pour A320
      setPH('FinalH3', '2426 kg');   // CP3
      setPH('FinalH4', '2110 kg');   // CP4
      return;
    }
    if(type === 'A321'){
      setPH('FinalOA', '54 (1-9)');
      setPH('FinalOB', '64 (10-20)');
      setPH('FinalOC', '58 (21-30)');
      setPH('FinalOD', '54 (31-39)');
      setPH('FinalH1', '1140 kg');   // CP1
      setPH('FinalH2', '2160 kg');   // CP2
      setPH('FinalH3', '3587 kg');   // CP3
      setPH('FinalH4', '2083 kg');   // CP4
      return;
    }
    if(type === 'A21NY'){
      setPH('FinalOA', '60 (1-10)');
      setPH('FinalOB', '60 (11-20)');
      setPH('FinalOC', '59 (21-30)');
      setPH('FinalOD', '60 (31-40)');
      setPH('FinalH1', '2202 kg');   // CP1
      setPH('FinalH2', '3468 kg');   // CP2
      setPH('FinalH3', '1272 kg');   // CP3 — A321 NEO XLR
      setPH('FinalH4', '2083 kg');   // CP4
      return;
    }
    if(type === 'A21N'){
      setPH('FinalOA', '60 (1-10)');
      setPH('FinalOB', '60 (11-20)');
      setPH('FinalOC', '59 (21-30)');
      setPH('FinalOD', '60 (31-40)');
      setPH('FinalH1', '2202 kg');   // CP1
      setPH('FinalH2', '3468 kg');   // CP2
      setPH('FinalH3', '3587 kg');   // CP3
      setPH('FinalH4', '2083 kg');   // CP4
      return;
    }
    return;
  }
}

/* ===== Version cabine A320 W4/W6 (180 par défaut / 186) — par onglet ===== */
function getA320Ver(){
  try{
    if(!currentTabId) return '180';
    const data = JSON.parse(localStorage.getItem('tab-'+currentTabId) || '{}');
    return data.A320Ver === '186' ? '186' : '180';
  }catch(e){ return '180'; }
}
function setA320Ver(v){
  if(!currentTabId) return;
  try{
    const data = JSON.parse(localStorage.getItem('tab-'+currentTabId) || '{}');
    data.A320Ver = (v === '186') ? '186' : '180';
    localStorage.setItem('tab-'+currentTabId, JSON.stringify(data));
  }catch(e){}
}
function toggleA320Ver(){
  const cur = getA320Ver();
  setA320Ver(cur === '186' ? '180' : '186');
  updateFinalPlaceholdersFRRK();  // met à jour les zones OA/OB/OC
  updateInfoStrip();              // rafraîchit le badge
}

/* Badge ⚠ 180/186 à côté du type avion dans le bandeau (uniquement W4/W6 + A320) */
function renderA320VerBadge(){
  const kv = document.getElementById('kvType');
  if(!kv) return;
  const cie  = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const type = (document.getElementById('TypeAvion')?.value || '').toUpperCase().trim();
  const applies = (cie === 'W4' || cie === 'W6') && type === 'A320';

  let badge = document.getElementById('kvTypeVerBadge');

  if(!applies){
    if(badge) badge.style.display = 'none';
    return;
  }

  if(!badge){
    badge = document.createElement('span');
    badge.id = 'kvTypeVerBadge';
    badge.style.cssText = 'display:inline-flex;align-items:center;gap:2px;margin-left:6px;padding:1px 6px;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;user-select:none;line-height:1.4;vertical-align:middle;';
    badge.title = 'Version cabine A320 — cliquer pour basculer 180 / 186';
    badge.addEventListener('click', toggleA320Ver);
    kv.insertAdjacentElement('afterend', badge);
  }

  const ver = getA320Ver();
  badge.style.display = 'inline-flex';
  if(ver === '186'){
    badge.textContent = '⚠ 186';
    badge.style.background = '#dbeafe';   // bleu clair — version confirmée
    badge.style.color      = '#1e40af';
    badge.style.border      = '1px solid #93c5fd';
  } else {
    badge.textContent = '⚠ 180';
    badge.style.background = '#fef3c7';   // orange clair — défaut, à vérifier
    badge.style.color      = '#92400e';
    badge.style.border      = '1px solid #fcd34d';
  }
}

/* ===== Mode LID FR/RK : 'ELID' (défaut, ADULT+CHILD groupés) / 'LID' (séparés) ===== */
function getLidMode(){
  try{
    if(!currentTabId) return 'ELID';
    const data = JSON.parse(localStorage.getItem('tab-'+currentTabId) || '{}');
    return data.LidMode === 'LID' ? 'LID' : 'ELID';   // eLID par défaut
  }catch(e){ return 'ELID'; }
}
function setLidMode(m){
  if(!currentTabId) return;
  try{
    const data = JSON.parse(localStorage.getItem('tab-'+currentTabId) || '{}');
    data.LidMode = (m === 'LID') ? 'LID' : 'ELID';
    localStorage.setItem('tab-'+currentTabId, JSON.stringify(data));
  }catch(e){}
}
function isELID(){ return getLidMode() === 'ELID'; }

function switchLidMode(m){
  const prev = getLidMode();
  if(prev === m) return;
  setLidMode(m);

  const adultEl = document.getElementById('FinalADULT');
  const childEl = document.getElementById('FinalCHILD');

  if(m === 'ELID'){
    // Passage en eLID : on regroupe ADULT + CHILD dans le champ unique
    const a = parseInt(adultEl?.value || '', 10);
    const c = parseInt(childEl?.value || '', 10);
    if(adultEl && (Number.isFinite(a) || Number.isFinite(c))){
      adultEl.value = String((Number.isFinite(a)?a:0) + (Number.isFinite(c)?c:0));
    }
    if(childEl) childEl.value = '';   // le CHILD n'existe plus séparément
  }
  // Passage en Paper LID : on laisse la valeur dans ADULT, l'agent ventile lui-même

  updateFinalLoadLayout();
  updateFinalTOB();
  renderLidModeToggle();
  // La cible "Remise LID" de la timeline depend du mode -> on la redessine
  if(typeof renderTimeline === 'function') renderTimeline();
}

/* Sélecteur eLID / Paper LID au-dessus de la ligne PAX (FR/RK uniquement) */
function renderLidModeToggle(){
  const row = document.getElementById('finalPaxRow');
  if(!row) return;

  const cie    = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const isFRRK = (cie === 'FR' || cie === 'RK');

  let bar = document.getElementById('lidModeBar');

  if(!isFRRK){
    if(bar) bar.style.display = 'none';
    return;
  }

  if(!bar){
    bar = document.createElement('div');
    bar.id = 'lidModeBar';
    bar.style.cssText = 'display:flex; gap:4px; align-items:center; justify-content:flex-end; margin-bottom:5px;';
    bar.innerHTML = `
      <span style="font-size:10px; font-weight:800; opacity:.6; margin-right:2px;">SAISIE</span>
      <button type="button" id="lidModeELID" style="font-size:10px; font-weight:800; padding:2px 8px; border-radius:7px; cursor:pointer; border:1px solid transparent;">eLID</button>
      <button type="button" id="lidModeLID"  style="font-size:10px; font-weight:800; padding:2px 8px; border-radius:7px; cursor:pointer; border:1px solid transparent;">Paper LID</button>
    `;
    row.insertAdjacentElement('beforebegin', bar);
    bar.querySelector('#lidModeELID').addEventListener('click', ()=> switchLidMode('ELID'));
    bar.querySelector('#lidModeLID').addEventListener('click',  ()=> switchLidMode('LID'));
  }

  bar.style.display = 'flex';

  const on  = 'background:#dbeafe; color:#1e40af; border:1px solid #93c5fd;';
  const off = 'background:transparent; color:#6b7280; border:1px solid #d1d5db;';
  const elid = isELID();
  const bE = bar.querySelector('#lidModeELID');
  const bL = bar.querySelector('#lidModeLID');
  const base = 'font-size:10px; font-weight:800; padding:2px 8px; border-radius:7px; cursor:pointer;';
  if(bE) bE.style.cssText = base + (elid ? on : off);
  if(bL) bL.style.cssText = base + (elid ? off : on);
}

function updateFinalLoadLayout(){
  const cie  = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const type = (document.getElementById('TypeAvion')?.value || '').toUpperCase().trim();
  const isFRRK = (cie === 'FR' || cie === 'RK');
  const isW4W6 = (cie === 'W4' || cie === 'W6');
  const hasOD_W4W6 = isW4W6 && (type === 'A321' || type === 'A21N' || type === 'A21NY');
  const hideCP2_W4W6 = isW4W6 && (type === 'A20N' || type === 'A320');

  // ── Visibilité PAX ──────────────────────────────────────────
  const hide = (id) => { const el = document.getElementById(id); if(el){ const s = el.closest('.ld-stat') || el.closest('.field'); if(s) s.style.display = 'none'; } };
  const show = (id, flex) => { const el = document.getElementById(id); if(el){ const s = el.closest('.ld-stat') || el.closest('.field'); if(s) s.style.display = flex ? 'flex' : ''; } };

  if(isFRRK){
    hide('FinalMALE'); hide('FinalFEMALE');
    show('FinalADULT', true);
    // eLID : ADULT + CHILD regroupés dans un seul champ → on masque CHILD
    if(isELID()) hide('FinalCHILD'); else show('FinalCHILD', true);
    show('FinalINFANT', true);
  } else {
    hide('FinalADULT');
    show('FinalMALE', true); show('FinalFEMALE', true);
    show('FinalCHILD', true); show('FinalINFANT', true);
  }

  // ── OD + colonnes zones ──────────────────────────────────────
  const odVisible = (!isFRRK && !isW4W6) || hasOD_W4W6;
  if(odVisible) show('FinalOD'); else hide('FinalOD');
  const zonesRow = document.getElementById('finalZonesRow');
  if(zonesRow) zonesRow.style.gridTemplateColumns = odVisible ? 'repeat(4,1fr)' : 'repeat(3,1fr)';

  // ── H2 (CP2) ────────────────────────────────────────────────
  if(hideCP2_W4W6) hide('FinalH2'); else show('FinalH2');

  // ── Labels OA/OB/OC → FWD/MID/AFT pour FR/RK ───────────────
  const setLbl = (id, txt) => {
    const el = document.getElementById(id);
    const s = el ? (el.closest('.ld-stat') || el.closest('.field')) : null;
    if(s){ const lbl = s.querySelector('.ld-stat-label, label'); if(lbl) lbl.textContent = txt; }
  };
  setLbl('FinalOA', isFRRK ? 'FWD' : 'OA');
  setLbl('FinalOB', isFRRK ? 'MID' : 'OB');
  setLbl('FinalOC', isFRRK ? 'AFT' : 'OC');

  // ── Labels H1..H4 → CP1..CP4 ────────────────────────────────
  const useCPLabel = (!isFRRK) || (isFRRK && type === 'A320') || isW4W6;
  setLbl('FinalH1', useCPLabel ? 'CP1' : 'H1');
  setLbl('FinalH2', useCPLabel ? 'CP2' : 'H2');
  setLbl('FinalH3', useCPLabel ? 'CP3' : 'H3');
  setLbl('FinalH4', useCPLabel ? 'CP4' : 'H4');

  // ── Label ADULT : "ADULT+CHILD" en eLID (FR/RK) ─────────────
  if(isFRRK) setLbl('FinalADULT', isELID() ? 'ADULT+CHILD' : 'ADULT');
  else       setLbl('FinalADULT', 'ADULT');
  setLbl('FinalCHILD', 'CHILD');

  // ── LID Guide : FR/RK uniquement ────────────────────────────
  const lidBtn = document.getElementById('lidGuideBtn');
  if(lidBtn) lidBtn.style.display = isFRRK ? '' : 'none';

  // ── Sélecteur eLID / Paper LID (FR/RK) ─────────────────────
  renderLidModeToggle();

  // ── Nettoyage cache obsolète ─────────────────────────────────
  window._finalLayoutCache = null;

  updateFinalPlaceholdersFRRK();
  revalidateDangerFields();
}

// ===== LOAD PREVI (layout switch) =====
function updatePreviLoadLayout(){
  const cie = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const isFRRK = (cie === 'FR' || cie === 'RK');

  const fr = document.getElementById('previFRRK');
  const ot = document.getElementById('previOTHER');
  if(!fr || !ot) return;

  fr.style.display = isFRRK ? '' : 'none';
  ot.style.display = isFRRK ? 'none' : '';

  if(isFRRK) updatePreviTOB_FRRK();
  else updatePreviTOB();
}

// ===== listener compagnie (1 seule fois) =====
if(!window._cieLayoutHooked){
  window._cieLayoutHooked = true;

  document.getElementById('Cie')?.addEventListener('change', ()=>{
    updateFinalLoadLayout();
    updatePreviLoadLayout();
    updateDLCodeInputMode();
  });
}

function updatePreviTOB_FRRK(){
  const mainTxt = (document.getElementById('PreviPAX_MAIN')?.value || '').trim();
  const infTxt  = (document.getElementById('PreviPAX_INF')?.value  || '').trim();
  const el = document.getElementById('PreviTOB_FRRK');
  if(!el) return;

  // ✅ si rien saisi -> on n'affiche rien
  if(mainTxt === '' && infTxt === ''){
    el.value = '';
    return;
  }

  const main = parseInt(mainTxt || '0', 10) || 0;
  const inf  = parseInt(infTxt  || '0', 10) || 0;

  el.value = `${main} + ${inf}`;
}

function updatePreviTOB(){
  const n = (id)=>{
    const v = (document.getElementById(id)?.value || '').trim();
    const x = parseInt(v || '0', 10);
    return Number.isFinite(x) ? x : 0;
  };
  const hasAny = ['PreviMALE','PreviFEMALE','PreviCHILD','PreviINFANT']
    .some(id => (document.getElementById(id)?.value || '').trim() !== '');

  const male   = n('PreviMALE');
  const female = n('PreviFEMALE');
  const child  = n('PreviCHILD');
  const infant = n('PreviINFANT');

  const main = male + female + child;
  const el = document.getElementById('PreviTOB');
  if(el) el.value = hasAny ? `${main} + ${infant}` : '';
}

/* ===== COUNTDOWN (CD) ===== */
let countdownTimer = null;

function getNowMinutes(){
  const now = new Date();
  const h = isUTC ? now.getUTCHours() : now.getHours();
  const m = isUTC ? now.getUTCMinutes() : now.getMinutes();
  const s = isUTC ? now.getUTCSeconds() : now.getSeconds();
  return { mins: h*60 + m, secs: s };
}

function fmtMMSSSigned(totalSeconds){
  const isOver = totalSeconds < 0;
  const abs = Math.abs(totalSeconds);

  const mm = Math.floor(abs / 60);
  const ss = abs % 60;

  return `${isOver ? '+' : ''}${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

function stopCountdown(resetDisplay=true){
  if(countdownTimer){ clearInterval(countdownTimer); countdownTimer = null; }
  const el = document.getElementById('timer-cd');
  if(!el) return;
  if(resetDisplay){
    el.textContent = '--:--';
    el.classList.remove('cd-over');
  }
}

function freezeCountdown(){
  // on coupe juste l'interval, on ne touche pas au texte affiché
  if(countdownTimer){ clearInterval(countdownTimer); countdownTimer = null; }
}

function updateCountdownOnce(){
  const el = document.getElementById('timer-cd');
  if(!el) return;

  const sibtTxt = document.getElementById('SIBT')?.value || '';
  const aibtTxt = document.getElementById('AIBT')?.value || '';
  const sobtTxt = document.getElementById('SOBT')?.value || '';
  const aobtTxt = document.getElementById('AOBT')?.value || '';

  const from = (document.getElementById('From')?.value || '').toUpperCase().trim();
  const isBVA = (from === 'BVA');

  // ✅ BVA: on exige seulement SOBT (SIBT/AIBT peuvent être vides)
  // ✅ Autres: on garde l'exigence SIBT + AIBT + SOBT
  if(!sobtTxt || (!isBVA && (!aibtTxt || !sibtTxt))){
    el.textContent = '--:--';
    el.classList.remove('cd-over');
    return;
  }

  const SOBT = parseHHMM(sobtTxt);

  // ✅ BVA: on force SIBT=AIBT=SOBT
  const SIBT = isBVA ? SOBT : parseHHMM(sibtTxt);
  const AIBT = isBVA ? SOBT : parseHHMM(aibtTxt);

  if(SOBT == null || SIBT == null || AIBT == null){
    el.textContent = '--:--';
    el.classList.remove('cd-over');
    return;
  }

  // cible = SOBT si retard AIBT<=SIBT, sinon EOBT adj
  let targetMin = null;
  if (AIBT <= SIBT) targetMin = SOBT;
  else {
    const tobt = window._eobtRawMins;
    if(tobt == null){
      el.textContent = '--:--';
      el.classList.remove('cd-over');
      return;
    }
    targetMin = tobt;
  }

  // ===== CAS AOBT : on fige MAIS on recalcule selon AOBT =====
  if(aobtTxt){
    const AOBT = parseHHMM(aobtTxt);
    if(AOBT == null){
      el.textContent = '--:--';
      el.classList.remove('cd-over');
      return;
    }

    // diff = AOBT - cible (signé, gère minuit)
    let diffMin = AOBT - targetMin;
    if(diffMin > 720) diffMin -= 1440;
    if(diffMin < -720) diffMin += 1440;

    const totalSeconds = diffMin * 60;
    const sign = totalSeconds >= 0 ? '+' : '-';
    const abs = Math.abs(totalSeconds);
    const mm = Math.floor(abs / 60);
    const ss = abs % 60;

    el.textContent = `${sign}${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;

    // rouge si + (retard)
    el.classList.toggle('cd-over', totalSeconds > 0);
    return;
  }

  // ===== CAS NORMAL : live avec NOW (décompte puis +) =====
  const now = getNowMinutes();

  let diffMin = targetMin - now.mins;
  if(diffMin < -720) diffMin += 1440;
  if(diffMin > 720) diffMin -= 1440;

  const remainingSeconds = diffMin * 60 - now.secs;

  const sign = remainingSeconds <= 0 ? '+' : ''; // quand on dépasse => +
  const abs = Math.abs(remainingSeconds);
  const mm = Math.floor(abs / 60);
  const ss = abs % 60;

  el.textContent = `${sign}${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  el.classList.toggle('cd-over', remainingSeconds < 0); // rouge quand on est passé à +
}

function ensureCountdownRunning(){
  const sibtTxt = document.getElementById('SIBT')?.value || '';
  const aibtTxt = document.getElementById('AIBT')?.value || '';
  const sobtTxt = document.getElementById('SOBT')?.value || '';
  const aobtTxt = document.getElementById('AOBT')?.value || '';

  const from = (document.getElementById('From')?.value || '').toUpperCase().trim();
  const isBVA = (from === 'BVA');

  // ✅ BVA: SOBT seul suffit
  // ✅ Autres: SIBT + AIBT + SOBT requis
  const baseOK = isBVA
    ? !!sobtTxt
    : !!(sibtTxt && aibtTxt && sobtTxt);

  // Si AOBT est rempli : pas d'interval, mais on recalcule l'affichage
  if(baseOK && aobtTxt){
    freezeCountdown();
    updateCountdownOnce();
    return;
  }

  // Si base incomplète : on stop + reset
  if(!baseOK){
    stopCountdown(true);
    return;
  }

  // Live
  if(!countdownTimer){
    updateCountdownOnce();
    countdownTimer = setInterval(updateCountdownOnce, 1000);
  } else {
    updateCountdownOnce();
  }
}

/* Timeline zoom */
function timelineZoomIn(){ timelineSetZoom(timelineZoom + TL_ZOOM_STEP); }
function timelineZoomOut(){ timelineSetZoom(timelineZoom - TL_ZOOM_STEP); }
function timelineZoomReset(){ timelineSetZoom(1); }
function timelineSetZoom(z){
  const scroller = document.getElementById('timelineScroll');
  const canvas   = document.getElementById('timelineCanvas');
  if(!scroller || !canvas) return;
  const prevCenterRatio = (scroller.scrollLeft + scroller.clientWidth/2) / Math.max(1, scroller.scrollWidth);
  timelineZoom = Math.max(TL_ZOOM_MIN, Math.min(TL_ZOOM_MAX, z));
  const lbl = document.getElementById('timelineZoomLabel');
  if(lbl) lbl.textContent = `${Math.round(timelineZoom*100)}%`;
  renderTimeline();
  scroller.scrollLeft = prevCenterRatio * scroller.scrollWidth - scroller.clientWidth/2;
}

/* ===== LOAD MODAL (single fullscreen) ===== */
function openLoadModal(mode='arr'){
  const b = document.getElementById('loadBackdrop');
  const m = document.getElementById('loadModal');
  if(b) b.style.display = '';
  if(m) m.style.display = 'flex';
  switchLoadPanel(mode);
}

function closeLoadModal(){
  const b = document.getElementById('loadBackdrop');
  const m = document.getElementById('loadModal');
  if(m) m.style.display = 'none';
  if(b) b.style.display = 'none';
}

function switchLoadPanel(mode){
  const pArr   = document.getElementById('lmPanelArr');
  const pExp   = document.getElementById('lmPanelExp');
  const pFinal = document.getElementById('lmPanelFinal');

  const tArr   = document.getElementById('lmTabArr');
  const tExp   = document.getElementById('lmTabExp');
  const tFinal = document.getElementById('lmTabFinal');

  if(pArr)   pArr.style.display   = (mode==='arr')   ? '' : 'none';
  if(pExp)   pExp.style.display   = (mode==='exp')   ? '' : 'none';
  if(pFinal) pFinal.style.display = (mode==='final') ? '' : 'none';

  if(tArr)   tArr.classList.toggle('is-active', mode==='arr');
  if(tExp)   tExp.classList.toggle('is-active', mode==='exp');
  if(tFinal) tFinal.classList.toggle('is-active', mode==='final');

  const hint = document.getElementById('lmHint');
  if(hint){
    if(mode==='arr') hint.textContent = 'ARRIVÉE';
    if(mode==='exp') hint.textContent = 'EXPLOITATION';
    if(mode==='final') hint.textContent = 'FINAL';
  }

  if(mode === 'final') updateFinalTOB();
  updateHeaderOffset();
}

/* ===== LDM modal ===== */

let _ldmMode = 'arr';

function refreshLDMLayouts(){
  // IMPORTANT : si PREVI/FINAL dépendent de la Cie, il faut refresh ici
  try{ updateFinalLoadLayout?.(); }catch(e){}
  try{ updatePreviLoadLayout?.(); }catch(e){}
  try{ updateFinalTOB?.(); }catch(e){}
}

function openLDM(mode=null){
  const b = document.getElementById('ldmBackdrop');
  const m = document.getElementById('ldmModal');

  lockScroll();

  if(b) b.style.display = '';
  if(m) m.style.display = 'flex';

  updateHWeights(); // poids soutes FR/RK
  updateCrewThobVisibility(); // CREW/THOB FR/RK

  // Validation max plateau — rouge persistant via _dangerSet
  const zoneIds = ['FinalOA','FinalOB','FinalOC','FinalOD','FinalH1','FinalH2','FinalH3','FinalH4'];
  zoneIds.forEach(id => {
    const el = document.getElementById(id);
    if(!el || el._dangerValidated) return;
    el._dangerValidated = true;
    el.addEventListener('input',  () => checkDangerField(id));
    el.addEventListener('change', () => checkDangerField(id));
  });

  if(mode === null){
    ldmSwitch(getAutoLDMMode());
  }else{
    ldmSwitch(mode);
  }

  refreshLDMLayouts();
  updateHeaderOffset();
}

function closeLDM(){
  const b = document.getElementById('ldmBackdrop');
  const m = document.getElementById('ldmModal');

  unlockScroll();

  if(m) m.style.display = 'none';
  if(b) b.style.display = 'none';

  saveCurrentTabData();
}

function ldmSwitch(mode){
  _ldmMode = mode;

  const sArr   = document.getElementById('ldmArr');
  const sPrevi = document.getElementById('ldmPrevi');
  const sFinal = document.getElementById('ldmFinal');
  const sFuel  = document.getElementById('ldmFuel');

  const tArr   = document.getElementById('ldmTabArr');
  const tPrevi = document.getElementById('ldmTabPrevi');
  const tFinal = document.getElementById('ldmTabFinal');
  const tFuel  = document.getElementById('ldmTabFuel');

  if(sArr)   sArr.style.display   = (mode === 'arr')   ? '' : 'none';
  if(sPrevi) sPrevi.style.display = (mode === 'previ') ? '' : 'none';
  if(sFinal) sFinal.style.display = (mode === 'final') ? '' : 'none';
  if(sFuel)  sFuel.style.display  = (mode === 'fuel')  ? '' : 'none';

  if(tArr)   tArr.classList.toggle('is-active', mode === 'arr');
  if(tPrevi) tPrevi.classList.toggle('is-active', mode === 'previ');
  if(tFinal) tFinal.classList.toggle('is-active', mode === 'final');
  if(tFuel)  tFuel.classList.toggle('is-active', mode === 'fuel');

  const hint = document.getElementById('ldmHint');
  if(hint){
    hint.textContent =
      (mode === 'arr')   ? 'ARRIVÉE' :
      (mode === 'previ') ? 'PREVI' :
      (mode === 'final') ? 'FINAL' :
      'FUEL';
  }

  if(mode === 'final') updateFinalTOB();

  refreshLDMLayouts();
  updateHeaderOffset();
}

/* compat anciens boutons (optionnel) */
function toggleLoadArr(){ openLDM('arr'); }
function toggleLoadExp(){ openLDM('exp'); }
function toggleLoadFinal(){ openLDM('final'); }

/* ===== FINAL : calcul ADULT + TOB + contrôle OA/OB/OC/OD ===== */
function asInt(id){
  const v = (document.getElementById(id)?.value || '').trim();
  if(v === '') return null;
  const n = parseInt(v,10);
  return isNaN(n) ? null : n;
}
function syncAdultIfNeeded(){
  const m = asInt('FinalMALE');
  const f = asInt('FinalFEMALE');
  const adultEl = document.getElementById('FinalADULT');
  if(!adultEl) return;

  if(m != null && f != null){
    adultEl.value = String(m + f);
    adultEl.readOnly = true;
  }else{
    adultEl.readOnly = false;
  }
}
function setTOBValidity(isValid){
  const tobEl = document.getElementById('FinalTOB');
  if(!tobEl) return;
  tobEl.classList.toggle('is-invalid', !isValid);
  tobEl.classList.toggle('is-valid', isValid);
}

// global (à mettre une fois, hors fonction)
let _finalTOBLastValue = '';
let _commChargLastValue = '';

function updateCommChargementPiste(){
  // Construire une "signature" des valeurs H1-H4 remplies
  const ids = ['FinalH1','FinalH2','FinalH3','FinalH4'];
  const vals = ids.map(id => (document.getElementById(id)?.value || '').trim());
  const filled = vals.filter(v => v !== '');
  if(!filled.length) return; // rien de rempli → on ne touche pas

  const sig = vals.join('|');
  if(sig === _commChargLastValue) return; // même combinaison → pas de re-timestamp
  _commChargLastValue = sig;

  const d = new Date();
  const hh = String(isUTC ? d.getUTCHours() : d.getHours()).padStart(2,'0');
  const mm = String(isUTC ? d.getUTCMinutes() : d.getMinutes()).padStart(2,'0');

  const el = document.getElementById('CommChargementPiste');
  if(el){
    el.value = `${hh}:${mm}`;
    el.dispatchEvent(new Event('change', {bubbles:true}));
  }
}

function updateFinalTOB(){
  const n = (id)=>{
    const v = (document.getElementById(id)?.value || '').trim();
    if(v === '') return null;
    const x = parseInt(v, 10);
    return Number.isFinite(x) ? x : null;
  };

  const cie    = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const isFRRK = (cie === 'FR' || cie === 'RK');
  // En eLID (FR/RK), le champ ADULT contient déjà ADULT+CHILD → on n'ajoute pas CHILD
  const grouped = isFRRK && isELID();

  const male   = n('FinalMALE');
  const female = n('FinalFEMALE');
  const adult  = n('FinalADULT');
  const child  = grouped ? 0 : (n('FinalCHILD') ?? 0);
  const infant = n('FinalINFANT') ?? 0;

  let adultsMain = null;
  if(male != null || female != null){
    adultsMain = (male ?? 0) + (female ?? 0);
  } else if(adult != null){
    adultsMain = adult;
  }

  let main = null;
  if(adultsMain != null) main = adultsMain + child;

  const tobEl = document.getElementById('FinalTOB');
  if(!tobEl) return;

  if(main == null){
    tobEl.value = '';
    tobEl.classList.remove('is-invalid','is-valid');
    _finalTOBLastValue = '';
    return;
  }

  const newTOB = `${main} + ${infant}`;
  tobEl.value = newTOB;
  updateFinalTHOB();

  // ✅ Ajout ligne dans SI FINAL
  if(newTOB !== _finalTOBLastValue){
    _finalTOBLastValue = newTOB;

    const d = new Date();
    const hh = String(isUTC ? d.getUTCHours() : d.getHours()).padStart(2,'0');
    const mm = String(isUTC ? d.getUTCMinutes() : d.getMinutes()).padStart(2,'0');

    const commEl = document.getElementById('CommChiffresPorte');
    if(commEl){
      commEl.value = `${hh}:${mm}`;
      commEl.dispatchEvent(new Event('change', {bubbles:true}));
    }
  }

  const oa = n('FinalOA') ?? 0;
  const ob = n('FinalOB') ?? 0;
  const oc = n('FinalOC') ?? 0;
  const od = n('FinalOD') ?? 0;
  const sumZones = oa + ob + oc + od;

  const ok = (sumZones === main);

  tobEl.classList.toggle('is-invalid', !ok);
  tobEl.classList.toggle('is-valid', ok);
}

function refreshUIForTabs(){
  const tabsLS = JSON.parse(localStorage.getItem('flightTabs') || '[]');
  const hasTab = Array.isArray(tabsLS) && tabsLS.length > 0;

  document.body.classList.toggle('has-tab', hasTab);
  document.body.classList.toggle('no-tab', !hasTab);

  // Mettre à jour le padding immédiatement après affichage du app-wrap
  requestAnimationFrame(() => updateHeaderOffset());

  if(!hasTab){
    currentTabId = null;
    closeAKPicker();
    stopCountdown(true);
  }
}

/* INIT */
function initForm(){
  // 1) Créer d’abord tout le DOM dynamique (sinon loadTabData() ne peut pas restaurer)
  generateTimingFields();

  // 2) UI tabs
  renderTabs();
  refreshUIForTabs();

  // 3) Autosave + unload
  attachAutoSave();
  window.addEventListener('beforeunload', ()=>{ saveCurrentTabData(); });

  // 4) Listeners INFO VOL -> bandeau essentiel instant + label onglet
  const hookStrip = (id, ev='input')=>{
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener(ev, ()=>{ updateInfoStrip(); });
  };

  // Champs qui alimentent les cards essentiels
  hookStrip('From', 'input');
  hookStrip('To', 'input');
  hookStrip('Immat', 'input');
  document.getElementById('Immat')?.addEventListener('input', applyAircraftConfig);
  hookStrip('NVol', 'input');
  hookStrip('Cie', 'change');
  hookStrip('TypeAvion', 'change');
  hookStrip('Parking', 'change');

  // Label onglet + calculs + strip + règles FR/RK (layout/placeholders/bouton)
  document.getElementById('Parking')?.addEventListener('change', ()=>{
    updateTabLabelInstant();
    updateInfoStrip();
  });

  document.getElementById('Cie')?.addEventListener('change', ()=>{
    updateTabLabelInstant();
    updateAllCalculations();
    updateInfoStrip();

    updateFinalLoadLayout();
    updateFinalPlaceholdersFRRK();
    updateLidGuideVisibility();
    updateDLCodeInputMode();
  });

  document.getElementById('TypeAvion')?.addEventListener('change', ()=>{
    updateInfoStrip();
    updateFinalLoadLayout();
    updateFinalPlaceholdersFRRK();
    updateLidGuideVisibility();
  });

  document.getElementById('NVol')?.addEventListener('input', ()=>{
    updateTabLabelInstant();
    updateInfoStrip();
  });

  document.getElementById('To')?.addEventListener('input', ()=>{
    updateTabLabelInstant();
    updateInfoStrip();
  });

  setupUppercaseInputs(['NVol','From','To','Immat','BorderControl']);

  // 5) Modes persistés
  const storedDark = (localStorage.getItem('modeDark')||'0') === '1';
  const storedUTC  = (localStorage.getItem('modeUTC')||'0') === '1';
  setDarkMode(storedDark, true);
  setTimeModeUTC(storedUTC, true);

  // 6) Listeners "input" globaux
  [
    'AIBT','SOBT','SIBT','AOBT','CTOT','ArrPNT','ArrPNC','TypeAvion',

    // LOAD (ARR+EXP fusionné)
    'LoadPAX_MAIN','LoadPAX_INF','LoadBAGS','LoadPOIDS',

    // FINAL
    'FinalMALE','FinalFEMALE','FinalADULT','FinalCHILD','FinalINFANT',
    'FinalOA','FinalOB','FinalOC','FinalOD',
    'FinalBAGS','FinalPOIDS','FinalGB'
  ].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener('input', ()=>{
      updateAllCalculations();
      updateFinalTOB();
    });
  });

  [
    'FinalBAGS','FinalH1','FinalH2','FinalH3','FinalH4',
    'FinalGB'
  ].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener('input', updateAllCalculations);
  });

  // ✅ LOCKS MALE/FEMALE/ADULT
  ['FinalMALE','FinalFEMALE','FinalADULT'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener('input', ()=>{
      syncAdultGenderLocks();
      updateFinalTOB();
    });
  });

  // état initial (locks)
  syncAdultGenderLocks();

  // 7) Drag scroll timeline
  const scroller = document.getElementById('timelineScroll');
  if(scroller){
    let isDown=false, startX=0, startLeft=0;

    scroller.addEventListener('mousedown', e=>{
      isDown=true; startX=e.clientX; startLeft=scroller.scrollLeft;
    });
    scroller.addEventListener('mouseleave', ()=>{ isDown=false; });
    scroller.addEventListener('mouseup', ()=>{ isDown=false; });
    scroller.addEventListener('mousemove', e=>{
      if(!isDown) return;
      const dx = e.clientX - startX;
      scroller.scrollLeft = startLeft - dx;
      e.preventDefault();
    });

    ['wheel','mousedown','touchstart','keydown','scroll'].forEach(ev=>{
      scroller.addEventListener(ev, ()=>{ timelineUserScrolled = true; }, {passive:true});
    });
  }

  // 8) Sélection onglet APRÈS que le DOM soit prêt
  const lastTab = String(localStorage.getItem('lastTabId') || '');
  const tabsLS  = JSON.parse(localStorage.getItem('flightTabs') || '[]');
  const tabs = Array.isArray(tabsLS) ? tabsLS.map(String) : [];

  if(tabs.length > 0){
    if(lastTab && tabs.includes(lastTab)){
      switchTab(lastTab);
    }else{
      switchTab(tabs[0]);
    }
  }else{
    currentTabId = null;
    stopCountdown();
  }

  // 9) Final init
  setDefaultDateToTodayIfEmpty();

  updateHeaderOffset();
  window.addEventListener('resize', ()=>{
    updateHeaderOffset();
    renderTimeline();
  });

  renderTimeline();
  refreshUIForTabs();
  updateFinalTOB();

  // ✅ état initial UI
  updateInfoStrip();
  updateFinalLoadLayout();
  updateFinalPlaceholdersFRRK();
  updateLidGuideVisibility();
  updateHWeights();
  updateCrewThobVisibility();
  ['DLcode1','DLcode2','DLcode3'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const pos = el.selectionStart;
      el.value = el.value.toUpperCase();
      el.setSelectionRange(pos, pos);
    });
  });
  if(typeof twSyncAll === "function") setTimeout(twSyncAll, 50);
  setTimeout(applyAircraftConfig, 80);
}

function updateInfoStrip(){
  const v = id => (document.getElementById(id)?.value || '').toUpperCase().trim();
  const set = (id, txt, def='----') => {
    const el = document.getElementById(id);
    if(!el) return;
    el.textContent = (txt && String(txt).trim()) ? String(txt).trim() : def;
  };

  // ----- vols ARR/DEP + BC depuis akMeta (prioritaire) -----
  let arrFF = '';
  let depFF = '';
  let bcMeta = '';

  let data = null;

  try{
    if(currentTabId){
      data = JSON.parse(localStorage.getItem('tab-'+currentTabId) || '{}');
      arrFF  = (data?.akMeta?.arrFF || '').toUpperCase().trim();
      depFF  = (data?.akMeta?.depFF || '').toUpperCase().trim();
      bcMeta = (data?.akMeta?.bc    || '').toUpperCase().trim();
    }
  }catch(e){}

  // fallback manuel : DEP = CIE+N°
  // ⚠️ sauf si on est sur un FLOW=ARR et que TO=BVA (pas de départ programmé)
  if(!depFF){
    const toNow = (v('To') || '').toUpperCase().trim();
    const flowMeta = (data?.akMeta?.flow || '').toUpperCase().trim();

    if(!(flowMeta === 'ARR' && toNow === 'BVA')){
      const cie  = v('Cie');
      const nvol = v('NVol');
      if(cie || nvol) depFF = `${cie}${nvol}`.trim();
    }
  }

  set('kvArrVol', arrFF || '—', '—');
  set('kvDepVol', depFF || '—', '—');

  set('kvFrom', v('From') || '---', '---');
  set('kvTo',   v('To')   || '---', '---');

  set('kvImmat', v('Immat') || '------', '------');
  set('kvType',  v('TypeAvion') || '----', '----');

  // Badge version cabine A320 (W4/W6) à côté du type
  renderA320VerBadge();

  // Salle arrivée : plus de champ BorderControl -> on prend akMeta.bc
  set('kvBC', bcMeta || '--', '--');

  set('kvPark', v('Parking') || '--', '--');
}

/* date défaut */
function setDefaultDateToTodayIfEmpty(){
  const d = document.getElementById('Date');
  if(d && !d.value){ d.valueAsDate = new Date(); }
}

/* uppercase */
function setupUppercaseInputs(ids){
  ids.forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    const toUpper = ()=>{ el.value = (el.value||'').toUpperCase(); };
    el.addEventListener('input', toUpper);
    el.addEventListener('blur', toUpper);
  });
}

/* Autosave */
function attachAutoSave(){
  const handler=()=>{
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>{
      saveCurrentTabData();
      renderTimeline();
      updateHeaderOffset();
    }, 1000);
  };
  document.addEventListener('input', handler, true);
  document.addEventListener('change', handler, true);
}

/* Tabs */
function renderTabs(){
  const tabBar = document.getElementById('tab-bar');
  if(!tabBar) return;

  tabBar.innerHTML = `
    <button class="button is-success is-light" type="button" onclick="createNewTab()">
      +
    </button>
  `;

  let tabs = JSON.parse(localStorage.getItem('flightTabs') || '[]');
  if(!Array.isArray(tabs)) tabs = [];

  tabs.forEach((id)=>{
    const data = JSON.parse(localStorage.getItem('tab-'+id) || '{}');

    const cie  = (data.Cie  || '').toUpperCase();
    const nvol = (data.NVol || '').toUpperCase();
    const to   = (data.To   || '').toUpperCase();

    // ✅ Priorité : depFF > arrFF > Cie+NVol
    const depFF = (data?.akMeta?.depFF || '').toUpperCase().trim();
    const arrFF = (data?.akMeta?.arrFF || '').toUpperCase().trim();
    const volRef = depFF || arrFF || `${cie}${nvol}`.trim();

    let label =
      volRef || to
        ? (to ? `${volRef} | ${to}`.trim() : volRef)
        : 'VOL';

    const wrap = document.createElement('span');
    wrap.className = 'tab-wrap';

    // bouton onglet (switch)
    const btn = document.createElement('button');
    btn.className = `button ${id === currentTabId ? 'is-link' : 'is-light'}`;
    btn.textContent = label || 'VOL';
    btn.onclick = ()=> switchTab(id);
    btn.ondblclick = ()=> openTabCloseModal(id);

    // Bouton refresh ↻ — toujours affiché, grisé si pas de AK
    const r = document.createElement('button');
    r.className = 'button is-light tab-refresh';
    r.type = 'button';
    r.title = 'Rafraîchir depuis AK';
    r.innerHTML = '↻';
    r.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      r.classList.add('is-loading');
      try { await refreshAKTab(id); }
      finally { r.classList.remove('is-loading'); }
    };

    if (!data.akMeta) {
      r.disabled = true;
      r.title = "Pas de vol AK associé";
      r.style.opacity = '0.45';
      r.style.cursor = 'not-allowed';
    }

    wrap.appendChild(btn);
    wrap.appendChild(r);
    tabBar.appendChild(wrap);
  });

  updateHeaderOffset();
}

function getTabFlightKey(tabId){
  try{
    const d = JSON.parse(localStorage.getItem('tab-'+tabId) || '{}');
    const meta = d?.akMeta;
    if(meta?.id) return `AK_${meta.id}`;
    const date = (d.Date||'').replaceAll('-','');
    const immat = (d.Immat||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    const from = (d.From||'').toUpperCase();
    const to = (d.To||'').toUpperCase();
    const sibt = (d.SIBT||'').replace(':','');
    const sobt = (d.SOBT||'').replace(':','');
    const timeRef = sibt||sobt;
    const stationRef = from||to;
    if(date && immat && timeRef && stationRef) return `${date}_${immat}_${stationRef}_${timeRef}`;
  }catch(_){}
  return null;
}

function createNewTab(){
  // ✅ 1) Sauver l'onglet courant AVANT de reset
  if(currentTabId) saveCurrentTabData();

  const id = String(Date.now());

  // ajoute l'onglet dans la liste
  let tabs = JSON.parse(localStorage.getItem('flightTabs') || '[]');
  if(!Array.isArray(tabs)) tabs = [];
  if(!tabs.includes(id)) tabs.push(id);
  localStorage.setItem('flightTabs', JSON.stringify(tabs));

  currentTabId = id;
  localStorage.setItem('lastTabId', id);

  clearFormFields();            // reset champs

  // snapshot initial
  const data = {};
  document.querySelectorAll('input, select, textarea').forEach(el=>{
    if(el.id === 'utcToggle' || el.id === 'darkToggle') return;
    data[el.id] = (el.type === 'checkbox') ? (el.checked ? '1' : '0') : (el.value || '');
  });
  data.infovolOpen = '0';

  localStorage.setItem('tab-'+id, JSON.stringify(data));

  renderTabs();
  refreshUIForTabs();
  updateInfoStrip();
  renderTimeline();
}

function switchTab(id){
  stopCountdown();
  saveCurrentTabData();

  // Fermer le modal LDM avant de charger le nouvel onglet
  const ldmB = document.getElementById('ldmBackdrop');
  const ldmM = document.getElementById('ldmModal');
  if(ldmM) ldmM.style.display = 'none';
  if(ldmB) ldmB.style.display = 'none';
  unlockScroll?.();

  let tabs = JSON.parse(localStorage.getItem('flightTabs') || '[]');
  if(!Array.isArray(tabs)) tabs = [];

  id = String(id);
  if(!tabs.includes(id)) return;

  currentTabId = id;
  localStorage.setItem('lastTabId', id);

  loadTabData(id);

  // Recharger le bloc note pour le nouvel onglet
  window.bnReloadTab?.();
  renderTabs();
  refreshUIForTabs();
  renderTimeline();
}

let _tabCloseId = null;

function openTabCloseModal(id){
  _tabCloseId = id;
  const data = JSON.parse(localStorage.getItem('tab-'+id) || '{}');
  const cie  = (data.Cie||'').toUpperCase();
  const nvol = (data.NVol||'').toUpperCase();
  const depFF = (data?.akMeta?.depFF||'').toUpperCase().trim();
  const label = depFF || (cie+nvol) || 'ce vol';
  document.getElementById('tabCloseModalTitle').textContent = label ? `Fermer ${label} ?` : 'Fermer ce vol ?';
  document.getElementById('tabCloseModal').style.display = 'flex';
}

function closeTabCloseModal(){
  document.getElementById('tabCloseModal').style.display = 'none';
  _tabCloseId = null;
}

function confirmCloseTab(deleteRemote){
  const id = _tabCloseId;
  closeTabCloseModal();
  if(!id) return;

  // Si deleteRemote est explicitement passé (rétrocompatibilité), l'utiliser
  if(typeof deleteRemote === 'boolean'){
    deleteTab(id, deleteRemote);
    return;
  }

  // Logique automatique selon le type de vol
  const data = JSON.parse(localStorage.getItem('tab-'+id) || '{}');
  const from = (data.From || '').toUpperCase().trim();
  const isBVA = from === 'BVA' || !data.SOBT;

  let shouldDelete;
  if(isBVA){
    // VOL ARR pur : garder si au moins un de ces champs est rempli
    const hasArrData = ['AvionPremierEmbarque','ArrPNC','ArrPNT']
      .some(f => (data[f] || '').trim() !== '');
    shouldDelete = !hasArrData;
  } else {
    // VOL DEP : garder si AIBT renseigné
    shouldDelete = !(data.AIBT || '').trim();
  }

  deleteTab(id, shouldDelete);
}

function deleteTab(id, deleteRemote = false){
  stopCountdown();
  id = String(id);  let tabs = JSON.parse(localStorage.getItem('flightTabs') || '[]');
  if(!Array.isArray(tabs)) tabs = [];

  const idx = tabs.indexOf(id);
  if(idx === -1) return;

  tabs.splice(idx, 1);
  localStorage.setItem('flightTabs', JSON.stringify(tabs));
  localStorage.removeItem('tab-' + id);
  if(tabs.length > 0){
    const nextId = tabs[Math.max(0, idx - 1)];
    currentTabId = nextId;
    localStorage.setItem('lastTabId', nextId);
    loadTabData(nextId);
  }else{
    localStorage.removeItem('lastTabId');
    currentTabId = null;
    clearFormFields();
    stopCountdown(true);
  }

  renderTabs();
  refreshUIForTabs();
  renderTimeline();
  updateInfoStrip();
}

function clearFormFields(){
  document.querySelectorAll('input, select, textarea').forEach(el=>{
    if(!el.id) return;

    if(el.type === 'checkbox'){
      // ✅ ne touche pas aux toggles globaux
      if(el.id === 'utcToggle' || el.id === 'darkToggle') return;
      el.checked = false;
    }else{
      el.value = '';
    }
  });

  // date du jour auto
  const d = document.getElementById('Date');
  if(d){
    const today = new Date().toISOString().slice(0,10);
    d.value = today;
  }

  // ✅ re-sync modes globaux (UI + variables) après nettoyage
  const storedDark = (localStorage.getItem('modeDark') || '0') === '1';
  const storedUTC  = (localStorage.getItem('modeUTC')  || '0') === '1';
  setDarkMode(storedDark, true);
  setTimeModeUTC(storedUTC, true);

  // ✅ IMPORTANT : remettre l'état des verrous cohérent
  syncAdultGenderLocks();
  updateFinalTOB?.(); // si la fonction existe chez toi

  updateAllCalculations();
  updateTabLabelInstant();
}
  
function saveCurrentTabData(){
  if(!currentTabId) return;

  // ✅ on part des données existantes pour ne pas perdre akMeta
  let data = JSON.parse(localStorage.getItem('tab-'+currentTabId) || '{}');

  document.querySelectorAll('input, select, textarea').forEach(el=>{
    if(!el.id) return;
    if(el.type==='checkbox') data[el.id]=el.checked ? '1':'0';
    else data[el.id]=el.value;
  });

  data.timer_h40=document.getElementById('timer-h40')?.textContent || '--:--';
  data.timer_h15=document.getElementById('timer-h15')?.textContent || '--:--';
  data.timer_h8=document.getElementById('timer-h8')?.textContent || '--:--';
  data.timer_tobt=document.getElementById('timer-eobt')?.textContent || '--:--';
  data.timer_cd=document.getElementById('timer-cd')?.textContent || '--:--';
  data.timer_ctot=document.getElementById('timer-ctot')?.textContent || '--:--';

  data.timingPanel = localStorage.getItem('timingPanel') || 'dep';

  // État du modal LOAD (ouvert/fermé + onglet actif)
  const ldmModal = document.getElementById('ldmModal');
  data.ldmOpen = ldmModal && ldmModal.style.display !== 'none' ? '1' : '0';
  data.ldmMode = _ldmMode || 'arr';

  localStorage.setItem('tab-'+currentTabId,JSON.stringify(data));
  localStorage.setItem('lastTabId',currentTabId);
  renderTabs();
}

function loadTabData(id){
  currentTabId = String(id);

  const raw = localStorage.getItem('tab-'+currentTabId);
  if(!raw) return;

  const data = JSON.parse(raw);
    for(const k in data){
      // ✅ toggles globaux : jamais restaurés depuis l’onglet
      if(k === 'utcToggle' || k === 'darkToggle') continue;

      const el = document.getElementById(k);
      if(!el) continue;

      if(el.type === 'checkbox'){
        el.checked = (data[k] === true || data[k] === '1');
      }else{
        el.value = data[k];
      }
    }

  // ✅ Restore visuel des timers (divs non-input)
  const setTxt = (id, v)=>{
    const el = document.getElementById(id);
    if(el && v != null) el.textContent = v;
  };
  setTxt('timer-h40',  data.timer_h40);
  setTxt('timer-h15',  data.timer_h15);
  setTxt('timer-h8',   data.timer_h8);
  setTxt('timer-eobt', data.timer_tobt);
  setTxt('timer-cd',   data.timer_cd);
  setTxt('timer-ctot', data.timer_ctot);

  // ✅ re-sync modes globaux (UI + variables)
  const storedDark = (localStorage.getItem('modeDark') || '0') === '1';
  const storedUTC  = (localStorage.getItem('modeUTC')  || '0') === '1';
  setDarkMode(storedDark, true);
  setTimeModeUTC(storedUTC, true);

  // ✅ remettre les verrous cohérents après restauration
  syncAdultGenderLocks();
  updateFinalTOB();

  updateAllCalculations();
  updateHeaderOffset();
  updateInfoStrip();
  updateFinalLoadLayout();
  updateFinalPlaceholdersFRRK();

  // ✅ Restaurer l'onglet de timing (Arrivée / Départ)
  if(data.timingPanel) {
    switchTimingPanel(data.timingPanel);
  }

  // ✅ Restaurer l'état du modal LOAD
  if(data.ldmOpen === '1' && data.ldmMode) {
    openLDM(data.ldmMode);
  } else {
    // Fermer silencieusement sans déclencher saveCurrentTabData
    const b = document.getElementById('ldmBackdrop');
    const m = document.getElementById('ldmModal');
    if(m) m.style.display = 'none';
    if(b) b.style.display = 'none';
    unlockScroll?.();
  }
}
  
function updateTabLabelInstant(){ saveCurrentTabData(); renderTabs(); }

/* TIMING FIELDS – ARR / DEP (responsive pro) */
function generateTimingFields(){
  const container = document.getElementById('timing-grid');
  if(!container) return;

  const colorDot = {
    'is-link':     '#3273dc',
    'is-success':  '#15803d',
    'is-warning':  '#d97706',
    'is-dark':     '#636363',
    'is-bordeaux': '#7f1d1d',
    'is-purple':   '#7c3aed',
    'is-jaune':    '#f5c400',
    'is-red':      '#ef4444',
    'is-pink':     '#ec4899',
  };
  const fieldHTML = (id,label,full=false,optional=false,nowColor='is-link')=>`
    <div class="${full ? 'span-12' : 'span-6'}">
      <div class="field${optional ? ' field-optional' : ''}">
        <label class="label"><span class="tw-dot" style="background:${colorDot[nowColor]||'#3273dc'}"></span>${label}</label>
        <div class="control">
          <div class="time-wrap" data-id="${id}">
            <input type="time" id="${id}" class="tw-hidden-input" onchange="updateAllCalculations(); twSync('${id}')">
            <div class="input tw-display" id="tw-disp-${id}">--:--</div>
            <div class="tw-zone tw-zone-left"  data-action="minus">−1</div>
            <div class="tw-zone tw-zone-center" data-action="now"></div>
            <div class="tw-zone tw-zone-right" data-action="plus">+1</div>
          </div>
        </div>
      </div>
    </div>`;

  const cie    = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const isFRRK = cie === 'FR' || cie === 'RK';

  /* ===== ARRIVÉE ===== */
  const arrNoHeader = `
    <div class="card mb-4">
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-6">${fieldHTML('PremierDebarque','1er débarqué (L1)')}</div>
          <div class="span-6">${fieldHTML('PremierDebarqueL2','1er débarqué (L2)')}</div>
          <div class="span-6">${fieldHTML('ArriveeFuel','Arrivée Avitair',true,false,'is-warning')}</div>
          <div class="span-6">${fieldHTML('DernierDebarque','Dernier débarqué')}</div>
          <div class="span-6">${fieldHTML('ArriveeLiftArr','Arrivée lift',false,false,'is-success')}</div>
          <div class="span-6">${fieldHTML('DepartLiftArr','Départ lift',false,false,'is-success')}</div>
        </div>
      </div>
    </div>`;

  /* ===== DÉPART ===== */
  const depNoHeader = `
    <div class="buttons mb-4" style="justify-content:center;gap:.5rem;">
      <button class="button is-rounded is-light dep-extra-btn" id="btn-crew" type="button" onclick="toggleDepExtra('crew')" style="font-weight:700;">Crew</button>
      <button class="button is-rounded is-light dep-extra-btn" id="btn-recherche-bag" type="button" onclick="toggleDepExtra('recherche-bag')" style="font-weight:700;">Recherche bag</button>
      <button class="button is-rounded is-light dep-extra-btn" id="btn-inad" type="button" onclick="toggleDepExtra('inad')" style="font-weight:700;">INAD</button>
      <button class="button is-rounded is-light dep-extra-btn" id="btn-gpu" type="button" onclick="toggleDepExtra('gpu')" style="font-weight:700;">Nayak</button>
    </div>

    <!-- Panneau Crew -->
    <div id="panel-crew" class="card mb-3" style="display:none;">
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-6">${fieldHTML('ArrPNT','Arrivée PNT',false,true,'is-dark')}</div>
          <div class="span-6">${fieldHTML('ArrPNC','Arrivée PNC',false,true,'is-dark')}</div>
        </div>
      </div>
    </div>

    <!-- Panneau Recherche bag -->
    <div id="panel-recherche-bag" class="card mb-3" style="display:none;">
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-4">
            <div class="field">
              <label class="label"><span class="tw-dot" style="background:#ec4899;"></span>Nombre de bags</label>
              <div class="control">
                <input class="input" type="number" id="RechercheBagNombre" min="0" placeholder="0" style="text-align:center;" oninput="twSync('RechercheBagNombre')">
              </div>
            </div>
          </div>
          <div class="span-4">${fieldHTML('RechercheBagDebut','Début de recherche',false,false,'is-pink')}</div>
          <div class="span-4">${fieldHTML('RechercheBagFin','Fin de recherche',false,false,'is-pink')}</div>
        </div>
      </div>
    </div>

    <!-- Panneau INAD -->
    <div id="panel-inad" class="card mb-3" style="display:none;">
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-6">${fieldHTML('AnnonceINAD','Annonce INAD',false,true,'is-red')}</div>
          <div class="span-6">${fieldHTML('ArriveeINAD','Arrivée INAD',false,true,'is-red')}</div>
        </div>
      </div>
    </div>

    <!-- Panneau GPU -->
    <div id="panel-gpu" class="card mb-3" style="display:none;">
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-4">${fieldHTML('AppelNayak','Appel Nayak',false,false,'is-jaune')}</div>
          <div class="span-4">${fieldHTML('ArriveeNayak','Arrivée Nayak',false,false,'is-jaune')}</div>
          <div class="span-4">${fieldHTML('DepartNayak','Départ Nayak',false,false,'is-jaune')}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-6">${fieldHTML('AvionPremierEmbarque','Premier embarqué')}</div>
          <div class="span-6">${fieldHTML('AvionDernierEmbarque','Dernier embarqué')}</div>
          <div class="span-6">${fieldHTML('ArriveeLift','Arrivée lift',false,false,'is-success')}</div>
          <div class="span-6">${fieldHTML('DepartLift','Départ lift',false,false,'is-success')}</div>
          <div class="span-6">${fieldHTML('DepartFuel','Départ Avitair',false,false,'is-warning')}</div>
          <div class="span-6">${fieldHTML('RemiseLID', 'Remise LDS/LDF')}</div>
          <div class="span-6">${fieldHTML('FermeturePorteAvion','Fermeture porte avion',false,false,'is-bordeaux')}</div>
          <div class="span-6">${fieldHTML('ConnexionAgentCasque','Connexion casque',false,false,'is-purple')}</div>
        </div>
      </div>
    </div>`;

  const toggle = `
    <div class="tabs is-toggle is-toggle-rounded is-centered mb-4">
      <ul>
        <li id="seg-arr-li"><a onclick="switchTimingPanel('arr')"><span>Arrivée</span></a></li>
        <li id="seg-dep-li"><a onclick="switchTimingPanel('dep')"><span>Départ</span></a></li>
      </ul>
    </div>`;

  container.innerHTML =
    toggle +
    `<div id="panel-arr" style="display:none;">${arrNoHeader}</div>` +
    `<div id="panel-dep" style="display:none;">${depNoHeader}</div>`;

  const from = (document.getElementById('From')?.value || '').toUpperCase().trim();
  const defaultPanel = (from === 'BVA') ? 'dep' : 'arr';
  switchTimingPanel(defaultPanel);
  // Si FROM = BVA, ouvrir d'office le panneau Crew
  if(from === 'BVA') autoOpenCrewIfBVA();
}

function switchTimingPanel(mode){
  const arrPanel=document.getElementById('panel-arr');
  const depPanel=document.getElementById('panel-dep');
  const liArr=document.getElementById('seg-arr-li');
  const liDep=document.getElementById('seg-dep-li');

  if(arrPanel) arrPanel.style.display = (mode==='arr') ? '' : 'none';
  if(depPanel) depPanel.style.display = (mode==='dep') ? '' : 'none';

  if(liArr) liArr.classList.toggle('is-active', mode==='arr');
  if(liDep) liDep.classList.toggle('is-active', mode!=='arr');

  localStorage.setItem('timingPanel', mode);
}



/* LID visible FR/RK */
function updateLIDVisibility(){
  const cie    = (document.getElementById('Cie').value||'').toUpperCase();
  const isFRRK = cie === 'FR' || cie === 'RK';
  const isW4W6 = cie === 'W4' || cie === 'W6';

  // Badge eLID (FR/RK)
  const lid = document.getElementById('lidBlock');
  if(lid){
    lid.style.display = isFRRK ? '' : 'none';
    const lidLabel = lid.querySelector('.k');
    if(lidLabel){
      lidLabel.setAttribute('style','text-transform:none !important');
      lidLabel.textContent = 'eLID';
    }
  }

  // Badge LDS (W4/W6)
  const ldsBlock = document.getElementById('ldsBlock');
  if(ldsBlock) ldsBlock.style.display = isW4W6 ? '' : 'none';

  // Label champ Remise
  const remiseInput = document.getElementById('RemiseLID');
  const remiseLabel = remiseInput?.closest('.field')?.querySelector('.label');
  if(remiseLabel){
    const dot = remiseLabel.querySelector('.tw-dot');
    remiseLabel.textContent = '';
    if(dot) remiseLabel.appendChild(dot);
    if(isFRRK){
      remiseLabel.removeAttribute('style');
      remiseLabel.append('Remise ');
      const span = document.createElement('span');
      span.style.cssText = 'text-transform:none';
      span.textContent = 'eLID/LID';
      remiseLabel.append(span);
    } else {
      remiseLabel.removeAttribute('style');
      remiseLabel.append('Remise LDS/LDF');
    }
  }

  updateHeaderOffset();
}

/* ===== Auto-switch vers onglet DÉPART après Dernier débarqué ===== */
let _autoSwitchDepTimer = null;

function checkAutoSwitchToDep(){
  // Ne switche que si on est actuellement sur l'onglet ARR
  const liArr = document.getElementById('seg-arr-li');
  if(!liArr || !liArr.classList.contains('is-active')) return;

  const dernierDeb = (document.getElementById('DernierDebarque')?.value || '').trim();
  const arriveeift = (document.getElementById('ArriveeLiftArr')?.value  || '').trim();
  const departLift = (document.getElementById('DepartLiftArr')?.value   || '').trim();

  // Condition de switch : DernierDebarque rempli
  if(!dernierDeb){ clearTimeout(_autoSwitchDepTimer); _autoSwitchDepTimer = null; return; }

  // Ne switch pas si ArriveeLift rempli mais DepartLift vide
  if(arriveeift && !departLift){ clearTimeout(_autoSwitchDepTimer); _autoSwitchDepTimer = null; return; }

  // Switch après 3s (debounce)
  clearTimeout(_autoSwitchDepTimer);
  _autoSwitchDepTimer = setTimeout(() => {
    _autoSwitchDepTimer = null;
    // Re-vérifier les conditions au moment du switch
    const dd  = (document.getElementById('DernierDebarque')?.value  || '').trim();
    const al  = (document.getElementById('ArriveeLiftArr')?.value   || '').trim();
    const dl  = (document.getElementById('DepartLiftArr')?.value    || '').trim();
    if(dd && !(al && !dl)) switchTimingPanel('dep');
  }, 3000);
}

/* CALCULS */
function updateAllCalculations() {
  setTimeout(updateIVBadges, 0);
  updateTimers();
  updateSOBTDefault();
  updateEOBT();
  updateDLCode();
  redistributeDL();
  updateLID();
  updateLDS();
  updateLIDVisibility();
  updateDelayCodesVisibility();

  updateHBagsValidity('arr');
  updateHBagsValidity('final');

  updateArrExpWeightIfNeeded();
  updateFinalWeightIfNeeded();

  ensureCountdownRunning();
  renderTimeline();
  updateHeaderOffset();

  updateInfoStrip();
  updateDelayBands();
  updateDlTotalBadge();

  // Auto-switch vers onglet DÉPART si conditions remplies
  checkAutoSwitchToDep();

  // Réapplique le rouge sur les champs en dépassement
  setTimeout(revalidateDangerFields, 0);
}

/* Bandeaux de retard sur AIBT et AOBT */
function updateDelayBands(){
  const pairs = [
    { actual: 'AIBT', planned: 'SIBT', wrap: 'tw-disp-AIBT' },
    { actual: 'AOBT', planned: 'EOBT', wrap: 'tw-disp-AOBT' }
  ];

  pairs.forEach(({ actual, planned, wrap }) => {
    const disp = document.getElementById(wrap);
    if(!disp) return;
    const timeWrap = disp.closest('.time-wrap');
    if(!timeWrap) return;

    disp.style.boxShadow = '';

    const aVal = document.getElementById(actual)?.value || '';
    // Pour EOBT : lire la valeur calculée (timer-eobt div) si planned='EOBT'
    let pVal = '';
    if(planned === 'EOBT'){
      const eobtDiv = document.getElementById('timer-eobt');
      pVal = (eobtDiv?.textContent || '').trim();
      if(pVal === '--:--' || pVal === '') pVal = '';
    } else {
      pVal = document.getElementById(planned)?.value || '';
    }

    if(!aVal || !pVal) return;

    const toMins = val => {
      if(!val) return null;
      if(val.includes('T') || (val.endsWith('Z') && val.length > 10)){
        try{
          const d = new Date(val);
          if(!isNaN(d.getTime())) return d.getHours()*60 + d.getMinutes();
        }catch(e){}
      }
      const [h, m] = val.split(':').map(Number);
      return isNaN(h) ? null : h * 60 + m;
    };

    let diff = (toMins(aVal) ?? 0) - (toMins(pVal) ?? 0);
    if(diff > 720)  diff -= 1440;
    if(diff < -720) diff += 1440;

    let color;
    if     (diff <   0)  color = '#3b82f6';  // bleu  : en avance
    else if(diff === 0)  color = '#16a34a';  // vert  : à l'heure pile
    else if(diff <  15)  color = '#f97316';  // orange: +1 → +14 min
    else                 color = '#ef4444';  // rouge : +15 min et plus

    disp.style.boxShadow = `inset 5px 0 0 ${color}, inset -5px 0 0 ${color}`;
  });
}

/* TIMERS HLE/H-15 */
function updateTimers() {
  const sobt = document.getElementById('SOBT')?.value || '';
  if (!sobt) {
    ['timer-h40', 'timer-h15', 'timer-h8'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.textContent = '--:--';
    });
    return;
  }
  const [hh, mm] = sobt.split(':').map(Number);
  const base = new Date(); base.setHours(hh, mm, 0, 0);
  const h40 = new Date(base.getTime() - 40 * 60000);
  const h15 = new Date(base.getTime() - 15 * 60000);
  document.getElementById('timer-h40').textContent = `${String(h40.getHours()).padStart(2, '0')}:${String(h40.getMinutes()).padStart(2, '0')}`;
  document.getElementById('timer-h15').textContent = `${String(h15.getHours()).padStart(2, '0')}:${String(h15.getMinutes()).padStart(2, '0')}`;
}

/* LID = EOBT - 8 */
function updateLID() {
  const tobtRawMins = window._eobtRawMins;
  const el = document.getElementById('timer-h8');
  if (!el) return;
  if (tobtRawMins == null) { el.textContent = "--:--"; return; }
  el.textContent = fmtHHMM(tobtRawMins - 8);
}

/* LDS = EOBT - 7 (A320/A20N) ou EOBT - 9 (A321/A21N) */
function updateLDS() {
  const el = document.getElementById('timer-lds');
  if(!el) return;
  const tobtRawMins = window._eobtRawMins;
  if(tobtRawMins == null){ el.textContent = '--:--'; return; }
  const typeAvion = (document.getElementById('TypeAvion')?.value || '').toUpperCase();
  const isA321   = typeAvion.includes('321') || typeAvion.includes('21N');
  el.textContent = fmtHHMM(tobtRawMins - (isA321 ? 9 : 7));
}

function updateSOBTDefault() {
  const sobtEl = document.getElementById('SOBT');
  if(!sobtEl) return;

  // Si SOBT déjà remplie (ex : import Keeper), on ne touche pas
  if ((sobtEl.value || '').trim() !== '') return;

  const cie = (document.getElementById('Cie').value||'').toUpperCase();

  // FR / RK : SOBT vient de Keeper
  if(cie === "FR" || cie === "RK"){
    return;
  }

  const sibt = document.getElementById('SIBT')?.value || '';
  const arrPNT = document.getElementById('ArrPNT')?.value || '';
  const arrPNC = document.getElementById('ArrPNC')?.value || '';
  if (!sibt) return;
  if (!(cie === "W4" || cie === "W6")) return;

  let [sH, sM] = sibt.split(':').map(Number);
  const base = new Date(); base.setHours(sH, sM);

  const add = (document.getElementById('TypeAvion')?.value === 'A321') ? 35 : 30;
  const sobtCalc = new Date(base.getTime() + add * 60000);

  sobtEl.value =
    `${String(sobtCalc.getHours()).padStart(2,'0')}:${String(sobtCalc.getMinutes()).padStart(2,'0')}`;
}

/* EOBT + règle CTOT */
function updateEOBT() {
  const cie = (document.getElementById('Cie')?.value || '').toUpperCase();
  const from = (document.getElementById('From')?.value || '').toUpperCase().trim();
  const isBVA = (from === 'BVA');

  const sibttxt = document.getElementById('SIBT')?.value || '';
  const aibttxt = document.getElementById('AIBT')?.value || '';
  const sobttxt = document.getElementById('SOBT')?.value || '';
  const ctottxt = document.getElementById('CTOT')?.value || '';

  const outEl = document.getElementById('timer-eobt');

  // ✅ BVA: on n'exige pas SIBT/AIBT (avion déjà là) → on utilise SOBT comme "source"
  if (!cie || !sobttxt || !outEl || (!sibttxt && !isBVA)) {
    if(outEl) outEl.textContent = '--:--';
    window._eobtRawMins = null;
    window._eobtAdjMins = null;
    return;
  }

  const SIBT = parseHHMM(isBVA ? sobttxt : sibttxt);
  const SOBT = parseHHMM(sobttxt);
  if (SIBT == null || SOBT == null) {
    outEl.textContent = '--:--';
    window._eobtRawMins = null;
    window._eobtAdjMins = null;
    return;
  }

  // ✅ BVA: AIBT forcé = SOBT
  const AIBT = isBVA ? SOBT : (aibttxt ? parseHHMM(aibttxt) : SIBT);
  if (AIBT == null) {
    outEl.textContent = '--:--';
    window._eobtRawMins = null;
    window._eobtAdjMins = null;
    return;
  }

  // diff signé (minutes), robuste minuit : résultat dans [-720..+720]
  const diffSigned = (t, ref) => {
    let d = t - ref;
    if (d > 720) d -= 1440;
    if (d < -720) d += 1440;
    return d;
  };

  // Temps "étendus" ancrés sur SIBT (comparaisons correctes même au passage minuit)
  const SIBT_ext = SIBT;
  const AIBT_ext = SIBT_ext + diffSigned(AIBT, SIBT);
  const SOBT_ext = SIBT_ext + diffSigned(SOBT, SIBT);

  const crewChange = !!(
    (document.getElementById('ArrPNT')?.value || '').trim() ||
    (document.getElementById('ArrPNC')?.value || '').trim()
  );

  const isDelayed = (AIBT_ext > SIBT_ext);

  let EOBT_raw_ext = null;

  // ===== RÈGLE COMMUNE : si AIBT <= SIBT => EOBT = SOBT
  if (!isDelayed) {
    EOBT_raw_ext = SOBT_ext;
  } else {
    // ===== FR / RK : EOBT = max(SOBT, AIBT + turn)
    if (cie === 'FR' || cie === 'RK') {
      const turn = crewChange ? 35 : 25;
      const candidate = AIBT_ext + turn;
      EOBT_raw_ext = (candidate <= SOBT_ext) ? SOBT_ext : candidate;
    }

    // ===== W4 / W6 : EOBT = max(SOBT, AIBT + 30/35 selon type) ✅ FIX
    else if (cie === 'W4' || cie === 'W6') {
      const type = (document.getElementById('TypeAvion')?.value || '').toUpperCase();
      const turn = (type === 'A321' || type === 'A21N' || type === 'A21NY') ? 35 : 30;

      const candidate = AIBT_ext + turn;
      EOBT_raw_ext = (candidate <= SOBT_ext) ? SOBT_ext : candidate;
    }

    // ===== H4 / U5 / H6 / AUTRE : EOBT = AIBT + (SOBT - SIBT)
    else {
      const rot = SOBT_ext - SIBT_ext;
      EOBT_raw_ext = AIBT_ext + rot;
    }
  }

  // Raw minutes 0..1439
  let EOBT_raw = ((EOBT_raw_ext % 1440) + 1440) % 1440;
  window._eobtRawMins = EOBT_raw;

  // EOBT brut — pas de règle CTOT
  let EOBT_adj = EOBT_raw;
  window._eobtAdjMins = EOBT_adj;

  outEl.textContent = fmtHHMM(EOBT_adj);
}

/* ===== DL (LOGIQUE PROPRE) ===== */

let dlTouched1 = false;
let dlTouched2 = false;
let dlTouched3 = false;
let dlRecency  = [];   // ordre d'édition des DL durée (le + récent en dernier)

// Si tu veux reset propre (ex: changement de vol/tab), tu peux l'appeler
function resetDLTouches(){
  dlTouched1 = dlTouched2 = dlTouched3 = false;
  dlRecency = [];
}

/* DL CODES */
function updateDLCode() {
  const cie = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const code93 = (cie === 'W4' || cie === 'W6') ? '93A' : '93';

  const c1 = document.getElementById('DLcode1');
  const d1 = document.getElementById('DLduree1');
  if(!c1 || !d1) return;

  const sobt = parseHHMM(document.getElementById('SOBT')?.value || '');
  const aobt = parseHHMM(document.getElementById('AOBT')?.value || '');

  // ✅ IMPORTANT: 93/93A doit utiliser la EOBT BRUTE (hors CTOT)
  const tobt = (window._eobtRawMins != null)
    ? window._eobtRawMins
    : parseHHMM((document.getElementById('timer-eobt')?.textContent || '').trim());

  // si incomplet : on ne force rien
  if(sobt == null || aobt == null || tobt == null) return;

  // total retard
  let total = aobt - sobt;
  if(total < 0) total += 1440;

  // 93/93A = EOBT - SOBT (borné)
  let fixed = tobt - sobt;
  if(fixed < 0) fixed += 1440;
  fixed = Math.max(0, Math.min(fixed, total));

  const v1 = (c1.value || '').toUpperCase().trim();
  const had93 = (v1 === '93' || v1 === '93A');
  const want93 = fixed > 0;

  // si on passe de "pas de 93" -> "93", on reset le split restant
  if(!had93 && want93){
    dlTouched2 = false;
    dlTouched3 = false;
  }

  if(want93){
    c1.value = code93;
    d1.value = String(fixed);
  }else{
    // pas de 93 => si c'était 93, on libère
    if(had93){
      c1.value = '';
      d1.value = '';
      dlTouched1 = false;
      dlTouched2 = false;
      dlTouched3 = false;
      dlRecency = [];
    }
  }

  updateDLHourHints();
}

/* DL redistribution */
function dldChanged(index){
  lastDLChanged = index;

  // Récence : on place le champ édité en tête de priorité
  dlRecency = dlRecency.filter(i => i !== index);
  dlRecency.push(index);

  // Toute interaction (valeur, "0" ou champ vidé) rend ce champ "maître".
  //   - AVEC 93/93A : seuls DL2/DL3 sont en vases communicants (DL1 = le 93).
  //   - SANS 93/93A : les 3 DL durée sont en vases communicants.
  if(index === 1)      dlTouched1 = true;
  else if(index === 2) dlTouched2 = true;
  else if(index === 3) dlTouched3 = true;

  redistributeDL();
}

function totalDelayMinutes(){
  const so = document.getElementById('SOBT')?.value || '';
  const ao = document.getElementById('AOBT')?.value || '';
  if(!so || !ao) return null;

  const s = parseHHMM(so);
  const a = parseHHMM(ao);
  if(s==null || a==null) return null;

  // diff signé robuste (gère minuit)
  let d = a - s;
  if(d < -720) d += 1440;   // ex: 00:05 - 23:55 = -1430 => +10
  if(d >  720) d -= 1440;

  // si avance => pas de retard
  return Math.max(0, d);
}

/* Pastilles retard total (AOBT−SOBT) + turnaround (AOBT−AIBT) */
function updateDlTotalBadge(){
  const row    = document.getElementById('dlBadgesRow');
  const badge  = document.getElementById('dlTotalBadge');
  const valEl  = document.getElementById('dlTotalBadgeValue');
  const turn   = document.getElementById('dlTurnBadge');
  const turnEl = document.getElementById('dlTurnBadgeValue');
  if(!row || !badge || !valEl || !turn || !turnEl) return;

  const aobtTxt = document.getElementById('AOBT')?.value || '';
  const sobtTxt = document.getElementById('SOBT')?.value || '';
  const aibtTxt = document.getElementById('AIBT')?.value || '';

  const aobt = parseHHMM(aobtTxt);
  const sobt = parseHHMM(sobtTxt);
  const aibt = parseHHMM(aibtTxt);

  const hasDelay = aobt != null && sobt != null;
  const hasTurn  = aobt != null && aibt != null;

  row.style.display = (hasDelay || hasTurn) ? 'flex' : 'none';

  // — Pastille retard AOBT − SOBT —
  if(hasDelay){
    let diff = aobt - sobt;
    if(diff < -720) diff += 1440;
    if(diff >  720) diff -= 1440;
    if(diff <= 0){
      badge.classList.add('no-delay');
      valEl.textContent = '0 min';
    } else {
      badge.classList.remove('no-delay');
      valEl.textContent = `+${diff} min`;
    }
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }

  // — Pastille turnaround AOBT − AIBT —
  if(hasTurn){
    let diff = aobt - aibt;
    if(diff < -720) diff += 1440;
    if(diff >  720) diff -= 1440;
    turnEl.textContent = `${Math.abs(diff)} min`;
    turn.style.display = 'flex';
  } else {
    turn.style.display = 'none';
  }
}

function redistributeDL(){
  const total = totalDelayMinutes();
  if(total == null){ clearDLBorders(); updateDLHourHints(); return; }

  const c1 = document.getElementById('DLcode1');
  const c2 = document.getElementById('DLcode2');
  const c3 = document.getElementById('DLcode3');
  const f1 = document.getElementById('DLduree1');
  const f2 = document.getElementById('DLduree2');
  const f3 = document.getElementById('DLduree3');
  if(!c1||!f1||!f2||!f3) return;

  const v1 = (c1.value||'').toUpperCase().trim();
  const has93 = (v1==='93'||v1==='93A');
  const clamp = (x,mn,mx)=>Math.max(mn,Math.min(mx,x));

  let d1=0, d2=0, d3=0;

  // Vases communicants DL2 ↔ DL3 : le champ qu'on vient d'éditer est "maître"
  // (borné au reste disponible), l'autre absorbe automatiquement le reliquat.
  // → modifier DL2 ajuste DL3, modifier DL3 ajuste DL2, et inversement.
  const splitRemain = (remain)=>{
    const anyTouched = dlTouched2 || dlTouched3;
    if(!anyTouched){
      // Rien de touché → tout le reste en DL2 (défaut)
      return [remain, 0];
    }
    if(lastDLChanged === 3){
      // DL3 dernier édité (valeur, 0 ou vidé) → DL3 maître, DL2 absorbe
      const x3 = clamp(parseInt(f3.value)||0, 0, remain);
      return [remain - x3, x3];
    }
    // DL2 dernier édité (ou recalcul auto) → DL2 maître, DL3 absorbe
    const x2 = clamp(parseInt(f2.value)||0, 0, remain);
    return [x2, remain - x2];
  };

  if(has93){
    // ── AVEC 93/93A en DL1 ──────────────────────────────────────────────
    d1 = clamp(parseInt(f1.value)||0, 0, total);
    [d2, d3] = splitRemain(Math.max(0, total - d1));

  } else {
    // ── SANS 93/93A : vases communicants sur les 3 (DL1 ↔ DL2 ↔ DL3) ─────
    if(!dlTouched1 && !dlTouched2 && !dlTouched3){
      // Rien touché → tout en DL1
      d1 = total; d2 = 0; d3 = 0;
    } else {
      const touched = [];
      if(dlTouched1) touched.push(1);
      if(dlTouched2) touched.push(2);
      if(dlTouched3) touched.push(3);

      // Champs touchés triés du plus récent au plus ancien
      const byRecency = touched.slice().sort((a,b)=> dlRecency.indexOf(b) - dlRecency.indexOf(a));
      const untouched = [1,2,3].filter(i => !touched.includes(i));

      // L'absorbeur (servi en dernier) = 1er champ non touché (plus petit index),
      // sinon le champ touché le plus ancien.
      const priority = untouched.length ? byRecency.concat([untouched[0]]) : byRecency;

      const fmap = { 1:f1, 2:f2, 3:f3 };
      const res  = { 1:0, 2:0, 3:0 };
      let budget = total;
      for(let k=0; k<priority.length; k++){
        const idx = priority[k];
        if(k === priority.length - 1){
          res[idx] = budget;                 // dernier = absorbe le reliquat
        } else {
          const t = clamp(parseInt(fmap[idx].value)||0, 0, budget);
          res[idx] = t; budget -= t;
        }
      }
      d1 = res[1]; d2 = res[2]; d3 = res[3];
    }
  }

  f1.value = d1 || '';
  f2.value = d2 || '';
  f3.value = d3 || '';

  const sum = d1 + d2 + d3;
  if(sum !== total) markLastFilledDLError();
  else clearDLBorders();

  updateDLHourHints();
}

function markLastFilledDLError(){
  clearDLBorders();
  const f1 = document.getElementById('DLduree1');
  const f2 = document.getElementById('DLduree2');
  const f3 = document.getElementById('DLduree3');
  const d1 = parseInt(f1.value)||0;
  const d2 = parseInt(f2.value)||0;
  const d3 = parseInt(f3.value)||0;
  if(d3 > 0) f3.classList.add('dl-error');
  else if(d2 > 0) f2.classList.add('dl-error');
  else if(d1 > 0) f1.classList.add('dl-error');
}

function clearDLBorders(){
  ['DLduree1','DLduree2','DLduree3'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.classList.remove('dl-error');
  });
}

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

  const starts = [H40, SIBT, AIBT].filter(v => v != null);
  const ends = [SOBT, AOBT, EOBT, CTOT, ...(allTimes || [])].filter(v => v != null);

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
  // Gère minuit : si b < a, b est le lendemain
  let bAdj = b;
  if(bAdj < a) bAdj += 1440;
  return [a, bAdj];
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
  ];
  singles.forEach(([id,label])=>{
    const t = parseHHMM(document.getElementById(id)?.value || '');
    if(t!=null) fixedPoints.push({label, t, cls:'tl--std'});
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
  const showCabinRelease =
    !!cabinPair &&
    !hasArrCrew &&
    (turnMin != null && turnMin <= 35);

  const rows = [
    {label:'Débarquement', pair:getPairWindow('PremierDebarque','DernierDebarque'), cls:'tl--turn', color:null},

    ...(showCabinRelease
      ? [{label:'Cabin release', pair:cabinPair, cls:'tl--std', color:null}]
      : []),

    {label:'Embarquement', pair:getPairWindow('AvionPremierEmbarque','AvionDernierEmbarque'), cls:'tl--ops',  color:null},
    {label:'Avitair',      pair:getPairWindow('ArriveeFuel','DepartFuel'), cls:'tl--std', color:'#f59e0b'},
    {label:'Lift (Arr)',   pair:getPairWindow('ArriveeLiftArr','DepartLiftArr'), cls:'tl--std', color:'#a855f7'},
    {label:'Lift (Dep)',   pair:getPairWindow('ArriveeLift','DepartLift'), cls:'tl--std', color:'#16a34a'},
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
  const LABEL_W    = 108;
  const LEFT_PAD   = 24;
  const MIN_PPM    = 9;
  const viewport   = scroller.clientWidth || 360;
  const minTrackW  = Math.round(total * MIN_PPM);
  const trackW     = Math.max(Math.round(viewport * timelineZoom), minTrackW);
  canvas.style.width = (trackW + LEFT_PAD) + 'px';

  const PPM        = trackW / total;
  const AXIS_H     = 42;
  const ROW_H      = 52;
  const BAR_H      = 34;
  const BAR_PAD    = (ROW_H - BAR_H) / 2;
  const CONTENT_TOP = AXIS_H;

  const toPx = t => LEFT_PAD + ((toExtended(t, min, max) - min) / total) * trackW;

  // ── Tick adaptatif ────────────────────────────────────────────
  const tickStep = [2,5,10,15,20,30].find(s => s * PPM >= 42) || 30;

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
  // Cibles affichées dès que EOBT+AIBT sont renseignés, pour toutes les compagnies
  const hasTargets = true;

  const from        = (document.getElementById('From')?.value || '').toUpperCase().trim();
  const fromBVA     = from === 'BVA';

  const crewChange = !!( (document.getElementById('ArrPNT')?.value||'').trim() ||
                         (document.getElementById('ArrPNC')?.value||'').trim() );
  const BASE = (isFRRK && crewChange) ? 10 : 0;

  // Remise LID (FR/RK) : depend du toggle eLID / Paper LID du LOAD FINAL
  //   eLID      -> EOBT - 5, libelle "Remise eLID"
  //   Paper LID -> EOBT - 8, libelle "Remise LID"
  const elidMode  = isFRRK && (typeof isELID === 'function') && isELID();
  const lidOffset = elidMode ? -5 : -8;
  const lidLabel  = elidMode ? 'Remise eLID' : 'Remise LID';

  const TARGETS_FRRK_BASE = {
    'Débarquement':        { ref:'EOBT', fromRef:'AIBT', from:  2, to:-13, fromField:null,              toOffset:null, label:null              },
    'Cabin release':       { ref:'EOBT', from:-13, to:-10, fromField:'DernierDebarque', toOffset:3,    label:'Cabin tidy'      },
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
    'Embarquement': { ref:'EOBT', from:-35, to:-15, fromField:null, toOffset:null, label:null },
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

  const FRRK_TARGETS = isFRRK ? TARGETS_FRRK : isW4W6 ? TARGETS_W4W6 : {};
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

  const ORDER = ['Débarquement','Cabin release','Avitair','Lift (Arr)','Embarquement','Lift (Dep)',
                 'ArrPNT','ArrPNC','RemiseLID','FermeturePorteAvion','ConnexionCasque','ArriveeINAD','ArriveeNayak'];

  // Ces 5 lignes s'affichent toujours avec leurs cibles, même sans données saisies
  const ALWAYS_SHOW = new Set(['Débarquement','Cabin release','Embarquement','RemiseLID','FermeturePorteAvion']);

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
    cell.className = 'tl-lc-cell' + (i % 2 ? ' alt' : '');
    cell.style.height = ROW_H + 'px';

    const name = document.createElement('span');
    name.textContent = d.displayLabel || d.label;
    name.style.cssText = 'font-size:11px; font-weight:700; line-height:1;';
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
          badge.textContent = onTime ? '✓ On time' : '✗ Late';
          badge.style.cssText = `font-size:9px;font-weight:800;letter-spacing:.03em;color:${onTime ? '#16a34a' : '#dc2626'};`;
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
  for(let t = Math.ceil(min); t <= max; t++){
    const x = toPx(t);
    const line = document.createElement('div');
    const isMajor  = t % tickStep === 0;
    const isMedium = !isMajor && t % 5 === 0;
    line.className = 'tl-vgrid' + (isMajor ? ' major' : isMedium ? ' medium' : '');
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
    if(i % 2) row.style.background = 'rgba(0,0,0,.03)';

    const track = document.createElement('div');
    track.className = 'tl-row-track';

    // ── 1. Barre cible en pointillé (toujours si cible définie, même sans données) ─
    if(hasTarget && targetFrom !== null && !POINT_EVENTS.has(d.label)){
      // Début de la cible : targetFrom (AIBT+offset)
      const targetL = toPx(targetStartExt);
      const targetW = Math.max(4, toPx(deadlineExt) - targetL);
      const dashColor = '#94a3b8';

      const tBar = document.createElement('div');
      tBar.style.cssText = [
        `position:absolute`,
        `left:${targetL}px`, `width:${targetW}px`,
        `height:${BAR_H}px`, `top:${BAR_PAD}px`,
        `border-radius:8px`,
        `border:2px dashed ${dashColor}`,
        `background:color-mix(in srgb, ${dashColor} 5%, transparent)`,
        `box-sizing:border-box`,
        `opacity:${deadlinePassed ? '0.6' : '0.4'}`,
      ].join(';');
      track.appendChild(tBar);
    }

    // ── 1b. Cercle cible gris pour events ponctuels sans données ─
    if(hasTarget && d.a === null && POINT_EVENTS.has(d.label) && targetTo !== null){
      const cx  = toPx(toExtended(targetTo, min, max));
      const cy  = ROW_H / 2;
      const R   = 10;
      const dot = document.createElement('div');
      dot.style.cssText = [
        `position:absolute`,
        `left:${cx - R}px`, `top:${cy - R}px`,
        `width:${R*2}px`, `height:${R*2}px`,
        `border-radius:50%`,
        `border:2px dashed #94a3b8`,
        `background:transparent`,
        `box-sizing:border-box`,
        `opacity:0.5`,
      ].join(';');
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
        const R  = 10;
        const onTime = hasTarget ? (aExt <= deadlineExt) : true;
        const circleColor = hasTarget ? (onTime ? '#16a34a' : '#dc2626') : '#64748b';
        const dot = document.createElement('div');
        dot.style.cssText = [
          `position:absolute`,
          `left:${cx - R}px`, `top:${cy - R}px`,
          `width:${R*2}px`, `height:${R*2}px`,
          `border-radius:50%`,
          `border:2.5px solid ${circleColor}`,
          `background:transparent`,
          `box-sizing:border-box`,
        ].join(';');
        track.appendChild(dot);
      } else {
        // Fin : d.b si complété, sinon NOW plafonné à deadline+15min
        let endExt;
        if(d.status === 'complete'){
          endExt = toExtended(d.b, min, max);
        } else if(hasTarget && deadlineExt !== null && nowExt > deadlineExt + 15){
          endExt = deadlineExt + 15; // plafond pour éviter barre infinie
        } else {
          endExt = nowExt;
        }

        const barL = toPx(aExt);
        const barW = Math.max(4, toPx(Math.max(aExt, endExt)) - barL);

        // Couleur : vert si dans les temps, rouge si dépassé
        let fillColor = color;
        if(hasTarget){
          const isLate = endExt > deadlineExt;
          fillColor = isLate ? '#dc2626' : '#16a34a';
        }

        const durMin = d.status === 'complete'
          ? Math.round(Math.abs(d.b - d.a))
          : Math.round(Math.abs(nowM - d.a) % 1440);

        const bar = document.createElement('div');
        bar.style.cssText = [
          `position:absolute`,
          `left:${barL}px`, `width:${barW}px`, `height:${BAR_H}px`, `top:${BAR_PAD}px`,
          `border-radius:8px`,
          `background:color-mix(in srgb, ${fillColor} 28%, transparent)`,
          `border:1.5px solid color-mix(in srgb, ${fillColor} 60%, transparent)`,
          `border-left:4px solid ${fillColor}`,
          `display:flex`, `align-items:center`, `overflow:hidden`,
          `box-shadow:0 1px 4px color-mix(in srgb, ${fillColor} 15%, transparent)`,
        ].join(';');

      if(barW > 28 && showTimeLabels){
        const bl = document.createElement('span');
        bl.style.cssText = `font-size:11px;font-weight:700;color:${fillColor};padding-left:7px;white-space:nowrap;`;
        bl.textContent = d.status === 'in-progress' ? `${durMin}′…` : `${durMin}′`;
        bar.appendChild(bl);
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

  // 4. Lignes verticales + chips en haut
  const overlayTop = AXIS_H;
  const overlayH   = contentH - AXIS_H;

  // Collecte tous les marqueurs
  const allMarkers = [];

  fixedPoints.filter(p => ['SIBT','AIBT','SOBT','AOBT'].includes(p.label)).forEach(p => {
    allMarkers.push({ x: toPx(p.t), label: p.label, bg: '#64748b', color: '#fff', lineClass: 'tl-marker-line', lineStyle: '' });
  });

  if(nowExt >= min && nowExt <= max){
    const x = LEFT_PAD + ((nowExt - min)/total)*trackW;
    allMarkers.push({ x, label: 'NOW', bg: '#3b82f6', color: '#fff', lineClass: 'tl-now-line', lineStyle: '' });
  }

  const eobtPt = fixedPoints.find(p => p.label === 'EOBT');
  if(eobtPt){
    const isDark = document.documentElement.classList.contains('dark');
    const ec = isDark ? '#9ca3af' : '#6b7280';
    allMarkers.push({ x: toPx(eobtPt.t), label: 'EOBT', bg: ec, color: '#fff', lineClass: 'tl-eobt-line', lineStyle: `border-color:${ec};` });
  }

  const ctotPt = fixedPoints.find(p => p.label === 'CTOT');
  if(ctotPt){
    allMarkers.push({ x: toPx(ctotPt.t), label: 'CTOT', bg: '#f59e0b', color: '#000', lineClass: 'tl-ctot-line', lineStyle: '' });
    // TOBT = CTOT - 15min
    const tobtT = toExtended(ctotPt.t - 15, min, max);
    if(tobtT >= min && tobtT <= max){
      allMarkers.push({ x: toPx(tobtT), label: 'TOBT', bg: '#fb923c', color: '#fff', lineClass: 'tl-tobt-line', lineStyle: '' });
    }
  }

  // Lignes verticales
  allMarkers.forEach(m => {
    const line = document.createElement('div');
    line.className = m.lineClass;
    line.style.cssText = `left:${m.x}px; top:${overlayTop}px; height:${overlayH}px; ${m.lineStyle}`;
    canvas.appendChild(line);
  });

  // ── Placement dynamique des chips — anti-collision ────────────
  const CHIP_H = 22;
  const CHIP_W = 46;

  // Définit le côté de chaque chip (gauche = avant la ligne, droite = après)
  const LEFT_CHIPS = new Set(['AIBT','SIBT']);
  const RIGHT_CHIPS = new Set(['SOBT','AOBT','EOBT','CTOT','NOW']);

  const chipDefs = allMarkers.map(m => {
    const isLeft = LEFT_CHIPS.has(m.label);
    return {
      ...m,
      isLeft,
      xStart: isLeft ? m.x - CHIP_W - 4 : m.x + 4,
      xEnd:   isLeft ? m.x - 4           : m.x + 4 + CHIP_W,
    };
  });

  // Trie par x pour un placement gauche→droite
  chipDefs.sort((a, b) => a.x - b.x);

  const placed = [];

  chipDefs.forEach(chip => {
    let y = overlayTop + 2;
    let tries = 0;
    while(tries < 10){
      const collision = placed.some(p => {
        const xOk = chip.xStart < p.xEnd && chip.xEnd > p.xStart;
        const yOk = y < p.y + CHIP_H + 4 && y + CHIP_H > p.y;
        return xOk && yOk;
      });
      if(!collision) break;
      y += CHIP_H + 4;
      tries++;
    }
    chip.y = y;
    placed.push({ xStart: chip.xStart, xEnd: chip.xEnd, y });

    const el = document.createElement('div');
    el.className = 'tl-marker-chip';
    el.textContent = chip.label;
    const t = chip.isLeft
      ? 'transform:translateX(calc(-100% - 4px));'
      : 'transform:translateX(4px);';
    el.style.cssText = `left:${chip.x}px; top:${y}px; background:${chip.bg}; color:${chip.color}; ${t} z-index:20;`;
    canvas.appendChild(el);
  });

  // 5. Auto-scroll
  if(!timelineUserScrolled){
    const targetT = (nowExt >= min && nowExt <= max) ? nowExt : (min + max) / 2;
    const targetX = toPx(targetT);
    scroller.scrollLeft = Math.max(0, targetX - viewport / 2);
  }

  const zlbl = document.getElementById('timelineZoomLabel');
  if(zlbl) zlbl.textContent = `${Math.round(timelineZoom*100)}%`;
}

function setVal(id, v){
  const el = document.getElementById(id);
  if(!el) return;

  // si string -> uppercase, sinon valeur brute
  el.value = (typeof v === 'string') ? v.toUpperCase() : (v ?? '');

  // déclenche les listeners
  el.dispatchEvent(new Event('input',  { bubbles:true }));
  el.dispatchEvent(new Event('change', { bubbles:true }));
}

function setTimeFromISO(id, iso){
  if(!iso) return;
  const d = new Date(iso);
  if(isNaN(d.getTime())) return;

  const hh = String(isUTC ? d.getUTCHours() : d.getHours()).padStart(2,'0');
  const mm = String(isUTC ? d.getUTCMinutes() : d.getMinutes()).padStart(2,'0');

  setVal(id, `${hh}:${mm}`);
}

function setIfEmpty(id, v){
  const el = document.getElementById(id);
  if(!el) return;
  if((el.value || '').trim() !== '') return;
  setVal(id, v);
}

function setTimeFromISOIfEmpty(id, iso){
  const el = document.getElementById(id);
  if(!el) return;
  if((el.value || '').trim() !== '') return;
  setTimeFromISO(id, iso);
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

// ===== Airport Keeper (AK) — désactivé =====
function openAKPicker(){}
function closeAKPicker(){
  const b = document.getElementById('akBackdrop');
  const p = document.getElementById('akPopover');
  if(p) p.style.display='none';
  if(b) b.style.display='none';
  document.body.classList.remove('ak-open');
}
async function fetchAK(){ return []; }

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

function depAobtTooOld(dep, minutes = 15){
  const aobt = dep?.aobt;
  if(!aobt) return false;
  const t = Date.parse(aobt);
  if(!t) return false;
  return (Date.now() - t) > minutes*60*1000;
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
async function loadAKFlights(){ return; }


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

function getDelayBadgeHtml(mins){
  if(mins == null) return "";

  let label = "";
  let className = "";
  let extraStyle = "font-weight:900; margin-left:0;";

  if(mins >= 15){
    label = `RETARDÉ +${mins}`;
    className = "tag is-danger";
  }
  else if(mins >= 5){
    label = `RETARDÉ +${mins}`;
    className = "tag is-warning";
  }
  else if(mins <= -10){
    label = `EN AVANCE ${mins}`;
    className = "tag is-info";
  }
  else{
    label = "À L’HEURE";
    className = "tag is-success";
  }

  return `<span class="${className}" style="${extraStyle}">${label}</span>`;
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

  function half(f, flow){
    if(!f) return '<div class="ak-half ak-half-empty"></div>';
    const ff    = (f.fullFlightNumber||f.callsign||'').trim();
    const reg   = (f.reg||'').trim();
    const stand = (f.pkg||'').toString().replace(/^P/i,'');
    const {time:t, suffix:tSuffix} = pickBestTimeForList(f, flow);
    const status = getStatus(f, flow);
    const iata  = flow==='ARR' ? (f.adepIata||f.adepIcao||'') : (f.adesIata||f.adesIcao||'');
    const dly      = delayMinFrom(flow==='ARR'?(f.sibt||''):(f.sobt||''), flow==='ARR'?actualArrIso(f):actualDepIso(f));
    const barColor = delayBarColor(dly);
    const done     = (flow==='ARR'&&status==='ARRIVÉ')||(flow==='DEP'&&status==='DÉCOLLÉ');
    const bgBadge  = flow==='ARR' ? '#dbeafe' : '#dcfce7';
    const txtBadge = flow==='ARR' ? '#1d4ed8' : '#15803d';
    const suf      = tSuffix ? ' <span style="font-size:.7em;opacity:.65;font-weight:600;">('+tSuffix+')</span>' : '';
    const timeStr  = t ? escapeHtml(t)+suf : '—';
    const rzaHtml = '';

    // Heure estimée
    let estimatedStr = '';
    if(tSuffix === 'S'){
      const toHHMM = (iso)=>{
        const d = iso ? new Date(iso) : null;
        if(!d || isNaN(d.getTime())) return '';
        const hh = String(isUTC ? d.getUTCHours() : d.getHours()).padStart(2,'0');
        const mm = String(isUTC ? d.getUTCMinutes() : d.getMinutes()).padStart(2,'0');
        return `${hh}:${mm}`;
      };
      const est = flow==='DEP' ? toHHMM(f.eobt||f.etot||'') : toHHMM(f.eibt||f.eldt||'');
      if(est && est !== t && barColor !== '#16a34a'){
        estimatedStr = ' <span style="font-weight:900;color:'+barColor+';">→ '+escapeHtml(est)+'<span style="font-size:.7em;opacity:.8;"> (E)</span></span>';
      }
    }

    const opacity  = done ? 'opacity:.55;' : '';
    const barSide  = flow==='ARR' ? 'left:0;' : 'right:0;';
    const barHtml  = barColor
      ? '<div style="position:absolute;top:0;bottom:0;width:5px;'+barSide+'background:'+barColor+';border-radius:0;"></div>'
      : '';
    const halfClass = flow==='ARR' ? 'ak-half ak-half-arr' : 'ak-half ak-half-dep';
    const halfPad   = (flow==='ARR' && barColor) ? 'padding-left:11px;' : '';

    // ── onclick : on passe uniquement l'ID et le flow ──────────────────────
    const safeId = escapeHtml(String(f.id || f._id || ''));
    const onclick = 'onclick="_akClickFlight(\'' + safeId + '\',\'' + flow + '\')"';

    return '<div class="'+halfClass+'" style="position:relative;cursor:pointer;'+opacity+halfPad+'" '+onclick+'>'
      + barHtml
      + '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:3px;">'
      + '<span style="font-size:.62rem;font-weight:900;background:'+bgBadge+';color:'+txtBadge+';padding:1px 6px;border-radius:6px;">'+flow+'</span>'
      + '<span style="font-weight:900;font-size:.95rem;">'+escapeHtml(iata||'---')+'</span>'
      + rzaHtml
      + '</div>'
      + '<div style="color:var(--muted);font-size:.78rem;font-weight:700;">'+escapeHtml(ff||'—')+' · Pkg '+escapeHtml(stand||'—')+' · '+escapeHtml(reg||'—')+'</div>'
      + '<div style="color:var(--muted);font-size:.75rem;font-weight:700;">'+timeStr+estimatedStr+'</div>'
      + (status ? '<div style="color:var(--muted);font-size:.72rem;font-weight:800;margin-top:2px;">'+escapeHtml(status)+'</div>' : '')
      + '</div>';
  }

  if(!pairs.length){ list.innerHTML = '<p class="has-text-grey">Aucun vol.</p>'; return; }

  list.innerHTML = pairs.map(function(p){
    return '<div class="ak-pair-row">'
      + half(p.arr,'ARR')
      + '<div class="ak-pair-divider">' + (p.arr && p.dep ? '🔗' : '⛓️\u200d💥') + '</div>'
      + half(p.dep,'DEP')
      + '</div>';
  }).join('');
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

  data.akMeta = {
    flow: meta.flow || null,

    // ✅ clé la plus fiable
    id: String(meta.id || ''),
    linkedId: String(meta.linkedId || ''),

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

async function refreshAKTab(tabId){ return; }


function applyAKFlight(f, flow, opts = {}){
  _doApplyAKFlight(f, flow, opts);
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

        const cieNow = (document.getElementById('Cie')?.value || '').toUpperCase();
        if(cieNow !== 'FR' && cieNow !== 'RK' && prevArr?.bags != null){
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

      const cieNow = (document.getElementById('Cie')?.value || '').toUpperCase();
      if(cieNow !== 'FR' && cieNow !== 'RK' && f?.bags != null){
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

    // ID du vol lié résolu par les fonctions de linking (plus fiable que f.linkedId)
    const resolvedLinkedId = flow === 'DEP'
      ? (prevArrUsed?.id || f.linkedId || '')
      : (nextDepUsed?.id || f.linkedId || '');

    storeAKMetaForTab({
      flow,
      id: f.id,
      linkedId: resolvedLinkedId,
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

function toggleFABs(show){
  const loadFab = document.getElementById('loadFab');
  const settingsFab = document.getElementById('settingsFab');
  if(loadFab) loadFab.style.display = show ? 'inline-flex' : 'none';
  if(settingsFab) settingsFab.style.display = show ? 'inline-flex' : 'none';
}

function updateLidGuideVisibility(){
  const cie = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const btn = document.querySelector('#ldmFinal button[onclick="toggleFinalImage()"]');
  if(!btn) return;

  const show = (cie === 'FR' || cie === 'RK');
  btn.style.display = show ? '' : 'none';
}

function updateDelayCodesVisibility(){
  const cie = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const btn = document.getElementById('delayCodesBtn');
  const box = document.getElementById('delayCodesBox');
  const show = (cie === 'FR' || cie === 'RK');

  if(btn) btn.style.display = show ? '' : 'none';

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
  { id:'menageGSF',label:'Ménage GSF',             type:'choice', choices:['N','Tidy','Full'] },
  { id:'collecte',     label:'Collecte ordures',       type:'yn', default:'Y' },
  { id:'echelle',      label:'Échelle supplémentaire', type:'yn' },
  { id:'degivrage',    label:'Dégivrage',              type:'yn' },
  { id:'toiletKit',    label:'Toilet Kit',             type:'yn' },
  { id:'pushPull',     label:'Push-pull',              type:'yn' },
  { id:'cargo',        label:'Cargo',                  type:'cargo' },
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
        btn.style.cssText = `padding:5px 11px; border-radius:6px; border:1.5px solid ${active?'#2563eb':'var(--field-border)'}; background:${active?'#2563eb':'transparent'}; color:${active?'#fff':'var(--text)'}; font-size:.78rem; font-weight:700; cursor:pointer;`;
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
      poidsInput.placeholder = 'kg';
      poidsInput.style.cssText = 'width:64px; padding:5px 7px; border:1.5px solid var(--field-border); border-radius:6px; background:var(--field); color:var(--text); font-size:.82rem; font-weight:600; text-align:center;';
      const poidsLbl = document.createElement('span');
      poidsLbl.style.cssText = 'font-size:.78rem; color:var(--muted); font-weight:600;';
      poidsLbl.textContent = 'kg';
      poidsWrap.appendChild(poidsInput);
      poidsWrap.appendChild(poidsLbl);
      wrap.appendChild(poidsWrap);

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
    } else {
      const btns = document.querySelectorAll(`#prestationsBody button[data-toggle-id="${p.id}"]`);
      btns.forEach(b => {
        if(b.style.background.includes('2563eb') || b.style.background === 'rgb(37, 99, 235)')
          _prestationsData[p.id] = b.dataset.toggleVal;
      });
    }
  });
  closePrestationsModal();
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
    if(sobtM != null){ ret = aobtM - sobtM; if(ret < 0) ret += 1440; if(ret > 720) ret -= 1440; }
  }

  // Remplissage du résumé
  const rows = [
    ['AIBT', aibtVal || '—'],
    ['EOBT', eobtVal || '—'],
    ['AOBT', aobtVal || '—'],
    ['Turnaround', tat != null ? fmtDur(tat) : '—'],
    ['Retard total', ret != null ? (ret > 0 ? `+${fmtDur(ret)}` : fmtDur(ret)) : '—'],
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
    let dur = e - s; if(dur < 0) dur += 1440;
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

function validateForm() {
  const val = id => (document.getElementById(id)?.value || "");
  const aobt = val('AOBT');
  const to   = val('To');
  const isBVADest = (to || '').toUpperCase().trim() === 'BVA';
  if(!aobt && !isBVADest){
    showPopup('⚠️ AOBT manquant — impossible de valider', '#ef4444', 2500);
    return;
  }
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
  if(t('PremierDebarque'))   { body += r('PREMIER DEBARQUE (L1)', t('PremierDebarque')); }
  if(t('PremierDebarqueL2')) { body += r('PREMIER DEBARQUE (L2)', t('PremierDebarqueL2')); }
  if(t('DernierDebarque'))   { body += r('DERNIER DEBARQUE',      t('DernierDebarque')); }

  body += br();
  if(t('ArriveeLiftArr') || t('DepartLiftArr'))
    body += r('LIFT ARR', `${t('ArriveeLiftArr')||'--:--'} → ${t('DepartLiftArr')||'--:--'}`);

  body += br();
  if(t('AvionPremierEmbarque')) { body += r('PREMIER EMBARQUE',  t('AvionPremierEmbarque')); }
  if(t('AvionDernierEmbarque')) { body += r('DERNIER EMBARQUE',  t('AvionDernierEmbarque')); }

  body += br();
  if(t('ArriveeLift') || t('DepartLift'))
    body += r('LIFT DEP', `${t('ArriveeLift')||'--:--'} → ${t('DepartLift')||'--:--'}`);
  if(t('ArriveeFuel') || t('DepartFuel'))
    body += r('AVITAIR',  `${t('ArriveeFuel')||'--:--'} → ${t('DepartFuel')||'--:--'}`);

  body += br();
  if(t('RemiseLID'))            { body += r('REMISE LID',       t('RemiseLID')); }
  if(t('FermeturePorteAvion'))  { body += r('FERMETURE PORTE',  t('FermeturePorteAvion')); }
  if(t('ConnexionAgentCasque')) { body += r('CONNEXION CASQUE', t('ConnexionAgentCasque')); }

  // ── OPS : INAD / NAYAK ───────────────────────────────────────────────────
  const hasInad = t('ArriveeINAD') || v('ArrSI');
  if(hasInad){
    body += s();
    if(t('ArriveeINAD')) body += r('INAD / NAYAK', t('ArriveeINAD'));
    if(v('ArrSI'))       body += r('SI',            v('ArrSI'));
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
    if(v('FinalSI'))           body += r('SI', v('FinalSI'));
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
   
/* ===== FUEL ===== */
function openFuelMenu(){
  const b = document.getElementById('fuelBackdrop');
  const m = document.getElementById('fuelMenu');
  if(b) b.style.display = '';
  if(m) m.style.display = 'block';
}

function closeFuelMenu(){
  const b = document.getElementById('fuelBackdrop');
  const m = document.getElementById('fuelMenu');
  if(m) m.style.display = 'none';
  if(b) b.style.display = 'none';
}

function toggleFuelMenu(){
  const m = document.getElementById('fuelMenu');
  const isOpen = m && m.style.display !== 'none' && m.style.display !== '';

  closeAllPopups();
  if(!isOpen) openFuelMenu();
}

/* ESC ferme fuel */
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape') closeFuelMenu();
});

/* ===== CLOSE ALL POPUPS ===== */
function closeAllPopups(){
  // FUEL
  closeFuelMenu?.();

  // LOAD (LDM)
  closeLDM?.();

  // SETTINGS
  closeSettingsMenu?.();

  // AK
  closeAKPicker?.();

}

/* ===== LOAD ===== */
function toggleLDM(mode=null){
  const modal = document.getElementById('ldmModal');
  const isOpen = modal && modal.style.display !== 'none' && modal.style.display !== '';

  closeAllPopups();

  if(isOpen){
    closeLDM();
    return;
  }

  // ✅ si tu appelles toggleLDM() sans argument → mode=null → auto
  openLDM(mode);
}

/* ===== PARAMÈTRES ===== */
function toggleSettings(){
  const panel = document.getElementById('settingsPanel');
  const backdrop = document.getElementById('settingsBackdrop');
  const isOpen = panel.style.display === 'block';

  closeAllPopups();
  if (!isOpen){
    panel.style.display = 'block';
    backdrop.style.display = 'block';
  }
}

/* ===== BLOC NOTE CANVAS ===== */
(function(){
  let _bnReady = false;
  let _tool = 'pen';      // 'pen' | 'eraser-stroke'
  let _strokes = [];      // [{tool, color, size, pts:[{x,y}]}]
  let _current = null;
  let _drawing = false;
  let _historyKey = null;

  function canvas(){ return document.getElementById('bnCanvas'); }
  function ctx(){ const c=canvas(); return c ? c.getContext('2d') : null; }

  function bnInit(){
    const c = canvas();
    if(!c || _bnReady) return;

    // Attendre que le canvas soit visible et ait une taille
    const w = c.offsetWidth || c.closest('.card-content')?.offsetWidth || 300;
    if(w === 0){
      setTimeout(bnInit, 100);
      return;
    }

    _bnReady = true;

    // Taille responsive — haute résolution (devicePixelRatio)
    function resize(){
      const dpr = window.devicePixelRatio || 1;
      const parent = c.parentElement || c.closest('.card-content');
      const cw  = (parent?.clientWidth || c.offsetWidth || 300);
      const h   = Math.round(cw * 0.45);
      const pw  = Math.round(cw * dpr);
      const ph  = Math.round(h * dpr);
      if(c.width !== pw || c.height !== ph){
        c.width  = pw;
        c.height = ph;
        c.style.width  = cw + 'px';
        c.style.height = h  + 'px';
        const g = ctx();
        if(g) g.setTransform(dpr, 0, 0, dpr, 0, 0);
        bnRedraw();
      }
    }
    new ResizeObserver(()=>requestAnimationFrame(resize)).observe(c);
    resize();

    // Charger depuis storage
    _historyKey = 'bnCanvas_' + (currentTabId||'default');
    bnLoad();

    // Événements pointer (stylet + doigt + souris)
    c.addEventListener('pointerdown', e=>{ e.preventDefault(); bnStart(e); }, {passive:false});
    c.addEventListener('pointermove', e=>{ e.preventDefault(); bnMove(e);  }, {passive:false});
    c.addEventListener('pointerup',   e=>{ e.preventDefault(); bnEnd(e);   }, {passive:false});
    c.addEventListener('pointerleave',e=>{ bnEnd(e); }, {passive:false});
    // Empêcher menu contextuel et sélection sur appui long (mobile)
    c.addEventListener('contextmenu', e=>{ e.preventDefault(); }, {passive:false});
    c.addEventListener('selectstart',  e=>{ e.preventDefault(); }, {passive:false});
  }

  function bnPt(e){
    const c = canvas();
    const r = c.getBoundingClientRect();
    // Pas de multiplication DPR ici — on travaille en CSS pixels, le scale() du ctx s'en charge
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function bnStart(e){
    _drawing = true;
    const pt = bnPt(e);
    if(_tool === 'eraser-stroke'){
      _current = { tool:'eraser-stroke', pts:[pt] };
    } else {
      const color = document.getElementById('bnColor')?.value || '#1e3a8a';
      const size  = parseInt(document.getElementById('bnSize')?.value || '3', 10);
      _current = { tool:'pen', color, size, pts:[pt] };
    }
  }

  function bnMove(e){
    if(!_drawing || !_current) return;
    _current.pts.push(bnPt(e));
    bnRedraw();
    // Dessine le trait en cours
    bnDrawStroke(_current, ctx());
  }

  function bnEnd(e){
    if(!_drawing || !_current) return;
    _drawing = false;
    if(_tool === 'eraser-stroke'){
      // Supprimer les traits qui intersectent le chemin de gomme
      const erasePts = _current.pts;
      _strokes = _strokes.filter(s => !bnStrokeIntersects(s, erasePts));
    } else if(_current.pts.length > 0){
      _strokes.push(_current);
    }
    _current = null;
    bnRedraw();
    bnSave();
  }

  function bnStrokeIntersects(stroke, erasePts){
    const threshold = 18;
    for(const ep of erasePts){
      for(const sp of stroke.pts){
        const dx = ep.x - sp.x, dy = ep.y - sp.y;
        if(dx*dx + dy*dy < threshold*threshold) return true;
      }
    }
    return false;
  }

  function bnDrawStroke(s, c){
    if(!c || s.pts.length < 1) return;
    c.save();
    if(s.tool === 'eraser-stroke'){
      c.globalCompositeOperation = 'source-over';
      c.strokeStyle = 'rgba(200,200,200,0.5)';
      c.lineWidth   = 18;
      c.setLineDash([4,4]);
    } else {
      c.globalCompositeOperation = 'source-over';
      c.strokeStyle = s.color;
      c.lineWidth   = s.size;
      c.setLineDash([]);
      c.lineCap     = 'round';
      c.lineJoin    = 'round';
    }
    c.beginPath();
    c.moveTo(s.pts[0].x, s.pts[0].y);
    for(let i=1; i<s.pts.length; i++) c.lineTo(s.pts[i].x, s.pts[i].y);
    c.stroke();
    c.restore();
  }

  function bnRedraw(){
    const c2 = canvas(); const g = ctx();
    if(!c2||!g) return;
    const dpr = window.devicePixelRatio || 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, c2.width / dpr, c2.height / dpr);
    _strokes.forEach(s => bnDrawStroke(s, g));
  }

  function bnSave(){
    if(!_historyKey) return;
    try{
      const data = JSON.stringify(_strokes);
      localStorage.setItem(_historyKey, data);
      // Rafraîchit l'affichage du champ (twSync = mise à jour locale, pas de réseau)
      const el = document.getElementById('BlocNote');
      if(el){
        el.value = data;
        if(typeof twSync === 'function') twSync('BlocNote');
      }
    }catch(e){}
  }

  function bnLoad(){
    _historyKey = 'bnCanvas_' + (currentTabId||'default');
    try{
      const raw = localStorage.getItem(_historyKey);
      const elRaw = document.getElementById('BlocNote')?.value || '';
      const source = raw || elRaw;
      if(source) _strokes = JSON.parse(source);
      else        _strokes = [];
    }catch(e){ _strokes=[]; }
    setTimeout(bnRedraw, 50);
  }

  window.bnSetTool = function(tool){
    _tool = tool;
    document.getElementById('bnPen')?.classList.toggle('is-link',   tool==='pen');
    document.getElementById('bnPen')?.classList.toggle('is-light',  tool!=='pen');
    document.getElementById('bnEraserStroke')?.classList.toggle('is-warning', tool==='eraser-stroke');
    document.getElementById('bnEraserStroke')?.classList.toggle('is-light',   tool!=='eraser-stroke');
  };

  window.bnReloadFromRemote = function(raw){
    try{
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if(!Array.isArray(parsed)) return;
      _strokes = parsed;
      if(_historyKey) localStorage.setItem(_historyKey, JSON.stringify(_strokes));
      bnRedraw();
    }catch(e){}
  };
  window.bnSwitchMode = function(mode){
    const drawDiv = document.getElementById('bnDrawMode');
    const textDiv = document.getElementById('bnTextMode');
    const drawBtn = document.getElementById('bnPen');
    const textBtn = document.getElementById('bnModeTextBtn');
    if(!drawDiv || !textDiv) return;
    const isDraw = mode === 'draw';
    drawDiv.style.display = isDraw ? '' : 'none';
    textDiv.style.display = isDraw ? 'none' : '';
    const drawTools = document.getElementById('bnDrawTools');
    if(drawTools) drawTools.style.display = isDraw ? 'flex' : 'none';
    drawBtn.classList.toggle('is-link',  isDraw);
    drawBtn.classList.toggle('is-light', !isDraw);
    textBtn.classList.toggle('is-link',  !isDraw);
    textBtn.classList.toggle('is-light', isDraw);
    if(isDraw){
      setTimeout(()=>{
        const c = document.getElementById('bnCanvas');
        if(!c) return;
        const dpr = window.devicePixelRatio || 1;
        const w   = c.offsetWidth || c.parentElement?.offsetWidth || 300;
        const h   = Math.round(w * 0.45);
        // Forcer les dimensions même si inchangées
        c.width  = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
        c.style.width  = w + 'px';
        c.style.height = h + 'px';
        const g = c.getContext('2d');
        if(g) g.setTransform(dpr, 0, 0, dpr, 0, 0);
        _bnReady = false;
        bnInit();
        bnRedraw();
      }, 80);
    }
    try{ localStorage.setItem('bnMode_'+(currentTabId||'default'), mode); }catch(e){}
  };

  window.bnClear = function(){
    const m = document.getElementById('bnClearModal');
    if(m){ m.style.display = 'flex'; }
  };

  window.bnConfirmClear = function(){
    document.getElementById('bnClearModal').style.display = 'none';
    _strokes = [];
    bnRedraw();
    bnSave();
  };

  window.bnUpdateColor = function(){ /* color picker auto */ };

  // Réinitialiser quand on change d'onglet
  window.bnReloadTab = function(){
    _bnReady = false;
    _strokes = [];
    _current = null;
    _drawing = false;
    // Restaurer le mode (dessin ou clavier)
    const savedMode = localStorage.getItem('bnMode_'+(currentTabId||'default')) || 'text';
    setTimeout(()=>{ window.bnSwitchMode?.(savedMode); bnInit(); bnLoad(); }, 100);
  };

  // Init dès que le canvas est visible
  document.addEventListener('DOMContentLoaded', ()=>{
    setTimeout(bnInit, 200);
  });
})();

function openClearFieldsModal(){
  document.getElementById('clearFieldsModal').style.display = 'flex';
}

function confirmClearFields(){
  document.getElementById('clearFieldsModal').style.display = 'none';

  // Champs de timing à effacer (pas les infos vol)
  const timingIds = [
    'AIBT','AOBT','PremierDebarque','PremierDebarqueL2','DernierDebarque',
    'ArrPNT','ArrPNC','ArriveeFuel','DepartFuel','ArriveeLiftArr','DepartLiftArr',
    'ArriveeLift','DepartLift','AvionPremierEmbarque','AvionDernierEmbarque',
    'FermeturePorteAvion','RemiseLID','ConnexionAgentCasque','ArriveeINAD',
    'CommChiffresPorte', 'CommChargementPiste',
    'ArrPAX_MAIN','ArrPAX_INF','ArrBAGS','ArrPOIDS','ArrSI',
    'PreviPAX_MAIN','PreviPAX_INF','PreviBAGS','PreviPOIDS','PreviSI',
    'PreviPoussettesPorte','PreviPoussettesCBS',
    'FinalMALE','FinalFEMALE','FinalADULT','FinalCHILD','FinalINFANT',
    'FinalTOB','FinalOA','FinalOB','FinalOC','FinalOD',
    'FinalBAGS','FinalPOIDS','FinalGB','FinalH1','FinalH2','FinalH3','FinalH4','FinalSI',
    'BlockFuel','TripFuel','TaxiFuel','FuelUplift',
    'DLcode1','DLcode2','DLcode3','DLduree1','DLduree2','DLduree3',
    'FaitsSaillants'
  ];
  try {
    timingIds.forEach(id => {
      const el = document.getElementById(id);
      if(!el) return;
      el.value = '';
      el.dispatchEvent(new Event('input',  { bubbles:true }));
      el.dispatchEvent(new Event('change', { bubbles:true }));
    });
  } finally {
  }

  updateAllCalculations();
  // Effacer aussi le bloc note (canvas + clavier)
  if(typeof window.bnConfirmClear === 'function'){
    // Effacer canvas sans confirmation
    try{
      window.bnConfirmClear._silent = true;
      const strokes = [];
      // Accès direct via bnReloadFromRemote avec tableau vide
      window.bnReloadFromRemote?.(JSON.stringify(strokes));
      document.getElementById('BlocNote') && (document.getElementById('BlocNote').value = '[]');
    }catch(e){}
  }
  // Effacer le textarea clavier
  const fsEl = document.getElementById('FaitsSaillants');
  if(fsEl){ fsEl.value = ''; fsEl.dispatchEvent(new Event('change',{bubbles:true})); }
}

function openCloseAllModal(){
  document.getElementById('closeAllModal').style.display = 'flex';
}

function confirmCloseAll() {
  document.getElementById('closeAllModal').style.display = 'none';
  clearTimeout(window._sendFullDebounce);
  clearTimeout(saveTimer); saveTimer = null;
  localStorage.clear();
  location.reload();
}

function clearAutoSave() {
  confirmCloseAll();
}

function getAutoLDMMode(){
  const premierEmb  = (document.getElementById('AvionPremierEmbarque')?.value || '').trim();
  const premierDeb  = (document.getElementById('PremierDebarque')?.value || '').trim();
  const aibtVal     = (document.getElementById('AIBT')?.value || '').trim();

  // 1. Premier Embarqué renseigné → FINAL
  if(premierEmb) return 'final';

  // 2. Pas d'AIBT → PREVI par défaut
  const aibt = parseHHMM(aibtVal);
  if(aibt == null) return 'previ';

  const now = getNowMinutes().mins;

  // Calculer la borne : PremierDebarque + 7min (si renseigné)
  const deb = parseHHMM(premierDeb);
  let debPlus7 = null;
  if(deb != null){
    debPlus7 = (deb + 7) % 1440;
  }

  // Savoir où on en est par rapport à AIBT
  let diffAibt = now - aibt;
  if(diffAibt < -720) diffAibt += 1440;
  if(diffAibt >  720) diffAibt -= 1440;

  if(diffAibt < 0) return 'previ'; // avant AIBT → PREVI

  // Si PremierDebarque+7min atteint → PREVI
  if(debPlus7 != null){
    let diffDeb = now - debPlus7;
    if(diffDeb < -720) diffDeb += 1440;
    if(diffDeb >  720) diffDeb -= 1440;
    if(diffDeb >= 0) return 'previ';
  }

  // Entre AIBT et PremierDebarque+7min → ARR
  return 'arr';
}

function toggleFinalImage(){
  const box = document.getElementById('finalImageBox');
  box.style.display = (box.style.display === 'none') ? 'block' : 'none';
}

function toggleDelayCodes() {
  const box = document.getElementById('delayCodesBox');
  if (!box) return;
  box.style.display = (box.style.display === 'none') ? 'block' : 'none';
}


function updateDLCodeInputMode(){
  const cie = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const numeric = (cie === 'FR' || cie === 'RK' || cie === 'H4' || cie === 'V7');
  ['DLcode1','DLcode2','DLcode3'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    el.inputMode = numeric ? 'numeric' : 'text';
    el.pattern   = numeric ? '[0-9]*' : '';
  });
}

function openCrewPanel(){
  const el  = document.getElementById('panel-crew');
  const btn = document.getElementById('btn-crew');
  if(!el) return;
  // Ouvrir seulement si pas déjà ouvert
  if(el.style.display === 'none' || el.style.display === ''){
    el.style.display = 'block';
    if(btn){ btn.classList.add('is-info', 'is-selected'); }
  }
}

// Ouvre d'office le panneau Crew pour FR/RK quand :
//   - départ de BVA (From = BVA), OU
//   - turnaround AOBT − AIBT ≥ 35 min
function autoOpenCrewIfNeeded(){
  const cie    = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const isFRRK = (cie === 'FR' || cie === 'RK');
  if(!isFRRK) return;

  const from    = (document.getElementById('From')?.value || '').toUpperCase().trim();
  const fromBVA = (from === 'BVA');

  const aibt = parseHHMM(document.getElementById('AIBT')?.value || '');
  const aobt = parseHHMM(document.getElementById('AOBT')?.value || '');
  let turn = null;
  if(aibt != null && aobt != null){
    turn = aobt - aibt;
    if(turn < -720) turn += 1440;   // gère le passage minuit
    if(turn >  720) turn -= 1440;
  }
  const longTurn = (turn != null && turn >= 35);

  if(fromBVA || longTurn) openCrewPanel();
}

// Compat : ancien nom conservé pour les points d'appel existants
function autoOpenCrewIfBVA(){ autoOpenCrewIfNeeded(); }

function toggleDepExtra(panel){
  const el = document.getElementById('panel-' + panel)
  const btn = document.getElementById('btn-' + panel)
  if(!el) return
  const isOpen = el.style.display !== 'none'
  el.style.display = isOpen ? 'none' : 'block'
  if(btn){
    if(isOpen){
      btn.classList.remove('is-info', 'is-selected')
    } else {
      btn.classList.add('is-info', 'is-selected')
    }
  }
}

function toggleInfoVolEdit(){
  const edit = document.getElementById('ivEdit');
  const icon = document.getElementById('ivEditIcon');
  const open = edit.style.display === 'none' || edit.style.display === '';
  edit.style.display = open ? 'grid' : 'none';
  icon.textContent = open ? '✅' : '✏️';
}

async function footerRefreshAK(){ return; }


/* ===== TIME WRAP gestures ===== */
(function(){
  const LONG_MS  = 600;
  const DBL_MS   = 320;
  const s = {}; // state par id

  function st(id){ if(!s[id]) s[id]={t:null,fired:false,last:0}; return s[id]; }

  function openEdit(id){
    const wrap = document.querySelector(`.time-wrap[data-id="${id}"]`);
    const inp  = document.getElementById(id);
    const disp = document.getElementById('tw-disp-'+id);
    if(!wrap||!inp||!disp) return;
    if(document.querySelector('.tw-editor[data-for="'+id+'"]')) return;

    const rect = wrap.getBoundingClientRect();

    const ed = document.createElement('input');
    ed.type='text'; ed.className='input tw-editor';
    ed.setAttribute('data-for', id);
    ed.value=inp.value||''; ed.placeholder='HH:MM';
    ed.maxLength=5; ed.inputMode='numeric';
    ed.setAttribute('enterkeyhint','done');

    function positionEditor(){
      const r = wrap.getBoundingClientRect();
      const vv = window.visualViewport;
      // Sur Android, visualViewport donne les coords réelles après ouverture du clavier
      const offsetTop  = vv ? vv.offsetTop  : 0;
      const offsetLeft = vv ? vv.offsetLeft : 0;
      ed.style.top    = (r.top  + offsetTop)  + 'px';
      ed.style.left   = (r.left + offsetLeft) + 'px';
      ed.style.width  = r.width  + 'px';
      ed.style.height = r.height + 'px';
    }

    // Position fixe sur le wrap, en dehors du time-wrap pour éviter overflow:hidden
    ed.style.cssText = `
      position:fixed;
      top:${rect.top}px; left:${rect.left}px;
      width:${rect.width}px; height:${rect.height}px;
      z-index:9999;
      text-align:center; font-weight:900; font-size:1rem;
      border-radius:var(--radius);
      background:var(--card); color:var(--text);
      border:2px solid #3273dc; padding:0; box-sizing:border-box;
    `;
    disp.style.visibility='hidden';
    document.body.appendChild(ed);

    // Recalculer la position quand le clavier Android ouvre (visualViewport resize)
    if(window.visualViewport){
      window.visualViewport.addEventListener('resize', positionEditor);
      window.visualViewport.addEventListener('scroll', positionEditor);
    }

    setTimeout(()=>{ ed.focus(); ed.select(); },30);

    let done=false;
    function commit(){
      if(done) return; done=true;
      const m=(ed.value.trim()).match(/^(\d{1,2}):?(\d{2})$/);
      if(m){
        const hh=m[1].padStart(2,'0'),mm=m[2];
        if(+hh<24&&+mm<60){
          inp.value=hh+':'+mm;
          inp.dispatchEvent(new Event('change',{bubbles:true}));
          twSync(id); updateAllCalculations();
        }
      }
      ed.remove(); disp.style.visibility='';
      if(window.visualViewport){
        window.visualViewport.removeEventListener('resize', positionEditor);
        window.visualViewport.removeEventListener('scroll', positionEditor);
      }
    }
    ed.addEventListener('blur',commit);
    ed.addEventListener('keydown',e=>{
      if(e.key==='Enter'){e.preventDefault();commit();}
      if(e.key==='Escape'){done=true;ed.remove();disp.style.visibility='';}
    });
  }

  function clearVal(id){
    const inp=document.getElementById(id); if(!inp) return;
    inp.value='';
    inp.dispatchEvent(new Event('change',{bubbles:true}));
    twSync(id); updateAllCalculations();
  }

  /* ---- zone click (−1 / now / +1) ---- */
  document.addEventListener('click',function(e){
    const zone=e.target.closest('.tw-zone');
    if(!zone) return;
    if(zone.classList.contains('tw-sched-zone')) return;
    const wrap=zone.closest('.time-wrap'); if(!wrap) return;
    const id=wrap.dataset.id; if(!id) return;
    // Évite le double déclenchement après touch sur mobile
    if(_touchHandled && (zone.classList.contains('tw-zone-left')||zone.classList.contains('tw-zone-right'))) return;
    const action=zone.dataset.action;
    if(action==='minus') adjustTime(id,-1);
    else if(action==='plus') adjustTime(id,1);
    else if(action==='now') setNow(id);
    updateAllCalculations(); twSync(id);
    if(window.getSelection) window.getSelection().removeAllRanges();
    // Pas de blur() — évite les sauts de scroll sur tablette Android
  });

  /* ---- long press & double-tap sur zone centre ---- */
  function onStart(id){
    const o=st(id); o.fired=false;
    clearTimeout(o.t);
    o.t=setTimeout(()=>{ o.fired=true; openEdit(id); },LONG_MS);
  }
  function onEnd(id){
    const o=st(id);
    clearTimeout(o.t);
    if(o.fired) return;
    const now=Date.now();
    if(now-o.last<DBL_MS){ o.last=0; clearVal(id); }
    else { o.last=now; }
  }
  function onCancel(id){ clearTimeout(st(id).t); }

  document.addEventListener('touchstart',function(e){
    const z=e.target.closest('.tw-zone-center, .tw-sched-zone'); if(!z) return;
    const id=z.closest('.time-wrap')?.dataset?.id; if(!id) return;
    onStart(id);
  },{passive:true});

  /* ---- touch sur -1/+1 : géré directement en touch pour éviter saut scroll ---- */
  let _touchHandled = false;
  document.addEventListener('touchend',function(e){
    const zone=e.target.closest('.tw-zone-left, .tw-zone-right');
    if(!zone) return;
    if(zone.classList.contains('tw-sched-zone')) return;
    const wrap=zone.closest('.time-wrap'); if(!wrap) return;
    const id=wrap.dataset.id; if(!id) return;
    const action=zone.dataset.action;
    if(action==='minus') adjustTime(id,-1);
    else if(action==='plus') adjustTime(id,1);
    updateAllCalculations(); twSync(id);
    if(window.getSelection) window.getSelection().removeAllRanges();
    _touchHandled = true;
    setTimeout(()=>{ _touchHandled = false; }, 400);
  },{passive:true});
  document.addEventListener('touchend',function(e){
    const z=e.target.closest('.tw-zone-center, .tw-sched-zone'); if(!z) return;
    const id=z.closest('.time-wrap')?.dataset?.id; if(!id) return;
    onEnd(id);

  },{passive:true});
  document.addEventListener('touchmove',function(e){
    const z=e.target.closest('.tw-zone-center, .tw-sched-zone'); if(!z) return;
    const id=z.closest('.time-wrap')?.dataset?.id; if(!id) return;
    onCancel(id);
  },{passive:true});

  // desktop : long mousedown sur centre = éditer, dblclick = effacer
  let mTimer=null;
  document.addEventListener('mousedown',function(e){
    if(e.button!==0) return;
    const z=e.target.closest('.tw-zone-center, .tw-sched-zone'); if(!z) return;
    const id=z.closest('.time-wrap')?.dataset?.id; if(!id) return;
    const o=st(id); o.fired=false;
    mTimer=setTimeout(()=>{ o.fired=true; openEdit(id); },LONG_MS);
  });
  document.addEventListener('mouseup',function(){ clearTimeout(mTimer); mTimer=null; });
  document.addEventListener('dblclick',function(e){
    const z=e.target.closest('.tw-zone-center, .tw-sched-zone'); if(!z) return;
    const id=z.closest('.time-wrap')?.dataset?.id; if(!id) return;
    clearVal(id);
  });
})();

function twSync(id){
  const inp = document.getElementById(id);
  const disp = document.getElementById('tw-disp-' + id);
  if(!inp || !disp) return;
  disp.textContent = inp.value || '--:--';
}
// Sync all tw displays on load and after calculations
const _origUpdateAll = typeof updateAllCalculations === 'function' ? updateAllCalculations : null;
function twSyncAll(){
  document.querySelectorAll('.time-wrap').forEach(w => {
    const id = w.dataset.id;
    if(id) twSync(id);
  });
}

function delayMinsFromHHMM(planned, actual){
  if(!planned || !actual) return null;
  const toMin = s => { const [h,m] = s.split(':').map(Number); return h*60+m; };
  let diff = toMin(actual) - toMin(planned);
  // gestion passage minuit
  if(diff < -720) diff += 1440;
  if(diff > 720)  diff -= 1440;
  return diff;
}

function updateIVBadges(){
  const sibt = document.getElementById('SIBT')?.value || '';
  const aibt = document.getElementById('AIBT')?.value || '';
  const sobt = document.getElementById('SOBT')?.value || '';
  const aobt = document.getElementById('AOBT')?.value || '';

  function renderBadge(el, mins){
    if(!el) return;
    el.className = '';
    el.textContent = '';
    // Badges INFO VOL désactivés
  }

  const arrEl = document.getElementById('ivBadgeArr');
  const depEl = document.getElementById('ivBadgeDep');

  // ARR : SIBT planifié, AIBT réel
  renderBadge(arrEl, delayMinsFromHHMM(sibt, aibt));
  // DEP : SOBT planifié, AOBT réel
  renderBadge(depEl, delayMinsFromHHMM(sobt, aobt));
}



function checkAndDeleteIfEmpty(){
  // Le vol est actif tant que Cie + NVol + Date sont présents
  const cie  = (document.getElementById('Cie')?.value  || '').trim();
  const nvol = (document.getElementById('NVol')?.value || '').trim();
  const date = (document.getElementById('Date')?.value || '').trim();
  const hasData = cie && nvol && date;
}

/* ===== ResizeObserver : --fixed-header-h dynamique ===== */
(function() {
  const header = document.querySelector('.fixed-header');
  if (!header) return;
  const update = () => {
    document.documentElement.style.setProperty(
      '--fixed-header-h', header.offsetHeight + 'px'
    );
  };
  update(); // valeur initiale
  new ResizeObserver(update).observe(header);
})();



/* ===== Service Worker — enregistrement ===== */
if ('serviceWorker' in navigator) {
  const swCode = `
const CACHE = 'suivi-perf-v1';
const PRECACHE = [];   // fichiers à précacher (vide = online-only)

self.addEventListener('install', e => {
  self.skipWaiting();
  if (PRECACHE.length) e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Ne pas intercepter les requêtes non-HTTP (chrome-extension, data:, etc.)
  if (!e.request.url.startsWith('http')) return;
  // Ne pas intercepter les WebSocket
  if (e.request.url.startsWith('ws://') || e.request.url.startsWith('wss://')) return;

  // Stratégie : Network-first, fallback cache, fallback réponse vide
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        // Ne mettre en cache que les réponses valides GET
        if (resp.ok && e.request.method === 'GET') {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      })
      .catch(() =>
        caches.match(e.request).then(cached =>
          cached || new Response('', { status: 503, statusText: 'Offline' })
        )
      )
  );
});
`;
  const blob = new Blob([swCode], { type: 'application/javascript' });
  const swUrl = URL.createObjectURL(blob);
  navigator.serviceWorker.register(swUrl, { scope: '/' })
    .catch(() => {/* SW optionnel, pas bloquant */});
}

/* ─── Refresh AK unique 5 min après premier embarqué ─────────────────────── */

function openLightbox(src){
  const ov = document.getElementById('lightboxOverlay');
  const img = document.getElementById('lightboxImg');
  img.src = src;
  // S'assurer que le lightbox est un enfant direct du body (échappe overflow:hidden du modal LDM)
  if(ov.parentNode !== document.body) document.body.appendChild(ov);
  ov.style.display = 'flex';
  // Autoriser le zoom pinch sur l'image
  document.querySelector('meta[name="viewport"]').setAttribute('content',
    'width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=yes');
  document.addEventListener('keydown', _lightboxKey);
}
function closeLightbox(){
  document.getElementById('lightboxOverlay').style.display = 'none';
  // Réinterdire le zoom sur l'UI
  document.querySelector('meta[name="viewport"]').setAttribute('content',
    'width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no');
  document.removeEventListener('keydown', _lightboxKey);
}
function _lightboxKey(e){ if(e.key === 'Escape') closeLightbox(); }

// Init au chargement de la page
window.addEventListener('load', initForm);

// iOS : désactive le scroll quand le contenu rentre dans app-wrap
window.addEventListener('load', function(){
  const wrap = document.querySelector('.app-wrap');
  if (!wrap) return;
  function syncOverflow(){
    wrap.style.overflowY = wrap.scrollHeight > wrap.clientHeight + 1 ? 'auto' : 'hidden';
  }
  // Mise à jour à chaque changement de taille ou de contenu
  new ResizeObserver(syncOverflow).observe(wrap);
  new MutationObserver(syncOverflow).observe(wrap, { childList:true, subtree:true });
  syncOverflow();
});
