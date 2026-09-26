// Mengen umrechnen, Einheiten umstellen und sinnvoll runden.

// Einheit (klein geschrieben) -> [Art, Faktor zur Basis, Anzeige]
// Basis: Masse in g, Volumen in ml. Stück und Löffel werden auf halbe gerundet.
const TABELLE = {
  "g": ["masse", 1, "g"], "g.": ["masse", 1, "g"], "gr": ["masse", 1, "g"], "gr.": ["masse", 1, "g"],
  "gramm": ["masse", 1, "g"],
  "kg": ["masse", 1000, "kg"], "kg.": ["masse", 1000, "kg"], "kilogramm": ["masse", 1000, "kg"],
  "mg": ["masse", 0.001, "mg"],
  "ml": ["volumen", 1, "ml"], "cl": ["volumen", 10, "cl"],
  "dl": ["volumen", 100, "dl"], "dl.": ["volumen", 100, "dl"],
  "l": ["volumen", 1000, "l"], "l.": ["volumen", 1000, "l"], "liter": ["volumen", 1000, "l"],
  "lt": ["volumen", 1000, "l"], "lt.": ["volumen", 1000, "l"], "lit.": ["volumen", 1000, "l"],
  "ltr": ["volumen", 1000, "l"], "ltr.": ["volumen", 1000, "l"],
  "1": ["volumen", 1000, "l"], // OCR-Fehler im Original: «0.1 1 Vollrahm» = 0.1 l
  "": ["stueck", 1, ""], "x": ["stueck", 1, "x"],
  "stk": ["stueck", 1, "Stk."], "stk.": ["stueck", 1, "Stk."], "st": ["stueck", 1, "Stk."],
  "st.": ["stueck", 1, "Stk."], "stück": ["stueck", 1, "Stück"], "stk. 1": ["stueck", 1, "Stk."],
  "bund": ["stueck", 1, "Bund"], "bd": ["stueck", 1, "Bund"], "bd.": ["stueck", 1, "Bund"],
  "blatt": ["stueck", 1, "Blatt"], "bl.": ["stueck", 1, "Blatt"], "blätter": ["stueck", 1, "Blätter"],
  "zweig": ["stueck", 1, "Zweig"], "zweige": ["stueck", 1, "Zweige"], "zwei.": ["stueck", 1, "Zweige"],
  "zehe": ["stueck", 1, "Zehe"], "zehen": ["stueck", 1, "Zehen"],
  "scheibe": ["stueck", 1, "Scheibe"], "scheiben": ["stueck", 1, "Scheiben"],
  "sch.": ["stueck", 1, "Scheiben"], "sch": ["stueck", 1, "Scheiben"],
  "dose": ["stueck", 1, "Dose"], "dosen": ["stueck", 1, "Dosen"], "sack": ["stueck", 1, "Sack"],
  "kleine": ["stueck", 1, "kleine"], "handvoll": ["stueck", 1, "Handvoll"],
  "pack.": ["stueck", 1, "Pack."], "packung": ["stueck", 1, "Packung"], "päckli": ["stueck", 1, "Päckli"],
  "sträusschen": ["stueck", 1, "Sträusschen"], "kl. sträusschen": ["stueck", 1, "kl. Sträusschen"],
  "str.": ["stueck", 1, "Sträusschen"], "teil": ["stueck", 1, "Teil"], "teile": ["stueck", 1, "Teile"],
  "tasse": ["loeffel", 1, "Tasse"], "tassen": ["loeffel", 1, "Tassen"],
  "msp.": ["loeffel", 1, "Msp."], "msp": ["loeffel", 1, "Msp."],
  "el": ["loeffel", 1, "EL"], "el.": ["loeffel", 1, "EL"], "esslöffel": ["loeffel", 1, "EL"],
  "tl": ["loeffel", 1, "TL"], "tl.": ["loeffel", 1, "TL"], "teelöffel": ["loeffel", 1, "TL"],
  "prise": ["loeffel", 1, "Prise"], "prisen": ["loeffel", 1, "Prisen"], "pr": ["loeffel", 1, "Prise"],
  "messerspitze": ["loeffel", 1, "Msp."], "messerspitzen": ["loeffel", 1, "Msp."],
  "spritzer": ["loeffel", 1, "Spritzer"], "schuss": ["loeffel", 1, "Schuss"],
};

export function einheit(roh) {
  const schluessel = (roh || "").trim().toLowerCase();
  const t = TABELLE[schluessel];
  if (t) return { art: t[0], basis: t[1], label: t[2] };
  return { art: "sonst", basis: 1, label: (roh || "").trim() };
}

const rundeAuf = (x, schritt) => Math.round(x / schritt) * schritt;

// Zahl ohne unnötige Nachkommastellen, Dezimalpunkt wie in der Schweiz üblich
export function zahl(x) {
  const r = Math.round(x * 100) / 100;
  return String(r);
}

// 1.5 -> «1½», 0.5 -> «½»
function halbe(x) {
  let r = Math.round(x * 2) / 2;
  if (r === 0 && x > 0) r = 0.5;
  const ganz = Math.floor(r);
  const halb = r - ganz >= 0.5 ? "½" : "";
  return ganz === 0 ? (halb || "0") : `${ganz}${halb}`;
}

