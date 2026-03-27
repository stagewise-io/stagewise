import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { eq, desc, notInArray } from 'drizzle-orm';
import { fileReadCache, meta } from './schema';
import { migrateDatabase } from '@/utils/migrate-database';
import { registry, schemaVersion } from './migrations';
import initSql from './schema.sql?raw';
import { DisposableService } from '../disposable';
import type { Logger } from '../logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of cached entries (LRU eviction target). */
const MAX_ENTRIES = 500;

/** Minimum interval between background LRU sweep operations (ms). */
const SWEEP_INTERVAL_MS = 60_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Schema = { fileReadCache: typeof fileReadCache; meta: typeof meta };

export interface CachedFileContent {
  /**
   * The **post-transformation** model-ready representation.
   *
   * This is the final string injected into model context — no further
   * processing needed. Examples:
   * - Text files: processed content (truncated, line-numbered, etc.)
   * - Images: base64-encoded WebP at quality 80
   * - Directories: formatted listing output
   */
  content: string;
  /** Original raw file size in bytes (before transformation). */
  sizeBytes: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * SQLite-backed LRU cache for file-read content, keyed by SHA-256 content hash.
 *
 * Used by the file attachment pipeline to avoid re-running expensive
 * transformations (image compression, text truncation, directory listing)
 * on every step when the underlying file hasn't changed.
 *
 * The cache stores **post-transformation** model-ready content:
 * - **Text files**: Processed content (truncated, line-numbered, etc.)
 * - **Images**: Base64-encoded WebP at quality 80
 * - **Directories**: Formatted listing output
 *
 * The caller is responsible for transforming raw content before calling
 * `set()`. On cache hit via `get()`, the returned content can be injected
 * directly into the model context without further processing.
 *
 * Eviction: LRU sweep runs fire-and-forget after `get`/`set` calls,
 * throttled to at most once per 60 s. Entries beyond `MAX_ENTRIES` are
 * removed, oldest-`last_used_at` first.
 */
export class FileReadCacheService extends DisposableService {
  private readonly db: LibSQLDatabase<Schema>;
  private readonly dbDriver: Client;
  private readonly logger: Logger;

  private _lastSweepMs = 0;

  private constructor(
    db: LibSQLDatabase<Schema>,
    dbDriver: Client,
    logger: Logger,
  ) {
    super();
    this.db = db;
    this.dbDriver = dbDriver;
    this.logger = logger;
  }

  /**
   * Opens the DB at an explicit libsql URL. Intended for testing
   * (e.g. pass `':memory:'` for an in-process SQLite DB).
   */
  public static async createWithUrl(
    url: string,
    logger: Logger,
  ): Promise<FileReadCacheService> {
    logger.debug(`[FileReadCache] Opening DB at ${url}`);

    const dbDriver = createClient({ url });
    const db = drizzle(dbDriver, {
      schema: { fileReadCache, meta },
    }) as LibSQLDatabase<Schema>;

    await migrateDatabase({
      db: db as any,
      client: dbDriver,
      registry,
      initSql,
      schemaVersion,
    });

    logger.debug('[FileReadCache] Migrations complete, running startup sweep');
    const instance = new FileReadCacheService(db, dbDriver, logger);
    await instance.runSweep();

    return instance;
  }

  /**
   * Build a cache key from a content hash, file extension, and optional
   * read-parameter suffix.
   *
   * The cache key includes the extension because metadata in the cached
   * result is path-dependent (e.g. `language:typescript` vs `language:python`).
   * Two files with identical content but different extensions need separate
   * cache entries. This also handles file renames/moves correctly — a new
   * extension produces a new cache key.
   *
   * When `readParamsSuffix` is provided (non-empty), it is appended so
   * that different slices of the same file (e.g. lines 1–50 vs 51–100)
   * are cached independently.
   *
   * @param contentHash — SHA-256 hex digest of the raw file content.
   * @param ext — Lowercase file extension including the dot (e.g. `".ts"`),
   *              or empty string if none.
   * @param readParamsSuffix — Deterministic string encoding read params
   *              (e.g. `"sl=1,el=50"`), or empty string / omitted when
   *              the full file is read.
   */
  public static buildCacheKey(
    contentHash: string,
    ext: string,
    readParamsSuffix?: string,
  ): string {
    let key = ext ? `${contentHash}:${ext}` : contentHash;
    if (readParamsSuffix) key += `@${readParamsSuffix}`;
    return key;
  }

