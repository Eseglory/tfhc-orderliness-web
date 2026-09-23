import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const api = `http://127.0.0.1:${process.env.E2E_API_PORT || '4100'}`;
let db: PrismaClient;
let token: string;
let roomId: string;
test.beforeAll(async ({ request }) => {
  db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  const login = await request.post(`${api}/auth/login`, { data: { email: 'member-browser@tfhc.org', password: 'E2ePassword!123' } });
  expect(login.ok()).toBeTruthy();
  token = (await login.json()).accessToken;
  const rooms = await request.get(`${api}/chat/rooms`, { headers: { Authorization: `Bearer ${token}` } });
  roomId = (await rooms.json()).find((r: any) => r.key === 'GENERAL').id;
});
test.afterAll(async () => { await db.$disconnect(); });

test('offline message survives reload and reconnects without duplicate persistence', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(value => localStorage.setItem('tfhc_token', value), token);
  await page.goto(`/member/chat?roomId=${roomId}`);
  const composer = page.getByPlaceholder('Type a message…');
  await expect(composer).toBeVisible();
  await context.setOffline(true);
  const body = `Offline recovery ${randomUUID()}`;
  await composer.fill(body);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.locator('p').filter({ hasText: body })).toBeVisible();
  const queued = await page.evaluate(() => new Promise<number>((resolve, reject) => {
    const open = indexedDB.open('tfhc-chat-outbox', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const read = open.result.transaction('messages').objectStore('messages').getAll();
      read.onsuccess = () => { open.result.close(); resolve(read.result.length); };
    };
  }));
  expect(queued).toBeGreaterThan(0);
  // Reconnect and reload immediately: recovery must use durable IDB state,
  // including when the original component disappears before an acknowledgement.
  await context.setOffline(false);
  await page.reload();
  await expect.poll(() => db.chatMessage.count({ where: { body } })).toBe(1);
  await expect(page.locator('p').filter({ hasText: body })).toBeVisible();
  await page.reload();
  await expect(page.locator('p').filter({ hasText: body })).toBeVisible();
  expect(await db.chatMessage.count({ where: { body } })).toBe(1);
  expect(errors).toEqual([]);
});


test('a scheduled service notification opens a dismissible reminder', async ({ page }) => {
  const member = await db.member.findFirstOrThrow({ where: { user: { email: 'member-browser@tfhc.org' } } });
  const reminder = await db.memberNotification.create({ data: {
    memberId: member.id, type: 'SERVICE_REMINDER', title: 'Upcoming service verification', body: 'Your service starts in one hour.',
    data: { window: '1h', startTime: new Date(Date.now() + 3600000).toISOString(), url: '/member/notifications' },
    expiresAt: new Date(Date.now() + 3600000),
  } });
  try {
    await page.addInitScript(value => localStorage.setItem('tfhc_token', value), token);
    await page.goto(`/member/chat?roomId=${roomId}`);
    const popup = page.getByRole('complementary', { name: 'Upcoming service reminder' });
    await expect(popup).toBeVisible();
    const installPrompt = page.getByRole('region', { name: 'Install TFHC-ORDERLINESS' });
    if (await installPrompt.isVisible()) await installPrompt.getByRole('button', { name: 'Dismiss banner' }).click();
    await popup.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(popup).not.toBeVisible();
    await page.reload();
    await expect(page.getByPlaceholder('Type a message…')).toBeVisible();
    await expect(popup).not.toBeVisible();
  } finally { await db.memberNotification.delete({ where: { id: reminder.id } }); }
});

// The production worker must preserve the actual chat shell across offline reload.
test.describe('offline PWA chat shell', () => {
  test.use({ serviceWorkers: 'allow' });
  test('queued text survives an offline reload and sends once when connectivity returns', async ({ page, context }) => {
    await page.addInitScript(value => localStorage.setItem('tfhc_token', value), token);
    await page.goto(`/member/chat?roomId=${roomId}`);
    await expect(page.getByPlaceholder('Type a message…')).toBeVisible();
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await expect(page.getByPlaceholder('Type a message…')).toBeVisible();
    await expect.poll(() => page.evaluate(async () => {
      for (const key of await caches.keys()) if (key.startsWith('tfhc-pwa-shell-')) {
        if (await (await caches.open(key)).match('/member/chat')) return true;
      }
      return false;
    })).toBe(true);
    await context.setOffline(true);
    const body = `Offline PWA reload ${randomUUID()}`;
    await page.getByPlaceholder('Type a message…').fill(body);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(page.getByPlaceholder('Type a message…')).toHaveValue('');
    await page.reload();
    await expect(page.locator('p').filter({ hasText: body })).toBeVisible();
    await context.setOffline(false);
    await expect.poll(() => db.chatMessage.count({ where: { body } }), { timeout: 15000 }).toBe(1);
    await page.reload();
    await expect(page.locator('p').filter({ hasText: body })).toBeVisible();
    expect(await db.chatMessage.count({ where: { body } })).toBe(1);
  });
});
