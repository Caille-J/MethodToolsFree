/* V2.3 — Module TOPO, partie TABLEAU DES ARRÊTS.
   Vue « 📍 Arrêts » de la sous-navigation « Définition réseau » (onglet
   ajouté dans index.html, qui appelle Topo.vueArrets). Elle reprend
   l'ergonomie du tableau de gestion des lignes :
   - ⚙ Colonnes (choix + ordre, mémorisé par instance) ;
   - 📋 Copier (Excel) : TSV Abrév / Nom / Lieu / Latitude / Longitude ;
   - 📥 Importer : fichier ou collage (clé = l'abréviation de l'arrêt ;
     le lieu est reconnu par SON abréviation, sinon créé) ;
   - barre de recherche, bouton « + Créer un arrêt », ✎/🗑 par ligne,
     double-clic = fiche de modification ;
   - PLEIN ÉCRAN : le tableau défile à L'INTÉRIEUR de son cadre
     (.tableau-page), aucune barre de défilement de page.
   Chargé après vue.js (utilise formulaireArret et ficheArret). */
"use strict";

/* Colonnes du tableau des arrêts. "id" est FIXE. V2.4 : lat/lng sont
   les coordonnées PROPRES de l'arrêt (indépendantes de son lieu). */
const ARRET_COLONNES = [
  { cle: "id", label: "ID unique", fixe: true },
  { cle: "abrev", label: "Abrév." },
  { cle: "nom", label: "Nom" },
  { cle: "lieu", label: "Lieu" },
  { cle: "lat", label: "Latitude" },
  { cle: "lng", label: "Longitude" },
  { cle: "gps", label: "GPS" }
];

