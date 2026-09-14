import { Injectable } from '@nestjs/common';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  tags: string[];
}
interface PendingEntry { promise: Promise<any>; tags: string[] }

@Injectable()
export class CacheService {
  private readonly store = new Map<string, CacheEntry<any>>();
  private readonly tagIndex = new Map<string, Set<string>>();
  private readonly inFlight = new Map<string, PendingEntry>();
  private readonly maxEntries = 1000;

  async wrap<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>, tags: string[] = []): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const ongoing = this.inFlight.get(key);
    if (ongoing) return ongoing.promise;
    const pending: PendingEntry = { tags, promise: Promise.resolve() };
    pending.promise = Promise.resolve().then(fetcher).then(result => {
      // An invalidated read must not repopulate the cache after a mutation.
      if (this.inFlight.get(key) === pending) this.set(key, result, ttlSeconds, tags);
      return result;
    }).finally(() => {
      if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
    });
    this.inFlight.set(key, pending);
    return pending.promise;
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) { this.delete(key); return undefined; }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number, tags: string[] = []): void {
    this.delete(key);
    while (this.store.size >= this.maxEntries) this.delete(this.store.keys().next().value!);
    this.store.set(key, { value, expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000, tags });
    for (const tag of tags) {
      let keys = this.tagIndex.get(tag);
      if (!keys) { keys = new Set(); this.tagIndex.set(tag, keys); }
      keys.add(key);
    }
  }

  delete(key: string): void {
    const entry = this.store.get(key);
    for (const tag of entry?.tags || []) {
      const keys = this.tagIndex.get(tag);
      keys?.delete(key);
      if (!keys?.size) this.tagIndex.delete(tag);
    }
    this.store.delete(key);
  }

  invalidateTag(tag: string): void {
    for (const key of Array.from(this.tagIndex.get(tag) || [])) this.delete(key);
    for (const [key, pending] of this.inFlight) {
      if (pending.tags.includes(tag)) this.inFlight.delete(key);
    }
  }
  invalidateTags(tags: string[]): void { for (const tag of tags) this.invalidateTag(tag); }
  flush(): void { this.store.clear(); this.tagIndex.clear(); this.inFlight.clear(); }
}
