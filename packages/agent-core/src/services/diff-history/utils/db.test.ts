import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import * as schema from '../schema';
import initSchemaSql from '../schema.sql?raw';
import { migrateDatabase } from '../../../migrate-database';
import {
  computeOid,
  getSnapshot,
  insertKeyframe,
  retrieveContentForOid,
  getOperationHistory,
  insertOperation,
  storeFileContent,
  getPendingOperationsForAgentInstanceId,
  getAllOperationsForAgentInstanceId,
  getAllPendingOperations,
  storeLargeContent,
  streamContent,
  copyContentToPath,
  retrieveContentsForOids,
  copyOperationsUpToInitBaseline,
  getUndoTargetForToolCallsByFilePath,
} from './db';

type SnapshotDb = LibSQLDatabase<typeof schema>;

/**
 * Creates a file-based SQLite database in a temp directory for testing.
 * Returns both the raw client (for executeMultiple) and drizzle instance.
 */
function createTestDb(): {
  client: Client;
  db: SnapshotDb;
  dbPath: string;
} {
  const dbPath = path.join(
    os.tmpdir(),
    `test-diff-history-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const client = createClient({ url: `file:${dbPath}` });
  const db = drizzle(client, { schema });
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

describe('diff-history db utilities', () => {
  let client: Client;
  let db: SnapshotDb;
  let dbPath: string;

  beforeEach(async () => {
    const testDb = createTestDb();
    client = testDb.client;
    db = testDb.db;
    dbPath = testDb.dbPath;

    // Initialize schema using migrateDatabase
    await migrateDatabase({
      db,
      client,
      registry: [], // No migrations yet, just fresh install
      initSql: initSchemaSql,
      schemaVersion: 1,
    });
  });

  afterEach(() => {
    client.close();
    cleanupTestDb(dbPath);
  });

  describe('compression and hashing', () => {
    it('computeOid() produces consistent SHA-256 hex strings', () => {
      const content = Buffer.from('hello world');
      const oid1 = computeOid(content);
      const oid2 = computeOid(content);

      // Should be consistent
      expect(oid1).toBe(oid2);

      // Should be a 64-character hex string (SHA-256)
      expect(oid1).toMatch(/^[a-f0-9]{64}$/);

      // Known SHA-256 hash of 'hello world'
      expect(oid1).toBe(
        'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
      );
    });

    it('computeOid() produces different hashes for different content', () => {
      const content1 = Buffer.from('hello');
      const content2 = Buffer.from('world');

      expect(computeOid(content1)).not.toBe(computeOid(content2));
    });
  });

  describe('snapshot storage', () => {
    it('retrieveContent() decompresses keyframe correctly', async () => {
      const content = Buffer.from(
        'hello world - test content for decompression',
      );
      const oid = computeOid(content);

      insertKeyframe(db, oid, content);

      const retrieved = await retrieveContentForOid(db, oid);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.toString()).toBe(content.toString());
    });

    it('retrieveContent() throws for non-existent oid', async () => {
      await expect(retrieveContentForOid(db, 'nonexistent')).rejects.toThrow(
        'Snapshot not found: nonexistent',
      );
    });
  });

  describe('delta compression chain', () => {
    const filepath = '/test/file.txt';
    const baseMeta = {
      operation: 'edit' as const,
      reason: 'tool-test-123' as const,
      contributor: 'agent-test-456' as const,
    };

    it('stores multiple versions and retrieves them correctly', async () => {
      const v1 = Buffer.from('version 1 content');
      const v2 = Buffer.from('version 2 content - slightly modified');
      const v3 = Buffer.from('version 3 content - more changes here');

      // Store three versions
      const oid1 = await storeFileContent(db, filepath, v1, baseMeta);
      const oid2 = await storeFileContent(db, filepath, v2, baseMeta);
      const oid3 = await storeFileContent(db, filepath, v3, baseMeta);

      // All oids should be different
      expect(oid1).not.toBe(oid2);
      expect(oid2).not.toBe(oid3);

      const content1 = await retrieveContentForOid(db, oid1);
      const content2 = await retrieveContentForOid(db, oid2);
      const content3 = await retrieveContentForOid(db, oid3);

      expect(content1?.toString()).toBe(v1.toString());
      expect(content2?.toString()).toBe(v2.toString());
      expect(content3?.toString()).toBe(v3.toString());
    });

    it('creates reverse-delta chain (older versions become deltas)', async () => {
      const v1 = Buffer.from('first version');
      const v2 = Buffer.from('second version with changes');

      const oid1 = await storeFileContent(db, filepath, v1, baseMeta);
      const oid2 = await storeFileContent(db, filepath, v2, baseMeta);

      // After storing v2, v1 should be a delta pointing to v2
      const snapshot1 = await getSnapshot(db, oid1);
      const snapshot2 = await getSnapshot(db, oid2);

      // v1 should now point to v2 (reverse delta)
      expect(snapshot1?.delta_target_oid).toBe(oid2);
      // v2 should be the keyframe (no delta target)
      expect(snapshot2?.delta_target_oid).toBeNull();
    });

    it('handles storing identical content without duplicating snapshots', async () => {
      const content = Buffer.from('same content');

      const oid1 = await storeFileContent(db, filepath, content, baseMeta);
      const oid2 = await storeFileContent(db, filepath, content, baseMeta);

      // Same oid since content is identical
      expect(oid1).toBe(oid2);

      // But two operations should exist
      const history = await getOperationHistory(db, filepath);
      expect(history.length).toBe(2);
    });
  });

  describe('high-level API', () => {
    const filepath = '/test/highlevel.txt';

    it('storeFileContent() stores content and returns oid', async () => {
      const content = Buffer.from('stored content');
      const expectedOid = computeOid(content);

      const oid = await storeFileContent(db, filepath, content, {
        operation: 'edit',
        reason: 'tool-test',
        contributor: 'agent-test',
      });

      expect(oid).toBe(expectedOid);
    });
  });

  // ===========================================================================
  // getPendingOperationsForAgentInstanceId
  // ===========================================================================

  describe('getPendingOperationsForAgentInstanceId', () => {
    /**
     * Helper to create a snapshot and return its oid.
     * Uses insertKeyframe directly to avoid storeFileContent's side effects.
     */
    function createSnapshot(content: string): string {
      const buf = Buffer.from(content);
      const oid = computeOid(buf);
      insertKeyframe(db, oid, buf);
      return oid;
    }

    it('returns pending operations for simple agent edit', async () => {
      // Scenario: Agent makes one edit, not yet accepted
      // idx 1: baseline (init) - before edit
      // idx 2: edit (tool-1) - agent edit
      const oidA = createSnapshot('original content');
      const oidB = createSnapshot('edited content');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });

      const pending = await getPendingOperationsForAgentInstanceId(db, '1');

      expect(pending).toHaveLength(2);
      expect(pending[0].idx).toBe(1);
      expect(pending[0].operation).toBe('baseline');
      expect(pending[1].idx).toBe(2);
      expect(pending[1].operation).toBe('edit');
    });

    it('returns empty array when all edits are fully accepted', async () => {
      // Scenario: Agent edit fully accepted (baseline oid == edit oid)
      // idx 1: baseline (init)
      // idx 2: edit (tool-1)
      // idx 3: baseline (accept) - same oid as edit
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('edited');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'baseline',
        reason: 'accept',
        contributor: 'user',
      });

      const pending = await getPendingOperationsForAgentInstanceId(db, '1');

      expect(pending).toHaveLength(0);
    });

    it('returns operations when partial accept (still pending)', async () => {
      // Scenario: Partial accept - baseline moved but not equal to edit
      // idx 1: baseline (init) - oid A
      // idx 2: edit (tool-1) - oid B
      // idx 3: baseline (accept) - oid C (partial, C != B)
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('edited');
      const oidC = createSnapshot('partially accepted');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });
      insertOperation(db, '/a.ts', oidC, {
        operation: 'baseline',
        reason: 'accept',
        contributor: 'user',
      });

      const pending = await getPendingOperationsForAgentInstanceId(db, '1');

      expect(pending).toHaveLength(3);
      expect(pending.map((op) => op.idx)).toEqual([1, 2, 3]);
    });

    it('returns operations after user reject', async () => {
      // Scenario: Agent edits, user rejects part
      // idx 1: baseline (init) - oid A
      // idx 2: edit (tool-1) - oid B
      // idx 3: edit (reject) - oid C (user rejected part)
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('edited by agent');
      const oidC = createSnapshot('after user reject');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });
      insertOperation(db, '/a.ts', oidC, {
        operation: 'edit',
        reason: 'reject',
        contributor: 'user',
      });

      const pending = await getPendingOperationsForAgentInstanceId(db, '1');

      expect(pending).toHaveLength(3);
      // Latest baseline is A, latest edit is C, A != C -> pending
    });

    it('returns only current session ops after previous session ended', async () => {
      // Scenario: Session 1 completed, Session 2 pending
      // Session 1:
      //   idx 1: baseline (init) - oid A
      //   idx 2: edit (tool-1) - oid B
      //   idx 3: baseline (accept) - oid B (session 1 ends)
      // Session 2:
      //   idx 4: baseline (init) - oid B (new session starts)
      //   idx 5: edit (tool-2) - oid C
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('first edit');
      const oidC = createSnapshot('second edit');

      // Session 1
      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'baseline',
        reason: 'accept',
        contributor: 'user',
      });
      // Session 2
      insertOperation(db, '/a.ts', oidB, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidC, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-1',
      });

      const pending = await getPendingOperationsForAgentInstanceId(db, '1');

      // Should only return session 2 (idx 4, 5)
      expect(pending).toHaveLength(2);
      expect(pending[0].idx).toBe(4);
      expect(pending[1].idx).toBe(5);
    });

    it('handles multiple files with mixed pending states', async () => {
      // File /a.ts: pending
      // File /b.ts: fully accepted (not pending)
      // Note: with global auto-increment idx, operations get sequential global idx
      const oidA1 = createSnapshot('a original');
      const oidA2 = createSnapshot('a edited');
      const oidB1 = createSnapshot('b original');
      const oidB2 = createSnapshot('b edited');

      // File /a.ts - pending (idx 1, 2)
      insertOperation(db, '/a.ts', oidA1, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidA2, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });

      // File /b.ts - fully accepted (idx 3, 4, 5)
      insertOperation(db, '/b.ts', oidB1, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/b.ts', oidB2, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-1',
      });
      insertOperation(db, '/b.ts', oidB2, {
        operation: 'baseline',
        reason: 'accept',
        contributor: 'user',
      });

      const pending = await getPendingOperationsForAgentInstanceId(db, '1');

      // Should only return /a.ts operations
      expect(pending).toHaveLength(2);
      expect(pending.every((op) => op.filepath === '/a.ts')).toBe(true);
    });

    it('returns empty array for chat with no operations', async () => {
      // Agent-2 has no operations
      const oidA = createSnapshot('content');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidA, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1', // agent-1, not agent-2
      });

      const pending = await getPendingOperationsForAgentInstanceId(db, '2');

      expect(pending).toHaveLength(0);
    });

    it('returns all session ops when multiple chats edit same file', async () => {
      // Both agent-1 and agent-2 edit /a.ts
      // Querying for either chat should return all ops from the session
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('edit by agent-1');
      const oidC = createSnapshot('edit by agent-2');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });
      insertOperation(db, '/a.ts', oidC, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-2',
      });

      const pendingChat1 = await getPendingOperationsForAgentInstanceId(
        db,
        '1',
      );
      const pendingChat2 = await getPendingOperationsForAgentInstanceId(
        db,
        '2',
      );

      // Both should return all 3 operations
      expect(pendingChat1).toHaveLength(3);
      expect(pendingChat2).toHaveLength(3);
      expect(pendingChat1.map((op) => op.idx)).toEqual([1, 2, 3]);
      expect(pendingChat2.map((op) => op.idx)).toEqual([1, 2, 3]);
    });

    it('handles multiple pending files for same chat', async () => {
      // Agent-1 edits both /a.ts and /b.ts, both pending
      // With global idx: /a.ts gets idx 1,2 and /b.ts gets idx 3,4
      const oidA1 = createSnapshot('a original');
      const oidA2 = createSnapshot('a edited');
      const oidB1 = createSnapshot('b original');
      const oidB2 = createSnapshot('b edited');

      // File /a.ts
      insertOperation(db, '/a.ts', oidA1, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidA2, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });

      // File /b.ts
      insertOperation(db, '/b.ts', oidB1, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/b.ts', oidB2, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-1',
      });

      const pending = await getPendingOperationsForAgentInstanceId(db, '1');

      // Should return ops for both files
      expect(pending).toHaveLength(4);
      const filepaths = [...new Set(pending.map((op) => op.filepath))];
      expect(filepaths).toContain('/a.ts');
      expect(filepaths).toContain('/b.ts');
    });

    it('operations are ordered by filepath then idx', async () => {
      // Create operations for multiple files
      // With global auto-increment, idx is assigned sequentially as inserted
      const oidA = createSnapshot('a content');
      const oidB = createSnapshot('b content');

      // Insert /a.ts first, then /b.ts
      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });
      insertOperation(db, '/b.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/b.ts', oidB, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-1',
      });

      const pending = await getPendingOperationsForAgentInstanceId(db, '1');

      // Should be ordered: /a.ts (1, 2), then /b.ts (3, 4)
      expect(pending).toHaveLength(4);
      expect(pending[0].filepath).toBe('/a.ts');
      expect(pending[0].idx).toBe(1);
      expect(pending[1].filepath).toBe('/a.ts');
      expect(pending[1].idx).toBe(2);
      expect(pending[2].filepath).toBe('/b.ts');
      expect(pending[2].idx).toBe(3);
      expect(pending[3].filepath).toBe('/b.ts');
      expect(pending[3].idx).toBe(4);
    });
  });

  // ===========================================================================
  // getAllOperationsForAgentInstanceId
  // ===========================================================================

  describe('getAllOperationsForAgentInstanceId', () => {
    /**
     * Helper to create a snapshot and return its oid.
     * Uses insertKeyframe directly to avoid storeFileContent's side effects.
     */
    function createSnapshot(content: string): string {
      const buf = Buffer.from(content);
      const oid = computeOid(buf);
      insertKeyframe(db, oid, buf);
      return oid;
    }

    it('returns empty array for chat with no operations', async () => {
      // Agent-2 has no operations
      const oidA = createSnapshot('content');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidA, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1', // agent-1, not agent-2
      });

      const allOps = await getAllOperationsForAgentInstanceId(db, '2');

      expect(allOps).toHaveLength(0);
    });

    it('returns all session ops for simple pending session', async () => {
      // Single session, agent-1 has one edit (same as getPending for pending)
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('edited');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });

      const allOps = await getAllOperationsForAgentInstanceId(db, '1');

      expect(allOps).toHaveLength(2);
      expect(allOps[0].idx).toBe(1);
      expect(allOps[0].operation).toBe('baseline');
      expect(allOps[1].idx).toBe(2);
      expect(allOps[1].operation).toBe('edit');
    });

    it('returns completed session ops (unlike getPending which returns empty)', async () => {
      // Session is fully accepted - getPending returns [], but getAll returns the session
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('edited');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'baseline',
        reason: 'accept',
        contributor: 'user',
      });

      const allOps = await getAllOperationsForAgentInstanceId(db, '1');

      // Should return all 3 ops from the completed session
      expect(allOps).toHaveLength(3);
      expect(allOps.map((op) => op.idx)).toEqual([1, 2, 3]);
    });

    it('returns ops from multiple sessions where chat participated', async () => {
      // Session 1: completed
      // Session 2: pending
      // Both should be returned
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('session 1 edit');
      const oidC = createSnapshot('session 2 edit');

      // Session 1
      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'baseline',
        reason: 'accept',
        contributor: 'user',
      });
      // Session 2
      insertOperation(db, '/a.ts', oidB, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidC, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-1',
      });

      const allOps = await getAllOperationsForAgentInstanceId(db, '1');

      // Should return all 5 ops from both sessions
      expect(allOps).toHaveLength(5);
      expect(allOps.map((op) => op.idx)).toEqual([1, 2, 3, 4, 5]);
    });

    it('skips sessions where chat did not participate', async () => {
      // Session 1: agent-1 participated
      // Session 2: agent-2 participated (not agent-1)
      // Session 3: agent-1 participated
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('session 1 edit');
      const oidC = createSnapshot('session 2 edit');
      const oidD = createSnapshot('session 3 edit');

      // Session 1 (agent-1)
      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'baseline',
        reason: 'accept',
        contributor: 'user',
      });
      // Session 2 (agent-2 only)
      insertOperation(db, '/a.ts', oidB, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidC, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-2',
      });
      insertOperation(db, '/a.ts', oidC, {
        operation: 'baseline',
        reason: 'accept',
        contributor: 'user',
      });
      // Session 3 (agent-1)
      insertOperation(db, '/a.ts', oidC, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidD, {
        operation: 'edit',
        reason: 'tool-3',
        contributor: 'agent-1',
      });

      const allOps = await getAllOperationsForAgentInstanceId(db, '1');

      // Should return sessions 1 and 3 (idx 1-3 and 7-8), skip session 2 (idx 4-6)
      expect(allOps).toHaveLength(5);
      expect(allOps.map((op) => op.idx)).toEqual([1, 2, 3, 7, 8]);
    });

    it('handles multiple files where chat participated', async () => {
      // Agent-1 edits /a.ts and /b.ts
      const oidA1 = createSnapshot('a original');
      const oidA2 = createSnapshot('a edited');
      const oidB1 = createSnapshot('b original');
      const oidB2 = createSnapshot('b edited');

      // File /a.ts
      insertOperation(db, '/a.ts', oidA1, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidA2, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });

      // File /b.ts
      insertOperation(db, '/b.ts', oidB1, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/b.ts', oidB2, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-1',
      });

      const allOps = await getAllOperationsForAgentInstanceId(db, '1');

      // Should return ops for both files
      expect(allOps).toHaveLength(4);
      const filepaths = [...new Set(allOps.map((op) => op.filepath))];
      expect(filepaths).toContain('/a.ts');
      expect(filepaths).toContain('/b.ts');
    });

    it('returns session ops when multiple chats edit same file', async () => {
      // Both agent-1 and agent-2 edit in the same session
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('edit by agent-1');
      const oidC = createSnapshot('edit by agent-2');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });
      insertOperation(db, '/a.ts', oidC, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-2',
      });

      const opsChat1 = await getAllOperationsForAgentInstanceId(db, '1');
      const opsChat2 = await getAllOperationsForAgentInstanceId(db, '2');

      // Both chats participated in the session, both should get all 3 ops
      expect(opsChat1).toHaveLength(3);
      expect(opsChat2).toHaveLength(3);
      expect(opsChat1.map((op) => op.idx)).toEqual([1, 2, 3]);
      expect(opsChat2.map((op) => op.idx)).toEqual([1, 2, 3]);
    });

    it('only includes sessions where chat made an edit (not just baseline)', async () => {
      // Session 1: agent-1 edited
      // Session 2: agent-1 did NOT edit (only baseline ops exist, no edit by agent-1)
      // This tests that baseline ops by 'user' don't count as chat participation
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('session 1 edit');

      // Session 1 (agent-1 edited)
      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'baseline',
        reason: 'accept',
        contributor: 'user',
      });
      // Session 2 (only user baseline, agent-2 edits but not agent-1)
      insertOperation(db, '/a.ts', oidB, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidA, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-2',
      });

      const allOps = await getAllOperationsForAgentInstanceId(db, '1');

      // Should only return session 1 (idx 1-3), not session 2
      expect(allOps).toHaveLength(3);
      expect(allOps.map((op) => op.idx)).toEqual([1, 2, 3]);
    });

    it('handles file with no init baseline gracefully', async () => {
      // Edge case: operations exist but no init (shouldn't happen in practice)
      // This shouldn't crash, just return empty since no sessions can be identified
      const oidA = createSnapshot('content');

      // Only insert an edit without init baseline
      insertOperation(db, '/a.ts', oidA, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });

      const allOps = await getAllOperationsForAgentInstanceId(db, '1');

      // No init means no sessions can be identified
      expect(allOps).toHaveLength(0);
    });
  });

  // ===========================================================================
  // getAllPendingOperations
  // ===========================================================================

  describe('getAllPendingOperations', () => {
    /**
     * Helper to create a snapshot and return its oid.
     * Uses insertKeyframe directly to avoid storeFileContent's side effects.
     */
    function createSnapshot(content: string): string {
      const buf = Buffer.from(content);
      const oid = computeOid(buf);
      insertKeyframe(db, oid, buf);
      return oid;
    }

    it('returns empty array when no operations exist', async () => {
      const pending = await getAllPendingOperations(db);
      expect(pending).toHaveLength(0);
    });

    it('returns empty array when all files are fully accepted', async () => {
      // File /a.ts: fully accepted
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('edited');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'baseline',
        reason: 'accept',
        contributor: 'user',
      });

      const pending = await getAllPendingOperations(db);
      expect(pending).toHaveLength(0);
    });

    it('returns pending operations for a single pending file', async () => {
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('edited');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });

      const pending = await getAllPendingOperations(db);

      expect(pending).toHaveLength(2);
      expect(pending[0].idx).toBe(1);
      expect(pending[0].operation).toBe('baseline');
      expect(pending[1].idx).toBe(2);
      expect(pending[1].operation).toBe('edit');
    });

    it('returns pending operations for multiple pending files', async () => {
      // File /a.ts: pending
      const oidA1 = createSnapshot('a original');
      const oidA2 = createSnapshot('a edited');

      // File /b.ts: pending
      const oidB1 = createSnapshot('b original');
      const oidB2 = createSnapshot('b edited');

      insertOperation(db, '/a.ts', oidA1, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidA2, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });
      insertOperation(db, '/b.ts', oidB1, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/b.ts', oidB2, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-2',
      });

      const pending = await getAllPendingOperations(db);

      expect(pending).toHaveLength(4);
      const filepaths = [...new Set(pending.map((op) => op.filepath))];
      expect(filepaths).toContain('/a.ts');
      expect(filepaths).toContain('/b.ts');
    });

    it('returns only pending files when some are accepted', async () => {
      // File /a.ts: pending
      const oidA1 = createSnapshot('a original');
      const oidA2 = createSnapshot('a edited');

      // File /b.ts: fully accepted (not pending)
      const oidB1 = createSnapshot('b original');
      const oidB2 = createSnapshot('b edited');

      // File /a.ts - pending
      insertOperation(db, '/a.ts', oidA1, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidA2, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });

      // File /b.ts - fully accepted
      insertOperation(db, '/b.ts', oidB1, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/b.ts', oidB2, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-2',
      });
      insertOperation(db, '/b.ts', oidB2, {
        operation: 'baseline',
        reason: 'accept',
        contributor: 'user',
      });

      const pending = await getAllPendingOperations(db);

      // Should only return /a.ts operations
      expect(pending).toHaveLength(2);
      expect(pending.every((op) => op.filepath === '/a.ts')).toBe(true);
    });

    it('returns pending operations from multiple agents on same file', async () => {
      // Both agent-1 and agent-2 edit /a.ts (still pending)
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('edit by agent-1');
      const oidC = createSnapshot('edit by agent-2');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });
      insertOperation(db, '/a.ts', oidC, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-2',
      });

      const pending = await getAllPendingOperations(db);

      expect(pending).toHaveLength(3);
      expect(pending.map((op) => op.idx)).toEqual([1, 2, 3]);
      // Verify different contributors are included
      const contributors = pending.map((op) => op.contributor);
      expect(contributors).toContain('agent-1');
      expect(contributors).toContain('agent-2');
    });

    it('returns only current session when previous session ended', async () => {
      // Session 1: completed
      // Session 2: pending
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('first edit');
      const oidC = createSnapshot('second edit');

      // Session 1
      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'baseline',
        reason: 'accept',
        contributor: 'user',
      });
      // Session 2
      insertOperation(db, '/a.ts', oidB, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidC, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-1',
      });

      const pending = await getAllPendingOperations(db);

      // Should only return session 2 (idx 4, 5)
      expect(pending).toHaveLength(2);
      expect(pending[0].idx).toBe(4);
      expect(pending[1].idx).toBe(5);
    });

    it('handles partial accept (still pending)', async () => {
      // Partial accept - baseline moved but not equal to edit
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('edited');
      const oidC = createSnapshot('partially accepted');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });
      insertOperation(db, '/a.ts', oidC, {
        operation: 'baseline',
        reason: 'accept',
        contributor: 'user',
      });

      const pending = await getAllPendingOperations(db);

      expect(pending).toHaveLength(3);
      expect(pending.map((op) => op.idx)).toEqual([1, 2, 3]);
    });

    it('includes operations after user reject', async () => {
      // Agent edits, user rejects part
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('edited by agent');
      const oidC = createSnapshot('after user reject');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });
      insertOperation(db, '/a.ts', oidC, {
        operation: 'edit',
        reason: 'reject',
        contributor: 'user',
      });

      const pending = await getAllPendingOperations(db);

      expect(pending).toHaveLength(3);
      // Latest baseline is A, latest edit is C, A != C -> pending
    });

    it('operations are ordered by filepath then idx', async () => {
      // Create operations for multiple files
      const oidA = createSnapshot('a content');
      const oidB = createSnapshot('b content');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });
      insertOperation(db, '/b.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/b.ts', oidB, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-2',
      });

      const pending = await getAllPendingOperations(db);

      // Should be ordered: /a.ts (1, 2), then /b.ts (3, 4)
      expect(pending).toHaveLength(4);
      expect(pending[0].filepath).toBe('/a.ts');
      expect(pending[0].idx).toBe(1);
      expect(pending[1].filepath).toBe('/a.ts');
      expect(pending[1].idx).toBe(2);
      expect(pending[2].filepath).toBe('/b.ts');
      expect(pending[2].idx).toBe(3);
      expect(pending[3].filepath).toBe('/b.ts');
      expect(pending[3].idx).toBe(4);
    });

    it('returns same results regardless of which agent is queried', async () => {
      // Both agent-1 and agent-2 have pending edits on different files
      // getAllPendingOperations should return ALL of them
      const oidA1 = createSnapshot('a original');
      const oidA2 = createSnapshot('a edited');
      const oidB1 = createSnapshot('b original');
      const oidB2 = createSnapshot('b edited');

      // File /a.ts - agent-1 edited
      insertOperation(db, '/a.ts', oidA1, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidA2, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      });

      // File /b.ts - agent-2 edited
      insertOperation(db, '/b.ts', oidB1, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/b.ts', oidB2, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-2',
      });

      const allPending = await getAllPendingOperations(db);
      const agent1Pending = await getPendingOperationsForAgentInstanceId(
        db,
        '1',
      );
      const agent2Pending = await getPendingOperationsForAgentInstanceId(
        db,
        '2',
      );

      // getAllPendingOperations should return ALL 4 operations
      expect(allPending).toHaveLength(4);

      // getPendingOperationsForAgentInstanceId returns only files where that agent contributed
      expect(agent1Pending).toHaveLength(2);
      expect(agent1Pending.every((op) => op.filepath === '/a.ts')).toBe(true);

      expect(agent2Pending).toHaveLength(2);
      expect(agent2Pending.every((op) => op.filepath === '/b.ts')).toBe(true);
    });
  });

  describe('LFS (Large File Storage)', () => {
    let blobsDir: string;

    beforeEach(() => {
      // Create a temp blobs directory for each test
      blobsDir = path.join(
        os.tmpdir(),
        `test-blobs-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
    });

    afterEach(() => {
      // Clean up blobs directory
      try {
        if (fs.existsSync(blobsDir)) {
          fs.rmSync(blobsDir, { recursive: true });
        }
      } catch {
        // Ignore cleanup errors
      }
    });

    /**
     * Helper to create an async iterable from a buffer (simulates streaming)
     */
    async function* bufferToStream(buffer: Buffer): AsyncIterable<Buffer> {
      // Yield in chunks to simulate streaming
      const chunkSize = 1024;
      for (let i = 0; i < buffer.length; i += chunkSize) {
        yield buffer.subarray(i, Math.min(i + chunkSize, buffer.length));
      }
    }

    it('storeLargeContent() stores content to disk and creates operation', async () => {
      const content = Buffer.from('Large file content for LFS test');
      const filepath = '/large/file.bin';
      const meta = {
        operation: 'baseline' as const,
        contributor: 'user' as const,
        reason: 'init' as const,
      };

      const oid = await storeLargeContent(
        db,
        blobsDir,
        bufferToStream(content),
        filepath,
        meta,
      );

      // Verify oid is correct hash
      expect(oid).toBe(computeOid(content));

      // Verify blob file exists on disk
      const blobPath = path.join(blobsDir, oid);
      expect(fs.existsSync(blobPath)).toBe(true);

      // Verify blob content matches
      const diskContent = fs.readFileSync(blobPath);
      expect(diskContent.toString()).toBe(content.toString());

      // Verify snapshot record exists with is_external=true
      const snapshot = await getSnapshot(db, oid);
      expect(snapshot).not.toBeNull();
      expect(snapshot!.is_external).toBe(true);
      expect(snapshot!.payload.length).toBe(0); // Empty payload for external

      // Verify operation was recorded
      const history = await getOperationHistory(db, filepath);
      expect(history).toHaveLength(1);
      expect(history[0].snapshot_oid).toBe(oid);
      expect(history[0].isExternal).toBe(true);
    });

    it('streamContent() streams content from disk blob', async () => {
      const content = Buffer.from('Streaming test content');
      const filepath = '/stream/test.bin';
      const meta = {
        operation: 'baseline' as const,
        contributor: 'user' as const,
        reason: 'init' as const,
      };

      const oid = await storeLargeContent(
        db,
        blobsDir,
        bufferToStream(content),
        filepath,
        meta,
      );

      // Stream content back and collect chunks
      const chunks: Buffer[] = [];
      for await (const chunk of streamContent(blobsDir, oid)) {
        chunks.push(chunk);
      }
      const retrieved = Buffer.concat(chunks);

      expect(retrieved.toString()).toBe(content.toString());
    });

    it('copyContentToPath() copies blob to destination', async () => {
      const content = Buffer.from('Content to copy');
      const filepath = '/copy/source.bin';
      const meta = {
        operation: 'baseline' as const,
        contributor: 'user' as const,
        reason: 'init' as const,
      };

      const oid = await storeLargeContent(
        db,
        blobsDir,
        bufferToStream(content),
        filepath,
        meta,
      );

      // Copy to a new destination
      const destPath = path.join(os.tmpdir(), `copy-dest-${Date.now()}.bin`);

      try {
        await copyContentToPath(blobsDir, oid, destPath);

        // Verify destination content matches
        const destContent = fs.readFileSync(destPath);
        expect(destContent.toString()).toBe(content.toString());
      } finally {
        // Cleanup
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
      }
    });

    it('retrieveContent() returns null for external snapshots', async () => {
      const content = Buffer.from('External content');
      const filepath = '/external/test.bin';
      const meta = {
        operation: 'baseline' as const,
        contributor: 'user' as const,
        reason: 'init' as const,
      };

      const oid = await storeLargeContent(
        db,
        blobsDir,
        bufferToStream(content),
        filepath,
        meta,
      );

      // retrieveContent should return null for external
      const retrieved = await retrieveContentForOid(db, oid);
      expect(retrieved).toBeNull();
    });

    it('getContentsForOids() filters out external oids', async () => {
      // Store one inline and one external
      const inlineContent = Buffer.from('Inline content');
      const externalContent = Buffer.from('External content');

      const inlineMeta = {
        operation: 'baseline' as const,
        contributor: 'user' as const,
        reason: 'init' as const,
      };

      // Store inline
      const inlineOid = await storeFileContent(
        db,
        '/inline/file.txt',
        inlineContent,
        inlineMeta,
      );

      // Store external
      const externalOid = await storeLargeContent(
        db,
        blobsDir,
        bufferToStream(externalContent),
        '/external/file.bin',
        inlineMeta,
      );

      // Get contents for both oids
      const contents = await retrieveContentsForOids(db, [
        inlineOid,
        externalOid,
      ]);

      // Only inline should be in the result
      expect(contents.size).toBe(1);
      expect(contents.has(inlineOid)).toBe(true);
      expect(contents.has(externalOid)).toBe(false);
      expect(contents.get(inlineOid)!.toString()).toBe(
        inlineContent.toString(),
      );
    });

    it('operation queries include isExternal flag', async () => {
      // Store external content
      const content = Buffer.from('External for flag test');
      const filepath = '/flag/test.bin';
      const meta = {
        operation: 'baseline' as const,
        contributor: 'user' as const,
        reason: 'init' as const,
      };

      await storeLargeContent(
        db,
        blobsDir,
        bufferToStream(content),
        filepath,
        meta,
      );

      // getOperationHistory should include isExternal
      const history = await getOperationHistory(db, filepath);
      expect(history).toHaveLength(1);
      expect(history[0].isExternal).toBe(true);
    });
  });

  describe('copyOperationsUpToInitBaseline (revert)', () => {
    const filepath = '/revert/test.ts';

    it('copies operations from init baseline to target idx', async () => {
      // Setup: Create a sequence of operations
      // idx 1: baseline (init)
      // idx 2: edit (tool-1, agent-1)
      // idx 3: edit (tool-2, agent-1)
      // idx 4: baseline (accept)
      // idx 5: baseline (init) - new session
      // idx 6: edit (tool-3, agent-1)

      const content0 = Buffer.from('initial content');
      const content1 = Buffer.from('after tool-1');
      const content2 = Buffer.from('after tool-2');
      const content3 = Buffer.from('accepted content');
      const content4 = Buffer.from('new session start');
      const content5 = Buffer.from('after tool-3');

      // Store snapshots
      const oid0 = computeOid(content0);
      const oid1 = computeOid(content1);
      const oid2 = computeOid(content2);
      const oid3 = computeOid(content3);
      const oid4 = computeOid(content4);
      const oid5 = computeOid(content5);

      insertKeyframe(db, oid0, content0);
      insertKeyframe(db, oid1, content1);
      insertKeyframe(db, oid2, content2);
      insertKeyframe(db, oid3, content3);
      insertKeyframe(db, oid4, content4);
      insertKeyframe(db, oid5, content5);

      // Insert operations (idx 1-6 with AUTOINCREMENT)
      insertOperation(db, filepath, oid0, {
        operation: 'baseline',
        contributor: 'user',
        reason: 'init',
      }); // idx 1
      insertOperation(db, filepath, oid1, {
        operation: 'edit',
        contributor: 'agent-1',
        reason: 'tool-1',
      }); // idx 2
      insertOperation(db, filepath, oid2, {
        operation: 'edit',
        contributor: 'agent-1',
        reason: 'tool-2',
      }); // idx 3
      insertOperation(db, filepath, oid3, {
        operation: 'baseline',
        contributor: 'user',
        reason: 'accept',
      }); // idx 4
      insertOperation(db, filepath, oid4, {
        operation: 'baseline',
        contributor: 'user',
        reason: 'init',
      }); // idx 5
      insertOperation(db, filepath, oid5, {
        operation: 'edit',
        contributor: 'agent-1',
        reason: 'tool-3',
      }); // idx 6

      // Revert to idx 3 (tool-2 edit) - should copy from init baseline idx 1-3 to new idx 7-9
      const resultOp = await copyOperationsUpToInitBaseline(db, filepath, 3);

      expect(resultOp).not.toBeNull();
      expect(resultOp!.snapshot_oid).toBe(oid2);

      // Check the history - should now have 9 operations
      const history = await getOperationHistory(db, filepath);
      expect(history).toHaveLength(9);

      // Verify the copied operations (idx 7, 8, 9)
      expect(history[6].idx).toBe(7);
      expect(history[6].operation).toBe('baseline');
      expect(history[6].reason).toBe('init');
      expect(history[6].snapshot_oid).toBe(oid0);

      expect(history[7].idx).toBe(8);
      expect(history[7].operation).toBe('edit');
      expect(history[7].reason).toBe('tool-1');
      expect(history[7].snapshot_oid).toBe(oid1);

      expect(history[8].idx).toBe(9);
      expect(history[8].operation).toBe('edit');
      expect(history[8].reason).toBe('tool-2');
      expect(history[8].snapshot_oid).toBe(oid2);
    });

    it('returns null when no init baseline exists at or before target idx', async () => {
      // Only an edit operation, no init baseline before it
      const content = Buffer.from('edit without baseline');
      const oid = computeOid(content);
      insertKeyframe(db, oid, content);

      insertOperation(db, filepath, oid, {
        operation: 'edit',
        contributor: 'agent-1',
        reason: 'tool-1',
      }); // idx 1

      const result = await copyOperationsUpToInitBaseline(db, filepath, 1);

      expect(result).toBeNull();
    });

    it('copies only up to the specified target idx', async () => {
      // Setup with multiple edits
      const content0 = Buffer.from('baseline');
      const content1 = Buffer.from('agent-1 edit');
      const content2 = Buffer.from('agent-2 edit');

      const oid0 = computeOid(content0);
      const oid1 = computeOid(content1);
      const oid2 = computeOid(content2);

      insertKeyframe(db, oid0, content0);
      insertKeyframe(db, oid1, content1);
      insertKeyframe(db, oid2, content2);

      insertOperation(db, filepath, oid0, {
        operation: 'baseline',
        contributor: 'user',
        reason: 'init',
      }); // idx 1
      insertOperation(db, filepath, oid1, {
        operation: 'edit',
        contributor: 'agent-1',
        reason: 'tool-a',
      }); // idx 2
      insertOperation(db, filepath, oid2, {
        operation: 'edit',
        contributor: 'agent-2',
        reason: 'tool-b',
      }); // idx 3

      // Revert to idx 2 (tool-a edit) - should copy idx 1-2, not include idx 3
      const resultOp = await copyOperationsUpToInitBaseline(db, filepath, 2);

      expect(resultOp).not.toBeNull();
      expect(resultOp!.snapshot_oid).toBe(oid1);

      const history = await getOperationHistory(db, filepath);
      expect(history).toHaveLength(5); // 3 original + 2 copied

      // Copied operations should be idx 4 and 5
      expect(history[3].idx).toBe(4);
      expect(history[3].snapshot_oid).toBe(oid0);
      expect(history[3].reason).toBe('init');

      expect(history[4].idx).toBe(5);
      expect(history[4].snapshot_oid).toBe(oid1);
      expect(history[4].reason).toBe('tool-a');
    });

    it('can copy to an init baseline operation directly', async () => {
      // When undoing to an init baseline, we copy just the baseline
      const content0 = Buffer.from('original');
      const content1 = Buffer.from('edited');

      const oid0 = computeOid(content0);
      const oid1 = computeOid(content1);

      insertKeyframe(db, oid0, content0);
      insertKeyframe(db, oid1, content1);

      insertOperation(db, filepath, oid0, {
        operation: 'baseline',
        contributor: 'user',
        reason: 'init',
      }); // idx 1
      insertOperation(db, filepath, oid1, {
        operation: 'edit',
        contributor: 'agent-1',
        reason: 'tool-1',
      }); // idx 2

      // Copy up to idx 1 (the init baseline itself)
      const resultOp = await copyOperationsUpToInitBaseline(db, filepath, 1);

      expect(resultOp).not.toBeNull();
      expect(resultOp!.snapshot_oid).toBe(oid0);
      expect(resultOp!.operation).toBe('baseline');
      expect(resultOp!.reason).toBe('init');

      const history = await getOperationHistory(db, filepath);
      expect(history).toHaveLength(3); // 2 original + 1 copied

      // Copied operation should be idx 3 (just the baseline)
      expect(history[2].idx).toBe(3);
      expect(history[2].snapshot_oid).toBe(oid0);
      expect(history[2].reason).toBe('init');
      expect(history[2].operation).toBe('baseline');
    });

    it('copies from init baseline even when accept baseline exists between init and target', async () => {
      // This is the key test - verifies we use init baseline, not just any baseline
      // idx 1: baseline (init) - oid0
      // idx 2: edit (tool-1) - oid1
      // idx 3: baseline (accept) - oid1 (accepted tool-1)
      // idx 4: edit (tool-2) - oid2
      // We undo to idx 3 (accept baseline) - should copy from idx 1 (init), not just idx 3

      const content0 = Buffer.from('original');
      const content1 = Buffer.from('after tool-1');
      const content2 = Buffer.from('after tool-2');

      const oid0 = computeOid(content0);
      const oid1 = computeOid(content1);
      const oid2 = computeOid(content2);

      insertKeyframe(db, oid0, content0);
      insertKeyframe(db, oid1, content1);
      insertKeyframe(db, oid2, content2);

      insertOperation(db, filepath, oid0, {
        operation: 'baseline',
        contributor: 'user',
        reason: 'init',
      }); // idx 1
      insertOperation(db, filepath, oid1, {
        operation: 'edit',
        contributor: 'agent-1',
        reason: 'tool-1',
      }); // idx 2
      insertOperation(db, filepath, oid1, {
        operation: 'baseline',
        contributor: 'user',
        reason: 'accept',
      }); // idx 3 - accept baseline
      insertOperation(db, filepath, oid2, {
        operation: 'edit',
        contributor: 'agent-1',
        reason: 'tool-2',
      }); // idx 4

      // Undo to idx 3 (accept baseline) - should copy from init (idx 1), not accept (idx 3)
      const resultOp = await copyOperationsUpToInitBaseline(db, filepath, 3);

      expect(resultOp).not.toBeNull();

      const history = await getOperationHistory(db, filepath);
      // Should have 4 original + 3 copied (init + tool-1 + accept) = 7
      expect(history).toHaveLength(7);

      // Verify the copied operations start from init baseline
      expect(history[4].idx).toBe(5);
      expect(history[4].operation).toBe('baseline');
      expect(history[4].reason).toBe('init');
      expect(history[4].snapshot_oid).toBe(oid0);

      expect(history[5].idx).toBe(6);
      expect(history[5].operation).toBe('edit');
      expect(history[5].reason).toBe('tool-1');
      expect(history[5].snapshot_oid).toBe(oid1);

      expect(history[6].idx).toBe(7);
      expect(history[6].operation).toBe('baseline');
      expect(history[6].reason).toBe('accept');
      expect(history[6].snapshot_oid).toBe(oid1);
    });
  });

  // ===========================================================================
  // getUndoTargetForToolCallsByFilePath
  // ===========================================================================

  describe('getUndoTargetForToolCallsByFilePath', () => {
    /**
     * Helper to create a snapshot and return its oid.
     */
    function createSnapshot(content: string): string {
      const buf = Buffer.from(content);
      const oid = computeOid(buf);
      insertKeyframe(db, oid, buf);
      return oid;
    }

    it('returns empty object when no tool-call IDs provided', async () => {
      const result = await getUndoTargetForToolCallsByFilePath(db, []);
      expect(result).toEqual({});
    });

    it('returns empty object when tool-call IDs have no matching operations', async () => {
      // Create some operations with different tool-call IDs
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('edited');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      });
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-existing',
        contributor: 'agent-1',
      });

      // Query for non-existent tool-call IDs
      const result = await getUndoTargetForToolCallsByFilePath(db, [
        'nonexistent-1',
        'nonexistent-2',
      ]);

      expect(result).toEqual({});
    });

    it('returns operation BEFORE tool-call for single tool-call ID on single file', async () => {
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('edited');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      }); // idx 1
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      }); // idx 2

      const result = await getUndoTargetForToolCallsByFilePath(db, ['1']);

      expect(Object.keys(result)).toHaveLength(1);
      expect(result['/a.ts']).toBeDefined();
      // Should return the op BEFORE tool-1 (the init baseline at idx 1)
      expect(result['/a.ts'].idx).toBe(1);
      expect(result['/a.ts'].reason).toBe('init');
      expect(result['/a.ts'].operation).toBe('baseline');
      expect(result['/a.ts'].filepath).toBe('/a.ts');
    });

    it('returns operation BEFORE earliest tool-call when same tool-call modified file multiple times', async () => {
      // This can happen if a tool-call performs multiple edits
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('first edit');
      const oidC = createSnapshot('second edit');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      }); // idx 1
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      }); // idx 2
      insertOperation(db, '/a.ts', oidC, {
        operation: 'edit',
        reason: 'tool-1', // Same tool-call ID
        contributor: 'agent-1',
      }); // idx 3

      const result = await getUndoTargetForToolCallsByFilePath(db, ['1']);

      expect(Object.keys(result)).toHaveLength(1);
      // Should return the op BEFORE the earliest tool-1 (the init baseline at idx 1)
      expect(result['/a.ts'].idx).toBe(1);
      expect(result['/a.ts'].reason).toBe('init');
    });

    it('returns operation BEFORE earliest tool-call across multiple tool-call IDs for same file', async () => {
      // Multiple tool-calls all modified /a.ts, should return op before the earliest one
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('tool-1 edit');
      const oidC = createSnapshot('tool-2 edit');
      const oidD = createSnapshot('tool-3 edit');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      }); // idx 1
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      }); // idx 2 - earliest tool-call
      insertOperation(db, '/a.ts', oidC, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-1',
      }); // idx 3
      insertOperation(db, '/a.ts', oidD, {
        operation: 'edit',
        reason: 'tool-3',
        contributor: 'agent-1',
      }); // idx 4

      const result = await getUndoTargetForToolCallsByFilePath(db, [
        '1',
        '2',
        '3',
      ]);

      expect(Object.keys(result)).toHaveLength(1);
      // Should return op BEFORE earliest tool-call (init baseline at idx 1)
      expect(result['/a.ts'].idx).toBe(1);
      expect(result['/a.ts'].reason).toBe('init');
    });

    it('returns operation BEFORE earliest tool-call per file when multiple files affected', async () => {
      const oidA1 = createSnapshot('a original');
      const oidA2 = createSnapshot('a edited');
      const oidB1 = createSnapshot('b original');
      const oidB2 = createSnapshot('b edited');

      // File /a.ts - tool-1 at idx 2
      insertOperation(db, '/a.ts', oidA1, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      }); // idx 1
      insertOperation(db, '/a.ts', oidA2, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      }); // idx 2

      // File /b.ts - tool-2 at idx 4
      insertOperation(db, '/b.ts', oidB1, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      }); // idx 3
      insertOperation(db, '/b.ts', oidB2, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-1',
      }); // idx 4

      const result = await getUndoTargetForToolCallsByFilePath(db, ['1', '2']);

      expect(Object.keys(result)).toHaveLength(2);

      // /a.ts should return op BEFORE tool-1 (init baseline at idx 1)
      expect(result['/a.ts']).toBeDefined();
      expect(result['/a.ts'].idx).toBe(1);
      expect(result['/a.ts'].reason).toBe('init');

      // /b.ts should return op BEFORE tool-2 (init baseline at idx 3)
      expect(result['/b.ts']).toBeDefined();
      expect(result['/b.ts'].idx).toBe(3);
      expect(result['/b.ts'].reason).toBe('init');
    });

    it('handles mixed scenario: some tool-calls have operations, some do not', async () => {
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('edited');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      }); // idx 1
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      }); // idx 2

      // Query for existing tool-1 and non-existent tool-999
      const result = await getUndoTargetForToolCallsByFilePath(db, [
        '1',
        '999',
      ]);

      // Should only return /a.ts with the op BEFORE tool-1
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['/a.ts'].idx).toBe(1);
      expect(result['/a.ts'].reason).toBe('init');
    });

    it('handles multiple files with different earliest tool-calls', async () => {
      // /a.ts: tool-2 is earliest (tool-1 came later due to interleaving)
      // /b.ts: tool-1 is earliest
      const oidA1 = createSnapshot('a original');
      const oidA2 = createSnapshot('a tool-2 edit');
      const oidA3 = createSnapshot('a tool-1 edit');
      const oidB1 = createSnapshot('b original');
      const oidB2 = createSnapshot('b tool-1 edit');
      const oidB3 = createSnapshot('b tool-2 edit');

      // Setup interleaved operations
      insertOperation(db, '/a.ts', oidA1, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      }); // idx 1
      insertOperation(db, '/a.ts', oidA2, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-1',
      }); // idx 2 - earliest tool-call for /a.ts
      insertOperation(db, '/b.ts', oidB1, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      }); // idx 3
      insertOperation(db, '/b.ts', oidB2, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      }); // idx 4 - earliest tool-call for /b.ts
      insertOperation(db, '/a.ts', oidA3, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      }); // idx 5 - later tool-1 for /a.ts
      insertOperation(db, '/b.ts', oidB3, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-1',
      }); // idx 6 - later tool-2 for /b.ts

      const result = await getUndoTargetForToolCallsByFilePath(db, ['1', '2']);

      expect(Object.keys(result)).toHaveLength(2);

      // /a.ts should return op BEFORE tool-2 (init baseline at idx 1)
      expect(result['/a.ts'].idx).toBe(1);
      expect(result['/a.ts'].reason).toBe('init');

      // /b.ts should return op BEFORE tool-1 (init baseline at idx 3)
      expect(result['/b.ts'].idx).toBe(3);
      expect(result['/b.ts'].reason).toBe('init');
    });

    it('includes isExternal flag from joined snapshot', async () => {
      const content = Buffer.from('content');
      const oid = computeOid(content);
      insertKeyframe(db, oid, content, false); // Non-external

      insertOperation(db, '/a.ts', oid, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      }); // idx 1
      insertOperation(db, '/a.ts', oid, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      }); // idx 2

      const result = await getUndoTargetForToolCallsByFilePath(db, ['1']);

      // Should return the init baseline (before tool-1) with isExternal flag
      expect(result['/a.ts'].idx).toBe(1);
      expect(result['/a.ts'].isExternal).toBe(false);
    });

    it('returns before-op for operations from different agents', async () => {
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('agent-1 edit');
      const oidC = createSnapshot('agent-2 edit');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      }); // idx 1
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      }); // idx 2
      insertOperation(db, '/b.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      }); // idx 3
      insertOperation(db, '/b.ts', oidC, {
        operation: 'edit',
        reason: 'tool-2',
        contributor: 'agent-2',
      }); // idx 4

      const result = await getUndoTargetForToolCallsByFilePath(db, ['1', '2']);

      expect(Object.keys(result)).toHaveLength(2);
      // Both should return the init baselines (contributor is 'user')
      expect(result['/a.ts'].contributor).toBe('user');
      expect(result['/b.ts'].contributor).toBe('user');
      expect(result['/a.ts'].reason).toBe('init');
      expect(result['/b.ts'].reason).toBe('init');
    });

    it('returns user-save edit when it exists between init and tool-call', async () => {
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('user save');
      const oidC = createSnapshot('tool edit');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      }); // idx 1
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'user-save',
        contributor: 'user',
      }); // idx 2
      insertOperation(db, '/a.ts', oidC, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      }); // idx 3

      const result = await getUndoTargetForToolCallsByFilePath(db, ['1']);

      expect(Object.keys(result)).toHaveLength(1);
      // Should return the user-save edit (immediately before tool-1)
      expect(result['/a.ts'].idx).toBe(2);
      expect(result['/a.ts'].reason).toBe('user-save');
      expect(result['/a.ts'].operation).toBe('edit');
    });

    it('returns accept baseline when it exists before tool-call', async () => {
      const oidA = createSnapshot('original');
      const oidB = createSnapshot('first tool edit');
      const oidC = createSnapshot('accepted');
      const oidD = createSnapshot('second tool edit');

      insertOperation(db, '/a.ts', oidA, {
        operation: 'baseline',
        reason: 'init',
        contributor: 'user',
      }); // idx 1
      insertOperation(db, '/a.ts', oidB, {
        operation: 'edit',
        reason: 'tool-old',
        contributor: 'agent-1',
      }); // idx 2 - not in our undo list
      insertOperation(db, '/a.ts', oidC, {
        operation: 'baseline',
        reason: 'accept',
        contributor: 'user',
      }); // idx 3
      insertOperation(db, '/a.ts', oidD, {
        operation: 'edit',
        reason: 'tool-1',
        contributor: 'agent-1',
      }); // idx 4

      const result = await getUndoTargetForToolCallsByFilePath(db, ['1']);

      expect(Object.keys(result)).toHaveLength(1);
      // Should return the accept baseline (immediately before tool-1)
      expect(result['/a.ts'].idx).toBe(3);
      expect(result['/a.ts'].reason).toBe('accept');
      expect(result['/a.ts'].operation).toBe('baseline');
    });
  });
});
