import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

// Explicitly generated load fixtures, isolated from production; not real-history benchmarks.
const api = `http://127.0.0.1:${process.env.E2E_API_PORT || '4100'}`;
const database = process.env.TEST_DATABASE_URL || '';
if (!/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/tfhc_e2e(?:\?|$)/.test(database)) throw new Error('Local isolated database required');
let db: PrismaClient, token: string, longRoom: string, mediaRoom: string;
let latestId: string, imageId: string, audioId: string, fileId: string;

test.beforeAll(async ({ request }) => {
  db = new PrismaClient({ datasources: { db: { url: database } } });
  const login = await request.post(`${api}/auth/login`, { data: { email: 'admin-browser@tfhc.org', password: 'E2ePassword!123' } });
  expect(login.ok()).toBeTruthy(); token = (await login.json()).accessToken;
  const member = await db.member.findFirstOrThrow({ where: { user: { email: 'admin-browser@tfhc.org' } } });
  const createRoom = async (name: string) => (await db.chatRoom.create({ data: { name: `${name} ${randomUUID()}`, type: 'CUSTOM', members: { create: { memberId: member.id, role: 'MODERATOR' } } } })).id;
  longRoom = await createRoom('Isolated long-history verification');
  mediaRoom = await createRoom('Isolated attachment verification');
  const start = Date.now() - 20000000;
  for (let offset = 0; offset < 10000; offset += 500) {
    const data = Array.from({ length: 500 }, (_, j) => {
      const n = offset + j, id = randomUUID();
      if (n === 9999) latestId = id;
      return { id, roomId: longRoom, senderMemberId: member.id, type: 'TEXT' as const,
        body: `Isolated load fixture ${n}. ` + 'Variable-height message content for scrolling verification. '.repeat(n % 5 + 1), createdAt: new Date(start + n * 1000) };
    });
    await db.chatMessage.createMany({ data });
  }
  const wav = Buffer.alloc(44 + 1600, 128);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34);
  wav.write('data', 36); wav.writeUInt32LE(1600, 40);
  imageId = randomUUID(); fileId = randomUUID(); audioId = randomUUID();
  await db.chatMessage.createMany({ data: [
    { id: imageId, roomId: mediaRoom, senderMemberId: member.id, type: 'IMAGE', attachmentUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', attachmentMeta: { name: 'readiness-image.png', kind: 'image' }, createdAt: new Date(start) },
    { id: fileId, roomId: mediaRoom, senderMemberId: member.id, type: 'IMAGE', attachmentUrl: 'data:text/plain;base64,' + Buffer.from('Isolated attachment download').toString('base64'), attachmentMeta: { name: 'readiness-document.txt', kind: 'document' }, createdAt: new Date(start + 1000) },
    { id: audioId, roomId: mediaRoom, senderMemberId: member.id, type: 'AUDIO', attachmentUrl: 'data:audio/wav;base64,' + wav.toString('base64'), attachmentMeta: { mime: 'audio/wav', duration: 0.2 }, createdAt: new Date(start + 2000) },
  ] });
  const synced = await request.post(`${api}/chat/sync/reconcile`, { headers: { Authorization: `Bearer ${token}` } });
  expect(synced.ok()).toBeTruthy();
});
test.afterAll(async () => {
  if (db) { await db.chatRoom.deleteMany({ where: { id: { in: [longRoom, mediaRoom].filter(Boolean) } } }); await db.$disconnect(); }
});

test('10,000-message history uses bounded pages and a bounded DOM while scrolling', async ({ page, request }, testInfo) => {
  const started = Date.now();
  const response = await request.get(`${api}/chat/rooms/${longRoom}/messages?compactMedia=true`, { headers: { Authorization: `Bearer ${token}` } });
  const firstPage = await response.json();
  expect(firstPage.messages.length).toBeLessThanOrEqual(50);
  expect(firstPage.hasMore).toBe(true);
  const pageMs = Date.now() - started;
  await page.addInitScript(value => localStorage.setItem('tfhc_token', value), token);
  const opened = Date.now();
  await page.goto(`/admin/chat?roomId=${longRoom}`);
  await expect(page.locator(`#chat-message-${latestId}`)).toBeVisible();
  const openMs = Date.now() - opened;
  const banner = page.getByRole('button', { name: 'Dismiss banner' });
  if (await banner.isVisible()) await banner.click();
  for (let i = 0; i < 12; i++) {
    const older = page.getByRole('button', { name: 'Load earlier messages', exact: true });
    await expect(older).toBeEnabled();
    await Promise.all([
      page.waitForResponse(r => r.url().includes(`/chat/rooms/${longRoom}/messages?`) && r.url().includes('cursor=')),
      older.click(),
    ]);
  }
  await expect(page.getByRole('button', { name: 'Load earlier messages', exact: true })).toBeEnabled();
  const mounted = await page.locator('[id^="chat-message-"]').count();
  expect(mounted).toBeGreaterThan(0); expect(mounted).toBeLessThan(65);
  await page.getByRole('log', { name: 'Conversation messages' }).evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.locator(`#chat-message-${latestId}`)).toBeVisible();
  console.log(JSON.stringify({ benchmark: 'isolated-chat-load', device: testInfo.project.name, generatedRows: 10000, initialPageRows: firstPage.messages.length, olderPages: 12, mountedRows: mounted, apiPageMs: pageMs, browserOpenMs: openMs }));
});

test('attachments load on demand, recover from an image failure and download correctly', async ({ page }) => {
  let images = 0, audio = 0, documents = 0;
  await page.route(`**/chat/messages/${imageId}/attachment`, async route => {
    images++;
    if (images === 1) return route.fulfill({ status: 503, body: 'Temporary isolated test failure' });
    await new Promise(resolve => setTimeout(resolve, 600));
    await route.continue();
  });
  page.on('request', request => { if (request.url().includes(`${audioId}/attachment`)) audio++; if (request.url().includes(`${fileId}/attachment`)) documents++; });
  await page.addInitScript(value => localStorage.setItem('tfhc_token', value), token);
  await page.goto(`/admin/chat?roomId=${mediaRoom}`);
  const banner = page.getByRole('button', { name: 'Dismiss banner' });
  if (await banner.isVisible()) await banner.click();
  await page.locator('img[alt="readiness-image.png"]').first().scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Retry image', exact: true })).toBeVisible();
  expect(audio).toBe(0); expect(documents).toBe(0);
  await page.getByRole('button', { name: 'Retry image', exact: true }).click();
  await expect.poll(() => page.locator('img[alt="readiness-image.png"]').first().evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  expect(images).toBe(2);
  await page.getByRole('button', { name: 'Play voice message', exact: true }).click();
  await expect.poll(() => audio).toBe(1);
  const downloaded = page.waitForEvent('download');
  await page.getByText('readiness-document.txt', { exact: true }).click();
  expect((await downloaded).suggestedFilename()).toBe('readiness-document.txt');
  expect(documents).toBe(1);
});
