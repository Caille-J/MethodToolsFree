/* V2.3 — Module TOPO, partie VUE (affichage uniquement).
   Nouveautés V2.3 (demandes de Jules) :
   ① EXPLORATEUR : double-clic sur un objet → sa fiche de modification
     (réseau/ligne → fiches existantes de la V1 ; arrêt/lieu → fiches du
     module) ; à droite de chaque arrêt/lieu une CROIX ✕ de suppression
     avec double-clic de confirmation (réseaux et lignes gardent leurs
     règles métier V1 : suppression via leurs fiches) ; le SURVOL d'un
     objet le surligne sur la carte (et vice-versa) ; le clic simple
     sélectionne ET recentre toujours.
   ② FICHES : modifier un arrêt (nom, abréviation, lieu, coordonnées —
     qui déplacent le lieu rattaché) et modifier un lieu sans arrêt.
   ③ La vue utilise TOUT l'écran (pas de défilement de page).
   Contrat module : la vue ne touche jamais aux données en direct. */
"use strict";

/* État d'affichage du module (réglages de confort, non persistés). */
function topoEtat() {
  if (!App.topo) App.topo = {
    filtres: { reseaux: [], lignes: [], groupes: [] },   // [] = tout afficher
    reglages: { fond: "plan", couches: { arrets: true, lieux: false }, etiquettes: true },
    creation: false,      // bouton « Créer un arrêt » armé ?
    popover: null,        // cartouche dont la liste est ouverte ("reseaux"…)
    selection: null,       // id de l'objet sélectionné (explorateur/carte)
    ples: { reseaux: true, lignes: true, arrets: true, lieux: true },   // V2.4 : catégories pliées de l'explorateur (true = dépliée)
    recherche: ""          // V2.4 : recherche de l'explorateur
  };
  if (!App.topo.ples) App.topo.ples = { reseaux: true, lignes: true, arrets: true, lieux: true };
  if (App.topo.recherche === undefined) App.topo.recherche = "";
  return App.topo;
}

/* ----- CASCADE DE FILTRES ----- */
/* V2.4 : les cartouches Réseaux et Lignes ont été retirées (demande de
   Jules) — seul le filtre « Groupes de lignes » subsiste. */

/* Lignes visibles selon les groupes sélectionnés. */
function lignesAffichables(d, t) {
  const f = t.filtres;
  let ls = d.lignes;
  if (f.groupes.length) ls = ls.filter(l => f.groupes.includes(l.groupe));
  return ls;
}

/* Groupes présents dans les lignes. */
function groupesAffichables(d, t) {
  return [...new Set(d.lignes.map(l => l.groupe).filter(g => g))];
}

/* Après chaque changement : retire les sélections devenues hors cascade. */
function harmoniserFiltres(d, t) {
  t.filtres.groupes = t.filtres.groupes.filter(g => groupesAffichables(d, t).includes(g));
}

/* ----- LA VUE ----- */

window.Topo.vue = (d, core) => {
  Topo.init(d);
  const t = topoEtat();
  harmoniserFiltres(d, t);

  const racine = core.h(`<div class="topo-plein" id="topo-cadre">
    <div class="cartouches" id="topo-filtres"></div>
    <div class="onglets topo-onglets" id="topo-onglets"></div>
    <div class="topo-disposition">
      <div class="explorateur panneau-travail" id="topo-explorateur"></div>
      <div class="topo-carte" id="topo-carte-cadre">
        <div id="topo-carte-div"></div>
        <p class="info-txt" id="topo-carte-fallback"></p>
      </div>
    </div>
  </div>`);

  dessinerCartouches(racine.querySelector("#topo-filtres"), d, core, t);
  dessinerBande(racine.querySelector("#topo-onglets"), d, core, t);
  dessinerExplorateur(racine.querySelector("#topo-explorateur"), d, core, t);

  setTimeout(() => {
    /* Hauteur exacte pour tenir sur UNE page sans défilement : on
       mesure où commence le cadre et on occupe tout le reste. */
    const cadre = document.getElementById("topo-cadre");
    if (cadre && cadre.getBoundingClientRect) {
      const r = cadre.getBoundingClientRect();
      if (r && typeof r.top === "number" && r.top > 0 && typeof window.innerHeight === "number") {
        cadre.style.height = Math.max(320, window.innerHeight - r.top - 14) + "px";
      }
    }
    const ok = TopoCarte.init("topo-carte-div");
    const fb = document.getElementById("topo-carte-fallback");
    if (fb) fb.textContent = ok ? "" :
      "Carte indisponible (bibliothèque non chargée) : l'explorateur et la création d'arrêts restent utilisables.";
    if (ok) {
      TopoCarte.appliquer(t.reglages);
      /* Mode création armé : CHAQUE clic sur la carte ouvre la fenêtre
         de création pré-remplie (le bouton reste armé). */
      TopoCarte.clic((lat, lng) => { if (t.creation) formulaireArret(d, core, lat, lng); });
      rafraichirMarqueurs(d, core);
    }
  }, 0);

  return racine;
};

