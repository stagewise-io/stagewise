import {
  sqliteTable,
  type SQLiteTransaction,
  text,
} from 'drizzle-orm/sqlite-core';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { Client } from '@libsql/client';

export const metaTable = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

type MigrationContext =
  | LibSQLDatabase<SchemaWithMeta>
  | SQLiteTransaction<'async', any, SchemaWithMeta, any>;

export type SchemaWithMeta = {
  meta: typeof metaTable;
  [key: string]: unknown;
};

export type MigrationScript = {
  version: number;
  name: string;
  up: (db: MigrationContext) => Promise<void>;
};

/**
 * Arguments for the migrateDatabase function.
 */
export type MigrateDatabaseArgs = {
  /** Drizzle database instance for typed queries */
  db: LibSQLDatabase<SchemaWithMeta>;
  /** Raw libsql client for executeMultiple (multi-statement SQL) */
  client: Client;
  /** Migration scripts to apply */
  registry: MigrationScript[];
  /** SQL script for fresh database initialization */
  initSql: string;
  /** Current schema version number */
  schemaVersion: number;
};
