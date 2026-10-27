/* V2.2.1 — Module TOPO, partie VUE (affichage uniquement).
   Ergonomie demandée par Jules (corrections V2.2.1) :
   ① TROIS CARTOUCHES de filtre : 🚌 Réseaux, 🚏 Lignes, 🗂️ Groupes de
     lignes. Cliquer une cartouche ouvre sa liste : cases à cocher
     multiples + champ de recherche + bouton « Tout afficher ». Les
     filtres sont CUMULATIFS et en CASCADE : si des réseaux sont
     sélectionnés, la cartouche Lignes ne propose QUE leurs lignes.
   ② Un écart net entre la bande de boutons et les compartiments.
   ③ Tout tient sur une page sans défilement (hauteur calculée sur la
     fenêtre) ; les listes défilent À L'INTÉRIEUR de leur cadre.
   ④ Compartiments plein écran (largeur totale utilisée).
   ⑤ « ➕ Créer un arrêt » : le bouton change de couleur (armé) et
     ENSUITE chaque clic sur la carte ouvre la fenêtre de création
     pré-remplie des coordonnées — le bouton reste armé jusqu'à ce
     qu'on le reclique.
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

/* Liste des arrêts avec les coordonnées de leur lieu (ce que la carte
   affiche et rend sélectionnable). */
function arretsVisibles(d) {
  const lieux = new Map(d.topo.lieux.map(l => [l.id, l]));
  return d.topo.arrets.map(a => {
    const l = lieux.get(a.lieuId) || {};
    return { id: a.id, nom: a.nom, abrev: a.abrev, lat: l.lat == null ? null : l.lat, lng: l.lng == null ? null : l.lng };
  });
}

function rafraichirMarqueurs(d, core) {
  const t = topoEtat();
  TopoCarte.majArrets(arretsVisibles(d), {
    etiquettes: t.reglages.etiquettes,
    selection: (a) => { t.selection = a.id; core.rafraichir(); }
  });
}

/* ----- CARTOUCHES DE FILTRE ----- */

function dessinerCartouches(zone, d, core, t) {
  [["reseaux", "🚌 Réseaux"], ["lignes", "🚏 Lignes"], ["groupes", "🗂️ Groupes de lignes"]].forEach(([cle, label]) => {
    const nb = t.filtres[cle].length;
    const b = core.h(`<button class="cartouche ${nb ? "actif" : ""}" title="Filtrer — cliquez pour choisir">${label}${nb ? ` <span class="etiquette">${nb}</span>` : ""}</button>`);
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
  cible.appendChild(core.h(`<p class="info-txt">Explorateur — les objets exclus par les cartouches sont grisés ; cliquer un arrêt géolocalisé recentre la carte.</p>`));

  cible.appendChild(core.h(`<h4>🚌 Réseaux</h4>`));
  if (!d.reseaux.length) cible.appendChild(core.h(`<p class="info-txt">Aucun réseau.</p>`));
  d.reseaux.forEach(r => {
    const exclus = f.reseaux.length && !f.reseaux.includes(r.id);
    const b = core.h(`<div class="item-objet ${exclus ? "grise" : ""} ${t.selection === r.id ? "sel" : ""}">${core.esc(r.nom)}</div>`);
    b.onclick = () => { t.selection = r.id; core.rafraichir(); };
    cible.appendChild(b);
  });

  cible.appendChild(core.h(`<h4>🚏 Lignes</h4>`));
  if (!d.lignes.length) cible.appendChild(core.h(`<p class="info-txt">Aucune ligne.</p>`));
  d.lignes.forEach(l => {
    const exclus = (f.reseaux.length && !f.reseaux.includes(l.reseauId))
      || (f.groupes.length && !f.groupes.includes(l.groupe))
      || (f.lignes.length && !f.lignes.includes(l.id));
    const b = core.h(`<div class="item-objet ${exclus ? "grise" : ""} ${t.selection === l.id ? "sel" : ""}">${core.esc(l.abrev)} — ${core.esc(l.nom)}</div>`);
    b.onclick = () => { t.selection = l.id; core.rafraichir(); };
    cible.appendChild(b);
  });

  cible.appendChild(core.h(`<h4>📍 Arrêts</h4>`));
  if (!d.topo.arrets.length) cible.appendChild(core.h(`<p class="info-txt">Aucun arrêt — armez « ➕ Créer un arrêt » puis cliquez sur la carte.</p>`));
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