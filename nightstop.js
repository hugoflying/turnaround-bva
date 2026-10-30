/* =====================================================================
   v3.51 · Nightstop & tour avion (feuille papier BVA « Checklist & suivi des
   prestations nightstop » + « Tour avion »), version numérique.
   Vols basés : départ basé (From = BVA) ou retour basé (To = BVA).
   Facultative pour l'instant, comme l'auto-contrôle (NS_REQUIRED = false) :
   deviendra obligatoire avec le serveur des rapports.
   Données du vol dans le champ caché Nightstop :
   { sv:{ toilV, toilR, eauV, eauR, men:'S'|'DC'|'DI'|'', ech, asu, tr:'BELLOVA'|'ASSISTAIR'|'', deg, dec },
     cn, cs, ct,                                   équipage : nom / crew code, signature, heure ISO
     hs:{ on, ok, n, h, s },                       fouille soutes (retour basé, arrivée pays tiers)
     ta:{ sv:'OUI'|'NON'|'', dm:'OUI'|'NON'|'', x:[[u,v]…], av:{ cdb, mec, ops }, n, h, s } }   tour avion
   Les croix sont en coordonnées relatives (0 à 1) sur la silhouette img/silhouette-b737.png.
   ===================================================================== */
const NS_REQUIRED = false;
(function(){
  const $ = id => document.getElementById(id);
  const val = id => ($(id)?.value || '').trim().toUpperCase();
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const IMG = './img/silhouette-b737.png';

  // Services de la feuille papier (GPU, connexion / déconnexion retirés ; ménage Tidy / Full remplacé par S, DC, DI)
  const SV = [
    { k:'toil', t:'Toilettes', opts:[['toilV','Vidange'], ['toilR','Remplissage']] },
    { k:'eau',  t:'Eau potable', opts:[['eauV','Vidange'], ['eauR','Remplissage']] },
    { k:'men',  t:'Ménage', one:'men', opts:[['S','S'], ['DC','DC'], ['DI','DI']] },
    { k:'ech',  t:'2 échelles', opts:[['ech','Fait']] },
    { k:'asu',  t:'ASU', opts:[['asu','Fait']] },
    { k:'tr',   t:'Tractage', one:'tr', opts:[['BELLOVA','Bellova'], ['ASSISTAIR','Assist\'Air']] },
    { k:'deg',  t:'Dégivrage', opts:[['deg','Fait']] },
    { k:'dec',  t:'Collecte déchets', opts:[['dec','Fait']] },
  ];

  window.nsMode = function(){
    if(val('From') === 'BVA') return 'dep';
    if(val('To') === 'BVA') return 'arr';
    return '';
  };
  window.nsNeeded = () => !!nsMode();

  function get(){
    let o = {};
    try{ o = JSON.parse($('Nightstop')?.value || '{}') || {}; }catch(e){}
    o.sv = o.sv || {}; o.hs = o.hs || {}; o.ta = o.ta || {}; o.ta.x = o.ta.x || []; o.ta.av = o.ta.av || {};
    return o;
  }
  function set(o){
    const el = $('Nightstop'); if(!el) return;
    el.value = JSON.stringify(o);
    el.dispatchEvent(new Event('input', { bubbles:true })); el.dispatchEvent(new Event('change', { bubbles:true }));
  }
  const svDone = o => SV.filter(s => s.one ? !!o.sv[s.one] : s.opts.some(([k]) => o.sv[k])).length;
  function started(o){
    return svDone(o) > 0 || o.cn || o.cs || o.hs.on || o.ta.sv || o.ta.dm || o.ta.x.length || o.ta.n || o.ta.s;
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
    const o = get(), sig = !!(o.cs && o.ta.s);
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
  const sigBlock = (key, name, nameLbl, ph, hour) =>
      '<div class="field"><label class="label">' + nameLbl + '</label><input class="input" type="text" autocomplete="off" data-name="' + key + '" value="' + esc(name) + '"></div>'
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

    h += '<div class="ac-sec">Services</div><div class="ac-card ns-sv">';
    SV.forEach(s => {
      h += '<div class="ns-row"><span>' + s.t + '</span><span class="ns-cs">'
        + s.opts.map(([k, t]) => chip(s.one ? o.sv[s.one] === k : !!o.sv[k], s.one ? 'data-one="' + s.one + '" data-v="' + k + '"' : 'data-sv="' + k + '"', t)).join('')
        + '</span></div>';
    });
    h += '</div>';
    h += '<div class="ac-sec">Équipage</div><div class="ac-card ac-sign">' + sigBlock('c', o.cn || '', 'Nom ou crew code (commandant ou mécanicien)', 'Signature équipage', null) + '</div>';

    if(m === 'arr'){
      h += '<div class="ac-sec">Fouille des soutes</div><div class="ac-card">'
        + '<div class="ns-row"><span>Arrivée d\'un pays tiers</span><span class="ns-cs">' + chip(o.hs.on === true, 'data-hs="on"', 'Oui') + chip(o.hs.on === false, 'data-hs="off"', 'Non') + '</span></div>';
      if(o.hs.on){
        h += '<label class="ac-it' + (o.hs.ok ? ' on' : '') + '"><input type="checkbox" data-hsok' + (o.hs.ok ? ' checked' : '') + '><span class="ac-box"><svg class="ico"><use href="#i-check"/></svg></span><span>Hold security check / search effectué</span></label>'
          + '<div class="ac-sign">' + sigBlock('h', o.hs.n || '', 'Nom', 'Signature', o.hs.h || '') + '</div>';
      }
      h += '</div>';
    }

    const x = o.ta.x;
    h += '<div class="ac-sec">Tour avion</div><div class="ac-card">'
      + '<div class="ns-row"><span>Soutes vidées et contrôlées</span><span class="ns-cs">' + chip(o.ta.sv === 'OUI', 'data-ta="sv" data-v="OUI"', 'Oui') + chip(o.ta.sv === 'NON', 'data-ta="sv" data-v="NON"', 'Non') + '</span></div>'
      + '<div class="ns-row"><span>Dommage(s) constaté(s)</span><span class="ns-cs">' + chip(o.ta.dm === 'OUI', 'data-ta="dm" data-v="OUI"', 'Oui') + chip(o.ta.dm === 'NON', 'data-ta="dm" data-v="NON"', 'Non') + '</span></div>'
      + '<div class="ns-pl-wrap"><button type="button" class="ns-pl" id="nsPlane" aria-label="Annoter la silhouette en plein écran">' + planeHTML(x) + '</button>'
      + '<div class="ns-pl-foot"><span>' + (x.length ? x.length + (x.length > 1 ? ' croix' : ' croix') + ' sur la silhouette' : 'Repérer le(s) dommage(s) par une croix') + '</span><button type="button" class="ns-c on" id="nsFullBtn">Plein écran</button></div></div>'
      + '<div class="ns-row"><span>Personne(s) avisée(s)</span><span class="ns-cs">' + chip(o.ta.av.cdb, 'data-av="cdb"', 'CdB') + chip(o.ta.av.mec, 'data-av="mec"', 'Mécanicien') + chip(o.ta.av.ops, 'data-av="ops"', 'Opérations') + '</span></div>'
      + '<div class="ac-sign">' + sigBlock('t', o.ta.n || '', 'Nom', 'Signature', o.ta.h || '') + '</div>'
      + '</div>';
    body.innerHTML = h;
    bind();
    paintPh();
  }
  function planeHTML(x){
    return '<img src="' + IMG + '" alt="Silhouette avion, vues gauche, droite et face" draggable="false">'
      + x.map(([u, v]) => '<i class="ns-x" style="left:' + (u * 100).toFixed(2) + '%;top:' + (v * 100).toFixed(2) + '%"></i>').join('');
  }
  function paintPh(){
    const o = get(), s = { c:o.cs, h:o.hs.s, t:o.ta.s };
    document.querySelectorAll('#nsBody [data-ph]').forEach(p => p.hidden = !!s[p.dataset.ph]);
  }
  const upd = fn => { const o = get(); fn(o); set(o); };
  function bind(){
    const body = $('nsBody');
    body.querySelectorAll('[data-sv]').forEach(b => b.onclick = () => { upd(o => o.sv[b.dataset.sv] = !o.sv[b.dataset.sv]); b.classList.toggle('on'); });
    body.querySelectorAll('[data-one]').forEach(b => b.onclick = () => {
      const k = b.dataset.one, v = b.dataset.v;
      upd(o => o.sv[k] = o.sv[k] === v ? '' : v);
      body.querySelectorAll('[data-one="' + k + '"]').forEach(x => x.classList.toggle('on', x === b && get().sv[k] === v));
    });
    body.querySelectorAll('[data-hs]').forEach(b => b.onclick = () => { upd(o => o.hs.on = b.dataset.hs === 'on'); render(); requestAnimationFrame(() => document.querySelectorAll('#nsBody canvas[data-sig]').forEach(sigInit)); });
    const ok = body.querySelector('[data-hsok]');
    if(ok) ok.onchange = () => { upd(o => o.hs.ok = ok.checked); ok.closest('.ac-it').classList.toggle('on', ok.checked); };
    body.querySelectorAll('[data-ta]').forEach(b => b.onclick = () => {
      const k = b.dataset.ta, v = b.dataset.v;
      upd(o => o.ta[k] = o.ta[k] === v ? '' : v);
      body.querySelectorAll('[data-ta="' + k + '"]').forEach(x => x.classList.toggle('on', get().ta[k] === x.dataset.v));
    });
    body.querySelectorAll('[data-av]').forEach(b => b.onclick = () => { upd(o => o.ta.av[b.dataset.av] = !o.ta.av[b.dataset.av]); b.classList.toggle('on'); });
    body.querySelectorAll('[data-name]').forEach(i => i.oninput = () => upd(o => {
      const k = i.dataset.name, v = i.value.trim();
      if(k === 'c') o.cn = v; else if(k === 'h') o.hs.n = v; else o.ta.n = v;
      if(k !== 'c') try{ if(v) localStorage.setItem('nsNom', v); }catch(e){}
    }));
    // nom du responsable piste repris du dernier vol
    body.querySelectorAll('[data-name="t"],[data-name="h"]').forEach(i => { if(!i.value){ try{ i.value = localStorage.getItem('nsNom') || ''; }catch(e){} if(i.value) i.oninput(); } });
    body.querySelectorAll('[data-hour]').forEach(i => i.onchange = () => upd(o => { if(i.dataset.hour === 'h') o.hs.h = i.value; else o.ta.h = i.value; }));
    body.querySelectorAll('[data-now]').forEach(b => b.onclick = () => {
      const i = body.querySelector('[data-hour="' + b.dataset.now + '"]'); i.value = nowHM(); i.onchange();
    });
    body.querySelectorAll('[data-sigclr]').forEach(b => b.onclick = () => {
      const k = b.dataset.sigclr;
      upd(o => { if(k === 'c'){ o.cs = ''; o.ct = ''; } else if(k === 'h') o.hs.s = ''; else o.ta.s = ''; });
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
    const o = get(), src = k === 'c' ? o.cs : k === 'h' ? o.hs.s : o.ta.s;
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
    let drawing = false, last = null;
    const pt = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', e => {
      e.preventDefault(); cv.setPointerCapture?.(e.pointerId);
      drawing = true; last = pt(e);
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
      const png = t.toDataURL('image/png'), iso = new Date().toISOString();
      upd(o => {
        if(k === 'c'){ o.cs = png; o.ct = iso; }
        else if(k === 'h'){ o.hs.s = png; if(!o.hs.h) o.hs.h = nowHM(); }
        else { o.ta.s = png; if(!o.ta.h) o.ta.h = nowHM(); }
      });
      const hi = document.querySelector('#nsBody [data-hour="' + k + '"]'); if(hi && !hi.value) hi.value = nowHM();
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
  async function fullOpen(){
    const f = $('nsFull');
    f.style.display = 'block';
    fullLayout();
    try{ if(f.requestFullscreen) await f.requestFullscreen({ navigationUI:'hide' }); }catch(e){}
    try{ if(screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); }catch(e){}
    setTimeout(fullLayout, 300);
  }
  window.nsFullClose = function(){
    $('nsFull').style.display = 'none';
    try{ if(screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); }catch(e){}
    try{ if(document.fullscreenElement) document.exitFullscreen(); }catch(e){}
    const p = $('nsPlane'); if(p){ render(); requestAnimationFrame(() => document.querySelectorAll('#nsBody canvas[data-sig]').forEach(sigInit)); }
  };
  window.nsFullUndo = function(){ upd(o => o.ta.x.pop()); fullPaint(); };
  window.nsFullClear = function(){ upd(o => o.ta.x = []); fullPaint(); };
  function fullTap(e){
    const img = $('nsFullPlane').querySelector('img'); if(!img) return;
    const r = img.getBoundingClientRect();
    // téléphone tenu en portrait : la scène est tournée de 90° (coordonnées à convertir)
    let u, v;
    if($('nsFull').classList.contains('rot')){ u = (e.clientY - r.top) / r.height; v = (r.right - e.clientX) / r.width; }
    else { u = (e.clientX - r.left) / r.width; v = (e.clientY - r.top) / r.height; }
    if(u < 0 || u > 1 || v < 0 || v > 1) return;
    const ar = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 2.33;
    upd(o => {
      const near = o.ta.x.findIndex(([a, b]) => Math.hypot((a - u) * ar, b - v) < 0.045);
      if(near >= 0) o.ta.x.splice(near, 1);
      else { o.ta.x.push([+u.toFixed(4), +v.toFixed(4)]); if(!o.ta.dm) o.ta.dm = 'OUI'; }
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
    SV.forEach(s => row(s.t, s.one ? (s.opts.find(([k]) => k === o.sv[s.one]) || ['', '—'])[1] : s.opts.filter(([k]) => o.sv[k]).map(([, t]) => t).join(' + ') || '—'));
    row('Équipage (nom ou crew code)', (o.cn || '—') + (o.cs ? '  · signé' : ''));
    if(m === 'arr' && o.hs.on){ y += 12; sec('Fouille des soutes · arrivée pays tiers'); row('Hold security check / search', o.hs.ok ? 'Effectué' : 'Non coché'); row('Nom · heure', (o.hs.n || '—') + ' · ' + (o.hs.h || '--:--') + (o.hs.s ? '  · signé' : '')); }
    y += 12; sec('Tour avion');
    row('Soutes vidées et contrôlées', o.ta.sv || '—');
    row('Dommage(s) constaté(s)', (o.ta.dm || '—') + (o.ta.x.length ? ' · ' + o.ta.x.length + ' croix' : ''));
    row('Personne(s) avisée(s)', [o.ta.av.cdb && 'Commandant de bord', o.ta.av.mec && 'Mécanicien', o.ta.av.ops && 'Opérations'].filter(Boolean).join(', ') || '—');
    row('Nom · heure', (o.ta.n || '—') + ' · ' + (o.ta.h || '--:--') + (o.ta.s ? '  · signé' : ''));
    const load = src => new Promise(res => { if(!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    return Promise.all([load(IMG), load(o.cs), load(o.ta.s)]).then(([pl, sc, st]) => {
      y += 20;
      if(pl){
        const pw = W - 2 * P, ph = pw * pl.height / pl.width;
        c.drawImage(pl, P, y, pw, ph);
        c.strokeStyle = '#D93636'; c.lineWidth = 5; c.lineCap = 'round';
        o.ta.x.forEach(([u, v]) => { const cx = P + u * pw, cy = y + v * ph, s = 13; c.beginPath(); c.moveTo(cx - s, cy - s); c.lineTo(cx + s, cy + s); c.moveTo(cx + s, cy - s); c.lineTo(cx - s, cy + s); c.stroke(); });
        y += ph + 20;
      }
      c.fillStyle = '#8A93A6'; c.font = '700 14px Manrope, sans-serif';
      c.fillText('SIGNATURE ÉQUIPAGE', P, y + 10); c.fillText('SIGNATURE TOUR AVION', W / 2, y + 10);
      c.strokeStyle = '#d5dde7'; c.lineWidth = 1; c.strokeRect(P, y + 24, W / 2 - P - 20, 140); c.strokeRect(W / 2, y + 24, W / 2 - P, 140);
      const fit = (im, x, w) => { if(!im) return; const k = Math.min((w - 20) / im.width, 120 / im.height); c.drawImage(im, x + 10, y + 34, im.width * k, im.height * k); };
      fit(sc, P, W / 2 - P - 20); fit(st, W / 2, W / 2 - P);
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
    t += 'EQUIPAGE : ' + (o.cn || '-') + ' · SIGNATURE ' + (o.cs ? 'OUI' : 'NON') + '\n';
    if(m === 'arr' && o.hs.on) t += 'FOUILLE SOUTES (PAYS TIERS) : ' + (o.hs.ok ? 'EFFECTUEE' : 'NON COCHEE') + ' · ' + (o.hs.n || '-') + ' ' + (o.hs.h || '') + ' · SIGNATURE ' + (o.hs.s ? 'OUI' : 'NON') + '\n';
    t += '\nTOUR AVION\n';
    t += 'SOUTES VIDEES ET CONTROLEES : ' + (o.ta.sv || '-') + '\n';
    t += 'DOMMAGES CONSTATES : ' + (o.ta.dm || '-') + (o.ta.x.length ? ' (' + o.ta.x.length + ' croix sur la silhouette)' : '') + '\n';
    const av = [o.ta.av.cdb && 'CDB', o.ta.av.mec && 'MECANICIEN', o.ta.av.ops && 'OPERATIONS'].filter(Boolean).join(', ');
    if(av) t += 'AVISE(S) : ' + av + '\n';
    t += 'RESPONSABLE : ' + (o.ta.n || '-') + ' ' + (o.ta.h || '') + ' · SIGNATURE ' + (o.ta.s ? 'OUI' : 'NON') + '\n';
    return t;
  };

  function init(){
    const f = $('nsFull');
    if(f){
      $('nsFullPlane').addEventListener('click', fullTap);
      window.addEventListener('resize', () => { if(f.style.display !== 'none') fullLayout(); });
      document.addEventListener('fullscreenchange', () => { if(f.style.display !== 'none') setTimeout(fullLayout, 200); });
    }
    syncRow(); setInterval(syncRow, 1000);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