function formatMasse(g, orig) {
  if (orig === "mg" && g < 1) return [String(Math.max(1, Math.round(g * 1000))), "mg"];
  let r;
  if (g < 1) r = Math.max(0.1, rundeAuf(g, 0.1));
  else if (g < 10) r = Math.round(g);          // unter 10 g auf 1 g
  else r = rundeAuf(g, 5);                    // darüber auf 5 g
  if (r >= 1000) return [zahl(rundeAuf(g, 10) / 1000), "kg"]; // ab 1000 g in kg (auf 10 g genau)
  return [zahl(r), "g"];
}

function liter(ml) {
  const l = ml / 1000;
  return zahl(l < 10 ? rundeAuf(l, 0.05) : rundeAuf(l, 0.1));
}

function formatVolumen(ml, orig) {
  if (orig === "ml" || orig === "cl") {
    if (ml >= 1000) return [liter(ml), "l"];
    const r = ml < 10 ? Math.max(1, Math.round(ml)) : ml < 100 ? rundeAuf(ml, 5) : rundeAuf(ml, 10);
    return r >= 1000 ? ["1", "l"] : [zahl(r), "ml"];
  }
  // dl und l: ab 10 dl in Liter, sonst dl (auf 0.1 dl genau)
  if (ml < 5) return [String(Math.max(1, Math.round(ml))), "ml"];
  const dl = rundeAuf(ml / 100, 0.1);
  if (dl >= 10) return [liter(ml), "l"];
  return [zahl(dl), "dl"];
}

// Anzeige einer Menge. Gibt { wert, einheit, orig } zurück; orig nur wenn umgerechnet wurde.
export function menge(zutat, faktor = 1) {
  const e = einheit(zutat.einheit);
  // Ohne Menge nur Wörter wie «wenig» anzeigen, keine nackten Einheiten wie «g»
  if (zutat.menge == null || !isFinite(zutat.menge)) return { wert: "", einheit: e.art === "sonst" ? e.label : "", orig: null };
  // «1 x Salz, Pfeffer abschmecken» ist in der Kartei ein Platzhalter für «nach Belieben»
  if (e.label === "x" && zutat.menge === 1) return { wert: "", einheit: "", orig: null };
  const original = { wert: e.art === "stueck" || e.art === "loeffel" ? schoeneZahl(zutat.menge) : zahl(zutat.menge), einheit: e.label };
  if (Math.abs(faktor - 1) < 1e-9) return { ...original, orig: null };
  const v = zutat.menge * faktor;
  let wert, einh;
  if (e.art === "masse") [wert, einh] = formatMasse(v * e.basis, e.label);
  else if (e.art === "volumen") [wert, einh] = formatVolumen(v * e.basis, e.label);
  else if (e.art === "stueck" || e.art === "loeffel") [wert, einh] = [halbe(v), mehrzahl(e.label, Math.round(v * 2) / 2)];
  else [wert, einh] = [zahl(v < 10 ? rundeAuf(v, 0.1) : Math.round(v)), e.label];
  return { wert, einheit: einh, orig: `${original.wert} ${original.einheit}`.trim() };
}

const MEHRZAHL = { Prise: "Prisen", Zehe: "Zehen", Scheibe: "Scheiben", Dose: "Dosen", Zweig: "Zweige", Tasse: "Tassen", Teil: "Teile" };
const mehrzahl = (label, wert) => (wert > 1 && MEHRZAHL[label]) || label;

// Originalwert: halbe und viertel als Bruch, sonst normale Zahl
function schoeneZahl(x) {
  if (Math.abs(x * 2 - Math.round(x * 2)) < 1e-9 && x % 1 !== 0) return halbe(x);
  const viertel = { 0.25: "¼", 0.75: "¾" }[x % 1];
  return viertel ? `${Math.floor(x) || ""}${viertel}` : zahl(x);
}

export function mengeText(zutat, faktor = 1) {
  const m = menge(zutat, faktor);
  return `${m.wert} ${m.einheit}`.trim();
}

// Einheiten, in denen eine Zielmenge für diese Zutat eingegeben werden kann
export function zielEinheiten(zutat) {
  const e = einheit(zutat.einheit);
  if (e.art === "masse") return ["g", "kg"];
  if (e.art === "volumen") return ["ml", "dl", "l"];
  return [e.label];
}

const BASIS = { g: 1, kg: 1000, mg: 0.001, ml: 1, cl: 10, dl: 100, l: 1000 };

// Faktor aus gewünschter Zielmenge einer Zutat
export function faktorAusZutat(zutat, zielWert, zielEinheit) {
  if (!zutat || !zutat.menge || !(zielWert > 0)) return null;
  const e = einheit(zutat.einheit);
  if ((e.art === "masse" || e.art === "volumen") && BASIS[zielEinheit]) {
    return (zielWert * BASIS[zielEinheit]) / (zutat.menge * e.basis);
  }
  return zielWert / zutat.menge;
}

// Standard-Zieleinheit für eine Zutat (die Originaleinheit, sofern auswählbar)
export function standardZielEinheit(zutat) {
  const e = einheit(zutat.einheit);
  const liste = zielEinheiten(zutat);
  return liste.includes(e.label) ? e.label : liste[0];
}

// «1,5» oder «1.5» oder «½» -> 1.5
export function leseZahl(s) {
  if (typeof s === "number") return s;
  const t = String(s || "").trim().replace("½", ".5").replace("¼", ".25").replace("¾", ".75").replace(",", ".");
  const x = parseFloat(t.startsWith(".") ? "0" + t : t);
  return isFinite(x) ? x : NaN;
}
