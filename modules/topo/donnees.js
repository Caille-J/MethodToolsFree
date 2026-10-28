/* V2.2 — Module TOPO, partie DONNÉES (noyau métier, zéro affichage).
   Namespace global "Topo". Chargé AVANT carte.js, vue.js et manifeste.js.

   Logique métier choisie par Jules (V2.2) : ON CRÉE D'ABORD UN ARRÊT.
   Par défaut, un nouvel arrêt génère automatiquement un NOUVEAU LIEU
   portant le même nom et les mêmes coordonnées ; on pourra ensuite
   réaffecter proprement l'arrêt à un autre lieu dans son paramétrage.

   V2.6 (demande de Jules) : chaque arrêt et chaque lieu porte ses
   PROPRES champs d'export GTFS/NeTEx dans un objet "gtfs" —
     stop_code = abréviation (8 car., obligatoire, unique) ;
     stop_name = nom (32 car., obligatoire) ;
     stop_desc = adresse (128 car., facultatif) ;
     stop_lat / stop_lon = coordonnées (OBLIGATOIRES) ;
     zone_id = zone tarifaire (facultatif, liste du Catalogue) ;
     stop_url (128 car., facultatif) ;
     location_type = 0 stop/quai, 1 gare, 2 entrée/sortie, 3 nœud, 4 zone ;
     parent_station = abréviation du parent (interdit sur une gare) ;
     stop_timezone (pré-rempli Europe/Paris) ;
     wheelchair_boarding (0/1/2) ;
     level_id (réservé, non implémenté) ;
     platform_code (8 car., facultatif) ;
     stop_access (réservé, toujours off). */
