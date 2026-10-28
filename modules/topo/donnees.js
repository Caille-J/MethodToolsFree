/* V2.2 — Module TOPO, partie DONNÉES (noyau métier, zéro affichage).
   Namespace global "Topo". Chargé AVANT carte.js, vue.js et manifeste.js.

   Logique métier choisie par Jules (V2.2) : ON CRÉE D'ABORD UN ARRÊT.
   Par défaut, un nouvel arrêt génère automatiquement un NOUVEAU LIEU
   portant le même nom et les mêmes coordonnées ; on pourra ensuite
   réaffecter proprement l'arrêt à un autre lieu dans son paramétrage.
   (Un lieu reste l'« ancrage » géographique : c'est lui qui porte le GPS,
   comme la parent_station de GTFS.) */
"use strict";
window.Topo = (() => {

  const SCHEMA = "topo-3";   // topo-1 : lieux. topo-2 : + arrêts (GPS sur le lieu). topo-3 : + GPS propre à chaque arrêt + caractéristique des lieux.

  /* Migration paresseuse : crée l'espace topo à la volée, ou complète
     une instance topo-1/topo-2 sans jamais rien casser. */
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

  /* ----- LIEUX (créés à la main ou automatiquement) ----- */

  function validerLieu(d, lieu, ignoreId) {
    const errs = [];
    if (!lieu.nom || !lieu.nom.trim()) errs.push("Nom obligatoire.");
    else if (lieu.nom.trim().length > 64) errs.push("Nom : 64 caractères maximum.");
    if (!lieu.abrev || !lieu.abrev.trim()) errs.push("Abréviation obligatoire.");
    else if (lieu.abrev.trim().length > 8) errs.push("Abréviation : 8 caractères maximum.");
    else if (d.topo.lieux.some(l => l.abrev.toLowerCase() === lieu.abrev.trim().toLowerCase()
              && l.id !== ignoreId)) errs.push("Abréviation déjà utilisée dans cette instance.");
    if (lieu.caract && String(lieu.caract).trim().length > 32) errs.push("Caractéristique : 32 caractères maximum.");
    return errs;
  }

  function creerLieu(d, lieu) {
    init(d);
    const errs = validerLieu(d, lieu);
    if (errs.length) return { ok: false, erreurs: errs };
    const l = { id: nouvelId(d), nom: lieu.nom.trim(), abrev: lieu.abrev.trim(),
                caract: String(lieu.caract || "").trim(),
                lat: lieu.lat == null ? null : Number(lieu.lat),
                lng: lieu.lng == null ? null : Number(lieu.lng), codes: {} };
    d.topo.lieux.push(l);
    return { ok: true, lieu: l };
  }

  /* ----- ARRÊTS (brique métier de premier plan depuis la V2.2) ----- */

  function validerArret(d, arret, ignoreId) {
    const errs = [];
    if (!arret.nom || !arret.nom.trim()) errs.push("Nom obligatoire.");
    else if (arret.nom.trim().length > 64) errs.push("Nom : 64 caractères maximum.");
    if (!arret.abrev || !arret.abrev.trim()) errs.push("Abréviation obligatoire.");
    else if (arret.abrev.trim().length > 8) errs.push("Abréviation : 8 caractères maximum.");
    else if (d.topo.arrets.some(a => a.abrev.toLowerCase() === arret.abrev.trim().toLowerCase()
              && a.id !== ignoreId)) errs.push("Abréviation d'arrêt déjà utilisée dans cette instance.");
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
                               lat: arret.lat, lng: arret.lng });
      if (!r.ok) return { ok: false, erreurs: r.erreurs };
      lieu = r.lieu;
    }
    const a = { id: nouvelId(d), nom: arret.nom.trim(), abrev: arret.abrev.trim(),
                lieuId: lieu.id,
                lat: arret.lat == null ? null : Number(arret.lat),    // V2.4 : GPS PROPRE à l'arrêt
                lng: arret.lng == null ? null : Number(arret.lng),
                codes: {} };
    d.topo.arrets.push(a);
    return { ok: true, arret: a, lieu: lieu };
  }


/* ---- V2.3 : CRUD complet des arrêts et des lieux ----
   Validation inline (autonome) : nom 64 car. obligatoire, abréviation
   8 car. obligatoire et unique (sans casse, soi-même ignoré), lieu
   obligatoirement existant. Les coordonnées appartiennent au LIEU :
   modifier lat/lng d'un arrêt déplace son lieu. */

function modifierArret(d, idArret, c) {
  const a = d.topo.arrets.find(x => x.id === idArret);
  if (!a) return { ok: false, erreurs: ["Arrêt introuvable."] };
  const nom = (c.nom || "").trim(), abrev = (c.abrev || "").trim();
  const errs = [];
  if (!nom) errs.push("Nom obligatoire.");
  else if (nom.length > 64) errs.push("Nom : 64 caractères maximum.");
  if (!abrev) errs.push("Abréviation obligatoire.");
  else if (abrev.length > 8) errs.push("Abréviation : 8 caractères maximum.");
  else if (d.topo.arrets.some(x => x.id !== idArret && (x.abrev || "").toLowerCase() === abrev.toLowerCase()))
    errs.push("Abréviation déjà utilisée par un autre arrêt.");
  if (c.lieuId !== undefined && c.lieuId !== null && !d.topo.lieux.some(l => l.id === c.lieuId))
    errs.push("Lieu introuvable.");
  if (errs.length) return { ok: false, erreurs: errs };
  a.nom = nom; a.abrev = abrev;
  if (c.lieuId !== undefined && c.lieuId !== a.lieuId) {
    if (!c.lieuId) return { ok: false, erreurs: ["Un arrêt doit toujours appartenir à un lieu."] };
    a.lieuId = c.lieuId;
  }
  /* V2.4 : les coordonnées vivent sur l'ARRÊT lui-même. Déplacer un
     arrêt ne déplace JAMAIS son lieu (demande explicite de Jules).
     null = effacer la coordonnée ; absent = ne pas y toucher. */
  if (c.lat !== undefined) a.lat = (c.lat === null || c.lat === "") ? null : Number(c.lat);
  if (c.lng !== undefined) a.lng = (c.lng === null || c.lng === "") ? null : Number(c.lng);
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
  else if (nom.length > 64) errs.push("Nom : 64 caractères maximum.");
  if (!abrev) errs.push("Abréviation obligatoire.");
  else if (abrev.length > 8) errs.push("Abréviation : 8 caractères maximum.");
  else if (d.topo.lieux.some(x => x.id !== idLieu && (x.abrev || "").toLowerCase() === abrev.toLowerCase()))
    errs.push("Abréviation déjà utilisée par un autre lieu.");
  if (errs.length) return { ok: false, erreurs: errs };
  l.nom = nom; l.abrev = abrev;
  /* V2.4 : caractéristique du lieu (gare, passerelle… cf. GTFS) —
     champ libre, effaçable. null/absent = ne pas y toucher selon cas. */
  if (c.caract !== undefined) l.caract = String(c.caract || "").trim();
  if (c.lat !== undefined) l.lat = (c.lat === null || c.lat === "") ? null : Number(c.lat);
  if (c.lng !== undefined) l.lng = (c.lng === null || c.lng === "") ? null : Number(c.lng);
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

  return { SCHEMA, init, nouvelId, abrevAuto, validerLieu, creerLieu, validerArret, creerArret,
         modifierArret, supprimerArret, modifierLieu, supprimerLieu };
})();

