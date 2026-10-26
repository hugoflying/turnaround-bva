/* =====================================================
   v2.86 — Outils du menu : Dommages (photos) et Panneau (message plein écran)
   ===================================================== */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const hm = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  /* ---------- Dommages : photos stockées dans IndexedDB (restent sur le téléphone) ---------- */
  const DMG_TYPES = ['Rayure', 'Bosse', 'Birdstrike', 'Impact', 'Fuite', 'Autre'];
  let dmgType = 'Autre', dmgUrls = [], dmgCur = null, dmgList = [];

  function db(){
    return new Promise((res, rej) => {
      const r = indexedDB.open('ct-dommages', 1);
      r.onupgradeneeded = () => { const s = r.result.createObjectStore('photos', { keyPath:'id' }); s.createIndex('tab', 'tab'); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function tx(mode, fn){
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('photos', mode); const st = t.objectStore('photos');
      const out = fn(st);
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error);
    });
  }
  const dmgAll = () => tx('readonly', st => st.getAll());

  function flightInfo(){
    const v = id => ($(id)?.value || '').trim().toUpperCase();
    const cie = v('Cie'), n = v('NVol'), immat = v('Immat');
    const vol = (cie + n) || 'Vol';
    return { tab: (typeof currentTabId !== 'undefined' && currentTabId) || 'sans-vol', label: vol + (immat ? ' · ' + immat : ''), vol, immat };
  }

  // Réduit la photo (1600 px max) pour garder de la place sur le téléphone
  async function shrink(file){
    try{
      const bmp = await createImageBitmap(file, { imageOrientation:'from-image' });
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
      return b || file;
    }catch(e){ return file; }
  }

  async function dmgAdd(files){
    const f = flightInfo();
    let i = 0;
    for(const file of files){
      if(!file || !/^image\//.test(file.type || 'image/')) continue;
      const blob = await shrink(file);
      const t = Date.now() + (i++);
      await tx('readwrite', st => st.put({ id: t + '-' + Math.random().toString(36).slice(2, 7), tab: f.tab, label: f.label, vol: f.vol, immat: f.immat, type: dmgType, t, blob }));
    }
    await dmgRender();
    if(typeof showPopup === 'function') showPopup(files.length > 1 ? files.length + ' photos enregistrées' : 'Photo enregistrée', '#16a34a', 1400);
  }

  // Résumé pour le mail de fin de vol (champ caché #Dommages, sauvegardé avec le vol)
  function syncSummary(mine){
    const el = $('Dommages'); if(!el) return;
    const v = mine.slice().sort((a, b) => a.t - b.t).map(p => hm(p.t) + ' ' + p.type).join(', ');
    if(el.value !== v){ el.value = v; try{ saveCurrentTabData(); }catch(e){} }
  }

  async function dmgRender(){
    const f = flightInfo();
    $('dmgFlight').textContent = f.label;
    $('dmgTypes').innerHTML = DMG_TYPES.map(t => '<button type="button" class="' + (t === dmgType ? 'is-on' : '') + '" data-t="' + t + '">' + t + '</button>').join('');
    dmgUrls.forEach(u => URL.revokeObjectURL(u)); dmgUrls = [];
    let all = [];
    try{ all = await dmgAll(); }catch(e){ $('dmgGrid').innerHTML = '<p class="muted">Stockage des photos indisponible sur ce téléphone.</p>'; return; }
    all.sort((a, b) => b.t - a.t); dmgList = all;
    const thumb = p => { const u = URL.createObjectURL(p.blob); dmgUrls.push(u); return '<button type="button" class="dmg-th" data-id="' + p.id + '"><img src="' + u + '" alt=""><span>' + esc(p.type) + ' · ' + hm(p.t) + '</span></button>'; };
    const mine = all.filter(p => p.tab === f.tab);
    $('dmgCountK').textContent = mine.length ? 'Photos de ce vol (' + mine.length + ')' : 'Photos de ce vol';
    $('dmgGrid').innerHTML = mine.length ? mine.map(thumb).join('') : '<p class="dmg-empty">Aucune photo pour ce vol.</p>';
    $('dmgFoot').hidden = !mine.length;
    const groups = {};
    all.filter(p => p.tab !== f.tab).forEach(p => { (groups[p.tab] = groups[p.tab] || []).push(p); });
    $('dmgOthers').innerHTML = Object.values(groups).map(g => {
      const d = new Date(g[0].t);
      return '<div class="ie-k">' + esc(g[0].label) + ' · ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' (' + g.length + ')</div><div class="dmg-grid">' + g.map(thumb).join('') + '</div>';
    }).join('');
    if(f.tab !== 'sans-vol') syncSummary(mine);
  }

  async function share(list){
    const files = list.map(p => new File([p.blob], (p.vol + '-' + p.type + '-' + hm(p.t).replace(':', 'h') + '.jpg').replace(/\s+/g, ''), { type: p.blob.type || 'image/jpeg' }));
    const title = 'Dommages ' + (list[0]?.label || '');
    try{
      if(navigator.canShare && navigator.canShare({ files })){ await navigator.share({ files, title, text: title }); return; }
    }catch(e){ if(e && e.name === 'AbortError') return; }
    // Repli : téléchargement des fichiers
    files.forEach(f => { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); });
  }

  window.dmgOpen = function(){ $('dmgModal').style.display = 'flex'; dmgRender(); };
  window.dmgClose = function(){ $('dmgModal').style.display = 'none'; };
  window.dmgShareAll = function(){ const f = flightInfo(); share(dmgList.filter(p => p.tab === f.tab)); };
  window.dmgShareOne = function(){ if(dmgCur) share([dmgCur]); };
  window.dmgViewClose = function(){ $('dmgViewer').style.display = 'none'; dmgCur = null; };
  window.dmgDeleteOne = async function(){
    if(!dmgCur || !confirm('Supprimer cette photo ?')) return;
    const id = dmgCur.id; await tx('readwrite', st => st.delete(id));
    window.dmgViewClose(); dmgRender();
  };
  function view(id){
    const p = dmgList.find(x => x.id === id); if(!p) return;
    dmgCur = p;
    const u = URL.createObjectURL(p.blob); dmgUrls.push(u);
    $('dmgViewImg').src = u;
    const d = new Date(p.t);
    $('dmgViewCap').textContent = p.type + ' · ' + p.label + ' · ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + hm(p.t);
    $('dmgViewer').style.display = 'flex';
  }

  document.addEventListener('click', e => {
    const tb = e.target.closest('#dmgTypes button');
    if(tb){ dmgType = tb.dataset.t; document.querySelectorAll('#dmgTypes button').forEach(b => b.classList.toggle('is-on', b === tb)); return; }
    const th = e.target.closest('.dmg-th');
    if(th) view(th.dataset.id);
  });
  // v3.09 (Hugo) : les photos suivent le vol. Fermer le vol les efface ; au démarrage on retire
  // celles des vols déjà fermés.
  async function dmgPurge(keep){
    try{
      const all = await dmgAll(); const ok = new Set(keep.map(String));
      const gone = all.filter(p => !ok.has(String(p.tab))).map(p => p.id);
      if(gone.length) await tx('readwrite', st => { gone.forEach(id => st.delete(id)); });
    }catch(e){}
  }
  const openTabs = () => { try{ const t = JSON.parse(localStorage.getItem('flightTabs') || '[]'); return Array.isArray(t) ? t : []; }catch(e){ return []; } };
  if(typeof window.deleteTab === 'function'){
    const orig = window.deleteTab;
    window.deleteTab = function(){ const r = orig.apply(this, arguments); dmgPurge(openTabs()); return r; };
  }
  setTimeout(() => dmgPurge(openTabs()), 3000);
  document.addEventListener('change', e => {
    const inp = e.target.closest('input[data-dmg]'); if(!inp) return;
    const files = Array.from(inp.files || []); inp.value = '';
    if(files.length) dmgAdd(files);
  });

  /* ---------- Panneau : message plein écran, taille de texte maximale ---------- */
  const SIGN_THEMES = [
    { k:'wb', bg:'#ffffff', fg:'#000000', n:'Noir sur blanc' },
    { k:'bw', bg:'#000000', fg:'#ffffff', n:'Blanc sur noir' },
    { k:'yb', bg:'#FFD400', fg:'#000000', n:'Noir sur jaune' },
    { k:'nv', bg:'#0B1E4F', fg:'#ffffff', n:'Blanc sur bleu' },
    { k:'rd', bg:'#D93636', fg:'#ffffff', n:'Blanc sur rouge' },
  ];
  const ls = { get(k, d){ try{ const v = localStorage.getItem(k); return v == null ? d : v; }catch(e){ return d; } }, set(k, v){ try{ localStorage.setItem(k, v); }catch(e){} } };
  let wakeLock = null;

  function signRender(){
    const cur = ls.get('signTheme', 'wb');
    $('signThemes').innerHTML = SIGN_THEMES.map(t => '<button type="button" data-k="' + t.k + '" class="' + (t.k === cur ? 'is-on' : '') + '" style="--bg:' + t.bg + ';--fg:' + t.fg + '" aria-label="' + t.n + '">Aa</button>').join('');
    let rec = []; try{ rec = JSON.parse(ls.get('signRecent', '[]')) || []; }catch(e){}
    $('signRecentK').hidden = !rec.length;
    $('signRecent').innerHTML = rec.map((r, i) => '<div class="sign-rc"><button type="button" class="sign-rc-t" data-i="' + i + '">' + esc(r) + '</button><button type="button" class="sign-rc-x" data-i="' + i + '" aria-label="Supprimer ce message"><svg class="ico"><use href="#i-x"/></svg></button></div>').join('');
  }
  window.signOpen = function(){
    signRender();
    $('signModal').style.display = 'flex';
    const ta = document.querySelector('#signModal .sign-input');
    setTimeout(() => { ta.focus(); ta.select(); }, 60);
  };

  // Plus grande taille de police qui tient dans l'écran (recherche dichotomique)
  function fit(){
    const box = $('signFull'), el = $('signFullText');
    const W = box.clientWidth * 0.94, H = box.clientHeight * 0.9;
    let lo = 10, hi = 1200;
    while(hi - lo > 1){
      const m = (lo + hi) >> 1; el.style.fontSize = m + 'px';
      if(el.scrollWidth <= W && el.scrollHeight <= H) lo = m; else hi = m;
    }
    el.style.fontSize = lo + 'px';
  }
  window.signShow = async function(){
    const txt = (document.querySelector('#signModal .sign-input').value || '').trim();
    if(!txt){ if(typeof showPopup === 'function') showPopup('Écris un message', '#ef4444', 1400); return; }
    let rec = []; try{ rec = JSON.parse(ls.get('signRecent', '[]')) || []; }catch(e){}
    rec = [txt].concat(rec.filter(r => r !== txt)).slice(0, 6); ls.set('signRecent', JSON.stringify(rec));
    const th = SIGN_THEMES.find(t => t.k === ls.get('signTheme', 'wb')) || SIGN_THEMES[0];
    const box = $('signFull');
    box.style.background = th.bg; box.style.color = th.fg;
    $('signFullText').textContent = txt;
    $('signModal').style.display = 'none';
    box.style.display = 'flex';
    if(document.activeElement) document.activeElement.blur();
    try{ if(box.requestFullscreen) await box.requestFullscreen({ navigationUI:'hide' }); }catch(e){}
    try{ if(screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); }catch(e){}
    try{ if(navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); }catch(e){}
    requestAnimationFrame(fit); setTimeout(fit, 350);
  };
  window.signHide = function(){
    $('signFull').style.display = 'none';
    try{ if(screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); }catch(e){}
    try{ if(document.fullscreenElement) document.exitFullscreen(); }catch(e){}
    try{ if(wakeLock) wakeLock.release(); }catch(e){} wakeLock = null;
  };
  window.addEventListener('resize', () => { if($('signFull').style.display !== 'none') fit(); });
  document.addEventListener('fullscreenchange', () => { if(!document.fullscreenElement && $('signFull').style.display !== 'none') setTimeout(fit, 200); });
  document.addEventListener('click', e => {
    const th = e.target.closest('#signThemes button');
    if(th){ ls.set('signTheme', th.dataset.k); signRender(); return; }
    const rx = e.target.closest('#signRecent .sign-rc-x');
    if(rx){
      let rec = []; try{ rec = JSON.parse(ls.get('signRecent', '[]')) || []; }catch(_){}
      rec.splice(+rx.dataset.i, 1); ls.set('signRecent', JSON.stringify(rec)); signRender(); return;
    }
    const rc = e.target.closest('#signRecent .sign-rc-t');
    if(rc){ document.querySelector('#signModal .sign-input').value = rc.textContent; window.signShow(); }
  });
})();

