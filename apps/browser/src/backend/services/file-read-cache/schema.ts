import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { metaTable } from '@/utils/migrate-database/types';

export const meta = metaTable;

export const fileReadCache = sqliteTable('file_read_cache', {
  /**
   * Cache key: `{sha256Hash}:{extension}` (e.g. `"a1b2c3...:.ts"`).
   *
   * Includes the file extension because post-transformation metadata is
   * path-dependent (e.g. `language:typescript` vs `language:python`).
   * Two files with identical content but different extensions need
   * separate cache entries.
   *
   * Built via `FileReadCacheService.buildCacheKey(hash, ext)`.
   *
   * Column retains the name `content_hash` for simplicity.
   */
  contentHash: text('content_hash').primaryKey(),
  /**
   * The **post-transformation** model-ready representation.
   *
   * This is the final string that gets injected into the model context:
   * - **Text files**: Processed content (truncated, line-numbered, etc.)
   * - **Images**: Base64-encoded WebP at quality 80
   * - **Directories**: Formatted listing output
   *
   * Storing post-transformation data avoids re-running expensive
   * processing (image conversion, truncation logic) on every step.
   */
  content: text('content').notNull(),
  /** Original raw file size in bytes (before any transformation). */
  sizeBytes: integer('size_bytes').notNull(),
  /** Unix milliseconds when this row was first inserted. */
  createdAt: integer('created_at').notNull(),
  /** Unix milliseconds when this row was last read (for LRU eviction). */
  lastUsedAt: integer('last_used_at').notNull(),
});
