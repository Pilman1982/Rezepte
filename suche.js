// Volltextsuche über Titel, Zutaten und Zubereitung.
// Tolerant bei Umlauten (ä = a = ae), Akzenten, Gross/Klein und Tippfehlern.

export function normalisiere(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u");
}

export function woerter(s) {
  return normalisiere(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
}

// Gewichte pro Feld; daraus lässt sich auch ablesen, wo getroffen wurde
export const FELD = { titel: 10, zutaten: 5, meta: 3, zubereitung: 1, text: 0.5 };
export function feldName(gewicht) {
  if (gewicht >= FELD.titel) return "Titel";
  if (gewicht >= FELD.zutaten) return "Zutaten";
  if (gewicht >= FELD.meta) return "Kategorie/Herkunft";
  if (gewicht >= FELD.zubereitung) return "Zubereitung";
  return "Notizen";
}

// Begrenzte Damerau-Levenshtein-Distanz (optimal string alignment)
function distanz(a, b, max) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let vorvor = null, vor = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const akt = [i];
    let zeilenMin = i;
    for (let j = 1; j <= lb; j++) {
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(vor[j] + 1, akt[j - 1] + 1, vor[j - 1] + kosten);
      if (vorvor && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, vorvor[j - 2] + 1);
      akt[j] = v;
      if (v < zeilenMin) zeilenMin = v;
    }
    if (zeilenMin > max) return max + 1;
    vorvor = vor;
    vor = akt;
  }
  return vor[lb];
}

export class Suchindex {
  constructor(rezepte) {
    this.vok = new Map(); // Wort -> Map(Rezeptindex -> Gewicht)
    this.titel = [];
    rezepte.forEach((r, i) => {
      const add = (text, g) => {
        for (const w of woerter(text)) {
          let m = this.vok.get(w);
          if (!m) this.vok.set(w, (m = new Map()));
          if ((m.get(i) || 0) < g) m.set(i, g);
        }
      };
      add(r.titel, FELD.titel);
      add([r.kategorie, r.posten, r.quelle].join(" "), FELD.meta);
      for (const z of r.zutaten || []) add([z.zutat, z.vorbereitung, z.gruppe].join(" "), FELD.zutaten);
      for (const [name, schritte] of Object.entries(r.abschnitte || {})) add(name + " " + schritte.join(" "), FELD.zubereitung);
      add(r.text, FELD.text);
      this.titel[i] = normalisiere(r.titel);
    });
    this.liste = [...this.vok.keys()];
    this.cache = new Map();
  }

  // Alle Wörter im Index, die zu einem Suchwort passen: [[wort, qualität], ...]
  passend(such) {
    if (this.cache.has(such)) return this.cache.get(such);
    const max = such.length >= 8 ? 2 : such.length >= 4 ? 1 : 0;
    const res = [];
    for (const w of this.liste) {
      let q = 0;
      if (w === such) q = 1;
      else if (w.startsWith(such)) q = 0.9;
      else if (such.length >= 3 && w.includes(such)) q = 0.75; // zusammengesetzte Wörter: «rahm» in «vollrahm»
      else if (max) {
        const d = distanz(such, w, max);
        if (d <= max) q = d === 1 ? 0.6 : 0.4;
        else if (w.length > such.length && such.length >= 5) {
          // Tippfehler im Wortanfang: «schokolde» -> «schokoladensponge»
          const n = such.length;
          const d2 = Math.min(distanz(such, w.slice(0, n), max), distanz(such, w.slice(0, n + 1), max), distanz(such, w.slice(0, n - 1), max));
          if (d2 <= max) q = d2 === 1 ? 0.5 : 0.35;
        }
      }
      if (q) res.push([w, q]);
    }
    // Nichts gefunden: Tippfehler mitten in zusammengesetzten Wörtern («rham» -> «vollrahm»)
    if (!res.length && such.length >= 4) {
      const n = such.length, m1 = such.length >= 8 ? 2 : 1;
      for (const w of this.liste) {
        if (w.length <= n) continue;
        for (let s = 1; s + n - 1 <= w.length; s++) {
          if (distanz(such, w.slice(s, s + n), m1) <= m1) { res.push([w, 0.3]); break; }
        }
      }
    }
    this.cache.set(such, res);
    return res;
  }

  // Map(Rezeptindex -> { punkte, feld }) oder null bei leerer Suche. Alle Suchwörter müssen vorkommen.
  suche(anfrage) {
    const such = [...new Set(woerter(anfrage))];
    if (!such.length) return null;
    let ergebnis = null;
    for (const s of such) {
      const proWort = new Map();
      for (const [w, q] of this.passend(s)) {
        for (const [i, g] of this.vok.get(w)) {
          const p = q * g;
          const alt = proWort.get(i);
          if (!alt || p > alt.punkte) proWort.set(i, { punkte: p, feld: g });
        }
      }
      if (!ergebnis) ergebnis = proWort;
      else {
        const neu = new Map();
        for (const [i, a] of ergebnis) {
          const b = proWort.get(i);
          if (b) neu.set(i, { punkte: a.punkte + b.punkte, feld: Math.max(a.feld, b.feld) });
        }
        ergebnis = neu;
      }
      if (!ergebnis.size) break;
    }
    const ganz = normalisiere(anfrage).trim();
    // Bonus, wenn der ganze Suchbegriff im Titel steht
    for (const [i, treffer] of ergebnis) {
      if (this.titel[i].startsWith(ganz)) treffer.punkte += 15;
      else if (this.titel[i].includes(ganz)) treffer.punkte += 8;
    }
    return ergebnis;
  }
}