"use strict";
window.Topo = (() => {

  const SCHEMA = "topo-4";   // topo-1 : lieux. topo-2 : + arrêts (GPS sur le lieu). topo-3 : + GPS propre à chaque arrêt + caractéristique des lieux. topo-4 : + champs GTFS/NeTEx par arrêt et par lieu.

  /* Migration paresseuse : crée l'espace topo à la volée, ou complète
     une instance topo-1/topo-2/topo-3 sans jamais rien casser. */
  function init(d) {
    if (!d.topo) d.topo = { version: SCHEMA, lieux: [], arrets: [] };
    if (!Array.isArray(d.topo.lieux)) d.topo.lieux = [];
    if (!Array.isArray(d.topo.arrets)) d.topo.arrets = [];   // migration topo-1 → topo-2
    /* Migration topo-2 → topo-3 (V2.4, demande de Jules) : les arrêts
       portent leur PROPRE GPS, indépendant du lieu. Un arrêt existant
       hérite des coordonnées de son lieu (jusqu'ici elles étaient
       communes) ; ensuite, déplacer un arrêt ne déplacera PLUS le lieu. */
    if (d.topo.version !== SCHEMA) {
      const parLieu = new Map(d.topo.lieux.map(l => [l.id, l]));
      d.topo.arrets.forEach(a => {
        const l = parLieu.get(a.lieuId);
        if (a.lat == null && l && l.lat != null) a.lat = l.lat;
        if (a.lng == null && l && l.lng != null) a.lng = l.lng;
      });
    }
    /* Migration topo-3 → topo-4 (V2.6) : rien à recopier — les champs
       GTFS absents valent simplement leurs valeurs par défaut, que la
       fiche affichera à l'ouverture (normaliserGtfs). */
    d.topo.version = SCHEMA;
    return d.topo;
  }

  /* Identifiant topo : préfixe "t" + compteur de l'instance (jamais de
     collision avec les ids "o" de la V1, ni entre eux). */
  const nouvelId = (d) => "t" + (d.compteur++);

  /* Abréviation automatique et unique pour un lieu auto-généré : on
     reprend celle proposée (ou les premières lettres du nom), nettoyée,
     et on ajoute un numéro si elle est déjà prise. */
  function abrevAuto(d, base) {
    const b = (String(base || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)) || "AR";
    const pris = new Set(d.topo.lieux.map(l => l.abrev.toUpperCase()));
    if (!pris.has(b)) return b;
    let n = 2;
    while (pris.has(b + n)) n++;
    return b + n;
  }

  /* ----- V2.6 : CHAMPS GTFS/NeTEx DES ARRÊTS ET LIEUX ----- */

  /* Valeurs par défaut d'un objet gtfs (celles d'un objet fraîchement
     créé, et celles affichées par la fiche si le champ est absent). */
  function normaliserGtfs(g) {
    g = g || {};
    return {
      adresse: String(g.adresse || "").trim(),               // GTFS stop_desc
      zoneId: String(g.zoneId || "").trim(),                  // GTFS zone_id
      stopUrl: String(g.stopUrl || "").trim(),               // GTFS stop_url
      locationType: g.locationType == null ? 0 : Number(g.locationType),   // GTFS location_type
      parentStation: String(g.parentStation || "").trim(),   // GTFS parent_station (abréviation du parent)
      timezone: String(g.timezone || "").trim() || "Europe/Paris",          // GTFS stop_timezone
      wheelchair: g.wheelchair == null ? 0 : Number(g.wheelchair),          // GTFS wheelchair_boarding
      levelId: String(g.levelId || "").trim(),               // GTFS level_id (réservé)
      platformCode: String(g.platformCode || "").trim(),    // GTFS platform_code
      stopAccess: g.stopAccess === true                      // GTFS as_stop_access (réservé, toujours off)
    };
  }

  /* Libellés des location_type (GTFS). */
  const LOCATION_TYPES = [
    [0, "0 — Stop / plateforme"],
    [1, "1 — Gare / station"],
    [2, "2 — Entrée / sortie"],
    [3, "3 — Nœud générique"],
    [4, "4 — Zone d'embarquement"]
  ];

  /* Validation des champs GTFS. ctx = { selfAbrev } : l'objet lui-même
     ne peut pas être son propre parent. */
  function validerGtfs(d, gtfs, ctx) {
    const g = normaliserGtfs(gtfs);
    const errs = [];
    if (g.adresse.length > 128) errs.push("Adresse (stop_desc) : 128 caractères maximum.");
    if (g.stopUrl.length > 128) errs.push("URL (stop_url) : 128 caractères maximum.");
    if (g.platformCode.length > 8) errs.push("Code de quai (platform_code) : 8 caractères maximum.");
    if (isNaN(g.locationType) || g.locationType < 0 || g.locationType > 4)
      errs.push("Type de lieu (location_type) : valeur 0 à 4.");
    /* parent_station : interdit sur une gare (location_type 1, elle ne
       peut pas avoir de parent) ; sinon doit désigner l'abréviation
       d'un lieu ou d'un arrêt EXISTANT (hors soi-même). */
    if (g.parentStation) {
      if (g.locationType === 1) {
        errs.push("Parent (parent_station) : une gare / station (type 1) ne peut pas avoir de parent.");
      } else {
        const self = ctx && ctx.selfAbrev ? ctx.selfAbrev.toLowerCase() : null;
        const connus = [
          ...d.topo.lieux.map(l => (l.abrev || "").toLowerCase()),
          ...d.topo.arrets.map(a => (a.abrev || "").toLowerCase())
        ];
        if (g.parentStation.toLowerCase() === self)
          errs.push("Parent (parent_station) : un objet ne peut pas être son propre parent.");
        else if (!connus.includes(g.parentStation.toLowerCase()))
          errs.push("Parent (parent_station) : abréviation « " + g.parentStation + " » introuvable (lieux et arrêts existants).");
      }
    }
    if (isNaN(g.wheelchair) || ![0, 1, 2].includes(g.wheelchair))
      errs.push("Accessibilité PMR (wheelchair_boarding) : valeur 0, 1 ou 2.");
    return errs;
  }

  /* ----- LIEUX (créés à la main ou automatiquement) ----- */

  function validerLieu(d, lieu, ignoreId) {
    const errs = [];
    if (!lieu.nom || !lieu.nom.trim()) errs.push("Nom obligatoire.");
    else if (lieu.nom.trim().length > 32) errs.push("Nom : 32 caractères maximum (GTFS stop_name).");
    if (!lieu.abrev || !lieu.abrev.trim()) errs.push("Abréviation obligatoire.");
    else if (lieu.abrev.trim().length > 8) errs.push("Abréviation : 8 caractères maximum.");
    else if (d.topo.lieux.some(l => l.abrev.toLowerCase() === lieu.abrev.trim().toLowerCase()
              && l.id !== ignoreId)) errs.push("Abréviation déjà utilisée dans cette instance.");
    if (lieu.caract && String(lieu.caract).trim().length > 32) errs.push("Caractéristique : 32 caractères maximum.");
    /* V2.6 : le GPS et les champs GTFS sont obligatoires/validés. */
    if (lieu.lat == null || lieu.lat === "" || isNaN(Number(lieu.lat)))
      errs.push("Latitude obligatoire (GTFS stop_lat).");
    if (lieu.lng == null || lieu.lng === "" || isNaN(Number(lieu.lng)))
      errs.push("Longitude obligatoire (GTFS stop_lon).");
    if (lieu.gtfs) errs.push(...validerGtfs(d, lieu.gtfs, { selfAbrev: lieu.abrev }));
    return errs;
  }

  function creerLieu(d, lieu) {
    init(d);
    const errs = validerLieu(d, lieu);
    if (errs.length) return { ok: false, erreurs: errs };
    const l = { id: nouvelId(d), nom: lieu.nom.trim(), abrev: lieu.abrev.trim(),
                caract: String(lieu.caract || "").trim(),
                lat: lieu.lat == null ? null : Number(lieu.lat),
                lng: lieu.lng == null ? null : Number(lieu.lng),
                gtfs: normaliserGtfs(lieu.gtfs), codes: {} };
    d.topo.lieux.push(l);
    return { ok: true, lieu: l };
  }

  /* ----- ARRÊTS (brique métier de premier plan depuis la V2.2) ----- */

  function validerArret(d, arret, ignoreId) {
    const errs = [];
    if (!arret.nom || !arret.nom.trim()) errs.push("Nom obligatoire.");
    else if (arret.nom.trim().length > 32) errs.push("Nom : 32 caractères maximum (GTFS stop_name).");
    if (!arret.abrev || !arret.abrev.trim()) errs.push("Abréviation obligatoire.");
    else if (arret.abrev.trim().length > 8) errs.push("Abréviation : 8 caractères maximum.");
    else if (d.topo.arrets.some(a => a.abrev.toLowerCase() === arret.abrev.trim().toLowerCase()
              && a.id !== ignoreId)) errs.push("Abréviation d'arrêt déjà utilisée dans cette instance.");
    if (arret.lat == null || arret.lat === "" || isNaN(Number(arret.lat)))
      errs.push("Latitude obligatoire (GTFS stop_lat).");
    if (arret.lng == null || arret.lng === "" || isNaN(Number(arret.lng)))
      errs.push("Longitude obligatoire (GTFS stop_lon).");
    if (arret.gtfs) errs.push(...validerGtfs(d, arret.gtfs, { selfAbrev: arret.abrev }));
    return errs;
  }

  /* Création d'un arrêt. Trois cas :
     ① lieuId fourni et trouvé  → l'arrêt s'y rattache, AUCUN lieu créé ;
     ② lieuId fourni mais inconnu → refus explicite ;
     ③ pas de lieuId → NOUVEAU LIEU automatique, même nom, mêmes
        coordonnées (règle métier de Jules). */
  function creerArret(d, arret) {
    init(d);
    const errs = validerArret(d, arret);
    if (errs.length) return { ok: false, erreurs: errs };
    let lieu = null;
    if (arret.lieuId) {
      lieu = d.topo.lieux.find(l => l.id === arret.lieuId);
      if (!lieu) return { ok: false, erreurs: ["Lieu indiqué introuvable."] };
    }
    if (!lieu) {
      const r = creerLieu(d, { nom: arret.nom.trim(), abrev: abrevAuto(d, arret.abrev),
                               lat: arret.lat, lng: arret.lng, gtfs: arret.gtfs });
      if (!r.ok) return { ok: false, erreurs: r.erreurs };
      lieu = r.lieu;
    }
    const a = { id: nouvelId(d), nom: arret.nom.trim(), abrev: arret.abrev.trim(),
                lieuId: lieu.id,
                lat: arret.lat == null ? null : Number(arret.lat),    // V2.4 : GPS PROPRE à l'arrêt
                lng: arret.lng == null ? null : Number(arret.lng),
                gtfs: normaliserGtfs(arret.gtfs),
                codes: {} };
    d.topo.arrets.push(a);
    return { ok: true, arret: a, lieu: lieu };
  }


/* ---- V2.3 : CRUD complet des arrêts et des lieux ----
   V2.6 : nom 32 car. (GTFS stop_name), abréviation 8 car. obligatoire
   et unique (sans casse, soi-même ignoré), lieu obligatoirement
   existant, GPS OBLIGATOIRE, champs GTFS validés (validerGtfs). */

function modifierArret(d, idArret, c) {
  const a = d.topo.arrets.find(x => x.id === idArret);
  if (!a) return { ok: false, erreurs: ["Arrêt introuvable."] };
  const nom = (c.nom || "").trim(), abrev = (c.abrev || "").trim();
  const errs = [];
  if (!nom) errs.push("Nom obligatoire.");
  else if (nom.length > 32) errs.push("Nom : 32 caractères maximum (GTFS stop_name).");
  if (!abrev) errs.push("Abréviation obligatoire.");
  else if (abrev.length > 8) errs.push("Abréviation : 8 caractères maximum.");
  else if (d.topo.arrets.some(x => x.id !== idArret && (x.abrev || "").toLowerCase() === abrev.toLowerCase()))
    errs.push("Abréviation déjà utilisée par un autre arrêt.");
  if (c.lieuId !== undefined && c.lieuId !== null && !d.topo.lieux.some(l => l.id === c.lieuId))
    errs.push("Lieu introuvable.");
  /* V2.6 : les champs GTFS passent par la même validation (le gtfs
     proposé est fusionné avec l'existant : un champ absent de la fiche
     n'écrase pas la valeur en base). */
  const gtfsPropose = c.gtfs !== undefined
    ? normaliserGtfs({ ...(a.gtfs || {}), ...c.gtfs })
    : a.gtfs;
  errs.push(...validerGtfs(d, gtfsPropose, { selfAbrev: abrev }));
  /* V2.6 : le GPS est OBLIGATOIRE — on refuse d'enregistrer un arrêt
     sans latitude ni longitude. */
  const latFinal = c.lat !== undefined ? ((c.lat === null || c.lat === "") ? null : Number(c.lat)) : a.lat;
  const lngFinal = c.lng !== undefined ? ((c.lng === null || c.lng === "") ? null : Number(c.lng)) : a.lng;
  if (latFinal == null || isNaN(latFinal)) errs.push("Latitude obligatoire (GTFS stop_lat).");
  if (lngFinal == null || isNaN(lngFinal)) errs.push("Longitude obligatoire (GTFS stop_lon).");
  if (errs.length) return { ok: false, erreurs: errs };
  a.nom = nom; a.abrev = abrev;
  if (c.lieuId !== undefined && c.lieuId !== a.lieuId) {
    if (!c.lieuId) return { ok: false, erreurs: ["Un arrêt doit toujours appartenir à un lieu."] };
    a.lieuId = c.lieuId;
  }
  if (c.gtfs !== undefined) a.gtfs = gtfsPropose;
  /* V2.4 : les coordonnées vivent sur l'ARRÊT lui-même. Déplacer un
     arrêt ne déplace JAMAIS son lieu (demande explicite de Jules).
     null = effacer la coordonnée ; absent = ne pas y toucher. */
  if (c.lat !== undefined) a.lat = latFinal;
  if (c.lng !== undefined) a.lng = lngFinal;
  return { ok: true, arret: a };
}

function supprimerArret(d, idArret) {
  const n = d.topo.arrets.length;
  d.topo.arrets = d.topo.arrets.filter(x => x.id !== idArret);
  /* Un arrêt supprimé n'efface JAMAIS son lieu : d'autres arrêts peuvent
     l'utiliser, et les données topographiques restent utiles. */
  return d.topo.arrets.length < n ? { ok: true } : { ok: false, erreurs: ["Arrêt introuvable."] };
}

function modifierLieu(d, idLieu, c) {
  const l = d.topo.lieux.find(x => x.id === idLieu);
  if (!l) return { ok: false, erreurs: ["Lieu introuvable."] };
  const nom = (c.nom || "").trim(), abrev = (c.abrev || "").trim();
  const errs = [];
  if (!nom) errs.push("Nom obligatoire.");
  else if (nom.length > 32) errs.push("Nom : 32 caractères maximum (GTFS stop_name).");
  if (!abrev) errs.push("Abréviation obligatoire.");
  else if (abrev.length > 8) errs.push("Abréviation : 8 caractères maximum.");
  else if (d.topo.lieux.some(x => x.id !== idLieu && (x.abrev || "").toLowerCase() === abrev.toLowerCase()))
    errs.push("Abréviation déjà utilisée par un autre lieu.");
  const gtfsPropose = c.gtfs !== undefined
    ? normaliserGtfs({ ...(l.gtfs || {}), ...c.gtfs })
    : l.gtfs;
  errs.push(...validerGtfs(d, gtfsPropose, { selfAbrev: abrev }));
  const latFinal = c.lat !== undefined ? ((c.lat === null || c.lat === "") ? null : Number(c.lat)) : l.lat;
  const lngFinal = c.lng !== undefined ? ((c.lng === null || c.lng === "") ? null : Number(c.lng)) : l.lng;
  if (latFinal == null || isNaN(latFinal)) errs.push("Latitude obligatoire (GTFS stop_lat).");
  if (lngFinal == null || isNaN(lngFinal)) errs.push("Longitude obligatoire (GTFS stop_lon).");
  if (errs.length) return { ok: false, erreurs: errs };
  l.nom = nom; l.abrev = abrev;
  if (c.gtfs !== undefined) l.gtfs = gtfsPropose;
  /* V2.4 : caractéristique du lieu (gare, passerelle… cf. GTFS) —
     champ libre, effaçable. null/absent = ne pas y toucher selon cas. */
  if (c.caract !== undefined) l.caract = String(c.caract || "").trim();
  if (c.lat !== undefined) l.lat = latFinal;
  if (c.lng !== undefined) l.lng = lngFinal;
  return { ok: true, lieu: l };
}

function supprimerLieu(d, idLieu) {
  const l = d.topo.lieux.find(x => x.id === idLieu);
  if (!l) return { ok: false, erreurs: ["Lieu introuvable."] };
  /* Règle métier : un lieu utilisé par des arrêts ne se supprime pas
     (même logique que les labels du catalogue V1). */
  const utilises = d.topo.arrets.filter(a => a.lieuId === idLieu);
  if (utilises.length) return { ok: false, erreurs: ["Impossible : " + utilises.length + " arrêt(s) rattaché(s) à ce lieu. Détachez-les d'abord."] };
  d.topo.lieux = d.topo.lieux.filter(x => x.id !== idLieu);
  return { ok: true };
}

  return { SCHEMA, init, nouvelId, abrevAuto, normaliserGtfs, LOCATION_TYPES,
         validerGtfs, validerLieu, creerLieu, validerArret, creerArret,
         modifierArret, supprimerArret, modifierLieu, supprimerLieu };
})();
