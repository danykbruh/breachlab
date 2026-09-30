// BreachLab — service worker: сайт открывается как приложение и работает при плохой сети.
// Стратегия «сначала сеть»: всегда пробуем свежую версию, кеш — только запасной вариант.
// Запросы к Supabase и другим сайтам не трогаем.
const VERSION = "bl-v2";
const SHELL = ["./", "index.html", "css/styles.css?v=9", "js/config.js", "js/app.js?v=10", "js/hero3d.js?v=2",
               "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match("index.html")))
  );
});
