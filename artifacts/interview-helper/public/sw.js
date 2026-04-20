// Self-destructing service worker. If an old SW is still controlling a phone,
// this version takes over, deletes every cache, unregisters itself, and reloads
// any open clients. Result: stale PWAs heal themselves on next visit.
self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        try { client.navigate(client.url); } catch {}
      }
    } catch {}
  })());
});

// Pass everything straight through to the network — no caching, no interception.
self.addEventListener('fetch', () => {});
