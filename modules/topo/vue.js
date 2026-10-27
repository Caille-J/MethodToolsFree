/* V2.2 — Module TOPO, partie VUE (affichage uniquement).
   Ergonomie demandée par Jules (V2.2) :
   ① À la place des cartouches statistiques : des FILTRES ACTIFS (puces)
     qui affichent/masquent chaque type d'objet sur la carte ET dans
     l'explorateur, et les rendent sélectionnables (écran Topologie seul).
   ② La bande d'onglets topo = les boutons de la carte : 1er bouton
     « ➕ Créer un arrêt », boutons suivants à venir, et en FIN de bande
     un ⚙ ouvrant le pop-up de paramétrage de la carte.
   ③ Deux compartiments : gauche 1/3 = EXPLORATEUR D'OBJETS (réseaux,
     lignes, arrêts), droite 2/3 = CARTE INTERACTIVE (Leaflet/ESRI).
   Contrat module respecté : la vue ne touche jamais aux données en
   direct, tout passe par la fiche (core) et Topo (données). */
"use strict";

/* État d'affichage du module (non persisté : ce sont des réglages de
   confort, pas des données métier). App.topo est créé une fois. */
function topoEtat() {
  if (!App.topo) App.topo = {
    filtres: { reseaux: true, lignes: true, arrets: true },   // puces actives
    reglages: { fond: "plan", couches: { arrets: true, lieux: false }, etiquettes: true },
    creation: false,        // mode « cliquer la carte pour créer un arrêt »
    selection: null         // id de l'objet sélectionné (explorateur/carte)
  };
  return App.topo;
}

/* La vue du module, branchée par manifeste.js. */
window.Topo.vue = (d, core) => {
  Topo.init(d);
  const t = topoEtat();
  const nbR = d.reseaux.length, nbL = d.lignes.length, nbA = d.topo.arrets.length;

  const racine = core.h(`<div>
    <div class="puces-filtres" id="topo-filtres"></div>
    <div class="onglets" id="topo-onglets"></div>
    <div class="topo-disposition">
      <div class="explorateur panneau-travail" id="topo-explorateur"></div>
      <div class="topo-carte" id="topo-carte-cadre">
        <div id="topo-carte-div"></div>
        <p class="info-txt" id="topo-carte-fallback"></p>
      </div>
    </div>
  </div>`);

  /* ① PUCES DE FILTRES (chips) : cliquer = afficher/masquer un type
     d'objet. Le compteur remplace l'ancienne capsule statistique. */
  const filtres = racine.querySelector("#topo-filtres");
  [["reseaux", "🚌 Réseaux", nbR], ["lignes", "🚏 Lignes", nbL], ["arrets", "📍 Arrêts", nbA]].forEach(([cle, label, n]) => {
    const p = core.h(`<button class="puce ${t.filtres[cle] ? "actif" : ""}">${label} <span class="etiquette">${n}</span></button>`);
    p.onclick = () => { t.filtres[cle] = !t.filtres[cle]; core.rafraichir(); };
    filtres.appendChild(p);
  });

  /* ② BANDE DES BOUTONS DE LA CARTE. */
  const bande = racine.querySelector("#topo-onglets");
  const bCreer = core.h(`<button class="onglet ${t.creation ? "actif" : ""}" title="Créer un arrêt, ou activer le mode « cliquer sur la carte »">➕ Créer un arrêt</button>`);
  bCreer.onclick = () => { t.creation = !t.creation; core.rafraichir(); };
  bande.appendChild(bCreer);
  /* — les boutons suivants (chemins, imports…) s'inséreront ici — */
  const bReglages = core.h(`<button class="onglet" title="Paramétrage de la carte">⚙</button>`);
  bReglages.onclick = () => popupReglages(d, core);
  bande.appendChild(bReglages);

  /* ③ EXPLORATEUR D'OBJETS (gauche) : réseaux, lignes, arrêts —
     filtrés par les puces. Cliquer un arrêt géolocalisé centre la carte
     dessus et le sélectionne ; les coordonnées viennent du lieu porté. */
  dessinerExplorateur(racine.querySelector("#topo-explorateur"), d, core);

  /* CARTE (droite) : initialisation différée — la carte Leaflet ne peut
     être créée qu'une fois la div réellement attachée à la page. */
  setTimeout(() => {
    const ok = TopoCarte.init("topo-carte-div");
    const fb = document.getElementById("topo-carte-fallback");
    if (fb) fb.textContent = ok ? "" :
      "Carte indisponible (bibliothèque non chargée) : l'explorateur et la création d'arrêts restent utilisables.";
    if (ok) {
      TopoCarte.appliquer(t.reglages);
      TopoCarte.clic((lat, lng) => {
        if (t.creation) { t.creation = false; formulaireArret(d, core, lat, lng); core.rafraichir(); }
      });
      rafraichirMarqueurs(d, core);
    }
  }, 0);

  return racine;
};

/* Liste des arrêts VISIBLES (filtre actif) avec les coordonnées de leur
   lieu : c'est ce que la carte affiche et rend sélectionnable. */
function arretsVisibles(d) {
  const t = topoEtat();
  if (!t.filtres.arrets) return [];
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

/* Explorateur : trois sections (réseaux, lignes, arrêts) selon filtres. */
function dessinerExplorateur(cible, d, core) {
  const t = topoEtat();
  const lieux = new Map(d.topo.lieux.map(l => [l.id, l]));
  cible.appendChild(core.h(`<p class="info-txt">Explorateur d'objets — cliquez un élément pour le sélectionner ; un arrêt géolocalisé recentre la carte.</p>`));

  if (t.filtres.reseaux) {
    cible.appendChild(core.h(`<h4>🚌 Réseaux</h4>`));
    if (!d.reseaux.length) cible.appendChild(core.h(`<p class="info-txt">Aucun réseau.</p>`));
    d.reseaux.forEach(r => {
      const b = core.h(`<div class="item-objet ${t.selection === r.id ? "sel" : ""}">${core.esc(r.nom)}</div>`);
      b.onclick = () => { t.selection = r.id; core.rafraichir(); };
      cible.appendChild(b);
    });
  }
  if (t.filtres.lignes) {
    cible.appendChild(core.h(`<h4>🚏 Lignes</h4>`));
    if (!d.lignes.length) cible.appendChild(core.h(`<p class="info-txt">Aucune ligne.</p>`));
    d.lignes.forEach(l => {
      const b = core.h(`<div class="item-objet ${t.selection === l.id ? "sel" : ""}">${core.esc(l.abrev)} — ${core.esc(l.nom)}</div>`);
      b.onclick = () => { t.selection = l.id; core.rafraichir(); };
      cible.appendChild(b);
    });
  }
  if (t.filtres.arrets) {
    cible.appendChild(core.h(`<h4>📍 Arrêts</h4>`));
    if (!d.topo.arrets.length) cible.appendChild(core.h(`<p class="info-txt">Aucun arrêt — cliquez « ➕ Créer un arrêt ».</p>`));
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
}

/* Fenêtre de création d'arrêt (modale, même famille que les lignes V1).
   Par défaut : nouveau lieu automatique (même nom, mêmes coordonnées).
   On peut aussi rattacher l'arrêt à un lieu existant dans la liste. */
function formulaireArret(d, core, lat, lng) {
  const t = topoEtat();
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

/* Pop-up ⚙ : paramétrage affectant directement la carte — fond de carte,
   couches affichées, étiquettes à côté des objets. */
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