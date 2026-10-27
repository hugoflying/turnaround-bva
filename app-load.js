/* Fenêtre Load (LDM) et FINAL (découpé de app.js, chargé dans l'ordre de index.html) */
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

  window.scrollTo(0, 0);

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

  if(m) m.style.display = 'none';
  window.scrollTo(0, 0);
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

  // v3.20 (Hugo) : en eLID FR/RK pas de zones à saisir → pas de contrôle zones = TOB
  const ok = grouped || (sumZones === main);

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

    ['wheel','mousedown','touchstart','touchend','keydown'].forEach(ev=>{
      scroller.addEventListener(ev, ()=>{ window._tlLastTouch = Date.now(); }, {passive:true});
    });
    // v3.29 : un défilement de l'utilisateur (élan compris) repousse aussi le recentrage ; pas celui de l'app
    scroller.addEventListener('scroll', ()=>{ if(Date.now() - (window._tlAutoScrollAt || 0) > 150) window._tlLastTouch = Date.now(); }, {passive:true});
    ['wheel','mousedown','touchstart','keydown'].forEach(ev=>{
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

  window._tabSig = tabs.slice().sort().map(id => id + ':' + (window.uiTabState ? window.uiTabState(id) : '')).join('|');
  tabs.forEach((id)=>{
    // v3.08 : vol parti depuis 30 min = seulement dans Récap
    const tState = window.uiTabState ? window.uiTabState(id) : '';
    if(tState === 'hidden') return;
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
    wrap.className = 'tab-wrap flt' + (id === currentTabId ? ' is-on' : '') + (tState === 'gone' ? ' is-gone' : '');

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
  // v3.26 : on fait défiler la bande seulement (scrollIntoView pouvait aussi faire bouger la page sur iPhone)
  if(on){
    const l = on.getBoundingClientRect().left - tabBar.getBoundingClientRect().left + tabBar.scrollLeft, r = l + on.offsetWidth;
    if(l < tabBar.scrollLeft) tabBar.scrollLeft = l;
    else if(r > tabBar.scrollLeft + tabBar.clientWidth) tabBar.scrollLeft = r - tabBar.clientWidth;
  }

  updateHeaderOffset();
  // v2.89 : le Récap suit tout de suite les onglets (avant : jusqu'à 15 s d'attente)
  clearTimeout(window._rcSoon);
  window._rcSoon = setTimeout(()=>{ if(window.uiRecapRefresh) window.uiRecapRefresh(); }, 120);
}
