/* ================================================================
   MODULE TOPO — fichier 2/3 : vue.js (l'interface du module)
   ----------------------------------------------------------------
   SQUELETTE V2.1 : la vue affiche l'état du module et la liste des
   lieux déjà déclarés (lecture seule pour l'instant). La saisie,
   la carte et le clic-GPS arrivent dans les versions suivantes.  */
window.Topo = window.Topo || {};

Topo.vue = (d, core) => {
  const t = Topo.init(d);
  const liste = t.lieux.length
    ? t.lieux.map(l => `<div class="carte" style="margin:6px 0;padding:8px 14px;">
        <span><b>${esc(l.abrev)}</b> — ${esc(l.nom)}</span>
        <span class="info-txt">${l.lat === null ? "GPS non posé" : "GPS ✓"}</span></div>`).join("")
    : `<p class="info-txt">Aucun lieu déclaré pour l'instant.</p>`;
  return core.h(`<div class="panneau-travail">
    <div class="barre-outils">
      <span class="titre">Topologie & cartographie</span>
      <span class="etiquette">schéma ${esc(t.version)}</span>
    </div>
    <p class="info-txt">Module branché sur la V1 🎉 — squelette V2.1 en place.
    Prochaines étapes : gestion des lieux (création, modification, recherche),
    puis carte (fond ESRI) et pose du GPS par clic.</p>
    <h3>Lieux déclarés (${t.lieux.length})</h3>
    ${liste}
  </div>`);
};