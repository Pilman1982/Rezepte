// Service Worker: hält die App-Hülle offline bereit.
// Bei jeder Änderung an den App-Dateien VERSION erhöhen, sonst sehen die Geräte die neue Fassung nicht.
const VERSION = "rezepte-v1";
const DATEIEN = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./db.js",
  "./suche.js",
  "./umrechnen.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(DATEIEN)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (treffer) =>
        treffer ||
        fetch(req)
          .then((antwort) => {
            if (antwort.ok && antwort.type === "basic") {
              const kopie = antwort.clone();
              caches.open(VERSION).then((c) => c.put(req, kopie));
            }
            return antwort;
          })
          .catch(() => (req.mode === "navigate" ? caches.match("./index.html") : Response.error()))
    )
  );
});
