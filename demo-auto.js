/* v3.41.2 : ce que la démo remplit d'office sur un vol (« Rempli comme un vrai vol »).
   Partagé par ui.js (remplissage) et admin.html (aperçu des valeurs dans « Vols de démo »).
   Heures en minutes depuis le lancement de la démo ; une valeur n'est posée que si son heure « when » est passée. */
(function(){
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

window.demoAutoPlan = function(i, cie, sc){
  const { A, off } = sc, isFR = cie === 'FR' || cie === 'RK', k = i % 8, S = String;
  const tm = [
    ['PremierDebarque', A+2], ['DernierDebarque', A + (isFR ? 9 : 11)], ['ArriveeFuel', A+3], ['DepartFuel', A + (isFR ? 14 : 20)],
    ['MiseEnPlaceTapis', A+1], ['DebutDechargementBagages', A+2], ['FinDechargementBagages', A+10],
    ['DebutChargementBagages', off-16], ['FinChargementBagages', off-5],
    ['AvionPremierEmbarque', off - (isFR ? 13 : 14)], ['AvionDernierEmbarque', off-4], ['RemiseLID', off - (isFR ? 5 : 7)],
    ['FermetureSouteAV', off-4], ['FermetureSouteAR', off-3], ['FermeturePorteAvion', off-3], ['RetraitEchelleAV', off-2], ['RetraitEchelleAR', off-2],
    ['ConnexionAgentCasque', off-6],
  ];
  if(i % 3 === 1) tm.push(['ArriveeLiftArr', A+1], ['DepartLiftArr', A+11], ['ArriveeLift', off-22], ['DepartLift', off-9]);
  if(i % 4 === 2) tm.push(['DebutCleaningCabine', A+10], ['FinCleaningCabine', A+17]);
  // LOAD : arrivée dès le block, prévi pour tous, final et fuel une fois l'embarquement terminé
  const pax = 148 + (i * 13) % 41, inf = i % 3, bags = 38 + (i * 7) % 30, kg = isFR ? 13 : 15, child = 2 + i % 5, val = [];
  const v = (when, list) => list.forEach(([id, x]) => val.push([id, S(x), when]));
  v(A, [['ArrPAX_MAIN', pax - 9], ['ArrPAX_INF', (i + 1) % 3], ['ArrBAGS', bags - 4], ['ArrPOIDS', (bags - 4) * kg], ['ArrSI', DEMO_SI_ARR[k]]]);
  if(isFR) v(null, [['PreviPAX_MAIN', pax + 3], ['PreviPAX_INF', inf], ['PreviBAGS', bags + 2]]);
  else v(null, [['PreviMALE', Math.round(pax*0.52)], ['PreviFEMALE', pax - Math.round(pax*0.52) - child], ['PreviCHILD', child], ['PreviINFANT', inf], ['PreviBAGS_OTHER', bags + 2], ['PreviPOIDS_OTHER', (bags + 2) * kg]]);
  v(null, [['PreviSI', DEMO_SI_PREVI[k]], ['PreviPoussettesPorte', 1 + i % 3], ['PreviPoussettesCBS', i % 2]]);
  const z = Math.floor(pax / 4), h = Math.floor(bags / 4), F = off - 4;
  if(isFR) v(F, [['FinalADULT', pax - child], ['FinalCHILD', child]]);
  else v(F, [['FinalMALE', Math.round(pax*0.52)], ['FinalFEMALE', pax - Math.round(pax*0.52) - child], ['FinalCHILD', child]]);
  v(F, [['FinalINFANT', inf], ['FinalOA', z - 2], ['FinalOB', z + 3], ['FinalOC', z + 1], ['FinalOD', pax - 3*z - 2],
    ['FinalBAGS', bags], ['FinalPOIDS', bags * kg], ['FinalH1', h - 3], ['FinalH2', h + 2], ['FinalH3', h + 4], ['FinalH4', bags - 3*h - 3], ['FinalSI', DEMO_SI_PREVI[k]],
    ['BlockFuel', isFR ? 7600 + i*150 : 8200 + i*120], ['TripFuel', isFR ? 5900 + i*140 : 6400 + i*110], ['TaxiFuel', 200], ['FuelUplift', isFR ? 3200 + i*90 : 3900 + i*80]]);
  const notes = (DEMO_NOTES[k] || []).map(([ref, d, txt]) => [(ref === 'A' ? A : off) + d, txt]);
  return { tm, val, notes };
};
})();