  /**
   * Look up cached file content by its cache key.
   *
   * The key should be produced via `FileReadCacheService.buildCacheKey()`
   * to include the file extension for correct metadata separation.
   *
   * Returns `CachedFileContent` on hit (and updates `last_used_at`),
   * or `null` on miss.
   */
  public async get(cacheKey: string): Promise<CachedFileContent | null> {
    this.assertNotDisposed();

    const row = await this.db
      .select()
      .from(fileReadCache)
      .where(eq(fileReadCache.contentHash, cacheKey))
      .get();

    if (!row) {
      this.logger.debug(`[FileReadCache] Miss — key=${cacheKey.slice(0, 16)}…`);
      return null;
    }

    // Update last_used_at so this entry survives LRU eviction.
    const nowMs = Date.now();
    await this.db
      .update(fileReadCache)
      .set({ lastUsedAt: nowMs })
      .where(eq(fileReadCache.contentHash, cacheKey));

    this.logger.debug(
      `[FileReadCache] Hit — key=${cacheKey.slice(0, 16)}…, ${row.sizeBytes} bytes`,
    );

    this.scheduleSweep();

    return { content: row.content, sizeBytes: row.sizeBytes };
  }

  /**
   * Store file content in the cache.
   *
   * The key should be produced via `FileReadCacheService.buildCacheKey()`.
   * Uses an UPSERT so concurrent writes for the same key are safe.
   */
  public async set(
    cacheKey: string,
    content: string,
    sizeBytes: number,
  ): Promise<void> {
    this.assertNotDisposed();

    const nowMs = Date.now();

    await this.db
      .insert(fileReadCache)
      .values({
        contentHash: cacheKey,
        content,
        sizeBytes,
        createdAt: nowMs,
        lastUsedAt: nowMs,
      })
      .onConflictDoUpdate({
        target: fileReadCache.contentHash,
        set: {
          content,
          sizeBytes,
          lastUsedAt: nowMs,
        },
      });

    this.logger.debug(
      `[FileReadCache] Stored — key=${cacheKey.slice(0, 16)}…, ${sizeBytes} bytes`,
    );

    this.scheduleSweep();
  }

  /**
   * Fires the LRU sweep asynchronously (fire-and-forget), throttled to at
   * most once per SWEEP_INTERVAL_MS. Never blocks the caller.
   */
  private scheduleSweep(): void {
    if (Date.now() - this._lastSweepMs < SWEEP_INTERVAL_MS) return;
    this._lastSweepMs = Date.now();
    this.runSweep().catch((e: unknown) => {
      this.logger.warn('[FileReadCache] Background sweep failed', e);
    });
  }

  /**
   * Deletes all entries beyond the MAX_ENTRIES LRU limit.
   *
   * Uses a single `DELETE … WHERE key NOT IN (top N)` query instead of
   * per-row deletes. The primary key is a single TEXT column, so Drizzle's
   * `notInArray` works directly.
   */
  private async runSweep(): Promise<void> {
    const keep = await this.db
      .select({ contentHash: fileReadCache.contentHash })
      .from(fileReadCache)
      .orderBy(desc(fileReadCache.lastUsedAt))
      .limit(MAX_ENTRIES);

    if (keep.length < MAX_ENTRIES) {
      // Fewer than MAX_ENTRIES rows — nothing to evict.
      return;
    }

    const keepKeys = keep.map((r) => r.contentHash);

    const deleted = await this.db
      .delete(fileReadCache)
      .where(notInArray(fileReadCache.contentHash, keepKeys));

    const evictedCount = deleted.rowsAffected;
    if (evictedCount > 0) {
      this.logger.debug(
        `[FileReadCache] LRU sweep evicted ${evictedCount} entr${evictedCount === 1 ? 'y' : 'ies'}`,
      );
    }
  }

  protected onTeardown(): void {
    this.dbDriver.close();
  }
}
