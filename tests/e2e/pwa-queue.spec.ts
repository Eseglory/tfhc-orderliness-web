import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync('apps/web/src/lib/pwa/queue.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
// Exercise the actual queue module using real browser IndexedDB. Only the API
// boundary is replaced; no test hooks or fake credentials ship in the app.
async function harness(page: Page) {
  await page.goto('/offline.html');
  await page.evaluate(() => {
    const w = window as any;
    w.owner = 'account-a'; w.failStatus = 0; w.calls = []; w.delay = 0;
    w.api = {
      getAuthToken: () => `header.${btoa(JSON.stringify({ sub: w.owner, exp: Date.now() / 1000 + 3600 }))}.signature`,
      ApiError: class extends Error { constructor(public status: number) { super('API failure'); } },
      fetchApi: async (url: string, options?: any) => {
        if (url === '/auth/me') return { userId: w.owner };
        w.calls.push({ url, body: JSON.parse(options.body) });
        await new Promise(resolve => setTimeout(resolve, w.delay));
        if (w.failStatus) throw new w.api.ApiError(w.failStatus);
        return { count: 1 };
      },
    };
    // Tokens must be stable during each replay, just like real JWTs.
    const tokens: Record<string, string> = {};
    w.api.getAuthToken = () => tokens[w.owner] ||= `header.${btoa(JSON.stringify({ sub: w.owner, exp: Date.now() / 1000 + 3600 }))}.signature`;
  });
  await page.addScriptTag({ content: `{const exports = {}; const require = () => window.api; ${code}; window.queue = exports;}` });
}
test('offline IDs survive reload, replay once and exclude credentials', async ({ page, context }) => {
  await harness(page); await context.setOffline(true);
  await page.evaluate(() => (window as any).queue.enqueueNotificationReads(['notification-1']));
  const rows = await page.evaluate(() => (window as any).queue.listOperations());
  expect(rows).toHaveLength(1); expect(JSON.stringify(rows)).not.toContain('signature');
  await context.setOffline(false); await harness(page);
  await page.evaluate(() => (window as any).queue.flushQueue());
  expect(await page.evaluate(() => (window as any).calls)).toHaveLength(1);
  expect(await page.evaluate(() => (window as any).queue.listOperations())).toHaveLength(0);
});
test('account isolation, logout cleanup and conflict review', async ({ page, context }) => {
  await harness(page); await context.setOffline(true);
  await page.evaluate(() => (window as any).queue.enqueueNotificationReads(['notification-1']));
  await page.evaluate(() => { (window as any).owner = 'account-b'; });
  expect(await page.evaluate(() => (window as any).queue.listOperations())).toHaveLength(0);
  await context.setOffline(false);
  await page.evaluate(() => (window as any).queue.flushQueue());
  expect(await page.evaluate(() => (window as any).calls)).toHaveLength(0);
  await page.evaluate(async () => { const w = window as any; w.owner = 'account-a'; w.failStatus = 409; await w.queue.flushQueue(); });
  expect((await page.evaluate(() => (window as any).queue.listOperations()))[0].state).toBe('conflict');
  await page.evaluate(() => (window as any).queue.flushQueue());
  expect(await page.evaluate(() => (window as any).calls)).toHaveLength(1);
  await page.evaluate(() => (window as any).queue.clearOperations());
  expect(await page.evaluate(() => (window as any).queue.listOperations())).toHaveLength(0);
});
test('two tabs atomically claim a queued operation', async ({ page, context }) => {
  await harness(page); const other = await context.newPage(); await harness(other);
  await context.setOffline(true);
  await page.evaluate(() => (window as any).queue.enqueueNotificationReads(['notification-1']));
  await context.setOffline(false);
  await Promise.all([page, other].map(tab => tab.evaluate(async () => { const w = window as any; w.delay = 100; await w.queue.flushQueue(); })));
  const counts = await Promise.all([page, other].map(tab => tab.evaluate(() => (window as any).calls.length)));
  expect(counts[0] + counts[1]).toBe(1);
});
test('transient failures back off and logout cannot resurrect an in-flight retry', async ({ page, context }) => {
  await harness(page); await context.setOffline(true);
  await page.evaluate(() => (window as any).queue.enqueueNotificationReads(['notification-1']));
  await context.setOffline(false);
  await page.evaluate(async () => { const w = window as any; w.failStatus = 503; await w.queue.flushQueue(); });
  const row = (await page.evaluate(() => (window as any).queue.listOperations()))[0];
  expect(row.state).toBe('pending'); expect(row.attempts).toBe(1); expect(row.nextAttemptAt).toBeGreaterThan(Date.now());
  await page.evaluate(() => (window as any).queue.flushQueue());
  expect(await page.evaluate(() => (window as any).calls)).toHaveLength(1);
  await page.evaluate(async () => {
    const w = window as any; await w.queue.clearOperations();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await w.queue.enqueueNotificationReads(['notification-2']);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    w.delay = 100; const flushing = w.queue.flushQueue();
    await new Promise(resolve => setTimeout(resolve, 50)); await w.queue.clearOperations(); await flushing;
  });
  expect(await page.evaluate(() => (window as any).queue.listOperations())).toHaveLength(0);
});