/* Objets à afficher sur la carte : les arrêts (points bleus, à LEURS
   coordonnées propres — V2.4) ET tous les lieux géolocalisés (carrés
   gris, couche activable dans ⚙). */
function objetsCarte(d) {
  const arrets = d.topo.arrets.map(a =>
    ({ id: a.id, nom: a.nom, abrev: a.abrev, lat: a.lat == null ? null : a.lat, lng: a.lng == null ? null : a.lng }));
  const lieux = d.topo.lieux
    .filter(l => l.lat != null && l.lng != null)
    .map(l => ({ id: l.id, nom: l.nom, abrev: l.abrev, caract: l.caract || "", lat: l.lat, lng: l.lng }));
  return { arrets, lieux };
}

function rafraichirMarqueurs(d, core) {
  const t = topoEtat();
  const o = objetsCarte(d);
  TopoCarte.majArrets(o.arrets, {
    etiquettes: t.reglages.etiquettes,
    lieux: o.lieux,                                  // V2.4 : TOUS les lieux, en carrés (couche ⚙)
    selection: (a) => { t.selection = a.id; core.rafraichir(); },
    /* Survol d'un point de la carte : surligne l'objet dans l'explorateur
       (modification directe du DOM, sans réaffichage complet : survoler
       la carte ne doit jamais déclencher de boucle de réaffichage). */
    survol: (id) => {
      const zone = document.querySelector("#topo-explorateur");
      if (!zone) return;
      zone.querySelectorAll(".item-objet.survol").forEach(x => x.classList.remove("survol"));
      if (id) { const it = zone.querySelector('.item-objet[data-id="' + id + '"]'); if (it) it.classList.add("survol"); }
    }
  });
}

/* ----- CARTOUCHES DE FILTRE ----- */

function dessinerCartouches(zone, d, core, t) {
  /* Libellé explicite : on comprend que ces bulles sont des FILTRES.
     V2.4 : seuls les GROUPES DE LIGNES restent (demande de Jules) —
     les cartouches Réseaux et Lignes ont été retirées. */
  zone.appendChild(core.h(`<span class="filtres-libelle">🔎 Filtrer :</span>`));
  [["groupes", "🗂️ Groupes de lignes"]].forEach(([cle, label]) => {
    const nb = t.filtres[cle].length;
    const b = core.h(`<button class="cartouche ${nb ? "actif" : ""}" title="Filtrer par groupes de lignes — cliquez pour choisir">${label}${nb ? ` <span class="etiquette">${nb}</span>` : ""}<span class="loupe">🔍</span></button>`);
    b.onclick = () => { t.popover = (t.popover === cle) ? null : cle; core.rafraichir(); };
    zone.appendChild(b);
  });
  if (t.popover) zone.appendChild(popoverFiltre(d, core, t, t.popover));
}

/* Items d'une cartouche, déjà restreints par la cascade. */
function itemsFiltre(d, t, cle) {
  return groupesAffichables(d, t).map(g => ({ cle: g, label: g }));
}

/* La liste déroulante d'une cartouche : recherche + cases à cocher
   multiples + « Tout afficher ». */
