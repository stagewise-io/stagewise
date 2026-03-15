import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';
import { metaTable } from '@/utils/migrate-database/types';

export const meta = metaTable;

export const processedImageCache = sqliteTable('processed_image_cache', {
  /** SHA-256 hex of the raw input buffer. */
  sourceHash: text('source_hash').notNull(),
  /**
   * Deterministic encoding of the constraint parameters used for processing.
   * Format: `maxWidthPx|maxHeightPx|maxTotalPixels|maxBytes`
   * Undefined dimensions are represented as `*`.
   * mimeTypes is excluded — the output format is stored in media_type and
   * filtered at lookup time so results can be reused across constraints.
   */
  constraintKey: text('constraint_key').notNull(),
  /** Processed image bytes. */
  resultData: blob('result_data', { mode: 'buffer' }).notNull(),
  /** MIME type of the processed output (e.g. 'image/webp', 'image/jpeg'). */
  mediaType: text('media_type').notNull(),
  /**
   * Unix milliseconds. Updated on every cache hit so the 200-entry LRU
   * eviction targets genuinely least-recently-used entries.
   */
  lastUsedAt: integer('last_used_at').notNull(),
});
