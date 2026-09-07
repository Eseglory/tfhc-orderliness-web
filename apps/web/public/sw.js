const CACHE_NAME = 'tfhc-tracker-cache-v5';
const STATIC_ASSETS = [
  '/logo.svg',
  '/logo-icon.svg',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/offline.html',
  '/fonts/material-symbols-outlined.woff2'
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

  // Authenticated responses must never be cached across users or sessions.
  if (url.origin !== self.location.origin || event.request.method !== 'GET' || event.request.headers.has('Authorization') || url.pathname.startsWith('/api/')) {
    return;
  }

  // Never cache rendered application routes or Next.js build assets. Their
  // content hashes change between releases; serving an old route document
  // with a new build causes an unstyled page when its CSS no longer exists.
  // A true offline navigation still gets a branded fallback shell instead of
  // the browser's default error page.
  if (url.pathname.startsWith('/_next/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline.html'))
    );
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
