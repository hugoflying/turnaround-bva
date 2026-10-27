/* v2.69 : heure courante dans le mode affiché (LT ou UTC), comme les horaires saisis */
function clockMin(){
  const n = new Date(), u = (typeof isUTC !== 'undefined') && isUTC;
  return u ? n.getUTCHours()*60 + n.getUTCMinutes() + n.getUTCSeconds()/60 : n.getHours()*60 + n.getMinutes() + n.getSeconds()/60;
}
/* =====================================================================
   Navigation de la nouvelle interface : barre d'onglets du bas
   (Vol · Timing · Load · Retard · Notes). Aucune logique métier ici :
   Load ouvre le LOAD existant (openLDM / closeLDM), les autres onglets
   affichent une section de la page.
   ===================================================================== */
(function(){
  const PANELS = ['vols', 'vol', 'timing', 'retard', 'notes'];

  function ldmIsOpen(){
    const m = document.getElementById('ldmModal');
    return !!m && m.style.display !== 'none' && m.style.display !== '';
  }

  function syncTabbar(){
    const current = ldmIsOpen() ? 'load' : (document.body.dataset.panel || 'vol');
    document.querySelectorAll('#tabbar [data-tab]').forEach(b => {
      const on = b.dataset.tab === current;
      b.classList.toggle('is-on', on);
      if(on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  function showPanel(name){
    if(!PANELS.includes(name)) name = 'vol';
    document.body.dataset.panel = name;
    if(name !== 'vols') window.uiLeaveGoneTab?.();
    setTimeout(() => window.uiTabsSync?.(), 0); // v3.08 : un vol parti se range en passant sur Récap
    try{ localStorage.setItem('uiPanel', name); }catch(e){}

    if(name === 'timing'){
      // La timeline se dessine à la largeur visible
      const tl = document.getElementById('timelineCard');
      if(tl && tl.style.display !== 'none') requestAnimationFrame(()=>{ try{ renderTimeline(); }catch(e){} });
    }
    if(name === 'vols') renderRecap();
    syncCtotBand();
    // Le bandeau du vol courant est masqué sur le Récap : recalcule la hauteur d'en-tête
    try{ updateHeaderOffset(); }catch(e){}
    if(name === 'notes'){
      // Mode Stylet / Clavier : rétablit le dernier mode si aucun n'est actif
      if(!document.querySelector('#bnPenLi.is-active, #bnTextLi.is-active') && typeof bnSwitchMode === 'function'){
        let mode = 'text';
        try{ mode = localStorage.getItem('bnMode_' + ((typeof currentTabId !== 'undefined' && currentTabId) || 'default')) || 'text'; }catch(e){}
        bnSwitchMode(mode);
      }
      // Le canvas du bloc note se redimensionne une fois visible
      const draw = document.getElementById('bnDrawMode');
      if(draw && draw.style.display !== 'none' && typeof bnSwitchMode === 'function'){
        requestAnimationFrame(()=> bnSwitchMode('draw'));
      }
    }
  }

  window.uiTab = function(name){
    if(name === 'load'){
      if(!ldmIsOpen() && typeof toggleLDM === 'function') toggleLDM();
      syncTabbar();
      return;
    }
    if(ldmIsOpen() && typeof closeLDM === 'function') closeLDM();
    const same = document.body.dataset.panel === name;
    showPanel(name);
    // v2.40 : vol avec changement d'équipage probable → Timing s'ouvre sur Départ
    if(name === 'timing' && !same && typeof crewRouteRule === 'function' && crewRouteRule() && typeof switchTimingPanel === 'function') switchTimingPanel('dep');
    if(!same) window.scrollTo(0, 0);
    syncTabbar();
  };

  // Bandeau marine : numéro du vol, route et avancement de la rotation
  const txt = id => ((document.getElementById(id)||{}).textContent || '').trim();
  const val = id => ((document.getElementById(id)||{}).value || '').trim();
  const isSet = v => !!v && !/^[-–—\s]*$/.test(v);
  const toMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t||''); return m ? (+m[1])*60 + (+m[2]) : null; };
  function syncHero(){
    const fno = document.getElementById('fhFno'); if(!fno) return;
    const dep = txt('kvDepVol'), arr = txt('kvArrVol');
    fno.textContent = isSet(dep) ? dep : (isSet(arr) ? arr : '----');
    // Callsign AK du vol affiché, s'il diffère du numéro de vol
    const cs = isSet(dep) ? val('CallsignDep') : (isSet(arr) ? val('CallsignArr') : '');
    const csEl = document.getElementById('fhCs');
    const showCs = cs && cs.replace(/\s/g,'') !== fno.textContent.replace(/\s/g,'');
    csEl.hidden = !showCs; csEl.textContent = showCs ? '(' + cs + ')' : '';
    const parts = [];
    const from = txt('kvFrom'), to = txt('kvTo');
    if(isSet(from) || isSet(to)) parts.push((isSet(from)?from:'---') + ' → ' + (isSet(to)?to:'---'));
    [txt('kvImmat'), txt('kvType')].forEach(v => { if(isSet(v)) parts.push(v); });
    const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
    document.getElementById('fhSub').innerHTML = parts.map((p, i) => i === 0 && /→/.test(p) ? '<b>' + esc(p) + '</b>' : esc(p)).join(' · ');
    // v3.15 (Hugo, option C) : parking et PAF en pastilles en haut à droite (PAF = valeur seule, ex. S1)
    const pk = txt('kvPark'), bc = txt('kvBC');
    const pkEl = document.getElementById('fhPk'), bcEl = document.getElementById('fhPaf');
    pkEl.hidden = !isSet(pk); pkEl.textContent = isSet(pk) ? 'P' + pk.replace(/^P/i,'') : '';
    bcEl.hidden = !isSet(bc); bcEl.textContent = isSet(bc) ? bc : '';
    // Avancement : de l'arrivée (AIBT, sinon HLE si pas d'arrivée) au départ (EOBT, sinon SOBT)
    // v3.28 (Hugo) : vol pas encore arrivé (SIBT sans AIBT) = barre en attente, elle ne part qu'à l'AIBT
    const wrap = document.getElementById('fhProgWrap'), bar = document.getElementById('fhProg');
    // v3.33 : heures rattachées à la date du vol (sinon ancien calcul à ±12 h)
    const nowC = clockMin(), anc = toMin(val('SOBT')) ?? toMin(val('SIBT')), dated = flightDayMs(val('Date')) != null;
    const R = t => dated ? flightRel(t, val('Date'), anc, nowC) : t;
    let a = rotStart(R(toMin(val('AIBT'))), toMin(val('SIBT')), R(toMin(txt('timer-h40'))));
    let d = R(toMin(txt('timer-eobt')) ?? toMin(val('SOBT')));
    // v3.11 (Hugo) : vol parti = la barre s'arrête à l'AOBT et garde sa couleur (jaune, ou rouge si en retard)
    const off = R(toMin(val('AOBT')));
    wrap.classList.toggle('is-wait', a === 'wait' && d != null);
    if(a === 'wait' && d != null){ wrap.classList.remove('is-empty', 'over'); bar.style.width = '0%'; return; }
    if(a == null || a === 'wait' || d == null){ wrap.classList.add('is-empty'); return; }
    let now = off ?? nowC;
    if(!dated){ if(d <= a) d += 1440; if(now < a - 720) now += 1440; }
    const r = (now - a) / Math.max(1, d - a);
    wrap.classList.remove('is-empty');
    wrap.classList.toggle('over', r > 1);
    bar.style.width = Math.max(0, Math.min(1, r)) * 100 + '%';
  }


  /* v2.76 : bande créneau CTOT sur l'onglet Vol (option B) : fenêtre −5/+10, push estimé, retard estimé */
  function ctotBandMode(){ let m = null; try{ m = localStorage.getItem('ctotBandMode'); }catch(e){} return (m === 'all' || m === 'off') ? m : 'vol'; }
  function paintCtotBandSeg(){ const m = ctotBandMode(); document.querySelectorAll('.ctb-seg button').forEach(b => b.classList.toggle('is-on', b.dataset.ctb === m)); }
  window.setCtotBandMode = function(m){ try{ localStorage.setItem('ctotBandMode', m); }catch(e){} paintCtotBandSeg(); syncCtotBand(); };
  function syncCtotBand(){
    const band = document.getElementById('ctotBand'); if(!band) return;
    const ct = toMin(txt('timer-ctot')), eo = toMin(txt('timer-eobt'));
    const mode = ctotBandMode();
    const on = ct != null && (mode === 'all' || (mode === 'vol' && document.body.dataset.panel === 'vol'));
    document.body.classList.toggle('has-ctot', on);
    if(band.hidden === on){ band.hidden = !on; try{ updateHeaderOffset(); }catch(e){} }
    if(!on) return;
    const f = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0'); };
    let e = eo; if(e != null){ while(e - ct > 720) e -= 1440; while(ct - e > 720) e += 1440; }
    const push = e != null ? Math.max(e, ct - 15) : ct - 15;
    const dl = e != null ? Math.round(push - e) : 0;
    document.getElementById('ctbCtot').textContent = f(ct);
    document.getElementById('ctbWin').textContent = f(ct - 5) + ' – ' + f(ct + 10);
    document.getElementById('ctbPush').textContent = f(push);
    const d = document.getElementById('ctbDl'); d.hidden = !(dl > 0); d.textContent = '+' + dl + ' min';
  }

  /* ===== Événements optionnels du Départ (Crew, Recherche bag, INAD, Nayak) ===== */
  const EVENTS = [
    { k:'crew',          t:'Crew',          d:'Arrivée PNT et PNC',             c:'#334155' },
    { k:'recherche-bag', t:'Recherche bag', d:'Nombre de bags, début et fin',   c:'#ec4899' },
    { k:'inad',          t:'INAD',          d:'Annonce et arrivée INAD',        c:'#D7263D' },
    { k:'gpu',           t:'Nayak',         d:'Appel, arrivée et départ Nayak', c:'#FFAD00' },
    { k:'casque',        t:'Connexion casque',  d:'Connexion de l’agent casque',     c:'#7c3aed' },
    { k:'push',          t:'Push',              d:'Connexion et changement de push', c:'#3273dc' },
    { k:'soutes',        t:'Portes de soute',   d:'Fermeture soute AV et AR',        c:'#7f1d1d' },
    { k:'echelles',      t:'Retrait échelles',  d:'Retrait échelle AV et AR',        c:'#636363' },
    { k:'reouverture',   t:'Réouverture porte', d:'Réouverture porte avion',         c:'#D7263D' },
    { k:'comptage',      t:'Comptage bagages',  d:'Début et fin du comptage',        c:'#15803d' },
    { k:'chargement',    t:'Chargement bagages',d:'Début et fin du chargement',      c:'#15803d' },
    { k:'tapis',            side:'arr', t:'Tapis bagages',          d:'Mise en place du tapis',            c:'#0d9488' },
    { k:'dechargement',     side:'arr', t:'Déchargement bagages',   d:'Début et fin du déchargement',      c:'#15803d' },
    { k:'repositionnement', side:'arr', t:'Repositionnement avion', d:'Début et fin du repositionnement',  c:'#3273dc' },
    { k:'cleaning',  side:'both', t:'Cleaning cabine',   d:'Début et fin du cleaning',        c:'#0891b2' },
    { k:'vidange',   side:'both', t:'Vidange toilettes', d:'Début et fin de la vidange',      c:'#78716c' },
    { k:'eau',       side:'both', t:'Eau potable',       d:'Début et fin du plein d’eau',     c:'#2563eb' },
    { k:'degivrage', t:'Dégivrage', d:'Début et fin du dégivrage', c:'#0ea5e9' }
  ];
  // v2.36 : un événement « both » s'affiche dans la zone (Arrivée / Départ) d'où on l'a ajouté.
  // Le côté est gardé par vol dans le champ caché EvCote (« cleaning:arr,eau:dep »).
  function evCoteMap(){
    const m = {}; (document.getElementById('EvCote')?.value || '').split(',').forEach(x => { const [k, v] = x.split(':'); if(k && v) m[k] = v; });
    return m;
  }
  function evSetCote(k, side){
    const el = document.getElementById('EvCote'); if(!el) return;
    const m = evCoteMap(); m[k] = side;
    el.value = Object.keys(m).map(x => x + ':' + m[x]).join(',');
    el.dispatchEvent(new Event('input', { bubbles:true })); el.dispatchEvent(new Event('change', { bubbles:true }));
  }
  function evPlace(){
    const m = evCoteMap();
    EVENTS.filter(e => e.side === 'both').forEach(e => {
      const p = document.getElementById('panel-' + e.k);
      const z = document.getElementById(m[e.k] === 'arr' ? 'evZoneArr' : 'evZone');
      if(p && z && p.parentElement !== z) z.appendChild(p);
    });
  }
  function evShown(k){ const p = document.getElementById('panel-'+k); return !!p && p.style.display !== 'none'; }
  function evFilled(p){ return [...p.querySelectorAll('input')].some(i => i.value && !/^[-–—\s0]*$/.test(i.value)); }

  // Un bloc qui contient une heure reste toujours affiché, sans croix
  function syncEvents(){
    evPlace();
    document.querySelectorAll('.ev-panel').forEach(p => {
      const f = evFilled(p);
      p.classList.toggle('has-val', f);
      if(f && p.style.display === 'none'){ try{ toggleDepExtra(p.dataset.ev); }catch(e){ p.style.display = 'block'; } }
    });
    const add = document.getElementById('evAddBtn');
    syncEvDurations();
  }

  // Durée affichée dans l'en-tête des événements début / fin
  const EV_PAIRS = {
    dechargement:['DebutDechargementBagages','FinDechargementBagages'], repositionnement:['DebutRepositionnement','FinRepositionnement'],
    chargement:['DebutChargementBagages','FinChargementBagages'], comptage:['DebutComptageBagages','FinComptageBagages'],
    'recherche-bag':['RechercheBagDebut','RechercheBagFin'], gpu:['ArriveeNayak','DepartNayak'],
    cleaning:['DebutCleaningCabine','FinCleaningCabine'], vidange:['DebutVidangeToilettes','FinVidangeToilettes'],
    eau:['DebutEauPotable','FinEauPotable'], degivrage:['DebutDegivrage','FinDegivrage']
  };
  function syncEvDurations(){
    const nowM = Math.floor(clockMin());
    Object.keys(EV_PAIRS).forEach(k => {
      const p = document.getElementById('panel-' + k); if(!p) return;
      const h = p.querySelector('.ev-h'); if(!h) return;
      let el = h.querySelector('.ev-dur');
      const a = toMin(val(EV_PAIRS[k][0])), b = toMin(val(EV_PAIRS[k][1]));
      let t = '', run = false;
      if(a != null && b != null) t = (((b - a) % 1440) + 1440) % 1440 + ' min';
      else if(a != null){ t = (((nowM - a) % 1440) + 1440) % 1440 + ' min'; run = true; }
      if(!t){ if(el) el.remove(); return; }
      if(!el){ el = document.createElement('span'); el.className = 'ev-dur'; h.insertBefore(el, h.querySelector('.ev-x')); }
      el.textContent = run ? 'En cours · ' + t : t;
      el.classList.toggle('run', run);
    });
  }

  function evSheet(){
    let m = document.getElementById('evSheet');
    if(m) return m;
    m = document.createElement('div');
    m.id = 'evSheet'; m.className = 'sheet-modal'; m.style.display = 'none';
    m.innerHTML = '<div class="sheet-card"><div class="ev-sh-head"><b>Ajouter un événement</b>'
      + '<button type="button" class="ev-x" aria-label="Fermer">×</button></div><div class="ev-list"></div></div>';
    m.addEventListener('click', e => {
      if(e.target === m || e.target.closest('.ev-sh-head .ev-x')){ m.style.display = 'none'; return; }
      const it = e.target.closest('.ev-item');
      if(!it || it.disabled) return;
      m.style.display = 'none';
      if(evShown(it.dataset.k)){ toggleDepExtra(it.dataset.k); syncEvents(); return; }   // re-toucher = retirer
      if((EVENTS.find(e => e.k === it.dataset.k) || {}).side === 'both'){ evSetCote(it.dataset.k, m.dataset.side || 'dep'); evPlace(); }
      toggleDepExtra(it.dataset.k);
      const p = document.getElementById('panel-'+it.dataset.k);
      if(p){ p.scrollIntoView({ behavior:'smooth', block:'center' }); p.classList.add('ev-flash'); setTimeout(()=>p.classList.remove('ev-flash'), 900); }
      syncEvents();
    });
    document.body.appendChild(m);
    return m;
  }
  window.uiEvOpen = function(side){
    side = side === 'arr' ? 'arr' : 'dep';
    const m = evSheet();
    m.dataset.side = side;
    m.querySelector('.ev-list').innerHTML = EVENTS.filter(e => (e.side || 'dep') === side || e.side === 'both').map(e => {
      const on = evShown(e.k);
      const p = document.getElementById('panel-'+e.k);
      const full = on && p && evFilled(p);
      const sub = full ? 'Contient une heure, reste affiché' : on ? 'Affiché · toucher pour retirer' : e.d;
      return '<button type="button" class="ev-item'+(on?' is-on':'')+'" data-k="'+e.k+'"'+(full?' disabled':'')+'>'
        + '<i style="background:'+e.c+'"></i><span><b>'+e.t+'</b><small>'+sub+'</small></span>'
        + '<em>'+(on?'✓':'+')+'</em></button>';
    }).join('');
    m.style.display = 'flex';
  };

  /* ===== Timing : swipe Arrivée ⇄ Départ ⇄ Timeline ===== */
  const SEG = ['arr','dep','tl'];
  function curSeg(){
    const tl = document.getElementById('timelineCard');
    if(tl && tl.style.display !== 'none') return 'tl';
    const dep = document.getElementById('panel-dep');
    return (dep && dep.style.display !== 'none') ? 'dep' : 'arr';
  }
  /* v2.38 : un seul swipe qui enchaîne tout l'onglet vol :
     Vol → Arrivée → Départ → Timeline → Load ARR → PREVI → FINAL → FUEL → Retard → Notes */
  const FLOW = ['vols','vol','timing:arr','timing:dep','timing:tl','load:arr','load:previ','load:final','load:fuel','retard','notes'];
  function flowCur(){
    if(ldmIsOpen()) return 'load:' + ((typeof _ldmMode !== 'undefined' && LDM.includes(_ldmMode)) ? _ldmMode : 'arr');
    const p = document.body.dataset.panel;
    return p === 'timing' ? 'timing:' + curSeg() : p;
  }
  function flowGo(dx){
    const i = FLOW.indexOf(flowCur());
    if(i < 0) return false;
    const j = i + (dx < 0 ? 1 : -1);
    if(j < 0 || j >= FLOW.length) return false;
    const [tab, sub] = FLOW[j].split(':');
    let el = null;
    if(tab === 'load'){
      uiTab('load');
      if(typeof ldmSwitch === 'function') ldmSwitch(sub);
      el = document.getElementById(LDM_EL[sub]);
    } else {
      uiTab(tab);
      if(tab === 'timing'){ switchTimingPanel(sub); el = sub === 'tl' ? document.getElementById('timelineCard') : document.getElementById('panel-' + sub); }
      else el = document.querySelector('.panel-' + tab);
      window.scrollTo(0, 0);
    }
    if(el){ el.classList.remove('sw-l','sw-r'); void el.offsetWidth; el.classList.add(dx < 0 ? 'sw-l' : 'sw-r'); }
    return true;
  }
  const SWIPE_PANELS = new Set(['vols','vol','timing','retard','notes']);

  function initSwipe(){
    const zone = document.getElementById('appWrap');
    if(!zone) return;
    let x0 = null, y0 = 0, t0 = 0;
    zone.addEventListener('touchstart', e => {
      x0 = null;
      if(e.touches.length !== 1 || !SWIPE_PANELS.has(document.body.dataset.panel)) return;
      // Pas de swipe sur la timeline (défilement), les champs, le dessin et les feuilles
      if(e.target.closest('#timelineScroll, input, textarea, select, .sheet-modal, #bnCanvas, .nb-dock, .nj-quick, .iv-chips, [data-noswipe]')) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
    }, { passive:true });
    zone.addEventListener('touchend', e => {
      if(x0 === null) return;
      const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      x0 = null;
      if(Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6 || Date.now() - t0 > 700) return;
      flowGo(dx);
    }, { passive:true });
  }

  /* ===== Timeline : option « Suivre Now » ===== */
  function syncFollowBtn(){
    const b = document.getElementById('tlFollowBtn');
    if(!b) return;
    let on = true; try{ on = localStorage.getItem('tlFollowNow') !== '0'; }catch(e){}
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  /* ===== v2.47 : vols de démo (menu ⋯) ===== */
  const DEMO_FLIGHTS = [
    // cie, arr, dep, from/to, immat, type, parking, escale (min), PAF
    ['FR','594','595','OPO','EIDCL','B38M','4',25,''],
    ['W4','5148','5149','TIA','9HWAU','A321','12',35,'S3'],
    ['FR','1037','1038','VIE','9HLOA','A320','7',25,'S2'],
    ['FR','3016','3017','PMI','EIEVA','B738','2',25,''],
    ['FR','2961','2962','OTP','EIIGR','B38M','5',25,''],
    ['FR','2853','2854','VNO','EIFZD','B738','9',25,''],
    ['FR','1179','1180','BHX','EIDWB','B738','3',25,''],
    ['W4','3061','3062','TSR','9HWBY','A320','11',35,''],
    ['W4','3065','3066','CLJ','9HWDA','A21N','14',35,''],
    ['W4','3233','3234','IAS','9HWAV','A320','10',35,''],
    ['W4','3027','3028','OTP','9HWXA','A21N','13',35,''],
  ];
  // v2.59 : extra = vols présents seulement dans la liste AK (pas d'onglet ouvert)
  const DEMO_EXTRA = [
    ['FR','8338','8339','RAK','EIEFB','B738','6',25],
    ['FR','6512','6513','NAP','EIIHD','B38M','3',25],
    ['V7','2104','2105','BIA','EIFNH','A319','8',40],
    ['W4','3381','3382','SKP','9HWNC','A321','12',35],
    ['FR','4721','4722','FEZ','EIDPW','B738','1',25],
    ['H4','2379','2380','AGA','9HHAB','A320','9',45],
  ];
  // v2.87 : seuls 3 vols sont ouverts en onglets (les autres restent dans la liste AK)
  // 0 = FR OPO en embarquement · 1 = W4 TIA posé, PAF S3, CTOT · 2 = FR VIE à l'arrivée, PAF S2, CTOT météo
  const DEMO_OPEN = [0, 1, 2];
  const DEMO_SCHED = {
    0: { sibt:-15 },
    1: { sibt:1, ctot:20, reg:{ regul:'LROPTA', cause:'C · ATC', reason:'ATC capacity', remark:'Expect improvements after 1030z' } },
    2: { sibt:10, ctot:28, reg:{ regul:'LFFFUTA', cause:'W · Weather', reason:'Weather', description:'Thunderstorms sector UT' } },
  };
  // v2.88 : scénarios de retard réalistes (93 retard arrivée, 32, 81 CTOT, 89, 77) sur les vols de la liste
  const DEMO_SCEN = { 3:'late', 5:'89-77', 6:'ctot', 7:'ctot', 8:'ctot' };
  const demoRow = i => i >= 100 ? DEMO_EXTRA[i - 100] : DEMO_FLIGHTS[i];
  // Horaires d'un vol de démo, en minutes par rapport au début de la démo (T0)
  // sibt / A (AIBT) / D (SOBT) / ctot / off (AOBT réel) / eobt (EOBT calculée)
  function demoSched(i){
    const row = demoRow(i), cie = row[0], tat = row[7], o = DEMO_SCHED[i];
    let sibt, ctot = null, sc = DEMO_SCEN[i] || 'ok';
    if(i >= 100) sibt = 25 + (i - 100)*28;
    else if(o) sibt = o.sibt;
    else sibt = -150 + i*17;
    const D = sibt + tat;
    const A = sc === 'late' ? sibt + 14 : sibt - 2;
    const minTurn = (cie === 'FR' || cie === 'RK') ? 25 : (cie === 'W4' || cie === 'W6') ? 30 : tat;
    const eobt = Math.max(D, A + minTurn);
    if(o && o.ctot != null) ctot = D + o.ctot;
    else if(sc === 'ctot') ctot = D + (i === 6 ? 20 : i === 7 ? 33 : 27);
    let off = eobt - 1;                                  // à l'heure : repoussé 1 min avant
    if(sc === 'late') off = eobt + 4;                    // + 4 min de chargement (32)
    if(sc === '89-77') off = D + 10;
    if(ctot != null) off = Math.max(eobt, ctot - 12);
    return { sibt, A, D, ctot, off, eobt, sc };
  }
  const DEMO_SI_ARR = ['2 WCHS 36B/37F + 1 WCHR 01B', '1 WCHC 02A + 1 BLND 03C', '3 WCHR 01A/01B/01C', '1 UMNR 12F', '1 WCHS 04D + 1 DEAF 05A', '2 WCHR 02B/02C', '1 MAAS 07A', ''];
  const DEMO_SI_PREVI = ['1 WCHR 01B + 1 WCHS 33F', '2 WCHC 01A/01B · 1 UMNR 14C', '1 WCHR 02C', '1 BLND 03A + 1 WCHR 03B', '1 WCHS 30A + 2 WCHR 01E/01F', '1 MEDA 06C', '1 WCHR 01A', '1 UMNR 11D + 1 WCHR 02A'];
  const DEMO_NOTES = [
    [['A',3,'SNY · DERUHU'], ['off',-6,'BAGS OK']],
    [['A',1,'PMR · 2 WCHC, lift demandé'], ['A',6,'Nettoyage · cabine propre'], ['off',-8,'BAGS OK']],
    [['A',4,'Nettoyage · cabine sale, rangées 20 à 25'], ['off',-12,'Pax en retard · 3 pax au PIF']],
    [['A',0,'Arrivée tardive · retard en provenance, 93'], ['A',2,'Bag manquant · 1 bag sans étiquette'], ['off',-6,'Chargement · 4 bags tardifs en soute 4, code 32'], ['off',-2,'BAGS OK']],
    [['A',5,'Fuel · complément demandé par le CDB'], ['off',-5,'BAGS OK']],
    [['off',-14,'Pax en retard · 2 pax au PIF, appel fait'], ['off',-9,'Push · tracteur en retard, code 89'], ['off',-4,'Pluie forte · chargement ralenti, code 77']],
    [['A',3,'SNY · AMIEZV'], ['off',-20,'CTOT reçu · régulation ATC, code 81'], ['off',-3,'BAGS OK']],
    [['A',2,'PMR · 1 WCHR'], ['off',-16,'CTOT reçu · régulation météo']],
  ];
  // Remplit le vol courant comme un vrai vol (timings passés, LOAD, retards justifiés, notes)
  window.demoFillFlight = function(i, T0, withMeta){
    const now = new Date(T0);
    const hm = m => { const d = new Date(now.getTime() + m*60000); const h = isUTC ? d.getUTCHours() : d.getHours(), mi = isUTC ? d.getUTCMinutes() : d.getMinutes(); return String(h).padStart(2,'0') + ':' + String(mi).padStart(2,'0'); };
    const iso = new Date(now.getTime() - now.getTimezoneOffset()*60000).toISOString().slice(0,10);
    const set = (id, v) => { const e = document.getElementById(id); if(!e) return; e.value = v; e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); };
    const nowRel = (Date.now() - T0) / 60000;             // minutes écoulées depuis T0 (vol importé plus tard)
    const isPast = rel => rel <= nowRel;
    const row = demoRow(i), [cie, arr, dep, ap, reg, type, park, tat] = row, paf = row[8] || '';
    const sc = demoSched(i), { sibt, A, D, off } = sc;
    const isFR = cie === 'FR' || cie === 'RK', k = i % 8;
    set('Cie', cie); set('NVol', dep); set('Date', iso);
    set('From', ap); set('To', ap); set('Immat', reg); set('TypeAvion', type); set('Parking', park);
    set('SIBT', hm(sibt)); set('SOBT', hm(D));
    const past = (id, rel) => { if(isPast(rel)) set(id, hm(rel)); };
    past('AIBT', A);
    const ev = [
      ['PremierDebarque', A+2], ['DernierDebarque', A + (isFR ? 9 : 11)], ['ArriveeFuel', A+3], ['DepartFuel', A + (isFR ? 14 : 20)],
      ['MiseEnPlaceTapis', A+1], ['DebutDechargementBagages', A+2], ['FinDechargementBagages', A+10],
      ['DebutChargementBagages', off-16], ['FinChargementBagages', off-5],
      ['AvionPremierEmbarque', off - (isFR ? 13 : 14)], ['AvionDernierEmbarque', off-4], ['RemiseLID', off - (isFR ? 5 : 7)],
      ['FermetureSouteAV', off-4], ['FermetureSouteAR', off-3], ['FermeturePorteAvion', off-3], ['RetraitEchelleAV', off-2], ['RetraitEchelleAR', off-2],
      ['ConnexionAgentCasque', off-6],
    ];
    if(i % 3 === 1) ev.push(['ArriveeLiftArr', A+1], ['DepartLiftArr', A+11], ['ArriveeLift', off-22], ['DepartLift', off-9]);
    if(i % 4 === 2) ev.push(['DebutCleaningCabine', A+10], ['FinCleaningCabine', A+17]);
    ev.forEach(([id, rel]) => past(id, rel));
    if(sc.ctot != null){ const c = hm(sc.ctot); set('CTOT', c); const tc = document.getElementById('timer-ctot'); if(tc) tc.textContent = c; }
    past('AOBT', off);
    // LOAD : arrivée dès le block, prévi pour tous, final une fois l'embarquement terminé
    const pax = 148 + (i * 13) % 41, inf = i % 3, bags = 38 + (i * 7) % 30, kg = isFR ? 13 : 15, child = 2 + i % 5;
    if(isPast(A)){ set('ArrPAX_MAIN', String(pax - 9)); set('ArrPAX_INF', String((i + 1) % 3)); set('ArrBAGS', String(bags - 4)); set('ArrPOIDS', String((bags - 4) * kg)); set('ArrSI', DEMO_SI_ARR[k]); }
    if(isFR){ set('PreviPAX_MAIN', String(pax + 3)); set('PreviPAX_INF', String(inf)); set('PreviBAGS', String(bags + 2)); }
    else { set('PreviMALE', String(Math.round(pax*0.52))); set('PreviFEMALE', String(pax - Math.round(pax*0.52) - child)); set('PreviCHILD', String(child)); set('PreviINFANT', String(inf)); set('PreviBAGS_OTHER', String(bags + 2)); set('PreviPOIDS_OTHER', String((bags + 2) * kg)); }
    set('PreviSI', DEMO_SI_PREVI[k]); set('PreviPoussettesPorte', String(1 + i % 3)); set('PreviPoussettesCBS', String(i % 2));
    if(isPast(off - 4)){
      if(isFR){ set('FinalADULT', String(pax - child)); set('FinalCHILD', String(child)); }
      else { set('FinalMALE', String(Math.round(pax*0.52))); set('FinalFEMALE', String(pax - Math.round(pax*0.52) - child)); set('FinalCHILD', String(child)); }
      set('FinalINFANT', String(inf));
      const z = Math.floor(pax / 4);
      set('FinalOA', String(z - 2)); set('FinalOB', String(z + 3)); set('FinalOC', String(z + 1)); set('FinalOD', String(pax - 3*z - 2));
      set('FinalBAGS', String(bags)); set('FinalPOIDS', String(bags * kg));
      const h = Math.floor(bags / 4);
      set('FinalH1', String(h - 3)); set('FinalH2', String(h + 2)); set('FinalH3', String(h + 4)); set('FinalH4', String(bags - 3*h - 3));
      set('FinalSI', DEMO_SI_PREVI[k]);
      set('BlockFuel', String(isFR ? 7600 + i*150 : 8200 + i*120)); set('TripFuel', String(isFR ? 5900 + i*140 : 6400 + i*110)); set('TaxiFuel', '200'); set('FuelUplift', String(isFR ? 3200 + i*90 : 3900 + i*80));
    }
    if(typeof updateAllCalculations === 'function') updateAllCalculations();
    // Retards justifiés (le 93 / 93A est rempli tout seul par l'app quand l'arrivée est en retard)
    if(isPast(off)){
      if(sc.sc === 'late'){ set('DLcode2', '32'); set('DLduree2', '4'); }
      else if(sc.sc === '89-77'){ set('DLcode1', '89'); set('DLduree1', '6'); set('DLcode2', '77'); set('DLduree2', '4'); }
      else if(sc.ctot != null && off > D){ set('DLcode1', '81'); set('DLduree1', String(off - D)); }
    }
    // Notes du Clavier, horodatées au moment des faits
    const notes = [];
    (DEMO_NOTES[k] || []).forEach(([ref, d, txt]) => { const rel = (ref === 'A' ? A : off) + d; if(isPast(rel)) notes.push(hm(rel) + ' · ' + txt); });
    if(notes.length) set('FaitsSaillants', notes.join('\n'));
    if(typeof updateAllCalculations === 'function') updateAllCalculations();
    saveCurrentTabData();
    if(withMeta){
      try{
        const key = 'tab-' + currentTabId, d = JSON.parse(localStorage.getItem(key) || '{}');
        const meta = { flow:'ARR', id:'demo-a' + i, linkedId:'demo-d' + i, arrFF: cie + arr, depFF: cie + dep, bc: paf, reg };
        if(sc.ctot != null){
          const o = DEMO_SCHED[i];
          meta.regulation = (o && o.reg) || { regul:'LFFFUTA', cause:'W · Weather', reason:'Weather' };
          meta.ctotHistory = [{ hhmm: hm(D + 25), seenAt: now.getTime() - 40*60000 }, { hhmm: hm(sc.ctot), seenAt: now.getTime() - 10*60000 }];
        }
        d.akMeta = Object.assign({}, d.akMeta, meta);
        localStorage.setItem(key, JSON.stringify(d));
      }catch(e){}
    }
  };
  // Vol importé depuis « Ouvrir un vol » en démo : on le complète comme un vrai vol
  window.demoFillImported = function(f){
    const m = String(f && f.id || '').match(/^demo-[ad](\d+)$/); if(!m) return;
    const i = +m[1]; if(!demoRow(i)) return;
    const T0 = +(localStorage.getItem('demoT0') || Date.now());
    window.demoFillFlight(i, T0, false);
    if(typeof renderTabs === 'function') renderTabs();
    if(typeof updateInfoStrip === 'function') updateInfoStrip();
  };
  async function demoBuild(T0){
    for(const i of DEMO_OPEN){
      createNewTab();
      window.demoFillFlight(i, T0, true);
      await new Promise(r => setTimeout(r, 5));       // id d'onglet = horodatage : on évite les doublons
    }
    if(typeof updateInfoStrip === 'function') updateInfoStrip();
    if(typeof renderTabs === 'function') renderTabs();
    uiTab('vols');
  }

  /* v2.59 · Mode démo : les vols réels sont mis de côté (renommés « demobk: »),
     la démo travaille sur ses propres onglets, « Quitter » remet tout comme avant. */
  const DEMO_BK = 'demobk:';
  const isTabKey = k => /^(tab-|bnCanvas_|bnMode_)/.test(k) || k === 'flightTabs' || k === 'lastTabId';
  const demoState = () => { try{ return localStorage.getItem('demoMode') || ''; }catch(e){ return ''; } };
  const demoAllowed = () => (window.APP_EDITION || 'demo') === 'demo';
  // v2.87 : l'édition « demo » (testapp) est une démo permanente, plus de mode à activer
  window.demoActive = () => demoAllowed();
  const DEMO_VER = '4';                       // changer pour regénérer les vols de démo chez tout le monde
  const DEMO_TTL = 4 * 3600e3;                // vols de démo regénérés après 4 h (horaires relatifs à l'ouverture)
  window.uiDemoReset = function(){
    if(typeof closeSettingsMenu === 'function') closeSettingsMenu();
    localStorage.setItem('demoMode', 'pending');
    location.reload();
  };
  window.uiDemoToggle = function(){
    if(demoAllowed()) return window.uiDemoReset();
    if(typeof closeSettingsMenu === 'function') closeSettingsMenu();
  };
  window.uiDemoEnter = function(){
    if(demoActive()) return;
    try{ if(currentTabId) saveCurrentTabData(); }catch(e){}
    Object.keys(localStorage).filter(isTabKey).forEach(k => {
      localStorage.setItem(DEMO_BK + k, localStorage.getItem(k)); localStorage.removeItem(k);
    });
    localStorage.setItem('demoMode', 'pending');
    location.reload();
  };
  window.uiDemoExit = function(){
    Object.keys(localStorage).filter(isTabKey).forEach(k => localStorage.removeItem(k));
    Object.keys(localStorage).filter(k => k.startsWith(DEMO_BK)).forEach(k => {
      localStorage.setItem(k.slice(DEMO_BK.length), localStorage.getItem(k)); localStorage.removeItem(k);
    });
    localStorage.removeItem('demoMode'); localStorage.removeItem('demoT0');
    location.reload();
  };
  window.uiDemoFlights = window.uiDemoEnter;
  function demoSync(){
    const on = demoActive();
    document.body.classList.toggle('is-demo', on);
    const bar = document.getElementById('demoBar'); if(bar) bar.hidden = !on;
    const btn = document.getElementById('demoFlightsBtn');
    if(btn){
      btn.querySelector('b').textContent = 'Réinitialiser la démo';
      btn.querySelector('small').textContent = 'Remet les vols fictifs à l\'heure actuelle';
    }
    try{ updateHeaderOffset(); }catch(e){}
  }
  async function demoBoot(){
    const btn = document.getElementById('demoFlightsBtn'); if(btn) btn.hidden = !demoAllowed();
    if(window.APP_EDITION === 'bva'){
      const cta = document.querySelector('.home-cta'); if(cta) cta.lastChild.textContent = 'Créer un vol';
    }
    if(!demoAllowed()) return;
    const T0old = +(localStorage.getItem('demoT0') || 0);
    const need = demoState() === 'pending' || localStorage.getItem('demoVer') !== DEMO_VER || !T0old || Date.now() - T0old > DEMO_TTL;
    if(need){
      // Les champs de timing sont créés au chargement complet de la page (initForm) : on les attend
      for(let k = 0; k < 60 && !document.getElementById('PremierDebarque'); k++) await new Promise(r => setTimeout(r, 50));
      Object.keys(localStorage).filter(k => isTabKey(k) || k.startsWith(DEMO_BK)).forEach(k => localStorage.removeItem(k));
      localStorage.setItem('demoVer', DEMO_VER);
      const T0 = Date.now();
      localStorage.setItem('demoT0', String(T0));
      currentTabId = null;
      await demoBuild(T0);
      localStorage.setItem('demoMode', '1');
      const first = (JSON.parse(localStorage.getItem('flightTabs') || '[]'))[0];
      if(first) try{ switchTab(first); }catch(e){}
      uiTab('vols');
      if(typeof showPopup === 'function') showPopup('Démo : ' + DEMO_OPEN.length + ' vols ouverts, les autres dans « Ouvrir un vol »', '#B45309', 2400);
    }
    demoSync();
  }

  // Liste AK de démo (format de l'API Airport Keeper), cohérente avec les onglets de démo
  window.akDemoData = function(flow){
    const T0 = +(localStorage.getItem('demoT0') || Date.now()), now = Date.now();
    const T = m => new Date(T0 + m*60000).toISOString();
    const past = m => T0 + m*60000 <= now;
    const cs = { FR:'RYR', W4:'WMT', V7:'VOE', H4:'HYS', RK:'RUK' };
    const out = [];
    const add = (row, i, sc, extra) => {
      const [cie, arr, dep, ap, reg, type, park] = row;
      if(flow === 'ARR'){
        const f = { id:'demo-a' + i, linkedId:'demo-d' + i, fullFlightNumber:cie + arr, callsign:(cs[cie] || cie) + arr, reg, acTypeIcao:type, pkg:'P' + park, adepIata:ap, sibt:T(sc.sibt), borderControl: row[8] || '' };
        if(past(sc.A)) f.aibt = T(sc.A); else f.eibt = T(sc.A + (extra && i % 2 ? 9 : 0));
        f.status = past(sc.A) ? 'TERMINATED' : (past(sc.A - 120) ? 'IN_FLIGHT' : 'SCHEDULED');
        out.push(f);
      } else {
        const f = { id:'demo-d' + i, linkedId:'demo-a' + i, fullFlightNumber:cie + dep, callsign:(cs[cie] || cie) + dep, reg, acTypeIcao:type, pkg:'P' + park, adesIata:ap, sobt:T(sc.D) };
        if(sc.ctot != null){ f.ctot = T(sc.ctot); f.eobt = T(Math.max(sc.eobt, sc.ctot - 15)); }
        else if(sc.eobt > sc.D) f.eobt = T(sc.eobt);
        if(past(sc.off)){ f.aobt = T(sc.off); f.atot = T(sc.off + 8); f.status = 'IN_FLIGHT'; }
        else f.status = 'SCHEDULED';
        out.push(f);
      }
    };
    DEMO_FLIGHTS.forEach((row, i) => add(row, i, demoSched(i), false));
    DEMO_EXTRA.forEach((row, k) => add(row, 100 + k, demoSched(100 + k), true));
    return out;
  };

  window.uiTlFollow = function(){
    let on = true; try{ on = localStorage.getItem('tlFollowNow') !== '0'; }catch(e){}
    try{ localStorage.setItem('tlFollowNow', on ? '0' : '1'); }catch(e){}
    window._tlLastTouch = 0;
    syncFollowBtn();
    try{ renderTimeline(); }catch(e){}
  };
  function tlTick(){
    const tl = document.getElementById('timelineCard');
    if(!tl || tl.style.display === 'none' || document.body.dataset.panel !== 'timing') return;
    try{ renderTimeline(); }catch(e){}
  }

  /* ===== Onglets de vol : anneau d'avancement autour du code compagnie ===== */
  // v3.28 : début de rotation = AIBT ; arrivée prévue mais pas encore là → 'wait' ; vol sans arrivée → HLE
  function rotStart(aibt, sibt, hle){ return aibt ?? (sibt != null ? 'wait' : hle); }
  // v3.33 : date = date du vol (heures rattachées à ce jour) ; sans date, ancien calcul à ±12 h
  function ringRatio(a, d, at, date, anc){
    if(a === 'wait') return d == null ? null : { wait:true };
    if(a == null || d == null) return null;
    const nowC = clockMin();
    if(flightDayMs(date) != null){
      a = flightRel(a, date, anc, nowC); d = flightRel(d, date, anc, nowC); at = at == null ? null : flightRel(at, date, anc, nowC);
      const now = at ?? nowC;
      return { r:(now - a) / Math.max(1, d - a), left: d - now };
    }
    if(d <= a) d += 1440;
    let now = at ?? nowC;   // v3.11 : figé à l'AOBT une fois le vol parti
    if(now < a - 720) now += 1440;
    return { r:(now - a) / (d - a), left: d - now };
  }
  function syncTabRings(){
    document.querySelectorAll('#tab-bar .flt[data-tab]').forEach(t => {
      const ring = t.querySelector('.flt-cie'); if(!ring) return;
      let r = null;
      if(t.classList.contains('is-on')){
        r = ringRatio(rotStart(toMin(val('AIBT')), toMin(val('SIBT')), toMin(txt('timer-h40'))), toMin(txt('timer-eobt')) ?? toMin(val('SOBT')), toMin(val('AOBT')), val('Date'), toMin(val('SOBT')) ?? toMin(val('SIBT')));
      } else {
        let d = {}; try{ d = JSON.parse(localStorage.getItem('tab-' + t.dataset.tab) || '{}'); }catch(e){}
        // v3.05 : sans arrivée (vol qui part de la base), départ du chrono à HLE = SOBT − 60
        const sobt = toMin(d.SOBT || ''), hle = /^(FR|RK)$/i.test((d.Cie || '').trim()) ? 60 : 40;
        r = ringRatio(rotStart(toMin(d.AIBT || ''), toMin(d.SIBT || ''), sobt != null ? sobt - hle : null), toMin(String(d.timer_eobt || '')) ?? sobt, toMin(d.AOBT || ''), d.Date, sobt ?? toMin(d.SIBT || ''));
      }
      ring.classList.remove('done');
      ring.classList.toggle('wait', !!(r && r.wait));
      if(r && r.wait){ ring.style.setProperty('--p', '0%'); ring.classList.remove('over', 'soon'); return; }
      // Vert, puis jaune à EOBT −5 min, rouge une fois l'EOBT dépassée
      const p = r == null ? 0 : Math.max(0, Math.min(1, r.r)) * 100;
      ring.style.setProperty('--p', p.toFixed(1) + '%');
      ring.classList.toggle('over', r != null && r.left < 0);
      ring.classList.toggle('soon', r != null && r.left >= 0 && r.left <= 5);
    });
  }

  /* ===== Onglet « Vols » : récap de tous les vols ouverts ===== */
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fmtHM = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0'); };
  // v2.75 : sous la minute, secondes restantes (« 42″ »)
  const fmtLeft = l => (l >= 0 && l < 1) ? Math.ceil(l * 60) + '″' : (l < 0 && l > -1) ? '+' + Math.floor(-l * 60) + '″' : l < 0 ? '+' + Math.round(-l) + '′' : (l < 60 ? Math.floor(l) + '′' : Math.floor(l/60) + 'h' + String(Math.floor(l%60)).padStart(2,'0'));
  function nowMin(){ return clockMin(); }
  function rel(t, ref){ if(t == null) return null; while(t - ref > 720) t -= 1440; while(ref - t > 720) t += 1440; return t; }

  function flightInfo(id){
    const cur = (typeof currentTabId !== 'undefined') && String(currentTabId) === String(id);
    let d = {}; try{ d = JSON.parse(localStorage.getItem('tab-' + id) || '{}'); }catch(e){}
    const g = k => (cur ? val(k) : String(d[k] || '')).trim();
    const cie = g('Cie').toUpperCase();
    const depFF = (d.akMeta?.depFF || '').toUpperCase(), arrFF = (d.akMeta?.arrFF || '').toUpperCase();
    const fno = depFF || arrFF || (cie + g('NVol').toUpperCase()) || 'VOL';
    const place = (depFF || !arrFF ? g('To') : g('From')).toUpperCase();
    const now = nowMin();
    const eobtCur = cur ? toMin(txt('timer-eobt')) : null;
    const sobt = toMin(g('SOBT')), sibt = toMin(g('SIBT')), aibt = toMin(g('AIBT')), aobt = toMin(g('AOBT'));
    // v3.33 : heures rattachées à la date du vol (repli ±12 h autour de maintenant sans date)
    const date = g('Date'), dated = flightDayMs(date) != null, R = t => flightRel(t, date, sobt ?? sibt, now);
    // v2.90 : EOBT calculée enregistrée avec le vol (avant : SOBT pour les vols en arrière-plan)
    const eobtSaved = cur ? null : toMin(String(d.timer_eobt || ''));
    let eobt = R(eobtCur ?? eobtSaved ?? sobt);
    const ctot = R(toMin(g('CTOT') || (cur ? txt('timer-ctot') : String(d.timer_ctot || ''))));
    const left = eobt != null ? eobt - now : null;
    let st, cls = '', next;
    const has = k => !!g(k);
    // v2.71 : état en cours du vol (pas l'action à venir)
    // v2.99 (Hugo) : plus d'ATOT Keeper, « Departed » dès que l'AOBT est saisi
    if(aobt != null){ st = 'Parti ' + fmtHM(aobt); cls = 'ok'; next = 'Departed'; }
    else if(aibt == null){ st = sibt != null ? 'Arr. ' + fmtHM(sibt) : 'Pas arrivé'; cls = 'mut'; next = sibt != null ? 'Arrivée prévue ' + fmtHM(sibt) : 'Arrivée à saisir'; }
    else {
      next = has('FermeturePorteAvion') ? 'Porte fermée'
           : has('AvionDernierEmbarque') ? 'Embarquement terminé'
           : has('AvionPremierEmbarque') ? 'Embarquement en cours'
           : has('DernierDebarque') ? 'Débarquement terminé'
           : has('PremierDebarque') ? 'Débarquement en cours'
           : 'Arrivé au block';
      if(left != null && left < 0){ st = '+' + Math.round(-left) + '′'; cls = 'late'; }
      else if(left != null && left <= 5){ st = 'EOBT −5'; cls = 'soon'; }
      else st = 'En escale';
    }
    let p = 0;
    if(aobt != null) p = 100;
    else if(aibt != null && eobt != null){ const a = R(aibt); p = Math.max(0, Math.min(1, (now - a) / Math.max(1, eobt - a))) * 100; }
    const ringCls = aobt != null ? 'done' : cls === 'late' ? 'over' : cls === 'soon' ? 'soon' : '';
    // Statut sol affiché en bas des cartes
    const blk = aobt != null ? { t:'Departed', c:'blk-dep' } : aibt != null ? { t:'In block', c:'blk-in' } : { t:'Not in block', c:'blk-out' };
    return { blk, id, cur, cie: (cie || (fno !== 'VOL' ? cieFromFF(fno) : '')).slice(0,2), fno, place, park: g('Parking'), immat: g('Immat').toUpperCase(),
             sobt: R(sobt), aobt: R(aobt), dated, eobt, ctot, left: aobt != null ? null : left, st, cls, next, p, ringCls, done: aobt != null, late: cls === 'late' };
  }

  function recapView(){ try{ return localStorage.getItem('rcView') === 'cmp' ? 'cmp' : 'det'; }catch(e){ return 'det'; } }
  window.uiRecapRefresh = () => { if(document.body.dataset.panel === 'vols') renderRecap(); };
  function recapSort(){ try{ const s = localStorage.getItem('rcSort'); return s === 'park' || s === 'add' ? s : 'eobt'; }catch(e){ return 'eobt'; } }
  // v2.90 (Hugo) : tri EOBT / Parking / Ordre d'ajout (vides à la fin, puis EOBT), partagé Récap + onglets
  function sortFlights(F, sortBy){
    const eo = f => f.eobt == null ? 1e6 : f.eobt;
    const pk = f => (f.park || '').replace(/^P/i, '').trim();
    return sortBy === 'add' ? F.slice() : F.slice().sort((a,b) => {
      if(sortBy === 'park'){
        const pa = pk(a), pb = pk(b);
        if(!pa !== !pb) return pa ? -1 : 1;
        const c = pa.localeCompare(pb, 'fr', { numeric:true, sensitivity:'base' });
        if(c) return c;
      }
      return eo(a) - eo(b);
    });
  }
  // v2.91 (Hugo) : les onglets du bandeau suivent le tri du Récap (vols en cours puis terminés)
  window.uiSortedTabIds = function(ids){
    try{
      const F = sortFlights(ids.map(flightInfo), recapSort());
      return F.filter(f => !f.done).concat(F.filter(f => f.done)).map(f => f.id);
    }catch(e){ return ids; }
  };
  // v3.08 (Hugo) : vol parti = onglet compact en fin de bande ; 30 min après l'AOBT il quitte la bande
  // (reste dans Récap « Terminés », un appui le rouvre). Jamais pendant qu'on est dessus (hors Récap).
  const GONE_MIN = 30;
  // v3.30 (Hugo : vol parti hier soir encore dans la bande le matin) : temps écoulé depuis l'AOBT.
  // v3.31/v3.33 : avec la date du vol, f.aobt est déjà sur l'échelle de maintenant. Sans date (ou date
  // incohérente) : AOBT toujours passée, modulo 24 h (jusqu'à 1 h d'avance admise).
  const aobtAgo = f => {
    if(f.aobt == null) return null;
    const now = nowMin();
    if(f.dated && now - f.aobt >= -60) return now - f.aobt;
    const r = (((now - f.aobt) % 1440) + 1440) % 1440; return r > 1380 ? r - 1440 : r;
  };
  window.uiTabState = function(id){
    try{
      const f = flightInfo(id);
      if(!f.done) return '';
      const onIt = f.cur && (document.body.dataset.panel !== 'vols' || String(id) === window._keepGoneId);
      const ago = aobtAgo(f) ?? 0;
      return (!onIt && ago >= GONE_MIN) ? 'hidden' : 'gone';
    }catch(e){ return ''; }
  };
  function tabsSig(){
    let ids = []; try{ ids = JSON.parse(localStorage.getItem('flightTabs') || '[]'); }catch(e){}
    return (Array.isArray(ids) ? ids : []).map(String).sort().map(id => id + ':' + window.uiTabState(id)).join('|');
  }
  window.uiTabsSync = function(){ if(tabsSig() !== window._tabSig){ try{ renderTabs(); }catch(e){} } };
  setInterval(window.uiTabsSync, 20000);
  // En quittant Récap sur un vol parti depuis 30 min : on bascule sur un vol encore dans la bande
  // (sauf s'il vient d'être rouvert depuis Récap).
  window.uiLeaveGoneTab = function(){
    if(window._tabJustOpened || typeof currentTabId === 'undefined' || !currentTabId) return;
    // v3.18 (Hugo) : rouvert depuis Récap = on le garde pour le consulter, jusqu'à ce qu'on choisisse un autre vol
    if(String(currentTabId) === window._keepGoneId) return;
    const f = flightInfo(currentTabId);
    if(!f.done || f.aobt == null || aobtAgo(f) < GONE_MIN) return;
    let ids = []; try{ ids = JSON.parse(localStorage.getItem('flightTabs') || '[]').map(String); }catch(e){}
    if(window.uiSortedTabIds) ids = window.uiSortedTabIds(ids);
    const next = ids.find(id => id !== String(currentTabId) && window.uiTabState(id) !== 'hidden');
    if(next) try{ switchTab(next); }catch(e){}
  };
  window.uiRecapSort = function(s){ try{ localStorage.setItem('rcSort', s); }catch(e){} try{ renderTabs(); }catch(e){} renderRecap(); };
  window.uiRecapView = function(v){ try{ localStorage.setItem('rcView', v); }catch(e){} renderRecap(); };
  window.uiOpenFlight = function(id){ window._tabJustOpened = true; window._keepGoneId = String(id); try{ switchTab(id); }catch(e){} try{ uiTab('vol'); } finally { window._tabJustOpened = false; } };

  function ringHTML(f){ return '<span class="flt-cie rc-ring ' + f.ringCls + '" style="--p:' + f.p.toFixed(1) + '%"><b>' + esc(f.cie || '–') + '</b></span>'; }
  function cdHTML(f){
    if(f.done) return '<small>OFF-BLOCK</small><b class="ok">' + esc(f.st.replace('Parti ','')) + '</b>';
    if(f.left == null) return '<small>CD</small><b class="mut">—</b>';
    return '<small>' + (f.late ? 'RETARD' : 'CD') + '</small><b class="' + f.cls + '">' + fmtLeft(f.left) + '</b>';
  }

  const metaT = (k, v, c) => '<span' + (c ? ' class="' + c + '"' : '') + '>' + k + ' <b>' + (v != null ? fmtHM(v) : '--:--') + '</b></span>';

  let rcFast = false;
  // v3.17 (Hugo, option C) : les vols terminés restent dans Récap jusqu'à ce qu'on les retire :
  // croix sur chaque vol terminé + « Tout retirer » sur la ligne Terminés, toujours avec confirmation.
  let rcAsk = null;   // id du vol à retirer, ou '*' pour tous les terminés
  const rcConfirmHTML = (txt, key) => '<div class="rc-confirm" role="alertdialog"><span>' + txt + '</span><span class="rc-cf-b">'
    + '<button type="button" class="rc-cf-no" onclick="uiRecapAsk(null)">Annuler</button>'
    + '<button type="button" class="rc-cf-ok" onclick="uiRecapRemove(\'' + key + '\')">Retirer</button></span></div>';
  const rcX = f => f.done ? '<span class="rc-x" role="button" aria-label="Retirer ' + esc(f.fno) + '" onclick="event.stopPropagation();uiRecapAsk(\'' + esc(f.id) + '\')">×</span>' : '';
  window.uiRecapAsk = function(k){ rcAsk = k; renderRecap(); };
  window.uiRecapRemove = function(k){
    rcAsk = null;
    let ids = []; try{ ids = JSON.parse(localStorage.getItem('flightTabs') || '[]').map(String); }catch(e){}
    const gone = k === '*' ? ids.filter(id => flightInfo(id).done) : ids.filter(id => id === String(k) && flightInfo(id).done);
    // Même fermeture que la croix d'un onglet (garde ou supprime côté serveur selon le vol)
    gone.forEach(id => { try{ _tabCloseId = id; confirmCloseTab(); }catch(e){ console.warn(e); } });
    try{ renderTabs(); }catch(e){}
    renderRecap();
  };
  function renderRecap(){
    const list = document.getElementById('rcList'); if(!list) return;
    let ids = []; try{ ids = JSON.parse(localStorage.getItem('flightTabs') || '[]'); }catch(e){}
    const F = (Array.isArray(ids) ? ids : []).map(flightInfo);
    const lateN = F.filter(f => f.late).length;
    rcFast = F.some(f => f.left != null && f.left > -1.5 && f.left < 2);
    const badge = document.getElementById('volsBadge');
    if(badge){ badge.hidden = !lateN; badge.textContent = lateN; }
    if(document.body.dataset.panel !== 'vols') return;
    const view = recapView();
    document.querySelectorAll('.rc-seg button').forEach(b => b.classList.toggle('is-on', b.dataset.view === view));
    document.getElementById('rcSub').textContent = F.length ? F.length + ' vol' + (F.length > 1 ? 's' : '') + ' · ' + fmtHM(nowMin()) + (lateN ? ' · ' + lateN + ' en retard' : '') : '';
    const sortRow = document.querySelector('.rc-sort'); if(sortRow) sortRow.hidden = F.length < 2;
    if(!F.length){ list.innerHTML = '<div class="rc-empty">Aucun vol ouvert. Touche le « + » en haut pour en ajouter un.</div>'; return; }
    // v2.90 (Hugo) : tri au choix EOBT / Parking / Ordre d'ajout (vides à la fin, puis EOBT)
    const sortBy = recapSort();
    document.querySelectorAll('.rc-sort button').forEach(b => b.classList.toggle('is-on', b.dataset.sort === sortBy));
    const sorted = sortFlights(F, sortBy);
    const doneN = sorted.filter(f => f.done).length;
    if(rcAsk && rcAsk !== '*' && !sorted.some(f => String(f.id) === rcAsk && f.done)) rcAsk = null;
    if(rcAsk === '*' && !doneN) rcAsk = null;
    if(view === 'cmp'){
      list.innerHTML = '<div class="rc-list">' + sorted.map(f =>
        '<button type="button" class="rc-row' + (f.cur ? ' is-cur' : '') + (f.done ? ' is-done' : '') + '" onclick="uiOpenFlight(\'' + esc(f.id) + '\')">' + ringHTML(f)
        + '<span class="rc-t"><b>' + esc(f.fno) + '</b><small>' + esc([f.place, f.park && 'P' + f.park.replace(/^P/i,'')].filter(Boolean).join(' · ')) + '</small></span>'
        + '<span class="rc-e">EOBT<b>' + (f.eobt != null ? fmtHM(f.eobt) : '--:--') + '</b></span>'
        + '<span class="rc-cd ' + (f.done ? 'ok' : f.left == null ? 'mut' : f.cls) + '">' + (f.done ? '✓' : f.left == null ? '—' : fmtLeft(f.left)) + '</span>' + rcX(f) + '</button>'
        + (rcAsk === String(f.id) ? rcConfirmHTML('Retirer ' + esc(f.fno) + (f.place ? ' ' + esc(f.place) : '') + ' ?', esc(f.id)) : '')).join('') + '</div>'
        + (doneN ? (rcAsk === '*' ? rcConfirmHTML('Retirer les ' + doneN + ' vol' + (doneN > 1 ? 's' : '') + ' terminé' + (doneN > 1 ? 's' : '') + ' ?', '*')
                   : '<button type="button" class="rc-clear rc-clear-cmp" onclick="uiRecapAsk(\'*\')">✕ Retirer les terminés (' + doneN + ')</button>') : '');
      return;
    }
    const card = f => '<button type="button" class="rc-card' + (f.cur ? ' is-cur' : '') + (f.done ? ' is-done' : '') + '" onclick="uiOpenFlight(\'' + esc(f.id) + '\')">'
      + ringHTML(f)
      + '<span class="rc-t"><b>' + esc(f.fno) + (f.place ? ' · ' + esc(f.place) : '') + '</b><small>' + esc([f.park && 'P' + f.park.replace(/^P/i,''), f.immat].filter(Boolean).join(' · ') || '—') + '</small></span>'
      + '<span class="rc-cdbig">' + cdHTML(f) + '</span>'
      + '<span class="rc-next' + (f.done ? ' is-done' : '') + '"><i></i>' + esc(f.next) + '</span>'
      + '<span class="rc-meta">' + metaT('SOBT', f.sobt) + metaT('EOBT', f.eobt) + metaT('CTOT', f.ctot, f.ctot != null ? 'rc-ctot' : '') + '<em class="rc-blk ' + f.blk.c + '">' + f.blk.t + '</em></span>'
      + rcX(f) + '</button>'
      + (rcAsk === String(f.id) ? rcConfirmHTML('Retirer ' + esc(f.fno) + (f.place ? ' ' + esc(f.place) : '') + ' ?', esc(f.id)) : '');
    const live = sorted.filter(f => !f.done), done = sorted.filter(f => f.done);
    list.innerHTML = (live.length ? '<div class="rc-sec">En cours · ' + live.length + '</div>' + live.map(card).join('') : '')
      + (done.length ? '<div class="rc-sec rc-sec-done">Terminés · ' + done.length + '<button type="button" class="rc-clear" onclick="uiRecapAsk(\'*\')">✕ Tout retirer</button></div>'
        + (rcAsk === '*' ? rcConfirmHTML('Retirer les ' + done.length + ' vol' + (done.length > 1 ? 's' : '') + ' terminé' + (done.length > 1 ? 's' : '') + ' ?', '*') : '')
        + done.map(card).join('') : '');
  }

  /* ===== LOAD : swipe ARR ⇄ PREVI ⇄ FINAL ⇄ FUEL ===== */
  const LDM = ['arr','previ','final','fuel'];
  const LDM_EL = { arr:'ldmArr', previ:'ldmPrevi', final:'ldmFinal', fuel:'ldmFuel' };
  function initLdmSwipe(){
    const m = document.getElementById('ldmModal');
    if(!m) return;
    let x0 = null, y0 = 0, t0 = 0;
    m.addEventListener('touchstart', e => {
      x0 = null;
      if(e.touches.length !== 1) return;
      // Les cases du LOAD couvrent presque tout l'écran : on accepte le swipe dessus, sauf sur la case en cours d'édition
      if(e.target.closest('textarea, select, .sheet-modal, [data-noswipe]') || e.target === document.activeElement) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
    }, { passive:true });
    m.addEventListener('touchend', e => {
      if(x0 === null) return;
      const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      x0 = null;
      if(Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6 || Date.now() - t0 > 700) return;
      flowGo(dx);
    }, { passive:true });
  }


  /* ===== LOAD v2.23 (option B) : écarts vs PRÉVI, zones, barre des soutes ===== */
  const ldInt = id => { const v = val(id); if(v === '') return null; const n = parseInt(v, 10); return isNaN(n) ? null : n; };
  const isShown = el => !!el && el.offsetParent !== null;
  const fmtKg = n => Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ');
  function setDelta(finalId, previVal){
    const inp = document.getElementById(finalId); if(!inp) return;
    const tile = inp.closest('.ld-stat'); if(!tile) return;
    let chip = tile.querySelector('.ld-dl');
    const f = ldInt(finalId);
    if(f == null || previVal == null){ if(chip) chip.remove(); return; }
    if(!chip){ chip = document.createElement('span'); chip.className = 'ld-dl'; tile.appendChild(chip); }
    const d = f - previVal;
    chip.textContent = d === 0 ? '=' : (d > 0 ? '+' + d : '−' + (-d));
    chip.classList.toggle('up', d !== 0);
    chip.title = 'Écart avec le PRÉVI (' + previVal + ')';
  }
  /* v3.00 (Hugo) : FR/RK, LOAD ARR → BAGS déduit du poids (1 bagage Ryanair = 13 kg), affiché « ≈ N »
     car le poids peut contenir du cargo. Autres compagnies : BAGS saisi à la main comme avant. */
  function syncArrBags(){
    const b = document.getElementById('ArrBAGS'); if(!b) return;
    const cie = val('Cie').toUpperCase(), frrk = cie === 'FR' || cie === 'RK';
    const stat = b.closest('.ld-stat');
    if(stat && !stat.querySelector('.ld-approx')){
      const row = document.createElement('div'); row.className = 'ld-approx-row';
      row.innerHTML = '<span class="ld-approx">≈</span>'; b.before(row); row.appendChild(b);
    }
    if(stat) stat.classList.toggle('is-approx', frrk);
    b.readOnly = frrk;
    if(frrk){
      const kg = parseInt(val('ArrPOIDS'), 10);
      const n = kg > 0 ? String(Math.round(kg / 13)) : '';
      if(b.value !== n) b.value = n;
    }
  }
  window.syncArrBags = syncArrBags;
  document.addEventListener('input', e => { if(e.target && (e.target.id === 'ArrPOIDS' || e.target.id === 'Cie')) syncArrBags(); });

  function syncLoadUI(){
    const m = document.getElementById('ldmModal');
    if(!m || m.style.display === 'none') return;
    syncArrBags();
    const cie = val('Cie').toUpperCase(), frrk = cie === 'FR' || cie === 'RK';
    const elid = frrk && (typeof isELID === 'function') && isELID();
    // Écarts par tuile
    if(frrk){
      setDelta('FinalADULT', elid ? ldInt('PreviPAX_MAIN') : null);
      setDelta('FinalCHILD', null);
      setDelta('FinalINFANT', ldInt('PreviPAX_INF'));
      setDelta('FinalBAGS', ldInt('PreviBAGS'));
      setDelta('FinalPOIDS', null);
      ['FinalMALE','FinalFEMALE'].forEach(id => setDelta(id, null));
    } else {
      setDelta('FinalMALE', ldInt('PreviMALE')); setDelta('FinalFEMALE', ldInt('PreviFEMALE'));
      setDelta('FinalCHILD', ldInt('PreviCHILD')); setDelta('FinalINFANT', ldInt('PreviINFANT'));
      setDelta('FinalBAGS', ldInt('PreviBAGS_OTHER')); setDelta('FinalPOIDS', ldInt('PreviPOIDS_OTHER'));
      setDelta('FinalADULT', null);
    }
    // TOB FINAL comparé au TOB PRÉVI
    const cmp = document.getElementById('ldFinalCmp');
    if(cmp){
      const pv = val(frrk ? 'PreviTOB_FRRK' : 'PreviTOB'), fv = val('FinalTOB');
      if(!pv){ cmp.innerHTML = ''; }
      else {
        const a = parseInt(fv, 10), b = parseInt(pv, 10);
        const d = (!isNaN(a) && !isNaN(b)) ? a - b : null;
        cmp.innerHTML = 'Prévi <b>' + esc(pv) + '</b>' + (d == null ? '' : '<span class="ld-dl' + (d ? ' up' : '') + '">' + (d === 0 ? '=' : (d > 0 ? '+' + d : '−' + (-d))) + '</span>');
      }
    }
    // v3.20 (Hugo) : section Zones inutile en eLID ; poids corrigé seulement s'il y a des GB
    const zb = document.getElementById('ldZonesBox'); if(zb) zb.style.display = elid ? 'none' : '';
    try{ updateLidGuideVisibility(); }catch(e){}
    try{ window.syncUplifts?.(); }catch(e){}
    const pc = document.getElementById('FinalPoidsCorrige')?.closest('.ld-stat');
    if(pc) pc.style.display = (ldInt('FinalGB') || 0) > 0 ? '' : 'none';
    // Zones : total vs passagers, barre de répartition
    const zIds = ['FinalOA','FinalOB','FinalOC','FinalOD'].filter(id => isShown(document.getElementById(id)?.closest('.ld-stat')));
    const zSum = zIds.reduce((t, id) => t + (ldInt(id) || 0), 0);
    const main = parseInt(val('FinalTOB'), 10);
    const zs = document.getElementById('ldZonesSum');
    if(zs){
      if(!zSum && isNaN(main)) zs.innerHTML = '';
      else { const ok = !isNaN(main) && zSum === main; zs.innerHTML = '<b class="' + (ok ? 'ok' : 'ko') + '">' + zSum + '</b> / ' + (isNaN(main) ? '–' : main) + ' pax'; }
    }
    // Total des zones ≠ TOB → zones en rouge ; jauge = remplissage vs capacité (placeholder « 27 (1-5) »)
    const zKo = !isNaN(main) && zSum !== main;
    ['FinalOA','FinalOB','FinalOC','FinalOD'].forEach(id => {
      const inp = document.getElementById(id), t = inp?.closest('.ld-stat'); if(!t) return;
      t.classList.toggle('ld-ko', zKo && zIds.includes(id));
      const cap = parseInt((/^(\d+)/.exec(inp.placeholder || '') || [])[1], 10);
      const v = ldInt(id) || 0;
      t.style.setProperty('--zw', (cap > 0 ? Math.min(100, v / cap * 100) : 0).toFixed(1) + '%');
      t.classList.toggle('ld-over', cap > 0 && v > cap);
    });
    // Soutes : barre proportionnelle + total pièces / kg
    const bar = document.getElementById('ldHoldBar');
    if(bar){
      const k = (typeof holdBagKg === 'function') ? holdBagKg() : null;
      const hs = ['FinalH1','FinalH2','FinalH3','FinalH4'].map(id => document.getElementById(id)).filter(i => i && isShown(i.closest('.ld-stat')));
      let pcs = 0;
      const segs = hs.map(i => {
        const n = parseInt(i.value, 10) || 0; pcs += n;
        const lbl = i.closest('.ld-stat').querySelector('.ld-stat-label')?.textContent || '';
        return { n, lbl };
      });
      const sig = segs.map(x => x.lbl + x.n).join('|');
      if(bar.dataset.sig !== sig){
        bar.dataset.sig = sig;
        // Seules les soutes chargées apparaissent ; chacune garde une largeur lisible même avec peu de bagages
        bar.innerHTML = segs.filter(x => x.n).map(x => '<div style="flex:' + x.n + ' 1 0"><span>' + esc(x.lbl) + '</span><i>-</i><b>' + x.n + '</b></div>').join('');
        bar.hidden = !pcs;
      }
      const hsum = document.getElementById('ldHoldSum');
      const bags = ldInt('FinalBAGS'), gbs = ldInt('FinalGB') || 0; // v3.07 : soutes = BAGS + GB
      if(hsum) hsum.innerHTML = pcs ? ('<b class="' + (bags != null && bags + gbs !== pcs ? 'ko' : '') + '">' + pcs + ' pcs</b>' + (k ? ' · ' + (k.approx ? '≈ ' : '') + fmtKg(pcs * k.kg) + ' kg' : '')) : '';
    }
    // Nombre de tuiles passagers visibles (2 à 4 par ligne)
    const pr = document.getElementById('finalPaxRow');
    if(pr){ const n = Math.max(2, [...pr.children].filter(c => c.classList.contains('ld-stat') && c.style.display !== 'none').length); pr.style.setProperty('--n', n); pr.dataset.n = n; }
  }


  /* ===== Nouveautés : popup animé à la première connexion sur la nouvelle version ===== */
  // v2.51 : contenu de la mise à jour du 17 octobre (changer WN_ID pour réafficher le popup une fois)
  const WN_ID = 'maj-2026-10-18c';
  const WN_VER = 'Version 2.86';
  const WN_ED = window.APP_EDITION || 'demo';
  const WN_ITEMS = [
    ['i-grid',   '#0B1E4F', 'Interface repensée', 'Plus claire et plus fluide : onglets en bas, glisse d\'un écran à l\'autre, chronos toujours visibles.'],
    ['i-list',   '#3D6BE0', 'Onglet Récap', 'Tous tes vols d\'un coup d\'œil : où en est chaque vol et combien de temps il reste.'],
    ['i-clock',  '#F59E0B', 'CTOT repensé', 'Bandeau avec le créneau, le push estimé et le retard. Un appui ouvre le détail de la régulation. Dans le menu, choisis où l\'afficher : partout, sur Vol ou jamais.'],
    WN_ED !== 'bva' ? ['i-info', '#D93636', 'Contrôle transfrontalier', 'Sur un vol contrôlé, l\'app te demande de confirmer la salle PAF au 1er débarqué, et la fin des contrôles à la fermeture porte.'] : null,
    ['i-camera', '#0d9488', 'Dommages', 'Photos de rayures, bosses ou birdstrike prises depuis l\'app, rangées par vol et faciles à partager.'],
    ['i-board',  '#0B1E4F', 'Panneau', 'Écris un message et affiche-le en très grand, plein écran, comme un panneau d\'accueil.'],
    ['i-phone',  '#1F9D57', 'Annuaire', 'Appel direct en un appui : NAYAK, Sup OPS, PCE, OPS T2, CEP' + (WN_ED === 'demo' ? '.' : ', RYR OCC.')],
    ['i-radio',  '#0891b2', 'Fréquences et dégivrage', 'Dans le menu : fréquences LFOB, produit ABAX et holdover times.'],
    ['i-check',  '#7c3aed', 'Auto-contrôle Ryanair', 'La feuille FR/RK en version numérique, signature au doigt. En test, pas obligatoire.'],
    WN_ED === 'demo' ? ['i-plane', '#D93636', 'Version démo', 'Des vols fictifs pour tout essayer : 3 ouverts, les autres dans « Ouvrir un vol ». Menu › Réinitialiser la démo pour repartir à l\'heure actuelle.'] : null,
  ].filter(Boolean);
  window.uiWhatsNew = function(){
    let m = document.getElementById('wnModal');
    if(!m){
      m = document.createElement('div');
      m.id = 'wnModal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'Nouveautés');
      m.innerHTML = '<div class="wn-card">'
        + '<div class="wn-hero"><div class="wn-sky"><i></i><i></i><i></i></div>'
        + '<div class="wn-plane"><svg class="ico"><use href="#i-plane"/></svg></div>'
        + '<span class="wn-badge">Mise à jour</span><span class="wn-ver">' + WN_VER + '</span>'
        + '<h2>Quoi de neuf aujourd\'hui&nbsp;?</h2>'
        + '<p>Voici ce qui a changé dans l\'app.</p></div>'
        + '<ul class="wn-list">' + WN_ITEMS.map((x, i) => '<li style="--i:' + i + '"><span class="wn-ic" style="--c:' + x[1] + '"><svg class="ico"><use href="#' + x[0] + '"/></svg></span><span><b>' + x[2] + '</b><small>' + x[3] + '</small></span></li>').join('') + '</ul>'
        + '<div class="wn-foot"><button type="button" class="btn btn-primary btn-block" id="wnGo">C\'est parti</button></div></div>';
      document.body.appendChild(m);
      const close = () => { m.classList.remove('is-on'); setTimeout(() => { m.style.display = 'none'; }, 250); try{ localStorage.setItem('whatsNewSeen', WN_ID); }catch(e){} };
      m.querySelector('#wnGo').addEventListener('click', close);
      m.addEventListener('click', e => { if(e.target === m) close(); });
    }
    m.style.display = 'flex';
    m.classList.remove('is-on'); void m.offsetWidth; m.classList.add('is-on');
  };
  window.uiWhatsNewMaybe = function(){
    let seen = null; try{ seen = localStorage.getItem('whatsNewSeen'); }catch(e){}
    if(seen === WN_ID || !document.body.classList.contains('pv-authed')) return;
    setTimeout(window.uiWhatsNew, 450);
  };

  /* Retard (v2.34) : barre de répartition par code dans le bandeau + « reste à justifier » */
  const DL_COLORS = ['#A78BFA', '#60A5FA', '#5EEAD4'];
  function syncDelayUI(){
    const stack = document.getElementById('dlStack'), leg = document.getElementById('dlLegend');
    const todo = document.getElementById('dlRemain'), todoTxt = document.getElementById('dlRemainText');
    if(!stack || !leg || !todo) return;
    const total = typeof totalDelayMinutes === 'function' ? totalDelayMinutes() : null;
    const val = id => (document.getElementById(id)?.value || '').trim();
    // Une durée sans code (répartie automatiquement par l'app) compte comme « à justifier »
    const segs = []; let sum = 0, coded = 0;
    [1,2,3].forEach(i => {
      const d = parseInt(val('DLduree' + i), 10) || 0, code = val('DLcode' + i).toUpperCase();
      if(d > 0 && code){ segs.push({ code, d, c: DL_COLORS[i-1] }); coded += d; }
      sum += d;
    });
    const on = total > 0;
    const over = on ? Math.max(0, sum - total) : 0;
    const rest = on ? Math.max(0, total - coded) : 0;
    let sh = '', lh = '';
    if(on){
      const base = Math.max(total, coded);
      segs.forEach(s => { sh += `<i style="flex:${s.d / base};background:${s.c}"></i>`; lh += `<span style="--c:${s.c}">${escapeHtml(s.code)} · ${s.d} min</span>`; });
      if(rest > 0){ sh += `<i class="dl-rest" style="flex:${rest / base}"></i>`; lh += `<span>À justifier · ${rest} min</span>`; }
    }
    if(stack.innerHTML !== sh) stack.innerHTML = sh;
    if(leg.innerHTML !== lh) leg.innerHTML = lh;
    stack.hidden = leg.hidden = !on;
    stack.classList.toggle('over', over > 0);
    const msg = !on ? '' : over > 0 ? `${over} min de trop dans les codes` : rest > 0 ? `Reste ${rest} min à justifier` : '';
    todo.hidden = !msg;
    todo.classList.toggle('over', over > 0);
    if(todoTxt.textContent !== msg) todoTxt.textContent = msg;
    const btn = document.getElementById('validate');
    if(btn) btn.classList.toggle('dl-pending', !!msg);
  }
  window.syncDelayUI = syncDelayUI;

  /* Notes (v2.35) : barre flottante du stylet (A) + journal horodaté au clavier (B) */
  function syncNoteDock(){
    const dock = document.getElementById('bnDrawTools'); if(!dock) return;
    const eraser = document.getElementById('bnEraserStroke')?.classList.contains('is-warning');
    dock.querySelector('[data-nb-tool="pen"]')?.classList.toggle('is-on', !eraser);
    document.getElementById('bnEraserStroke')?.classList.toggle('is-on', !!eraser);
    const col = (document.getElementById('bnColor')?.value || '').toLowerCase();
    dock.querySelectorAll('[data-nb-color]').forEach(b => b.classList.toggle('is-on', b.dataset.nbColor === col));
    const sz = document.getElementById('bnSize')?.value;
    dock.querySelectorAll('[data-nb-size]').forEach(b => b.classList.toggle('is-on', b.dataset.nbSize === sz));
  }
  function initNoteDock(){
    const dock = document.getElementById('bnDrawTools'); if(!dock) return;
    dock.addEventListener('click', e => {
      const c = e.target.closest('[data-nb-color]'), z = e.target.closest('[data-nb-size]');
      if(c){ const i = document.getElementById('bnColor'); i.value = c.dataset.nbColor; i.dispatchEvent(new Event('input', { bubbles:true })); if(typeof bnSetTool === 'function') bnSetTool('pen'); }
      if(z){ const i = document.getElementById('bnSize'); i.value = z.dataset.nbSize; i.dispatchEvent(new Event('input', { bubbles:true })); if(typeof bnSetTool === 'function') bnSetTool('pen'); }
      setTimeout(syncNoteDock, 0);
    });
    syncNoteDock();
  }

  const NJ_TAGS = ['SNY', 'BAGS OK', 'PMR', 'Bag manquant', 'Pax en retard', 'Nettoyage', 'Fuel'];
  const NJ_RE = /^(\d{1,2}:\d{2})\s*·\s*(.*)$/;
  let njTag = '', njLast = null, njArm = -1;
  const njEl = sel => document.querySelector('#bnTextMode ' + sel);
  const njArea = () => document.getElementById('FaitsSaillants');
  function njLines(){ return (njArea()?.value || '').split('\n').filter(l => l.trim()); }
  function njWrite(lines){
    const ta = njArea(); if(!ta) return;
    ta.value = lines.join('\n');
    ta.dispatchEvent(new Event('input', { bubbles:true }));
    ta.dispatchEvent(new Event('change', { bubbles:true }));
    njRender(true);
  }
  function njRender(force){
    const ta = njArea(), log = njEl('.nj-log'), empty = njEl('.nj-empty');
    if(!ta || !log) return;
    if(!force && ta.value === njLast) return;
    njLast = ta.value;
    const lines = njLines();
    log.innerHTML = lines.map((l, i) => {
      const m = l.match(NJ_RE);
      let time = '', rest = l;
      if(m){ time = m[1]; rest = m[2]; }
      const parts = rest.split(/\s*·\s*/);
      let body;
      if(parts.length > 1 && parts[0] === 'SNY') body = `<em>SNY</em> · ${parts.slice(1).join(' ').split(/\s+/).map(c => `<code class="nj-cc">${escapeHtml(c)}</code>`).join(' ')}`;
      else if(parts.length > 1 && NJ_TAGS.includes(parts[0])) body = `<em>${escapeHtml(parts[0])}</em> · ${escapeHtml(parts.slice(1).join(' · '))}`;
      else if(NJ_TAGS.includes(rest.trim())) body = `<em>${escapeHtml(rest.trim())}</em>`;
      else body = escapeHtml(rest);
      return `<div class="nj-ln${i === njArm ? ' arm' : ''}" data-i="${i}"><b class="num">${time}</b><span>${body}</span><button type="button" class="nj-x" aria-label="Supprimer">${i === njArm ? 'Supprimer ?' : '×'}</button></div>`;
    }).join('');
    log.hidden = !lines.length;
    if(empty) empty.hidden = !!lines.length;
  }
  function njSetTag(tag){
    njTag = tag || '';
    const pill = njEl('.nj-tag'), inp = njEl('.nj-input');
    if(!pill || !inp) return;
    pill.hidden = !njTag; pill.querySelector('b').textContent = njTag;
    document.querySelectorAll('#bnTextMode [data-nj-tag]').forEach(b => b.classList.toggle('is-on', b.dataset.njTag === njTag));
    const sny = njTag === 'SNY';
    // Crew code : majuscules, pas de correction automatique (sinon DERUHU devient un mot)
    inp.setAttribute('autocapitalize', sny ? 'characters' : 'sentences');
    inp.setAttribute('autocorrect', sny ? 'off' : 'on');
    inp.spellcheck = !sny;
    inp.placeholder = sny ? 'Crew code (6 lettres)' : njTag ? 'Détail (facultatif)' : 'Écrire une note…';
    inp.classList.toggle('nj-code', sny);
    njCheck();
  }
  function njCheck(){
    const inp = njEl('.nj-input'), hint = njEl('.nj-hint');
    if(!inp || !hint) return true;
    let msg = '';
    if(njTag === 'SNY'){
      const codes = inp.value.trim().split(/[\s,;]+/).filter(Boolean);
      const bad = codes.filter(c => !/^[A-Z]{6}$/.test(c));
      if(!codes.length && inp.value) msg = 'Un crew code fait 6 lettres.';
      else if(bad.length) msg = `Un crew code fait 6 lettres : ${bad.map(escapeHtml).join(', ')}`;
    }
    hint.hidden = !msg; hint.innerHTML = msg;
    inp.classList.toggle('nj-bad', !!msg);
    return !msg;
  }
  function njAdd(){
    const inp = njEl('.nj-input'); if(!inp) return;
    let txt = inp.value.trim();
    if(njTag === 'SNY'){
      if(!txt){ inp.focus(); return; }
      if(!njCheck()) return;
      txt = txt.split(/[\s,;]+/).filter(Boolean).join(' ');
    }
    if(!txt && !njTag) return;
    const d = new Date(), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const line = [hm, njTag, txt].filter(Boolean).join(' · ');
    njArm = -1;
    njWrite(njLines().concat(line));
    inp.value = ''; njSetTag(''); inp.focus();
    const log = njEl('.nj-log'); if(log) log.lastElementChild?.scrollIntoView({ block:'nearest' });
  }
  function initNoteJournal(){
    const box = document.getElementById('bnTextMode'), inp = njEl('.nj-input'); if(!box || !inp) return;
    box.addEventListener('click', e => {
      const t = e.target.closest('[data-nj-tag]');
      if(t){ njSetTag(njTag === t.dataset.njTag ? '' : t.dataset.njTag); inp.focus(); return; }
      if(e.target.closest('.nj-tag-x')){ njSetTag(''); inp.focus(); return; }
      if(e.target.closest('.nj-go')){ njAdd(); return; }
      const x = e.target.closest('.nj-x');
      if(x){
        const i = +x.closest('.nj-ln').dataset.i;
        if(njArm === i){ const l = njLines(); l.splice(i, 1); njArm = -1; njWrite(l); }
        else { njArm = i; njRender(true); }
        return;
      }
      if(njArm >= 0){ njArm = -1; njRender(true); }
      if(e.target.closest('.nj-raw-btn')){
        const ta = njArea(), on = ta.hidden;
        ta.hidden = !on; e.target.closest('.nj-raw-btn').textContent = on ? 'Fermer le texte' : 'Modifier le texte';
        if(on) ta.focus();
      }
    });
    inp.addEventListener('input', () => {
      if(njTag === 'SNY'){ const p = inp.selectionStart; inp.value = inp.value.toUpperCase().replace(/[^A-Z ,;]/g, ''); try{ inp.setSelectionRange(p, p); }catch(_){} }
      njCheck();
    });
    inp.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); njAdd(); } });
    njArea()?.addEventListener('input', () => njRender());
    njSetTag(''); njRender(true);
  }

  /* Vol (v2.37) : pastilles Compagnie / Parking / Type de la feuille « Modifier le vol » */
  // Types proposés selon la compagnie (Hugo) ; autre compagnie = toute la liste
  const IV_TYPES_ALL = ['A319','A320','A321','A20N','A21N','A21NY','B734','B737','B738','B38M','BCS3','CL35'];
  const IV_TYPES = { FR:['B737','B738','B38M','A320','CL35'], RK:['B737','B738','B38M','A320','CL35'], // v2.92 : A320 (Lauda) pour FR/RK
    W4:['A320','A321','A20N','A21N','A21NY'], W6:['A320','A321','A20N','A21N','A21NY'],
    V7:['A319','A320'], H4:['A319','A320','A321','A21N'], H6:['A319','A320','A321','A21N'] };
  function renderIvTypes(){
    const box = document.getElementById('ivTypeChips'); if(!box) return;
    const list = IV_TYPES[(document.getElementById('Cie')?.value || '').trim().toUpperCase()] || IV_TYPES_ALL;
    const key = list.join(',');
    if(box.dataset.k === key) return;
    box.dataset.k = key;
    box.querySelectorAll('button[data-v]').forEach(x => x.remove());
    const other = box.querySelector('.iv-other');
    list.forEach(t => { const x = document.createElement('button'); x.type = 'button'; x.dataset.v = t; x.textContent = t; box.insertBefore(x, other); });
  }
  function syncIvChips(){
    renderIvTypes();
    [['ivCieChips','Cie'],['ivParkChips','Parking'],['ivTypeChips','TypeAvion']].forEach(([box, id]) => {
      const b = document.getElementById(box), v = (document.getElementById(id)?.value || '').trim().toUpperCase();
      if(!b) return;
      let hit = false;
      b.querySelectorAll('button[data-v]').forEach(x => { const on = x.dataset.v === v; x.classList.toggle('is-on', on); hit = hit || on; });
      const inp = document.getElementById(id); if(inp){ inp.classList.toggle('is-on', !!v && !hit); inp.parentElement.classList.toggle('dup', hit); }
    });
  }
  window.syncIvChips = syncIvChips;
  function initIvChips(){
    renderIvTypes();
    [['ivCieChips','Cie'],['ivParkChips','Parking'],['ivTypeChips','TypeAvion']].forEach(([box, id]) => {
      const b = document.getElementById(box), inp = document.getElementById(id); if(!b || !inp) return;
      b.addEventListener('click', e => {
        const x = e.target.closest('button[data-v]'); if(!x) return;
        inp.value = x.dataset.v;
        inp.dispatchEvent(new Event('input', { bubbles:true })); inp.dispatchEvent(new Event('change', { bubbles:true }));
        syncIvChips();
      });
      inp.addEventListener('input', syncIvChips);
      inp.addEventListener('focus', () => { try{ inp.select(); }catch(_){} });
    });
    syncIvChips();
  }

  /* v2.40 : feuille Vol — libellé N° de vol, suggestion To = From */
  let ivSuggOff = '';
  function syncIvRoute(){
    const from = val('From').toUpperCase(), to = val('To').toUpperCase();
    const lbl = document.getElementById('ivNVolLbl');
    if(lbl) lbl.textContent = to === 'BVA' ? 'N° vol arrivée' : 'N° vol départ';
    // v2.57 : la suggestion s'affiche dans le champ To (un appui la valide)
    const toEl = document.getElementById('To'); if(!toEl) return;
    const show = /^[A-Z]{3}$/.test(from) && from !== 'BVA' && !to && ivSuggOff !== from;
    toEl.placeholder = show ? from : '';
    toEl.classList.toggle('iv-has-sugg', show);
  }
  function initIvRoute(){
    const to = document.getElementById('To');
    if(to) to.addEventListener('click', () => {
      if(to.value || !to.classList.contains('iv-has-sugg')) return;
      to.value = val('From').toUpperCase();
      to.dispatchEvent(new Event('input', { bubbles:true })); to.dispatchEvent(new Event('change', { bubbles:true }));
      syncIvRoute();
      to.select();   // taper une autre destination remplace la suggestion
    });
    // v2.57 : « FR5595 » tapé dans le n° de vol → compagnie FR + n° 5595 (plus de FRFR5595)
    const nv = document.getElementById('NVol');
    if(nv) nv.addEventListener('input', () => {
      // Un n° de vol commence toujours par un chiffre (lettres possibles au milieu ou à la fin) :
      // ce qui précède est le code compagnie (2 lettres, ou W4/U5… si c'est une compagnie connue).
      const m = nv.value.toUpperCase().match(/^([A-Z][A-Z0-9])\s*(\d[A-Z0-9]*)$/);
      if(!m) return;
      const known = [...document.querySelectorAll('#ivCieChips button[data-v]')].map(b => b.dataset.v);
      const cieEl = document.getElementById('Cie'), cie = (cieEl?.value || '').toUpperCase();
      if(!/^[A-Z]{2}$/.test(m[1]) && m[1] !== cie && !known.includes(m[1])) return;
      nv.value = m[2];
      if(cieEl && m[1] !== cie){
        cieEl.value = m[1];
        cieEl.dispatchEvent(new Event('input', { bubbles:true })); cieEl.dispatchEvent(new Event('change', { bubbles:true }));
      }
      try{ updateTabLabelInstant(); }catch(e){}
    });
    ['From','To'].forEach(id => document.getElementById(id)?.addEventListener('input', syncIvRoute));
    // To vidé exprès après un From : on ne repropose pas pour ce même From
    document.getElementById('To')?.addEventListener('input', e => { if(!e.target.value) ivSuggOff = val('From').toUpperCase(); });
    syncIvRoute();
  }
  window.syncIvRoute = syncIvRoute;

  function init(){
    paintCtotBandSeg(); syncHero(); syncCtotBand(); setInterval(()=>{ syncHero(); syncCtotBand(); syncEvents(); syncTabRings(); syncLoadUI(); syncDelayUI(); njRender(); acSyncRow(); }, 1000);
    initSwipe(); initLdmSwipe(); syncFollowBtn(); syncTabRings(); renderRecap(); setInterval(renderRecap, 15000); setInterval(()=>{ if(rcFast && document.body.dataset.panel === 'vols') renderRecap(); }, 1000);
    const tb = document.getElementById('tab-bar'); if(tb) new MutationObserver(()=>requestAnimationFrame(syncTabRings)).observe(tb, { childList:true }); setInterval(tlTick, 15000);
    document.addEventListener('click', e => { if(e.target.closest('.ev-x, .tw-zone')) setTimeout(syncEvents, 0); });
    let start = 'vol';
    try{ start = localStorage.getItem('uiPanel') || 'vol'; }catch(e){}
    showPanel(start);
    syncTabbar();
    uiWhatsNewMaybe();
    const rp = document.querySelector('.panel-retard'); if(rp) rp.addEventListener('input', ()=>requestAnimationFrame(syncDelayUI)); syncDelayUI();
    initNoteDock(); initNoteJournal(); initIvChips(); initIvRoute(); demoBoot(); hotRender(); initKeyboardGuard();
    if(typeof window.bnSetTool === 'function'){ const st = window.bnSetTool; window.bnSetTool = function(t){ st(t); syncNoteDock(); }; }

    // Le LOAD peut s'ouvrir / se fermer depuis app.js (changement de vol, etc.)
    const m = document.getElementById('ldmModal');
    if(m){ new MutationObserver(()=>{ syncTabbar(); syncLoadUI(); }).observe(m, { attributes:true, attributeFilter:['style'] }); m.addEventListener('input', ()=>requestAnimationFrame(syncLoadUI)); m.addEventListener('click', ()=>setTimeout(syncLoadUI, 0)); }

    // Cases Load vides : un tiret montre où saisir
    document.querySelectorAll('#ldmModal .ld-stat input:not([readonly]), #ldmModal .ld-tob input').forEach(i=>{ if(!i.placeholder) i.placeholder = '–'; });

    // Codes retard : l'erreur de validation se met à jour pendant la saisie
    const dl = document.querySelector('.dl-wrap');
    if(dl) dl.addEventListener('input', ()=>{ try{ updateRetardPanelState(); }catch(e){} });
  }


  /* v2.64 · Holdover times ABAX Ecowing AD-2, Type II
     Source : FAA Holdover Time Guidelines Winter 2025-2026, Table 5 (null = pas de HOT). */
  const HOT_COLS = [
    ['Freezing fog, mist, ice crystals',''],['Snow mixed with freezing fog',''],
    ['Very light snow, snow grains or pellets','g'],['Light snow, snow grains or pellets','y'],['Moderate snow, snow grains or pellets','o'],
    ['Freezing drizzle',''],['Light freezing rain',''],['Moderate snow mixed with rain',''],['Rain on cold-soaked wing','']
  ];
  const HOT = [
    ['-3 °C et +', {
      '100/0':['1:20-3:00','0:30-0:55','2:25-2:55','1:15-2:25','0:40-1:15','0:40-1:40','0:30-0:45','0:07-0:07','0:09-1:25'],
      '75/25':['1:15-1:25','0:20-0:40','1:45-2:10','0:55-1:45','0:25-0:55','0:35-1:05','0:20-0:30','0:03-0:03','0:04-0:50'],
      '50/50':['0:15-0:30','0:05-0:10','0:35-0:40','0:15-0:35','0:07-0:15','0:09-0:15','0:06-0:09',null,null] }],
    ['-3 à -8 °C', {
      '100/0':['0:45-2:30','0:25-0:45','2:00-2:25','1:00-2:00','0:30-1:00','0:25-1:10','0:20-0:30',null,null],
      '75/25':['0:35-1:55','0:20-0:35','1:40-2:05','0:50-1:40','0:25-0:50','0:15-0:55','0:20-0:35',null,null] }],
    ['-8 à -14 °C', {
      '100/0':['0:45-2:30','0:20-0:40','1:45-2:05','0:55-1:45','0:30-0:55','0:25-1:10*','0:20-0:30*',null,null],
      '75/25':['0:35-1:55','0:20-0:35','1:35-2:00','0:50-1:35','0:25-0:50','0:15-0:55*','0:20-0:35*',null,null] }],
    ['-14 à -18 °C', { '100/0':['0:15-0:40','0:01-0:05','0:20-0:30','0:07-0:20','0:02-0:07',null,null,null,null] }],
    ['-18 à -25 °C', { '100/0':['0:15-0:40','0:00-0:02','0:09-0:15','0:03-0:09','0:01-0:03',null,null,null,null] }],
    ['-25 à -27 °C', { '100/0':['0:15-0:40','0:00-0:00','0:05-0:07','0:01-0:05','0:00-0:01',null,null,null,null] }]
  ];
  let hotT = 0, hotC = '100/0';
  function hotRender(){
    const box = document.getElementById('hotBox'); if(!box) return;
    const concs = Object.keys(HOT[hotT][1]); if(!concs.includes(hotC)) hotC = concs[0];
    const vals = HOT[hotT][1][hotC];
    let h = '<div class="hot-l">Température extérieure</div><div class="hot-chips">'
      + HOT.map((r, i) => '<button type="button" data-t="' + i + '" class="' + (i === hotT ? 'on' : '') + '">' + r[0] + '</button>').join('') + '</div>'
      + '<div class="hot-l">Concentration fluide / eau</div><div class="hot-seg">'
      + concs.map(c => '<button type="button" data-c="' + c + '" class="' + (c === hotC ? 'on' : '') + '">' + c + '</button>').join('') + '</div>'
      + '<div class="hot-list">'
      + HOT_COLS.map((c, i) => {
          const v = vals[i];
          return '<div class="hot-row' + (v ? '' : ' none') + '"><span class="hot-c">' + (c[1] ? '<i class="hot-dot ' + c[1] + '"></i>' : '') + c[0] + '</span>'
            + '<b class="num">' + (v ? v.replace('-', ' – ').replace('*', '<sup>11</sup>') : 'Pas de HOT') + '</b></div>';
        }).join('')
      + '<div class="hot-row none"><span class="hot-c">Other</span><b>Pas de HOT</b></div></div>'
      + '<div class="hot-src">FAA Holdover Time Guidelines, Winter 2025-2026, Table 5. Durées en h:min. <sup>11</sup> voir la note 11 du document FAA. À titre indicatif : le document officiel fait foi.</div>';
    box.innerHTML = h;
    box.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { hotT = +b.dataset.t; hotRender(); });
    box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { hotC = b.dataset.c; hotRender(); });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* ===================================================================
     v2.55 · Auto-contrôle Ryanair (feuille papier BVA V1-04/2024)
     FR/RK hors CL35 : à remplir avant la validation du vol.
     Données du vol dans le champ caché AutoCtrl :
     { c:[index cochés], n:"NOM Prénom", s:"data:image/png…", t:ISO signature }
     =================================================================== */
  const AC_GROUPS = [
    { sec:'Préparation', doc:'LIR', items:['Type A/C LIR = OMS = AirDCS','Immatriculation = OMS','N° vol départ = OMS','EMA, Cargo, Co-mail signalés en SI'] },
    { sec:'Préparation', doc:'LID', items:['Immatriculation = LIR','N° vol départ = LIR'] },
    { sec:'Vérification', doc:'LIR', items:['Répartition bagages chargés conforme aux limitations','FGB et GB correctement remplis','Cargo/EMA/Co-mail correctement remplis','Toutes les cases du LIR sont remplies','Nom et signature du responsable chargement'] },
    { sec:'Vérification', doc:'LID', items:['(Adult + Child + SNY) = (FWD + MID + AFT)','Calcul du TOB/THOB prenant en compte les particularités','Correspondance entre les répartitions bagage du LID et LIR','Poids forfaitaires entourés et lignes croisées','Case SI complétée','Nom et prénom en majuscule','Toutes les cases du LID sont remplies'],
      note:'Après vérification, vous pouvez signer votre LID et le remettre au CdB.' },
    { sec:'Post vol', doc:'Avant l’envoi du LDM', items:['PAX : LID = OMS = AirDCS','Bagages : LIR = LID = OMS'],
      note:'En cas d’anomalie, contactez immédiatement le CdB ou le PCE pour correction.' }
  ];
  const AC_TOTAL = AC_GROUPS.reduce((n, g) => n + g.items.length, 0);
  const acVal = id => (document.getElementById(id)?.value || '').trim().toUpperCase();

  window.acNeeded = function(){
    const cie = acVal('Cie');
    return (cie === 'FR' || cie === 'RK') && acVal('TypeAvion') !== 'CL35' && acVal('To') !== 'BVA';
  };
  function acGet(){
    try{ const o = JSON.parse(document.getElementById('AutoCtrl')?.value || '{}'); return { c:o.c || [], n:o.n || '', s:o.s || '', t:o.t || '' }; }
    catch(e){ return { c:[], n:'', s:'', t:'' }; }
  }
  function acSet(o){
    const el = document.getElementById('AutoCtrl'); if(!el) return;
    el.value = JSON.stringify(o);
    el.dispatchEvent(new Event('input', { bubbles:true })); el.dispatchEvent(new Event('change', { bubbles:true }));
  }
  // Heure de remise LID (Timing départ) en UTC, format HH:MMz
  function acLidZ(){
    const v = (document.getElementById('RemiseLID')?.value || '').trim();
    const m = v.match(/^(\d{1,2}):(\d{2})/); if(!m) return '';
    let min = (+m[1]) * 60 + (+m[2]);
    if(typeof isUTC !== 'undefined' && !isUTC) min += new Date().getTimezoneOffset();
    min = ((min % 1440) + 1440) % 1440;
    return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0') + 'z';
  }
  function acDate(){
    const d = (document.getElementById('Date')?.value || '').split('-');
    return d.length === 3 ? d[2] + '/' + d[1] + '/' + d[0] : '';
  }
  function acFlight(){ return acVal('Cie') + acVal('NVol'); }
  window.acSummary = function(){
    const o = acGet();
    return { done:o.c.length, total:AC_TOTAL, lid:acLidZ(), nom:o.n, signe:!!o.s };
  };
  window.acSteps = function(on){
    const p = document.querySelector('#prestationsModal .sh-head .sub');
    const r = document.querySelector('#rzaModal .sh-head .sub');
    if(p) p.textContent = on ? 'Étape 2 sur 3' : 'Étape 1 sur 2';
    if(r) r.textContent = on ? 'Étape 3 sur 3' : 'Étape 2 sur 2';
  };
  function acMissing(o){
    const out = [];
    const left = AC_TOTAL - o.c.length;
    if(left > 0) out.push(left + (left > 1 ? ' cases à cocher' : ' case à cocher'));
    if(!o.n) out.push('nom du RZA');
    if(!o.s) out.push('signature');
    return out;
  }

  // Ligne d'état dans l'onglet Retard, au-dessus de « Valider le vol »
  function acSyncRow(){
    const row = document.getElementById('acRow'); if(!row) return;
    const need = acNeeded();
    row.hidden = !need; if(!need) return;
    const o = acGet(), miss = acMissing(o), ok = !miss.length;
    document.getElementById('acRowSub').textContent = o.c.length + '/' + AC_TOTAL + ' vérifiés · ' + (o.s ? 'signé' : 'non signé');
    const st = document.getElementById('acRowSt');
    st.textContent = ok ? 'Signé' : (o.c.length || o.s ? 'En cours' : (typeof AC_REQUIRED !== 'undefined' && !AC_REQUIRED ? 'Facultatif' : 'À faire'));
    row.classList.toggle('is-ok', ok);
  }
  window.acSyncRow = acSyncRow;

  let acNextCb = null;
  window.uiAutoCtrlOpen = function(next){
    acNextCb = typeof next === 'function' ? next : null;
    document.getElementById('acStep').textContent = acNextCb ? 'Étape 1 sur 3' : (acFlight() || 'Vol') + ' · ' + acDate();
    document.getElementById('acNext').textContent = acNextCb ? 'Continuer' : 'Enregistrer';
    acRender();
    document.getElementById('acModal').style.display = 'flex';
    requestAnimationFrame(acSigInit);
  };
  window.uiAutoCtrlClose = function(){
    document.getElementById('acModal').style.display = 'none';
    acNextCb = null; acSyncRow();
  };
  window.uiAutoCtrlNext = function(){
    const miss = acMissing(acGet());
    const box = document.getElementById('acMiss');
    if(miss.length && acNextCb){
      box.hidden = false;
      box.textContent = 'Il manque : ' + miss.join(', ') + '.';
      return;
    }
    const cb = acNextCb;
    uiAutoCtrlClose();
    if(cb) cb();
  };

  function acRender(){
    const o = acGet(), lid = acLidZ();
    const body = document.getElementById('acBody');
    let i = 0, h = '';
    h += '<div class="ac-head">'
       + '<div><small>Vol</small><b>' + (acFlight() || '—') + '</b></div>'
       + '<div><small>Date</small><b>' + (acDate() || '—') + '</b></div>'
       + '<div class="' + (lid ? '' : 'is-miss') + '"><small>Remise LID</small><b>' + (lid || 'à saisir') + '</b></div>'
       + '</div>';
    if(!lid) h += '<div class="ac-hint">Heure de remise LID pas encore saisie dans Timing › Départ.</div>';
    h += '<div class="ac-prog"><i id="acBar"></i></div>';
    let lastSec = '';
    AC_GROUPS.forEach((g, gi) => {
      if(g.sec !== lastSec){ h += '<div class="ac-sec">' + g.sec + '</div>'; lastSec = g.sec; }
      h += '<div class="ac-card" data-g="' + gi + '"><div class="ac-gh"><span>' + g.doc + '</span><button type="button" class="ac-all" data-g="' + gi + '">Tout cocher</button></div>';
      g.items.forEach(txt => {
        const on = o.c.includes(i);
        h += '<label class="ac-it' + (on ? ' on' : '') + '"><input type="checkbox" data-i="' + i + '"' + (on ? ' checked' : '') + '><span class="ac-box"><svg class="ico"><use href="#i-check"/></svg></span><span>' + txt + '</span></label>';
        i++;
      });
      h += '</div>';
      if(g.note) h += '<div class="ac-note">' + g.note + '</div>';
    });
    h += '<div class="ac-sec">Responsable</div>'
       + '<div class="ac-card ac-sign">'
       + '<div class="field"><label class="label">Nom &amp; prénom du RZA</label><input class="input ac-nom" type="text" autocomplete="off" placeholder="DUPONT Jean" value="' + (o.n || acDefNom()).replace(/"/g, '&quot;') + '"></div>'
       + '<div class="ac-sig-h"><span class="label">Signature</span><button type="button" class="ac-all" id="acSigClear">Effacer</button></div>'
       + '<div class="ac-sig-wrap"><canvas id="acSig"></canvas><span class="ac-sig-ph" id="acSigPh">Signe ici avec le doigt</span></div>'
       + '</div>';
    body.innerHTML = h;
    document.getElementById('acMiss').hidden = true;
    acProgress();

    body.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
      const o2 = acGet(), n = +cb.dataset.i;
      o2.c = o2.c.filter(x => x !== n); if(cb.checked) o2.c.push(n);
      o2.c.sort((a, b) => a - b);
      cb.closest('.ac-it').classList.toggle('on', cb.checked);
      acSet(o2); acProgress();
    }));
    body.querySelectorAll('.ac-all[data-g]').forEach(b => b.addEventListener('click', () => {
      const boxes = [...body.querySelectorAll('.ac-card[data-g="' + b.dataset.g + '"] input[type=checkbox]')];
      const all = boxes.every(x => x.checked);
      boxes.forEach(x => { if(x.checked === all){ x.checked = !all; x.dispatchEvent(new Event('change')); } });
    }));
    const nom = body.querySelector('.ac-nom');
    const saveNom = () => {
      const o2 = acGet(); o2.n = nom.value.trim(); acSet(o2); acProgress();
      try{ if(o2.n) localStorage.setItem('acNom', o2.n); }catch(e){}
    };
    nom.addEventListener('input', saveNom);
    if(!o.n && nom.value) saveNom();
    document.getElementById('acSigClear').addEventListener('click', () => {
      const o2 = acGet(); o2.s = ''; o2.t = ''; acSet(o2); acSigInit(); acProgress();
    });
  }
  function acDefNom(){ try{ return localStorage.getItem('acNom') || ''; }catch(e){ return ''; } }
  function acProgress(){
    const o = acGet(), bar = document.getElementById('acBar');
    if(bar) bar.style.width = (o.c.length / AC_TOTAL * 100) + '%';
    const ok = !acMissing(o).length;
    const box = document.getElementById('acMiss'); if(box && ok) box.hidden = true;
    const ph = document.getElementById('acSigPh'); if(ph) ph.hidden = !!o.s;
    document.querySelectorAll('#acBody .ac-card[data-g]').forEach(c => {
      const bx = c.querySelectorAll('input[type=checkbox]');
      c.classList.toggle('done', [...bx].every(x => x.checked));
      const b = c.querySelector('.ac-all'); if(b) b.textContent = [...bx].every(x => x.checked) ? 'Tout décocher' : 'Tout cocher';
    });
  }

  // Signature au doigt : canvas à la densité de l'écran, enregistrée en PNG léger (1x)
  function acSigInit(){
    const cv = document.getElementById('acSig'); if(!cv) return;
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if(!w) return;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.4;
    ctx.strokeStyle = getComputedStyle(cv).color || '#0B1E4F';
    const o = acGet();
    if(o.s){
      const img = new Image();
      img.onload = () => {   // signature stockée en marine : repeinte à la couleur du thème
        ctx.drawImage(img, 0, 0, w, h);
        ctx.save(); ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(0, 0, w, h); ctx.restore();
      };
      img.src = o.s;
    }
    if(cv.dataset.bound) return;
    cv.dataset.bound = '1';
    let drawing = false, last = null, inked = false;
    const pt = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', e => {
      e.preventDefault(); cv.setPointerCapture?.(e.pointerId);
      drawing = true; last = pt(e); inked = false;
      const c = cv.getContext('2d'); c.beginPath(); c.arc(last[0], last[1], 1.1, 0, 7); c.fillStyle = c.strokeStyle; c.fill();
      const ph = document.getElementById('acSigPh'); if(ph) ph.hidden = true;
    });
    cv.addEventListener('pointermove', e => {
      if(!drawing) return; e.preventDefault();
      const p = pt(e), c = cv.getContext('2d');
      c.beginPath(); c.moveTo(last[0], last[1]); c.lineTo(p[0], p[1]); c.stroke();
      last = p; inked = true;
    });
    const end = () => {
      if(!drawing) return; drawing = false;
      // copie 1x, plus légère pour la sauvegarde du vol
      const w1 = cv.clientWidth, h1 = cv.clientHeight, t = document.createElement('canvas');
      t.width = w1; t.height = h1;
      const tc = t.getContext('2d'); tc.drawImage(cv, 0, 0, w1, h1);
      tc.globalCompositeOperation = 'source-in'; tc.fillStyle = '#0B1E4F'; tc.fillRect(0, 0, w1, h1);
      const o2 = acGet(); o2.s = t.toDataURL('image/png'); o2.t = new Date().toISOString();
      acSet(o2); acProgress();
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end); cv.addEventListener('pointerleave', end);
  }

  // Feuille remplie en image (même mise en page que le papier) : partage ou téléchargement
  function acSheetCanvas(){
    const o = acGet();
    const W = 1000, PAD = 50, ROW = 34;
    const rows = AC_GROUPS.reduce((n, g) => n + g.items.length + 1 + (g.note ? 1 : 0), 0);
    const H = 300 + rows * ROW + 260;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#0B1E4F'; c.textBaseline = 'middle';
    c.font = '700 30px Manrope, sans-serif'; c.fillText('Auto-contrôle vol RYANAIR', PAD, 60);
    c.font = '500 18px Manrope, sans-serif'; c.fillStyle = '#56687b'; c.fillText('Aéroport Paris-Beauvais · V1-04/2024', PAD, 95);
    const info = [['N° de vol', acFlight() || '—'], ['Date', acDate() || '—'], ['Heure de remise du LID', acLidZ() || '--:--z']];
    info.forEach((kv, k) => {
      const x = PAD + k * 300;
      c.fillStyle = '#8A93A6'; c.font = '700 15px Manrope, sans-serif'; c.fillText(kv[0].toUpperCase(), x, 145);
      c.fillStyle = '#0B1E4F'; c.font = '700 26px Manrope, sans-serif'; c.fillText(kv[1], x, 178);
    });
    let y = 230, i = 0;
    AC_GROUPS.forEach(g => {
      c.fillStyle = '#E9EDF3'; c.fillRect(PAD, y, W - 2 * PAD, ROW);
      c.fillStyle = '#0B1E4F'; c.font = '800 16px Manrope, sans-serif'; c.fillText(g.sec.toUpperCase() + ' · ' + g.doc, PAD + 12, y + ROW / 2);
      c.fillText('Vérifié', W - PAD - 80, y + ROW / 2);
      y += ROW;
      g.items.forEach(txt => {
        c.strokeStyle = '#d5dde7'; c.lineWidth = 1; c.strokeRect(PAD, y, W - 2 * PAD, ROW);
        c.fillStyle = '#0f1723'; c.font = '500 17px Manrope, sans-serif'; c.fillText(txt, PAD + 12, y + ROW / 2);
        const on = o.c.includes(i);
        c.strokeStyle = on ? '#1F9D57' : '#aebccc'; c.lineWidth = 2; c.strokeRect(W - PAD - 62, y + 7, 20, 20);
        if(on){ c.beginPath(); c.moveTo(W - PAD - 58, y + 17); c.lineTo(W - PAD - 53, y + 23); c.lineTo(W - PAD - 45, y + 11); c.stroke(); }
        y += ROW; i++;
      });
      if(g.note){ c.fillStyle = '#56687b'; c.font = 'italic 600 15px Manrope, sans-serif'; c.fillText(g.note, PAD + 4, y + ROW / 2); y += ROW; }
    });
    y += 20;
    c.fillStyle = '#8A93A6'; c.font = '700 15px Manrope, sans-serif'; c.fillText('NOM & PRÉNOM DU RZA', PAD, y);
    c.fillText('SIGNATURE', W / 2, y);
    c.fillStyle = '#0B1E4F'; c.font = '700 24px Manrope, sans-serif'; c.fillText(o.n || '—', PAD, y + 36);
    if(o.t){
      const d = new Date(o.t);
      c.fillStyle = '#56687b'; c.font = '500 15px Manrope, sans-serif';
      c.fillText('Signé à ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + 'z', PAD, y + 70);
    }
    c.strokeStyle = '#d5dde7'; c.lineWidth = 1; c.strokeRect(W / 2, y + 14, W / 2 - PAD, 150);
    return new Promise(res => {
      if(!o.s) return res(cv);
      const img = new Image();
      img.onload = () => {
        const bw = W / 2 - PAD - 20, bh = 130, k = Math.min(bw / img.width, bh / img.height);
        c.drawImage(img, W / 2 + 10, y + 24, img.width * k, img.height * k); res(cv);
      };
      img.onerror = () => res(cv);
      img.src = o.s;
    });
  }
  window.acSheetCanvas = acSheetCanvas;
  window.uiAutoCtrlShare = async function(){
    const cv = await acSheetCanvas();
    const name = 'autocontrole-' + (acFlight() || 'vol') + '-' + (acDate().replace(/\//g, '') || 'date') + '.png';
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    try{
      const file = new File([blob], name, { type:'image/png' });
      if(navigator.canShare && navigator.canShare({ files:[file] })){ await navigator.share({ files:[file], title:'Auto-contrôle ' + acFlight() }); return; }
    }catch(e){ if(e && e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  /* v2.67 : clavier ouvert → la barre du bas se cache (classe kb-open).
     v3.26 (Hugo, iPhone : sauts dans LOAD) : la page défile elle-même, iOS amène donc la case au-dessus du
     clavier tout seul. On ne déplace plus rien en JS (v3.01 et v3.16 retirés : ils luttaient contre iOS). */
  function initKeyboardGuard(){
    let maxH = window.innerHeight;
    const isField = el => el && !el.readOnly && !el.disabled &&
      (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|range|color|file)$/.test(el.type)));
    const vvH = () => (window.visualViewport ? window.visualViewport.height : window.innerHeight);
    const sync = () => {
      if(!document.activeElement || !isField(document.activeElement)) maxH = Math.max(maxH, window.innerHeight);
      const kb = isField(document.activeElement) && Math.min(window.innerHeight, vvH()) < maxH * 0.8;
      document.body.classList.toggle('kb-open', kb);
      fitHome(kb);
    };
    // v2.99.1 (Hugo, iPhone) : iOS pose le clavier par-dessus l'écran d'accueil (position fixed) et cache
    // le mot de passe. On cale l'accueil sur la zone visible (au-dessus du clavier).
    const fitHome = kb => {
      const hs = document.querySelector('.home-screen'), vv = window.visualViewport;
      if(!hs) return;
      const b = document.body.classList;
      if(kb && vv && (b.contains('no-tab') || b.contains('pv-locked'))){
        hs.style.top = vv.offsetTop + 'px'; hs.style.height = vv.height + 'px'; hs.style.bottom = 'auto';
      } else if(hs.style.height){
        hs.style.top = hs.style.height = hs.style.bottom = '';
      }
    };
    window.addEventListener('resize', sync);
    if(window.visualViewport){ window.visualViewport.addEventListener('resize', sync); window.visualViewport.addEventListener('scroll', () => fitHome(document.body.classList.contains('kb-open'))); }
    document.addEventListener('focusin', () => setTimeout(sync, 300));
    document.addEventListener('focusout', () => setTimeout(sync, 50));
  }

})();
