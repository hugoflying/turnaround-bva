/* Édition de l'app, seul fichier différent d'un repo à l'autre :
   'demo'   = testapp (tout, avec le mode démo)
   'keeper' = companionturnaroundapp (liste Airport Keeper, sans démo)
   'bva'    = turnaround-bva (sans Keeper, vols créés à la main, sans démo) */
window.APP_EDITION = 'bva';
document.documentElement.dataset.edition = window.APP_EDITION;
