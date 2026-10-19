/* Codes retard (DL) (découpé de app.js, chargé dans l'ordre de index.html) */
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
