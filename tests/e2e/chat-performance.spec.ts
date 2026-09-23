import { test, expect } from '@playwright/test';
import { io } from 'socket.io-client';
import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';

// Measurements use the real UI, API, SQLite, PostgreSQL and sockets in isolated UAT.
// Existing test history is reused; no large synthetic dataset is generated.
test('measure chat critical paths', async ({ page, request }) => {
  const api = `http://127.0.0.1:${process.env.E2E_API_PORT || '4100'}`;
  const login = async (email: string) => {
    const response = await request.post(`${api}/auth/login`, { data: { email, password: 'E2ePassword!123' } });
    expect(response.ok()).toBeTruthy(); return (await response.json()).accessToken as string;
  };
  const token = await login('member-browser@tfhc.org');
  const peerToken = await login('admin-browser@tfhc.org');
  const peer = io(`${api}/chat`, { transports: ['websocket'], auth: { token: peerToken } });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Recipient socket did not connect')), 10000);
    peer.once('ready', () => { clearTimeout(timeout); resolve(); });
  });
  try {
    const roomResponse = await request.get(`${api}/chat/rooms`, { headers: { Authorization: `Bearer ${token}` } });
    const roomId = (await roomResponse.json()).find((r: any) => r.key === 'GENERAL').id;
    await page.addInitScript(value => localStorage.setItem('tfhc_token', value), token);
    const apiSamples: number[] = [];
    let pageBytes = 0;
    for (let i = 0; i < 10; i++) {
      const started = performance.now();
      const result = await request.get(`${api}/chat/rooms/${roomId}/messages?compactMedia=true`, { headers: { Authorization: `Bearer ${token}` } });
      expect(result.ok()).toBeTruthy();
      pageBytes = (await result.body()).byteLength;
      apiSamples.push(performance.now() - started);
    }
    await page.goto('/member/chat');
    const general = page.getByRole('button').filter({ has: page.getByText('General', { exact: true }) }).first();
    await expect(general).toBeVisible();
    await general.click();
    await expect(page.getByPlaceholder('Type a message…')).toBeVisible();
    await page.waitForFunction(() => document.querySelectorAll('[id^="chat-message-"]').length > 0);
    const install = page.getByRole('button', { name: 'Dismiss banner' });
    if (await install.isVisible()) await install.click();
    const optimistic: number[] = [];
    const delivery: number[] = [];
    const copies: number[] = [];
    for (let i = 0; i < 5; i++) {
      const text = `Chat latency verification ${randomUUID()}`;
      let deliveredAt = 0, received = 0;
      const receive = (message: any) => { if (message.body === text) { deliveredAt ||= Date.now(); received++; } };
      peer.on('message:new', receive);
      await page.getByPlaceholder('Type a message…').fill(text);
      await page.evaluate(value => {
        const state = { clicked: 0, painted: 0 };
        (window as any).__chatTimingSample = state;
        document.querySelector('button[aria-label="Send message"]')!.addEventListener('click', () => { state.clicked = window.performance.timeOrigin + window.performance.now(); }, { once: true });
        const observer = new MutationObserver(() => {
          if (![...document.querySelectorAll('[id^="chat-message-"]')].some(node => node.textContent?.includes(value))) return;
          requestAnimationFrame(() => { state.painted ||= window.performance.timeOrigin + window.performance.now(); });
          observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      }, text);
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await expect.poll(() => deliveredAt).toBeGreaterThan(0);
      await page.waitForFunction(() => (window as any).__chatTimingSample.painted > 0);
      const measured = await page.evaluate(() => (window as any).__chatTimingSample);
      optimistic.push(measured.painted - measured.clicked);
      delivery.push(deliveredAt - measured.clicked);
      copies.push(received);
      peer.off('message:new', receive);
    }
    const stats = (samples: number[]) => { const sorted = [...samples].sort((a,b)=>a-b); return { samples: sorted.length, p50Ms: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1] }; };
    console.log(JSON.stringify({ benchmark: 'chat-browser-critical-paths', messagePage: stats(apiSamples), messagePageBytes: pageBytes,
      optimisticPaint: stats(optimistic), recipientDelivery: stats(delivery), recipientCopies: copies,
      mountedMessages: await page.locator('[id^="chat-message-"]').count(),
    }));
  } finally { peer.disconnect(); }
});
