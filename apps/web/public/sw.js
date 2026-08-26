const CACHE_NAME = 'tfhc-tracker-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/member',
  '/member/my-attendance',
  '/member/check-in',
  '/member/leaderboard',
  '/member/profile',
  '/login',
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

  // Static Assets: Cache-First
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
