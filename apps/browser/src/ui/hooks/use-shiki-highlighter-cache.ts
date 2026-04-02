/**
 * Shiki Highlighter Cache
 *
 * Two-tier cache for Shiki syntax highlighting HTML:
 * 1. In-memory Map for fast synchronous O(1) lookups (hot path for Virtuoso scroll)
 * 2. IndexedDB for persistence across page refreshes (written by the Shiki web worker)
 *
 * Features:
 * - LRU eviction when cache size exceeds limits
 * - Zero main-thread persistence cost (all IDB writes happen in the worker)
 * - Async IDB hydration on startup via requestIdleCallback
 * - Graceful degradation if IDB is unavailable
 * - HMR survival via window global
 */

import {
  generateCacheKey,
  MAX_CACHE_SIZE,
  IDB_STORE_NAME,
  openHighlightDB,
} from '@ui/components/ui/highlight-cache-key';

export { generateCacheKey };

export const HIGHLIGHT_CONFIG = {
  /** Maximum cache entries (LRU eviction when exceeded) */
  MAX_CACHE_SIZE,
} as const;

export type CacheEntry = {
  html: string;
  accessTime: number;
};

/**
 * LRU cache for highlighted HTML with IndexedDB persistence.
 * Keyed by a hash of (code, language, preClassName, compactDiff).
 *
 * Reads are always synchronous against the in-memory Map.
 * Writes to IDB are handled by the Shiki web worker — this class
 * only reads from IDB during startup hydration.
 */
export class HighlightCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private isHydrated = false;

  constructor(maxSize: number = HIGHLIGHT_CONFIG.MAX_CACHE_SIZE) {
    this.maxSize = maxSize;
  }

  /**
   * Asynchronously hydrates the in-memory cache from IndexedDB.
   * Called once during startup via requestIdleCallback.
   * On any IDB error, logs a warning and continues (cache starts cold).
   */
  async hydrateFromIDB(): Promise<void> {
    if (this.isHydrated) return;
    this.isHydrated = true;

    // One-time migration: clean up old localStorage data
    try {
      const oldKey = 'stagewise_highlight_cache';
      if (localStorage.getItem(oldKey) !== null) {
        localStorage.removeItem(oldKey);
      }
    } catch {
      // localStorage unavailable — ignore
    }

    try {
      const db = await openHighlightDB();
      const entries = await new Promise<CacheEntry[]>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE_NAME, 'readonly');
        const store = tx.objectStore(IDB_STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () =>
          resolve(req.result as (CacheEntry & { key: string })[]);
        req.onerror = () => reject(req.error);
      });

      for (const entry of entries as (CacheEntry & { key: string })[]) {
        this.cache.set(entry.key, {
          html: entry.html,
          accessTime: entry.accessTime,
        });
      }

      // Evict if we loaded more than max size
      while (this.cache.size > this.maxSize) this.evictOldest();
    } catch (error) {
      console.warn('HighlightCache: Failed to hydrate from IndexedDB', error);
    }
  }

  /**
   * Evicts the oldest (least recently accessed) entry from the cache.
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Number.POSITIVE_INFINITY;

    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      if (entry.accessTime < oldestTime) {
        oldestTime = entry.accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) this.cache.delete(oldestKey);
  }

  /**
   * Gets a cached entry, updating its access time for LRU tracking.
   * Purely synchronous — reads only from the in-memory Map.
   */
  get(
    code: string,
    language: string,
    preClassName?: string,
    compactDiff?: boolean,
  ): CacheEntry | undefined {
    const key = generateCacheKey(code, language, preClassName, compactDiff);
    return this.getByKey(key);
  }

  /**
   * Gets a cached entry by pre-computed key.
   * Use when the caller has already computed the key to avoid re-hashing.
   */
  getByKey(key: string): CacheEntry | undefined {
    const entry = this.cache.get(key);
    if (entry) entry.accessTime = Date.now();
    return entry;
  }

  /**
   * Sets a cache entry in the in-memory Map.
   * Does NOT trigger persistence — the Shiki worker writes to IDB independently.
   */
  set(
    code: string,
    language: string,
    preClassName: string | undefined,
    compactDiff: boolean | undefined,
    html: string,
  ): void {
    const key = generateCacheKey(code, language, preClassName, compactDiff);
    this.setByKey(key, html);
  }

  /**
   * Sets a cache entry by pre-computed key.
   * Use when the caller has already computed the key to avoid re-hashing.
   */
  setByKey(key: string, html: string): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key))
      this.evictOldest();

    this.cache.set(key, {
      html,
      accessTime: Date.now(),
    });
  }

  /**
   * Clears all cached entries from memory and IDB.
   */
  clear(): void {
    this.cache.clear();

    // Fire-and-forget IDB clear
    openHighlightDB()
      .then((db) => {
        const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
        tx.objectStore(IDB_STORE_NAME).clear();
      })
      .catch(() => {
        // Ignore
      });
  }

  /**
   * Returns the current number of cached entries.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Proactively hydrates the cache from IndexedDB.
   * Call this during idle time to pre-populate the in-memory Map
   * before the first code block scroll.
   */
  warmup(): void {
    void this.hydrateFromIDB();
  }
}

// Store on window to survive Hot Module Replacement (HMR) during development
declare global {
  interface Window {
    __stagewise_highlight_cache?: HighlightCache;
  }
}

/**
 * Returns the global HighlightCache singleton instance.
 * The instance survives HMR during development via window global.
 *
 * On first creation, schedules an idle-time warmup to hydrate the cache
 * from IndexedDB asynchronously.
 */
export function getHighlightCache(): HighlightCache {
  if (!window.__stagewise_highlight_cache) {
    window.__stagewise_highlight_cache = new HighlightCache();

    // Proactively hydrate cache during idle time instead of
    // lazily on first code block render.
    const cache = window.__stagewise_highlight_cache;
    if (typeof requestIdleCallback === 'function')
      requestIdleCallback(() => cache.warmup());
    else setTimeout(() => cache.warmup(), 200);
  }

  return window.__stagewise_highlight_cache;
}
