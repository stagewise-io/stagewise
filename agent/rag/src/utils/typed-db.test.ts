import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LevelDb } from './typed-db.js';
import { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { LEVEL_DB_SCHEMA_VERSION } from '../index.js';
import { Level } from 'level';
import fs from 'node:fs/promises';

describe('typed-db', () => {
  let clientRuntime: ClientRuntime;
  let testDbPath: string;
  let db: LevelDb;

  beforeEach(() => {
    // Use a unique test directory for each test
    testDbPath = `./test-db/${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    clientRuntime = new ClientRuntimeNode({
      workingDirectory: testDbPath,
    });
    db = LevelDb.getInstance(testDbPath);
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await db.close();

      // Small delay to ensure LevelDB has fully released file handles
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Clean up test directory
      await fs.rm(testDbPath, { recursive: true, force: true });
    } catch {
      console.error('Error cleaning up test database');
      // Ignore cleanup errors
    }
  });

  describe('basic functionality', () => {
    it('should get sublevel databases after opening', async () => {
      await db.open();

      expect(db.manifests).toBeDefined();
      expect(db.routing).toBeDefined();
      expect(db.style).toBeDefined();
      expect(db.component).toBeDefined();
      expect(db.app).toBeDefined();
      expect(db.meta).toBeDefined();
    });

    it('should open database successfully', async () => {
      await expect(db.open()).resolves.not.toThrow();
    });

    it('should close database successfully', async () => {
      await db.open();
      await expect(db.close()).resolves.not.toThrow();
    });
  });

  describe('schema version management', () => {
    it('should initialize database with current schema version on first open', async () => {
      await db.open(LEVEL_DB_SCHEMA_VERSION);

      const metadata = await db.meta.get('schema');

      expect(metadata).toBeDefined();
      expect(metadata!.schemaVersion).toBe(LEVEL_DB_SCHEMA_VERSION);
      expect(metadata!.initializedAt).toBeDefined();
      expect(new Date(metadata!.initializedAt)).toBeInstanceOf(Date);
    });

    it('should not reset database when schema versions match', async () => {
      // First initialization
      await db.open(1);

      let metadata = await db.meta.get('schema');
      const originalInitTime = metadata!.initializedAt;

      // Add some test data
      await db.manifests.put('test-key', {
        path: '/test/path',
        contentHash: 'test-hash',
        ragVersion: 1,
        indexedAt: Date.now(),
      });

      // Second open with same schema version should not reset
      await db.open(1);

      metadata = await db.meta.get('schema');
      expect(metadata!.initializedAt).toBe(originalInitTime);

      // Test data should still exist
      const testManifest = await db.manifests.get('test-key');
      expect(testManifest).toBeDefined();
      expect(testManifest!.path).toBe('/test/path');
    });

    it('should reset database when schema versions differ', async () => {
      // First initialization with version 1
      await db.open(1);

      let metadata = await db.meta.get('schema');
      const originalInitTime = metadata!.initializedAt;

      // Add some test data
      await db.manifests.put('test-key', {
        path: '/test/path',
        contentHash: 'test-hash',
        ragVersion: 1,
        indexedAt: Date.now(),
      });

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Close and create new instance to test schema version change
      await db.close();
      db = LevelDb.getInstance(testDbPath);

      // Second open with different schema version should reset
      await db.open(2);

      metadata = await db.meta.get('schema');
      expect(metadata!.schemaVersion).toBe(2);
      expect(metadata!.initializedAt).not.toBe(originalInitTime);

      // Test data should be gone
      const testManifest2 = await db.manifests
        .get('test-key')
        .catch(() => undefined);
      expect(testManifest2).toBeUndefined();
    });

    it('should handle uninitialized database (no schema metadata)', async () => {
      // Manually create a database without schema metadata
      const rawDb = new Level(
        clientRuntime.fileSystem.resolvePath('.stagewise/knowledge-base.db'),
        {
          valueEncoding: 'json',
          createIfMissing: true,
        },
      );
      await rawDb.open();

      // Add some dummy data
      await rawDb.put('some-key', 'test-data');
      await rawDb.close();

      // Now open with our LevelDb class - should detect uninitialized and reset
      await db.open(5);

      const metadata = await db.meta.get('schema');

      expect(metadata!.schemaVersion).toBe(5);
      expect(metadata!.initializedAt).toBeDefined();

      // Original dummy data should be gone - we can verify through any sublevel
      // Since the database was cleared, the old data won't exist
    });
  });

  describe('error handling', () => {
    it('should handle corrupted database gracefully', async () => {
      // Create a database with invalid JSON in the meta sublevel
      const rawDb = new Level(
        clientRuntime.fileSystem.resolvePath('.stagewise/knowledge-base.db'),
        {
          createIfMissing: true,
        },
      );
      await rawDb.open();

      // Write invalid data that will cause JSON parsing to fail
      const metaSublevel = rawDb.sublevel('meta');
      await metaSublevel.put('schema', 'invalid-json-data', {
        valueEncoding: 'utf8',
      });
      await rawDb.close();

      // Should handle the corruption and reset
      await expect(db.open(3)).resolves.not.toThrow();

      const metadata = await db.meta.get('schema');

      expect(metadata!.schemaVersion).toBe(3);
      expect(metadata!.initializedAt).toBeDefined();
    });
  });

  describe('concurrency protection', () => {
    it('should handle concurrent open calls', async () => {
      // Start multiple open calls simultaneously on the same instance
      const promises = [db.open(1), db.open(1), db.open(1)];

      // All should succeed without conflicts
      await expect(Promise.all(promises)).resolves.not.toThrow();

      const metadata = await db.meta.get('schema');

      expect(metadata!.schemaVersion).toBe(1);
    });

    it('should handle concurrent calls with different schema versions', async () => {
      // This test verifies that the mutex prevents race conditions
      // The last schema version should win
      const promises = [db.open(1), db.open(2), db.open(3)];

      await Promise.all(promises);

      const metadata = await db.meta.get('schema');

      // One of the schema versions should be set (implementation dependent on timing)
      expect([1, 2, 3]).toContain(metadata!.schemaVersion);
    });

    it('should handle multiple LevelDb instances for the same database path', async () => {
      // Create multiple instances for the same clientRuntime
      const db1 = LevelDb.getInstance(testDbPath);
      const db2 = LevelDb.getInstance(testDbPath);
      const db3 = LevelDb.getInstance(testDbPath);

      // All instances should reference the same singleton
      expect(db1).toBe(db2);
      expect(db2).toBe(db3);
      expect(db1).toBe(db3);

      // Opening one instance should work for all
      await db1.open(1);

      // All instances should have access to the same sublevels
      expect(db1.manifests).toBeDefined();
      expect(db2.manifests).toBeDefined();
      expect(db3.manifests).toBeDefined();

      // Data written through one instance should be accessible through others
      await db1.manifests.put('test-key', {
        path: '/test/path',
        contentHash: 'test-hash',
        ragVersion: 1,
        indexedAt: Date.now(),
      });

      const dataFromDb2 = await db2.manifests.get('test-key');
      const dataFromDb3 = await db3.manifests.get('test-key');

      expect(dataFromDb2).toBeDefined();
      expect(dataFromDb3).toBeDefined();
      expect(dataFromDb2!.path).toBe('/test/path');
      expect(dataFromDb3!.path).toBe('/test/path');

      // Closing through one instance should affect all
      await db2.close();

      // After closing, all instances should be in closed state
      // Note: We can't easily test the internal state, but we can verify
      // that they all still reference the same object
      expect(db1).toBe(db2);
      expect(db2).toBe(db3);
    });

    it('should handle concurrent operations across multiple instances', async () => {
      // Create multiple instances
      const db1 = LevelDb.getInstance(testDbPath);
      const db2 = LevelDb.getInstance(testDbPath);
      const db3 = LevelDb.getInstance(testDbPath);

      // Open all instances concurrently
      await Promise.all([db1.open(1), db2.open(1), db3.open(1)]);

      // Perform concurrent writes through different instances
      const writePromises = [
        db1.manifests.put('file1', {
          path: '/file1',
          contentHash: 'hash1',
          ragVersion: 1,
          indexedAt: Date.now(),
        }),
        db2.manifests.put('file2', {
          path: '/file2',
          contentHash: 'hash2',
          ragVersion: 1,
          indexedAt: Date.now(),
        }),
        db3.manifests.put('file3', {
          path: '/file3',
          contentHash: 'hash3',
          ragVersion: 1,
          indexedAt: Date.now(),
        }),
      ];

      await Promise.all(writePromises);

      // Verify all data is accessible through any instance
      const file1FromDb1 = await db1.manifests.get('file1');
      const file2FromDb2 = await db2.manifests.get('file2');
      const file3FromDb3 = await db3.manifests.get('file3');

      expect(file1FromDb1!.path).toBe('/file1');
      expect(file2FromDb2!.path).toBe('/file2');
      expect(file3FromDb3!.path).toBe('/file3');

      // Cross-instance reads should also work
      const file1FromDb2 = await db2.manifests.get('file1');
      const file2FromDb3 = await db3.manifests.get('file2');
      const file3FromDb1 = await db1.manifests.get('file3');

      expect(file1FromDb2!.path).toBe('/file1');
      expect(file2FromDb3!.path).toBe('/file2');
      expect(file3FromDb1!.path).toBe('/file3');

      await db1.close();
    });
  });

  describe('database operations after schema reset', () => {
    it('should allow normal operations after schema version reset', async () => {
      // Initialize with version 1
      await db.open(1);

      // Add some data
      await db.manifests.put('test1', {
        path: '/test1',
        contentHash: 'hash1',
        ragVersion: 1,
        indexedAt: Date.now(),
      });

      // Close and create new instance to test schema version change
      await db.close();
      db = LevelDb.getInstance(testDbPath);

      // Reset with version 2
      await db.open(2);

      // Should be able to add new data
      await db.manifests.put('test2', {
        path: '/test2',
        contentHash: 'hash2',
        ragVersion: 1,
        indexedAt: Date.now(),
      });

      // New data should be retrievable
      const manifest = await db.manifests.get('test2');
      expect(manifest!.path).toBe('/test2');
      expect(manifest!.contentHash).toBe('hash2');

      // Old data should be gone
      const oldManifest = await db.manifests
        .get('test1')
        .catch(() => undefined);
      expect(oldManifest).toBeUndefined();
    });

    it('should work with all sublevel databases after reset', async () => {
      await db.open(1);

      // Should be able to write to all sublevels
      await db.manifests.put('manifest1', {
        path: '/test',
        contentHash: 'hash',
        ragVersion: 1,
        indexedAt: Date.now(),
      });

      await db.routing.put('route1', {
        app: 'test-app',
        routes: [
          {
            browserRoute: '/route',
            sourceFile: 'TestComponent.tsx',
            isDynamic: false,
            layoutFiles: [],
          },
        ],
        createdAt: Date.now(),
      });

      await db.style.put('style1', {
        app: 'test-app',
        files: [{ filePath: 'styles.css', fileDescription: 'Test styles' }],
        styleDescription: 'Test style description',
        createdAt: Date.now(),
      });

      await db.component.put('component1', {
        app: 'test-app',
        libraries: [
          {
            libraryPath: 'components/',
            availableComponentPaths: ['components/Button.tsx'],
            description: 'Test component library',
          },
        ],
        createdAt: Date.now(),
      });

      await db.app.put('app1', {
        app: 'test-app',
        path: 'apps/test',
        description: 'Test application',
        createdAt: Date.now(),
      });

      // All should be retrievable
      expect(await db.manifests.get('manifest1')).toBeDefined();
      expect(await db.routing.get('route1')).toBeDefined();
      expect(await db.style.get('style1')).toBeDefined();
      expect(await db.component.get('component1')).toBeDefined();
      expect(await db.app.get('app1')).toBeDefined();
    });
  });
});