function popoverFiltre(d, core, t, cle) {
  const f = t.filtres;
  const boite = core.h(`<div class="cartouche-pop">
    <input id="cp-q" placeholder="🔎 Rechercher…" style="width:100%">
    <div class="cp-liste" id="cp-liste"></div>
    <div class="actions"><button type="button" class="b-blanc" id="cp-tous">Tout afficher</button>
    <button type="button" class="b-bleu" id="cp-ok">Fermer</button></div>
  </div>`);

  const dessinerListe = (q) => {
    const zoneListe = boite.querySelector("#cp-liste");
    zoneListe.replaceChildren();
    const q2 = String(q || "").toLowerCase();
    const items = itemsFiltre(d, t, cle).filter(it => it.label.toLowerCase().includes(q2));
    if (!items.length) { zoneListe.appendChild(core.h(`<p class="info-txt">Aucun résultat.</p>`)); return; }
    items.forEach(it => {
      const coche = core.h(`<label class="item-coche"><input type="checkbox" ${f[cle].includes(it.cle) ? "checked" : ""}> ${core.esc(it.label)}</label>`);
      coche.querySelector("input").onchange = (ev) => {
        if (ev.target.checked) { if (!f[cle].includes(it.cle)) f[cle].push(it.cle); }
        else f[cle] = f[cle].filter(x => x !== it.cle);
        harmoniserFiltres(d, t);   // retire les sélections devenues hors cascade
        core.rafraichir();
      };
      zoneListe.appendChild(coche);
    });
  };

  boite.querySelector("#cp-q").oninput = (ev) => dessinerListe(ev.target.value);
  boite.querySelector("#cp-tous").onclick = () => { f[cle] = []; harmoniserFiltres(d, t); core.rafraichir(); };
  boite.querySelector("#cp-ok").onclick = () => { t.popover = null; core.rafraichir(); };
  dessinerListe("");
  return boite;
}

/* ----- BANDE DES BOUTONS DE LA CARTE ----- */

function dessinerBande(bande, d, core, t) {
  const bCreer = core.h(`<button class="onglet ${t.creation ? "arme" : ""}" title="Armer, puis chaque clic sur la carte crée un arrêt">➕ Créer un arrêt</button>`);
  bCreer.onclick = () => {
    t.creation = !t.creation;                       // change de couleur (classe .arme)
    if (t.creation && !TopoCarte.dispo()) formulaireArret(d, core, null, null);   // repli sans carte
    core.rafraichir();
  };
  bande.appendChild(bCreer);
  /* Mode création armé : un bandeau orange rappelle quoi faire ensuite. */
  if (t.creation) bande.appendChild(core.h(`<span class="etiquette alerte">Mode création armé : cliquez sur la carte où créer l'arrêt</span>`));
  /* — les boutons suivants (chemins, imports…) s'inséreront ici — */
  const bReglages = core.h(`<button class="onglet" title="Paramétrage de la carte">⚙</button>`);
  bReglages.onclick = () => popupReglages(d, core);
  bande.appendChild(bReglages);
}

/* ----- EXPLORATEUR D'OBJETS (gauche) ----- */

/* Une ligne d'objet de l'explorateur : clic = sélection (+ recentrage si
   géolocalisé), double-clic = fiche de modification, ✕ = suppression
   (double-clic de confirmation), survol = surlignage sur la carte. */
function itemObjet(core, t, cfg) {
  const b = core.h(`<div class="item-objet ${t.selection === cfg.id ? "sel" : ""}" data-id="${cfg.id}">${cfg.html}${cfg.supprimable ? '<button type="button" class="obj-suppr" title="Supprimer (double clic pour confirmer)">✕</button>' : ""}</div>`);
  b.onclick = () => {
    t.selection = cfg.id;
    if (cfg.centrer) TopoCarte.centrer(cfg.centrer[0], cfg.centrer[1]);
    core.rafraichir();
  };
  b.ondblclick = () => { if (cfg.modifier) cfg.modifier(); };
  b.onmouseover = () => TopoCarte.surbrillance(cfg.id);
  b.onmouseout = () => TopoCarte.surbrillance(null);
  if (cfg.supprimable) {
    const x = b.querySelector(".obj-suppr");
    let arme = false;
    x.onclick = (ev) => {
      ev.stopPropagation();                            // la croix ne sélectionne pas l'objet.
      if (!arme) {
        arme = true; x.classList.add("armed"); x.textContent = "✓ ?";
        setTimeout(() => { arme = false; }, 3000);     // rendu remettra la croix si délai dépassé.
      } else cfg.supprimer();
    };
    x.ondblclick = (ev) => ev.stopPropagation();
  }
  return b;
}

