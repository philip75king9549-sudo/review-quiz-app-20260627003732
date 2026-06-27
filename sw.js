const CACHE_NAME = "review-quiz-76962b57821e";
const PRECACHE_ASSETS = [
  "./",
  "./apple-touch-icon.png",
  "./assets/index-BjiDM20J.js",
  "./assets/index-CmEFvcqk.css",
  "./assets/index-DpzbJSWF.js",
  "./assets/pdf-CcZYcL52.js",
  "./assets/pdf.worker.min-DgRcL-GR.js",
  "./assets/pdf.worker.min-yatZIOMy.mjs",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./icon.svg",
  "./index.html",
  "./manifest.webmanifest"
];
const scopeUrl = new URL(self.registration.scope);
const scopeRoot = new URL("./", scopeUrl).toString();
const indexUrl = new URL("./index.html", scopeUrl).toString();
const assetUrls = PRECACHE_ASSETS.map((asset) => new URL(asset, scopeUrl).toString());

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(assetUrls)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      caches
        .match(indexUrl)
        .then((cached) => cached || caches.match(scopeRoot))
        .then((cached) => cached || fetch(event.request)),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok && (response.type === "basic" || response.type === "cors")) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        }),
    ),
  );
});
