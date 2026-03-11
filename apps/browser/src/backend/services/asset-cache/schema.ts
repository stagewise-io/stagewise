import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { metaTable } from '@/utils/migrate-database/types';

export const meta = metaTable;

export const assetCache = sqliteTable('asset_cache', {
  fileHash: text('file_hash').primaryKey(), // SHA-256 hex of file contents
  readUrl: text('read_url').notNull(), // full presigned S3 read URL
  expiresAt: integer('expires_at').notNull(), // Unix seconds (parsed from URL at insert time)
});
