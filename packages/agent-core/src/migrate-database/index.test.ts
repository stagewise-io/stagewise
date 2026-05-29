import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import { migrateDatabase } from './index';
import { metaTable, type MigrationScript, type SchemaWithMeta } from './types';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Creates a file-based SQLite database in a temp directory for testing.
 * Returns both the raw client (for executeMultiple) and drizzle instance.
 */
function createTestDb(): {
  client: Client;
  db: LibSQLDatabase<SchemaWithMeta>;
  dbPath: string;
} {
  const dbPath = path.join(
    os.tmpdir(),
    `test-migrate-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const client = createClient({ url: `file:${dbPath}` });
  const db = drizzle(client, { schema: { meta: metaTable } });
  return { client, db, dbPath };
}

/**
 * Cleans up the test database file.
 */
function cleanupTestDb(dbPath: string): void {
  try {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    // Also clean up WAL and SHM files if they exist
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Test schema SQL with multiple statements.
 * This validates that executeMultiple works correctly.
 */
const testInitSql = `
CREATE TABLE IF NOT EXISTS meta(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS items_name_idx ON items(name);

INSERT INTO items (id, name) VALUES (1, 'seed-item-1');
INSERT INTO items (id, name) VALUES (2, 'seed-item-2');
`;

// =============================================================================
// Tests
// =============================================================================

describe('migrateDatabase', () => {
  let client: Client;
  let db: LibSQLDatabase<SchemaWithMeta>;
  let dbPath: string;

  beforeEach(() => {
    const testDb = createTestDb();
    client = testDb.client;
    db = testDb.db;
    dbPath = testDb.dbPath;
  });

  afterEach(() => {
    client.close();
    cleanupTestDb(dbPath);
  });

  // ===========================================================================
  // Fresh Database Detection & Installation
  // These tests validate the core fix: using executeMultiple for multi-statement SQL
  // ===========================================================================

  describe('fresh database detection and installation', () => {
    it('detects fresh database and runs initSql', async () => {
      // Fresh in-memory database has no tables
      await migrateDatabase({
        db,
        client,
        registry: [],
        initSql: testInitSql,
        schemaVersion: 1,
      });

      // Verify meta table was created and version set
      const result = await client.execute(
        "SELECT value FROM meta WHERE key = 'version'",
      );
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].value).toBe('1');
    });

    it('executes multi-statement SQL script correctly (THE KEY FIX)', async () => {
      // This is the key test that validates our fix: using executeMultiple
      // instead of db.run(sql.raw(...)) which only runs the first statement
      await migrateDatabase({
        db,
        client,
        registry: [],
        initSql: testInitSql,
        schemaVersion: 1,
      });

      // Verify ALL tables were created (not just the first one)
      const tables = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      );
      const tableNames = tables.rows.map((r) => r.name);

      // CRITICAL: Both tables must exist - this proves executeMultiple works
      expect(tableNames).toContain('meta');
      expect(tableNames).toContain('items');
    });

    it('creates indexes from schema', async () => {
      await migrateDatabase({
        db,
        client,
        registry: [],
        initSql: testInitSql,
        schemaVersion: 1,
      });

      // Verify index was created (proves executeMultiple ran the CREATE INDEX)
      const indexes = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='items_name_idx'",
      );

      expect(indexes.rows.length).toBe(1);
    });

    it('inserts seed data from schema', async () => {
      await migrateDatabase({
        db,
        client,
        registry: [],
        initSql: testInitSql,
        schemaVersion: 1,
      });

      // Verify seed data was inserted (proves executeMultiple ran INSERT statements)
      const items = await client.execute('SELECT * FROM items ORDER BY id');

      expect(items.rows.length).toBe(2);
      expect(items.rows[0].name).toBe('seed-item-1');
      expect(items.rows[1].name).toBe('seed-item-2');
    });

    it('sets correct version in meta table', async () => {
      await migrateDatabase({
        db,
        client,
        registry: [],
        initSql: testInitSql,
        schemaVersion: 5,
      });

      const result = await client.execute(
        "SELECT value FROM meta WHERE key = 'version'",
      );
      expect(result.rows[0].value).toBe('5');
    });
  });

  // ===========================================================================
  // Idempotency
  // These tests ensure the migration system is safe to call multiple times
  // ===========================================================================

  describe('idempotency', () => {
    it('does not duplicate data on subsequent calls', async () => {
      // First call - fresh install
      await migrateDatabase({
        db,
        client,
        registry: [],
        initSql: testInitSql,
        schemaVersion: 1,
      });

      // Second call - should detect existing database
      await migrateDatabase({
        db,
        client,
        registry: [],
        initSql: testInitSql,
        schemaVersion: 1,
      });

      // Seed data should NOT be duplicated (INSERT OR IGNORE behavior)
      const items = await client.execute('SELECT * FROM items');
      expect(items.rows.length).toBe(2);
    });

    it('detects existing database and skips fresh install', async () => {
      // First call
      await migrateDatabase({
        db,
        client,
        registry: [],
        initSql: testInitSql,
        schemaVersion: 1,
      });

      // Clear items to detect if fresh install runs again
      await client.execute('DELETE FROM items');

      // Second call - should NOT run fresh install
      await migrateDatabase({
        db,
        client,
        registry: [],
        initSql: testInitSql,
        schemaVersion: 1,
      });

      // Items should still be empty (fresh install didn't re-run)
      const items = await client.execute('SELECT * FROM items');
      expect(items.rows.length).toBe(0);
    });

    it('preserves user data across restarts', async () => {
      // Service starts, creates database
      await migrateDatabase({
        db,
        client,
        registry: [],
        initSql: testInitSql,
        schemaVersion: 1,
      });

      // User adds data
      await client.execute(
        "INSERT INTO items (id, name) VALUES (3, 'user-item')",
      );

      // Service restarts
      await migrateDatabase({
        db,
        client,
        registry: [],
        initSql: testInitSql,
        schemaVersion: 1,
      });

      // User data must be preserved
      const items = await client.execute('SELECT * FROM items ORDER BY id');
      expect(items.rows.length).toBe(3);
      expect(items.rows[2].name).toBe('user-item');
    });
  });

  // ===========================================================================
  // Migration Execution
  // ===========================================================================

  describe('migration execution', () => {
    it('applies single migration correctly', async () => {
      // First, create database at version 1
      await migrateDatabase({
        db,
        client,
        registry: [],
        initSql: testInitSql,
        schemaVersion: 1,
      });

      let migrationRan = false;

      const migration: MigrationScript = {
        version: 2,
        name: 'add-status',
        up: async (tx) => {
          migrationRan = true;
          await tx.run(
            sql`ALTER TABLE items ADD COLUMN status TEXT DEFAULT 'active'`,
          );
        },
      };

      // Run with migration
      await migrateDatabase({
        db,
        client,
        registry: [migration],
        initSql: testInitSql,
        schemaVersion: 2,
      });

      expect(migrationRan).toBe(true);

      // Verify column was added
      const columns = await client.execute('PRAGMA table_info(items)');
      const columnNames = columns.rows.map((r) => r.name);
      expect(columnNames).toContain('status');

      // Verify version was updated
      const result = await client.execute(
        "SELECT value FROM meta WHERE key = 'version'",
      );
      expect(result.rows[0].value).toBe('2');
    });

    it('applies multiple migrations in order', async () => {
      // Create database at version 1
      await migrateDatabase({
        db,
        client,
        registry: [],
        initSql: testInitSql,
        schemaVersion: 1,
      });

      const executionOrder: number[] = [];

      const migrations: MigrationScript[] = [
        {
          version: 4, // Out of order in array
          name: 'migration-4',
          up: async () => {
            executionOrder.push(4);
          },
        },
        {
          version: 2,
          name: 'migration-2',
          up: async () => {
            executionOrder.push(2);
          },
        },
        {
          version: 3,
          name: 'migration-3',
          up: async () => {
            executionOrder.push(3);
          },
        },
      ];

      // Run with migrations
      await migrateDatabase({
        db,
        client,
        registry: migrations,
        initSql: testInitSql,
        schemaVersion: 4,
      });

      // Should execute in version order: 2, 3, 4
      expect(executionOrder).toEqual([2, 3, 4]);

      // Final version should be 4
      const result = await client.execute(
        "SELECT value FROM meta WHERE key = 'version'",
      );
      expect(result.rows[0].value).toBe('4');
    });

    it('skips migrations already applied', async () => {
      // Create database at version 2
      await migrateDatabase({
        db,
        client,
        registry: [],
        initSql: testInitSql,
        schemaVersion: 2,
      });

      let oldMigrationCalled = false;
      let newMigrationCalled = false;

      const migrations: MigrationScript[] = [
        {
          version: 1, // Lower than current
          name: 'old-migration',
          up: async () => {
            oldMigrationCalled = true;
          },
        },
        {
          version: 3,
          name: 'new-migration',
          up: async () => {
            newMigrationCalled = true;
          },
        },
      ];

      await migrateDatabase({
        db,
        client,
        registry: migrations,
        initSql: testInitSql,
        schemaVersion: 3,
      });

      expect(oldMigrationCalled).toBe(false);
      expect(newMigrationCalled).toBe(true);
    });

    it('throws on migration error and preserves last successful version', async () => {
      // Create database at version 1
      await migrateDatabase({
        db,
        client,
        registry: [],
        initSql: testInitSql,
        schemaVersion: 1,
      });

      const migrations: MigrationScript[] = [
        {
          version: 2,
          name: 'success',
          up: async () => {
            // This succeeds
          },
        },
        {
          version: 3,
          name: 'failure',
          up: async () => {
            throw new Error('Migration failed intentionally');
          },
        },
      ];

      await expect(
        migrateDatabase({
          db,
          client,
          registry: migrations,
          initSql: testInitSql,
          schemaVersion: 3,
        }),
      ).rejects.toThrow('Migration failed intentionally');

      // Version should be 2 (last successful migration)
      const result = await client.execute(
        "SELECT value FROM meta WHERE key = 'version'",
      );
      expect(result.rows[0].value).toBe('2');
    });
  });

  // ===========================================================================
  // Integration Tests
  // ===========================================================================

  describe('integration', () => {
    it('simulates WebDataService pattern', async () => {
      // This mimics how WebDataService uses migrateDatabase
      const webDataInitSql = `
        CREATE TABLE IF NOT EXISTS meta(
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS keywords(
          id INTEGER PRIMARY KEY,
          short_name TEXT NOT NULL,
          keyword TEXT NOT NULL,
          url TEXT NOT NULL
        );
        INSERT INTO keywords (id, short_name, keyword, url) 
        VALUES (1, 'Google', 'google.com', 'https://google.com/search?q={searchTerms}');
      `;

      const registry: never[] = [];
      const schemaVersion = 1;

      // First call - fresh install
      await migrateDatabase({
        db,
        client,
        registry,
        initSql: webDataInitSql,
        schemaVersion,
      });

      // Verify keywords table exists and has seed data
      const keywords = await client.execute('SELECT * FROM keywords');
      expect(keywords.rows.length).toBe(1);
      expect(keywords.rows[0].short_name).toBe('Google');

      // Subsequent calls should detect existing database
      await migrateDatabase({
        db,
        client,
        registry,
        initSql: webDataInitSql,
        schemaVersion,
      });

      // Should still have exactly 1 keyword (not duplicated)
      const keywordsAfter = await client.execute('SELECT * FROM keywords');
      expect(keywordsAfter.rows.length).toBe(1);
    });

    it('executeMultiple is required for multi-statement SQL', async () => {
      // This test documents WHY we use executeMultiple instead of db.run
      // db.run only executes the first statement in a multi-statement string

      const multiStatementSql = `
        CREATE TABLE test1 (id INTEGER);
        CREATE TABLE test2 (id INTEGER);
      `;

      // Using executeMultiple should create both tables
      await client.executeMultiple(multiStatementSql);

      const tables = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'test%' ORDER BY name",
      );
      const tableNames = tables.rows.map((r) => r.name);

      expect(tableNames).toContain('test1');
      expect(tableNames).toContain('test2');
    });
  });
});
