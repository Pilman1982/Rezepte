import * as db from "./db.js";
import { Suchindex, feldName, normalisiere } from "./suche.js";
import { menge, mengeText, zielEinheiten, faktorAusZutat, standardZielEinheit, leseZahl, zahl } from "./umrechnen.js";

const APP_VERSION = "1.1.0";

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const vergleiche = new Intl.Collator("de-CH", { sensitivity: "base", numeric: true }).compare;
const schmal = () => !matchMedia("(min-width: 900px)").matches;
const istIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
// Auf dem iPhone im normalen Safari-Tab (nicht als installierte App)
const iosImBrowser = istIOS && !navigator.standalone && !matchMedia("(display-mode: standalone)").matches;
const OHNE = "__ohne__";

const ICON = {
  zurueck: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  stern: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  kochen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11h16v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM2 11h2m16 0h2M9 7c0-1 1-1.5 1-2.5M13 7c0-1 1-1.5 1-2.5"/></svg>',
  kopieren: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  teilen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
  schliessen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  export: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
};

// Farbton je Kategorie (Punkt in der Liste)
const KAT_FARBE = {
  "Gemüse": 130, "Beilagen (Stärke)": 38, "Fleisch und Wild": 5, "Patisserie und Desserts": 330, "Suppen": 22,
  "Saucen, Dressings, Gewürze": 28, "Diverses": 220, "Fisch und Meeresfrüchte": 205, "Salate": 95,
  "Vorspeisen und kalte Küche": 175, "Geflügel": 48, "Eierspeisen": 55, "Getränke": 270,
};
const katFarbe = (k) => KAT_FARBE[k] ?? 220;

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------
const S = {
  rezepte: [],
  nachId: new Map(),
  gruppen: new Map(),
  index: null,
  favoriten: new Set(),
  meta: null,
  filter: { q: "", kategorie: "", quelle: "", posten: "", nurFav: false, sort: "az", suchSort: "relevanz" },
  skala: new Map(),
  aktiv: null,
  wake: null,
  kochId: null,
  listeScroll: 0,
  verlauf: [],
};

function speichereFilter() {
  try {
    const { q, ...rest } = S.filter;
    localStorage.setItem("rezepte.filter", JSON.stringify(rest));
  } catch {}
}
function ladeFilter() {
  try {
    const f = JSON.parse(localStorage.getItem("rezepte.filter") || "null");
    if (f) Object.assign(S.filter, f, { q: "" });
  } catch {}
}

