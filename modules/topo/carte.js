/* V2.3 — Module TOPO, partie CARTE (affichage uniquement).
   Namespace global "TopoCarte" : encapsule TOUT Leaflet pour garder la
   carte remplaçable (ESRI sans clé aujourd'hui, MapTiler possible
   demain : on ne change QUE ce fichier). Chargé après donnees.js, avant
   vue.js. Si la bibliothèque Leaflet n'est pas chargée (CDN coupé),
   chaque fonction se tait sans jamais faire planter l'application.

   V2.2.1 : la carte MÉMORISE sa dernière position (centre + zoom).
   V2.2.2 : les lieux sans arrêt sont dessinés (points gris).
   V2.3 : ① les arrêts sont des POINTS (cercles) et non plus des
     épingles ; ② survol explorateur ↔ carte : surbrillance(id) met
     l'objet en évidence sur la carte, et le survol d'un objet de la
     carte prévient l'explorateur (callback survol) ; ③ sélection
     conservée (clic sur un point). */
"use strict";
window.TopoCarte = (() => {

  /* Fonds de carte gratuits, sans clé. "plan" = rues Esri, "relief" = OpenTopoMap. */
  const FONDS = {
    plan:   { nom: "Plan (Esri)",    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", attrib: "Esri, HERE, Garmin" },
    relief: { nom: "Relief (OpenTopoMap)", url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attrib: "OpenTopoMap (CC-BY-SA)" }
  };

  /* Styles des points : arrêts (bleu plein), lieux libres (gris),
     objet survolé/surligné (contour orange, plus gros). */
  const STYLE_ARRET = { radius: 8, color: "#0a4ab5", weight: 2, fillColor: "#1266e5", fillOpacity: 0.95 };
  const STYLE_LIEU = { radius: 6, color: "#64748b", weight: 2, fillColor: "#cbd5e1", fillOpacity: 1 };
  const STYLE_SURBRILLANCE = { radius: 12, color: "#f59e0b", weight: 4, fillColor: "#f59e0b", fillOpacity: 0.95 };

  let carte = null, fondCourant = null, coucheArrets = null, coucheLieux = null;
  let dernierReglages = null;
  let derniereVue = null;   // {lat, lng, zoom} — conservé entre ré-affichages.
  const marqueurs = new Map();   // id d'objet → marqueur Leaflet (points).
  let idSurligne = null;          // objet actuellement surligné.

  const escLocal = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* Crée la carte dans la div portant cet id. Retourne true si OK,
     false si Leaflet est absent ou la div introuvable. */
  function init(idDiv) {
    if (typeof L === "undefined") return false;        // CDN Leaflet non chargé : silence.
    const el = document.getElementById(idDiv);
    if (!el) return false;
    if (carte) { carte.remove(); carte = null; }
    carte = L.map(el, { zoomControl: true, attributionControl: true });
    fondCourant = L.tileLayer(FONDS.plan.url, { attribution: FONDS.plan.attrib, maxZoom: 19 }).addTo(carte);
    if (derniereVue) carte.setView([derniereVue.lat, derniereVue.lng], derniereVue.zoom);
    else carte.setView([46.6, 2.4], 5);
    /* Chaque déplacement/zoom est mémorisé : le prochain ré-affichage
       retrouvera la carte EXACTEMENT où l'utilisateur l'a laissée. */
    carte.on("moveend zoomend", () => {
      if (!carte) return;
      const c = carte.getCenter();
      derniereVue = { lat: c.lat, lng: c.lng, zoom: carte.getZoom() };
    });
    coucheArrets = L.layerGroup().addTo(carte);
    coucheLieux = L.layerGroup();                       // hors carte par défaut (réglage).
    if (dernierReglages) appliquer(dernierReglages);
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

  /* Fabrique un POINT (cercle) interactif : popup, étiquette, clic de
     sélection, survol qui prévient l'explorateur. */
  function point(lat, lng, style, popupHtml, objet, opts, couche) {
    const m = L.circleMarker([lat, lng], style);
    m._styleNormal = style;                            // pour restaurer après surbrillance.
    m.bindPopup(popupHtml);
    if (opts && opts.etiquettes) m.bindTooltip(escLocal(objet.nom), { permanent: true, direction: "top", className: "topo-etiquette" });
    m.on("click", () => { if (opts && opts.selection) opts.selection(objet); });
    m.on("mouseover", () => { if (opts && opts.survol) opts.survol(objet.id); surbrillance(objet.id); });
    m.on("mouseout", () => { if (opts && opts.survol) opts.survol(null); surbrillance(null); });
    marqueurs.set(objet.id, m);
    couche.addLayer(m);
  }

  /* Redessine les POINTS d'arrêts (items {id, nom, abrev, lat, lng})
     PUIS les lieux sans arrêt (opts.lieuxLibres) en points gris. */
  function majArrets(arrets, opts) {
    if (!carte || !coucheArrets) return;
    coucheArrets.clearLayers();
    marqueurs.clear();
    idSurligne = null;
    arrets.forEach(a => {
      if (a.lat == null || a.lng == null) return;      // arrêt pas encore géolocalisé.
      point(a.lat, a.lng, STYLE_ARRET, "<b>" + escLocal(a.nom) + "</b><br><small>Arrêt " + escLocal(a.abrev) + "</small>", a, opts, coucheArrets);
    });
    if (opts && opts.lieuxLibres) opts.lieuxLibres.forEach(l => {
      if (l.lat == null || l.lng == null) return;
      point(l.lat, l.lng, STYLE_LIEU, "<b>" + escLocal(l.nom) + "</b><br><small>Lieu (sans arrêt rattaché)</small>", l, opts, coucheArrets);
    });
  }

  /* SURBRILLANCE : met en évidence l'objet portant cet id (id = null
     pour revenir au normal). Appelée par le survol de l'explorateur. */
  function surbrillance(id) {
    if (idSurligne && marqueurs.has(idSurligne)) {
      const m = marqueurs.get(idSurligne);
      m.setStyle(m._styleNormal || STYLE_ARRET);       // retour au style d'origine (bleu ou gris).
    }
    idSurligne = id || null;
    if (idSurligne && marqueurs.has(idSurligne)) {
      const m = marqueurs.get(idSurligne);
      m.setStyle(STYLE_SURBRILLANCE);
      m.bringToFront && m.bringToFront();
    }
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

  return { init, dispo, clic, centrer, majArrets, surbrillance, appliquer };
})();