/* V2.4 : titre de catégorie PLIABLE de l'explorateur. Renvoie true si
   la catégorie est dépliée (il faut dessiner son contenu). Si l'objet
   sélectionné vit dans une catégorie pliée, une pastille 🎯 le rappelle
   (demande de Jules : savoir qu'un filtre/sélection est caché). */
function titreCategorie(cible, core, t, cle, label, nb, selectionDedans) {
  const plie = !t.ples[cle];
  const b = core.h(`<h4 class="explo-titre">${plie ? "▸" : "▾"} ${label} <small>(${nb})</small>${selectionDedans && plie ? ' <span class="etiquette alerte" title="L’objet sélectionné est dans cette catégorie pliée">🎯</span>' : ""}</h4>`);
  b.onclick = () => { t.ples[cle] = !t.ples[cle]; core.rafraichir(); };
  cible.appendChild(b);
  return !plie;
}

function dessinerExplorateur(cible, d, core) {
  const t = topoEtat();
  const f = t.filtres;
  const lieux = new Map(d.topo.lieux.map(l => [l.id, l]));
  cible.appendChild(core.h(`<p class="info-txt">Clic : sélectionner (et centrer) · double-clic : fiche · ✕ : supprimer (double clic) · survol : surligner sur la carte.</p>`));

  /* V2.4 : RECHERCHE en haut de l'explorateur — tape pour retrouver un
     objet précis. Elle se COMBINE avec les filtres (groupes…) : on ne
     cherche que parmi ce qui est déjà affiché. */
  const barre = core.h(`<div class="champ" style="margin:4px 0 10px;"><input id="exp-q" value="${core.esc(t.recherche)}" placeholder="🔎 Rechercher un objet (nom, abréviation)…" style="width:100%;"/></div>`);
  barre.querySelector("input").oninput = (e) => {
    t.recherche = e.target.value;
    core.rafraichir();
    const cible2 = document.getElementById("exp-q");
    if (cible2) { cible2.focus(); cible2.setSelectionRange(cible2.value.length, cible2.value.length); }
  };
  cible.appendChild(barre);
  const q = String(t.recherche || "").trim().toLowerCase();
  const cherche = (o) => !q || ((o.nom || "") + " " + (o.abrev || "")).toLowerCase().includes(q);
  const sel = t.selection;
  const dans = (liste) => liste.some(x => x.id === sel);

  /* ---------- 🚌 Réseaux (pliable, fiche V1, pas de croix : règles V1) ---------- */
  const reseauxVisibles = d.reseaux.filter(r => cherche(r));
  const deplieReseaux = titreCategorie(cible, core, t, "reseaux", "🚌 Réseaux", reseauxVisibles.length, dans(d.reseaux.filter(r => cherche(r))));
  if (deplieReseaux) {
    if (!d.reseaux.length) cible.appendChild(core.h(`<p class="info-txt">Aucun réseau.</p>`));
    else if (!reseauxVisibles.length) cible.appendChild(core.h(`<p class="info-txt">Aucun réseau ne correspond${q ? " à la recherche" : ""}.</p>`));
    reseauxVisibles.forEach(r => cible.appendChild(itemObjet(core, t, {
      id: r.id, html: core.esc(r.nom), supprimable: false,
      modifier: () => (typeof modalReseau === "function" ? modalReseau(r.id) : null)
    })));
  }

  /* ---------- 🚏 Lignes (pliable, filtre Groupes + recherche, fiche V1) ---------- */
  const lignesVisibles = lignesAffichables(d, t).filter(l => cherche(l));
  const deplieLignes = titreCategorie(cible, core, t, "lignes", "🚏 Lignes", lignesVisibles.length, dans(lignesAffichables(d, t).filter(l => cherche(l))));
  if (deplieLignes) {
    if (!d.lignes.length) cible.appendChild(core.h(`<p class="info-txt">Aucune ligne.</p>`));
    else if (!lignesVisibles.length) cible.appendChild(core.h(`<p class="info-txt">Aucune ligne ne correspond${f.groupes.length ? " aux filtres" : ""}${q ? " à la recherche" : ""}.</p>`));
    lignesVisibles.forEach(l => cible.appendChild(itemObjet(core, t, {
      id: l.id, html: core.esc(l.abrev) + " — " + core.esc(l.nom), supprimable: false,
      modifier: () => (typeof modalLigne === "function" ? modalLigne(l.id) : null)
    })));
  }

  /* ---------- 📍 Arrêts (pliable, GPS PROPRE à l'arrêt depuis la V2.4) ---------- */
  const arretsVisibles = d.topo.arrets.filter(a => cherche(a));
  const deplieArrets = titreCategorie(cible, core, t, "arrets", "📍 Arrêts", arretsVisibles.length, dans(d.topo.arrets.filter(a => cherche(a))));
  if (deplieArrets) {
    if (!d.topo.arrets.length && !d.topo.lieux.length) cible.appendChild(core.h(`<p class="info-txt">Aucun arrêt — armez « ➕ Créer un arrêt » puis cliquez sur la carte.</p>`));
    else if (!arretsVisibles.length) cible.appendChild(core.h(`<p class="info-txt">Aucun arrêt ne correspond${q ? " à la recherche" : ""}.</p>`));
    arretsVisibles.forEach(a => {
      const sansGps = (a.lat == null || a.lng == null);
      const l = lieux.get(a.lieuId) || {};
      cible.appendChild(itemObjet(core, t, {
        id: a.id,
        html: core.esc(a.nom) + ` <small>(${core.esc(a.abrev)})</small>` + (l.nom ? ` <small>· ${core.esc(l.nom)}</small>` : "") + (sansGps ? ' <span class="etiquette alerte">⚠ GPS</span>' : ""),
        supprimable: true,
        centrer: sansGps ? null : [a.lat, a.lng],
        modifier: () => ficheArret(d, core, a.id),
        supprimer: () => { Topo.supprimerArret(d, a.id); core.sauver(); core.rafraichir(); }
      }));
    });
  }

  /* ---------- 🚉 Lieux (V2.4 : TOUS les lieux, pliables, carrés sur la
     carte) — croix seulement si AUCUN arrêt n'y est rattaché (sinon la
     règle métier refuserait de toute façon). ---------- */
  const nbArretsParLieu = new Map();
  d.topo.arrets.forEach(a => { if (a.lieuId) nbArretsParLieu.set(a.lieuId, (nbArretsParLieu.get(a.lieuId) || 0) + 1); });
  const lieuxVisibles = d.topo.lieux.filter(l => cherche(l));
  const deplieLieux = titreCategorie(cible, core, t, "lieux", "🚉 Lieux", lieuxVisibles.length, dans(d.topo.lieux.filter(l => cherche(l))));
  if (deplieLieux) {
    if (!d.topo.lieux.length) cible.appendChild(core.h(`<p class="info-txt">Aucun lieu — créez-en un dans l'onglet « 🚉 Lieux » ou via un arrêt.</p>`));
    else if (!lieuxVisibles.length) cible.appendChild(core.h(`<p class="info-txt">Aucun lieu ne correspond${q ? " à la recherche" : ""}.</p>`));
    lieuxVisibles.forEach(l => {
      const sansGps = (l.lat == null || l.lng == null);
      const nb = nbArretsParLieu.get(l.id) || 0;
      cible.appendChild(itemObjet(core, t, {
        id: l.id,
        html: core.esc(l.nom) + ` <small>(${core.esc(l.abrev)})</small>` + (l.caract ? ` <small>· ${core.esc(l.caract)}</small>` : "") + (sansGps ? ' <span class="etiquette alerte">⚠ GPS</span>' : "") + (nb ? ` <span class="etiquette">${nb} arrêt${nb > 1 ? "s" : ""}</span>` : ""),
        supprimable: nb === 0,
        centrer: sansGps ? null : [l.lat, l.lng],
        modifier: () => ficheLieu(d, core, l.id),
        supprimer: () => { const r = Topo.supprimerLieu(d, l.id); if (!r.ok) alert((r.erreurs || []).join(" ")); core.sauver(); core.rafraichir(); }
      }));
    });
  }
}

