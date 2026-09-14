import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('encrypted schedules and drafts survive reload; passphrase, TTL and conflicts are enforced', async ({ page }) => {
  await page.goto('/offline.html');
  await page.evaluate(async () => {
    const store = (window as any).TFHCPwa;
    await store.setAccount('account-a', Date.now() + 3600000);
    await store.configure('a strong offline passphrase');
    await store.save('excuse', { details: 'Private draft reason' }, 0);
    await store.save('schedule:2026-09', [{ title: 'Sunday service', startTime: '2026-09-13T08:00:00Z' }], 0, 'schedule');
  });
  const raw = await page.evaluate(async () => JSON.stringify(await (window as any).TFHCPwa.get('records', 'account-a:excuse')));
  expect(raw).not.toContain('Private draft reason'); expect(raw).not.toContain('passphrase');
  await page.reload();
  await page.getByLabel('Offline passphrase').fill('incorrect passphrase');
  await page.getByRole('button', { name: 'Unlock saved content' }).click();
  await expect(page.getByRole('status')).toContainText('incorrect');
  await page.getByLabel('Offline passphrase').fill('a strong offline passphrase');
  await page.getByRole('button', { name: 'Unlock saved content' }).click();
  await expect(page.getByText('Sunday service', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Draft text')).toHaveValue('Private draft reason');
  expect(await page.evaluate(async () => {
    const store = (window as any).TFHCPwa; await store.save('excuse', { details: 'Newer tab draft' }, 1);
    try { await store.save('excuse', { details: 'Stale tab overwrite' }, 1); return 'bad'; } catch { return 'conflict'; }
  })).toBe('conflict');
  await page.evaluate(async () => {
    const store = (window as any).TFHCPwa; const record = await store.get('records', 'account-a:excuse'); record.expiresAt = 0; await store.put('records', record);
  });
  expect(await page.evaluate(() => (window as any).TFHCPwa.read('excuse'))).toBeNull();
  await page.evaluate(() => (window as any).TFHCPwa.setAccount('account-b', Date.now() + 3600000));
  expect(await page.evaluate(() => (window as any).TFHCPwa.get('records', 'account-a:schedule:2026-09'))).toBeUndefined();
});

test('shared files are encrypted, bounded and received without sending a message', async ({ page }) => {
  await page.goto('/offline.html');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
    await (window as any).TFHCPwa.setAccount('account-a', Date.now() + 3600000);
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const result = await page.evaluate(async () => {
    const form = new FormData(); form.append('files', new File(['private file contents'], 'notes.txt', { type: 'text/plain' })); form.append('text', 'Review before sharing');
    await fetch('/share-target', { method: 'POST', body: form });
    const store = (window as any).TFHCPwa; const items = await store.inbox();
    return { name: items[0].files[0].name, text: await items[0].files[0].text(), raw: JSON.stringify(await store.all('inbox')) };
  });
  expect(result.name).toBe('notes.txt'); expect(result.text).toBe('private file contents'); expect(result.raw).not.toContain('private file contents');
  expect(await page.evaluate(async () => {
    try { await (window as any).TFHCPwa.receive([new File([new Uint8Array(2097153)], 'large.txt')]); return false; } catch { return true; }
  })).toBe(true);
});

test('background grant is HttpOnly and synchronizes without exposing a credential to JavaScript', async ({ page, context, request }) => {
  await page.goto('/offline.html');
  await page.evaluate(async () => {
    await fetch('/api/pwa/session', { method: 'POST', headers: { Authorization: 'Bearer browser-test' } });
    const store = (window as any).TFHCPwa;
    await store.setAccount('background-owner', Date.now() + 3600000);
    await store.put('operations', { id: 'background-operation', owner: 'background-owner', notificationIds: ['notice'], expiresAt: Date.now() + 60000,
      attempts: 0, state: 'pending', leaseUntil: 0, nextAttemptAt: 0 });
  });
  expect(await page.evaluate(() => document.cookie)).not.toContain('tfhc_pwa_device');
  const cookie = (await context.cookies()).find(cookie => cookie.name === 'tfhc_pwa_device');
  expect(cookie?.httpOnly).toBe(true); expect(cookie?.sameSite).toBe('Strict');
  // Exercise the shared replay routine; no JWT is supplied to it.
  await page.evaluate(async () => { await (window as any).TFHCPwa.sync(); });
  expect(await page.evaluate(() => (window as any).TFHCPwa.get('operations', 'background-operation'))).toBeUndefined();
  const calls = await (await request.get('http://127.0.0.1:4201/calls')).json();
  expect(calls).toContainEqual({ owner: 'background-owner', ids: ['notice'] });
});

test('offline workspace meets WCAG A/AA checks and fits the viewport', async ({ page }) => {
  await page.goto('/offline.html');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Chromium service worker synchronizes after every app page is closed', async ({ page, context, browserName, baseURL, request }) => {
  test.skip(browserName !== 'chromium', 'Background Sync is not exposed by WebKit; foreground fallback is covered separately.');
  const inspector = await context.newPage();
  const cdp = await context.newCDPSession(inspector);
  const registrations = new Map<string, string>();
  cdp.on('ServiceWorker.workerRegistrationUpdated', event => {
    for (const registration of event.registrations) registrations.set(registration.scopeURL, registration.registrationId);
  });
  await cdp.send('ServiceWorker.enable');
  await page.goto('/offline.html');
  await page.evaluate(async () => {
    await fetch('/api/pwa/session', { method: 'POST', headers: { Authorization: 'Bearer browser-test' } });
    await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
    const store = (window as any).TFHCPwa; await store.setAccount('closed-owner', Date.now() + 3600000);
    await store.put('operations', { id: 'closed-operation', owner: 'closed-owner', notificationIds: ['closed-notice'], expiresAt: Date.now() + 60000,
      attempts: 0, state: 'pending', leaseUntil: 0, nextAttemptAt: 0 });
  });
  await expect.poll(() => registrations.get(`${baseURL}/`)).toBeTruthy();
  await page.close();
  expect(context.pages().every(tab => !tab.url().startsWith(baseURL!))).toBe(true);
  await cdp.send('ServiceWorker.dispatchSyncEvent', { origin: baseURL!, registrationId: registrations.get(`${baseURL}/`)!, tag: 'tfhc-notification-reads', lastChance: true });
  await expect.poll(async () => (await (await request.get('http://127.0.0.1:4201/calls')).json()).some((call: any) => call.owner === 'closed-owner')).toBe(true);
  await inspector.close();
});
