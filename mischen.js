// Rezepte aus einer zusätzlichen Datei in den Bestand mischen («Rezepte hinzufügen»).
// Reine Funktion ohne Seiteneffekte, damit sie in werkzeuge/tests.html geprüft werden kann.
//
// Regeln:
// - Gleiche id: der neue Eintrag ersetzt den alten (zählt als «aktualisiert», wenn er sich unterscheidet).
// - Neue id: wird angehängt.
// - Feld «ersetzt»: Liste alter ids, die entfernt werden (z. B. ein neu abgeschriebenes Rezept löst
//   das alte ab). Das Feld selbst wird nicht gespeichert; ersetztDurch merkt sich alt -> neu,
//   damit Favoriten übertragen werden können.
export function mischeRezepte(bestehend, neue) {
  const nachId = new Map(bestehend.map((r) => [r.id, r]));
  const reihenfolge = bestehend.map((r) => r.id);
  const ersetztDurch = new Map();
  let neu = 0, aktualisiert = 0, unveraendert = 0;

  for (const eingang of neue) {
    const { ersetzt, ...r } = eingang;
    for (const altId of Array.isArray(ersetzt) ? ersetzt : []) {
      if (altId !== r.id && nachId.has(altId)) {
        nachId.delete(altId);
        ersetztDurch.set(altId, r.id);
      }
    }
    if (nachId.has(r.id)) {
      if (JSON.stringify(nachId.get(r.id)) === JSON.stringify(r)) unveraendert++;
      else aktualisiert++;
    } else {
      reihenfolge.push(r.id);
      neu++;
    }
    nachId.set(r.id, r);
  }
  const rezepte = reihenfolge.filter((id) => nachId.has(id)).map((id) => nachId.get(id));
  return { rezepte, neu, aktualisiert, unveraendert, entfernt: ersetztDurch.size, ersetztDurch };
}

export function mischBericht(e) {
  const teile = [`${e.neu} neu`, `${e.aktualisiert} aktualisiert`];
  if (e.entfernt) teile.push(`${e.entfernt} ersetzt`);
  if (e.unveraendert) teile.push(`${e.unveraendert} unverändert`);
  return teile.join(", ");
}
