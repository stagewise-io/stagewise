import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { eq, lt } from 'drizzle-orm';
import { assetCache, meta } from './schema';
import { migrateDatabase } from '@/utils/migrate-database';
import { registry, schemaVersion } from './migrations';
import initSql from './schema.sql?raw';
import { getDbPath } from '@/utils/paths';
import { createApiClient } from '@stagewise/api-client';
import { DisposableService } from '../disposable';
import type { Logger } from '../logger';

const API_URL =
  (process.env.API_URL as string | undefined) ?? 'https://v1.api.stagewise.io';

/**
 * Allowed MIME types for upload — mirrors the server-side ALLOWED_MEDIA_TYPES
 * list in apps/api/src/modules/assets/model.ts. Attachments with other MIME
 * types are silently skipped (buffer fallback is used instead).
 */
const ALLOWED_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

/**
 * Number of seconds before the cached URL's expiry at which we consider it
 * "nearly expired" and re-upload. 120 s gives enough headroom to finish the
 * current model call even if it runs long.
 */
const EXPIRY_SAFETY_MARGIN_S = 120;

/** Minimum wall-clock interval between background sweep operations (ms). */
const SWEEP_INTERVAL_MS = 60_000;

export type ResolveResult =
  | { type: 'url'; url: string }
  | { type: 'buffer'; buffer: Buffer };

type Schema = { assetCache: typeof assetCache; meta: typeof meta };

/**
 * Caches presigned S3 read URLs for file attachments keyed by SHA-256 hash.
 *
 * On each `resolve()` call:
 * 1. Reads the file from disk and computes a SHA-256 hash.
 * 2. Checks the SQLite cache for a non-expired URL.
 * 3. On cache hit → returns `{ type: 'url', url }` (no re-upload).
 * 4. On cache miss/expiry → uploads via POST /v1/assets/upload then PUT to S3.
 * 5. Falls back to `{ type: 'buffer', buffer }` if the user is not
 *    authenticated or if the upload fails for any reason.
 *
 * A throttled background sweep (`sweepExpired`) deletes stale rows from
 * SQLite at most once per minute, triggered lazily on each `resolve()` call
 * without blocking the caller.
 */
export class AssetCacheService extends DisposableService {
  private readonly db: LibSQLDatabase<Schema>;
  private readonly dbDriver: Client;
  private readonly getAccessToken: () => string | undefined;
  private readonly logger: Logger;

  private _lastSweepMs = 0;

  private constructor(
    db: LibSQLDatabase<Schema>,
    dbDriver: Client,
    getAccessToken: () => string | undefined,
    logger: Logger,
  ) {
    super();
    this.db = db;
    this.dbDriver = dbDriver;
    this.getAccessToken = getAccessToken;
    this.logger = logger;
  }

  /**
   * Opens (or creates) the SQLite cache DB, runs migrations, and does a
   * one-time startup sweep to remove rows that expired in a previous session.
   */
  public static async create(
    getAccessToken: () => string | undefined,
    logger: Logger,
  ): Promise<AssetCacheService> {
    const dbPath = getDbPath('asset-cache');
    logger.debug(`[AssetCacheService] Opening DB at ${dbPath}`);

    const dbDriver = createClient({ url: `file:${dbPath}` });
    const db = drizzle(dbDriver, {
      schema: { assetCache, meta },
    }) as LibSQLDatabase<Schema>;

    await migrateDatabase({
      db: db as any,
      client: dbDriver,
      registry,
      initSql,
      schemaVersion,
    });

    // Startup sweep: clear rows that expired during a previous session.
    const nowS = Math.floor(Date.now() / 1000);
    await db.delete(assetCache).where(lt(assetCache.expiresAt, nowS));
    logger.debug('[AssetCacheService] Startup sweep complete');

    return new AssetCacheService(db, dbDriver, getAccessToken, logger);
  }

  /**
   * Resolves a file attachment to either a presigned read URL or a raw Buffer.
   *
   * Callers should prefer the `url` path — it avoids inline base64 in the
   * model request. The `buffer` path is an always-available fallback for
   * unauthenticated users and upload failures.
   *
   * @param filePath  Absolute path to the attachment blob on disk.
   * @param mediaType MIME type (e.g. `'image/png'`).
   * @param filename  Original filename for display and upload metadata.
   */
  public async resolve(
    filePath: string,
    mediaType: string,
    filename: string,
  ): Promise<ResolveResult> {
    this.assertNotDisposed();

    const buffer = await fs.readFile(filePath);
    const hash = createHash('sha256').update(buffer).digest('hex');
    this.logger.warn(
      `[AssetCacheService] resolve() — file: ${filePath}, mediaType: ${mediaType}, hash: ${hash.slice(0, 12)}…`,
    );

    // Check cache — require at least EXPIRY_SAFETY_MARGIN_S seconds left.
    const minExpiresAt = Math.floor(Date.now() / 1000) + EXPIRY_SAFETY_MARGIN_S;
    const cached = await this.db
      .select()
      .from(assetCache)
      .where(eq(assetCache.fileHash, hash))
      .get();
    this.logger.warn(
      `[AssetCacheService] Cache lookup — found: ${!!cached}, expiresAt: ${cached?.expiresAt ?? 'n/a'}, minExpiresAt: ${minExpiresAt}`,
    );

    // Fire-and-forget background sweep (throttled to once per minute).
    this.sweepExpired();

    if (cached && cached.expiresAt > minExpiresAt) {
      this.logger.warn(
        `[AssetCacheService] Cache hit → returning url: ${cached.readUrl.slice(0, 80)}…`,
      );
      return { type: 'url', url: cached.readUrl };
    }

    // No valid cache entry — attempt upload.
    const token = this.getAccessToken();
    if (!token) {
      this.logger.warn('[AssetCacheService] No access token — buffer fallback');
      return { type: 'buffer', buffer };
    }

    if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
      this.logger.warn(
        `[AssetCacheService] Unsupported mediaType: ${mediaType} — buffer fallback`,
      );
      return { type: 'buffer', buffer };
    }

