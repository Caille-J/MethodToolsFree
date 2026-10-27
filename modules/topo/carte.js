/* V2.2.2 — Module TOPO, partie CARTE (affichage uniquement).
   Namespace global "TopoCarte" : encapsule TOUT Leaflet pour garder la
   carte remplaçable (ESRI sans clé aujourd'hui, MapTiler possible
   demain : on ne change QUE ce fichier). Chargé après donnees.js, avant
   vue.js. Si la bibliothèque Leaflet n'est pas chargée (CDN coupé),
   chaque fonction se tait sans jamais faire planter l'application.

   V2.2.1 : la carte MÉMORISE sa dernière position (centre + zoom) —
   chaque ré-affichage (filtre, création…) la recrée à l'identique au
   lieu de rebondir sur la France entière.
   V2.2.2 : majArrets dessine AUSSI les lieux sans arrêt rattaché
   (points gris) : tout objet géolocalisé de l'explorateur figure sur
   la carte. */
"use strict";
window.TopoCarte = (() => {

  /* Fonds de carte gratuits, sans clé. "plan" = rues Esri, "relief" = OpenTopoMap. */
  const FONDS = {
    plan:   { nom: "Plan (Esri)",    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", attrib: "Esri, HERE, Garmin" },
    relief: { nom: "Relief (OpenTopoMap)", url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attrib: "OpenTopoMap (CC-BY-SA)" }
  };

  let carte = null, fondCourant = null, coucheArrets = null, coucheLieux = null;
  let dernierReglages = null;
  let derniereVue = null;   // {lat, lng, zoom} — conservé entre ré-affichages.

  const escLocal = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* Crée la carte dans la div portant cet id. Retourne true si OK,
     false si Leaflet est absent ou la div introuvable. */
  function init(idDiv) {
    if (typeof L === "undefined") return false;        // CDN Leaflet non chargé : silence.
    const el = document.getElementById(idDiv);
    if (!el) return false;
    if (carte) { carte.remove(); carte = null; }       // ré-affichage : on repart propre.
    carte = L.map(el, { zoomControl: true, attributionControl: true });
    fondCourant = L.tileLayer(FONDS.plan.url, { attribution: FONDS.plan.attrib, maxZoom: 19 }).addTo(carte);
    /* Position de départ : la dernière vue connue, sinon la France. */
    if (derniereVue) carte.setView([derniereVue.lat, derniereVue.lng], derniereVue.zoom);
    else carte.setView([46.6, 2.4], 5);
    /* Chaque déplacement/zoom est mémorisé : le prochain ré-affichage
       (filtre, sélection, création) retrouvera la carte EXACTEMENT où
       l'utilisateur l'a laissée. */
    carte.on("moveend zoomend", () => {
      if (!carte) return;
      const c = carte.getCenter();
      derniereVue = { lat: c.lat, lng: c.lng, zoom: carte.getZoom() };
    });
    coucheArrets = L.layerGroup().addTo(carte);
    coucheLieux = L.layerGroup();                       // hors carte par défaut (réglage).
    if (dernierReglages) appliquer(dernierReglages);    // conserve les réglages entre ré-affichages.
    return true;
  }

  const dispo = () => typeof L !== "undefined" && carte !== null;

  /* Mode création : la vue passe une fonction appelée à chaque clic. */
  function clic(fn) { if (carte) carte.on("click", (ev) => fn(ev.latlng.lat, ev.latlng.lng)); }

  /* Centre la carte sur un point (animation flyTo) ET mémorise la vue. */
  function centrer(lat, lng, zoom) {
    if (lat == null || lng == null) return;
    derniereVue = { lat: Number(lat), lng: Number(lng), zoom: zoom || 15 };
    if (carte) carte.flyTo([Number(lat), Number(lng)], derniereVue.zoom);
  }

  /* Redessine les épingles d'arrêts (items {id, nom, abrev, lat, lng})
     PUIS les lieux sans arrêt (opts.lieuxLibres) en POINTS GRIS :
     tout objet géolocalisé de l'explorateur est ainsi sur la carte. */
  function majArrets(arrets, opts) {
    if (!carte || !coucheArrets) return;
    coucheArrets.clearLayers();
    arrets.forEach(a => {
      if (a.lat == null || a.lng == null) return;      // arrêt pas encore géolocalisé.
      const m = L.marker([a.lat, a.lng]);
      m.bindPopup("<b>" + escLocal(a.nom) + "</b><br><small>Arrêt " + escLocal(a.abrev) + "</small>");
      if (opts && opts.etiquettes) m.bindTooltip(escLocal(a.nom), { permanent: true, direction: "top", className: "topo-etiquette" });
      m.on("click", () => { if (opts && opts.selection) opts.selection(a); });   // sélectionnable.
      coucheArrets.addLayer(m);
    });
    /* Lieux sans arrêt rattaché : petits cercles gris, sélectionnables. */
    if (opts && opts.lieuxLibres) opts.lieuxLibres.forEach(l => {
      if (l.lat == null || l.lng == null) return;
      const m = L.circleMarker([l.lat, l.lng], { radius: 6, color: "#64748b", weight: 2, fillColor: "#cbd5e1", fillOpacity: 1 });
      m.bindPopup("<b>" + escLocal(l.nom) + "</b><br><small>Lieu (sans arrêt rattaché)</small>");
      if (opts.etiquettes) m.bindTooltip(escLocal(l.nom), { permanent: true, direction: "top", className: "topo-etiquette" });
      m.on("click", () => { if (opts.selection) opts.selection(l); });
      coucheArrets.addLayer(m);
    });
  }

  /* Applique les réglages du ⚙ : fond de carte, couches visibles. */
  function appliquer(reglages) {
    dernierReglages = reglages;
    if (!carte) return;
    const r = reglages || {};
    const voulu = FONDS[r.fond] ? r.fond : "plan";
    if (fondCourant) carte.removeLayer(fondCourant);
    fondCourant = L.tileLayer(FONDS[voulu].url, { attribution: FONDS[voulu].attrib, maxZoom: 19 }).addTo(carte);
    const couches = r.couches || {};
    if (coucheArrets) { if (couches.arrets === false) carte.removeLayer(coucheArrets); else coucheArrets.addTo(carte); }
    if (coucheLieux) { if (couches.lieux === true) coucheLieux.addTo(carte); else carte.removeLayer(coucheLieux); }
  }

  return { init, dispo, clic, centrer, majArrets, appliquer };
})();