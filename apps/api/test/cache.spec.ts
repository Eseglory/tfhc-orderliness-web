import { CacheService } from '../src/common/cache/cache.service';

test('a read started before invalidation cannot replace a newer result', async () => {
  const cache = new CacheService();
  let resolveOld!: (value: string) => void;
  const old = cache.wrap('meetings', 60, () => new Promise<string>(resolve => { resolveOld = resolve; }), ['meetings']);
  await Promise.resolve();
  cache.invalidateTag('meetings');
  expect(await cache.wrap('meetings', 60, async () => 'new meeting', ['meetings'])).toBe('new meeting');
  resolveOld('old meeting');
  await old;
  expect(cache.get('meetings')).toBe('new meeting');
});

test('flush prevents pending requests from restoring private data', async () => {
  const cache = new CacheService();
  let resolve!: (value: string) => void;
  const request = cache.wrap('profile', 60, () => new Promise<string>(done => { resolve = done; }), ['member']);
  await Promise.resolve();
  cache.flush();
  resolve('old profile');
  await request;
  expect(cache.get('profile')).toBeUndefined();
});