/* ----- FENÊTRE DE CRÉATION D'ARRÊT ----- */

function formulaireArret(d, core, lat, lng) {
  const lieux = d.topo.lieux.map(l =>
    `<option value="${l.id}">${core.esc(l.nom)} (${core.esc(l.abrev)})</option>`).join("");
  const f = core.h(`<form class="panneau-travail">
    <h3>Créer un arrêt</h3>
    <p class="info-txt">Par défaut, un nouveau lieu portant le même nom et les mêmes coordonnées sera créé automatiquement. Vous pourrez ensuite réaffecter l'arrêt à un autre lieu dans son paramétrage.</p>
    <label>Nom <input id="a-nom" maxlength="64" required placeholder="Ex. Gare Centre"></label>
    <label>Abréviation <input id="a-abrev" maxlength="8" required placeholder="Ex. GCE"></label>
    <label>Latitude <input id="a-lat" type="number" step="any" value="${lat != null ? lat : ""}" placeholder="Ex. 48.11"></label>
    <label>Longitude <input id="a-lng" type="number" step="any" value="${lng != null ? lng : ""}" placeholder="Ex. -1.67"></label>
    <label>Lieu <select id="a-lieu"><option value="">— Nouveau lieu (par défaut) —</option>${lieux}</select></label>
    <div class="actions"><button type="button" class="b-blanc" id="a-fermer">Annuler</button>
    <button type="submit" class="b-bleu">Créer l'arrêt</button></div>
    <div id="a-erreurs"></div>
  </form>`);
  f.onsubmit = (ev) => {
    ev.preventDefault();
    const r = Topo.creerArret(d, {
      nom: f.querySelector("#a-nom").value,
      abrev: f.querySelector("#a-abrev").value,
      lat: f.querySelector("#a-lat").value === "" ? null : Number(f.querySelector("#a-lat").value),
      lng: f.querySelector("#a-lng").value === "" ? null : Number(f.querySelector("#a-lng").value),
      lieuId: f.querySelector("#a-lieu").value || null
    });
    if (r.ok) {
      core.sauver();
      f.closest(".modal-fond").remove();
      core.rafraichir();
    } else {
      const zoneErr = f.querySelector("#a-erreurs");
      zoneErr.replaceChildren(core.h(`<p class="erreur">${r.erreurs.map(e => core.esc(e)).join("<br>")}</p>`));
    }
  };
  f.querySelector("#a-fermer").onclick = () => f.closest(".modal-fond").remove();
  core.modal(f);
}

