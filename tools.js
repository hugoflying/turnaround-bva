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
  document.addEventListener('change', e => {
    const inp = e.target.closest('input[data-dmg]'); if(!inp) return;
    const files = Array.from(inp.files || []); inp.value = '';
    if(files.length) dmgAdd(files);
  });

  /* ---------- Panneau : message plein écran, taille de texte maximale ---------- */
  const SIGN_THEMES = [
    { k:'bw', bg:'#000000', fg:'#ffffff', n:'Blanc sur noir' },
    { k:'yb', bg:'#FFD400', fg:'#000000', n:'Noir sur jaune' },
    { k:'nv', bg:'#0B1E4F', fg:'#ffffff', n:'Blanc sur bleu' },
    { k:'wb', bg:'#ffffff', fg:'#000000', n:'Noir sur blanc' },
    { k:'rd', bg:'#D93636', fg:'#ffffff', n:'Blanc sur rouge' },
  ];
  const ls = { get(k, d){ try{ const v = localStorage.getItem(k); return v == null ? d : v; }catch(e){ return d; } }, set(k, v){ try{ localStorage.setItem(k, v); }catch(e){} } };
  let wakeLock = null;

  function signRender(){
    const cur = ls.get('signTheme', 'bw');
    $('signThemes').innerHTML = SIGN_THEMES.map(t => '<button type="button" data-k="' + t.k + '" class="' + (t.k === cur ? 'is-on' : '') + '" style="--bg:' + t.bg + ';--fg:' + t.fg + '" aria-label="' + t.n + '">Aa</button>').join('');
    let rec = []; try{ rec = JSON.parse(ls.get('signRecent', '[]')) || []; }catch(e){}
    $('signRecentK').hidden = !rec.length;
    $('signRecent').innerHTML = rec.map(r => '<button type="button">' + esc(r) + '</button>').join('');
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
    const th = SIGN_THEMES.find(t => t.k === ls.get('signTheme', 'bw')) || SIGN_THEMES[0];
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
    const rc = e.target.closest('#signRecent button');
    if(rc){ document.querySelector('#signModal .sign-input').value = rc.textContent; window.signShow(); }
  });
})();
