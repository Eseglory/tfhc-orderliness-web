const CACHE_NAME = 'tfhc-tracker-cache-v2';
const STATIC_ASSETS = [
  '/logo.svg',
  '/logo-icon.svg',
  '/manifest.json'
];

// Install Event: Pre-cache static UI assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Cache-First for static assets, Network-First for API calls with offline fallback
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API Requests: Network-First with Cache Fallback
  if (url.pathname.startsWith('/api/') || url.port === '4000') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const resClone = response.clone();
            caches.open('tfhc-api-cache').then((cache) => cache.put(event.request, resClone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Never cache rendered application routes or Next.js build assets. Their
  // content hashes change between releases; serving an old route document
  // with a new build causes an unstyled page when its CSS no longer exists.
  if (url.pathname.startsWith('/_next/') || event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Static assets such as logos can safely use Cache-First.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse.status === 200 && event.request.method === 'GET') {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        }
        return networkResponse;
      });
    })
  );
});