/* ----- FICHE DE MODIFICATION D'ARRÊT (V2.3) ----- */

function ficheArret(d, core, idArret) {
  const a = d.topo.arrets.find(x => x.id === idArret);
  if (!a) return;
  const l = d.topo.lieux.find(x => x.id === a.lieuId) || {};
  const lieuxOpts = d.topo.lieux.map(x =>
    `<option value="${x.id}" ${x.id === a.lieuId ? "selected" : ""}>${core.esc(x.nom)} (${core.esc(x.abrev)})</option>`).join("");
  const f = core.h(`<form class="panneau-travail">
    <h3>Modifier l'arrêt — ${core.esc(a.nom)}</h3>
    <label>Nom <input id="e-nom" maxlength="64" required value="${core.esc(a.nom)}"></label>
    <label>Abréviation <input id="e-abrev" maxlength="8" required value="${core.esc(a.abrev)}"></label>
    <label>Lieu <select id="e-lieu">${lieuxOpts}</select></label>
    <label>Latitude <input id="e-lat" type="number" step="any" value="${a.lat != null ? a.lat : ""}"></label>
    <label>Longitude <input id="e-lng" type="number" step="any" value="${a.lng != null ? a.lng : ""}"></label>
    <p class="info-txt">Les coordonnées sont celles de l'ARRÊT, indépendantes de son lieu (V2.4) : déplacer un arrêt ne déplace jamais le lieu.</p>
    <div class="actions"><button type="button" class="b-blanc" id="e-fermer">Annuler</button>
    <button type="submit" class="b-bleu">Enregistrer</button></div>
    <div id="e-erreurs"></div>
  </form>`);
  f.onsubmit = (ev) => {
    ev.preventDefault();
    const r = Topo.modifierArret(d, idArret, {
      nom: f.querySelector("#e-nom").value,
      abrev: f.querySelector("#e-abrev").value,
      lieuId: f.querySelector("#e-lieu").value || null,
      lat: f.querySelector("#e-lat").value === "" ? null : Number(f.querySelector("#e-lat").value),
      lng: f.querySelector("#e-lng").value === "" ? null : Number(f.querySelector("#e-lng").value)
    });
    if (r.ok) { core.sauver(); f.closest(".modal-fond").remove(); core.rafraichir(); }
    else {
      const zoneErr = f.querySelector("#e-erreurs");
      zoneErr.replaceChildren(core.h(`<p class="erreur">${(r.erreurs || []).map(e => core.esc(e)).join("<br>")}</p>`));
    }
  };
  f.querySelector("#e-fermer").onclick = () => f.closest(".modal-fond").remove();
  core.modal(f);
}

