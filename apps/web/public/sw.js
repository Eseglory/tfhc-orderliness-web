/* Public resources only. Bump VERSION whenever this policy or shell changes. */
importScripts('/pwa-runtime.js');
const VERSION = 'v11';
const PREFIX = 'tfhc-pwa-';
const SHELL = `${PREFIX}shell-${VERSION}`;
const ASSETS = `${PREFIX}assets-${VERSION}`;
const STATIC = [
  '/offline.html', '/offline-workspace.js', '/pwa-runtime.js', '/logo.svg', '/logo-icon.svg', '/manifest.json',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png',
  '/fonts/inter-latin.woff2',
];

self.addEventListener('install', event => {
  // An existing worker keeps control until the user chooses to update.
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(STATIC)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(key =>
      (key.startsWith(PREFIX) && key !== SHELL && key !== ASSETS) ||
      key.startsWith('tfhc-tracker-cache-')
    ).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith((async () => {
      try {
        if (Number(request.headers.get('Content-Length') || 0) > 7 * 1024 * 1024) return new Response('Files too large', { status: 413 });
        const form = await request.formData();
        const files = form.getAll('files').filter(file => file instanceof File);
        const text = ['title', 'text', 'url'].map(name => String(form.get(name) || '')).filter(Boolean).join('\n');
        await self.TFHCPwa.receive(files, text);
        return Response.redirect(new URL('/member/files', self.location.origin), 303);
      } catch { return new Response('Could not receive files. Share up to three files of 2 MB each.', { status: 400 }); }
    })());
    return;
  }
  if (url.origin !== self.location.origin || request.method !== 'GET' ||
      request.headers.has('Authorization') || url.pathname.startsWith('/api/') ||
      request.headers.has('RSC') || url.searchParams.has('_rsc')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () =>
      (await (await caches.open(SHELL)).match('/offline.html')) ||
      new Response('Offline. Reconnect and retry.', { status: 503, headers: { 'Content-Type': 'text/plain' } })
    ));
    return;
  }
  // No arbitrary image URLs, Next image optimizer, downloads or JSON endpoints.
  const publicAsset = (STATIC.includes(url.pathname) || url.pathname === '/fonts/material-symbols-outlined.woff2') && !url.search;
  const immutable = url.pathname.startsWith('/_next/static/') && !url.search &&
    ['script', 'style', 'font'].includes(request.destination);
  if (!publicAsset && !immutable) return;
  const response = (async () => {
    const cache = await caches.open(publicAsset ? SHELL : ASSETS);
    const cached = await cache.match(request);
    if (cached) return cached;
    const result = await fetch(request);
    if (result.ok && result.type === 'basic' && !result.redirected &&
        !/no-store|private/i.test(result.headers.get('Cache-Control') || '') &&
        !/text\/html|application\/json/i.test(result.headers.get('Content-Type') || '')) {
      try {
        await cache.put(request, result.clone());
        if (immutable) {
          const keys = await cache.keys();
          await Promise.all(keys.slice(0, Math.max(0, keys.length - 160)).map(key => cache.delete(key)));
        }
      } catch { /* Quota failure must not break the network response. */ }
    }
    return result;
  })();
  event.respondWith(response);
});

self.addEventListener('sync', event => {
  if (event.tag === 'tfhc-notification-reads') event.waitUntil(self.TFHCPwa.sync());
});
self.addEventListener('periodicsync', event => {
  if (event.tag === 'tfhc-notification-reads') event.waitUntil(self.TFHCPwa.sync());
});

// Handle incoming push notifications safely
self.addEventListener('push', event => {
  let title = 'TFHC Tracker';
  let body = 'You have new activity. Open the app to view it.';
  let url = '/member/notifications';

  if (event.data) {
    try {
      const payload = event.data.json();
      if (payload && typeof payload === 'object') {
        if (payload.title) title = String(payload.title);
        if (payload.body) body = String(payload.body);
        if (payload.url) url = String(payload.url);
      }
    } catch {
      try {
        const text = event.data.text();
        if (text) body = text;
      } catch {
        /* fallback to default */
      }
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'tfhc-activity',
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/member/notifications';
  const target = new URL(url, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find(client => client.url === target);
      if (existing) return existing.focus();
      return self.clients.openWindow(target);
    })()
  );
});
