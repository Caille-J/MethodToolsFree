/* ================================================================
   MODULE TOPO — fichier 3/3 : manifeste.js (la « fiche d'identité »)
   ----------------------------------------------------------------
   C'est LE point de branchement : ce fichier s'enregistre auprès de la
   fiche Hastus (posée par la V1.12). L'ordre de chargement des 3
   fichiers est : donnees.js, puis vue.js, puis ce manifeste (il a
   besoin des deux premiers).                                                    */
window.Topo = window.Topo || {};

const r = Hastus.enregistrerModule({
  id: "topo",                     // identifiant unique du module (-> onglet mod:topo)
  version: "2.1-squelette",
  onglet: "🗺️ Topologie",
  vue: (donnees, core) => Topo.vue(donnees, core)   // délégation : le manifeste ne fait que raccorder
});
if (!r.ok) afficherErreur("Module topo : " + r.erreur);