window.Topo.vueArrets = (d, core) => {
  Topo.init(d);
  const prefCle = "hastus_colonnes_arrets_" + (App.instanceOuverte ? App.instanceOuverte.id : "?");
  const lieuDe = (a) => d.topo.lieux.find(l => l.id === a.lieuId) || {};
  const valCol = (a, cle) => {
    if (cle === "lieu") return lieuDe(a).nom || "—";
    if (cle === "lat") return a.lat != null ? a.lat : "";
    if (cle === "lng") return a.lng != null ? a.lng : "";
    if (cle === "gps") return (a.lat != null && a.lng != null) ? "✓" : "⚠";
    if (cle === "id") return a.id;
    return a[cle] || "";
  };
  /* Préférences de colonnes (mémorisées par instance, comme les lignes). */
  let colonnesChoisies;
  try {
    const p = JSON.parse(localStorage.getItem(prefCle) || "null");
    colonnesChoisies = Array.isArray(p) && p.length ? p : ["abrev", "nom", "lieu", "lat", "lng", "gps"];
  } catch (e) { colonnesChoisies = ["abrev", "nom", "lieu", "lat", "lng", "gps"]; }
  if (!App.barreArrets) App.barreArrets = { q: "" };
  const q = String(App.barreArrets.q || "").trim().toLowerCase();

  /* Filtrage : recherche sur abréviation, nom et lieu. */
  const visibles = d.topo.arrets.filter(a => {
    if (!q) return true;
    return (a.abrev + " " + a.nom + " " + (lieuDe(a).nom || "")).toLowerCase().includes(q);
  });

  const cles = ["id", ...colonnesChoisies];
  const cols = cles.map(cle => ARRET_COLONNES.find(c => c.cle === cle)).filter(Boolean);

  const racine = core.h(`<div class="carte panneau-travail tableau-page">
    <div class="barre-outils">
      <div class="titre">Tableau de gestion des arrêts</div>
      <div class="actions">
        <span class="menu-col"><button id="ar-col">⚙ Colonnes</button></span>
        <button id="ar-copy">📋 Copier (Excel)</button>
        <button id="ar-masse">📥 Importer</button>
      </div>
    </div>
    <div class="barre-filtres" style="grid-template-columns:2fr 1fr;">
      <div class="champ"><label>Recherche</label>
        <input id="ar-q" value="${core.esc(App.barreArrets.q)}" placeholder="Abréviation, nom, lieu…"/></div>
      <div class="champ"><label>&nbsp;</label>
        <button id="ar-nouv" class="b-bleu" style="width:100%;">+ Créer un arrêt</button></div>
    </div>
    <div class="enveloppe-table"><table>
      <thead><tr>${cols.map(c => `<th>${core.esc(c.label)}${c.cle === "gps" ? " (⚠ = à géolocaliser)" : ""}</th>`).join("")}<th style="text-align:right;">Actions</th></tr></thead>
      <tbody id="ar-corps"></tbody>
    </table></div>
    <p class="info-txt" id="ar-compte" style="margin-top:8px;"></p>
  </div>`);

  /* Recherche : saisie en direct + focus rendu au champ. */
  racine.querySelector("#ar-q").oninput = (e) => {
    App.barreArrets.q = e.target.value; core.rafraichir();
    const cible = document.getElementById("ar-q");
    if (cible) { cible.focus(); cible.setSelectionRange(cible.value.length, cible.value.length); }
  };
  racine.querySelector("#ar-nouv").onclick = () => formulaireArret(d, core, null, null);

  /* Corps du tableau : une seule écriture + événements délégués
     (même optimisation que le tableau des lignes). */
  const corps = racine.querySelector("#ar-corps");
  corps.innerHTML = visibles.map(a =>
    `<tr data-id="${core.esc(a.id)}">` + cols.map(c =>
      `<td>${core.esc(String(valCol(a, c.cle)))}</td>`).join("")
    + `<td style="text-align:right;"><button class="ico" data-act="mod" data-id="${core.esc(a.id)}" title="Modifier">✎</button><button class="ico suppr" data-act="sup" data-id="${core.esc(a.id)}" title="Supprimer">🗑</button></td></tr>`
  ).join("") + (!visibles.length
    ? `<tr><td colspan="${cols.length + 1}" style="text-align:center;color:#64748b;">${d.topo.arrets.length ? "Aucun arrêt ne correspond à la recherche." : "Aucun arrêt — cliquez « + Créer un arrêt »."}</td></tr>` : "");
  corps.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    if (b.dataset.act === "mod") return ficheArret(d, core, b.dataset.id);
    /* Suppression : double confirmation (1er clic arme 3 s, 2e supprime). */
    if (b.classList.contains("armed")) {
      Topo.supprimerArret(d, b.dataset.id);
      core.sauver(); core.rafraichir(); return;
    }
    b.classList.add("armed"); b.textContent = "Confirmer ?";
    setTimeout(() => { if (b.isConnected) { b.classList.remove("armed"); b.textContent = "🗑"; } }, 3000);
  });
  corps.addEventListener("dblclick", (e) => {
    if (e.target.closest("button")) return;
    const tr = e.target.closest("tr");
    if (tr && tr.dataset.id) ficheArret(d, core, tr.dataset.id);
  });
  racine.querySelector("#ar-compte").textContent =
    `${visibles.length} arrêt(s) affiché(s) sur ${d.topo.arrets.length}` +
    (q ? ` — recherche « ${App.barreArrets.q} »` : "");

  /* ⚙ Colonnes : choix + ordre, mémorisé par instance (simplifié, comme
     le tableau des lignes). */
  racine.querySelector("#ar-col").onclick = () => {
    const ancien = racine.querySelector(".panneau");
    if (ancien) { ancien.remove(); return; }
    let travail = [...colonnesChoisies];
    ARRET_COLONNES.forEach(c => { if (!c.fixe && !travail.includes(c.cle)) travail.push(c.cle); });
    const cochees = new Set(colonnesChoisies);
    const pan = core.h(`<div class="panneau" style="width:320px;">
      <b style="font-size:13px;">Colonnes affichées</b>
      <p class="info-txt" style="margin:2px 0 6px;">↑ ↓ réordonner · cocher/décocher · « Appliquer » enregistre.</p>
      <div id="arp-liste" style="max-height:240px;overflow-y:auto;"></div>
      <div class="ligne-boutons" style="margin:6px 0 0;">
        <button id="arp-ann">✕ Fermer</button><button id="arp-ok" class="b-bleu">Appliquer</button>
      </div>
    </div>`);
    const dessiner = () => {
      const box = pan.querySelector("#arp-liste");
      box.innerHTML = "";
      travail.forEach((cle, i) => {
        const col = ARRET_COLONNES.find(c => c.cle === cle);
        const l = core.h(`<label class="p-ligne">
          <input type="checkbox" ${cochees.has(cle) || col.fixe ? "checked" : ""} ${col.fixe ? "disabled" : ""}/>
          <span>${core.esc(col.label)}${col.fixe ? ' <span class="etiquette">fixe</span>' : ""}</span>
          <button title="Monter" ${i === 0 ? "disabled" : ""}>↑</button>
          <button title="Descendre" ${i === travail.length - 1 ? "disabled" : ""}>↓</button>
        </label>`);
        const cb = l.querySelector("input");
        cb.onchange = () => cb.checked ? cochees.add(cle) : cochees.delete(cle);
        const [haut, bas] = l.querySelectorAll("button");
        haut.onclick = () => { travail.splice(i, 1); travail.splice(i - 1, 0, cle); dessiner(); };
        bas.onclick = () => { travail.splice(i, 1); travail.splice(i + 1, 0, cle); dessiner(); };
        box.appendChild(l);
      });
    };
    dessiner();
    pan.querySelector("#arp-ann").onclick = () => pan.remove();
    pan.querySelector("#arp-ok").onclick = () => {
      colonnesChoisies = travail.filter(cle => cochees.has(cle));
      localStorage.setItem(prefCle, JSON.stringify(colonnesChoisies));
      core.rafraichir();
    };
    racine.querySelector("#ar-col").parentElement.appendChild(pan);
  };

  /* 📋 Copier (Excel) : TSV complet (toutes les colonnes utiles). */
  racine.querySelector("#ar-copy").onclick = () => {
    const tsv = ["Abrév\tNom\tLieu\tLatitude\tLongitude"].concat(
      d.topo.arrets.map(a => [a.abrev, a.nom, lieuDe(a).nom || "", a.lat != null ? a.lat : "", a.lng != null ? a.lng : ""].join("\t"))
    ).join("\n");
    navigator.clipboard?.writeText(tsv);
    const info = core.h(`<div>
      <h2>📋 Copié pour Excel</h2>
      <p class="info-txt">Les ${d.topo.arrets.length} arrêt(s) sont dans le presse-papiers : collez-les dans Excel avec Ctrl+V.</p>
      <div class="ligne-boutons"><button id="c-ok" class="b-bleu">Fermer</button></div>
    </div>`);
    info.querySelector("#c-ok").onclick = () => info.closest(".modal-fond").remove();
    core.modal(info);
  };

  /* 📥 Importer : fichier ou collage, clé = abréviation de l'ARRÊT.
     Colonnes : Abrév, Nom, Lieu (abréviation du lieu), Latitude, Longitude.
     - arrêt existant → mise à jour (nom, lieu, coordonnées) ;
     - arrêt nouveau → création ; lieu reconnu par son abréviation, sinon
       créé automatiquement (badge ⚠ GPS si sans coordonnées). */
  racine.querySelector("#ar-masse").onclick = () => {
    const form = core.h(`<div style="min-width:700px;max-width:95vw;">
      <h2>Importer des arrêts</h2>
      <p class="info-txt">Colonnes : <b>Abrév* — Nom* — Lieu (abréviation) — Latitude — Longitude</b> (* = obligatoire).
        La clé est l'abréviation de l'ARRÊT : existante → mise à jour, nouvelle → création.
        Le lieu est reconnu par sa propre abréviation ; inconnu, il est créé.</p>
      <div class="champ"><label>📂 Fichier du PC (CSV ou texte exporté d'Excel)</label>
        <input type="file" id="ai-fichier" accept=".csv,.txt,.tsv"/></div>
      <div class="champ"><label>…ou collez les lignes ici (depuis Excel : Ctrl+C puis Ctrl+V)</label>
        <textarea id="ai-texte" rows="5" placeholder="Abrév&#9;Nom&#9;Lieu&#9;Latitude&#9;Longitude"></textarea></div>
      <div class="ligne-boutons"><button id="ai-ann">Annuler</button>
        <button id="ai-prev" class="b-bleu">Prévisualiser l'import</button></div>
    </div>`);
    core.modal(form, true);
    form.querySelector("#ai-ann").onclick = () => form.closest(".modal-fond").remove();
    form.querySelector("#ai-prev").onclick = () => {
      const fichier = form.querySelector("#ai-fichier").files[0];
      if (fichier) {
        const lecteur = new FileReader();
        lecteur.onload = () => preparer(String(lecteur.result));
        lecteur.readAsText(fichier);
      } else {
        const texte = form.querySelector("#ai-texte").value;
        if (!texte.trim()) { alert("Choisissez un fichier ou collez des lignes."); return; }
        preparer(texte);
      }
    };
    /* Analyse sur une COPIE des données : rien n'est modifié avant
       l'import confirmé (même principe que l'import des lignes). */
    function preparer(texte) {
      const dCopie = JSON.parse(JSON.stringify(d));
      const plan = { maj: 0, crees: 0, ignorees: 0, erreurs: [] };
      texte.trim().split(/\r?\n/).filter(r => r.trim()).forEach((row, idx) => {
        const c = row.split(/\t|;/);
        if (idx === 0 && /^abr/i.test((c[0] || "").trim())) return;   // ligne d'en-tête ignorée.
        const abrev = (c[0] || "").trim(), nom = (c[1] || "").trim();
        const abrevLieu = (c[2] || "").trim();
        const lat = c[3] === undefined || (c[3] || "").trim() === "" ? null : Number(c[3]);
        const lng = c[4] === undefined || (c[4] || "").trim() === "" ? null : Number(c[4]);
        if (!abrev || !nom) { plan.ignorees++; return; }
        /* Lieu : reconnu par son abréviation, sinon créé. */
        let lieuId = null;
        if (abrevLieu) {
          const l = dCopie.topo.lieux.find(x => (x.abrev || "").toLowerCase() === abrevLieu.toLowerCase());
          if (l) lieuId = l.id;
          else {
            const rl = Topo.creerLieu(dCopie, { nom: abrevLieu, abrev: abrevLieu, lat: lat, lng: lng });
            if (rl.ok) lieuId = dCopie.topo.lieux[dCopie.topo.lieux.length - 1].id;
            else plan.erreurs.push(abrev + " : " + (rl.erreurs || []).join(" "));
          }
        }
        const existant = dCopie.topo.arrets.find(x => (x.abrev || "").toLowerCase() === abrev.toLowerCase());
        if (existant) {
          const rm = Topo.modifierArret(dCopie, existant.id, { nom, abrev, lieuId: lieuId || existant.lieuId, lat, lng });
          if (rm.ok) plan.maj++; else plan.erreurs.push(abrev + " : " + (rm.erreurs || []).join(" "));
        } else {
          const rc = Topo.creerArret(dCopie, { nom, abrev, lat, lng, lieuId });
          if (rc.ok) plan.crees++; else plan.erreurs.push(abrev + " : " + (rc.erreurs || []).join(" "));
        }
      });
      /* Prévisualisation : l'import réel rejoue le même plan sur les
         vraies données (aucun risque de divergence). */
      const apercu = core.h(`<div style="min-width:700px;max-width:95vw;">
        <h2>Prévisualisation de l'import</h2>
        <p class="info-txt"><span class="etiquette" style="background:#dcfce7;border-color:#86efac;color:#166534;">${plan.crees} création(s)</span>
          <span class="etiquette" style="background:#ffedd5;border-color:#fdba74;color:#9a3412;">${plan.maj} mise(s) à jour</span>
          <span class="etiquette">${plan.ignorees} ignorée(s)</span></p>
        ${plan.erreurs.length ? `<p class="erreur">${plan.erreurs.slice(0, 8).map(core.esc).join("<br>")}${plan.erreurs.length > 8 ? "…" : ""}</p>` : ""}
        <div class="ligne-boutons"><button id="ai-ann2">Annuler</button>
          <button id="ai-ok" class="b-vert" ${plan.crees + plan.maj === 0 ? "disabled" : ""}>Importer ${plan.crees + plan.maj} arrêt(s)</button></div>
      </div>`);
      core.modal(apercu, true);
      apercu.querySelector("#ai-ann2").onclick = () => apercu.closest(".modal-fond").remove();
      apercu.querySelector("#ai-ok").onclick = () => {
        /* Import réel : rejoue exactement la même analyse sur les vraies
           données (sur la copie : on recolle le même texte). */
        preparerReel(texte);
        function preparerReel(texte2) {
          texte2.trim().split(/\r?\n/).filter(r => r.trim()).forEach((row, idx) => {
            const c = row.split(/\t|;/);
            if (idx === 0 && /^abr/i.test((c[0] || "").trim())) return;
            const abrev = (c[0] || "").trim(), nom = (c[1] || "").trim();
            const abrevLieu = (c[2] || "").trim();
            const lat = c[3] === undefined || (c[3] || "").trim() === "" ? null : Number(c[3]);
            const lng = c[4] === undefined || (c[4] || "").trim() === "" ? null : Number(c[4]);
            if (!abrev || !nom) return;
            let lieuId = null;
            if (abrevLieu) {
              const l = d.topo.lieux.find(x => (x.abrev || "").toLowerCase() === abrevLieu.toLowerCase());
              if (l) lieuId = l.id;
              else {
                const rl = Topo.creerLieu(d, { nom: abrevLieu, abrev: abrevLieu, lat, lng });
                if (rl.ok) lieuId = d.topo.lieux[d.topo.lieux.length - 1].id;
              }
            }
            const existant = d.topo.arrets.find(x => (x.abrev || "").toLowerCase() === abrev.toLowerCase());
            if (existant) { const m = { nom, abrev, lieuId: lieuId || existant.lieuId }; if (lat != null) m.lat = lat; if (lng != null) m.lng = lng; Topo.modifierArret(d, existant.id, m); }
            else Topo.creerArret(d, { nom, abrev, lat, lng, lieuId });
          });
        }
        core.sauver();
        apercu.closest(".modal-fond").remove();
        form.closest(".modal-fond").remove();
        core.rafraichir();
        alert(`Import terminé : ${plan.crees} création(s), ${plan.maj} mise(s) à jour, ${plan.ignorees} ignorée(s).`);
      };
    }
  };

  return racine;
};



