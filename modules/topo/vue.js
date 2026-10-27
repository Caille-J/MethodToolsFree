/* V2.2.2 — Module TOPO, partie VUE (affichage uniquement).
   Nouveautés demandées par Jules (V2.2.2) :
   ① Les cartouches de filtre sont PLUS GROSSES, arrondies en pilule, avec
     une LOUPE 🔍 à droite de chaque bulle + un libellé « 🔎 Filtrer : »
     devant : on comprend d'un coup d'œil que ce sont des filtres.
   ② Un filtre sélectionné MASQUE les objets exclus de l'explorateur
     (ils ne sont plus seulement grisés : ils disparaissent).
   ③ Tout objet géolocalisé visible dans l'explorateur apparaît AUSSI sur
     la carte : les arrêts (épingles) ET les lieux sans arrêt rattaché
     (points gris). Les réseaux/lignes n'ont pas de position GPS : ils ne
     peuvent figurer que dans l'explorateur (le lien arrêt↔ligne vient
     avec les chemins V2.3).
   ④ « ➕ Créer un arrêt » arme le mode création (bouton vert) puis CHAQUE
     clic sur la carte ouvre la fenêtre pré-remplie des coordonnées ;
     un bandeau orange rappelle que le mode est armé. (Le vrai bug « rien
     ne se passe » venait du z-index de .modal-fond, corrigé côté CSS.)
   Contrat module : la vue ne touche jamais aux données en direct. */
"use strict";

/* État d'affichage du module (réglages de confort, non persistés). */
function topoEtat() {
  if (!App.topo) App.topo = {
    filtres: { reseaux: [], lignes: [], groupes: [] },   // [] = tout afficher
    reglages: { fond: "plan", couches: { arrets: true, lieux: false }, etiquettes: true },
    creation: false,      // bouton « Créer un arrêt » armé ?
    popover: null,        // cartouche dont la liste est ouverte ("reseaux"…)
    selection: null        // id de l'objet sélectionné (explorateur/carte)
  };
  return App.topo;
}

/* ----- CASCADE DE FILTRES ----- */

/* Lignes visibles selon les réseaux ET groupes sélectionnés. */
function lignesAffichables(d, t) {
  const f = t.filtres;
  let ls = d.lignes;
  if (f.reseaux.length) ls = ls.filter(l => f.reseaux.includes(l.reseauId));
  if (f.groupes.length) ls = ls.filter(l => f.groupes.includes(l.groupe));
  return ls;
}

/* Groupes présents dans les lignes des réseaux sélectionnés. */
function groupesAffichables(d, t) {
  const f = t.filtres;
  let ls = d.lignes;
  if (f.reseaux.length) ls = ls.filter(l => f.reseaux.includes(l.reseauId));
  return [...new Set(ls.map(l => l.groupe).filter(g => g))];
}

/* Après chaque changement : retire les sélections devenues hors cascade
   (ex. une ligne décochée car son réseau vient d'être retiré). */
