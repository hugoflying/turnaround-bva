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
    if(id === 'Cie' || id === 'From' || id === 'To' || id === 'AIBT' || id === 'AOBT'){
      autoOpenCrewIfNeeded();
    }
  }, true);
});

/* Timeline */
let timelineZoom = 1;
const TL_ZOOM_MIN = 0.5;
const TL_ZOOM_MAX = 4;
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

/* Poids par soute :
   FR/RK = 13 kg par bagage, toujours (Hugo, v2.50)
   autres = poids moyen du FINAL (POIDS / BAGS), affiché « ≈ » */
function holdBagKg(){
  const cie = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const to  = (document.getElementById('To')?.value  || '').toUpperCase().trim();
  // v2.50 (Hugo) : FR/RK, un bagage = toujours 13 kg ; autres compagnies = poids moyen POIDS / BAGS
  if(cie === 'FR' || cie === 'RK') return { kg: 13, approx:false };
  const poids = parseInt(document.getElementById('FinalPOIDS')?.value, 10);
  const bags  = parseInt(document.getElementById('FinalBAGS')?.value, 10);
  if(poids > 0 && bags > 0) return { kg: poids / bags, approx:true };
  return null;
}

function updateHWeights(){
  const k = holdBagKg();
  ['FinalH1','FinalH2','FinalH3','FinalH4'].forEach(id => {
    const inp = document.getElementById(id);
    const lbl = document.getElementById(id + 'w');
    if(!inp || !lbl) return;
    const bags = parseInt(inp.value, 10);
    const show = !!k && !isNaN(bags) && bags > 0;
    lbl.style.display = show ? '' : 'none';
    lbl.textContent = show ? `${k.approx ? '≈ ' : ''}${Math.round(bags * k.kg)} kg` : '';
  });
  // Poids moyen d'un bagage affiché sous BAGS (hors FR/RK, qui comptent 13 kg)
  const avg = document.getElementById('FinalBagAvg');
  if(avg){
    const on = !!k && k.approx;
    avg.style.display = on ? '' : 'none';
    avg.textContent = on ? 'moy. ' + k.kg.toFixed(1).replace('.', ',') + ' kg' : '';
  }
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

  // v3.07 (Hugo) : les soutes contiennent BAGS + GB
  const gb = parseInt(document.getElementById('FinalGB')?.value || '0', 10) || 0;
  bagsEl.classList.toggle('is-invalid', bags > 0 && sum !== bags + gb);
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

/* ===== Poids d'un GB : 13 kg, sauf Volotea vers BIA ou AJA = 11 kg ===== */
function gbKg(){
  const cie = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const to  = (document.getElementById('To')?.value  || '').toUpperCase().trim();
  return (cie === 'V7' && (to === 'BIA' || to === 'AJA')) ? 11 : 13;
}

/* ===== POIDS CORRIGÉ = POIDS + GB × poids GB (si GB > 0, sinon = POIDS) ===== */
function updatePoidsCorrige(){
  const poids = parseInt(document.getElementById('FinalPOIDS')?.value) || 0;
  const gb    = parseInt(document.getElementById('FinalGB')?.value)    || 0;
  const el    = document.getElementById('FinalPoidsCorrige');
  if(!el) return;
  el.value = gb > 0 ? poids + (gb * gbKg()) : (poids || '');
  updateHWeights();
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

  // v2.39 (Hugo) : immat non listée en Y186 = Y180
  if(immat && !(cfg && /186/.test(cfg.config || '')) && getA320Ver() === '186'){
    setA320Ver('180');
    updateInfoStrip();
  }

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

/* v2.39 : ligne « Configuration cabine » Y180 / Y186 dans la carte Vol (W4/W6 + A320) */
function setA320VerUI(v){
  setA320Ver(v);
  updateFinalPlaceholdersFRRK();  // met à jour les zones OA/OB/OC
  updateInfoStrip();
}
function renderA320VerBadge(){
  const row = document.getElementById('ivCabRow');
  if(!row) return;
  const cie  = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const type = (document.getElementById('TypeAvion')?.value || '').toUpperCase().trim();
  const applies = (cie === 'W4' || cie === 'W6') && type === 'A320';
  row.hidden = !applies;
  if(!applies) return;
  const ver = getA320Ver();
  const immat = (document.getElementById('Immat')?.value || '').trim().toUpperCase();
  const cfg = getAcConfig(immat);
  const known186 = !!(cfg && /186/.test(cfg.config || ''));
  let why;
  if(!immat) why = 'Immat non saisie';
  else if(known186) why = ver === '186' ? 'Connue en Y186 pour ' + immat : 'Changé à la main (' + immat + ' est connue en Y186)';
  else why = ver === '180' ? 'Immat non listée en Y186' : 'Changé à la main';
  row.querySelector('.cab-why').textContent = why;
  row.querySelectorAll('[data-ver]').forEach(b => b.classList.toggle('is-on', b.dataset.ver === ver));
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
  // Le libelle "Envoi eLID / Remise LID" depend du mode :
  //  - dans le panneau Timing / Depart
  if(typeof updateLIDVisibility === 'function') updateLIDVisibility();
  //  - et l'heure du badge LID du header (EOBT-5 / EOBT-8)
  if(typeof updateLID === 'function') updateLID();
  //  - et sur la timeline
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
    bar.className = 'lid-sw';
    bar.innerHTML = `<button type="button" id="lidModeELID">eLID</button><button type="button" id="lidModeLID">Paper LID</button>`;
    // v2.23 : le sélecteur est dans le bandeau TOB
    const slot = document.getElementById('ldHeroLid');
    if(slot) slot.appendChild(bar); else row.insertAdjacentElement('beforebegin', bar);
    bar.querySelector('#lidModeELID').addEventListener('click', ()=> switchLidMode('ELID'));
    bar.querySelector('#lidModeLID').addEventListener('click',  ()=> switchLidMode('LID'));
  }

  bar.style.display = 'flex';

  const elid = isELID();
  bar.querySelector('#lidModeELID')?.classList.toggle('on', elid);
  bar.querySelector('#lidModeLID')?.classList.toggle('on', !elid);
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

/* ===== Etat visuel des pastilles horaires =====
   vert = a venir | orange = dans 5 min ou moins | rouge = depassee.
   Concerne HLE, H-15, eLID/LID, LDS et EOBT. CTOT et CD sont exclus
   (CD gere deja sa propre mise en evidence via .cd-over). */
const CHIP_TIME_IDS = ['timer-h40','timer-h15','timer-h8','timer-lds','timer-eobt'];

/* Minuteur dedie aux pastilles : le compte a rebours ne tourne que si toutes
   les heures de base sont saisies ET que l'AOBT est vide. Les couleurs, elles,
   doivent suivre l'heure courante en permanence -> intervalle independant. */
let chipColorTimer = null;
function startChipColorTimer(){
  if(chipColorTimer) return;
  updateChipColors();
  chipColorTimer = setInterval(updateChipColors, 10000);   // 10 s suffit (seuils a la minute)
}

/* ===== Popup regulation CTOT =====
   Au clic sur la pastille CTOT : affiche la cause du creneau (regulation AK). */
function showCtotRegulation(){
  const ctot = (document.getElementById('CTOT')?.value || '').trim();
  const modal = document.getElementById('ctotRegModal');
  const body  = document.getElementById('ctotRegBody');
  const hEl   = document.getElementById('ctotRegHeure');
  if(!modal || !body) return;

  // v2.45 (Hugo : C) : frise EOBT / push estimé / fenêtre de décollage, régulation, slots reçus
  const tzSuf = isUTC ? 'Z' : 'LT';
  const editHtml = '<div class="ct-edit">'
    + '<input id="ctotManualInput" class="input num" type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM" value="' + escapeHtml(ctot) + '" aria-label="CTOT (' + tzSuf + ')">'
    + '<button type="button" class="btn btn-primary" onclick="applyManualCtot()">Appliquer</button>'
    + (ctot ? '<button type="button" class="btn ct-del" onclick="clearManualCtot()">Suppr.</button>' : '')
    + '</div>';

  if(!ctot){
    body.innerHTML = '<p class="ct-none">Aucun CTOT actif sur ce vol. Tu peux en saisir un à la main.</p>' + editHtml;
    if(hEl) hEl.textContent = '';
    modal.style.display = 'flex';
    return;
  }
  if(hEl) hEl.innerHTML = escapeHtml(ctot) + ' <small>' + tzSuf + '</small>';

  let reg = null, ctotHistory = [];
  try{
    const data = JSON.parse(localStorage.getItem('tab-'+currentTabId) || '{}');
    reg = data?.akMeta?.regulation || null;
    if(Array.isArray(data?.akMeta?.ctotHistory)) ctotHistory = data.akMeta.ctotHistory;
  }catch(_){ }

  const fm = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0'); };
  const C = parseHHMM(ctot);
  const rel = m => (m == null) ? null : ((((m - C) % 1440) + 2160) % 1440) - 720;   // minutes relatives au CTOT
  const eobtR = rel(window._eobtRawMins ?? null);
  // Push estimé = CTOT − 15, mais jamais avant l'EOBT (slot trop proche : on pousse à l'EOBT)
  const pushR = (eobtR != null) ? Math.max(-15, eobtR) : -15, wFrom = -5, wTo = 10;
  const lo = Math.min(pushR, eobtR ?? pushR, wFrom) - 6, hi = Math.max(wTo, eobtR ?? wTo) + 6;
  const X = r => ((r - lo) / (hi - lo) * 100).toFixed(1) + '%';
  // Libellés sur deux rangées (haut / bas) sans chevauchement ; même minute = une seule étiquette
  // Largeur estimée d'une étiquette, en % de la frise (texte du libellé ou de l'heure)
  const wOf = lbl => Math.max(16, lbl.length * 2.6 + 6);
  const mks = [];
  const place = (r, lbl, cls, pref, optional) => {
    const x = (r - lo) / (hi - lo) * 100;
    const same = mks.find(m => m.r === r);
    if(same){ same.lbl += ' · ' + lbl; return; }
    const free = row => !mks.some(m => m.row === row && Math.abs(m.x - x) < (wOf(m.lbl) + wOf(lbl)) / 2);
    let row = free(pref) ? pref : (free(1 - pref) ? 1 - pref : -1);
    if(row < 0 && !optional) row = pref;
    mks.push({ r, x, lbl, cls, row });                          // row −1 : trait seul, sans étiquette
  };
  place(0, 'CTOT', 'ctot', 0);
  if(eobtR != null) place(eobtR, 'EOBT', 'eobt', 0);
  place(pushR, 'PUSH EST.', 'push', 1);
  place(wFrom, 'DÉCOL. −5', 'win', 1, true);
  place(wTo, '+10', 'win', 1, true);
  const frise = '<div class="ct-track">'
    + '<div class="ct-axis"></div>'
    + ((eobtR != null && pushR > eobtR) ? '<div class="ct-gap" style="left:' + X(eobtR) + ';width:calc(' + X(pushR) + ' - ' + X(eobtR) + ')"></div>' : '')
    + '<div class="ct-win" style="left:' + X(wFrom) + ';width:calc(' + X(wTo) + ' - ' + X(wFrom) + ')"></div>'
    + mks.map(m => '<div class="ct-mk ' + m.cls + (m.row === 1 ? ' lo' : '') + (m.row < 0 ? ' bare' : '') + '" style="left:' + m.x.toFixed(1) + '%"><span>' + m.lbl + '</span><b class="num">' + fm(C + m.r) + '</b><i></i></div>').join('')
    + '</div>'
    + '<div class="ct-cap num">Décollage entre <b>' + fm(C + wFrom) + '</b> et <b>' + fm(C + wTo) + '</b></div>';

  const dly = (eobtR != null) ? pushR - eobtR : null;
  const dlyHtml = (dly == null) ? ''
    : '<div class="ct-band ' + (dly > 0 ? 'late' : 'ok') + '"><span>Retard estimé</span><b class="num">' + (dly > 0 ? '+' + dly + ' min' : 'Aucun') + '</b></div>';
  const pushHtml = '<div class="ct-band push"><span>Push estimé' + (pushR > -15 ? ' · à l\'EOBT' : '') + '</span><b class="num">' + fm(C + pushR) + '</b></div>';

  let regHtml;
  if(reg){
    const descTxt = (reg.description || '').trim(), remarkTxt = (reg.remark || '').trim();
    const box = (lbl, txt) => '<div class="ct-box"><small>' + lbl + '</small>' + escapeHtml(txt) + '</div>';
    regHtml = '<div class="ct-reg">' + (reg.regul ? '<b>' + escapeHtml(reg.regul) + '</b>' : '')
      + (reg.reason ? '<span class="ct-tag am">' + escapeHtml(reg.reason) + '</span>' : '')
      + (reg.cause ? '<span class="ct-tag">' + escapeHtml(reg.cause) + '</span>' : '') + '</div>'
      + (descTxt ? box('Description', descTxt) : '')
      + (remarkTxt ? box('Remarque', remarkTxt) : '');
  } else {
    regHtml = '<p class="ct-none">Aucune information de régulation transmise par Airport Keeper.</p>';
  }

  const fmtMs = ms => { const d = new Date(ms); if(isNaN(d.getTime())) return ''; return String(isUTC ? d.getUTCHours() : d.getHours()).padStart(2,'0') + ':' + String(isUTC ? d.getUTCMinutes() : d.getMinutes()).padStart(2,'0'); };
  const histHtml = (ctotHistory && ctotHistory.length >= 2)
    ? '<div><div class="ct-k">Slots reçus</div><div class="ct-chain num">'
      + ctotHistory.map((h, i) => {
          const t = h.iso ? fmtMs(h.iso) : (h.hhmm || '');
          const on = i === ctotHistory.length - 1;
          return '<span class="' + (on ? 'on' : '') + '" title="vu ' + escapeHtml(fmtMs(h.seenAt)) + '">' + escapeHtml(t) + (h.manual ? ' <small>man</small>' : '') + '</span>';
        }).join('<i>→</i>')
      + '</div></div>'
    : '';

  body.innerHTML = frise + dlyHtml + pushHtml + regHtml + histHtml + editHtml;
  modal.style.display = 'flex';
}

function applyManualCtot(){
  const inp = document.getElementById('ctotManualInput');
  if(!inp) return;
  const m = /^(\d{1,2}):?(\d{2})$/.exec((inp.value || '').trim());
  if(!m){ inp.style.borderColor = '#ef4444'; return; }
  const hh = parseInt(m[1],10), mm = parseInt(m[2],10);
  if(hh > 23 || mm > 59){ inp.style.borderColor = '#ef4444'; return; }
  const val = String(hh).padStart(2,'0') + ':' + String(mm).padStart(2,'0');
  const ctotEl = document.getElementById('CTOT');
  if(ctotEl) ctotEl.value = val;
  const timerCtot = document.getElementById('timer-ctot');
  if(timerCtot) timerCtot.textContent = val;

  // Enregistrer la modif dans l'historique CTOT, marquee (man)
  try{
    const refDay = (typeof cdRefDayMs === 'function') ? cdRefDayMs() : null;
    const iso = (refDay != null) ? new Date(refDay + hh*3600000 + mm*60000).toISOString() : '';
    const data = JSON.parse(localStorage.getItem('tab-'+currentTabId) || '{}');
    if(!data.akMeta) data.akMeta = {};
    const hist = Array.isArray(data.akMeta.ctotHistory) ? data.akMeta.ctotHistory : [];
    const last = hist.length ? hist[hist.length-1] : null;
    if(!last || last.hhmm !== val){
      hist.push({ iso: iso, hhmm: val, seenAt: Date.now(), manual: true });
      data.akMeta.ctotHistory = hist;
      localStorage.setItem('tab-'+currentTabId, JSON.stringify(data));
    }
  }catch(_){}

  if(typeof updateChipColors === 'function') updateChipColors();
  if(typeof updateAllCalculations === 'function') updateAllCalculations();
  if(typeof saveCurrentTabData === 'function') saveCurrentTabData();
  const modal = document.getElementById('ctotRegModal');
  if(modal) modal.style.display = 'none';
}

function clearManualCtot(){
  const ctotEl = document.getElementById('CTOT');
  if(ctotEl) ctotEl.value = '';
  const timerCtot = document.getElementById('timer-ctot');
  if(timerCtot) timerCtot.textContent = '--:--';
  if(typeof updateChipColors === 'function') updateChipColors();
  if(typeof updateAllCalculations === 'function') updateAllCalculations();
  if(typeof saveCurrentTabData === 'function') saveCurrentTabData();
  const modal = document.getElementById('ctotRegModal');
  if(modal) modal.style.display = 'none';
}

function updateChipColors(){
  // getNowMinutes() renvoie l'heure courante DANS LE MEME REFERENTIEL que les
  // pastilles (local ou UTC selon isUTC). Utiliser new Date().getHours() ici
  // comparerait une heure UTC affichee a un "maintenant" local -> faux ecart.
  // v2.75.2 : à la seconde près, une échéance passée de quelques secondes est déjà rouge
  const nowParts = getNowMinutes();
  const nowMin = nowParts.mins + nowParts.secs / 60;

  CHIP_TIME_IDS.forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;

    el.classList.remove('chip-ok','chip-soon','chip-late');

    const txt = (el.textContent || '').trim();
    const m = /^(\d{1,2}):(\d{2})$/.exec(txt);
    if(!m) return;                       // "--:--" : on laisse la couleur par defaut

    const target = parseInt(m[1],10)*60 + parseInt(m[2],10);
    let diff = target - nowMin;          // minutes restantes
    if(diff < -720) diff += 1440;        // echeance passee minuit
    if(diff >  720) diff -= 1440;

    if(diff < 0)       el.classList.add('chip-late');
    else if(diff <= 5) el.classList.add('chip-soon');
    else               el.classList.add('chip-ok');
  });
}

