/* Service worker CTA · application installable.
   Stratégie : réseau d'abord pour les pages et le code (les mises à jour du site
   arrivent immédiatement quand on est en ligne, le cache sert de secours hors
   ligne) ; cache d'abord pour les images. Les appels au backend (autre origine)
   ne sont jamais interceptés. */
var CACHE = "cta-app-v6";
var ASSET_V = "20260905"; // doit suivre le ?v= des pages HTML
var PRECACHE = [
  "./",
  "./index.html",
  "./connexion.html",
  "./espace.html",
  "./admin.html",
  "./messagerie.html",
  "./reponses-auto.html",
  "./mentions-legales.html",
  "./css/site.css?v=" + ASSET_V,
  "./js/config.js?v=" + ASSET_V,
  "./js/main.js?v=" + ASSET_V,
  "./js/login.js?v=" + ASSET_V,
  "./js/espace.js?v=" + ASSET_V,
  "./js/admin.js?v=" + ASSET_V,
  "./js/messagerie.js?v=" + ASSET_V,
  "./js/reponses-auto.js?v=" + ASSET_V,
  "./js/pwa.js?v=" + ASSET_V,
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

// Notifications push (messagerie CTA)
self.addEventListener("push", function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { /* payload non JSON */ }
  e.waitUntil(self.registration.showNotification(data.title || "CTA · Conseil Technique Auto", {
    body: data.body || "",
    tag: data.tag || undefined,
    icon: "./assets/icon-192.png",
    badge: "./assets/icon-192.png",
    data: { url: data.url || "./espace.html" }
  }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "./espace.html";
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf(url.replace("./", "/")) !== -1) return list[i].focus();
    }
    return clients.openWindow(url);
  }));
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