    this.logger.warn(
      `[AssetCacheService] Uploading ${filename} (${mediaType}, ${buffer.length} bytes)…`,
    );

    try {
      const client = createApiClient(API_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const { data, error } = await client.v1.assets.upload.post({
        filename,
        mediaType: mediaType as Parameters<
          typeof client.v1.assets.upload.post
        >[0]['mediaType'],
        contentLength: buffer.length,
      });
      this.logger.warn(
        `[AssetCacheService] Upload API response — error: ${JSON.stringify(error)}, uploadUrl: ${data?.uploadUrl?.slice(0, 80) ?? 'n/a'}`,
      );

      if (error || !data) {
        this.logger.warn(
          `[AssetCacheService] Upload API failed — buffer fallback`,
        );
        return { type: 'buffer', buffer };
      }

      // POST multipart/form-data to the presigned S3 POST endpoint.
      // AWS POST policies enforce content-length and Content-Type server-side,
      // so no headers need to be signed/matched client-side.
      const formData = new FormData();
      for (const [key, value] of Object.entries(data.uploadFields)) {
        formData.append(key, value as string);
      }
      // The file field must be last per the S3 presigned POST spec.
      // Buffer.buffer is ArrayBufferLike (may be SharedArrayBuffer), which
      // Blob doesn't accept in strict TS. Slice to a guaranteed plain ArrayBuffer.
      const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer;
      formData.append('file', new Blob([arrayBuffer], { type: mediaType }));

      this.logger.warn(
        `[AssetCacheService] S3 POST → ${data.uploadUrl.slice(0, 80)}… fields: ${Object.keys(data.uploadFields).join(', ')}`,
      );
      const postResponse = await fetch(data.uploadUrl, {
        method: 'POST',
        body: formData,
      });
      const postBody = !postResponse.ok
        ? await postResponse.text().catch(() => '(unreadable)')
        : null;
      this.logger.warn(
        `[AssetCacheService] S3 POST response: ${postResponse.status} ${postResponse.statusText}${postBody ? ` — ${postBody.slice(0, 300)}` : ''}`,
      );

      if (!postResponse.ok) {
        this.logger.warn(
          '[AssetCacheService] S3 POST failed — buffer fallback',
        );
        return { type: 'buffer', buffer };
      }

      // Fixed 22-hour TTL — the read URL is valid for 24 hours on the server,
      // so this gives a comfortable 2-hour safety buffer.
      const expiresAt = Math.floor(Date.now() / 1000) + 22 * 60 * 60;
      this.logger.warn(
        `[AssetCacheService] S3 upload OK — readUrl: ${data.readUrl.slice(0, 80)}… expiresAt: ${expiresAt}`,
      );

      // UPSERT in case the same hash was uploaded concurrently.
      await this.db
        .insert(assetCache)
        .values({ fileHash: hash, readUrl: data.readUrl, expiresAt })
        .onConflictDoUpdate({
          target: assetCache.fileHash,
          set: { readUrl: data.readUrl, expiresAt },
        });

      this.logger.warn('[AssetCacheService] Cache written — returning url');
      return { type: 'url', url: data.readUrl };
    } catch (err) {
      this.logger.warn(
        `[AssetCacheService] Upload pipeline threw — buffer fallback`,
        err,
      );
      return { type: 'buffer', buffer };
    }
  }

  /**
   * Deletes expired cache rows from SQLite in a fire-and-forget manner.
   * Rate-limited to at most once per SWEEP_INTERVAL_MS (60 s) to avoid
   * hammering SQLite when many attachments flow through in quick succession.
   *
   * Must be called WITHOUT await so it never blocks `resolve()`.
   */
  private sweepExpired(): void {
    if (Date.now() - this._lastSweepMs < SWEEP_INTERVAL_MS) return;
    this._lastSweepMs = Date.now();
    const nowS = Math.floor(Date.now() / 1000);
    this.db
      .delete(assetCache)
      .where(lt(assetCache.expiresAt, nowS))
      .then(() => {
        // no-op on success
      })
      .catch((e: unknown) => {
        this.logger.warn('[AssetCacheService] Background sweep failed', e);
      });
  }

  protected onTeardown(): void {
    this.dbDriver.close();
  }
}