/* ----- FICHE DE MODIFICATION DE LIEU (V2.3 ; V2.4 : caractéristique) ----- */

/* Suggestions de caractéristiques (cf. GTFS location_type : gare/station,
   entrée, nœud générique…). Champ LIBRE : « Autre » laisse la main. */
const LIEU_CARACTERISTIQUES = ["Gare", "Gare routière", "Passerelle", "Pôle d'échanges",
  "Station de métro", "Arrêt de bus", "Terminus", "Dépôt", "Atelier",
  "Stationnement (P+R)", "Entrée / sortie", "Nœud générique"];

function ficheLieu(d, core, idLieu) {
  const l = d.topo.lieux.find(x => x.id === idLieu);
  if (!l) return;
  const f = core.h(`<form class="panneau-travail">
    <h3>Modifier le lieu — ${core.esc(l.nom)}</h3>
    <label>Nom <input id="l-nom" maxlength="64" required value="${core.esc(l.nom)}"></label>
    <label>Abréviation <input id="l-abrev" maxlength="8" required value="${core.esc(l.abrev)}"></label>
    <label>Caractéristique <input id="l-caract" list="l-caracts" maxlength="32" value="${core.esc(l.caract || "")}" placeholder="Gare, passerelle… (libre)"></label>
    <datalist id="l-caracts">${LIEU_CARACTERISTIQUES.map(c => `<option value="${core.esc(c)}"></option>`).join("")}</datalist>
    <label>Latitude <input id="l-lat" type="number" step="any" value="${l.lat != null ? l.lat : ""}"></label>
    <label>Longitude <input id="l-lng" type="number" step="any" value="${l.lng != null ? l.lng : ""}"></label>
    <div class="actions"><button type="button" class="b-blanc" id="l-fermer">Annuler</button>
    <button type="submit" class="b-bleu">Enregistrer</button></div>
    <div id="l-erreurs"></div>
  </form>`);
  f.onsubmit = (ev) => {
    ev.preventDefault();
    const r = Topo.modifierLieu(d, idLieu, {
      nom: f.querySelector("#l-nom").value,
      abrev: f.querySelector("#l-abrev").value,
      caract: f.querySelector("#l-caract").value,
      lat: f.querySelector("#l-lat").value === "" ? null : Number(f.querySelector("#l-lat").value),
      lng: f.querySelector("#l-lng").value === "" ? null : Number(f.querySelector("#l-lng").value)
    });
    if (r.ok) { core.sauver(); f.closest(".modal-fond").remove(); core.rafraichir(); }
    else {
      const zoneErr = f.querySelector("#l-erreurs");
      zoneErr.replaceChildren(core.h(`<p class="erreur">${(r.erreurs || []).map(e => core.esc(e)).join("<br>")}</p>`));
    }
  };
  f.querySelector("#l-fermer").onclick = () => f.closest(".modal-fond").remove();
  core.modal(f);
}

/* ----- CRÉATION DE LIEU (V2.4 : onglet « 🚉 Lieux ») ----- */

