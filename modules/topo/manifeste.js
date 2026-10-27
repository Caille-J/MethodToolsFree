/* V2.2 — Module TOPO, MANIFESTE : branche le module sur la V1 via la
   fiche Hastus. Chargé en DERNIER (après donnees.js, carte.js, vue.js). */
"use strict";
Hastus.enregistrerModule({
  id: "topo",
  version: "2.2-ecran",
  onglet: "🗺️ Topologie",
  vue: (d, core) => Topo.vue(d, core)
});