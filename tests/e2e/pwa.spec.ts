import { offlineProxy } from './offline-proxy';
import { test, expect } from '@playwright/test';

test.describe('PWA installability', () => {
  test('manifest.json is valid and reachable', async ({ request }) => {
    const res = await request.get('/manifest.json');
    expect(res.status()).toBe(200);
    const manifest = await res.json();

    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBeTruthy();
    expect(manifest.background_color).toBeTruthy();

    const anyIcons = manifest.icons.filter((i: any) => (i.purpose ?? 'any').includes('any'));
    const maskableIcons = manifest.icons.filter((i: any) => (i.purpose ?? '').includes('maskable'));
    expect(anyIcons.some((i: any) => i.sizes.includes('192x192'))).toBe(true);
    expect(anyIcons.some((i: any) => i.sizes.includes('512x512'))).toBe(true);
    expect(maskableIcons.length).toBeGreaterThan(0);

    for (const icon of manifest.icons) {
      const iconRes = await request.get(icon.src);
      expect(iconRes.status(), `icon ${icon.src} should be reachable`).toBe(200);
      const contentType = iconRes.headers()['content-type'] ?? '';
      expect(contentType.startsWith('image/')).toBe(true);
    }
  });

  test('login page exposes manifest link, theme-color and safe-area viewport', async ({ page }) => {
    await page.goto('/login');

    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBe('/manifest.json');

    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content');
    expect(themeColor).toBeTruthy();

    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('viewport-fit=cover');
    expect(viewport).toContain('width=device-width');

    const appleTouchIcon = await page.locator('link[rel="apple-touch-icon"]').count();
    expect(appleTouchIcon).toBeGreaterThan(0);

    const appleCapable = await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content');
    expect(appleCapable).toBe('yes');
  });

});

test.describe('PWA service worker', () => {
  test.use({ serviceWorkers: 'allow' });

  test('registers and controls the page', async ({ page }) => {
    await page.goto('/login');

    const swUrl = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return null;
      const reg = await navigator.serviceWorker.ready;
      return reg.active?.scriptURL ?? null;
    });

    expect(swUrl).toBeTruthy();
    expect(swUrl).toContain('/sw.js');
  });

  test('shows a branded offline fallback instead of the browser error page', async ({ page, baseURL }) => {
    const proxy = await offlineProxy(baseURL!);
    try {
      await page.goto(`${proxy.origin}/login`);
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
      proxy.disconnect();
      await page.goto(`${proxy.origin}/member/check-in`);
      await expect(page.getByText("You're offline")).toBeVisible();
      expect(await page.evaluate(async () => {
        const response = await fetch('/logo-icon.svg');
        return response.ok && (await response.text()).includes('<svg');
      })).toBe(true);
    } finally { await proxy.close(); }
  });
});

test.describe('PWA cache boundaries', () => {
  test.use({ serviceWorkers: 'allow' });
  test('caches public build assets without persisting routes, API data or arbitrary GET responses', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page.reload();
    await page.evaluate(async () => {
      await Promise.allSettled([
        fetch('/api/private'), fetch('/unknown-sensitive-data'), fetch('/login?_rsc=private', { headers: { RSC: '1' } }),
        fetch('/logo.png'), fetch('/logo.svg', { headers: { Authorization: 'Bearer private' } }),
      ]);
    });
    const urls = await page.evaluate(async () => {
      const keys = await caches.keys();
      return (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(request => new URL(request.url).pathname)))).flat();
    });
    expect(urls).toContain('/offline.html');
    expect(urls.some(url => url.startsWith('/_next/static/'))).toBe(true);
    expect(urls).not.toContain('/login');
    expect(urls).not.toContain('/api/private');
    expect(urls).not.toContain('/unknown-sensitive-data');
    expect(urls).not.toContain('/logo.png');
  });
  test('worker and manifest are revalidated by the browser', async ({ request }) => {
    expect((await request.get('/sw.js')).headers()['cache-control']).toContain('no-store');
    const manifest = await (await request.get('/manifest.json')).json();
    expect(manifest.id).toBe('/');
    expect(manifest.shortcuts.map((shortcut: any) => shortcut.url)).toContain('/member/notifications');
  });
});

test.describe('Activity queue UI', () => {
  // WebKit service workers bypass Playwright route mocks after taking control.
  // Real worker replay is covered separately against an actual HTTP fixture.
  test.use({ serviceWorkers: 'block' });
 test('Activity queues offline reads and refreshes after reconnect', async ({ page, context }) => {
  const user = { userId: 'member-user', memberId: 'member', role: 'MEMBER', permissions: [], accessRoles: [] };
  let read = false;
  let submitted: unknown;
  await page.addInitScript(() => {
    (window as any).__NEXT_PUBLIC_API_URL__ = location.origin + '/test-api';
    localStorage.setItem('tfhc_token', `header.${btoa(JSON.stringify({ sub: 'member-user', exp: Date.now() / 1000 + 3600 }))}.test`);
  });
  await page.route('**/auth/me', route => route.fulfill({ json: user }));
  await page.route('**/push/config', route => route.fulfill({ json: { enabled: false, publicKey: null } }));
  await page.route('**/chat/unread', route => route.fulfill({ json: { total: 0, rooms: [] } }));
  await page.route('**/members/me/notifications', route => route.fulfill({ json: [{ id: 'notification-1', title: 'Test activity', body: 'An update', status: read ? 'READ' : 'UNREAD', createdAt: new Date().toISOString() }] }));
  await page.route('**/members/me/notifications/read', route => {
    submitted = route.request().postDataJSON(); read = true; return route.fulfill({ json: { count: 1 } });
  });
  await page.goto('/member/notifications');
  await expect(page.getByRole('heading', { name: 'Test activity · Unread' })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(page.getByText('Changes pending. These notifications will be marked read when the app reconnects.')).toBeVisible();
  expect(read).toBe(false);
  await context.setOffline(false);
  // WebKit can dispatch online before its network process is ready. Allow the
  // documented 15-second foreground retry to recover that first failed request.
  await expect(page.getByRole('heading', { name: 'Test activity', exact: true })).toBeVisible({ timeout: 20000 });
  expect(submitted).toEqual({ ids: ['notification-1'] });
});

});
