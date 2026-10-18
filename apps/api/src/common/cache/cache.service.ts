import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  tags: string[];
}
interface PendingEntry { promise: Promise<any>; tags: string[] }

@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name);
  private readonly store = new Map<string, CacheEntry<any>>();
  private readonly tagIndex = new Map<string, Set<string>>();
  private readonly inFlight = new Map<string, PendingEntry>();
  private readonly maxEntries = 1000;

  constructor(@Optional() private readonly redis?: RedisService) {}

  async onModuleInit() {
    // Listen for cross-instance invalidation events if Redis is active
    if (this.redis) {
      await this.redis.subscribe('tfhc:cache:invalidation', (payload) => {
        if (payload?.tag) {
          this.localInvalidateTag(payload.tag);
        }
      });
    }
  }

  async wrap<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>, tags: string[] = []): Promise<T> {
    // 1. Check L1 Memory Cache
    const local = this.localGet<T>(key);
    if (local !== undefined) return local;

    // 2. Check L2 Redis Cache
    if (this.redis?.isReady) {
      const remote = await this.redis.get<T>(`tfhc:c:${key}`);
      if (remote !== null && remote !== undefined) {
        this.localSet(key, remote, Math.min(ttlSeconds, 60), tags);
        return remote;
      }
    }

    // 3. Stampede Protection via inFlight Map
    const ongoing = this.inFlight.get(key);
    if (ongoing) return ongoing.promise;

    const pending: PendingEntry = { tags, promise: Promise.resolve() };
    pending.promise = Promise.resolve()
      .then(fetcher)
      .then(async (result) => {
        if (this.inFlight.get(key) === pending) {
          await this.set(key, result, ttlSeconds, tags);
        }
        return result;
      })
      .finally(() => {
        if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
      });

    this.inFlight.set(key, pending);
    return pending.promise;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const local = this.localGet<T>(key);
    if (local !== undefined) return local;

    if (this.redis?.isReady) {
      const remote = await this.redis.get<T>(`tfhc:c:${key}`);
      if (remote !== null && remote !== undefined) {
        this.localSet(key, remote, 60, []);
        return remote;
      }
    }
    return undefined;
  }

  async set<T>(key: string, value: T, ttlSeconds: number, tags: string[] = []): Promise<void> {
    // Update local L1
    this.localSet(key, value, ttlSeconds, tags);

    // Update remote L2 Redis
    if (this.redis?.isReady) {
      const redisKey = `tfhc:c:${key}`;
      await this.redis.set(redisKey, value, ttlSeconds);
      for (const tag of tags) {
        await this.redis.tagKey(tag, redisKey, ttlSeconds);
      }
    }
  }

  async delete(key: string): Promise<void> {
    this.localDelete(key);
    if (this.redis?.isReady) {
      await this.redis.del(`tfhc:c:${key}`);
    }
  }

  async invalidateTag(tag: string): Promise<void> {
    this.localInvalidateTag(tag);
    if (this.redis?.isReady) {
      await this.redis.invalidateTag(tag);
    }
  }

  async invalidateTags(tags: string[]): Promise<void> {
    for (const tag of tags) {
      await this.invalidateTag(tag);
    }
  }

  flush(): void {
    this.store.clear();
    this.tagIndex.clear();
    this.inFlight.clear();
    if (this.redis?.isReady) {
      this.redis.delPattern('tfhc:c:*').catch(() => {});
    }
  }

  // -------------------------------------------------------------------------
  // In-Memory L1 Cache Helpers
  // -------------------------------------------------------------------------

  private localGet<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.localDelete(key);
      return undefined;
    }
    return entry.value as T;
  }

  private localSet<T>(key: string, value: T, ttlSeconds: number, tags: string[] = []): void {
    this.localDelete(key);
    while (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.localDelete(oldestKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000, tags });
    for (const tag of tags) {
      let keys = this.tagIndex.get(tag);
      if (!keys) {
        keys = new Set();
        this.tagIndex.set(tag, keys);
      }
      keys.add(key);
    }
  }

  private localDelete(key: string): void {
    const entry = this.store.get(key);
    for (const tag of entry?.tags || []) {
      const keys = this.tagIndex.get(tag);
      keys?.delete(key);
      if (!keys?.size) this.tagIndex.delete(tag);
    }
    this.store.delete(key);
  }

  private localInvalidateTag(tag: string): void {
    const keys = Array.from(this.tagIndex.get(tag) || []);
    for (const key of keys) this.localDelete(key);
    for (const [key, pending] of this.inFlight) {
      if (pending.tags.includes(tag)) this.inFlight.delete(key);
    }
  }
}
