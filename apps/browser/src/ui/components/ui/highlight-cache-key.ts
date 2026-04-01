/**
 * Shared constants and key generation for the highlight cache.
 * Imported by both the main-thread HighlightCache and the Shiki web worker.
 */

/** Maximum cache entries (LRU eviction when exceeded) */
export const MAX_CACHE_SIZE = 200;

/** IndexedDB database name */
export const IDB_DB_NAME = 'stagewise_highlight_cache';

/** IndexedDB object store name */
export const IDB_STORE_NAME = 'entries';

/** IndexedDB schema version */
const IDB_VERSION = 1;

/**
 * Opens the highlight cache IndexedDB database.
 * Single source of truth for schema (version, store, indexes).
 * Safe to call from both main thread and web worker contexts.
 */
export function openHighlightDB(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(IDB_DB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        const store = db.createObjectStore(IDB_STORE_NAME, {
          keyPath: 'key',
        });
        store.createIndex('accessTime', 'accessTime', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Fast 53-bit hash (cyrb53). Not cryptographic — used only for
 * cache key deduplication. Produces a hex string.
 */
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/**
 * Generates a deterministic cache key from highlighting parameters.
 * Uses a fast hash of the full code string to avoid collisions
 * while keeping keys compact for IndexedDB storage.
 */
export function generateCacheKey(
  code: string,
  language: string,
  preClassName?: string,
  compactDiff?: boolean,
): string {
  return `${language}|${preClassName ?? ''}|${compactDiff ?? false}|${cyrb53(code)}`;
}
