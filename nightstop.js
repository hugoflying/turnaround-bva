/* =====================================================================
   v3.51 · Nightstop & tour avion (feuille papier BVA « Checklist & suivi des
   prestations nightstop » + « Tour avion »), version numérique.
   Vols basés : départ basé (From = BVA) ou retour basé (To = BVA).
   Facultative pour l'instant, comme l'auto-contrôle (NS_REQUIRED = false) :
   deviendra obligatoire avec le serveur des rapports.
   Données du vol dans le champ caché Nightstop :
   { sv:{ toilV, toilR, eauV, eauR, men:'S'|'DC'|'DI'|'', gpu, ech, asu, tr:'BELLOVA'|'ASSISTAIR'|'', deg, dec },
     def:'arr'|'dep' (cases par défaut posées), touched (services modifiés à la main),
     hs:{ on, ok, n (NOM), p (Prénom), h, s },                       fouille soutes (retour basé, arrivée pays tiers)
     ta:{ sv:'OUI'|'NON'|'', dm:'OUI'|'NON'|'', x:[[u,v]…], n, p, h, s } }   tour avion
   Les croix sont en coordonnées relatives (0 à 1) sur la silhouette img/silhouette-b737.png.
   ===================================================================== */
const NS_REQUIRED = false;
(function(){
  const $ = id => document.getElementById(id);
  const val = id => ($(id)?.value || '').trim().toUpperCase();
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const IMG = './img/silhouette-b737.png';

  // Services de la feuille papier (connexion / déconnexion GPU retirées ; ménage Tidy / Full remplacé par S, DC, DI)
  // tg : interrupteur Oui / Non (Non par défaut)
  const SV = [
    { k:'toil', t:'Toilettes', opts:[['toilV','Vidange'], ['toilR','Remplissage']] },
    { k:'eau',  t:'Eau potable', opts:[['eauV','Vidange'], ['eauR','Remplissage']] },
    { k:'men',  t:'Ménage', one:'men', opts:[['S','S'], ['DC','DC'], ['DI','DI']] },
    { k:'gpu',  t:'GPU', tg:true, opts:[['gpu','Oui']] },
    { k:'ech',  t:'2 échelles', tg:true, opts:[['ech','Oui']] },
    { k:'asu',  t:'ASU', tg:true, opts:[['asu','Oui']] },
    { k:'tr',   t:'Tractage', one:'tr', opts:[['BELLOVA','Bellova'], ['ASSISTAIR','Assist\'Air']] },
    { k:'deg',  t:'Dégivrage', tg:true, opts:[['deg','Oui']] },
    { k:'dec',  t:'Collecte déchets', tg:true, opts:[['dec','Oui']] },
  ];
  // Cases cochées d'office à la première ouverture (Hugo) : retour basé / départ basé
  const SV_DEF = {
    arr:{ toilV:true, eauV:true, men:'S', gpu:true, dec:true },
    dep:{ toilR:true, eauR:true },
  };

  window.nsMode = function(){
    if(val('From') === 'BVA') return 'dep';
    if(val('To') === 'BVA') return 'arr';
    return '';
  };
  window.nsNeeded = () => !!nsMode();

  function get(){
    let o = {};
    try{ o = JSON.parse($('Nightstop')?.value || '{}') || {}; }catch(e){}
    o.sv = o.sv || {}; o.hs = o.hs || {}; o.ta = o.ta || {}; o.ta.x = o.ta.x || [];
    return o;
  }
  function set(o){
    const el = $('Nightstop'); if(!el) return;
    el.value = JSON.stringify(o);
    el.dispatchEvent(new Event('input', { bubbles:true })); el.dispatchEvent(new Event('change', { bubbles:true }));
  }
  const svDone = o => SV.filter(s => s.one ? !!o.sv[s.one] : s.opts.some(([k]) => o.sv[k])).length;
  function started(o){
    return (o.touched && svDone(o) > 0) || o.hs.on || o.ta.sv || o.ta.dm || o.ta.x.length || o.ta.s;
  }
  function date(){
    const d = ($('Date')?.value || '').split('-');
    return d.length === 3 ? d[2] + '/' + d[1] + '/' + d[0] : '';
  }
  const flight = () => val('Cie') + val('NVol');
  const hm = iso => { if(!iso) return ''; const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const nowHM = () => hm(new Date().toISOString());

  window.nsSummary = function(){
    const o = get();
    return { mode:nsMode(), started:!!started(o), sv:svDone(o), svTotal:SV.length, o };
  };

  // Ligne d'état dans l'onglet Retard, sous l'auto-contrôle
  function syncRow(){
    const row = $('nsRow'); if(!row) return;
    const m = nsMode();
    row.hidden = !m; if(!m) return;
    const o = get(), sig = !!o.ta.s;
    $('nsRowT').textContent = m === 'dep' ? 'Nightstop · départ basé' : 'Nightstop · retour basé';
    $('nsRowSub').textContent = svDone(o) + '/' + SV.length + ' services · tour avion ' + (o.ta.s ? 'signé' : 'non signé') + (o.ta.x.length ? ' · ' + o.ta.x.length + (o.ta.x.length > 1 ? ' dommages' : ' dommage') : '');
    $('nsRowSt').textContent = sig ? 'Signé' : started(o) ? 'En cours' : (NS_REQUIRED ? 'À faire' : 'Facultatif');
    row.classList.toggle('is-ok', sig);
  }
  window.nsSyncRow = syncRow;

  /* ---------- feuille ---------- */
  window.uiNightstopOpen = function(){
    render();
    $('nsModal').style.display = 'flex';
    requestAnimationFrame(() => document.querySelectorAll('#nsBody canvas[data-sig]').forEach(sigInit));
  };
  window.uiNightstopClose = function(){ $('nsModal').style.display = 'none'; syncRow(); };

  const chip = (on, attrs, txt) => '<button type="button" class="ns-c' + (on ? ' on' : '') + '" ' + attrs + '>' + txt + '</button>';
  // nom en majuscules, prénom avec majuscule initiale (Jean-Pierre)
  const fmtN = v => v.toUpperCase();
  const fmtP = v => v.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  const fullName = x => [x.n, x.p].filter(Boolean).join(' ');
  // personnes déjà saisies [{n, p}], proposées en suggestion (listes #nsNoms, #nsPrenoms)
  const gensGet = () => { try{ return JSON.parse(localStorage.getItem('nsGens') || '[]'); }catch(e){ return []; } };
  function gensAdd(n, p){
    if(!n) return;
    try{ localStorage.setItem('nsGens', JSON.stringify([{ n, p }, ...gensGet().filter(x => x.n !== n || x.p !== p)].slice(0, 10))); }catch(e){}
  }
  const uniq = a => [...new Set(a.filter(Boolean))];
  const gensList = () => '<datalist id="nsNoms">' + uniq(gensGet().map(x => x.n)).map(v => '<option value="' + esc(v) + '">').join('') + '</datalist>'
    + '<datalist id="nsPrenoms">' + uniq(gensGet().map(x => x.p)).map(v => '<option value="' + esc(v) + '">').join('') + '</datalist>';
  const sigBlock = (key, who, ph, hour) =>
      '<div class="ns-np"><div class="field"><label class="label">Nom</label><input class="input ns-up" type="text" autocomplete="off" autocapitalize="characters" list="nsNoms" data-name="' + key + '" data-f="n" value="' + esc(who.n || '') + '"></div>'
    + '<div class="field"><label class="label">Prénom</label><input class="input" type="text" autocomplete="off" autocapitalize="words" list="nsPrenoms" data-name="' + key + '" data-f="p" value="' + esc(who.p || '') + '"></div></div>'
    + (hour != null ? '<div class="field ns-h"><label class="label">Heure locale</label><div class="ns-hrow"><input class="input" type="time" data-hour="' + key + '" value="' + esc(hour) + '"><button type="button" class="ns-c" data-now="' + key + '">Now</button></div></div>' : '')
    + '<div class="ac-sig-h"><span class="label">Signature</span><button type="button" class="ac-all" data-sigclr="' + key + '">Effacer</button></div>'
    + '<div class="ac-sig-wrap"><canvas class="ns-sig" data-sig="' + key + '"></canvas><span class="ac-sig-ph" data-ph="' + key + '">' + ph + '</span></div>';

  function render(){
    const o = get(), m = nsMode(), body = $('nsBody');
    const fd = m === 'arr' ? val('From') : val('To');
    $('nsStep').textContent = (flight() || 'Vol') + ' · ' + (date() || '—');
    let h = '<div class="ac-head ns-head">'
      + '<div><small>Immat</small><b>' + esc(val('Immat') || '—') + '</b></div>'
      + '<div><small>Vol</small><b>' + esc(flight() || '—') + '</b></div>'
      + '<div><small>Parking</small><b>' + esc(val('Parking') || '—') + '</b></div>'
      + '<div><small>Date</small><b>' + esc(date() || '—') + '</b></div>'
      + '<div><small>' + (m === 'arr' ? 'Prov.' : 'Dest.') + '</small><b>' + esc(fd || '—') + '</b></div>'
      + '<div><small>Type</small><b class="ns-mode">' + (m === 'arr' ? 'Arrivée' : 'Départ') + '</b></div>'
      + '</div>';

    // cases par défaut, tant que les services n'ont pas été touchés à la main
    if(m && !o.touched && o.def !== m){ o.sv = Object.assign({}, SV_DEF[m]); o.def = m; set(o); }
    h += '<div class="ac-sec">Services</div><div class="ac-card ns-sv">';
    SV.forEach(s => {
      if(s.tg){
        const on = !!o.sv[s.k];
        h += '<div class="ns-row"><span>' + s.t + '</span><button type="button" class="ns-tg' + (on ? ' on' : '') + '" data-tg="' + s.k + '" role="switch" aria-checked="' + on + '"><b>' + (on ? 'Oui' : 'Non') + '</b><i></i></button></div>';
        return;
      }
      h += '<div class="ns-row"><span>' + s.t + '</span><span class="ns-cs">'
        + s.opts.map(([k, t]) => chip(s.one ? o.sv[s.one] === k : !!o.sv[k], s.one ? 'data-one="' + s.one + '" data-v="' + k + '"' : 'data-sv="' + k + '"', t)).join('')
        + '</span></div>';
    });
    h += '</div>';

    if(m === 'arr'){
      h += '<div class="ac-sec">Fouille des soutes</div><div class="ac-card">'
        + '<div class="ns-row"><span>Arrivée d\'un pays tiers</span><span class="ns-cs">' + chip(o.hs.on === true, 'data-hs="on"', 'Oui') + chip(o.hs.on === false, 'data-hs="off"', 'Non') + '</span></div>';
      if(o.hs.on){
        h += '<label class="ac-it' + (o.hs.ok ? ' on' : '') + '"><input type="checkbox" data-hsok' + (o.hs.ok ? ' checked' : '') + '><span class="ac-box"><svg class="ico"><use href="#i-check"/></svg></span><span>Hold security check / search effectué</span></label>'
          + '<div class="ac-sign">' + sigBlock('h', o.hs, 'Signature', o.hs.h || '') + '</div>';
      }
      h += '</div>';
    }

    const x = o.ta.x;
    if(x.length) o.ta.dm = 'OUI';
    h += '<div class="ac-sec">Tour avion</div><div class="ac-card">'
      + '<div class="ns-row"><span>Soutes vidées et contrôlées</span><span class="ns-cs">' + chip(o.ta.sv === 'OUI', 'data-ta="sv" data-v="OUI"', 'Oui') + chip(o.ta.sv === 'NON', 'data-ta="sv" data-v="NON"', 'Non') + '</span></div>'
      + '<div class="ns-row"><span>Dommage(s) constaté(s)</span><span class="ns-cs">' + chip(o.ta.dm === 'OUI', 'data-ta="dm" data-v="OUI"', 'Oui') + chip(o.ta.dm === 'NON', 'data-ta="dm" data-v="NON"' + (x.length ? ' disabled' : ''), 'Non') + '</span></div>'
      + '<div class="ns-pl-wrap"><button type="button" class="ns-pl" id="nsPlane" aria-label="Annoter la silhouette en plein écran">' + planeHTML(x) + '</button>'
      + '<div class="ns-pl-foot"><span>' + (x.length ? x.length + (x.length > 1 ? ' croix' : ' croix') + ' sur la silhouette' : 'Repérer le(s) dommage(s) par une croix') + '</span><button type="button" class="ns-c on" id="nsFullBtn">Plein écran</button></div></div>'
      + '<div class="ac-sign">' + sigBlock('t', o.ta, 'Signature', o.ta.h || '') + '</div>'
      + '</div>';
    body.innerHTML = h + gensList();
    bind();
    paintPh();
  }
  function planeHTML(x){
    return '<img src="' + IMG + '" alt="Silhouette avion, vues gauche, droite et face" draggable="false">'
      + x.map(([u, v]) => '<i class="ns-x" style="left:' + (u * 100).toFixed(2) + '%;top:' + (v * 100).toFixed(2) + '%"></i>').join('');
  }
  function paintPh(){
    const o = get(), s = { h:o.hs.s, t:o.ta.s };
    document.querySelectorAll('#nsBody [data-ph]').forEach(p => p.hidden = !!s[p.dataset.ph]);
  }
  const upd = fn => { const o = get(); fn(o); set(o); };
  function bind(){
    const body = $('nsBody');
    body.querySelectorAll('[data-sv]').forEach(b => b.onclick = () => { upd(o => { o.sv[b.dataset.sv] = !o.sv[b.dataset.sv]; o.touched = 1; }); b.classList.toggle('on'); });
    body.querySelectorAll('[data-tg]').forEach(b => b.onclick = () => {
      const k = b.dataset.tg; upd(o => { o.sv[k] = !o.sv[k]; o.touched = 1; });
      const on = !!get().sv[k]; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); b.querySelector('b').textContent = on ? 'Oui' : 'Non';
    });
    body.querySelectorAll('[data-one]').forEach(b => b.onclick = () => {
      const k = b.dataset.one, v = b.dataset.v;
      upd(o => { o.sv[k] = o.sv[k] === v ? '' : v; o.touched = 1; });
      body.querySelectorAll('[data-one="' + k + '"]').forEach(x => x.classList.toggle('on', x === b && get().sv[k] === v));
    });
    body.querySelectorAll('[data-hs]').forEach(b => b.onclick = () => { upd(o => o.hs.on = b.dataset.hs === 'on'); render(); requestAnimationFrame(() => document.querySelectorAll('#nsBody canvas[data-sig]').forEach(sigInit)); });
    const ok = body.querySelector('[data-hsok]');
    if(ok) ok.onchange = () => { upd(o => o.hs.ok = ok.checked); ok.closest('.ac-it').classList.toggle('on', ok.checked); };
    body.querySelectorAll('[data-ta]').forEach(b => b.onclick = () => {
      const k = b.dataset.ta, v = b.dataset.v;
      // une croix sur la silhouette = dommage constaté (Oui imposé tant qu'il reste une croix)
      if(k === 'dm' && get().ta.x.length) return;
      upd(o => o.ta[k] = o.ta[k] === v ? '' : v);
      body.querySelectorAll('[data-ta="' + k + '"]').forEach(x => x.classList.toggle('on', get().ta[k] === x.dataset.v));
    });
    // nom / prénom : fouille des soutes <-> tour avion, l'un remplit l'autre tant que l'autre n'a pas été saisi à la main
    const names = [...body.querySelectorAll('[data-name]')];
    const fmt = i => i.dataset.f === 'n' ? fmtN(i.value) : fmtP(i.value);
    const setVal = (i, v) => { if(i.value === v) return; const a = i.selectionStart, b = i.selectionEnd; i.value = v; try{ if(document.activeElement === i) i.setSelectionRange(a, b); }catch(e){} };
    const saveName = i => upd(o => { (i.dataset.name === 'h' ? o.hs : o.ta)[i.dataset.f] = i.value.trim(); });
    const twin = i => names.filter(j => j !== i && j.dataset.f === i.dataset.f);
    names.forEach(i => i.oninput = () => {
      setVal(i, fmt(i)); delete i.dataset.auto; saveName(i);
      twin(i).forEach(j => { if(!j.value || j.dataset.auto){ j.value = i.value; j.dataset.auto = '1'; saveName(j); } });
      // nom choisi dans les suggestions : prénom associé si le prénom est vide
      if(i.dataset.f === 'n'){
        const g = gensGet().find(x => x.n === i.value.trim());
        const pi = names.find(j => j.dataset.name === i.dataset.name && j.dataset.f === 'p');
        if(g && g.p && pi && (!pi.value || pi.dataset.auto)){ pi.value = g.p; pi.dataset.auto = '1'; pi.oninput(); pi.dataset.auto = '1'; }
      }
    });
    // champ vide : repris de l'autre signature, sinon de la dernière personne saisie
    const last = gensGet()[0] || {};
    names.forEach(i => { if(!i.value){ const v = ((twin(i).find(j => j.value.trim()) || {}).value) || last[i.dataset.f] || ''; if(v){ i.value = v; i.dataset.auto = '1'; saveName(i); } } });
    body.querySelectorAll('[data-hour]').forEach(i => i.onchange = () => upd(o => { if(i.dataset.hour === 'h') o.hs.h = i.value; else o.ta.h = i.value; }));
    body.querySelectorAll('[data-now]').forEach(b => b.onclick = () => {
      const i = body.querySelector('[data-hour="' + b.dataset.now + '"]'); i.value = nowHM(); i.onchange();
    });
    body.querySelectorAll('[data-sigclr]').forEach(b => b.onclick = () => {
      const k = b.dataset.sigclr;
      upd(o => { if(k === 'h') o.hs.s = ''; else o.ta.s = ''; });
      const cv = body.querySelector('canvas[data-sig="' + k + '"]'); delete cv.dataset.bound; sigInit(cv); paintPh();
    });
    $('nsPlane').onclick = fullOpen; $('nsFullBtn').onclick = fullOpen;
  }

  // Signature au doigt ou au stylet (même principe que l'auto-contrôle), PNG 1x en marine
  function sigInit(cv){
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if(!w) return;
    const k = cv.dataset.sig;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.4;
    ctx.strokeStyle = getComputedStyle(cv).color || '#0B1E4F';
    const o = get(), src = k === 'h' ? o.hs.s : o.ta.s;
    if(src){
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
        ctx.save(); ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(0, 0, w, h); ctx.restore();
      };
      img.src = src;
    }
    if(cv.dataset.bound) return;
    cv.dataset.bound = '1';
    let drawing = false, last = null, fresh = false;
    const pt = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', e => {
      e.preventDefault(); cv.setPointerCapture?.(e.pointerId);
      // taille changée depuis l'ouverture (rotation, clavier) : recaler le canevas avant de dessiner
      if(cv.width !== Math.round(cv.clientWidth * (window.devicePixelRatio || 1))) sigInit(cv);
      drawing = true; last = pt(e);
      const o0 = get(); fresh = !(k === 'h' ? o0.hs.s : o0.ta.s);
      const c = cv.getContext('2d'); c.beginPath(); c.arc(last[0], last[1], 1.1, 0, 7); c.fillStyle = c.strokeStyle; c.fill();
      const ph = document.querySelector('#nsBody [data-ph="' + k + '"]'); if(ph) ph.hidden = true;
    });
    cv.addEventListener('pointermove', e => {
      if(!drawing) return; e.preventDefault();
      const p = pt(e), c = cv.getContext('2d');
      c.beginPath(); c.moveTo(last[0], last[1]); c.lineTo(p[0], p[1]); c.stroke(); last = p;
    });
    const end = () => {
      if(!drawing) return; drawing = false;
      const w1 = cv.clientWidth, h1 = cv.clientHeight, t = document.createElement('canvas');
      t.width = w1; t.height = h1;
      const tc = t.getContext('2d'); tc.drawImage(cv, 0, 0, w1, h1);
      tc.globalCompositeOperation = 'source-in'; tc.fillStyle = '#0B1E4F'; tc.fillRect(0, 0, w1, h1);
      const png = t.toDataURL('image/png');
      // heure de signature prise automatiquement (premier trait d'une signature vide)
      const hi = document.querySelector('#nsBody [data-hour="' + k + '"]');
      const hh = fresh || !(hi && hi.value) ? nowHM() : hi.value;
      upd(o => { if(k === 'h'){ o.hs.s = png; o.hs.h = hh; } else { o.ta.s = png; o.ta.h = hh; } });
      if(hi) hi.value = hh;
      const w = k === 'h' ? get().hs : get().ta; gensAdd(w.n, w.p);
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end); cv.addEventListener('pointerleave', end);
  }

  /* ---------- silhouette en plein écran paysage : un appui pose une croix, un appui sur une croix la retire ---------- */
  const portrait = () => window.innerHeight > window.innerWidth;
  function fullPaint(){
    const x = get().ta.x;
    const box = $('nsFullPlane'), ar = 1326 / 569, cw = box.clientWidth, ch = box.clientHeight;
    const w = Math.min(cw, ch * ar);
    box.innerHTML = '<div class="ns-pl-in" style="width:' + Math.floor(w) + 'px;height:' + Math.floor(w / ar) + 'px">' + planeHTML(x) + '</div>';
    $('nsFullN').textContent = x.length ? x.length + (x.length > 1 ? ' croix' : ' croix') : 'Toucher la silhouette pour poser une croix';
    $('nsFullUndo').disabled = !x.length; $('nsFullClr').disabled = !x.length;
  }
  function fullLayout(){ $('nsFull').classList.toggle('rot', portrait()); fullPaint(); }
  function fullOpen(){
    const f = $('nsFull');
    f.style.display = 'block';
    fullLayout();
    // pas de requestFullscreen : Android affiche alors un message noir par-dessus la silhouette
    setTimeout(fullLayout, 300);
  }
  window.nsFullClose = function(){
    $('nsFull').style.display = 'none';
    const p = $('nsPlane'); if(p){ render(); requestAnimationFrame(() => document.querySelectorAll('#nsBody canvas[data-sig]').forEach(sigInit)); }
  };
  window.nsFullUndo = function(){ upd(o => o.ta.x.pop()); fullPaint(); };
  window.nsFullClear = function(){ upd(o => o.ta.x = []); fullPaint(); };
  // position (u, v) de 0 à 1 sur la silhouette ; téléphone tenu en portrait : la scène est tournée de 90°
  function fullUV(e){
    const img = $('nsFullPlane').querySelector('img'); if(!img) return null;
    const r = img.getBoundingClientRect();
    let u, v;
    if($('nsFull').classList.contains('rot')){ u = (e.clientY - r.top) / r.height; v = (r.right - e.clientX) / r.width; }
    else { u = (e.clientX - r.left) / r.width; v = (e.clientY - r.top) / r.height; }
    const ar = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 2.33;
    return { u, v, ar };
  }
  const clamp = n => Math.min(1, Math.max(0, n));
  const nearX = (x, p) => x.findIndex(([a, b]) => Math.hypot((a - p.u) * p.ar, b - p.v) < 0.045);
  // appui court : pose une croix, ou retire celle touchée. Appui long (0,35 s) sur une croix : on la fait glisser
  let press = null;
  function fullDown(e){
    const p = fullUV(e); if(!p) return;
    e.preventDefault();
    $('nsFullPlane').setPointerCapture?.(e.pointerId);
    const i = nearX(get().ta.x, p);
    press = { id:e.pointerId, x:e.clientX, y:e.clientY, p, i, drag:false, moved:false };
    if(i >= 0) press.t = setTimeout(() => {
      if(!press || press.moved) return;
      press.drag = true;
      const el = $('nsFullPlane').querySelectorAll('.ns-x')[i]; if(el) el.classList.add('is-drag');
      try{ navigator.vibrate && navigator.vibrate(15); }catch(err){}
    }, 350);
  }
  function fullMove(e){
    if(!press || e.pointerId !== press.id) return;
    if(Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) press.moved = true;
    if(!press.drag) return;
    e.preventDefault();
    const p = fullUV(e), el = $('nsFullPlane').querySelectorAll('.ns-x')[press.i];
    if(p && el){ press.p = p; el.style.left = (clamp(p.u) * 100).toFixed(2) + '%'; el.style.top = (clamp(p.v) * 100).toFixed(2) + '%'; }
  }
  function fullUp(e){
    if(!press || e.pointerId !== press.id) return;
    const pr = press; press = null; clearTimeout(pr.t);
    if(e.type === 'pointercancel') return fullPaint();
    if(pr.drag){
      upd(o => { if(o.ta.x[pr.i]) o.ta.x[pr.i] = [+clamp(pr.p.u).toFixed(4), +clamp(pr.p.v).toFixed(4)]; });
      return fullPaint();
    }
    if(pr.moved) return;
    const p = pr.p;
    if(p.u < 0 || p.u > 1 || p.v < 0 || p.v > 1) return;
    upd(o => {
      const near = nearX(o.ta.x, p);
      if(near >= 0) o.ta.x.splice(near, 1);
      else { o.ta.x.push([+p.u.toFixed(4), +p.v.toFixed(4)]); o.ta.dm = 'OUI'; }
    });
    fullPaint();
  }

  /* ---------- feuille remplie en image (partage) ---------- */
  function sheetCanvas(){
    const o = get(), m = nsMode();
    const W = 1100, P = 50;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = 1700;
    const c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, cv.height);
    c.textBaseline = 'middle';
    c.fillStyle = '#0B1E4F'; c.font = '800 30px Manrope, sans-serif';
    c.fillText('Checklist & suivi des prestations nightstop', P, 60);
    c.font = '600 18px Manrope, sans-serif'; c.fillStyle = '#56687b';
    c.fillText('Aéroport Paris-Beauvais · ' + (m === 'arr' ? 'Retour basé (arrivée)' : 'Départ basé'), P, 95);
    const info = [['Immat', val('Immat')], ['Vol', flight()], ['Date', date()], ['Parking', val('Parking')], [m === 'arr' ? 'Prov.' : 'Dest.', m === 'arr' ? val('From') : val('To')]];
    info.forEach(([k, v], i) => {
      const x = P + i * 205;
      c.fillStyle = '#8A93A6'; c.font = '700 14px Manrope, sans-serif'; c.fillText(k.toUpperCase(), x, 140);
      c.fillStyle = '#0B1E4F'; c.font = '700 24px Manrope, sans-serif'; c.fillText(v || '—', x, 172);
    });
    let y = 220;
    const sec = t => { c.fillStyle = '#E9EDF3'; c.fillRect(P, y, W - 2 * P, 34); c.fillStyle = '#0B1E4F'; c.font = '800 16px Manrope, sans-serif'; c.fillText(t.toUpperCase(), P + 12, y + 17); y += 34; };
    const row = (k, v) => { c.strokeStyle = '#d5dde7'; c.lineWidth = 1; c.strokeRect(P, y, W - 2 * P, 32); c.fillStyle = '#0f1723'; c.font = '600 17px Manrope, sans-serif'; c.fillText(k, P + 12, y + 16); c.font = '700 17px Manrope, sans-serif'; c.fillText(v, W / 2, y + 16); y += 32; };
    sec('Services');
    SV.forEach(s => row(s.t, s.tg ? (o.sv[s.k] ? 'Oui' : 'Non') : s.one ? (s.opts.find(([k]) => k === o.sv[s.one]) || ['', '—'])[1] : s.opts.filter(([k]) => o.sv[k]).map(([, t]) => t).join(' + ') || '—'));
    if(m === 'arr' && o.hs.on){ y += 12; sec('Fouille des soutes · arrivée pays tiers'); row('Hold security check / search', o.hs.ok ? 'Effectué' : 'Non coché'); row('Nom · heure', (fullName(o.hs) || '—') + ' · ' + (o.hs.h || '--:--') + (o.hs.s ? '  · signé' : '')); }
    y += 12; sec('Tour avion');
    row('Soutes vidées et contrôlées', o.ta.sv || '—');
    row('Dommage(s) constaté(s)', (o.ta.dm || '—') + (o.ta.x.length ? ' · ' + o.ta.x.length + ' croix' : ''));
    row('Nom · heure', (fullName(o.ta) || '—') + ' · ' + (o.ta.h || '--:--') + (o.ta.s ? '  · signé' : ''));
    const load = src => new Promise(res => { if(!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    return Promise.all([load(IMG), load(m === 'arr' && o.hs.on ? o.hs.s : ''), load(o.ta.s)]).then(([pl, sh, st]) => {
      y += 20;
      if(pl){
        const pw = W - 2 * P, ph = pw * pl.height / pl.width;
        c.drawImage(pl, P, y, pw, ph);
        c.strokeStyle = '#D93636'; c.lineWidth = 5; c.lineCap = 'round';
        o.ta.x.forEach(([u, v]) => { const cx = P + u * pw, cy = y + v * ph, s = 13; c.beginPath(); c.moveTo(cx - s, cy - s); c.lineTo(cx + s, cy + s); c.moveTo(cx + s, cy - s); c.lineTo(cx - s, cy + s); c.stroke(); });
        y += ph + 20;
      }
      c.fillStyle = '#8A93A6'; c.font = '700 14px Manrope, sans-serif';
      const fouille = m === 'arr' && o.hs.on;
      c.fillText('SIGNATURE TOUR AVION', P, y + 10); if(fouille) c.fillText('SIGNATURE FOUILLE DES SOUTES', W / 2, y + 10);
      c.strokeStyle = '#d5dde7'; c.lineWidth = 1; c.strokeRect(P, y + 24, W / 2 - P - 20, 140); if(fouille) c.strokeRect(W / 2, y + 24, W / 2 - P, 140);
      const fit = (im, x, w) => { if(!im) return; const k = Math.min((w - 20) / im.width, 120 / im.height); c.drawImage(im, x + 10, y + 34, im.width * k, im.height * k); };
      fit(st, P, W / 2 - P - 20); if(fouille) fit(sh, W / 2, W / 2 - P);
      y += 190;
      const out = document.createElement('canvas'); out.width = W; out.height = y;
      out.getContext('2d').drawImage(cv, 0, 0);
      return out;
    });
  }
  window.nsSheetCanvas = sheetCanvas;
  window.uiNightstopShare = async function(){
    const cv = await sheetCanvas();
    const name = 'nightstop-' + (flight() || 'vol') + '-' + (date().replace(/\//g, '') || 'date') + '.png';
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    try{
      const file = new File([blob], name, { type:'image/png' });
      if(navigator.canShare && navigator.canShare({ files:[file] })){ await navigator.share({ files:[file], title:'Nightstop ' + flight() }); return; }
    }catch(e){ if(e && e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  // Texte pour le rapport du vol (seulement si la feuille a été commencée, ou si elle devient obligatoire)
  window.nsReport = function(){
    if(!nsMode()) return '';
    const o = get();
    if(!NS_REQUIRED && !started(o)) return '';
    const m = nsMode();
    let t = '[ NIGHTSTOP · ' + (m === 'arr' ? 'RETOUR BASE' : 'DEPART BASE') + ' ]\n\n';
    SV.forEach(s => {
      const v = s.one ? (s.opts.find(([k]) => k === o.sv[s.one]) || ['', ''])[1] : s.opts.filter(([k]) => o.sv[k]).map(([, x]) => x).join(' + ');
      if(v) t += s.t.toUpperCase() + ' : ' + v.toUpperCase() + '\n';
    });
    if(m === 'arr' && o.hs.on) t += 'FOUILLE SOUTES (PAYS TIERS) : ' + (o.hs.ok ? 'EFFECTUEE' : 'NON COCHEE') + ' · ' + (fullName(o.hs) || '-') + ' ' + (o.hs.h || '') + ' · SIGNATURE ' + (o.hs.s ? 'OUI' : 'NON') + '\n';
    t += '\nTOUR AVION\n';
    t += 'SOUTES VIDEES ET CONTROLEES : ' + (o.ta.sv || '-') + '\n';
    t += 'DOMMAGES CONSTATES : ' + (o.ta.dm || '-') + (o.ta.x.length ? ' (' + o.ta.x.length + ' croix sur la silhouette)' : '') + '\n';
    t += 'RESPONSABLE : ' + (fullName(o.ta) || '-') + ' ' + (o.ta.h || '') + ' · SIGNATURE ' + (o.ta.s ? 'OUI' : 'NON') + '\n';
    return t;
  };

  function init(){
    const f = $('nsFull');
    if(f){
      const fp = $('nsFullPlane');
      fp.addEventListener('pointerdown', fullDown); fp.addEventListener('pointermove', fullMove);
      fp.addEventListener('pointerup', fullUp); fp.addEventListener('pointercancel', fullUp);
      fp.addEventListener('contextmenu', e => e.preventDefault());
      window.addEventListener('resize', () => {
        if(f.style.display !== 'none') fullLayout();
        if($('nsModal').style.display !== 'none') document.querySelectorAll('#nsBody canvas[data-sig]').forEach(sigInit);
      });
      document.addEventListener('fullscreenchange', () => { if(f.style.display !== 'none') setTimeout(fullLayout, 200); });
    }
    syncRow(); setInterval(syncRow, 1000);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