function setzeRezepte(liste) {
  for (const r of liste) {
    r.zutaten = Array.isArray(r.zutaten) ? r.zutaten : [];
    r.abschnitte = r.abschnitte && typeof r.abschnitte === "object" ? r.abschnitte : {};
  }
  S.rezepte = liste;
  S.nachId = new Map(liste.map((r) => [r.id, r]));
  S.gruppen = new Map();
  for (const r of liste) {
    if (!r.gruppe_id) continue;
    if (!S.gruppen.has(r.gruppe_id)) S.gruppen.set(r.gruppe_id, []);
    S.gruppen.get(r.gruppe_id).push(r);
  }
  const nr = (r) => parseInt((r.variante || "").match(/\d+/)?.[0] || "0", 10);
  for (const g of S.gruppen.values()) g.sort((a, b) => nr(a) - nr(b));
  S.index = new Suchindex(liste);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function start() {
  ladeFilter();
  bindeListe();
  bindeGlobal();
  try {
    const [rezepte, fav, meta] = await Promise.all([db.alleRezepte(), db.favoriten(), db.leseMeta("import")]);
    setzeRezepte(rezepte);
    S.favoriten = fav;
    S.meta = meta || null;
  } catch (e) {
    console.error(e);
    zeigeToast("Die lokale Datenbank konnte nicht geöffnet werden.");
    setzeRezepte([]);
  }
  fuelleFilter();
  renderListe();
  route();
  window.addEventListener("hashchange", route);
  registriereServiceWorker();
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
function route() {
  const hash = location.hash || "#/";
  const v = S.verlauf;
  if (v.length >= 2 && v[v.length - 2] === hash) v.pop();
  else if (v[v.length - 1] !== hash) v.push(hash);

  const teile = hash.replace(/^#\/?/, "").split("/");
  if (teile[0] === "r" && teile[1]) {
    const r = S.nachId.get(decodeURIComponent(teile[1]));
    if (!r) return location.replace("#/");
    if (teile[2] === "kochen") {
      if (S.aktiv !== r.id) zeigeDetail(r);
      zeigeKochen(r);
    } else {
      beendeKochen();
      zeigeDetail(r);
    }
  } else if (teile[0] === "import") {
    beendeKochen();
    zeigeVerwaltung();
  } else {
    beendeKochen();
    zeigeListe();
  }
}

function zurueck() {
  if (S.verlauf.length > 1) history.back();
  else location.replace("#/");
}

function setzeAnsicht(ansicht) {
  const vorher = document.body.dataset.ansicht;
  if (vorher === "liste" && ansicht !== "liste" && schmal()) S.listeScroll = window.scrollY;
  document.body.dataset.ansicht = ansicht;
  if (ansicht === "liste" && vorher && vorher !== "liste" && schmal()) {
    requestAnimationFrame(() => window.scrollTo(0, S.listeScroll));
  }
}

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------
function zeigeListe() {
  S.aktiv = null;
  setzeAnsicht("liste");
  document.title = "Rezepte";
  renderListe();
  $("#detail-pane").innerHTML = S.rezepte.length
    ? '<div class="platzhalter"><img src="icons/icon.svg" alt=""><p>Rezept in der Liste auswählen</p></div>'
    : '<div class="platzhalter"><img src="icons/icon.svg" alt=""><p>Noch keine Rezepte auf diesem Gerät.</p></div>';
}

function bindeListe() {
  const suche = $("#suche");
  let timer = null;
  suche.addEventListener("input", () => {
    $("#suche-leeren").hidden = !suche.value;
    clearTimeout(timer);
    timer = setTimeout(() => {
      S.filter.q = suche.value;
      renderListe();
    }, 120);
  });
  suche.addEventListener("keydown", (e) => {
    if (e.key === "Enter") suche.blur();
    if (e.key === "Escape") leereSuche();
  });
  $("#suche-leeren").addEventListener("click", () => {
    leereSuche();
    suche.focus();
  });

  $("#btn-filter").addEventListener("click", () => {
    const p = $("#filter-panel");
    p.hidden = !p.hidden;
    $("#btn-filter").setAttribute("aria-expanded", String(!p.hidden));
  });
  $("#btn-favoriten").addEventListener("click", () => {
    S.filter.nurFav = !S.filter.nurFav;
    speichereFilter();
    renderListe();
  });
  $("#sortierung").addEventListener("change", (e) => {
    if (S.filter.q.trim()) S.filter.suchSort = e.target.value;
    else S.filter.sort = e.target.value;
    speichereFilter();
    renderListe();
  });
  for (const [sel, feld] of [["#f-kategorie", "kategorie"], ["#f-quelle", "quelle"], ["#f-posten", "posten"]]) {
    $(sel).addEventListener("change", (e) => {
      S.filter[feld] = e.target.value;
      speichereFilter();
      renderListe();
    });
  }
  $("#filter-zuruecksetzen").addEventListener("click", () => {
    Object.assign(S.filter, { kategorie: "", quelle: "", posten: "", nurFav: false });
    speichereFilter();
    fuelleFilter();
    renderListe();
  });
  $("#aktive-filter").addEventListener("click", (e) => {
    const b = e.target.closest("[data-entferne]");
    if (!b) return;
    S.filter[b.dataset.entferne] = b.dataset.entferne === "nurFav" ? false : "";
    speichereFilter();
    fuelleFilter();
    renderListe();
  });
}

function leereSuche() {
  $("#suche").value = "";
  $("#suche-leeren").hidden = true;
  S.filter.q = "";
  renderListe();
}

function zaehle(fn) {
  const m = new Map();
  for (const r of S.rezepte) {
    const k = fn(r) || OHNE;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m].sort((a, b) => (a[0] === OHNE) - (b[0] === OHNE) || vergleiche(a[0], b[0]));
}

function fuelleFilter() {
  const setze = (sel, alle, eintraege, wert) => {
    $(sel).innerHTML =
      `<option value="">${esc(alle)}</option>` +
      eintraege.map(([k, n]) => `<option value="${esc(k)}">${esc(k === OHNE ? "(ohne Angabe)" : k)} (${n})</option>`).join("");
    $(sel).value = eintraege.some(([k]) => k === wert) ? wert : "";
  };
  setze("#f-kategorie", "Alle Kategorien", zaehle((r) => r.kategorie), S.filter.kategorie);
  setze("#f-quelle", "Alle Quellen", zaehle((r) => r.quelle), S.filter.quelle);
  setze("#f-posten", "Alle Herkünfte", zaehle((r) => r.posten), S.filter.posten);
  for (const f of ["kategorie", "quelle", "posten"]) S.filter[f] = $(`#f-${f}`).value;
}

const passt = (wert, filter) => !filter || (filter === OHNE ? !wert : wert === filter);

function gefiltert() {
  const f = S.filter;
  const treffer = f.q.trim() ? S.index.suche(f.q) : null;
  const liste = [];
  S.rezepte.forEach((r, i) => {
    if (treffer && !treffer.has(i)) return;
    if (!passt(r.kategorie, f.kategorie) || !passt(r.quelle, f.quelle) || !passt(r.posten, f.posten)) return;
    if (f.nurFav && !S.favoriten.has(r.id)) return;
    liste.push({ r, t: treffer ? treffer.get(i) : null });
  });
  const sort = treffer ? f.suchSort : f.sort === "relevanz" ? "az" : f.sort;
  const titel = (a, b) => vergleiche(a.r.titel, b.r.titel);
  if (sort === "relevanz") liste.sort((a, b) => b.t.punkte - a.t.punkte || titel(a, b));
  else if (sort === "kategorie") liste.sort((a, b) => vergleiche(a.r.kategorie || "~", b.r.kategorie || "~") || titel(a, b));
  else if (sort === "jahr") liste.sort((a, b) => (b.r.jahr || 0) - (a.r.jahr || 0) || titel(a, b));
  else liste.sort(titel);
  return { liste, sort, suche: !!treffer };
}

function fuelleSortierung(suche) {
  const sel = $("#sortierung");
  const optionen = [...(suche ? [["relevanz", "Beste Treffer"]] : []), ["az", "A bis Z"], ["kategorie", "Kategorie"], ["jahr", "Jahr"]];
  const neu = optionen.map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
  if (sel.dataset.stand !== String(suche)) {
    sel.innerHTML = neu;
    sel.dataset.stand = String(suche);
  }
  sel.value = suche ? S.filter.suchSort : S.filter.sort === "relevanz" ? "az" : S.filter.sort;
}

function renderListe() {
  const leer = S.rezepte.length === 0;
  $("#willkommen").hidden = !leer;
  $("#suchbereich").hidden = leer;
  $("#anzahl").hidden = leer;
  $("#liste").hidden = leer;
  if (leer) return;

  const { liste, sort, suche } = gefiltert();
  fuelleSortierung(suche);

  // Filter-Anzeige
  const f = S.filter;
  const aktiv = [["kategorie", f.kategorie], ["quelle", f.quelle], ["posten", f.posten]].filter(([, w]) => w);
  $("#filter-zahl").hidden = !aktiv.length;
  $("#filter-zahl").textContent = aktiv.length;
  $("#btn-favoriten").setAttribute("aria-pressed", String(f.nurFav));
  $("#aktive-filter").innerHTML = aktiv
    .map(([k, w]) => `<button type="button" class="chip chip-aktiv" data-entferne="${k}" aria-label="Filter ${esc(w)} entfernen">${esc(w === OHNE ? "ohne Herkunft" : w)} ${ICON.schliessen}</button>`)
    .join("");

  const gesamt = S.rezepte.length;
  $("#anzahl").textContent =
    liste.length === gesamt ? `${gesamt} Rezepte` : liste.length === 0 ? "Keine Rezepte gefunden" : `${liste.length} von ${gesamt} Rezepten`;

  // Gruppenköpfe bei Kategorie/Jahr
  const gruppeVon = sort === "kategorie" ? (r) => r.kategorie || "Ohne Kategorie" : sort === "jahr" ? (r) => String(r.jahr || "Ohne Jahr") : null;
  const anzahlProGruppe = new Map();
  if (gruppeVon) for (const { r } of liste) anzahlProGruppe.set(gruppeVon(r), (anzahlProGruppe.get(gruppeVon(r)) || 0) + 1);

  let html = "", letzte = null;
  for (const { r, t } of liste) {
    if (gruppeVon) {
      const g = gruppeVon(r);
      if (g !== letzte) {
        html += `<li class="gruppe-kopf">${esc(g)} <span>${anzahlProGruppe.get(g)}</span></li>`;
        letzte = g;
      }
    }
    const fav = S.favoriten.has(r.id);
    const meta = [r.quelle, r.posten, r.jahr].filter(Boolean).map(esc).join(" · ");
    const hinweise = [];
    if (r.variante) hinweise.push(`<span class="marke">${esc(r.variante.replace(/Fassung (\d+) von (\d+)/, "Fassung $1/$2"))}</span>`);
    if (t && t.feld < 10) hinweise.push(`<span class="marke marke-treffer">Treffer: ${esc(feldName(t.feld))}</span>`);
    html += `<li><a class="eintrag${S.aktiv === r.id ? " eintrag-aktiv" : ""}" href="#/r/${encodeURIComponent(r.id)}" style="--h:${katFarbe(r.kategorie)}">
      <span class="eintrag-titel">${esc(r.titel)}${fav ? `<span class="eintrag-fav" aria-label="Favorit">${ICON.stern}</span>` : ""}</span>
      <span class="eintrag-meta"><span class="kat-punkt" aria-hidden="true"></span>${esc(r.kategorie || "")}${meta ? " · " + meta : ""}</span>
      ${hinweise.length ? `<span class="eintrag-marken">${hinweise.join("")}</span>` : ""}
    </a></li>`;
  }
  if (!liste.length) {
    html = `<li class="liste-leer"><p>Nichts gefunden.</p>${
      f.q || aktiv.length || f.nurFav ? '<button type="button" class="knopf knopf-leise" id="alles-zeigen">Suche und Filter zurücksetzen</button>' : ""
    }</li>`;
  }
  $("#liste").innerHTML = html;
  const allesZeigen = $("#alles-zeigen");
  if (allesZeigen)
    allesZeigen.addEventListener("click", () => {
      Object.assign(S.filter, { kategorie: "", quelle: "", posten: "", nurFav: false });
      speichereFilter();
      fuelleFilter();
      leereSuche();
    });
}

// ---------------------------------------------------------------------------
// Rezept
// ---------------------------------------------------------------------------
function skalaVon(r) {
  let s = S.skala.get(r.id);
  if (!s) {
    const ersteMitMenge = r.zutaten.findIndex((z) => z.menge > 0 && mengeText(z) !== "");
    s = {
      modus: r.portionen?.menge > 0 ? "portionen" : "faktor",
      faktor: 1,
      portionen: r.portionen?.menge || null,
      zutat: ersteMitMenge,
      zutatZiel: null,
      zutatEinheit: ersteMitMenge >= 0 ? standardZielEinheit(r.zutaten[ersteMitMenge]) : null,
    };
    S.skala.set(r.id, s);
  }
  return s;
}

function mengenHinweis(r) {
  const s = skalaVon(r);
  const p = r.portionen;
  if (Math.abs(s.faktor - 1) < 1e-9) return p?.menge ? `für ${zahl(p.menge)} ${p.einheit || ""}`.trim() : "";
  if (p?.menge) return `für ${zahl(p.menge * s.faktor)} ${p.einheit || ""}`.trim();
  return `Faktor ×${zahl(s.faktor)}`;
}

// Zwischentitel bei den Zutaten nur, wenn es mehrere Gruppen gibt oder die Gruppe nicht einfach der Rezepttitel ist
function zeigeGruppen(r) {
  const gruppen = [...new Set(r.zutaten.map((z) => z.gruppe || ""))];
  return gruppen.length > 1 || (gruppen.length === 1 && gruppen[0] !== "" && gruppen[0] !== r.titel);
}

function zutatenHtml(r, faktor) {
  if (!r.zutaten.length) return '<p class="leise">Keine Zutaten erfasst.</p>';
  const mitGruppen = zeigeGruppen(r);
  let html = "", gruppe = null, offen = false;
  for (const z of r.zutaten) {
    const g = z.gruppe || "";
    if (mitGruppen && g !== gruppe) {
      if (offen) html += "</ul>";
      if (g) html += `<h3 class="zutaten-gruppe">${esc(g)}</h3>`;
      html += '<ul class="zutatenliste">';
      offen = true;
      gruppe = g;
    } else if (!offen) {
      html += '<ul class="zutatenliste">';
      offen = true;
    }
    const m = menge(z, faktor);
    const name = String(z.zutat || "").replace(/\t+/g, " ");
    html += `<li class="zutat">
      <span class="zutat-menge">${m.wert ? `<b>${esc(m.wert)}</b> ${esc(m.einheit)}` : esc(m.einheit)}${m.orig ? `<small class="orig" title="Originalmenge">${esc(m.orig)}</small>` : ""}</span>
      <span class="zutat-name">${esc(name)}${z.vorbereitung ? ` <span class="vorbereitung">${esc(z.vorbereitung)}</span>` : ""}</span>
    </li>`;
  }
  if (offen) html += "</ul>";
  return html;
}

const istZwischentitel = (s) => s.length <= 48 && /:\s*$/.test(s);

function schritteHtml(r) {
  let html = "";
  for (const [name, schritte] of Object.entries(r.abschnitte)) {
    if (!schritte?.length) continue;
    html += `<section class="abschnitt"><h2>${esc(name)}</h2><ol class="schritte">${schritte
      .map((s) => `<li class="${istZwischentitel(s) ? "zwischentitel" : "schritt"}">${esc(s)}</li>`)
      .join("")}</ol></section>`;
  }
  return html;
}

function hatSchritte(r) {
  return Object.values(r.abschnitte).some((s) => s?.length);
}

function textZeigen(r) {
  const t = (r.text || "").trim();
  return t && normalisiere(t) !== normalisiere(r.titel);
}

function mengeKarteHtml(r) {
  const s = skalaVon(r);
  const mitMengen = r.zutaten.map((z, i) => [z, i]).filter(([z]) => z.menge > 0 && mengeText(z) !== "");
  const hatPortionen = r.portionen?.menge > 0;
  if (!mitMengen.length) return "";
  const segment = (modus, text) => `<button type="button" data-modus="${modus}" aria-pressed="${s.modus === modus}">${text}</button>`;
  const z = r.zutaten[s.zutat];
  return `<details class="karte menge-karte" id="menge-karte" ${s.offen ? "open" : ""}>
    <summary><span class="karte-titel">Menge anpassen</span><span class="menge-kurz" id="menge-kurz"></span></summary>
    <div class="segmente" role="group" aria-label="Art der Umrechnung">
      ${hatPortionen ? segment("portionen", "Portionen") : ""}${segment("faktor", "Faktor")}${segment("zutat", "Nach Zutat")}
    </div>
    ${hatPortionen ? `<div class="modus" data-fuer="portionen">
      <div class="stepper">
        <button type="button" class="stepper-knopf" data-aktion="minus" aria-label="Weniger">−</button>
        <input id="ziel-portionen" type="text" inputmode="decimal" value="${esc(zahl(s.portionen))}" aria-label="Anzahl ${esc(r.portionen.einheit || "Portionen")}">
        <button type="button" class="stepper-knopf" data-aktion="plus" aria-label="Mehr">+</button>
        <span class="stepper-einheit">${esc(r.portionen.einheit || "Portionen")}</span>
      </div>
    </div>` : ""}
    <div class="modus" data-fuer="faktor">
      <div class="schnellwahl">
        ${[["0.5", "½×"], ["1", "1×"], ["2", "2×"], ["3", "3×"], ["4", "4×"]].map(([f, t]) => `<button type="button" data-faktor="${f}">${t}</button>`).join("")}
      </div>
      <label class="feld">Eigener Faktor<input id="faktor" type="text" inputmode="decimal" value="${esc(zahl(s.faktor))}"></label>
    </div>
    <div class="modus" data-fuer="zutat">
      <label class="feld">Hauptzutat
        <select id="zutat-wahl">${mitMengen
          .map(([zz, i]) => `<option value="${i}" ${i === s.zutat ? "selected" : ""}>${esc(zz.zutat)} (${esc(mengeText(zz))})</option>`)
          .join("")}</select>
      </label>
      <div class="feld-reihe">
        <label class="feld">Gewünschte Menge<input id="zutat-ziel" type="text" inputmode="decimal" placeholder="${esc(z ? zahl(z.menge) : "")}" value="${s.zutatZiel != null ? esc(zahl(s.zutatZiel)) : ""}"></label>
        <label class="feld feld-einheit">Einheit<select id="zutat-einheit">${(z ? zielEinheiten(z) : [])
          .map((e) => `<option ${e === s.zutatEinheit ? "selected" : ""}>${esc(e)}</option>`)
          .join("")}</select></label>
      </div>
    </div>
    <p class="menge-status"><span id="menge-status"></span>
      <button type="button" class="knopf-link" data-aktion="original">Originalmenge</button></p>
  </details>`;
}

function zeigeDetail(r) {
  S.aktiv = r.id;
  setzeAnsicht("detail");
  document.title = `${r.titel} – Rezepte`;
  const fav = S.favoriten.has(r.id);
  const s = skalaVon(r);
  const pane = $("#detail-pane");

  const metaTeile = [r.quelle, r.posten, r.jahr].filter(Boolean).map(esc);
  if (r.preis_pp) metaTeile.push(`CHF ${Number(r.preis_pp).toFixed(2)} pro Person`);

  // Fassungen
  let fassungen = "";
  const gruppe = r.gruppe_id ? S.gruppen.get(r.gruppe_id) : null;
  if (gruppe && gruppe.length > 1) {
    const pos = gruppe.indexOf(r) + 1;
    fassungen = `<section class="karte fassungen">
      <h2 class="karte-titel">${esc(r.variante || `Fassung ${pos} von ${gruppe.length}`)}</h2>
      <ul class="fassungen-liste">${gruppe
        .map((f, i) => {
          const aktuell = f === r;
          const label = f.variante || `Fassung ${i + 1} von ${gruppe.length}`;
          const inhalt = `<strong>${esc(label)}${aktuell ? " · diese" : ""}</strong>${f.titel !== r.titel ? `<span class="fassung-titel">${esc(f.titel)}</span>` : ""}<span>${esc(f.variante_info || [f.quelle, f.posten, f.jahr].filter(Boolean).join(" · "))}</span>`;
          return aktuell
            ? `<li><span class="fassung fassung-aktuell" aria-current="page">${inhalt}</span></li>`
            : `<li><a class="fassung" href="#/r/${encodeURIComponent(f.id)}">${inhalt}</a></li>`;
        })
        .join("")}</ul>
    </section>`;
  }

  const auchIn = Array.isArray(r.auch_in) && r.auch_in.length
    ? `<p class="auch-in">Identisch auch in: ${[...new Set(r.auch_in.map((a) => [a.quelle, a.posten, a.jahr].filter(Boolean).join(" · ")))].map(esc).join("; ")}</p>`
    : "";

  const schritte = hatSchritte(r) ? schritteHtml(r) : "";
  let freitext = "";
  if (textZeigen(r)) {
    // Bei abgeschriebenen Rezepten (Skill «rezepte-sammeln») enthält «text» Notizen wie
    // «von Hand korrigiert» – die sind wichtig und bleiben sichtbar
    const notiz = r.text_art === "notiz";
    freitext = !schritte
      ? `<section class="abschnitt"><h2>Rezepttext</h2><div class="freitext">${esc(r.text)}</div></section>`
      : notiz
        ? `<section class="abschnitt"><h2>Notizen</h2><div class="freitext">${esc(r.text)}</div></section>`
        : `<details class="karte aufklapp"><summary>Originaltext</summary><div class="freitext">${esc(r.text)}</div></details>`;
  }

  pane.innerHTML = `<article class="rezept" style="--h:${katFarbe(r.kategorie)}">
    <div class="rezept-leiste">
      <button type="button" class="knopf-icon" data-aktion="zurueck" aria-label="Zurück zur Liste">${ICON.zurueck}</button>
      <button type="button" class="knopf-icon knopf-fav" data-aktion="favorit" aria-pressed="${fav}" aria-label="${fav ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}">${ICON.stern}</button>
    </div>
    <header class="rezept-kopf">
      <p class="rezept-kategorie"><span class="kat-punkt" aria-hidden="true"></span>${esc(r.kategorie || "Ohne Kategorie")}</p>
      <h1>${esc(r.titel)}</h1>
      <p class="rezept-meta">${metaTeile.join(" · ")}</p>
      ${auchIn}
    </header>
    ${fassungen}
    <div class="aktionen">
      <button type="button" class="knopf knopf-gross" data-aktion="kochen">${ICON.kochen} Kochmodus</button>
      ${r.zutaten.length ? `<button type="button" class="knopf knopf-zweit" data-aktion="kopieren">${ICON.kopieren} Einkaufsliste kopieren</button>` : ""}
      ${r.zutaten.length && navigator.share ? `<button type="button" class="knopf knopf-zweit" data-aktion="teilen">${ICON.teilen} Teilen</button>` : ""}
    </div>
    ${mengeKarteHtml(r)}
    <section class="zutaten">
      <h2>Zutaten <span class="menge-hinweis" id="menge-hinweis"></span></h2>
      <div id="zutaten-liste"></div>
    </section>
    ${schritte}
    ${freitext}
    ${r.datei ? `<details class="aufklapp dateiinfo"><summary>Originaldatei</summary><p class="klein">${esc(r.datei)}${r.blatt ? `<br>Blatt: ${esc(r.blatt)}` : ""}</p></details>` : ""}
  </article>`;

  bindeDetail(r, pane);
  const karte = $("#menge-karte", pane);
  if (karte) karte.addEventListener("toggle", () => (skalaVon(r).offen = karte.open));
  aktualisiereMenge(r);
  window.scrollTo(0, 0);
  pane.scrollTop = 0;
  // aktiven Eintrag in der Liste markieren (breite Ansicht)
  for (const a of $$(".eintrag")) a.classList.toggle("eintrag-aktiv", a.getAttribute("href") === `#/r/${encodeURIComponent(r.id)}`);
  if (!schmal()) $(".eintrag-aktiv")?.scrollIntoView({ block: "nearest" });
}

function aktualisiereMenge(r) {
  const s = skalaVon(r);
  const pane = $("#detail-pane");
  for (const b of $$(".segmente [data-modus]", pane)) b.setAttribute("aria-pressed", String(b.dataset.modus === s.modus));
  for (const m of $$(".modus", pane)) m.hidden = m.dataset.fuer !== s.modus;
  for (const b of $$("[data-faktor]", pane)) b.setAttribute("aria-pressed", String(Math.abs(Number(b.dataset.faktor) - s.faktor) < 1e-9));
  const liste = $("#zutaten-liste", pane);
  if (liste) liste.innerHTML = zutatenHtml(r, s.faktor);
  const hinweis = mengenHinweis(r);
  const h = $("#menge-hinweis", pane);
  if (h) h.textContent = hinweis;
  const kurz = $("#menge-kurz", pane);
  if (kurz) {
    const original = Math.abs(s.faktor - 1) < 1e-9;
    kurz.textContent = original ? hinweis || "Original" : hinweis.startsWith("Faktor") ? hinweis : `×${zahl(s.faktor)} · ${hinweis}`;
    kurz.classList.toggle("menge-kurz-aktiv", !original);
  }
  const status = $("#menge-status", pane);
  if (status) {
    const orig = r.portionen?.menge ? `${zahl(r.portionen.menge)} ${r.portionen.einheit || ""}`.trim() : "";
    status.textContent =
      Math.abs(s.faktor - 1) < 1e-9 ? "Originalmenge" : `Faktor ×${zahl(s.faktor)}${orig ? ` · Original ${orig}` : ""}`;
    const knopf = $('[data-aktion="original"]', pane);
    if (knopf) knopf.hidden = Math.abs(s.faktor - 1) < 1e-9;
  }
}

function setzeFaktor(r, faktor, quelle) {
  const s = skalaVon(r);
  if (!(faktor > 0) || !isFinite(faktor)) return;
  s.faktor = Math.min(faktor, 1000);
  const pane = $("#detail-pane");
  // andere Eingabefelder nachführen (nicht das, in dem gerade getippt wird)
  if (quelle !== "portionen" && r.portionen?.menge) {
    s.portionen = Math.round(r.portionen.menge * s.faktor * 100) / 100;
    const el = $("#ziel-portionen", pane);
    if (el) el.value = zahl(s.portionen);
  }
  if (quelle !== "faktor") {
    const el = $("#faktor", pane);
    if (el) el.value = zahl(s.faktor);
  }
  if (quelle !== "zutat") {
    s.zutatZiel = null;
    const el = $("#zutat-ziel", pane);
    if (el) el.value = "";
  }
  aktualisiereMenge(r);
}

function bindeDetail(r, pane) {
  pane.onclick = async (e) => {
    const modus = e.target.closest("[data-modus]");
    if (modus) {
      skalaVon(r).modus = modus.dataset.modus;
      aktualisiereMenge(r);
      return;
    }
    const f = e.target.closest("[data-faktor]");
    if (f) return setzeFaktor(r, Number(f.dataset.faktor));
    const b = e.target.closest("[data-aktion]");
    if (!b) return;
    const s = skalaVon(r);
    switch (b.dataset.aktion) {
      case "zurueck": return zurueck();
      case "favorit": return schalteFavorit(r, b);
      case "kochen": location.hash = `#/r/${encodeURIComponent(r.id)}/kochen`; return;
      case "kopieren": return kopiereEinkaufsliste(r);
      case "teilen": return teileEinkaufsliste(r);
      case "original":
        s.portionen = r.portionen?.menge || null;
        return setzeFaktor(r, 1);
      case "minus":
      case "plus": {
        const aktuell = s.portionen || r.portionen.menge;
        let neu;
        if (b.dataset.aktion === "plus") neu = aktuell < 1 ? 1 : Math.floor(aktuell) + 1;
        else neu = aktuell > 1 ? Math.ceil(aktuell) - 1 : Math.max(0.25, aktuell / 2);
        s.portionen = neu;
        $("#ziel-portionen", pane).value = zahl(neu);
        return setzeFaktor(r, neu / r.portionen.menge, "portionen");
      }
    }
  };
  const skala = () => skalaVon(r);
  const portionen = $("#ziel-portionen", pane);
  if (portionen)
    portionen.oninput = () => {
      const v = leseZahl(portionen.value);
      if (v > 0) {
        skala().portionen = v;
        setzeFaktor(r, v / r.portionen.menge, "portionen");
      }
    };
  const faktor = $("#faktor", pane);
  if (faktor)
    faktor.oninput = () => {
      const v = leseZahl(faktor.value);
      if (v > 0) setzeFaktor(r, v, "faktor");
    };
  const wahl = $("#zutat-wahl", pane), ziel = $("#zutat-ziel", pane), einheitWahl = $("#zutat-einheit", pane);
  const rechneZutat = () => {
    const st = skala();
    const z = r.zutaten[st.zutat];
    const v = leseZahl(ziel.value);
    st.zutatZiel = v > 0 ? v : null;
    const f = faktorAusZutat(z, v, st.zutatEinheit);
    if (f) setzeFaktor(r, f, "zutat");
  };
  if (wahl)
    wahl.onchange = () => {
      const st = skala();
      st.zutat = Number(wahl.value);
      const z = r.zutaten[st.zutat];
      st.zutatEinheit = standardZielEinheit(z);
      einheitWahl.innerHTML = zielEinheiten(z).map((e) => `<option ${e === st.zutatEinheit ? "selected" : ""}>${esc(e)}</option>`).join("");
      ziel.placeholder = zahl(z.menge);
      ziel.value = "";
      st.zutatZiel = null;
    };
  if (ziel) ziel.oninput = rechneZutat;
  if (einheitWahl)
    einheitWahl.onchange = () => {
      skala().zutatEinheit = einheitWahl.value;
      rechneZutat();
    };
}

async function schalteFavorit(r, knopf) {
  const an = !S.favoriten.has(r.id);
  if (an) S.favoriten.add(r.id);
  else S.favoriten.delete(r.id);
  knopf.setAttribute("aria-pressed", String(an));
  knopf.setAttribute("aria-label", an ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen");
  try {
    await db.setzeFavorit(r.id, an);
  } catch {
    zeigeToast("Favorit konnte nicht gespeichert werden.");
  }
  zeigeToast(an ? "Zu Favoriten hinzugefügt" : "Aus Favoriten entfernt");
  renderListe();
}

// ---------------------------------------------------------------------------
// Einkaufsliste
// ---------------------------------------------------------------------------
function einkaufsText(r) {
  const s = skalaVon(r);
  const hinweis = mengenHinweis(r);
  const zeilen = [`${r.titel}${hinweis ? ` (${hinweis})` : ""}`];
  const mitGruppen = zeigeGruppen(r);
  let gruppe = null;
  for (const z of r.zutaten) {
    if (mitGruppen && (z.gruppe || "") !== gruppe) {
      gruppe = z.gruppe || "";
      if (gruppe) zeilen.push("", `${gruppe}:`);
    }
    const m = mengeText(z, s.faktor);
    zeilen.push(`- ${[m, String(z.zutat || "").replace(/\t+/g, " ")].filter(Boolean).join(" ")}`);
  }
  return zeilen.join("\n");
}

async function kopiereEinkaufsliste(r) {
  const text = einkaufsText(r);
  try {
    await navigator.clipboard.writeText(text);
    zeigeToast("Zutaten kopiert – z. B. in Notizen oder Erinnerungen einfügen");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    zeigeToast(ok ? "Zutaten kopiert" : "Kopieren nicht möglich");
  }
}

async function teileEinkaufsliste(r) {
  try {
    await navigator.share({ title: r.titel, text: einkaufsText(r) });
  } catch (e) {
    if (e?.name !== "AbortError") kopiereEinkaufsliste(r);
  }
}

// ---------------------------------------------------------------------------
// Kochmodus
// ---------------------------------------------------------------------------
function ladeHaken(id) {
  try {
    return new Set(JSON.parse(localStorage.getItem("koch." + id) || "[]"));
  } catch {
    return new Set();
  }
}
function speichereHaken(id, set) {
  try {
    if (set.size) localStorage.setItem("koch." + id, JSON.stringify([...set]));
    else localStorage.removeItem("koch." + id);
  } catch {}
}

function zeigeKochen(r) {
  const k = $("#kochen");
  const haken = ladeHaken(r.id);
  const s = skalaVon(r);
  const hinweis = mengenHinweis(r);
  const zeile = (schluessel, inhalt, klasse = "") =>
    `<li class="${klasse}"><label class="haken"><input type="checkbox" data-haken="${esc(schluessel)}" ${haken.has(schluessel) ? "checked" : ""}><span class="haken-box" aria-hidden="true"></span><span class="haken-text">${inhalt}</span></label></li>`;

  let zutaten = "";
  if (r.zutaten.length) {
    zutaten = `<section class="kochen-block"><h2>Zutaten${hinweis ? ` <small>${esc(hinweis)}</small>` : ""}</h2><ul class="haken-liste">${r.zutaten
      .map((z, i) => {
        const m = mengeText(z, s.faktor);
        return zeile(`z${i}`, `${m ? `<b>${esc(m)}</b> ` : ""}${esc(String(z.zutat || "").replace(/\t+/g, " "))}${z.vorbereitung ? ` <span class="vorbereitung">${esc(z.vorbereitung)}</span>` : ""}`);
      })
      .join("")}</ul></section>`;
  }
  let schritte = "";
  for (const [name, liste] of Object.entries(r.abschnitte)) {
    if (!liste?.length) continue;
    let nr = 0;
    schritte += `<section class="kochen-block"><h2>${esc(name)}</h2><ul class="haken-liste schritt-liste">${liste
      .map((t, i) =>
        istZwischentitel(t)
          ? `<li class="zwischentitel">${esc(t)}</li>`
          : zeile(`s:${name}:${i}`, `<span class="schritt-nr">${++nr}</span>${esc(t)}`, "schritt")
      )
      .join("")}</ul></section>`;
  }
  if (!schritte && textZeigen(r)) schritte = `<section class="kochen-block"><h2>Rezepttext</h2><div class="freitext">${esc(r.text)}</div></section>`;

  k.innerHTML = `<header class="kochen-kopf">
      <button type="button" class="knopf knopf-zweit" data-aktion="beenden">${ICON.schliessen} Beenden</button>
      <div class="kochen-titel"><strong>${esc(r.titel)}</strong><span id="wach-status" class="wach-status"></span></div>
      <div class="fortschritt" aria-hidden="true"><div id="fortschritt-balken"></div></div>
    </header>
    <div class="kochen-inhalt">
      ${zutaten}${schritte}
      <p class="kochen-fuss"><span id="fortschritt-text"></span>
      <button type="button" class="knopf knopf-leise" data-aktion="haken-weg">Alle Häkchen entfernen</button></p>
    </div>`;

  const fortschritt = () => {
    const alle = $$('.schritt input[type="checkbox"]', k);
    const erledigt = alle.filter((c) => c.checked).length;
    $("#fortschritt-balken", k).style.width = alle.length ? `${(100 * erledigt) / alle.length}%` : "0";
    $("#fortschritt-text", k).textContent = alle.length ? `${erledigt} von ${alle.length} Schritten erledigt` : "";
  };
  k.onchange = (e) => {
    const c = e.target.closest("[data-haken]");
    if (!c) return;
    if (c.checked) haken.add(c.dataset.haken);
    else haken.delete(c.dataset.haken);
    speichereHaken(r.id, haken);
    fortschritt();
  };
  k.onclick = (e) => {
    const b = e.target.closest("[data-aktion]");
    if (!b) return;
    if (b.dataset.aktion === "beenden") {
      if (S.verlauf.length > 1) history.back();
      else location.replace(`#/r/${encodeURIComponent(r.id)}`);
    }
    if (b.dataset.aktion === "haken-weg") {
      haken.clear();
      speichereHaken(r.id, haken);
      for (const c of $$("[data-haken]", k)) c.checked = false;
      fortschritt();
    }
  };
  fortschritt();

  k.hidden = false;
  document.body.classList.add("im-kochmodus");
  S.kochId = r.id;
  k.scrollTop = 0;
  wachHalten(true);
}

function beendeKochen() {
  if (!S.kochId) return;
  S.kochId = null;
  $("#kochen").hidden = true;
  $("#kochen").innerHTML = "";
  document.body.classList.remove("im-kochmodus");
  wachHalten(false);
}

async function wachHalten(an) {
  const status = (t) => {
    const el = $("#wach-status");
    if (el) el.textContent = t;
  };
  if (!an) {
    try {
      await S.wake?.release();
    } catch {}
    S.wake = null;
    return;
  }
  if (!("wakeLock" in navigator)) return status("Bildschirm-Sperre: bitte manuell verlängern");
  try {
    S.wake = await navigator.wakeLock.request("screen");
    status("Bildschirm bleibt an");
    S.wake.addEventListener("release", () => {
      if (S.kochId) status("Bildschirm kann ausgehen");
    });
  } catch {
    status("Bildschirm kann ausgehen");
  }
}

// ---------------------------------------------------------------------------
// Verwaltung und Import
// ---------------------------------------------------------------------------
async function zeigeVerwaltung() {
  S.aktiv = null;
  setzeAnsicht("detail");
  document.title = "Rezepte verwalten";
  const m = S.meta;
  const datum = m?.datum ? new Date(m.datum).toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short" }) : "";
  let dauerhaft = "unbekannt";
  try {
    if (navigator.storage?.persisted) dauerhaft = (await navigator.storage.persisted()) ? "ja" : "nein (der Browser darf bei Platzmangel löschen)";
  } catch {}
  const offline = navigator.serviceWorker?.controller ? "ja" : "noch nicht (App einmal neu laden)";
  const anzahl = S.rezepte.length;

  $("#detail-pane").innerHTML = `<article class="verwaltung">
    <div class="rezept-leiste">
      <button type="button" class="knopf-icon" data-aktion="zurueck" aria-label="Zurück">${ICON.zurueck}</button>
    </div>
    <h1>Rezepte verwalten</h1>
    <section class="karte">
      <h2 class="karte-titel">Auf diesem Gerät</h2>
      <p class="zahl-gross">${anzahl} Rezepte</p>
      <p>${m ? `Importiert am ${esc(datum)} aus «${esc(m.datei)}».` : "Noch keine Rezepte importiert."}</p>
      ${m?.bericht ? `<p class="leise">Letzter Import: ${esc(m.bericht)}</p>` : ""}
      ${iosImBrowser ? '<p class="hinweis-ios"><strong>Hinweis:</strong> Du bist im Safari-Tab. Installiere die App zuerst (Teilen → «Zum Home-Bildschirm») und importiere dort – Safari und die App speichern getrennt.</p>' : ""}
      ${m?.unbereinigt ? '<p class="warnung">Die importierte Datei war nicht sprachbereinigt. Besser <strong>rezepte_de.json</strong> verwenden.</p>' : ""}
      <button type="button" class="knopf knopf-gross" data-aktion="importieren">${anzahl ? "Rezepte aktualisieren" : "Rezepte importieren"}</button>
      <p class="klein">Datei <strong>rezepte_de.json</strong> oder eine exportierte Sicherung wählen. Beim Aktualisieren werden alle Rezepte ersetzt; Favoriten bleiben erhalten.</p>
    </section>
    ${anzahl ? `<section class="karte">
      <h2 class="karte-titel">Exportieren (Sicherung)</h2>
      <p>Speichert alle ${anzahl} Rezepte und ${S.favoriten.size} Favoriten in einer JSON-Datei. Mit «Rezepte importieren» lässt sie sich auf jedem Gerät wieder einlesen.</p>
      <button type="button" class="knopf knopf-zweit knopf-breit" data-aktion="exportieren">${ICON.export} Alle Rezepte exportieren</button>
      <p class="klein">${istIOS ? "iPhone: Im Teilen-Menü «In Dateien sichern» wählen, z. B. in OneDrive." : "Windows: Die Datei landet im Ordner «Downloads»."}</p>
    </section>` : ""}
    <section class="karte">
      <h2 class="karte-titel">Wo ist die Datei?</h2>
      <p><strong>iPhone:</strong> Im Auswahlfenster «Durchsuchen» → OneDrive → Ordner <em>Rezept-App</em> → <em>daten</em>.</p>
      <p><strong>Windows:</strong> Im OneDrive-Ordner unter <em>Rezept-App\\daten</em>.</p>
    </section>
    <section class="karte">
      <h2 class="karte-titel">Offline und Speicher</h2>
      <ul class="status-liste">
        <li><span>Offline bereit</span><span>${esc(offline)}</span></li>
        <li><span>Dauerhaft gespeichert</span><span>${esc(dauerhaft)}</span></li>
        <li><span>Favoriten</span><span>${S.favoriten.size}</span></li>
        <li><span>App-Version</span><span>${APP_VERSION}</span></li>
      </ul>
    </section>
    ${anzahl ? `<section class="karte karte-gefahr">
      <h2 class="karte-titel">Daten entfernen</h2>
      <p>Löscht alle Rezepte und Favoriten von diesem Gerät. Die Datei im OneDrive bleibt unverändert.</p>
      <button type="button" class="knopf knopf-gefahr" data-aktion="alles-loeschen">Alles von diesem Gerät löschen</button>
    </section>` : ""}
  </article>`;

  $("#detail-pane").onclick = async (e) => {
    const b = e.target.closest("[data-aktion]");
    if (!b) return;
    if (b.dataset.aktion === "zurueck") zurueck();
    if (b.dataset.aktion === "exportieren") exportiere();
    if (b.dataset.aktion === "alles-loeschen") {
      if (!confirm("Wirklich alle Rezepte und Favoriten von diesem Gerät löschen?")) return;
      await db.loescheAlles();
      S.favoriten = new Set();
      S.meta = null;
      S.skala.clear();
      setzeRezepte([]);
      fuelleFilter();
      zeigeToast("Alle Daten auf diesem Gerät gelöscht");
      location.replace("#/");
      renderListe();
    }
  };
  window.scrollTo(0, 0);
  renderListe();
}

const istRezept = (r) => r && typeof r === "object" && typeof r.titel === "string" && Array.isArray(r.zutaten);

async function sha1(text) {
  if (crypto?.subtle) {
    const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 0x811c9dc5; // Ersatz ohne sichere Umgebung (FNV-1a)
  for (const c of new TextEncoder().encode(text)) h = Math.imul(h ^ c, 0x01000193) >>> 0;
  return h.toString(16).padStart(10, "0");
}

// Gleiche id-Bildung wie update_de.py, falls eine unbereinigte rezepte.json importiert wird
async function ergaenzeIds(liste) {
  const gesehen = new Map();
  for (const r of liste) {
    if (r.id) continue;
    const schluessel = ["quelle", "datei", "blatt", "titel"].map((k) => (r[k] ? String(r[k]) : "")).join("|");
    let id = (await sha1(schluessel)).slice(0, 10);
    const n = (gesehen.get(id) || 0) + 1;
    gesehen.set(id, n);
    if (n > 1) id = `${id}-${n}`;
    r.id = id;
  }
}

// Sicherung aller Rezepte und Favoriten als JSON-Datei.
// Format: { format: "rezepte-app", version, exportiert, anzahl, favoriten: [id], rezepte: [...] }
async function exportiere() {
  const heute = new Date();
  const datum = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, "0")}-${String(heute.getDate()).padStart(2, "0")}`;
  const name = `rezepte_sicherung_${datum}.json`;
  const inhalt = {
    format: "rezepte-app",
    version: 1,
    exportiert: heute.toISOString(),
    anzahl: S.rezepte.length,
    favoriten: [...S.favoriten],
    rezepte: S.rezepte,
  };
  const blob = new Blob([JSON.stringify(inhalt, null, 1)], { type: "application/json" });
  const datei = new File([blob], name, { type: "application/json" });
  // iPhone: Teilen-Menü («In Dateien sichern»); sonst normaler Download
  if (istIOS && navigator.canShare?.({ files: [datei] })) {
    try {
      await navigator.share({ files: [datei], title: name });
      zeigeToast("Sicherung erstellt");
    } catch (e) {
      if (e?.name !== "AbortError") zeigeToast("Export nicht möglich: " + (e?.message || e), 6000);
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  zeigeToast(`${S.rezepte.length} Rezepte exportiert: ${name}`, 5000);
}

async function importiereDatei(datei) {
  zeigeToast("Rezepte werden gelesen …", 0);
  let daten, favoritenAusSicherung = null;
  try {
    daten = JSON.parse(await datei.text());
  } catch {
    return zeigeToast("Das ist keine gültige Rezeptdatei. Bitte rezepte_de.json wählen.", 6000);
  }
  // Eigene Sicherung (Export) enthält Rezepte und Favoriten
  if (daten && !Array.isArray(daten) && Array.isArray(daten.rezepte)) {
    favoritenAusSicherung = Array.isArray(daten.favoriten) ? daten.favoriten.map(String) : null;
    daten = daten.rezepte;
  }
  if (!Array.isArray(daten) || !daten.length || !daten.every(istRezept)) {
    return zeigeToast("Die Datei enthält keine Rezeptliste. Bitte rezepte_de.json wählen.", 6000);
  }
  const ohneId = daten.some((r) => !r.id);
  if (ohneId) await ergaenzeIds(daten);
  // doppelte ids absichern
  const ids = new Set();
  for (const r of daten) {
    let id = String(r.id), n = 1;
    while (ids.has(id)) id = `${r.id}-${++n}`;
    r.id = id;
    ids.add(id);
  }

  const alt = new Map(S.rezepte.map((r) => [r.id, JSON.stringify(r)]));
  const erstimport = alt.size === 0;
  let neu = 0, geaendert = 0;
  for (const r of daten) {
    const a = alt.get(r.id);
    if (a === undefined) neu++;
    else if (a !== JSON.stringify(r)) geaendert++;
    alt.delete(r.id);
  }
  const entfernt = alt.size;
  const bericht = erstimport ? `${daten.length} Rezepte importiert` : `${neu} neu, ${geaendert} geändert, ${entfernt} entfernt`;
  const meta = { datum: new Date().toISOString(), datei: datei.name, anzahl: daten.length, bericht, unbereinigt: ohneId };
  try {
    await db.ersetzeRezepte(daten, meta);
  } catch (e) {
    console.error(e);
    return zeigeToast("Speichern fehlgeschlagen. Ist genug Speicherplatz frei?", 6000);
  }
  S.meta = meta;
  S.skala.clear();
  setzeRezepte(daten);
  // Favoriten aus einer Sicherung dazunehmen (bestehende bleiben)
  let neueFavoriten = 0;
  if (favoritenAusSicherung) {
    for (const id of favoritenAusSicherung) {
      if (!S.nachId.has(id) || S.favoriten.has(id)) continue;
      S.favoriten.add(id);
      neueFavoriten++;
      try {
        await db.setzeFavorit(id, true);
      } catch {}
    }
  }
  fuelleFilter();
  try {
    await navigator.storage?.persist?.();
  } catch {}
  const favText = neueFavoriten ? `, ${neueFavoriten} Favoriten übernommen` : "";
  zeigeToast((erstimport ? `${daten.length} Rezepte importiert` : `Aktualisiert: ${bericht}`) + favText, 5000);
  if (ohneId) setTimeout(() => zeigeToast("Hinweis: Datei war nicht sprachbereinigt (rezepte_de.json verwenden).", 6000), 5200);
  if (location.hash.startsWith("#/import")) zeigeVerwaltung();
  else route();
  renderListe();
}

// ---------------------------------------------------------------------------
// Allgemeines
// ---------------------------------------------------------------------------
let toastTimer = null;
function zeigeToast(text, dauer = 3000) {
  const t = $("#toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  if (dauer) toastTimer = setTimeout(() => (t.hidden = true), dauer);
}

function bindeGlobal() {
  const datei = $("#datei");
  // Auf dem iPhone ohne Filter, damit die JSON-Datei im Auswahlfenster sicher wählbar ist
  if (!istIOS) datei.setAttribute("accept", ".json,application/json");
  for (const h of $$(".hinweis-ios")) h.hidden = !iosImBrowser;
  datei.addEventListener("change", () => {
    const f = datei.files?.[0];
    datei.value = "";
    if (f) importiereDatei(f);
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest('[data-aktion="importieren"]')) datei.click();
  });
  document.addEventListener("keydown", (e) => {
    const inFeld = e.target.closest("input, select, textarea");
    if (e.key === "Escape" && S.kochId) {
      e.preventDefault();
      $('[data-aktion="beenden"]')?.click();
    } else if (e.key === "/" && !inFeld) {
      e.preventDefault();
      if (document.body.dataset.ansicht !== "liste" && schmal()) location.hash = "#/";
      $("#suche").focus();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && S.kochId) wachHalten(true);
  });
  // Bei Wechsel schmal/breit neu zeichnen, damit die Liste in der breiten Ansicht gefüllt ist
  matchMedia("(min-width: 900px)").addEventListener("change", () => renderListe());
}

function registriereServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("./sw.js")
    .then((reg) => {
      const zeigeUpdate = (worker) => {
        const u = $("#update");
        u.hidden = false;
        $("#btn-update").onclick = () => {
          S.updateAngefordert = true;
          worker.postMessage("skipWaiting");
        };
      };
      if (reg.waiting && navigator.serviceWorker.controller) zeigeUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) zeigeUpdate(w);
        });
      });
      // beim Öffnen der App nach Updates schauen
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    })
    .catch((e) => console.warn("Service Worker nicht registriert:", e));
  // Nur neu laden, wenn der Nutzer das Update angefordert hat (nicht bei der Erstinstallation)
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!S.updateAngefordert) return;
    S.updateAngefordert = false;
    location.reload();
  });
}

start();