/* v2.88 — Annuaire rendu depuis contacts.js (numéros fictifs dans la démo) */
(function(){
  function renderContacts(){
    const box = document.getElementById('annList'); if(!box) return;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
    box.innerHTML = (window.APP_CONTACTS || []).map(([n, d, t]) =>
      '<a class="ie-row ann-row" href="tel:' + esc(t) + '"><span>' + esc(n) + '</span><b class="num">' + esc(d) + '</b><i class="ann-call"><svg class="ico"><use href="#i-phone"/></svg></i></a>').join('');
    const sub = document.querySelector('#annuaireBtn small');
    if(sub) sub.textContent = 'Appel direct ' + (window.APP_CONTACTS || []).slice(0, 3).map(c => c[0]).join(', ') + '…';
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderContacts); else renderContacts();
})();

/* v3.02 (Hugo) — Retour visuel sur l'heure saisie par Now.
   v3.03 (Hugo) : plus de vibration. v3.06 : flash bleu marine (Now), gris + secousse (effacement). */
(function(){
  function flash(id){
    const w = document.querySelector('.time-wrap[data-id="' + id + '"]'); if(!w) return;
    w.classList.remove('tap-ok', 'tap-clr'); void w.offsetWidth; w.classList.add('tap-ok');
    setTimeout(() => w.classList.remove('tap-ok'), 700);
  }
  window.twFlashClear = function(id){
    const w = document.querySelector('.time-wrap[data-id="' + id + '"]'); if(!w) return;
    w.classList.remove('tap-ok', 'tap-clr'); void w.offsetWidth; w.classList.add('tap-clr');
    setTimeout(() => w.classList.remove('tap-clr'), 500);
  };
  if(typeof window.setNow === 'function'){
    const orig = window.setNow;
    window.setNow = function(id){ if((id === 'AIBT' && aibtLocked()) || (id === 'AOBT' && aobtLocked())) return; const r = orig.apply(this, arguments); flash(id); return r; };
  }
  if(typeof window.adjustTime === 'function'){
    const orig = window.adjustTime;
    window.adjustTime = function(id){ if((id === 'AIBT' && aibtLocked()) || (id === 'AOBT' && aobtLocked())) return; return orig.apply(this, arguments); };
  }

  /* v3.04 (Hugo) — Pas de SIBT renseigné = pas d'arrivée : AIBT désactivé dans Vol. */
  function aibtLocked(){ return !(document.getElementById('SIBT')?.value || '').trim(); }
  function syncAIBTLock(){
    const w = document.querySelector('.time-wrap[data-id="AIBT"]'); if(!w) return;
    const on = aibtLocked();
    w.classList.toggle('tw-locked', on);
    w.setAttribute('aria-disabled', on ? 'true' : 'false');
  }
  window.syncAIBTLock = syncAIBTLock;
  /* v3.05 (Hugo) — Pareil au départ : pas de SOBT = AOBT désactivé. */
  function syncAOBTLock(){
    const w = document.querySelector('.time-wrap[data-id="AOBT"]'); if(!w) return;
    const on = aobtLocked();
    w.classList.toggle('tw-locked', on);
    w.setAttribute('aria-disabled', on ? 'true' : 'false');
  }
  function aobtLocked(){ return !(document.getElementById('SOBT')?.value || '').trim(); }
  if(typeof window.updateAllCalculations === 'function'){
    const orig = window.updateAllCalculations;
    window.updateAllCalculations = function(){ const r = orig.apply(this, arguments); syncAIBTLock(); syncAOBTLock(); return r; };
  }
  document.addEventListener('input', e => { if(e.target && (e.target.id === 'SIBT' || e.target.id === 'SOBT')){ syncAIBTLock(); syncAOBTLock(); } });
  document.addEventListener('change', e => { if(e.target && (e.target.id === 'SIBT' || e.target.id === 'SOBT')){ syncAIBTLock(); syncAOBTLock(); } });
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { syncAIBTLock(); syncAOBTLock(); }); else { syncAIBTLock(); syncAOBTLock(); }
})();

