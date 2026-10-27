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

  const SCHEMA = "topo-2";   // topo-1 : lieux seulement. topo-2 : + arrêts.

  /* Migration paresseuse : crée l'espace topo à la volée, ou complète
     une instance topo-1 (avant les arrêts) sans jamais rien casser. */
  function init(d) {
    if (!d.topo) d.topo = { version: SCHEMA, lieux: [], arrets: [] };
    if (!Array.isArray(d.topo.lieux)) d.topo.lieux = [];
    if (!Array.isArray(d.topo.arrets)) d.topo.arrets = [];   // migration topo-1 → topo-2
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
    return errs;
  }

  function creerLieu(d, lieu) {
    init(d);
    const errs = validerLieu(d, lieu);
    if (errs.length) return { ok: false, erreurs: errs };
    const l = { id: nouvelId(d), nom: lieu.nom.trim(), abrev: lieu.abrev.trim(),
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
                lieuId: lieu.id, codes: {} };
    d.topo.arrets.push(a);
    return { ok: true, arret: a, lieu: lieu };
  }

  return { SCHEMA, init, nouvelId, abrevAuto, validerLieu, creerLieu, validerArret, creerArret };
})();