const CACHE_NAME = 'mastery-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png'
];
const runtimeAssets = new Set(STATIC_ASSETS);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(Array.from(runtimeAssets))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => caches.match('/index.html'));
    })
  );
});

self.addEventListener('message', (event) => {
  if (!event.data || typeof event.data !== 'object') return;
  const { type, payload } = event.data;
  if (type === 'CACHE_URLS' && Array.isArray(payload)) {
    const sameOriginUrls = payload
      .map((url) => {
        try {
          return new URL(url, self.location.origin);
        } catch {
          return null;
        }
      })
      .filter((url) => url && url.origin === self.location.origin)
      .map((url) => url.pathname + url.search);

    if (sameOriginUrls.length > 0) {
      sameOriginUrls.forEach((url) => runtimeAssets.add(url));
      event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(sameOriginUrls)).catch(() => undefined)
      );
    }
  }
});

async function refreshStaticAssets() {
  const cache = await caches.open(CACHE_NAME);
  const urls = Array.from(runtimeAssets);
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (response && response.ok) {
          await cache.put(url, response.clone());
        }
      } catch {
        // ignore fetch errors; will try again on next sync
      }
    })
  );
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'mastery-sync') {
    event.waitUntil(refreshStaticAssets());
  }
});
