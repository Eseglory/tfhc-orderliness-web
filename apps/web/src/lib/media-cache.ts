'use client';

/**
 * High-performance client-side media caching using CacheStorage & IndexedDB.
 * Prevents redundant network downloads for audio voice notes, images, and document previews.
 * Implements a strict LRU 50MB device cache budget with automatic eviction.
 */

const CACHE_NAME = 'tfhc-chat-media-v1';
const MAX_CACHE_BYTES = 50 * 1024 * 1024; // 50 MB budget

interface CachedMediaMeta {
  url: string;
  size: number;
  cachedAt: number;
  lastAccessedAt: number;
}

const objectUrlMemory = new Map<string, string>();

/**
 * Retrieves a cached Blob URL for a given media URL, or downloads and caches it.
 * Subsequent requests for the same media return immediately from the local device cache.
 */
export async function getCachedMediaUrl(url: string): Promise<string> {
  if (!url || typeof window === 'undefined') return url;

  // 1. In-memory object URL cache for instant synchronous access in the current session
  if (objectUrlMemory.has(url)) {
    return objectUrlMemory.get(url)!;
  }

  // If URL is already a data URI or blob URI, return directly
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }

  // 2. Check persistent browser CacheStorage
  if ('caches' in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const match = await cache.match(url);
      if (match) {
        const blob = await match.blob();
        const objUrl = URL.createObjectURL(blob);
        objectUrlMemory.set(url, objUrl);
        updateAccessTime(url);
        return objUrl;
      }

      // Download and cache in the background
      const response = await fetch(url, { mode: 'cors' });
      if (response.ok) {
        const cloned = response.clone();
        const blob = await response.blob();
        
        // Evict if needed before putting
        await evictIfNecessary(blob.size);
        await cache.put(url, cloned);

        recordCacheMeta(url, blob.size);
        const objUrl = URL.createObjectURL(blob);
        objectUrlMemory.set(url, objUrl);
        return objUrl;
      }
    } catch {
      // Fallback directly to network URL if cache storage is blocked or full
      return url;
    }
  }

  return url;
}

const META_STORAGE_KEY = 'tfhc:chat-media-cache-meta';

function getCacheMetaList(): CachedMediaMeta[] {
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCacheMetaList(list: CachedMediaMeta[]) {
  try {
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

function recordCacheMeta(url: string, size: number) {
  const list = getCacheMetaList().filter((m) => m.url !== url);
  list.push({
    url,
    size,
    cachedAt: Date.now(),
    lastAccessedAt: Date.now(),
  });
  saveCacheMetaList(list);
}

function updateAccessTime(url: string) {
  const list = getCacheMetaList();
  const item = list.find((m) => m.url === url);
  if (item) {
    item.lastAccessedAt = Date.now();
    saveCacheMetaList(list);
  }
}

async function evictIfNecessary(incomingBytes: number) {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    let list = getCacheMetaList();
    let currentTotal = list.reduce((sum, item) => sum + (item.size || 0), 0);

    if (currentTotal + incomingBytes <= MAX_CACHE_BYTES) return;

    // Sort by least recently accessed
    list.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

    while (list.length > 0 && currentTotal + incomingBytes > MAX_CACHE_BYTES) {
      const oldest = list.shift()!;
      await cache.delete(oldest.url);
      currentTotal -= oldest.size;

      // Revoke in-memory object URL if exists
      if (objectUrlMemory.has(oldest.url)) {
        URL.revokeObjectURL(objectUrlMemory.get(oldest.url)!);
        objectUrlMemory.delete(oldest.url);
      }
    }

    saveCacheMetaList(list);
  } catch {}
}