/* ================================================================
   V2.4 — TABLEAU DES LIEUX (onglet « 🚉 Lieux », même ergonomie que
   les arrêts : recherche, création, ✎/🗑, double-clic = fiche,
   📋 Copier (Excel), 📥 Importer clé = abréviation du LIEU).
   Colonnes FIXES (pas de ⚙ Colonnes pour garder la vue simple).
   La CARACTÉRISTIQUE (gare, passerelle… cf. GTFS) est un champ libre
   avec suggestions (datalist de vue.js).
   ================================================================ */

window.Topo.vueLieux = (d, core) => {
  Topo.init(d);
  if (!App.barreLieux) App.barreLieux = { q: "" };
  const q = String(App.barreLieux.q || "").trim().toLowerCase();
  const nbArretsParLieu = new Map();
  d.topo.arrets.forEach(a => { if (a.lieuId) nbArretsParLieu.set(a.lieuId, (nbArretsParLieu.get(a.lieuId) || 0) + 1); });

  /* Filtrage : recherche sur abréviation, nom et caractéristique. */
  const visibles = d.topo.lieux.filter(l => {
    if (!q) return true;
    return ((l.abrev || "") + " " + (l.nom || "") + " " + (l.caract || "")).toLowerCase().includes(q);
  });

  const racine = core.h(`<div class="carte panneau-travail tableau-page">
    <div class="barre-outils">
      <div class="titre">Tableau de gestion des lieux</div>
      <div class="actions">
        <button id="li-copy">📋 Copier (Excel)</button>
        <button id="li-masse">📥 Importer</button>
      </div>
    </div>
    <div class="barre-filtres" style="grid-template-columns:2fr 1fr;">
      <div class="champ"><label>Recherche</label>
        <input id="li-q" value="${core.esc(App.barreLieux.q)}" placeholder="Abréviation, nom, caractéristique…"/></div>
      <div class="champ"><label>&nbsp;</label>
        <button id="li-nouv" class="b-bleu" style="width:100%;">+ Créer un lieu</button></div>
    </div>
    <div class="enveloppe-table"><table>
      <thead><tr><th>ID unique</th><th>Abrév.</th><th>Nom</th><th>Caractéristique</th>
      <th>Latitude</th><th>Longitude</th><th>Arrêts</th><th>GPS</th><th style="text-align:right;">Actions</th></tr></thead>
      <tbody id="li-corps"></tbody>
    </table></div>
    <p class="info-txt" id="li-compte" style="margin-top:8px;"></p>
  </div>`);

  racine.querySelector("#li-q").oninput = (e) => {
    App.barreLieux.q = e.target.value; core.rafraichir();
    const cible = document.getElementById("li-q");
    if (cible) { cible.focus(); cible.setSelectionRange(cible.value.length, cible.value.length); }
  };
  racine.querySelector("#li-nouv").onclick = () => formulaireLieu(d, core, null, null);

  const corps = racine.querySelector("#li-corps");
  corps.innerHTML = visibles.map(l =>
    `<tr data-id="${core.esc(l.id)}">` +
    `<td>${core.esc(l.id)}</td><td>${core.esc(l.abrev)}</td><td>${core.esc(l.nom)}</td>` +
    `<td>${core.esc(l.caract || "")}</td>` +
    `<td>${l.lat != null ? core.esc(String(l.lat)) : ""}</td><td>${l.lng != null ? core.esc(String(l.lng)) : ""}</td>` +
    `<td>${nbArretsParLieu.get(l.id) || 0}</td>` +
    `<td>${(l.lat != null && l.lng != null) ? "✓" : "⚠"}</td>` +
    `<td style="text-align:right;"><button class="ico" data-act="mod" data-id="${core.esc(l.id)}" title="Modifier">✎</button><button class="ico suppr" data-act="sup" data-id="${core.esc(l.id)}" title="Supprimer (refusé si des arrêts sont rattachés)">🗑</button></td></tr>`
  ).join("") + (!visibles.length
    ? `<tr><td colspan="9" style="text-align:center;color:#64748b;">${d.topo.lieux.length ? "Aucun lieu ne correspond à la recherche." : "Aucun lieu — cliquez « + Créer un lieu »."}</td></tr>` : "");
  corps.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    if (b.dataset.act === "mod") return ficheLieu(d, core, b.dataset.id);
    if (b.classList.contains("armed")) {
      const r = Topo.supprimerLieu(d, b.dataset.id);
      if (!r.ok) alert((r.erreurs || []).join(" "));
      core.sauver(); core.rafraichir(); return;
    }
    b.classList.add("armed"); b.textContent = "Confirmer ?";
    setTimeout(() => { if (b.isConnected) { b.classList.remove("armed"); b.textContent = "🗑"; } }, 3000);
  });
  corps.addEventListener("dblclick", (e) => {
    if (e.target.closest("button")) return;
    const tr = e.target.closest("tr");
    if (tr && tr.dataset.id) ficheLieu(d, core, tr.dataset.id);
  });
  racine.querySelector("#li-compte").textContent =
    `${visibles.length} lieu(x) affiché(s) sur ${d.topo.lieux.length}` + (q ? ` — recherche « ${App.barreLieux.q} »` : "");

  /* 📋 Copier (Excel) : TSV Abrév / Nom / Caractéristique / Latitude / Longitude. */
  racine.querySelector("#li-copy").onclick = () => {
    const tsv = ["Abrév\tNom\tCaractéristique\tLatitude\tLongitude"].concat(
      d.topo.lieux.map(l => [l.abrev, l.nom, l.caract || "", l.lat != null ? l.lat : "", l.lng != null ? l.lng : ""].join("\t"))
    ).join("\n");
    navigator.clipboard?.writeText(tsv);
    const info = core.h(`<div>
      <h2>📋 Copié pour Excel</h2>
      <p class="info-txt">Les ${d.topo.lieux.length} lieu(x) sont dans le presse-papiers : collez-les dans Excel avec Ctrl+V.</p>
      <div class="ligne-boutons"><button id="lc-ok" class="b-bleu">Fermer</button></div>
    </div>`);
    info.querySelector("#lc-ok").onclick = () => info.closest(".modal-fond").remove();
    core.modal(info);
  };

  /* 📥 Importer : fichier ou collage, clé = abréviation du LIEU.
     Colonnes : Abrév*, Nom*, Caractéristique, Latitude, Longitude.
     - lieu existant → mise à jour (caractéristique et coordonnées si fournies) ;
     - nouveau → création. Le lieu n'est JAMAIS supprimé par un import. */
  racine.querySelector("#li-masse").onclick = () => {
    const form = core.h(`<form class="panneau-travail">
      <h2>Importer des lieux</h2>
      <p class="info-txt">Colonnes : <b>Abrév* — Nom* — Caractéristique — Latitude — Longitude</b> (* = obligatoire).
      La clé est l'abréviation : un lieu existant est mis à jour, un nouveau est créé.</p>
      <p class="info-txt">Formats acceptés : collage TSV (copié d'Excel), CSV (; ou ,), 5 colonnes.</p>
      <label><input type="file" id="li-fichier" accept=".csv,.tsv,.txt"></label>
      <label>ou collez ici :<br><textarea id="li-texte" rows="6" style="width:100%;" placeholder="GAR&#9;Gare de Rennes&#9;Gare&#9;48.11&#9;-1.67"></textarea></label>
      <div class="ligne-boutons"><button type="button" id="li-ann" class="b-blanc">Annuler</button>
      <button type="submit" class="b-bleu">Prévisualiser</button></div>
      <div id="li-erreurs"></div>
    </form>`);
    form.querySelector("#li-ann").onclick = () => form.closest(".modal-fond").remove();
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const fichier = form.querySelector("#li-fichier").files[0];
      const texte = fichier ? null : form.querySelector("#li-texte").value;
      if (!fichier && !texte) {
        form.querySelector("#li-erreurs").replaceChildren(core.h(`<p class="erreur">Choisissez un fichier ou collez des lignes.</p>`));
        return;
      }
      if (!fichier) return preparer(texte);
      const fr = new FileReader();
      fr.onload = () => preparer(String(fr.result || ""));
      fr.readAsText(fichier);
    };
    function preparer(texte) {
      /* Prévisualisation sur une COPIE des données (jamais sur les vraies). */
      const copie = JSON.parse(JSON.stringify(d));
      const lignesTxt = texte.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      let crees = 0, maj = 0, ignorees = 0;
      lignesTxt.forEach(ligneTxt => {
        const c = ligneTxt.split(/\t|;|,(?=\s*-?\d|\s*[A-ZÀ-Ü])/).map(x => (x || "").trim());
        if (c.length < 2) { ignorees++; return; }
        const abrev = c[0], nom = c[1];
        const caract = c[2] || "";
        const lat = c[3] === undefined || c[3] === "" ? null : Number(c[3]);
        const lng = c[4] === undefined || c[4] === "" ? null : Number(c[4]);
        if (!abrev || !nom || (lat != null && isNaN(lat)) || (lng != null && isNaN(lng))) { ignorees++; return; }
        const existant = copie.topo.lieux.find(x => (x.abrev || "").toLowerCase() === abrev.toLowerCase());
        if (existant) {
          Topo.modifierLieu(copie, existant.id, Object.assign({ nom, abrev, caract }, lat != null ? { lat } : {}, lng != null ? { lng } : {}));
          maj++;
        } else {
          const r = Topo.creerLieu(copie, { nom, abrev, caract, lat, lng });
          if (r.ok) crees++; else ignorees++;
        }
      });
      const apercu = core.h(`<div class="panneau-travail">
        <h2>📥 Prévisualisation de l'import</h2>
        <p class="info-txt">${crees} création(s), ${maj} mise(s) à jour, ${ignorees} ignorée(s) — sur ${lignesTxt.length} ligne(s) lue(s).</p>
        <div class="ligne-boutons"><button id="li-retour" class="b-blanc">✕ Annuler</button>
        <button id="li-ok" class="b-vert" ${crees + maj === 0 ? "disabled" : ""}>Importer ${crees + maj} lieu(x)</button></div>
      </div>`);
      apercu.querySelector("#li-retour").onclick = () => apercu.closest(".modal-fond").remove();
      apercu.querySelector("#li-ok").onclick = () => {
        /* On REJOUE le même texte sur les VRAIES données : aucune divergence
           possible entre l'aperçu et l'effet réel (motif rodé des arrêts). */
        lignesTxt.forEach(ligneTxt => {
          const c = ligneTxt.split(/\t|;|,(?=\s*-?\d|\s*[A-ZÀ-Ü])/).map(x => (x || "").trim());
          if (c.length < 2) return;
          const abrev = c[0], nom = c[1];
          const caract = c[2] || "";
          const lat = c[3] === undefined || c[3] === "" ? null : Number(c[3]);
          const lng = c[4] === undefined || c[4] === "" ? null : Number(c[4]);
          if (!abrev || !nom || (lat != null && isNaN(lat)) || (lng != null && isNaN(lng))) return;
          const existant = d.topo.lieux.find(x => (x.abrev || "").toLowerCase() === abrev.toLowerCase());
          if (existant) Topo.modifierLieu(d, existant.id, Object.assign({ nom, abrev, caract }, lat != null ? { lat } : {}, lng != null ? { lng } : {}));
          else Topo.creerLieu(d, { nom, abrev, caract, lat, lng });
        });
        core.sauver();
        apercu.closest(".modal-fond").remove();
        form.closest(".modal-fond").remove();
        core.rafraichir();
        alert(`Import terminé : ${crees} création(s), ${maj} mise(s) à jour, ${ignorees} ignorée(s).`);
      };
      core.modal(apercu);
    }
  };

  return racine;
};