/* v3.10 (Hugo) — « Équipage de » : l'équipage du départ arrive sur un autre vol ouvert.
   EOBT FR/RK ≥ arrivée de ce vol (AIBT, sinon SIBT) + 35 (app-onglets.js crewLink / updateEOBT). */
(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  function isFR(){ return /^(FR|RK)$/.test(($('Cie')?.value || '').trim().toUpperCase()); }
  function sync(){
    const row = $('ivCrewRow'); if(!row) return;
    const cl = typeof crewLink === 'function' ? crewLink() : null;
    row.hidden = true;   // v3.14 (Hugo) : ligne Équipage retirée
    row.classList.toggle('is-on', !!cl && !cl.closed);
    // v3.12.5 (Hugo) : sans lien = « Équipage · Même avion » ; avec lien = « Équipage de IAS »
    // v3.13.1 (Hugo) : « Équipage de TSF (FR1539)      AIBT 12:05 › »
    $('ivCrewVal').textContent = !cl ? '' : cl.closed ? 'Vol fermé' : cl.t ? 'AIBT ' + cl.t : 'Pas au bloc';
    $('ivCrewT').textContent = cl ? 'Équipage de' + (cl.from ? ' ' + cl.from : '') + (cl.label ? ' (' + cl.label + ')' : '') : 'Même équipage';
    row.title = !cl ? 'Appuie si l\'équipage arrive sur un autre vol'
      : cl.t ? 'AIBT ' + cl.t + ' · EOBT ' + addMin(cl.t, 35) : 'En attente de l\'AIBT' + (cl.sibt ? ' (SIBT ' + cl.sibt + ')' : '');
    $('ivCrewWhy').textContent = '';
  }
  function addMin(hm, n){ const [h, m] = hm.split(':').map(Number); const t = ((h * 60 + m + n) % 1440 + 1440) % 1440; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
  window.syncCrewRow = sync;
  // v3.12 (Hugo) : Keeper → toutes les arrivées FR/RK autour de maintenant, même si le vol n'est pas ouvert.
  // Sans Keeper (édition BVA) → les vols FR/RK ouverts, pas encore partis.
  const akOn = () => window.APP_EDITION !== 'bva' && typeof fetchAK === 'function';
  const isoAK = t => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
  let akArr = null;
  async function loadArr(){
    const n = Date.now();
    const list = await fetchAK('ARR', isoAK(n - 8 * 36e5), isoAK(n + 8 * 36e5));
    akArr = (list || []).filter(f => /^(FR|RK)\d/i.test((f.fullFlightNumber || f.callsign || '').trim()));
    return akArr;
  }
  const akSnap = f => JSON.stringify({ ff:(f.fullFlightNumber || f.callsign || '').toUpperCase(), from:f.adepIata || '', sibt:f.sibt || '', eibt:f.eibt || '', aibt:f.aibt || '' });
  const akTime = f => Date.parse(f.aibt || f.sibt || '') || 0;
  function rowHTML(id, title, sub, t, on){
    return '<button type="button" class="ie-row crew-row' + (on ? ' is-on' : '') + '" data-id="' + esc(id) + '"><span>' + esc(title) + '<small>' + esc(sub) + '</small></span><b class="num">' + esc(t || '--:--') + '</b><i>' + (on ? '✓' : '') + '</i></button>';
  }
  function head(cur){ return rowHTML('', 'Même avion', 'Pas de changement d\'équipage', '', !cur).replace('<b class="num">--:--</b>', '<b></b>'); }
  function renderAK(cur){
    const own = (() => { try{ return (JSON.parse(localStorage.getItem('tab-' + currentTabId) || '{}').akMeta?.arrFF || '').toUpperCase(); }catch(e){ return ''; } })();
    const now = Date.now();
    const list = akArr.filter(f => (f.fullFlightNumber || f.callsign || '').toUpperCase() !== own)
      .filter(f => { const t = akTime(f); return 'ak:' + f.id === cur || (t > now - 3 * 36e5 && t < now + 4 * 36e5); })
      .sort((a, b) => akTime(a) - akTime(b));
    const hm = v => (typeof crewIsoHM === 'function' ? crewIsoHM(v) : '');
    const rows = list.map(f => {
      // v3.12.2 (Hugo) : AIBT réel seulement ; sinon « pas encore au bloc » avec le SIBT pour info
      const t = hm(f.aibt);
      const sub = (f.adepIata ? f.adepIata.toUpperCase() + ' · ' : '') + (t ? 'AIBT ' + t : 'Pas encore au bloc · SIBT ' + (hm(f.sibt) || '--:--')) + (f.reg ? ' · ' + f.reg : '');
      return rowHTML('ak:' + f.id, (f.fullFlightNumber || f.callsign || 'Vol').toUpperCase(), sub, t, 'ak:' + f.id === cur);
    });
    $('crewList').innerHTML = head(cur) + (rows.length ? rows.join('') : '<p class="dmg-empty">Aucune arrivée Ryanair autour de maintenant.</p>');
  }
  window.crewPick = async function(){
    const cur = ($('CrewFrom')?.value || '').trim();
    const q = document.querySelector('#crewModal .crew-q'); if(q) q.value = '';
    $('crewModal').style.display = 'flex';
    if(akOn()){
      $('crewList').innerHTML = head(cur) + '<p class="dmg-empty">Chargement des arrivées…</p>';
      try{ await loadArr(); renderAK(cur); return; }
      catch(e){ $('crewList').innerHTML = head(cur) + '<p class="dmg-empty">Keeper indisponible, vols ouverts :</p>' + openRows(cur); return; }
    }
    $('crewList').innerHTML = head(cur) + (openRows(cur) || '<p class="dmg-empty">Aucun autre vol Ryanair ouvert. Ouvre d\'abord le vol de l\'équipage avec +.</p>');
  };
  function openRows(cur){
    let ids = []; try{ ids = JSON.parse(localStorage.getItem('flightTabs') || '[]').map(String); }catch(e){}
    if(window.uiSortedTabIds) ids = window.uiSortedTabIds(ids);
    // v3.11.1 (Hugo) : seulement les vols FR/RK ouverts, pas encore partis (sauf celui déjà choisi)
    return ids.filter(id => id !== String(currentTabId)).map(id => {
      let d = {}; try{ d = JSON.parse(localStorage.getItem('tab-' + id) || '{}'); }catch(e){}
      const cie = (d.Cie || d.akMeta?.arrFF || d.akMeta?.depFF || '').toUpperCase().slice(0, 2);
      if(id !== cur && (!/^(FR|RK)$/.test(cie) || (d.AOBT || '').trim())) return '';
      const arr = (d.akMeta?.arrFF || ((d.Cie || '') + (d.NVol || '')) || 'Vol').toUpperCase();
      const t = (d.AIBT || '').trim();
      return rowHTML(id, arr, (d.From ? d.From.toUpperCase() + ' · ' : '') + (t ? 'AIBT ' + t : 'Pas encore au bloc · SIBT ' + ((d.SIBT || '').trim() || '--:--')), t, id === cur);
    }).join('');
  }
  // Mise à jour de l'heure de l'équipage (Keeper) : à l'ouverture du vol puis toutes les 2 min
  async function refreshAK(){
    const id = ($('CrewFrom')?.value || '').trim(); if(!id.startsWith('ak:') || !akOn()) return;
    try{
      const f = (await loadArr()).find(x => 'ak:' + x.id === id); if(!f) return;
      const snap = akSnap(f);
      if($('CrewInfo').value !== snap){ $('CrewInfo').value = snap; try{ saveCurrentTabData(); updateAllCalculations(); }catch(e){} }
    }catch(e){}
  }
  // v3.12.3 (Hugo) : interrogation chaque minute seulement quand ça peut compter :
  // à partir de EOBT − 35 (un AIBT plus tôt ne repousse pas l'EOBT), jusqu'à l'AIBT ou l'AOBT.
  function crewPollDue(){
    const id = ($('CrewFrom')?.value || '').trim(); if(!id.startsWith('ak:')) return false;
    if(($('AOBT')?.value || '').trim()) return false;
    let k = {}; try{ k = JSON.parse($('CrewInfo')?.value || '{}'); }catch(e){}
    if(k.aibt) return false;
    const eobt = window._eobtRawMins; if(eobt == null || typeof clockMin !== 'function') return true;
    let d = clockMin() - (eobt - 35); if(d < -720) d += 1440; if(d > 720) d -= 1440;
    return d >= 0;
  }
  setInterval(() => { if(crewPollDue()) refreshAK(); }, 60000);
  window.crewRefresh = refreshAK;
  if(typeof window.switchTab === 'function'){
    const orig = window.switchTab;
    window.switchTab = function(){ const r = orig.apply(this, arguments); setTimeout(refreshAK, 300); return r; };
  }
  // v3.12.1 (Hugo) : recherche en haut de la liste (n° de vol, provenance, immat)
  window.crewFilter = function(q){
    q = (q || '').trim().toUpperCase().replace(/\s+/g, '');
    document.querySelectorAll('#crewList .crew-row').forEach(b => {
      if(!b.dataset.id){ b.hidden = !!q; return; }
      b.hidden = !!q && !b.textContent.toUpperCase().replace(/\s+/g, '').includes(q);
    });
  };
  window.crewClose = function(){ $('crewModal').style.display = 'none'; };
  document.addEventListener('click', e => {
    const b = e.target.closest('#crewList .crew-row'); if(!b) return;
    const id = b.dataset.id || '';
    $('CrewFrom').value = id;
    const f = id.startsWith('ak:') && akArr ? akArr.find(x => 'ak:' + x.id === id) : null;
    $('CrewInfo').value = f ? akSnap(f) : '';
    window.crewClose();
    try{ saveCurrentTabData(); }catch(err){}
    try{ updateAllCalculations(); }catch(err){}
    sync();
    try{ renderTimeline(); }catch(err){}
  });
  if(typeof window.updateAllCalculations === 'function'){
    const orig = window.updateAllCalculations;
    window.updateAllCalculations = function(){ const r = orig.apply(this, arguments); sync(); return r; };
  }
  document.addEventListener('input', e => { if(e.target && e.target.id === 'Cie') sync(); });
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync); else sync();
})();