function formulaireLieu(d, core, lat, lng) {
  const f = core.h(`<form class="panneau-travail">
    <h3>Créer un lieu</h3>
    <p class="info-txt">Un lieu est un point du réseau (gare, passerelle, pôle d'échanges…) auquel des arrêts peuvent se rattacher. Ses coordonnées lui appartiennent en propre.</p>
    <label>Nom <input id="c-nom" maxlength="64" required placeholder="Ex. Gare de Rennes"></label>
    <label>Abréviation <input id="c-abrev" maxlength="8" required placeholder="Ex. GAR"></label>
    <label>Caractéristique <input id="c-caract" list="c-caracts" maxlength="32" placeholder="Gare, passerelle… (libre)"></label>
    <datalist id="c-caracts">${LIEU_CARACTERISTIQUES.map(c => `<option value="${core.esc(c)}"></option>`).join("")}</datalist>
    <label>Latitude <input id="c-lat" type="number" step="any" value="${lat != null ? lat : ""}" placeholder="Ex. 48.11"></label>
    <label>Longitude <input id="c-lng" type="number" step="any" value="${lng != null ? lng : ""}" placeholder="Ex. -1.67"></label>
    <div class="actions"><button type="button" class="b-blanc" id="c-fermer">Annuler</button>
    <button type="submit" class="b-bleu">Créer le lieu</button></div>
    <div id="c-erreurs"></div>
  </form>`);
  f.onsubmit = (ev) => {
    ev.preventDefault();
    const r = Topo.creerLieu(d, {
      nom: f.querySelector("#c-nom").value,
      abrev: f.querySelector("#c-abrev").value,
      caract: f.querySelector("#c-caract").value,
      lat: f.querySelector("#c-lat").value === "" ? null : Number(f.querySelector("#c-lat").value),
      lng: f.querySelector("#c-lng").value === "" ? null : Number(f.querySelector("#c-lng").value)
    });
    if (r.ok) {
      core.sauver();
      f.closest(".modal-fond").remove();
      core.rafraichir();
    } else {
      const zoneErr = f.querySelector("#c-erreurs");
      zoneErr.replaceChildren(core.h(`<p class="erreur">${r.erreurs.map(e => core.esc(e)).join("<br>")}</p>`));
    }
  };
  f.querySelector("#c-fermer").onclick = () => f.closest(".modal-fond").remove();
  core.modal(f);
}

/* ----- POP-UP ⚙ DE PARAMÉTRAGE DE LA CARTE ----- */

function popupReglages(d, core) {
  const t = topoEtat();
  const r = t.reglages;
  const f = core.h(`<form class="panneau-travail">
    <h3>⚙ Paramétrage de la carte</h3>
    <h4>Fond de carte</h4>
    <label><input type="radio" name="r-fond" value="plan" ${r.fond !== "relief" ? "checked" : ""}> Plan (Esri)</label>
    <label><input type="radio" name="r-fond" value="relief" ${r.fond === "relief" ? "checked" : ""}> Relief (OpenTopoMap)</label>
    <h4>Couches affichées</h4>
    <label><input type="checkbox" id="r-carrets" ${r.couches.arrets !== false ? "checked" : ""}> Arrêts</label>
    <label><input type="checkbox" id="r-clieux" ${r.couches.lieux ? "checked" : ""}> Lieux (carrés, tous)</label>
    <h4>Étiquettes</h4>
    <label><input type="checkbox" id="r-etiq" ${r.etiquettes ? "checked" : ""}> Afficher le nom à côté des objets</label>
    <div class="actions"><button type="button" class="b-blanc" id="r-fermer">Fermer</button>
    <button type="submit" class="b-bleu">Appliquer</button></div>
  </form>`);
  f.onsubmit = (ev) => {
    ev.preventDefault();
    t.reglages = {
      fond: f.querySelector('input[name="r-fond"]:checked') ? f.querySelector('input[name="r-fond"]:checked').value : "plan",
      couches: { arrets: f.querySelector("#r-carrets").checked, lieux: f.querySelector("#r-clieux").checked },
      etiquettes: f.querySelector("#r-etiq").checked
    };
    TopoCarte.appliquer(t.reglages);
    rafraichirMarqueurs(d, core);
    f.closest(".modal-fond").remove();
    core.rafraichir();
  };
  f.querySelector("#r-fermer").onclick = () => f.closest(".modal-fond").remove();
  core.modal(f);
}


