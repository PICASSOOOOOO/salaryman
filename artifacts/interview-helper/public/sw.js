// Lightweight installability worker. SALARYMAN is network-first and keeps
// authenticated/API data out of service-worker caches so installed desktop and
// mobile apps always load the current release.
self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    } catch {}
  })());
});

// Pass everything straight through to the network — no caching, no interception.
self.addEventListener('fetch', () => {});
