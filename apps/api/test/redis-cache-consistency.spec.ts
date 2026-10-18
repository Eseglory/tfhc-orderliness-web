import { RedisService } from '../src/common/redis/redis.service';
import { CacheService } from '../src/common/cache/cache.service';
import { ConfigService } from '@nestjs/config';

describe('Redis Shared Caching & Consistency Architecture', () => {
  let config: ConfigService;
  let redis: RedisService;
  let cache: CacheService;

  beforeEach(async () => {
    config = new ConfigService();
    redis = new RedisService(config);
    // In test environment without external Redis, verify graceful fallback mode
    await redis.onModuleInit();
    cache = new CacheService(redis);
  });

  afterEach(async () => {
    await redis.onModuleDestroy();
  });

  it('gracefully degrades to local in-memory operation when Redis is unavailable', async () => {
    expect(redis.isReady).toBe(false);
    // None of these should throw
    await expect(redis.get('test:key')).resolves.toBeNull();
    await expect(redis.set('test:key', { foo: 'bar' }, 60)).resolves.toBeUndefined();
    await expect(redis.del('test:key')).resolves.toBeUndefined();
    await expect(redis.tagKey('reports', 'test:key')).resolves.toBeUndefined();
    await expect(redis.invalidateTag('reports')).resolves.toBeUndefined();
    await expect(redis.sAdd('tfhc:presence:online', 'member-1')).resolves.toBeUndefined();
    await expect(redis.sMembers('tfhc:presence:online')).resolves.toEqual([]);
    await expect(redis.sRem('tfhc:presence:online', 'member-1')).resolves.toBeUndefined();
    await expect(redis.publish('tfhc:events:chat', { type: 'test' })).resolves.toBeUndefined();
  });

  it('guarantees fresh read-after-write consistency upon tag invalidation', async () => {
    let queryCount = 0;
    const fetchDashboardMetrics = async () => {
      queryCount++;
      return { totalActiveMembers: 120, attendanceRate: 95.5 + queryCount };
    };

    // First read: computes and caches
    const firstRead = await cache.wrap('reports:dashboard', 300, fetchDashboardMetrics, ['dashboard', 'reports']);
    expect(firstRead.attendanceRate).toBe(96.5);
    expect(queryCount).toBe(1);

    // Repeated read: served from cache without recomputing
    const cachedRead = await cache.wrap('reports:dashboard', 300, fetchDashboardMetrics, ['dashboard', 'reports']);
    expect(cachedRead.attendanceRate).toBe(96.5);
    expect(queryCount).toBe(1);

    // A mutation occurs (e.g. attendance recorded) -> write-through invalidation
    await cache.invalidateTag('dashboard');

    // Immediate next read MUST reflect fresh authoritative data (no stale data)
    const freshRead = await cache.wrap('reports:dashboard', 300, fetchDashboardMetrics, ['dashboard', 'reports']);
    expect(freshRead.attendanceRate).toBe(97.5);
    expect(queryCount).toBe(2);
  });

  it('multi-tag invalidation flushes all associated queries simultaneously', async () => {
    let attendanceCalls = 0;
    let meetingsCalls = 0;

    const getAttendance = async () => (++attendanceCalls, { count: attendanceCalls });
    const getMeetings = async () => (++meetingsCalls, { count: meetingsCalls });

    await cache.wrap('query:attendance', 60, getAttendance, ['attendance', 'dashboard']);
    await cache.wrap('query:meetings', 60, getMeetings, ['meetings', 'dashboard']);
    expect(attendanceCalls).toBe(1);
    expect(meetingsCalls).toBe(1);

    // Invalidate the shared 'dashboard' tag
    await cache.invalidateTags(['dashboard']);

    // Both queries must re-run to guarantee cluster consistency
    await cache.wrap('query:attendance', 60, getAttendance, ['attendance', 'dashboard']);
    await cache.wrap('query:meetings', 60, getMeetings, ['meetings', 'dashboard']);
    expect(attendanceCalls).toBe(2);
    expect(meetingsCalls).toBe(2);
  });

  it('prevents stale concurrent resolution from overwriting newer cache entries', async () => {
    let resolveStale!: (val: string) => void;
    const slowPending = cache.wrap(
      'profile:user-1',
      60,
      () => new Promise<string>((resolve) => (resolveStale = resolve)),
      ['profile'],
    );
    await Promise.resolve();

    // User updates profile while slow read was pending -> tag invalidated
    await cache.invalidateTag('profile');

    // Write new profile update to cache
    const freshResult = await cache.wrap('profile:user-1', 60, async () => 'updated-profile', ['profile']);
    expect(freshResult).toBe('updated-profile');

    // The slow pending read finishes late
    resolveStale('stale-old-profile');
    await slowPending;

    // The newer committed result must not be overwritten by the stale read
    expect(await cache.get('profile:user-1')).toBe('updated-profile');
  });
});
