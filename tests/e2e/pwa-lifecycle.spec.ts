import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AddressInfo } from 'node:net';
import { safeDestination } from '../../apps/web/src/lib/pwa/deep-link';
import { calendarFile } from '../../apps/web/src/lib/pwa/calendar';

test('deep links reject external URLs and cross-role admin paths', () => {
  for (const input of ['https://evil.test', '//evil.test', '/\\evil.test', '/admin/finance', '/member/../../admin']) {
    expect(safeDestination(input, false)).toBe('/member');
  }
  expect(safeDestination('/member/notifications?from=push', false)).toBe('/member/notifications?from=push');
  expect(safeDestination('/admin/reports', true)).toBe('/admin/reports');
});
test('calendar export escapes injected properties and folds UTF-8 lines', () => {
  const text = calendarFile({ id: 'event', title: 'Service\nATTENDEE:evil;' + '🙏'.repeat(50), startTime: '2026-09-12T10:00:00Z', endTime: null, locationName: 'Church, hall' });
  expect(text).toContain('SUMMARY:Service\\nATTENDEE:evil\\;');
  expect(text).not.toContain('\r\nATTENDEE:');
  expect(text).toContain('DTSTART:20260912T100000Z');
  for (const line of text.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
});
test('updates wait for consent, preserve drafts and retain unrelated caches', async ({ page }) => {
  let version = 'test-one';
  const server = createServer((request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname;
    response.setHeader('Cache-Control', 'no-store');
    if (path === '/sw.js') {
      response.setHeader('Content-Type', 'application/javascript');
      response.end(readFileSync('apps/web/public/sw.js', 'utf8').replace(/const VERSION = '[^']+'/,  `const VERSION = '${version}'`));
    } else if (path === '/') {
      response.setHeader('Content-Type', 'text/html'); response.end('<label>Draft<input id="draft"></label>');
    } else {
      if (path.endsWith('.js')) response.setHeader('Content-Type', 'application/javascript');
      try { response.end(readFileSync(join('apps/web/public', path))); }
      catch { response.statusCode = 404; response.end(); }
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.evaluate(async () => { await caches.open('unrelated-app'); await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page.locator('#draft').fill('Unsaved work');
    version = 'test-two';
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting))).toBe(true);
    expect(await page.evaluate(() => caches.keys())).toContain('tfhc-pwa-shell-test-one');
    await expect(page.locator('#draft')).toHaveValue('Unsaved work');
    await page.evaluate(async () => { (await navigator.serviceWorker.getRegistration())!.waiting!.postMessage({ type: 'ACTIVATE_UPDATE' }); });
    await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain('tfhc-pwa-shell-test-one');
    expect(await page.evaluate(() => caches.keys())).toContain('unrelated-app');
    await expect(page.locator('#draft')).toHaveValue('Unsaved work');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
