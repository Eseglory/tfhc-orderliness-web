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