function harmoniserFiltres(d, t) {
  t.filtres.lignes = t.filtres.lignes.filter(id => lignesAffichables(d, t).some(l => l.id === id));
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

/* Objets à afficher sur la carte : les arrêts (épingles, avec les
   coordonnées de leur lieu) ET les lieux sans aucun arrêt rattaché
   (points gris) — tout ce qui est géolocalisé, comme l'explorateur. */
function objetsCarte(d) {
  const lieux = new Map(d.topo.lieux.map(l => [l.id, l]));
  const utilises = new Set(d.topo.arrets.map(a => a.lieuId).filter(Boolean));
  const arrets = d.topo.arrets.map(a => {
    const l = lieux.get(a.lieuId) || {};
    return { id: a.id, nom: a.nom, abrev: a.abrev, lat: l.lat == null ? null : l.lat, lng: l.lng == null ? null : l.lng };
  });
  const lieuxLibres = d.topo.lieux
    .filter(l => !utilises.has(l.id) && l.lat != null && l.lng != null)
    .map(l => ({ id: l.id, nom: l.nom, abrev: l.abrev, lat: l.lat, lng: l.lng }));
  return { arrets, lieuxLibres };
}

function rafraichirMarqueurs(d, core) {
  const t = topoEtat();
  const o = objetsCarte(d);
  TopoCarte.majArrets(o.arrets, {
    etiquettes: t.reglages.etiquettes,
    lieuxLibres: o.lieuxLibres,                    // lieux sans arrêt : points gris
    selection: (a) => { t.selection = a.id; core.rafraichir(); }
  });
}

/* ----- CARTOUCHES DE FILTRE ----- */

function dessinerCartouches(zone, d, core, t) {
  /* Libellé explicite : on comprend que ces bulles sont des FILTRES. */
  zone.appendChild(core.h(`<span class="filtres-libelle">🔎 Filtrer :</span>`));
  [["reseaux", "🚌 Réseaux"], ["lignes", "🚏 Lignes"], ["groupes", "🗂️ Groupes de lignes"]].forEach(([cle, label]) => {
    const nb = t.filtres[cle].length;
    const b = core.h(`<button class="cartouche ${nb ? "actif" : ""}" title="Filtrer par ${label.slice(2)} — cliquez pour choisir">${label}${nb ? ` <span class="etiquette">${nb}</span>` : ""}<span class="loupe">🔍</span></button>`);
    b.onclick = () => { t.popover = (t.popover === cle) ? null : cle; core.rafraichir(); };
    zone.appendChild(b);
  });
  if (t.popover) zone.appendChild(popoverFiltre(d, core, t, t.popover));
}

/* Items d'une cartouche, déjà restreints par la cascade. */
function itemsFiltre(d, t, cle) {
  if (cle === "reseaux") return d.reseaux.map(r => ({ cle: r.id, label: r.nom }));
  if (cle === "lignes") return lignesAffichables(d, t).map(l => ({ cle: l.id, label: l.abrev + " — " + l.nom }));
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
  /* Mode création armé : un bandeau orange rappelle quoi faire ensuite
     (c'est l'arme anti « le bouton ne marche pas » : le bouton ARME,
     la création se fait en cliquant sur la CARTE). */
  if (t.creation) bande.appendChild(core.h(`<span class="etiquette alerte">Mode création armé : cliquez sur la carte où créer l'arrêt</span>`));
  /* — les boutons suivants (chemins, imports…) s'inséreront ici — */
  const bReglages = core.h(`<button class="onglet" title="Paramétrage de la carte">⚙</button>`);
  bReglages.onclick = () => popupReglages(d, core);
  bande.appendChild(bReglages);
}

/* ----- EXPLORATEUR D'OBJETS (gauche) ----- */

function dessinerExplorateur(cible, d, core) {
  const t = topoEtat();
  const f = t.filtres;
  const lieux = new Map(d.topo.lieux.map(l => [l.id, l]));
  cible.appendChild(core.h(`<p class="info-txt">Explorateur — les objets exclus par les filtres sont masqués ; cliquer un arrêt géolocalisé recentre la carte.</p>`));

  /* Réseaux : un filtre Réseaux actif MASQUE les réseaux non cochés. */
  cible.appendChild(core.h(`<h4>🚌 Réseaux</h4>`));
  const reseauxVisibles = d.reseaux.filter(r => !f.reseaux.length || f.reseaux.includes(r.id));
  if (!d.reseaux.length) cible.appendChild(core.h(`<p class="info-txt">Aucun réseau.</p>`));
  else if (!reseauxVisibles.length) cible.appendChild(core.h(`<p class="info-txt">Tous les réseaux sont masqués par les filtres.</p>`));
  reseauxVisibles.forEach(r => {
    const b = core.h(`<div class="item-objet ${t.selection === r.id ? "sel" : ""}">${core.esc(r.nom)}</div>`);
    b.onclick = () => { t.selection = r.id; core.rafraichir(); };
    cible.appendChild(b);
  });

  /* Lignes : masquées si leur réseau, leur groupe ou elles-mêmes sont
     exclus par les filtres. */
  cible.appendChild(core.h(`<h4>🚏 Lignes</h4>`));
  const lignesVisibles = d.lignes.filter(l =>
    (!f.reseaux.length || f.reseaux.includes(l.reseauId))
    && (!f.groupes.length || f.groupes.includes(l.groupe))
    && (!f.lignes.length || f.lignes.includes(l.id)));
  if (!d.lignes.length) cible.appendChild(core.h(`<p class="info-txt">Aucune ligne.</p>`));
  else if (!lignesVisibles.length) cible.appendChild(core.h(`<p class="info-txt">Toutes les lignes sont masquées par les filtres.</p>`));
  lignesVisibles.forEach(l => {
    const b = core.h(`<div class="item-objet ${t.selection === l.id ? "sel" : ""}">${core.esc(l.abrev)} — ${core.esc(l.nom)}</div>`);
    b.onclick = () => { t.selection = l.id; core.rafraichir(); };
    cible.appendChild(b);
  });

  /* Arrêts : tous visibles (aucun lien arrêt↔ligne encore : le filtrage
     des arrêts arrivera avec les chemins V2.3). Les lieux sans arrêt
     rattaché apparaissent aussi (ils sont sur la carte en gris). */
  cible.appendChild(core.h(`<h4>📍 Arrêts</h4>`));
  if (!d.topo.arrets.length && !d.topo.lieux.length) cible.appendChild(core.h(`<p class="info-txt">Aucun arrêt — armez « ➕ Créer un arrêt » puis cliquez sur la carte.</p>`));
  d.topo.arrets.forEach(a => {
    const l = lieux.get(a.lieuId) || {};
    const sansGps = (l.lat == null || l.lng == null);
    const b = core.h(`<div class="item-objet ${t.selection === a.id ? "sel" : ""}">${core.esc(a.nom)} <small>(${core.esc(a.abrev)})</small>${sansGps ? ' <span class="etiquette alerte">⚠ GPS</span>' : ""}</div>`);
    b.onclick = () => {
      t.selection = a.id;
      if (!sansGps) TopoCarte.centrer(l.lat, l.lng);
      core.rafraichir();
    };
    cible.appendChild(b);
  });
  const utilises = new Set(d.topo.arrets.map(a => a.lieuId).filter(Boolean));
  const libres = d.topo.lieux.filter(l => !utilises.has(l.id));
  if (libres.length) {
    cible.appendChild(core.h(`<h4>📍 Lieux sans arrêt</h4>`));
    libres.forEach(l => {
      const sansGps = (l.lat == null || l.lng == null);
      const b = core.h(`<div class="item-objet ${t.selection === l.id ? "sel" : ""}">${core.esc(l.nom)} <small>(${core.esc(l.abrev)})</small>${sansGps ? ' <span class="etiquette alerte">⚠ GPS</span>' : ""}</div>`);
      b.onclick = () => {
        t.selection = l.id;
        if (!sansGps) TopoCarte.centrer(l.lat, l.lng);
        core.rafraichir();
      };
      cible.appendChild(b);
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
    <label><input type="checkbox" id="r-clieux" ${r.couches.lieux ? "checked" : ""}> Lieux (tous)</label>
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