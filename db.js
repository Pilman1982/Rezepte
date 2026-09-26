// Lokale Datenbank (IndexedDB). Die Rezepte bleiben auf dem Gerät.

const NAME = "rezepte-app";
const VERSION = 1;
let dbPromise = null;

function oeffne() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((ok, fehler) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("rezepte")) db.createObjectStore("rezepte", { keyPath: "id" });
      if (!db.objectStoreNames.contains("favoriten")) db.createObjectStore("favoriten", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fehler(req.error);
  });
  return dbPromise;
}

function anfrage(req) {
  return new Promise((ok, fehler) => {
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fehler(req.error);
  });
}

function fertig(tx) {
  return new Promise((ok, fehler) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => fehler(tx.error);
    tx.onabort = () => fehler(tx.error || new Error("Abgebrochen"));
  });
}

export async function alleRezepte() {
  const db = await oeffne();
  return anfrage(db.transaction("rezepte").objectStore("rezepte").getAll());
}

// Ersetzt alle Rezepte in einem Schritt (alles oder nichts). Favoriten bleiben unberührt.
export async function ersetzeRezepte(rezepte, meta) {
  const db = await oeffne();
  const tx = db.transaction(["rezepte", "meta"], "readwrite");
  const store = tx.objectStore("rezepte");
  store.clear();
  for (const r of rezepte) store.put(r);
  tx.objectStore("meta").put(meta, "import");
  return fertig(tx);
}

export async function loescheAlles() {
  const db = await oeffne();
  const tx = db.transaction(["rezepte", "meta", "favoriten"], "readwrite");
  tx.objectStore("rezepte").clear();
  tx.objectStore("meta").clear();
  tx.objectStore("favoriten").clear();
  return fertig(tx);
}

export async function leseMeta(schluessel) {
  const db = await oeffne();
  return anfrage(db.transaction("meta").objectStore("meta").get(schluessel));
}

export async function favoriten() {
  const db = await oeffne();
  const liste = await anfrage(db.transaction("favoriten").objectStore("favoriten").getAll());
  return new Set(liste.map((f) => f.id));
}

export async function setzeFavorit(id, an) {
  const db = await oeffne();
  const tx = db.transaction("favoriten", "readwrite");
  if (an) tx.objectStore("favoriten").put({ id, seit: Date.now() });
  else tx.objectStore("favoriten").delete(id);
  return fertig(tx);
}
