/* ================================================================
   MODULE TOPO — fichier 1/3 : donnees.js (le « mini-noyau » du module)
   ----------------------------------------------------------------
   Règle d'or de l'architecture : les données du module VIVENT dans
   l'instance (elles seront donc sauvegardées avec elle par BD.sauver),
   mais seul ce fichier sait comment elles sont faites.
   SCHEMA versionné : si demain le modèle évolue (ex. topo-2), on saura
   migrer les anciennes données — compatibilité ascendante, comme la
   migration du catalogue en V1.                                        */
window.Topo = window.Topo || {};

Topo.SCHEMA = "topo-1";

/* Initialise (ou complète) l'espace topo d'une instance — migration paresseuse :
   appelée au premier affichage, elle crée d.topo s'il manque. */
Topo.init = (d) => {
  if (!d.topo) d.topo = { version: Topo.SCHEMA, lieux: [] };
  return d.topo;
};

/* Identifiant unique : réutilise le compteur de l'instance (les ids topo ne
   peuvent donc jamais entrer en collision avec ceux de la V1). */
Topo.nouvelId = (d) => "t" + (d.compteur++);

/* Un LIEU = { id, nom, abrev, adresse, lat, lng, descriptif, codes }
   - nom, abrev, descriptif : besoin métier V2 de Jules
   - adresse : optionnelle (« si connue »)
   - lat/lng : position GPS (posées plus tard par clic sur la carte)
   - codes : colonnes d'export GTFS (vides pour l'instant, comme le catalogue) */
Topo.validerLieu = (d, lieu, ignoreId) => {
  const t = Topo.init(d);
  const errs = [];
  if (!lieu.nom || !lieu.nom.trim()) errs.push("Nom du lieu obligatoire.");
  else if (lieu.nom.trim().length > 64) errs.push("Nom du lieu : 64 caractères maximum.");
  if (!lieu.abrev || !lieu.abrev.trim()) errs.push("Abréviation obligatoire.");
  else if (lieu.abrev.trim().length > 8) errs.push("Abréviation : 8 caractères maximum.");
  else if (t.lieux.some(l => l.abrev.toLowerCase() === lieu.abrev.trim().toLowerCase()
        && l.id !== ignoreId)) errs.push("Abréviation déjà utilisée dans cette instance.");
  return errs;
};

Topo.creerLieu = (d, lieu) => {
  const errs = Topo.validerLieu(d, lieu);
  if (errs.length) return { ok: false, erreurs: errs };
  const t = Topo.init(d);
  t.lieux.push({
    id: Topo.nouvelId(d),
    nom: lieu.nom.trim(), abrev: lieu.abrev.trim(),
    adresse: (lieu.adresse || "").trim(),
    lat: null, lng: null,
    descriptif: (lieu.descriptif || "").trim(),
    codes: {}
  });
  return { ok: true };
};