/* Debut de journee (minuit) du vol courant, en ms absolus, pour dater les
   echeances du compte a rebours.
   Source prioritaire : le champ Date (yyyy-mm-dd), present et rempli dans les
   deux apps (auto = date du jour, ou valeur importee). A defaut, on lit
   akMeta.timeISO (COMPANION / Airport Keeper). Retourne null si rien de fiable
   -> le compte a rebours retombe sur l'ancien comportement 24h. */
function cdRefDayMs(){
  // 1) champ Date visible
  const dv = (document.getElementById('Date')?.value || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dv);
  if(m){
    const y = +m[1], mo = +m[2]-1, da = +m[3];
    return isUTC ? Date.UTC(y, mo, da) : new Date(y, mo, da).getTime();
  }

  // 2) fallback : SOBT/SIBT complet importe d'AK
  let iso = '';
  try{
    const data = JSON.parse(localStorage.getItem('tab-'+currentTabId) || '{}');
    iso = data?.akMeta?.timeISO || '';
  }catch(_){ }
  if(!iso) return null;
  const d = new Date(iso);
  if(isNaN(d.getTime())) return null;
  if(isUTC){
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/* ===== MTT — Minimum Turnaround Time (en minutes) =====
   H4         : 30
   W4 / W6    : A321/A21N -> 35 ; A320/A20N -> 30
   FR / RK    : 25 ; 35 si changement d'equipage (Arr PNT et/ou Arr PNC renseignes)
   Autres     : null (non defini) */
function getMTT(){
  const cie  = (document.getElementById('Cie')?.value || '').toUpperCase().trim();
  const type = (document.getElementById('TypeAvion')?.value || '').toUpperCase();
  const isA321fam = type.includes('321') || type.includes('21N');

  if(cie === 'H4' || cie === 'V7') return 30;
  if(cie === 'W4' || cie === 'W6') return isA321fam ? 35 : 30;
  if(cie === 'FR' || cie === 'RK'){
    const crewChange = !!((document.getElementById('ArrPNT')?.value || '').trim()
                        || (document.getElementById('ArrPNC')?.value || '').trim());
    return crewChange ? 35 : 25;   // 25 de base, +10 (=> 35) si changement d'equipage
  }
  return null;
}

function updateCountdownOnce(){
  updateChipColors();   // rafraichit vert/orange/rouge chaque seconde
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

  // v2.74.1 : cible = EOBT calculé (il vaut le SOBT quand la règle le donne) ; SOBT seulement à défaut
  let targetMin = null;
  if (window._eobtRawMins != null) targetMin = window._eobtRawMins;
  else if (AIBT <= SIBT) targetMin = SOBT;
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

  // Date de reference du vol (SOBT/SIBT complet importe d'AK). Si on la connait,
  // on calcule l'ecart en tenant compte du JOUR : sinon un vol d'hier soir
  // "reviendrait" ce matin comme un vol a venir (fenetre de 24h seulement).
  let remainingSeconds = null;
  const refDayMs = cdRefDayMs();
  if(refDayMs != null){
    // Horodatage absolu de l'echeance = jour de reference (minuit du SOBT) +
    // targetMin. Si l'echeance passe minuit (EOBT du lendemain), targetMin est
    // petit alors que le vol est le soir : on la reporte au jour suivant si
    // elle tombe plus de 12h AVANT le SOBT de reference.
    const sobtRefMs = refDayMs + SOBT * 60000;   // SOBT = ancre "jour du vol"
    let targetMs = refDayMs + targetMin * 60000;
    if(targetMs < sobtRefMs - 12*3600000) targetMs += 86400000;
    remainingSeconds = Math.round((targetMs - Date.now()) / 1000);
  } else {
    // Pas de date connue (vol saisi a la main) : ancien comportement sur 24h
    let diffMin = targetMin - now.mins;
    if(diffMin < -720) diffMin += 1440;
    if(diffMin > 720) diffMin -= 1440;
    remainingSeconds = diffMin * 60 - now.secs;
  }

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
