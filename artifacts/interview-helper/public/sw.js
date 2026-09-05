// Lightweight installability worker. SALARYMAN is network-first and keeps
// authenticated/API data out of service-worker caches. Static shell assets are
// retained so the installed app can open during a weak connection while its
// live API/WebSocket reconnects.
self.SALARYMAN_CACHE = 'salaryman-shell-v2';
self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== self.SALARYMAN_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    } catch {}
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/api/') || url.pathname.includes('/ws/')) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(self.SALARYMAN_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      const cache = await caches.open(self.SALARYMAN_CACHE);
      return (await cache.match(request)) || (await cache.match('./'));
    }
  })());
});
