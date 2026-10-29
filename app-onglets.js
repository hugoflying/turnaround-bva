/* Vols en double, onglets, Timing (découpé de app.js, chargé dans l'ordre de index.html) */
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

  // v3.37 : événements ajoutés dans l'admin (démo), créés avant la restauration du vol
  if(typeof cfgEvents === 'function') cfgEvents().forEach(e => {
    const z = document.getElementById(e.side === 'arr' ? 'evZoneArr' : 'evZone'); if(!z) return;
    const t = String(e.t).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
    const col = /^#[0-9a-f]{3,8}$/i.test(e.c || '') ? e.c : '#64748b';
    const f = cfgEvItems(e).map(x => fieldHTML(x.f, x.t.replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c])))).join('');
    z.insertAdjacentHTML('beforeend', `<div id="panel-cx-${e.id}" class="card mb-3 ev-panel" data-ev="cx-${e.id}" style="display:none;">
      <div class="ev-h"><i style="background:${col}"></i><b>${t}</b><button type="button" class="ev-x" onclick="toggleDepExtra('cx-${e.id}')" aria-label="Masquer ${t}">×</button></div>
      <div class="card-content"><div class="grid-auto">${f}</div></div></div>`);
  });

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
  const hleCfg = (typeof cfgAl === 'function') ? cfgAl(cieHle) : null;   // v3.36 : HLE réglé dans l'admin (démo)
  const hleMin = (hleCfg && +hleCfg.hle) ? +hleCfg.hle : (cieHle === 'FR' || cieHle === 'RK') ? 60 : 40;
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

/* v3.10 (Hugo) : l'équipage du départ arrive sur un autre vol ouvert (#CrewFrom = id de son onglet).
   t = AIBT de ce vol, sinon son SIBT (prévu). */
function crewIsoHM(v){
  const d = v ? new Date(v) : null; if(!d || isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2,'0');
  return isUTC ? p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) : p(d.getHours()) + ':' + p(d.getMinutes());
}
function crewLink(){
  return null;   // v3.14 (Hugo) : lien retiré, le changement d'équipage = Arrivée PNT/PNC (+10 min)
  const id = (document.getElementById('CrewFrom')?.value || '').trim();
  if(!id || id === String(currentTabId)) return null;
  // v3.12 (Hugo) : arrivée choisie dans la liste Keeper (vol pas forcément ouvert) : CrewInfo = instantané AK
  if(id.startsWith('ak:')){
    let k = {}; try{ k = JSON.parse(document.getElementById('CrewInfo')?.value || '{}'); }catch(e){}
    const aibt = crewIsoHM(k.aibt), eibt = crewIsoHM(k.eibt), sibt = crewIsoHM(k.sibt);
    // v3.12.2 (Hugo) : seulement l'AIBT réel, jamais d'estimée
    return { id, ak:true, label:(k.ff || 'Vol').toUpperCase(), from:(k.from || '').toUpperCase(), t: aibt, real: !!aibt, sibt };
  }
  let tabs = []; try{ tabs = JSON.parse(localStorage.getItem('flightTabs') || '[]').map(String); }catch(e){}
  if(!tabs.includes(id)) return { id, closed:true, label:'Vol fermé', t:'' };
  let d = {}; try{ d = JSON.parse(localStorage.getItem('tab-' + id) || '{}'); }catch(e){}
  const label = (d.akMeta?.arrFF || ((d.Cie || '') + (d.NVol || '')) || d.akMeta?.depFF || 'Vol').toUpperCase();
  const aibt = (d.AIBT || '').trim(), sibt = (d.SIBT || '').trim();
  return { id, label, from:(d.From || '').toUpperCase(), t: aibt, real: !!aibt, sibt };   // v3.12.2 : AIBT réel seulement
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
  // v3.36 : compagnie réglée dans l'admin (démo) → rotation mini de son type, vide = rotation du programme
  const cfgA = (typeof cfgAl === 'function') ? cfgAl(cie) : null;
  const cfgX = cfgA ? cfgType(cie, document.getElementById('TypeAvion')?.value) : null;
  const cfgTurn = (cfgX && cfgX.mtt != null && cfgX.mtt !== '') ? +((crewChange && cfgX.crew) ? cfgX.crew : cfgX.mtt) : null;
  const minTurnCie = !isBVA && !!aibttxt && (cfgA ? cfgTurn != null : (cie === 'FR' || cie === 'RK' || cie === 'W4' || cie === 'W6'));
  // ===== RÈGLE COMMUNE (autres compagnies) : si AIBT <= SIBT => EOBT = SOBT
  if (!isDelayed && !minTurnCie) {
    EOBT_raw_ext = SOBT_ext;
  } else {
    if (cfgA) {
      EOBT_raw_ext = cfgTurn != null ? Math.max(SOBT_ext, AIBT_ext + cfgTurn) : AIBT_ext + (SOBT_ext - SIBT_ext);
    }
    // ===== FR / RK : EOBT = max(SOBT, AIBT + turn)
    else if (cie === 'FR' || cie === 'RK') {
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

  // v3.10 (Hugo) : FR/RK, équipage arrivant sur un autre vol → EOBT ≥ arrivée de ce vol + 35
  if (cie === 'FR' || cie === 'RK') {
    const cl = crewLink();
    const T = cl && cl.t ? parseHHMM(cl.t) : null;
    if (T != null) EOBT_raw_ext = Math.max(EOBT_raw_ext, SIBT_ext + diffSigned(T, SIBT) + 35);
  }

  // Raw minutes 0..1439
  let EOBT_raw = ((EOBT_raw_ext % 1440) + 1440) % 1440;
  window._eobtRawMins = EOBT_raw;

  // EOBT brut — pas de règle CTOT
  let EOBT_adj = EOBT_raw;
  window._eobtAdjMins = EOBT_adj;

  outEl.textContent = fmtHHMM(EOBT_adj);
}