/* =====================================================
   v3.21 (Hugo, option C) — Guide LID en écran : on touche un cas, les 6 cases du LID s'affichent.
   Contenu = « LID Completion Guide (above wing) » Ryanair, Issue 1 Revision 3. Tableau complet replié dessous.
   ===================================================== */
(function(){
  'use strict';
  const COLS = [['SNY', 'SNY BOX'], ['ZONE', 'ZONE'], ['TOB', 'TOB'], ['THOB', 'THOB'], ['SI', 'SI BOX'], ['CREW', 'CREW CONFIG']];
  const ROWS = [
    ['p', 'Adult', '', 'N/A YES YES YES NO N/A'],
    ['p', 'Child', '', 'N/A YES YES YES NO N/A'],
    ['p', 'Infant', '', 'N/A NO NO YES NO N/A'],
    ['s', 'Item Seat', 'ex. violoncelle', 'N/A YES YES NO YES N/A'],
    ['s', 'Comfort Seat', 'ex. passager corpulent', 'N/A NO YES NO YES N/A'],
    ['s', 'Leg Seat', 'ex. jambe cassée', 'N/A NO YES NO YES N/A'],
    ['s', 'Infant Seat', 'bébé qui occupe un siège', 'N/A NO YES NO YES N/A'],
    ['y', 'SNY on Jumpseat', '', 'NO NO NO YES YES YES', 1],
    ['y', 'SNY on passenger seat', '', 'YES YES NO YES YES NO', 2],
    ['y', 'Duty / Staff Travel on Jumpseat', '', 'NO NO YES YES YES YES', 3],
    ['y', 'Duty / Staff Travel on passenger seat', '', 'NO YES YES YES NO NO', 4],
  ];
  const NOTES = {
    1: 'SNY sur jumpseat : compté en Crew et THOB sur le LID, avec une explication en SI.',
    2: 'SNY sur un siège passager : compté seulement dans le THOB.',
    3: 'Duty / Staff Travel sur jumpseat : compté en Crew, TOB et THOB, avec une explication en SI (ex. 2+5, Staff Travel, aft J/seat, inclus dans TOB et Crew Config).',
    4: 'Duty / Staff Travel sur un siège passager : compté en TOB et THOB.',
  };
  const GRP = { p: 'Passagers', s: 'Sièges spéciaux', y: 'SNY et Staff' };
  const word = x => x === 'YES' ? 'Oui' : x === 'NO' ? 'Non' : 'N/A';
  const cls = x => x === 'YES' ? 'y' : x === 'NO' ? 'n' : 'na';
  let sel = 0, full = false;
  try{ sel = Math.max(0, Math.min(ROWS.length - 1, parseInt(localStorage.getItem('lidGuideSel') || '0', 10) || 0)); }catch(e){}

  function render(){
    const el = document.getElementById('lidGuide'); if(!el) return;
    let g = '', pick = '';
    ROWS.forEach((r, i) => {
      if(r[0] !== g){ g = r[0]; pick += (pick ? '</div>' : '') + '<div class="lg-g"><span class="lg-gt">' + GRP[g] + '</span>'; }
      pick += '<button type="button" class="lg-c' + (i === sel ? ' is-on' : '') + '" data-i="' + i + '">' + r[1] + '</button>';
    });
    pick += '</div>';
    const r = ROWS[sel], v = r[3].split(' ');
    const tiles = v.map((x, i) => '<div class="lg-t ' + cls(x) + '"><span>' + COLS[i][1] + '</span><b>' + word(x) + '</b></div>').join('');
    let tbl = '';
    if(full){
      tbl = '<div class="lg-scroll"><table class="lg-tbl"><thead><tr><th>Cas</th>' + COLS.map(c => '<th>' + c[0] + '</th>').join('') + '</tr></thead><tbody>';
      let gg = '';
      ROWS.forEach((x, i) => {
        if(x[0] !== gg){ gg = x[0]; tbl += '<tr class="lg-grp"><td colspan="7">' + GRP[gg] + '</td></tr>'; }
        tbl += '<tr class="' + (i === sel ? 'is-on' : '') + '" data-i="' + i + '"><td>' + x[1] + (x[4] ? '<sup>*' + x[4] + '</sup>' : '') + '</td>' + x[3].split(' ').map(y => '<td><span class="lg-' + cls(y) + '">' + word(y) + '</span></td>').join('') + '</tr>';
      });
      tbl += '</tbody></table></div><div class="lg-notes">' + Object.keys(NOTES).map(k => '<p><b>*' + k + '</b> ' + NOTES[k] + '</p>').join('') + '</div>';
    }
    el.innerHTML = '<div class="ld-box-h">Guide LID<span>Above wing</span></div>'
      + '<div class="lg-pick">' + pick + '</div>'
      + '<div class="lg-res"><div class="lg-h"><b>' + r[1] + '</b>' + (r[2] ? '<i>' + r[2] + '</i>' : '') + '</div><div class="lg-tiles">' + tiles + '</div>'
      + (r[4] ? '<div class="lg-note">' + NOTES[r[4]] + '</div>' : '') + '</div>'
      + '<button type="button" class="lg-more">' + (full ? 'Masquer le tableau' : 'Voir tout le tableau') + '</button>' + tbl;
  }
  document.addEventListener('click', e => {
    const box = e.target.closest && e.target.closest('#lidGuide'); if(!box) return;
    const b = e.target.closest('[data-i]');
    if(b){ sel = +b.dataset.i; try{ localStorage.setItem('lidGuideSel', String(sel)); }catch(_){} render(); return; }
    if(e.target.closest('.lg-more')){ full = !full; render(); }
  });
  window.renderLidGuide = render;
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();
