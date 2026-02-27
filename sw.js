const CACHE_NAME = "kaltab-v22";
const API_CACHE = "kaltab-api-v21";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192x192.png",
  "./icons/icon-512x512.png",
  "./css/styles.css",
  "./js/db.js",
  "./js/api-config.js",
  "./js/local-foods.js",
  "./js/state.js",
  "./js/search.js",
  "./js/favorites.js",
  "./js/relevance.js",
  "./js/food-list.js",
  "./js/modal.js",
  "./js/log-food.js",
  "./js/edit-entry.js",
  "./js/today.js",
  "./js/history.js",
  "./js/settings.js",
  "./js/goals-wizard.js",
  "./js/barcode.js",
  "./js/custom-food.js",
  "./js/navigation.js",
  "./js/qr-share.js",
  "./js/offline.js",
  "./js/events.js",
];

const API_HOST = "corsproxy.io";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME && k !== API_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API requests: network-first, cache as fallback
  if (url.hostname === API_HOST) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches
              .open(API_CACHE)
              .then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  // App assets: network-first, cache as fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
