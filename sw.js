/* Service worker CTA · application installable.
   Stratégie : réseau d'abord pour les pages et le code (les mises à jour du site
   arrivent immédiatement quand on est en ligne, le cache sert de secours hors
   ligne) ; cache d'abord pour les images. Les appels au backend (autre origine)
   ne sont jamais interceptés. */
var CACHE = "cta-app-v1";
var PRECACHE = [
  "./",
  "./index.html",
  "./connexion.html",
  "./espace.html",
  "./admin.html",
  "./mentions-legales.html",
  "./css/site.css",
  "./js/config.js",
  "./js/main.js",
  "./js/login.js",
  "./js/espace.js",
  "./js/admin.js",
  "./js/pwa.js",
  "./manifest.webmanifest",
  "./assets/logo-cta-transparent.png",
  "./assets/icon-192.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(PRECACHE).catch(function () { /* hors ligne au premier chargement */ });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // backend & CDN : jamais interceptés

  var isImage = /\.(png|jpe?g|webp|svg|ico)$/.test(url.pathname);
  if (isImage) {
    // Cache d'abord (les images ne changent pas)
    e.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
          return res;
        });
      })
    );
    return;
  }

  // Pages, CSS, JS : réseau d'abord, cache en secours
  e.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match("./index.html");
      });
    })
  );
});
