// Notificaciones push de compras (Firebase Cloud Messaging).
if (typeof importScripts === 'function') importScripts('/push-sw.js');
const CACHE = '__CACHE__';
const ASSETS = __ASSETS__;
self.addEventListener('install', (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS))),
);
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (
    req.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((response) =>
          response.ok ? response : caches.open(CACHE).then((c) => c.match('/index.html')),
        )
        .catch(() => caches.open(CACHE).then((c) => c.match('/index.html'))),
    );
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => (await cache.match(url.pathname)) || fetch(req)),
    );
  }
});
