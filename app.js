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

/* ===== LOAD MODAL (single fullscreen) ===== */



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
  if(mode === 'fuel') updateFuelAcHeader();

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

/* ===== FINAL : calcul ADULT + TOB + contrôle OA/OB/OC/OD ===== */
function asInt(id){
  const v = (document.getElementById(id)?.value || '').trim();
  if(v === '') return null;
  const n = parseInt(v,10);
  return isNaN(n) ? null : n;
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
  if(!hasTab){ if(!window._wasNoTab && typeof window.homeKickSlideshow === 'function') window.homeKickSlideshow(); window._wasNoTab = true; }
  else window._wasNoTab = false;

  // Mettre à jour le padding immédiatement après affichage du app-wrap
  requestAnimationFrame(() => updateHeaderOffset());

  if(!hasTab){
    currentTabId = null;
    closeAKPicker();
    stopCountdown(true);
    closeFlightWindows();
    if(typeof uiTab === 'function') try{ uiTab('vol'); }catch(e){}
  }
}

/* v2.97 (Hugo) : fermer le vol en cours ferme toutes les fenêtres liées à ce vol
   (sinon elles restent ouvertes et peuvent bloquer l'écran). Les outils du menu restent ouverts. */
function closeFlightWindows(){
  const ldm = document.getElementById('ldmModal');
  if(ldm && ldm.style.display !== 'none' && ldm.style.display !== '') closeLDM();
  if(typeof closeFuelMenu === 'function') try{ closeFuelMenu(); }catch(e){}
  const KEEP = ['infoEscaleModal','annuaireModal','degivrageModal','signModal','closeAllModal'];
  document.querySelectorAll('.sheet-modal').forEach(m => { if(!KEEP.includes(m.id)) m.style.display = 'none'; });
  const lb = document.getElementById('lightboxOverlay'); if(lb) lb.style.display = 'none';
  if(document.body.classList.contains('modal-open')) unlockScroll();
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

    ['wheel','mousedown','touchstart','keydown'].forEach(ev=>{
      scroller.addEventListener(ev, ()=>{ window._tlLastTouch = Date.now(); }, {passive:true});
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

  // Couleurs des pastilles : rafraichissement continu, independant du
  // compte a rebours (qui, lui, ne tourne pas dans toutes les situations).
  startChipColorTimer();
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
  // v2.58 : vol créé à la main sans n° d'arrivée → on n'affiche que le n° de départ (et inversement)
  const fnoEl = document.getElementById('kvArrVol')?.parentElement;
  if(fnoEl){
    fnoEl.classList.toggle('no-arr', !arrFF && !!depFF);
    fnoEl.classList.toggle('no-dep', !depFF && !!arrFF);
  }

  set('kvFrom', v('From') || '---', '---');
  set('kvTo',   v('To')   || '---', '---');

  set('kvImmat', v('Immat') || '------', '------');
  set('kvType',  v('TypeAvion') || '----', '----');

  // Badge version cabine A320 (W4/W6) à côté du type
  renderA320VerBadge();

  // PAF (police aux frontieres) : plus de champ BorderControl -> on prend akMeta.bc
  // PAF : on n'affiche le "· valeur" que si elle est connue
  set('kvBC', bcMeta || '--', '--');
  const bcWrap  = document.getElementById('kvBCWrap');
  const bcTitle = document.getElementById('kvParkTitle');
  if(bcWrap)  bcWrap.style.display = bcMeta ? '' : 'none';
  if(bcTitle) bcTitle.textContent  = 'Parking';

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
/* Bouton "Vols" : clic = liste Airport Keeper,
   double-clic ou appui long (500 ms) = nouveau vol hors Keeper.
   Les deux gestes coexistent : double-clic au clavier/souris, appui long au doigt. */
function wireVolsButton(){
  const btn = document.getElementById('volsBtn');
  if(!btn) return;

  let pressTimer = null;
  let longFired  = false;   // un appui long ne doit pas declencher aussi le clic
  let clickTimer = null;

  const openManual = ()=>{
    longFired = true;
    clearTimeout(clickTimer); clickTimer = null;
    if(typeof createManualFlight === 'function') createManualFlight();
  };

  // --- souris / clavier ---
  btn.addEventListener('click', ()=>{
    if(longFired){ longFired = false; return; }
    // On attend un eventuel second clic avant d'ouvrir la liste
    clearTimeout(clickTimer);
    clickTimer = setTimeout(()=>{
      clickTimer = null;
      if(typeof openAKPicker === 'function') openAKPicker();
    }, 260);
  });

  btn.addEventListener('dblclick', (e)=>{
    e.preventDefault();
    clearTimeout(clickTimer); clickTimer = null;
    if(typeof createManualFlight === 'function') createManualFlight();
  });

  // --- tactile : appui long ---
  const startPress = ()=>{
    longFired = false;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(openManual, 500);
  };
  const cancelPress = ()=>{ clearTimeout(pressTimer); pressTimer = null; };

  btn.addEventListener('touchstart', startPress, { passive:true });
  btn.addEventListener('touchend',   cancelPress);
  btn.addEventListener('touchmove',  cancelPress, { passive:true });
  btn.addEventListener('touchcancel',cancelPress);

  // Empeche le menu contextuel pendant l'appui long
  btn.addEventListener('contextmenu', e=> e.preventDefault());
}

function renderTabs(){
  const tabBar = document.getElementById('tab-bar');
  if(!tabBar) return;

  // Un seul bouton : clic = liste Airport Keeper,
  // double-clic ou appui long = creation d'un vol hors AK.
  // Bouton Vols : placé avant la bande défilante des onglets (jamais recouvert)
  document.getElementById('volsBtn')?.remove();
  tabBar.innerHTML = '';
  tabBar.insertAdjacentHTML('beforebegin', `
    <button class="vols-btn" type="button" id="volsBtn" aria-label="Ajouter un vol"
            title="Clic : liste des vols — Double-clic ou appui long : vol hors Keeper">
      <svg class="ico"><use href="#i-plus"/></svg><span class="vb-t">Vols</span>
    </button>`);
  wireVolsButton();

  let tabs = JSON.parse(localStorage.getItem('flightTabs') || '[]');
  if(!Array.isArray(tabs)) tabs = [];
  if(window.uiSortedTabIds) tabs = window.uiSortedTabIds(tabs.map(String));

  tabs.forEach((id)=>{
    const data = JSON.parse(localStorage.getItem('tab-'+id) || '{}');

    const cie  = (data.Cie  || '').toUpperCase();
    const nvol = (data.NVol || '').toUpperCase();
    const to   = (data.To   || '').toUpperCase().trim();
    const from = (data.From || '').toUpperCase().trim();

    // Libellé : n° du départ | destination,
    // ou n° de l'arrivée | provenance s'il n'y a pas de départ lié,
    // à défaut (vol manuel) Cie+N° | destination.
    const depFF = (data?.akMeta?.depFF || '').toUpperCase().trim();
    const arrFF = (data?.akMeta?.arrFF || '').toUpperCase().trim();
    const manual = `${cie}${nvol}`.trim();
    let volRef, place;
    if(depFF)      { volRef = depFF;  place = to;   }
    else if(arrFF) { volRef = arrFF;  place = from; }
    else           { volRef = manual; place = to;   }

    let label =
      volRef || place
        ? (place ? `${volRef} | ${place}`.trim() : volRef)
        : 'VOL';

    const wrap = document.createElement('span');
    wrap.className = 'tab-wrap flt' + (id === currentTabId ? ' is-on' : '');

    // bouton onglet (switch)
    const btn = document.createElement('button');
    btn.className = 'flt-go';
    btn.type = 'button';
    // B3 : rond compagnie entouré de l'anneau d'avancement, puis n° et escale
    const cieCode = (cie || volRef.slice(0,2) || '').slice(0,2);
    const num = volRef ? (cieCode && volRef.startsWith(cieCode) ? volRef.slice(cieCode.length) : volRef) : '';
    btn.innerHTML = (volRef || place)
      ? `<span class="flt-cie"><b>${escapeHtml(cieCode || '–')}</b></span><span class="flt-n">${escapeHtml(num)}</span>${place ? `<span class="flt-d">${escapeHtml(place)}</span>` : ''}`
      : `<span class="flt-cie"><b>–</b></span><span class="flt-n">VOL</span>`;
    btn.setAttribute('aria-label', label || 'VOL');
    wrap.dataset.tab = id;
    btn.onclick = ()=> switchTab(id);
    btn.ondblclick = ()=> openTabCloseModal(id);

    // Bouton refresh ↻ — toujours affiché, grisé si pas de AK
    const r = document.createElement('button');
    r.className = 'tab-refresh';
    r.type = 'button';
    r.title = 'Rafraîchir depuis AK';
    r.setAttribute('aria-label', 'Rafraîchir depuis AK');
    r.innerHTML = '<svg class="ico"><use href="#i-refresh"/></svg>';
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
    }

    wrap.appendChild(btn);
    wrap.appendChild(r);
    tabBar.appendChild(wrap);
  });

  // Garder l'onglet actif visible dans la bande défilante
  const on = tabBar.querySelector('.flt.is-on');
  if(on && on.scrollIntoView) on.scrollIntoView({ block:'nearest', inline:'nearest' });

  updateHeaderOffset();
  // v2.89 : le Récap suit tout de suite les onglets (avant : jusqu'à 15 s d'attente)
  clearTimeout(window._rcSoon);
  window._rcSoon = setTimeout(()=>{ if(window.uiRecapRefresh) window.uiRecapRefresh(); }, 120);
}

/* ===== VOLS EN DOUBLE : detection + synchronisation locale =====
   Tout se passe dans le localStorage de l'appareil : aucun serveur.
   Deux onglets qui pointent le meme vol (meme cle) sont "jumeaux" :
   ce qui est saisi sur l'un est recopie sur l'autre a chaque sauvegarde. */

// Cle d'un vol Airport Keeper, au meme format que getTabFlightKey()
function akFlightKey(f){
  const id = String(f?.id || '').trim();
  return id ? ('AK_' + id) : null;
}

// Cle de ROTATION : identique pour l'arrivee et le depart d'un meme avion.
// Construite a partir de la paire {id, linkedId} triee, donc independante
// du troncon (ARR ou DEP) qu'on regarde.
function akRotKeyFrom(id, linkedId){
  id = String(id || '').trim();
  linkedId = String(linkedId || '').trim();
  if(!id) return null;
  if(linkedId){
    const p = [id, linkedId].sort();
    return 'AKROT_' + p[0] + '_' + p[1];
  }
  return 'AK_' + id;   // pas de jumeau connu -> cle simple
}

// Cle de rotation d'un vol AK au moment de l'ouverture : on resout le
// troncon oppose (meme logique que _doApplyAKFlight : linkedId puis
// fallback immat + meme jour operationnel) pour obtenir la meme cle
// que celle stockee dans akMeta.
function akRotKey(f, flow){
  const selfId = String(f?.id || '').trim();
  if(!selfId) return null;
  // Meme priorite que resolvedLinkedId dans _doApplyAKFlight :
  // le troncon resolu (linkedId valide meme-jour OU immat+meme-jour) d'abord,
  // puis f.linkedId brut en dernier recours.
  let otherId = '';
  try{
    const other = (String(flow).toUpperCase() === 'ARR')
      ? findLinkedDepForArr(f)
      : findLinkedArrForDep(f);
    if(other && other.id) otherId = String(other.id).trim();
  }catch(_){}
  if(!otherId) otherId = String(f?.linkedId || '').trim();
  return akRotKeyFrom(selfId, otherId);
}

// Cherche un onglet deja ouvert portant la meme cle de vol
function findTabByFlightKey(key, excludeTabId){
  if(!key) return null;
  let tabs = [];
  try{ tabs = JSON.parse(localStorage.getItem('flightTabs') || '[]'); }catch(_){ }
  if(!Array.isArray(tabs)) return null;
  for(const t of tabs){
    if(excludeTabId && String(t) === String(excludeTabId)) continue;
    if(getTabFlightKey(t) === key) return String(t);
  }
  return null;
}

// Tous les jumeaux de l'onglet courant (hors lui-meme)
function findSiblingTabs(tabId){
  const key = getTabFlightKey(tabId);
  if(!key) return [];
  let tabs = [];
  try{ tabs = JSON.parse(localStorage.getItem('flightTabs') || '[]'); }catch(_){ }
  if(!Array.isArray(tabs)) return [];
  return tabs.map(String).filter(t => t !== String(tabId) && getTabFlightKey(t) === key);
}

// Etat purement visuel : ne se propage pas d'un onglet a l'autre
const DUP_UI_KEYS = new Set(['ldmOpen','ldmMode','timingPanel','infovolOpen']);

// Permet de suspendre la synchro pendant la creation d'un onglet jumeau
// (sinon le nouvel onglet, encore vide, ecraserait le vol d'origine).
let _syncSuspended = false;

// Recopie les donnees de l'onglet source vers ses jumeaux
function syncSiblingTabs(tabId, data){
  if(_syncSuspended) return;
  const siblings = findSiblingTabs(tabId);
  if(!siblings.length) return;
  for(const sib of siblings){
    let target = {};
    try{ target = JSON.parse(localStorage.getItem('tab-'+sib) || '{}'); }catch(_){ }
    for(const k in data){
      if(DUP_UI_KEYS.has(k)) continue;   // l'onglet garde son propre affichage
      target[k] = data[k];
    }
    try{ localStorage.setItem('tab-'+sib, JSON.stringify(target)); }catch(_){ }
  }
}

// Recopie les donnees d'un onglet existant vers le nouvel onglet jumeau :
// c'est l'onglet DEJA rempli qui fait foi, jamais le nouveau (vide).
function seedTabFromSibling(newTabId, sourceTabId){
  if(!newTabId || !sourceTabId) return;
  let src = {}, dst = {};
  try{ src = JSON.parse(localStorage.getItem('tab-'+sourceTabId) || '{}'); }catch(_){ }
  try{ dst = JSON.parse(localStorage.getItem('tab-'+newTabId)   || '{}'); }catch(_){ }
  for(const k in src){
    if(DUP_UI_KEYS.has(k)) continue;   // chaque onglet garde son propre affichage
    dst[k] = src[k];
  }
  try{ localStorage.setItem('tab-'+newTabId, JSON.stringify(dst)); }catch(_){ }
}

/* ---- Modal "vol deja ouvert" ---- */
let _dupFlightCallback = null;

function openDupFlightModal(onConfirm){
  _dupFlightCallback = onConfirm || null;
  const m = document.getElementById('dupFlightModal');
  if(!m){ if(_dupFlightCallback){ const cb=_dupFlightCallback; _dupFlightCallback=null; cb(); } return; }
  m.style.display = 'flex';
}

function confirmDupFlight(){
  const m = document.getElementById('dupFlightModal');
  if(m) m.style.display = 'none';
  const cb = _dupFlightCallback;
  _dupFlightCallback = null;
  if(cb) cb();
}

function cancelDupFlight(){
  const m = document.getElementById('dupFlightModal');
  if(m) m.style.display = 'none';
  _dupFlightCallback = null;
}

function getTabFlightKey(tabId){
  try{
    const d = JSON.parse(localStorage.getItem('tab-'+tabId) || '{}');
    const meta = d?.akMeta;
    if(meta?.id) return akRotKeyFrom(meta.id, meta.linkedId);
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
    if(!el.id || el.id === 'utcToggle' || el.id === 'darkToggle') return;
    data[el.id] = (el.type === 'checkbox') ? (el.checked ? '1' : '0') : (el.value || '');
  });
  data.infovolOpen = '0';

  localStorage.setItem('tab-'+id, JSON.stringify(data));

  renderTabs();
  refreshUIForTabs();
  updateInfoStrip();
  renderTimeline();
}

/* v2.93 : vol créé à la main = ouvert directement sur « Modifier le vol » */
function createManualFlight(){
  createNewTab();
  if(typeof uiTab === 'function') uiTab('vol');
  setTimeout(()=>{
    const edit = document.getElementById('ivEdit');
    if(edit && edit.style.display !== 'flex') toggleInfoVolEdit();
  }, 50);
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
  id = String(id);
  let tabs = JSON.parse(localStorage.getItem('flightTabs') || '[]');
  if(!Array.isArray(tabs)) tabs = [];

  const idx = tabs.indexOf(id);
  if(idx === -1) return;

  // v2.97 : le vol affiché change (vol en cours fermé, ou bascule sur le voisin) → on ferme ses fenêtres
  const rest = tabs.filter(t => t !== id);
  const nextShown = rest.length ? rest[Math.max(0, idx - 1)] : null;
  if(String(nextShown) !== String(currentTabId)) closeFlightWindows();

  tabs.splice(idx, 1);
  localStorage.setItem('flightTabs', JSON.stringify(tabs));
  localStorage.removeItem('tab-' + id);
  // Purge du dessin de l'onglet (ancien stockage separe)
  try{ localStorage.removeItem('bnCanvas_' + id); }catch(_){ }
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
  data.timer_eobt=document.getElementById('timer-eobt')?.textContent || '--:--'; // v2.90 : tri du Récap par EOBT

  data.timingPanel = localStorage.getItem('timingPanel') || 'dep';

  // Prestations (menage, ASU, cargo...) : stockees dans une variable globale,
  // on les rattache a l'onglet pour qu'elles survivent au changement d'onglet
  // et au rechargement de la page.
  data.prestations = _prestationsData || {};
  data.assistances = _assistancesData || {};
  data.rza = _rzaData || {};

  // État du modal LOAD (ouvert/fermé + onglet actif)
  const ldmModal = document.getElementById('ldmModal');
  data.ldmOpen = ldmModal && ldmModal.style.display !== 'none' ? '1' : '0';
  data.ldmMode = _ldmMode || 'arr';

  localStorage.setItem('tab-'+currentTabId,JSON.stringify(data));
  localStorage.setItem('lastTabId',currentTabId);

  // Si ce vol est ouvert dans plusieurs onglets, on repercute la saisie
  // sur les jumeaux (100% local, aucun serveur).
  try{ syncSiblingTabs(currentTabId, data); }catch(_){ }

  renderTabs();
}

function loadTabData(id){
  currentTabId = String(id);

  // Prestations : variable globale -> on repart de zero, sinon celles de
  // l'onglet precedent resteraient visibles sur ce vol.
  _prestationsData = {};
  _assistancesData = {};
  _rzaData = {};

  const raw = localStorage.getItem('tab-'+currentTabId);
  if(!raw) return;

  const data = JSON.parse(raw);

  // Restaurer les prestations propres a CET onglet
  if(data.prestations && typeof data.prestations === 'object'){
    _prestationsData = data.prestations;
  }
  if(data.assistances && typeof data.assistances === 'object') _assistancesData = data.assistances;
  if(data.rza && typeof data.rza === 'object') _rzaData = data.rza;
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
            <div class="tw-display" id="tw-disp-${id}">--:--</div>
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
          <div class="span-6">${fieldHTML('PremierDebarque','1er débarqué (AV)')}</div>
          <div class="span-6">${fieldHTML('PremierDebarqueL2','1er débarqué (AR)')}</div>
          <div class="span-6">${fieldHTML('ArriveeFuel','Arrivée Avitair',true,false,'is-warning')}</div>
          <div class="span-6">${fieldHTML('DernierDebarque','Dernier débarqué')}</div>
          <div class="span-6">${fieldHTML('ArriveeLiftArr','Arrivée lift',false,false,'is-success')}</div>
          <div class="span-6">${fieldHTML('DepartLiftArr','Départ lift',false,false,'is-success')}</div>
        </div>
      </div>
    </div>

    <div id="evZoneArr">
    <div id="panel-tapis" class="card mb-3 ev-panel" data-ev="tapis" style="display:none;">
      <div class="ev-h"><i style="background:#0d9488"></i><b>Tapis bagages</b><button type="button" class="ev-x" onclick="toggleDepExtra('tapis')" aria-label="Masquer Tapis bagages">×</button></div>
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-6">${fieldHTML('MiseEnPlaceTapis','Mise en place tapis',false,false,'is-success')}</div>
        </div>
      </div>
    </div>

    <div id="panel-dechargement" class="card mb-3 ev-panel" data-ev="dechargement" style="display:none;">
      <div class="ev-h"><i style="background:#15803d"></i><b>Déchargement bagages</b><button type="button" class="ev-x" onclick="toggleDepExtra('dechargement')" aria-label="Masquer Déchargement bagages">×</button></div>
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-6">${fieldHTML('DebutDechargementBagages','Début déchargement',false,false,'is-success')}</div>
          <div class="span-6">${fieldHTML('FinDechargementBagages','Fin déchargement',false,false,'is-success')}</div>
        </div>
      </div>
    </div>

    <div id="panel-repositionnement" class="card mb-3 ev-panel" data-ev="repositionnement" style="display:none;">
      <div class="ev-h"><i style="background:#3273dc"></i><b>Repositionnement avion</b><button type="button" class="ev-x" onclick="toggleDepExtra('repositionnement')" aria-label="Masquer Repositionnement avion">×</button></div>
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-6">${fieldHTML('DebutRepositionnement','Début repositionnement',false,false,'is-link')}</div>
          <div class="span-6">${fieldHTML('FinRepositionnement','Fin repositionnement',false,false,'is-link')}</div>
        </div>
      </div>
    </div>
    </div>
    <button type="button" class="ev-add" id="evAddBtnArr" onclick="uiEvOpen('arr')"><span>+</span> Ajouter un événement</button>
`;

  /* ===== DÉPART ===== */
  const depNoHeader = `
    <div class="dep-extra-legacy" hidden>
      <button class="button is-rounded is-light dep-extra-btn" id="btn-crew" type="button" onclick="toggleDepExtra('crew')" style="font-weight:700;">Crew</button>
      <button class="button is-rounded is-light dep-extra-btn" id="btn-recherche-bag" type="button" onclick="toggleDepExtra('recherche-bag')" style="font-weight:700;">Recherche bag</button>
      <button class="button is-rounded is-light dep-extra-btn" id="btn-inad" type="button" onclick="toggleDepExtra('inad')" style="font-weight:700;">INAD</button>
      <button class="button is-rounded is-light dep-extra-btn" id="btn-gpu" type="button" onclick="toggleDepExtra('gpu')" style="font-weight:700;">Nayak</button>
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
        </div>
      </div>
    </div>

    <div id="evZone">
    <div id="panel-chargement" class="card mb-3 ev-panel" data-ev="chargement" style="display:none;">
      <div class="ev-h"><i style="background:#15803d"></i><b>Chargement bagages</b><button type="button" class="ev-x" onclick="toggleDepExtra('chargement')" aria-label="Masquer Chargement bagages">×</button></div>
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-6">${fieldHTML('DebutChargementBagages','Début chargement',false,false,'is-success')}</div>
          <div class="span-6">${fieldHTML('FinChargementBagages','Fin chargement',false,false,'is-success')}</div>
        </div>
      </div>
    </div>

    <div id="panel-casque" class="card mb-3 ev-panel" data-ev="casque" style="display:none;">
      <div class="ev-h"><i style="background:#7c3aed"></i><b>Connexion casque</b><button type="button" class="ev-x" onclick="toggleDepExtra('casque')" aria-label="Masquer Connexion casque">×</button></div>
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-6">${fieldHTML('ConnexionAgentCasque','Connexion casque',false,false,'is-purple')}</div>
        </div>
      </div>
    </div>

    <div id="panel-push" class="card mb-3 ev-panel" data-ev="push" style="display:none;">
      <div class="ev-h"><i style="background:#3273dc"></i><b>Push</b><button type="button" class="ev-x" onclick="toggleDepExtra('push')" aria-label="Masquer Push">×</button></div>
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-6">${fieldHTML('ConnexionPush','Connexion push',false,false,'is-link')}</div>
          <div class="span-6">${fieldHTML('ChangementPush','Changement de push',false,false,'is-link')}</div>
        </div>
      </div>
    </div>

    <div id="panel-soutes" class="card mb-3 ev-panel" data-ev="soutes" style="display:none;">
      <div class="ev-h"><i style="background:#7f1d1d"></i><b>Portes de soute</b><button type="button" class="ev-x" onclick="toggleDepExtra('soutes')" aria-label="Masquer Portes de soute">×</button></div>
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-6">${fieldHTML('FermetureSouteAV','Fermeture soute AV',false,false,'is-bordeaux')}</div>
          <div class="span-6">${fieldHTML('FermetureSouteAR','Fermeture soute AR',false,false,'is-bordeaux')}</div>
        </div>
      </div>
    </div>

    <div id="panel-echelles" class="card mb-3 ev-panel" data-ev="echelles" style="display:none;">
      <div class="ev-h"><i style="background:#636363"></i><b>Retrait échelles</b><button type="button" class="ev-x" onclick="toggleDepExtra('echelles')" aria-label="Masquer Retrait échelles">×</button></div>
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-6">${fieldHTML('RetraitEchelleAV','Retrait échelle AV',false,false,'is-dark')}</div>
          <div class="span-6">${fieldHTML('RetraitEchelleAR','Retrait échelle AR',false,false,'is-dark')}</div>
        </div>
      </div>
    </div>

    <div id="panel-reouverture" class="card mb-3 ev-panel" data-ev="reouverture" style="display:none;">
      <div class="ev-h"><i style="background:#D7263D"></i><b>Réouverture porte</b><button type="button" class="ev-x" onclick="toggleDepExtra('reouverture')" aria-label="Masquer Réouverture porte">×</button></div>
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-6">${fieldHTML('ReouverturePorteAvion','Réouverture porte avion',false,false,'is-bordeaux')}</div>
        </div>
      </div>
    </div>

    <div id="panel-comptage" class="card mb-3 ev-panel" data-ev="comptage" style="display:none;">
      <div class="ev-h"><i style="background:#15803d"></i><b>Comptage bagages</b><button type="button" class="ev-x" onclick="toggleDepExtra('comptage')" aria-label="Masquer Comptage bagages">×</button></div>
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-6">${fieldHTML('DebutComptageBagages','Début comptage',false,false,'is-success')}</div>
          <div class="span-6">${fieldHTML('FinComptageBagages','Fin comptage',false,false,'is-success')}</div>
        </div>
      </div>
    </div>
    <!-- Panneau Crew -->
    <div id="panel-crew" class="card mb-3 ev-panel" data-ev="crew" style="display:none;">
      <div class="ev-h"><i style="background:#334155"></i><b>Crew</b><button type="button" class="ev-x" onclick="toggleDepExtra('crew')" aria-label="Masquer Crew">×</button></div>
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-6">${fieldHTML('ArrPNT','Arrivée PNT',false,true,'is-dark')}</div>
          <div class="span-6">${fieldHTML('ArrPNC','Arrivée PNC',false,true,'is-dark')}</div>
        </div>
      </div>
    </div>

    <!-- Panneau Recherche bag -->
    <div id="panel-recherche-bag" class="card mb-3 ev-panel" data-ev="recherche-bag" style="display:none;">
      <div class="ev-h"><i style="background:#ec4899"></i><b>Recherche bag</b><button type="button" class="ev-x" onclick="toggleDepExtra('recherche-bag')" aria-label="Masquer Recherche bag">×</button></div>
      <div class="card-content">
        <div class="grid-auto">
          ${fieldHTML('RechercheBagDebut','Début de recherche',false,false,'is-pink')}
          ${fieldHTML('RechercheBagFin','Fin de recherche',false,false,'is-pink')}
        </div>
      </div>
    </div>

    <!-- Panneau INAD -->
    <div id="panel-inad" class="card mb-3 ev-panel" data-ev="inad" style="display:none;">
      <div class="ev-h"><i style="background:#D7263D"></i><b>INAD</b><button type="button" class="ev-x" onclick="toggleDepExtra('inad')" aria-label="Masquer INAD">×</button></div>
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-6">${fieldHTML('AnnonceINAD','Annonce INAD',false,true,'is-red')}</div>
          <div class="span-6">${fieldHTML('ArriveeINAD','Arrivée INAD',false,true,'is-red')}</div>
        </div>
      </div>
    </div>

    <!-- Panneau GPU -->
    <div id="panel-gpu" class="card mb-3 ev-panel" data-ev="gpu" style="display:none;">
      <div class="ev-h"><i style="background:#FFAD00"></i><b>Nayak</b><button type="button" class="ev-x" onclick="toggleDepExtra('gpu')" aria-label="Masquer Nayak">×</button></div>
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-4">${fieldHTML('AppelNayak','Appel Nayak',false,false,'is-jaune')}</div>
          <div class="span-4">${fieldHTML('ArriveeNayak','Arrivée Nayak',false,false,'is-jaune')}</div>
          <div class="span-4">${fieldHTML('DepartNayak','Départ Nayak',false,false,'is-jaune')}</div>
        </div>
      </div>
    </div>

    <!-- v2.36 : événements d'escale, affichés côté Arrivée ou Départ selon l'endroit où on les ajoute (champ EvCote) -->
    <div id="panel-cleaning" class="card mb-3 ev-panel" data-ev="cleaning" style="display:none;">
      <div class="ev-h"><i style="background:#0891b2"></i><b>Cleaning cabine</b><button type="button" class="ev-x" onclick="toggleDepExtra('cleaning')" aria-label="Masquer Cleaning cabine">×</button></div>
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-6">${fieldHTML('DebutCleaningCabine','Début cleaning cabine',false,false,'is-link')}</div>
          <div class="span-6">${fieldHTML('FinCleaningCabine','Fin cleaning cabine',false,false,'is-link')}</div>
        </div>
      </div>
    </div>
    <div id="panel-vidange" class="card mb-3 ev-panel" data-ev="vidange" style="display:none;">
      <div class="ev-h"><i style="background:#78716c"></i><b>Vidange toilettes</b><button type="button" class="ev-x" onclick="toggleDepExtra('vidange')" aria-label="Masquer Vidange toilettes">×</button></div>
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-6">${fieldHTML('DebutVidangeToilettes','Début vidange toilettes',false,false,'is-link')}</div>
          <div class="span-6">${fieldHTML('FinVidangeToilettes','Fin vidange toilettes',false,false,'is-link')}</div>
        </div>
      </div>
    </div>
    <div id="panel-eau" class="card mb-3 ev-panel" data-ev="eau" style="display:none;">
      <div class="ev-h"><i style="background:#2563eb"></i><b>Eau potable</b><button type="button" class="ev-x" onclick="toggleDepExtra('eau')" aria-label="Masquer Eau potable">×</button></div>
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-6">${fieldHTML('DebutEauPotable','Début eau potable',false,false,'is-link')}</div>
          <div class="span-6">${fieldHTML('FinEauPotable','Fin eau potable',false,false,'is-link')}</div>
        </div>
      </div>
    </div>
    <div id="panel-degivrage" class="card mb-3 ev-panel" data-ev="degivrage" style="display:none;">
      <div class="ev-h"><i style="background:#0ea5e9"></i><b>Dégivrage</b><button type="button" class="ev-x" onclick="toggleDepExtra('degivrage')" aria-label="Masquer Dégivrage">×</button></div>
      <div class="card-content">
        <div class="grid-auto">
          <div class="span-6">${fieldHTML('DebutDegivrage','Début dégivrage',false,false,'is-link')}</div>
          <div class="span-6">${fieldHTML('FinDegivrage','Fin dégivrage',false,false,'is-link')}</div>
        </div>
      </div>
    </div>
    <input id="EvCote" type="hidden">
    </div>
    <button type="button" class="ev-add" id="evAddBtn" onclick="uiEvOpen('dep')"><span>+</span> Ajouter un événement</button>
`;

  const toggle = `
    <div class="tabs is-toggle is-toggle-rounded is-centered mb-4">
      <ul>
        <li id="seg-arr-li"><a onclick="switchTimingPanel('arr')"><span>Arrivée</span></a></li>
        <li id="seg-dep-li"><a onclick="switchTimingPanel('dep')"><span>Départ</span></a></li>
        <li id="seg-tl-li"><a onclick="switchTimingPanel('tl')"><span>Timeline</span></a></li>
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
  const liTl =document.getElementById('seg-tl-li');
  const tlCard=document.getElementById('timelineCard');

  if(arrPanel) arrPanel.style.display = (mode==='arr') ? '' : 'none';
  if(depPanel) depPanel.style.display = (mode==='dep') ? '' : 'none';
  if(tlCard)   tlCard.style.display   = (mode==='tl')  ? '' : 'none';

  if(liArr) liArr.classList.toggle('is-active', mode==='arr');
  if(liDep) liDep.classList.toggle('is-active', mode==='dep');
  if(liTl)  liTl.classList.toggle('is-active',  mode==='tl');

  if(mode === 'tl'){
    // La timeline mesure sa largeur : on la dessine une fois visible.
    requestAnimationFrame(()=>{ try{ renderTimeline(); }catch(e){} });
    return;   // l'onglet mémorisé reste Arrivée / Départ
  }
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
      // Suit le toggle du LOAD FINAL : eLID -> "eLID" / Paper LID -> "LID"
      const useElid = (typeof isELID === 'function') && isELID();
      lidLabel.textContent = useElid ? 'eLID' : 'LID';
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
      // Suit le toggle du LOAD FINAL. Le panneau met tout en majuscules :
      //   eLID      -> "ENVOI eLID"  (seul "eLID" garde sa casse)
      //   Paper LID -> "REMISE LID"
      remiseLabel.removeAttribute('style');
      const useElid = (typeof isELID === 'function') && isELID();
      if(useElid){
        remiseLabel.append('Envoi ');
        const span = document.createElement('span');
        span.style.cssText = 'text-transform:none';
        span.textContent = 'eLID';
        remiseLabel.append(span);
      } else {
        remiseLabel.append('Remise LID');
      }
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
    // Seulement depuis Arrivée : ne pas arracher l'utilisateur de la Timeline
    const onArr = document.getElementById('panel-arr')?.style.display !== 'none';
    if(dd && !(al && !dl) && onArr) switchTimingPanel('dep');
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

  // Couleur des pastilles horaires (vert / orange / rouge)
  updateChipColors();
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
  // HLE : SOBT - 60 pour FR/RK, SOBT - 40 pour les autres compagnies
  const cieHle = (document.getElementById('Cie')?.value || '').trim().toUpperCase();
  const hleMin = (cieHle === 'FR' || cieHle === 'RK') ? 60 : 40;
  const h40 = new Date(base.getTime() - hleMin * 60000);
  const h15 = new Date(base.getTime() - 15 * 60000);
  document.getElementById('timer-h40').textContent = `${String(h40.getHours()).padStart(2, '0')}:${String(h40.getMinutes()).padStart(2, '0')}`;
  document.getElementById('timer-h15').textContent = `${String(h15.getHours()).padStart(2, '0')}:${String(h15.getMinutes()).padStart(2, '0')}`;
}

/* LID : EOBT - 5 en eLID, EOBT - 8 en Paper LID */
function updateLID() {
  const tobtRawMins = window._eobtRawMins;
  const el = document.getElementById('timer-h8');
  if (!el) return;
  if (tobtRawMins == null) { el.textContent = "--:--"; return; }
  const useElid = (typeof isELID === 'function') && isELID();
  el.textContent = fmtHHMM(tobtRawMins - (useElid ? 5 : 8));
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

  const add = getMTT() || 30;   // MTT W4/W6 (A321/A21N -> 35, sinon 30)
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

  // v2.74 : FR/RK et W4/W6 = max(SOBT, AIBT + rotation mini), même à l'heure (plus de saut à 1 min près)
  const minTurnCie = !isBVA && !!aibttxt && (cie === 'FR' || cie === 'RK' || cie === 'W4' || cie === 'W6');
  // ===== RÈGLE COMMUNE (autres compagnies) : si AIBT <= SIBT => EOBT = SOBT
  if (!isDelayed && !minTurnCie) {
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

  // total retard : diff signé (gère minuit) ; départ en avance = pas de retard
  const total = totalDelayMinutes() || 0;

  // 93/93A = EOBT - SOBT (borné au retard réel)
  let fixed = tobt - sobt;
  if(fixed < -720) fixed += 1440;
  if(fixed >  720) fixed -= 1440;
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
      // Au dela de 60 min on ajoute la duree en heures : "+83 min (1h23)"
      valEl.textContent = (diff > 60)
        ? `+${diff} min (${fmtMinToHM(diff)})`
        : `+${diff} min`;
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
    const absTurn = Math.abs(diff);
    turnEl.textContent = (absTurn > 60)
      ? `${absTurn} min (${fmtMinToHM(absTurn)})`
      : `${absTurn} min`;
    turn.style.display = 'flex';
  } else {
    turn.style.display = 'none';
  }

  updateRetardPanelState();
}

/* Onglet Retard : sans retard au départ (AOBT <= SOBT), les codes sont
   masqués ; DL1 rempli automatiquement en 93/93A est marqué AUTO. */
function updateRetardPanelState(){
  const panel = document.querySelector('.panel-retard');
  const hint  = document.getElementById('dlNoDelayHint');
  const noDelay = totalDelayMinutes() === 0;   // null = SOBT ou AOBT manquant
  if(panel) panel.classList.toggle('no-delay', noDelay);
  if(hint)  hint.hidden = !noDelay;

  const c1 = (document.getElementById('DLcode1')?.value || '').toUpperCase().trim();
  const row1 = document.getElementById('dlRow1');
  if(row1) row1.classList.toggle('dl-auto', c1 === '93' || c1 === '93A');

  // Une erreur de validation affichée disparaît dès qu'elle est corrigée
  const box = document.getElementById('validateError');
  if(box && !box.hidden) showValidateError(checkValidateRules());
  if(window.syncDelayUI) window.syncDelayUI();
}

/* Règles de validation du vol :
   - AOBT obligatoire (sauf destination BVA, comme avant) ;
   - si AOBT > SOBT : chaque durée a son code, chaque code sa durée,
     et le total des durées est égal au retard. */
function checkValidateRules(){
  const val = id => (document.getElementById(id)?.value || '').trim();
  const isBVADest = val('To').toUpperCase() === 'BVA';
  if(!val('AOBT') && !isBVADest){
    return { popup: '⚠️ AOBT manquant — impossible de valider',
             html: 'AOBT manquant : il se saisit dans l\'onglet Vol. <a href="#" onclick="uiTab(\'vol\'); return false;">Aller à Vol</a>' };
  }

  const total = totalDelayMinutes();
  if(!total) return null;   // pas de retard (ou SOBT inconnu) : rien d'obligatoire

  let sum = 0;
  for(const i of [1,2,3]){
    const code = val('DLcode' + i);
    const dur  = parseInt(val('DLduree' + i), 10) || 0;
    if(dur > 0 && !code) return { popup: `⚠️ Code retard ${i} manquant`, html: `Code retard manquant pour la durée ${i} (${dur} min).` };
    if(code && dur <= 0) return { popup: `⚠️ Durée ${i} manquante`, html: `Durée manquante pour le code retard ${escapeHtml(code)}.` };
    sum += dur;
  }
  if(sum === 0){
    return { popup: `⚠️ Retard de ${total} min : codes retard obligatoires`,
             html: `Retard de <b>${total} min</b> au départ : saisir au moins un code retard et sa durée.` };
  }
  if(sum !== total){
    return { popup: '⚠️ Total des codes retard ≠ retard',
             html: `Le total des durées (<b>${sum} min</b>) doit être égal au retard (<b>${total} min</b>).` };
  }
  return null;
}

function showValidateError(err){
  const box = document.getElementById('validateError');
  const txt = document.getElementById('validateErrorText');
  if(!box || !txt) return;
  box.hidden = !err;
  txt.innerHTML = err ? err.html : '';
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

  const show = (cie === 'FR' || cie === 'RK');
  btn.style.display = show ? '' : 'none';
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

/* ===== FUEL ===== */

function closeFuelMenu(){
  const b = document.getElementById('fuelBackdrop');
  const m = document.getElementById('fuelMenu');
  if(m) m.style.display = 'none';
  if(b) b.style.display = 'none';
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

/* ===== BLOC NOTE CANVAS ===== */
(function(){
  let _bnReady = false;
  let _tool = 'pen';      // 'pen' | 'eraser-stroke'
  // Epaisseur du stylet par defaut : proportionnee a la taille d'ecran.
  // Le canvas est plus large sur tablette, un trait plus epais garde donc
  // le meme rendu visuel. Seuil aligne sur le point de rupture CSS (600px).
  const BN_SIZE_PHONE  = 3;    // < 600px
  const BN_SIZE_TABLET = 4;    // >= 600px
  function bnDefaultSize(){
    try{
      return window.matchMedia('(min-width: 600px)').matches
        ? BN_SIZE_TABLET : BN_SIZE_PHONE;
    }catch(_){
      return (window.innerWidth >= 600) ? BN_SIZE_TABLET : BN_SIZE_PHONE;
    }
  }
  let _strokes = [];      // [{tool, color, size, pts:[{x,y}]}]
  let _current = null;
  let _drawing = false;
  let _historyKey = null;

  function canvas(){ return document.getElementById('bnCanvas'); }
  // v2.35 : feuille haute (option A) ; les traits sont en px CSS, donc les
  // anciens dessins restent en place, la feuille est juste plus grande.
  function bnCanvasH(w){
    const area = document.getElementById('appWrap')?.clientHeight || (window.innerHeight || 700) - 300;
    return Math.round(Math.max(w * 0.45, Math.min(w * 1.6, area - 96)));
  }
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
      const h   = bnCanvasH(cw);
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

    // Epaisseur du stylet : on applique la valeur par defaut UNIQUEMENT tant
    // que l'agent n'a pas touche au curseur (data-user-set pose par l'oninput).
    // S'il a choisi 8px, la valeur est conservee en basculant clavier <-> stylet.
    // L'etiquette, elle, est toujours resynchronisee sur la valeur reelle.
    (function applyDefaultPenSize(){
      const sl  = document.getElementById('bnSize');
      const lbl = document.getElementById('bnSizeLbl');
      if(sl && sl.dataset.userSet !== '1'){
        sl.value = String(bnDefaultSize());
      }
      if(lbl) lbl.textContent = (sl ? sl.value : bnDefaultSize()) + 'px';
    })();

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
      const size  = parseInt(document.getElementById('bnSize')?.value || '', 10) || bnDefaultSize();
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
      // Source unique : le champ BlocNote, sauvegarde avec l'onglet.
      // (Avant, le dessin etait stocke ici ET dans tab-<id> : taille doublee,
      //  et les cles bnCanvas_<id> survivaient a la fermeture de l'onglet.)
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
      // Le champ BlocNote fait foi (il suit l'onglet et se synchronise).
      let source = document.getElementById('BlocNote')?.value || '';
      if(!source){
        // Migration : dessin cree par une ancienne version
        const legacy = localStorage.getItem(_historyKey);
        if(legacy){
          source = legacy;
          const el = document.getElementById('BlocNote');
          if(el) el.value = legacy;
        }
      }
      // L'ancienne cle n'a plus lieu d'etre : on libere l'espace
      try{ localStorage.removeItem(_historyKey); }catch(_){ }
      _strokes = source ? JSON.parse(source) : [];
    }catch(e){ _strokes=[]; }
    setTimeout(bnRedraw, 50);
  }

  window.bnSetTool = function(tool){
    _tool = tool;
    // Le mode (Stylet / Clavier) est porte par le segmented control : on ne
    // style plus #bnPen ici, seule la gomme reflete l'outil actif.
    document.getElementById('bnEraserStroke')?.classList.toggle('is-warning', tool==='eraser-stroke');
    document.getElementById('bnEraserStroke')?.classList.toggle('is-light',   tool!=='eraser-stroke');
  };

  window.bnReloadFromRemote = function(raw){
    try{
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if(!Array.isArray(parsed)) return;
      _strokes = parsed;
      // Source unique : le champ BlocNote (sauvegarde avec l'onglet)
      const el = document.getElementById('BlocNote');
      if(el) el.value = JSON.stringify(_strokes);
      bnRedraw();
    }catch(e){}
  };
  window.bnSwitchMode = function(mode){
    const drawDiv = document.getElementById('bnDrawMode');
    const textDiv = document.getElementById('bnTextMode');
    if(!drawDiv || !textDiv) return;
    const isDraw = mode === 'draw';
    drawDiv.style.display = isDraw ? '' : 'none';
    textDiv.style.display = isDraw ? 'none' : '';
    const drawTools = document.getElementById('bnDrawTools');
    if(drawTools) drawTools.style.display = isDraw ? 'flex' : 'none';
    // Segmented control : l'etat actif se porte sur le <li> (classe is-active)
    document.getElementById('bnPenLi')?.classList.toggle('is-active',  isDraw);
    document.getElementById('bnTextLi')?.classList.toggle('is-active', !isDraw);
    if(isDraw){
      setTimeout(()=>{
        const c = document.getElementById('bnCanvas');
        if(!c) return;
        const dpr = window.devicePixelRatio || 1;
        const w   = c.offsetWidth || c.parentElement?.offsetWidth || 300;
        const h   = bnCanvasH(w);
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
    'ArrPNT','ArrPNC','AnnonceINAD','AppelNayak','ArriveeNayak','DepartNayak','RechercheBagDebut','RechercheBagFin',
    'MiseEnPlaceTapis','DebutDechargementBagages','FinDechargementBagages','DebutRepositionnement','FinRepositionnement','DebutChargementBagages','FinChargementBagages',
    'DebutCleaningCabine','FinCleaningCabine','DebutVidangeToilettes','FinVidangeToilettes','DebutEauPotable','FinEauPotable','DebutDegivrage','FinDegivrage','EvCote',
    'ConnexionPush','ChangementPush','FermetureSouteAV','FermetureSouteAR','RetraitEchelleAV','RetraitEchelleAR','ReouverturePorteAvion','DebutComptageBagages','FinComptageBagages',
    'CommChiffresPorte', 'CommChargementPiste',
    'ArrPAX_MAIN','ArrPAX_INF','ArrBAGS','ArrPOIDS','ArrSI',
    'PreviPAX_MAIN','PreviPAX_INF','PreviBAGS','PreviPOIDS','PreviSI',
    'PreviPoussettesPorte','PreviPoussettesCBS',
    'FinalMALE','FinalFEMALE','FinalADULT','FinalCHILD','FinalINFANT',
    'FinalTOB','FinalOA','FinalOB','FinalOC','FinalOD',
    'FinalBAGS','FinalPOIDS','FinalGB','FinalH1','FinalH2','FinalH3','FinalH4','FinalSI',
    'BlockFuel','TripFuel','TaxiFuel','FuelUplift',
    'DLcode1','DLcode2','DLcode3','DLduree1','DLduree2','DLduree3',
    'FaitsSaillants','AutoCtrl'
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
  // v2.98 (Hugo) : clavier numérique pour toutes les compagnies ; la lettre (81A…) se choisit dans la liste (dlcodes.js)
  ['DLcode1','DLcode2','DLcode3'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    el.inputMode = 'numeric';
    el.removeAttribute('pattern');
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
// v2.40 (Hugo) : From = BVA, ou From ≠ To → l'événement Crew s'affiche au Départ (toutes compagnies)
function crewRouteRule(){
  const from = (document.getElementById('From')?.value || '').toUpperCase().trim();
  const to   = (document.getElementById('To')?.value || '').toUpperCase().trim();
  // To = BVA : vol qui se termine ici, pas de départ → pas de Crew
  if(to === 'BVA') return false;
  return from === 'BVA' || (from.length === 3 && to.length === 3 && from !== to);
}
function autoOpenCrewIfNeeded(){
  if(crewRouteRule()){ openCrewPanel(); return; }
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

// v2.37 : les infos du vol se modifient dans une feuille du bas
function toggleInfoVolEdit(){
  const edit = document.getElementById('ivEdit');
  const open = edit.style.display === 'none' || edit.style.display === '';
  edit.style.display = open ? 'flex' : 'none';
  if(open && window.syncIvChips) window.syncIvChips();
  if(open && window.syncIvRoute) window.syncIvRoute();
}


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
    window._twClearedAt = { id, t: Date.now() }; // le clic qui suit un double appui ne doit pas rouvrir la confirmation PAF
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
    else if(action==='now'){ if(pafGuard(id)) return; setNow(id); }
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
  // Heures prévues (SIBT/SOBT) : "--:--" ; heures réelles vides : "Now"
  const isPlan = disp.classList.contains('tw-sched');
  disp.textContent = inp.value || (isPlan ? '--:--' : 'Now');
  const wrap = disp.closest('.time-wrap');
  if(wrap){
    wrap.classList.toggle('tw-empty', !inp.value);
    wrap.classList.toggle('tw-set', !!inp.value && !isPlan);
  }
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
    if(mins == null) return;
    // Mêmes seuils que les anciennes bandes de couleur des heures réelles :
    // bleu en avance, vert à l'heure, ambre +1 à +14 min, rouge >= 15 min.
    let cls, txt;
    if(mins < 0)        { cls = 'early'; txt = `${mins} min`.replace('-', '−'); }
    else if(mins === 0) { cls = 'ok';    txt = "À l'heure"; }
    else if(mins < 15)  { cls = 'warn';  txt = `+${mins} min`; }
    else                { cls = 'crit';  txt = `+${mins} min`; }
    el.className = 'delta ' + cls;
    el.textContent = txt;
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
const CACHE = 'suivi-perf-v130';
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
  // On restaure EXACTEMENT le viewport de la page (cf. index.html).
  // Surtout ne pas remettre user-scalable=no : iOS rejette alors toute la
  // chaine viewport, viewport-fit=cover devient inactif et une bande
  // apparait sous le footer en PWA installee.
  document.querySelector('meta[name="viewport"]').setAttribute('content',
    'width=device-width, initial-scale=1, viewport-fit=cover');
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
  // Changement d'onglet ou de panneau (Arrivée/Départ, Vol/Timing…) : la hauteur du contenu change sans ajout de nœud
  const resync = () => requestAnimationFrame(syncOverflow);
  new MutationObserver(resync).observe(wrap, { childList:true, subtree:true, attributes:true, attributeFilter:['style','class'] });
  new MutationObserver(resync).observe(document.body, { attributes:true, attributeFilter:['data-panel','class'] });
  wrap.querySelectorAll('.panel').forEach(p => new ResizeObserver(resync).observe(p));
  syncOverflow();
});


/* ===== Accueil : horloge LT/Z ===== */
(function(){
  function tick(){
    const lt = document.getElementById('homeClockLT');
    const z  = document.getElementById('homeClockZ');
    if(!lt && !z) return;
    const d = new Date(), p = n => String(n).padStart(2,'0');
    if(lt) lt.textContent = p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
    if(z)  z.textContent  = p(d.getUTCHours())+':'+p(d.getUTCMinutes())+':'+p(d.getUTCSeconds());
  }
  setInterval(tick, 1000); tick();
})();


/* ===== Accueil : diaporama de fond (fondu aléatoire, hors-ligne) ===== */
(function(){
  const CANDIDATES = [];
  for(let i=1;i<=10;i++) CANDIDATES.push('./home-bg-'+i+'.jpg');
  const INTERVAL = 10000;              // 10 s par photo
  let pool = [];                        // photos réellement utilisées
  let cur = 'A', timer = null, ready = false, activeSrc = null;

  function show(src){
    const a = document.getElementById('homeSlideA'), b = document.getElementById('homeSlideB');
    if(!a || !b || !src || src === activeSrc) return;   // jamais deux fois la même
    const nextEl = (cur==='A') ? b : a, curEl = (cur==='A') ? a : b;
    nextEl.style.backgroundImage = 'url("' + src + '")';
    nextEl.classList.add('is-active');
    curEl.classList.remove('is-active');
    cur = (cur==='A') ? 'B' : 'A';
    activeSrc = src;
  }
  function randomSrc(){
    if(pool.length <= 1) return pool[0] || null;
    let s; do { s = pool[Math.floor(Math.random()*pool.length)]; } while(s === activeSrc);
    return s;
  }
  function next(){ show(randomSrc()); }
  function schedule(){ clearInterval(timer); if(pool.length > 1) timer = setInterval(next, INTERVAL); }

  // Appelé à chaque arrivée sur l'accueil : photo aléatoire immédiate + reset du timer
  window.homeKickSlideshow = function(){
    if(!ready || !pool.length) return;
    next(); schedule();
  };

  function preload(){
    const loaded = [];
    let pending = CANDIDATES.length;
    CANDIDATES.forEach(src => {
      const im = new Image();
      im.onload  = () => { loaded.push(src); if(--pending === 0) done(loaded); };
      im.onerror = () => { if(--pending === 0) done(loaded); };
      im.src = src;
    });
  }
  function done(loaded){
    ready = true;
    pool = loaded;
    if(pool.length){ next(); schedule(); }
  }
  if(document.readyState !== 'loading') preload();
  else document.addEventListener('DOMContentLoaded', preload);
})();


/* ===== Accueil : date du jour ===== */
(function(){
  function majDate(){
    var el = document.getElementById('homeDate');
    if(!el) return;
    var s = new Date().toLocaleDateString('fr-FR', {
      weekday:'long', day:'numeric', month:'long', year:'numeric'
    });
    el.textContent = s.charAt(0).toUpperCase() + s.slice(1);
  }
  majDate();
  setInterval(majDate, 60*1000);
})();

/* v2.71 : ATOT automatique. Pour chaque vol AK ouvert parti (AOBT saisi) sans ATOT,
   on interroge Keeper 15 min après l'off-block, puis une seconde fois 10 min plus tard. */
const ATOT_TRIES = [15, 25];
let _atotBusy = false;
async function autoFetchATOT(){
  if(_atotBusy || window.APP_EDITION === 'bva' || typeof fetchAK !== 'function') return;
  let tabs = [];
  try{ tabs = JSON.parse(localStorage.getItem('flightTabs') || '[]'); }catch(_){ return; }
  const now = typeof clockMin === 'function' ? clockMin() : (new Date().getHours()*60 + new Date().getMinutes());
  const due = [];
  tabs.forEach(t => {
    const id = (t && t.id != null) ? t.id : t;
    let d; try{ d = JSON.parse(localStorage.getItem('tab-' + id) || 'null'); }catch(_){ d = null; }
    if(!d || !d.akMeta || d.akMeta.atot) return;
    const depId = d.akMeta.flow === 'DEP' ? d.akMeta.id : d.akMeta.linkedId;
    const m = /^(\d{1,2}):(\d{2})$/.exec(String((String(id) === String(currentTabId) ? document.getElementById('AOBT')?.value : d.AOBT) || '').trim());
    if(!depId || !m) return;
    let el = now - (+m[1]*60 + +m[2]); if(el < -720) el += 1440; if(el > 720) el -= 1440;
    const tries = d.akMeta.atotTries || 0;
    if(el < 0 || el > 360 || tries >= ATOT_TRIES.length || el < ATOT_TRIES[tries]) return;
    due.push({ id, depId: String(depId) });
  });
  if(!due.length) return;
  _atotBusy = true;
  try{
    const n = Date.now();
    const iso = t => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
    let deps = [];
    try{ deps = await fetchAK('DEP', iso(n - 18*36e5), iso(n + 6*36e5)) || []; }catch(_){ deps = null; }
    due.forEach(x => {
      let d; try{ d = JSON.parse(localStorage.getItem('tab-' + x.id) || 'null'); }catch(_){ d = null; }
      if(!d || !d.akMeta) return;
      if(deps === null) return; // réseau indisponible : on retentera à la minute suivante
      const f = deps.find(v => String(v.id) === x.depId);
      d.akMeta.atotTries = (d.akMeta.atotTries || 0) + 1;
      if(f && f.atot) d.akMeta.atot = f.atot;
      localStorage.setItem('tab-' + x.id, JSON.stringify(d));
    });
    if(window.uiRecapRefresh) window.uiRecapRefresh();
  }finally{ _atotBusy = false; }
}
// v2.99 (Hugo) : recherche automatique de l'ATOT désactivée, le Récap affiche « Departed » dès l'AOBT
// setInterval(autoFetchATOT, 60000);
// setTimeout(autoFetchATOT, 5000);


/* PAF : confirmation au 1er débarqué quand une valeur PAF est connue (akMeta.bc) */
function pafValue(){
  try{
    if(!currentTabId) return '';
    const d = JSON.parse(localStorage.getItem('tab-'+currentTabId) || '{}');
    return (d?.akMeta?.bc || '').toUpperCase().trim();
  }catch(e){ return ''; }
}
function pafGuard(id){
  const door = id === 'FermeturePorteAvion';
  if(id !== 'PremierDebarque' && id !== 'PremierDebarqueL2' && !door) return false;
  const filled = (door ? ['FermeturePorteAvion'] : ['PremierDebarque','PremierDebarqueL2']).some(k => (document.getElementById(k)?.value || '').trim());
  const c = window._twClearedAt;
  if(c && c.id === id && Date.now() - c.t < 800) return true;
  const paf = pafValue();
  // S1 / 1 : salle non contrôlée par la PAF → aucune confirmation
  const room = (paf.match(/^S?([1-3])$/) || [])[1] || '';
  if(filled || !paf || room === '1') return false;
  // Fermeture porte : seulement pour les salles contrôlées (S2/S3)
  if(door && !room) return false;
  const el = document.getElementById('pafMsg');
  if(door) el.textContent = 'Les contrôles PAF aux arrivées sont-ils bien terminés ?';
  else if(room) el.innerHTML = 'Je confirme que le cheminement est préparé pour la <b>salle ' + room + '</b>.';
  else el.textContent = 'J\'ai bien pris en compte que le vol était contrôlé.';
  const m = document.getElementById('pafModal');
  m.dataset.field = id; m.style.display = 'flex';
  return true;
}
function pafConfirm(){
  const m = document.getElementById('pafModal'); m.style.display = 'none';
  const id = m.dataset.field; if(!id) return;
  setNow(id); updateAllCalculations(); twSync(id);
}

/* v2.85 : rafraîchissement AK automatique quand le premier embarqué est saisi (vols AK uniquement) */
let _peRefreshAt = {};
document.addEventListener('change', function(e){
  if(e.target?.id !== 'AvionPremierEmbarque' || !(e.target.value || '').trim()) return;
  if(window.APP_EDITION === 'bva' || !currentTabId) return;
  const id = currentTabId;
  let d = null; try{ d = JSON.parse(localStorage.getItem('tab-' + id) || 'null'); }catch(_){}
  if(!d || !d.akMeta) return;
  if(Date.now() - (_peRefreshAt[id] || 0) < 60000) return; // un seul refresh par minute
  _peRefreshAt[id] = Date.now();
  setTimeout(async () => {
    try{ saveCurrentTabData(); }catch(_){}
    const r = document.querySelector('#tab-bar .tab-wrap[data-tab="' + id + '"] .tab-refresh');
    if(r) r.classList.add('is-loading');
    try{ await refreshAKTab(id); }
    finally{ document.querySelector('#tab-bar .tab-wrap[data-tab="' + id + '"] .tab-refresh')?.classList.remove('is-loading'); }
  }, 300);
});
