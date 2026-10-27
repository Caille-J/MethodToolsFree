/* V2.1 — Module TOPO, partie VUE (affichage uniquement).
   Le squelette est volontairement vide : Jules précisera plus tard le
   contenu de la barre d'onglets (div.onglets) et de la zone de travail.
   Contrat respecté : la vue ne touche JAMAIS aux données en direct,
   tout passe par la fiche (core). */
"use strict";
window.Topo.vue = (d, core) => {
  Topo.init(d);   // migration paresseuse : garantit d.topo pour toute la suite
  /* Structure demandée par Jules (V2.1-ergo) :
     - une barre d'onglets vide (à remplir ensemble ensuite),
     - en dessous, la zone de travail — vide pour l'instant. */
  return core.h(`<div>
    <div class="onglets" id="topo-onglets"></div>
    <div id="topo-travail"></div>
  </div>`);
};