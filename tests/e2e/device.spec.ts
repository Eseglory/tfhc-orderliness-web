import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
const api = `http://127.0.0.1:${process.env.E2E_API_PORT || '4100'}`;
let meetingId: string;
let adminHeaders: Record<string, string>;

test.beforeEach(async ({ page, request }) => {
  const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  try {
    const user = await db.user.findUniqueOrThrow({ where: { email: 'member-browser@example.test' } });
    await page.addInitScript(token => localStorage.setItem('tfhc_token', token), jwt.sign({ sub: user.id }, 'e2e-local-only-secret', { expiresIn: '1h' }));
  } finally { await db.$disconnect(); }
  const login = await request.post(`${api}/auth/login`, { data: { email: 'admin-browser@example.test', password: 'E2ePassword!123' } });
  adminHeaders = { Authorization: `Bearer ${(await login.json()).accessToken}` };
  const categories = await (await request.get(`${api}/meetings/categories`, { headers: adminHeaders })).json();
  const at = (m: number) => new Date(Date.now() + m * 60000).toISOString();
  const response = await request.post(`${api}/meetings`, { headers: adminHeaders, data: { title: `Location test ${Date.now()}`, categoryId: categories[0].id, meetingDate: at(0), startTime: at(10), expectedArrivalTime: at(5), attendanceOpenTime: at(-5), attendanceCloseTime: at(60), locationName: 'Church location test', latitude: 6.6697906, longitude: 3.3581822, geofenceRadiusMeters: 100 } });
  expect(response.ok()).toBeTruthy(); meetingId = (await response.json()).id;
  expect((await request.put(`${api}/meetings/${meetingId}/status`, { headers: adminHeaders, data: { status: 'ACTIVE' } })).ok()).toBeTruthy();
});
test.afterEach(async ({ request }) => { if (meetingId) await request.put(`${api}/meetings/${meetingId}/status`, { headers: adminHeaders, data: { status: 'CANCELLED' } }); });
async function locate(page: any, latitude = 6.6697906, longitude = 3.3581822, accuracy = 5) {
  await page.addInitScript((coords: any) => {
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', { value: (ok: any) => ok({ coords }) });
    (window as any).__cameraCalls = 0;
    if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { (window as any).__cameraCalls++; throw new Error('Camera must not be requested'); } });
  }, { latitude, longitude, accuracy });
}
async function open(page: any) { await page.goto(`/member/check-in?meetingId=${meetingId}`); await page.getByRole('button', { name: 'Check in now', exact: true }).click(); }

test('church location check-in succeeds without QR or camera and persists once', async ({ page, request }) => {
  await locate(page); await open(page);
  await expect(page.getByRole('heading', { name: 'Check-In Confirmed!' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__cameraCalls)).toBe(0);
  let rows = await (await request.get(`${api}/attendance/meeting/${meetingId}`, { headers: adminHeaders })).json();
  expect(rows).toHaveLength(1); expect(rows[0].method).toBe('SYSTEM_GEO');
  await page.reload(); await page.getByRole('button', { name: 'Check in now', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('already been recorded');
  rows = await (await request.get(`${api}/attendance/meeting/${meetingId}`, { headers: adminHeaders })).json(); expect(rows).toHaveLength(1);
});
test('outside church coordinates are rejected', async ({ page }) => {
  await locate(page, 6.6646952, 3.3272455); await open(page);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('outside the attendance zone');
});
test('inaccurate GPS is rejected without camera access', async ({ page }) => {
  await locate(page, 6.6697906, 3.3581822, 150); await open(page);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('GPS signal is too weak');
});
test('location permission denial is actionable and retry remains available', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator.geolocation, 'getCurrentPosition', { value: (_ok: any, fail: any) => fail({ code: 1 }) }));
  await open(page); await expect(page.getByRole('main').getByRole('alert')).toContainText('Location permission denied');
  await expect(page.getByRole('button', { name: 'Check in now', exact: true })).toBeEnabled();
});
test('location timeout is actionable', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator.geolocation, 'getCurrentPosition', { value: (_ok: any, fail: any) => fail({ code: 3 }) }));
  await open(page); await expect(page.getByRole('main').getByRole('alert')).toContainText('Location took too long');
});
test('offline check-in is rejected before requesting GPS', async ({ page, context }) => {
  await locate(page); await page.goto(`/member/check-in?meetingId=${meetingId}`);
  await expect(page.getByRole('button', { name: 'Check in now', exact: true })).toBeEnabled();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Check in now', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('You are offline');
  await context.setOffline(false);
});
