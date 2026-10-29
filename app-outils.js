/* Fuel, bloc-notes, gestes horaires, service worker, accueil (découpé de app.js, chargé dans l'ordre de index.html) */
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
    const head = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--fixed-header-h'), 10) || 118;
    const area = (window.innerHeight || 700) - head - 62;   // v3.26 : zone visible (la page défile, l'app n'a plus de hauteur fixe)
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
    'ArrPNT','ArrPNC','AnnonceINAD','AppelNayak','ArriveeNayak','DepartNayak','PremierScanne','DernierScanne','RechercheBagDebut','RechercheBagFin',
    'MiseEnPlaceTapis','DebutDechargementBagages','FinDechargementBagages','DebutRepositionnement','FinRepositionnement','DebutChargementBagages','FinChargementBagages',
    'DebutCleaningCabine','FinCleaningCabine','DebutVidangeToilettes','FinVidangeToilettes','DebutEauPotable','FinEauPotable','DebutDegivrage','FinDegivrage','EvCote','EvOuverts',
    'ConnexionPush','ChangementPush','FermetureSouteAV','FermetureSouteAR','RetraitEchelleAV','RetraitEchelleAR','ReouverturePorteAvion','DebutComptageBagages','FinComptageBagages',
    'CommChiffresPorte', 'CommChargementPiste',
    'ArrPAX_MAIN','ArrPAX_INF','ArrBAGS','ArrPOIDS','ArrSI',
    'PreviPAX_MAIN','PreviPAX_INF','PreviBAGS','PreviPOIDS','PreviSI',
    'PreviPoussettesPorte','PreviPoussettesCBS',
    'FinalMALE','FinalFEMALE','FinalADULT','FinalCHILD','FinalINFANT',
    'FinalTOB','FinalOA','FinalOB','FinalOC','FinalOD',
    'FinalBAGS','FinalPOIDS','FinalGB','FinalH1','FinalH2','FinalH3','FinalH4','FinalSI',
    'BlockFuel','TripFuel','TaxiFuel','FuelUplift','FuelUplift2','FuelUplift3','FuelUplift4',
    'DLcode1','DLcode2','DLcode3','DLduree1','DLduree2','DLduree3',
    'FaitsSaillants','AutoCtrl','ValideLe'
  ];
  if(typeof cfgEvents === 'function') cfgEvents().forEach(e => timingIds.push(...cfgEvFields(e)));   // v3.37 : événements de l'admin (démo)
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
  // v3.41.5 (Hugo : un événement ouvert s'ouvrait sur tous les vols) : on retient les événements ouverts par vol
  const keep = document.getElementById('EvOuverts')
  if(keep){
    const set = new Set(keep.value.split(',').filter(Boolean))
    isOpen ? set.delete(panel) : set.add(panel)
    keep.value = [...set].join(',')
    keep.dispatchEvent(new Event('input', { bubbles:true }))
  }
  if(btn){
    if(isOpen){
      btn.classList.remove('is-info', 'is-selected')
    } else {
      btn.classList.add('is-info', 'is-selected')
    }
  }
}

// v3.41.5 : au changement de vol, chaque événement reprend l'état de CE vol (ouvert, ou rempli), puis la règle Crew
function evApplyOpen(){
  const set = new Set((document.getElementById('EvOuverts')?.value || '').split(',').filter(Boolean))
  document.querySelectorAll('.ev-panel').forEach(p => {
    const k = p.dataset.ev, filled = [...p.querySelectorAll('input')].some(i => i.value && !/^[-–—\s0]*$/.test(i.value))
    const open = set.has(k) || filled
    p.style.display = open ? 'block' : 'none'
    const btn = document.getElementById('btn-' + k)
    if(btn) btn.classList.toggle('is-info', open), btn.classList.toggle('is-selected', open)
  })
  if(typeof autoOpenCrewIfNeeded === 'function') autoOpenCrewIfNeeded()
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
    window.twFlashClear?.(id); // v3.06 : retour « effacé » (gris + secousse), distinct du flash Now
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



/* ===== Service Worker — enregistrement =====
   v3.02 : vrai fichier sw.js (l'ancien SW en blob: était refusé par le navigateur, donc pas de mode hors ligne). */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js?v=' + encodeURIComponent(window.APP_VERSION || 'dev'))
      .catch(() => {/* SW optionnel, pas bloquant */});
  });
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

/* v2.85 : rafraîchissement AK automatique quand le premier embarqué est saisi (vols AK uniquement).
   v3.27 (Hugo) : aussi à l'AIBT ; au 1er embarqué seulement si la rotation dépasse 35 min
   (départ − AIBT > 35, départ = AOBT, sinon EOBT, sinon SOBT), ou s'il n'y a pas d'AIBT. */
let _peRefreshAt = {};
function _akAutoRotLong(){
  const m = id => { const v = (document.getElementById(id)?.value || document.getElementById(id)?.textContent || '').trim(); const x = /^(\d{1,2}):(\d{2})/.exec(v); return x ? (+x[1]) * 60 + (+x[2]) : null; };
  const aibt = m('AIBT'); if(aibt === null) return true;
  const dep = m('AOBT') ?? m('timer-eobt') ?? m('SOBT'); if(dep === null) return true;
  let d = dep - aibt; if(d < -720) d += 1440;
  return d > 35;
}
document.addEventListener('change', function(e){
  const fid = e.target?.id;
  if((fid !== 'AvionPremierEmbarque' && fid !== 'AIBT') || !(e.target.value || '').trim()) return;
  if(settingFromAK || window.APP_EDITION === 'bva' || !currentTabId) return;
  if(fid === 'AvionPremierEmbarque' && !_akAutoRotLong()) return;
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
