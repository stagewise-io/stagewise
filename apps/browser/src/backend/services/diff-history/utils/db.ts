import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { rename, mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import * as path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import type {
  OperationMeta,
  Operation,
  AgentInstanceId,
  ToolCallId,
} from '../schema';
import { eq, and, desc, or, gte, sql, inArray } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as fossilDelta from 'fossil-delta';
import * as schema from '../schema';

type SnapshotDb = LibSQLDatabase<typeof schema>;

/**
 * Operation type extended with isExternal flag from joined snapshot.
 * Used when queries join operations with snapshots to include LFS status.
 */
export type OperationWithExternal = Operation & { isExternal: boolean };

/**
 * Compute SHA-256 hash of content, returning hex string.
 */
export function computeOid(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Get a snapshot by oid.
 */
export async function getSnapshot(
  db: SnapshotDb,
  oid: string,
): Promise<{
  oid: string;
  payload: Buffer;
  delta_target_oid: string | null;
  is_external: boolean;
} | null> {
  const row = await db
    .select()
    .from(schema.snapshots)
    .where(eq(schema.snapshots.oid, oid))
    .get();

  if (!row) return null;

  return {
    oid: row.oid,
    payload: row.payload as Buffer,
    delta_target_oid: row.delta_target_oid,
    is_external: row.is_external,
  };
}

/**
 * Check if a snapshot exists.
 */
export async function snapshotExists(
  db: SnapshotDb,
  oid: string,
): Promise<boolean> {
  const s = await getSnapshot(db, oid);
  return s !== null;
}

/**
 * Insert a keyframe snapshot (full compressed blob).
 * For external (LFS) snapshots, pass isExternal=true and an empty buffer for content.
 */
export function insertKeyframe(
  db: SnapshotDb,
  oid: string,
  content: Buffer,
  isExternal = false,
): void {
  const payload = isExternal ? Buffer.alloc(0) : gzipSync(content);

  db.insert(schema.snapshots)
    .values({
      oid,
      payload,
      delta_target_oid: null,
      is_external: isExternal,
    })
    .run();
}

/**
 * Convert an existing keyframe to a delta pointing at a new target.
 * Used in reverse-delta scheme when a new version becomes the keyframe.
 */
export function convertKeyframeToDelta(
  db: SnapshotDb,
  oid: string,
  newTargetOid: string,
  delta: Buffer,
): void {
  db.update(schema.snapshots)
    .set({
      payload: delta,
      delta_target_oid: newTargetOid,
    })
    .where(eq(schema.snapshots.oid, oid))
    .run();
}

/**
 * Retrieve and decompress content for a snapshot oid.
 * Follows delta chain backwards (towards newer versions) to reconstruct.
 * Returns null for external (LFS) snapshots - use streamContent instead.
 */
export async function retrieveContentForOid(
  db: SnapshotDb,
  oid: string,
): Promise<Buffer | null> {
  const chain: Array<{
    oid: string;
    payload: Buffer;
    delta_target_oid: string | null;
    is_external: boolean;
  }> = [];
  let currentOid: string | null = oid;

  // Walk forward to the keyframe (latest version)
  while (currentOid) {
    const snapshot = await getSnapshot(db, currentOid);
    if (!snapshot) throw new Error(`Snapshot not found: ${currentOid}`);

    chain.push(snapshot);

    if (snapshot.delta_target_oid === null) break;

    currentOid = snapshot.delta_target_oid;
  }

  // Start from keyframe (last in chain)
  const keyframe = chain.pop()!;

  // Return null for external snapshots - caller should use streamContent
  if (keyframe.is_external) return null;

  let content = gunzipSync(keyframe.payload);

  // Apply deltas in reverse order (newest to oldest)
  while (chain.length > 0) {
    const deltaSnapshot = chain.pop()!;
    // fossil-delta accepts Uint8Array (which Buffer extends) and returns the same type
    content = Buffer.from(
      fossilDelta.applyDelta(content, deltaSnapshot.payload),
    );
  }

  return content;
}

/**
 * Retrieve and decompress content for multiple snapshot oids.
 * Returns a Map from oid to decompressed content.
 * Deduplicates input oids and filters out nulls/undefined automatically.
 * External (LFS) oids are automatically filtered out - they won't appear in the result.
 *
 * Uses iterative batch fetching to load all snapshot rows (including delta
 * chain targets) in 2–3 queries instead of one query per OID per chain hop
 * (the old N+1 pattern that caused 777 individual queries / 355ms blocks).
 */
export async function retrieveContentsForOids(
  db: SnapshotDb,
  oids: (string | null | undefined)[],
): Promise<Map<string, Buffer>> {
  const uniqueOids = [...new Set(oids.filter((oid): oid is string => !!oid))];

  if (uniqueOids.length === 0) {
    return new Map();
  }

  // ── Phase 1: Batch-fetch all snapshot rows, chasing delta targets ──
  // Each iteration fetches a "level" of the delta chain graph. Typically
  // completes in 1–2 rounds (most recent edits are keyframes; older edits
  // point one hop forward to the keyframe).
  const snapshotMap = new Map<
    string,
    {
      oid: string;
      payload: Buffer;
      delta_target_oid: string | null;
      is_external: boolean;
    }
  >();

  let oidsToFetch = uniqueOids;
  while (oidsToFetch.length > 0) {
    // SQLite variable limit is 999; chunk at 500 for safety.
    const rows: Array<{
      oid: string;
      payload: Buffer;
      delta_target_oid: string | null;
      is_external: boolean;
    }> = [];
    for (let i = 0; i < oidsToFetch.length; i += 500) {
      const chunk = oidsToFetch.slice(i, i + 500);
      const chunkRows = await db
        .select()
        .from(schema.snapshots)
        .where(inArray(schema.snapshots.oid, chunk))
        .all();
      for (const row of chunkRows) {
        rows.push({
          oid: row.oid,
          payload: row.payload as Buffer,
          delta_target_oid: row.delta_target_oid,
          is_external: row.is_external,
        });
      }
    }

    for (const row of rows) {
      snapshotMap.set(row.oid, row);
    }

    // Collect delta targets we haven't fetched yet.
    const nextOids = new Set<string>();
    for (const row of rows) {
      if (row.delta_target_oid && !snapshotMap.has(row.delta_target_oid)) {
        nextOids.add(row.delta_target_oid);
      }
    }
    oidsToFetch = [...nextOids];
  }

  // ── Phase 2: Resolve delta chains in memory (zero I/O) ──
  const contents = new Map<string, Buffer>();

  // Cache decompressed keyframe content so files sharing a keyframe
  // (common in reverse-delta scheme) only gunzip once.
  const keyframeContentCache = new Map<string, Buffer>();

  for (const requestedOid of uniqueOids) {
    const snap = snapshotMap.get(requestedOid);
    if (!snap) throw new Error(`Snapshot not found for oid: ${requestedOid}`);

    if (snap.is_external) continue;

    // Walk forward from the requested OID to the keyframe.
    const chain: NonNullable<typeof snap>[] = [];
    let currentOid: string | null = requestedOid;
    const visited = new Set<string>();
    while (currentOid) {
      if (visited.has(currentOid)) {
        throw new Error(`Delta chain cycle detected at oid: ${currentOid}`);
      }
      visited.add(currentOid);
      const s = snapshotMap.get(currentOid);
      if (!s) throw new Error(`Snapshot not found: ${currentOid}`);
      chain.push(s);
      if (s.delta_target_oid === null) break;
      currentOid = s.delta_target_oid;
    }

    // Start from keyframe (last in chain).
    const keyframe = chain.pop()!;
    if (keyframe.is_external) continue;

    let content =
      keyframeContentCache.get(keyframe.oid) ?? gunzipSync(keyframe.payload);
    if (!keyframeContentCache.has(keyframe.oid)) {
      keyframeContentCache.set(keyframe.oid, content);
    }

    // Apply deltas in reverse order (newest to oldest).
    while (chain.length > 0) {
      const deltaSnapshot = chain.pop()!;
      content = Buffer.from(
        fossilDelta.applyDelta(content, deltaSnapshot.payload),
      );
    }

    contents.set(requestedOid, content);
  }

  return contents;
}

/**
 * Summary row type for file pending status check.
 */
type FileSummary = {
  filepath: string;
  latest_baseline_oid: string | null;
  latest_edit_oid: string | null;
  latest_init_idx: number | null;
};

/**
 * Get all pending operations for a chat id.
 * Pending edit operations for a file are defined as operations where
 * the latest baseline snapshot_oid differs from the latest edit snapshot_oid.
 *
 * Returns all operations from the latest 'init' baseline to the latest operation
 * for each file that has pending edits. Includes isExternal flag from joined snapshot.
 */
export async function getPendingOperationsForAgentInstanceId(
  db: SnapshotDb,
  agentInstanceId: AgentInstanceId,
): Promise<OperationWithExternal[]> {
  const contributor = `agent-${agentInstanceId}` as `agent-${AgentInstanceId}`;

  // Query 1: Get summary per filepath using raw SQL with correlated subqueries
  // This returns: filepath, latest_baseline_oid, latest_edit_oid, latest_init_idx
  const summaryQuery = sql`
    SELECT 
      o.filepath,
      (SELECT snapshot_oid FROM operations o2 
       WHERE o2.filepath = o.filepath AND o2.operation = 'baseline' 
       ORDER BY o2.idx DESC LIMIT 1) as latest_baseline_oid,
      (SELECT snapshot_oid FROM operations o2 
       WHERE o2.filepath = o.filepath AND o2.operation = 'edit' 
       ORDER BY o2.idx DESC LIMIT 1) as latest_edit_oid,
      (SELECT MAX(o2.idx) FROM operations o2 
       WHERE o2.filepath = o.filepath 
       AND o2.operation = 'baseline' AND o2.reason = 'init') as latest_init_idx
    FROM operations o
    WHERE o.contributor = ${contributor}
    GROUP BY o.filepath
  `;

  const summaryResult = await db.all<FileSummary>(summaryQuery);

  // Filter for files with pending edits (baseline_oid !== edit_oid)
  const pendingFiles = summaryResult.filter(
    (row) =>
      row.latest_init_idx !== null &&
      row.latest_baseline_oid !== row.latest_edit_oid,
  );

  if (pendingFiles.length === 0) return [];

  // Query 2: Fetch all operations for pending files from their init baseline
  // Build OR conditions: (filepath = X AND idx >= Y) OR (filepath = Z AND idx >= W) ...
  const conditions = pendingFiles.map((file) =>
    and(
      eq(schema.operations.filepath, file.filepath),
      gte(schema.operations.idx, file.latest_init_idx!),
    ),
  );

  // Join with snapshots to get is_external flag
  const rows = await db
    .select({
      idx: schema.operations.idx,
      filepath: schema.operations.filepath,
      operation: schema.operations.operation,
      snapshot_oid: schema.operations.snapshot_oid,
      reason: schema.operations.reason,
      contributor: schema.operations.contributor,
      isExternal: schema.snapshots.is_external,
    })
    .from(schema.operations)
    .leftJoin(
      schema.snapshots,
      eq(schema.operations.snapshot_oid, schema.snapshots.oid),
    )
    .where(or(...conditions))
    .orderBy(schema.operations.filepath, schema.operations.idx)
    .all();

  return rows.map((row) => ({
    idx: row.idx,
    filepath: row.filepath,
    operation: row.operation,
    snapshot_oid: row.snapshot_oid,
    reason: row.reason,
    contributor: row.contributor,
    isExternal: row.isExternal ?? false,
  })) as OperationWithExternal[];
}

/**
 * Like `getPendingOperationsForAgentInstanceId` but scoped to a single
 * filepath. Used by the targeted-update path in `updateDiffKartonState`
 * when a specific file is known to have changed.
 */
export async function getPendingOperationsForAgentInstanceIdAndFilepath(
  db: SnapshotDb,
  agentInstanceId: AgentInstanceId,
  filepath: string,
): Promise<OperationWithExternal[]> {
  const contributor = `agent-${agentInstanceId}` as `agent-${AgentInstanceId}`;

  const summaryQuery = sql`
    SELECT
      o.filepath,
      (SELECT snapshot_oid FROM operations o2
       WHERE o2.filepath = o.filepath AND o2.operation = 'baseline'
       ORDER BY o2.idx DESC LIMIT 1) as latest_baseline_oid,
      (SELECT snapshot_oid FROM operations o2
       WHERE o2.filepath = o.filepath AND o2.operation = 'edit'
       ORDER BY o2.idx DESC LIMIT 1) as latest_edit_oid,
      (SELECT MAX(o2.idx) FROM operations o2
       WHERE o2.filepath = o.filepath
       AND o2.operation = 'baseline' AND o2.reason = 'init') as latest_init_idx
    FROM operations o
    WHERE o.contributor = ${contributor} AND o.filepath = ${filepath}
    GROUP BY o.filepath
  `;

  const summaryResult = await db.all<FileSummary>(summaryQuery);

  const pendingFiles = summaryResult.filter(
    (row) =>
      row.latest_init_idx !== null &&
      row.latest_baseline_oid !== row.latest_edit_oid,
  );

  if (pendingFiles.length === 0) return [];

  const initIdx = pendingFiles[0].latest_init_idx;
  if (initIdx === null) return [];

  const rows = await db
    .select({
      idx: schema.operations.idx,
      filepath: schema.operations.filepath,
      operation: schema.operations.operation,
      snapshot_oid: schema.operations.snapshot_oid,
      reason: schema.operations.reason,
      contributor: schema.operations.contributor,
      isExternal: schema.snapshots.is_external,
    })
    .from(schema.operations)
    .leftJoin(
      schema.snapshots,
      eq(schema.operations.snapshot_oid, schema.snapshots.oid),
    )
    .where(
      and(
        eq(schema.operations.filepath, filepath),
        gte(schema.operations.idx, initIdx),
      ),
    )
    .orderBy(schema.operations.idx)
    .all();

  return rows.map((row) => ({
    idx: row.idx,
    filepath: row.filepath,
    operation: row.operation,
    snapshot_oid: row.snapshot_oid,
    reason: row.reason,
    contributor: row.contributor,
    isExternal: row.isExternal ?? false,
  })) as OperationWithExternal[];
}

/**
 * Get all operations for sessions where an agent participated.
 * Returns operations from all sessions (not just pending) where the agent
 * contributed at least one edit. This is used to compute FilesEditedSummary
 * with contributor blame.
 *
 * A session is defined as the range from an 'init' baseline to the next 'init'
 * baseline (exclusive), or to the latest operation if no next 'init' exists.
 *
 * @param db - Database connection
 * @param agentInstanceId - The agent instance ID to find operations for
 * @returns All operations from sessions where the agent contributed edits
 */
export async function getAllOperationsForAgentInstanceId(
  db: SnapshotDb,
  agentInstanceId: AgentInstanceId,
): Promise<OperationWithExternal[]> {
  const contributor = `agent-${agentInstanceId}` as `agent-${AgentInstanceId}`;

  // Step 1: Find all filepaths where agent-id contributed
  const filepathRows = await db
    .selectDistinct({ filepath: schema.operations.filepath })
    .from(schema.operations)
    .where(eq(schema.operations.contributor, contributor))
    .all();

  if (filepathRows.length === 0) return [];
  const filepaths = filepathRows.map((r) => r.filepath);

  // Step 2: Fetch all operations for those filepaths (with snapshot join)
  const allOps = await db
    .select({
      idx: schema.operations.idx,
      filepath: schema.operations.filepath,
      operation: schema.operations.operation,
      snapshot_oid: schema.operations.snapshot_oid,
      reason: schema.operations.reason,
      contributor: schema.operations.contributor,
      isExternal: schema.snapshots.is_external,
    })
    .from(schema.operations)
    .leftJoin(
      schema.snapshots,
      eq(schema.operations.snapshot_oid, schema.snapshots.oid),
    )
    .where(inArray(schema.operations.filepath, filepaths))
    .orderBy(schema.operations.filepath, schema.operations.idx)
    .all();

  // Step 3: Group operations by filepath
  const opsByFilepath = new Map<string, typeof allOps>();
  for (const op of allOps) {
    const existing = opsByFilepath.get(op.filepath) ?? [];
    existing.push(op);
    opsByFilepath.set(op.filepath, existing);
  }

  // Step 4: For each filepath, identify relevant sessions and collect ops
  const result: OperationWithExternal[] = [];

  for (const [, ops] of opsByFilepath) {
    // Find all init indices (session boundaries)
    const initIndices = ops
      .filter((op) => op.reason === 'init')
      .map((op) => op.idx);

    // Process each session
    for (let i = 0; i < initIndices.length; i++) {
      const sessionStart = initIndices[i];
      const sessionEnd =
        initIndices[i + 1] !== undefined
          ? BigInt(initIndices[i + 1]) - 1n
          : ops[ops.length - 1].idx;

      // Get operations in this session range
      const sessionOps = ops.filter(
        (op) => op.idx >= sessionStart && op.idx <= sessionEnd,
      );

      // Check if agent-id contributed any edit in this session
      const agentContributed = sessionOps.some(
        (op) => op.contributor === contributor && op.operation === 'edit',
      );

      if (agentContributed) {
        // Add all ops from this session to result
        for (const op of sessionOps) {
          result.push({
            idx: op.idx,
            filepath: op.filepath,
            operation: op.operation,
            snapshot_oid: op.snapshot_oid,
            reason: op.reason,
            contributor: op.contributor,
            isExternal: op.isExternal ?? false,
          } as OperationWithExternal);
        }
      }
    }
  }

  return result;
}

/**
 * Like `getAllOperationsForAgentInstanceId` but scoped to a single filepath.
 * Returns session-filtered operations where the agent contributed at least
 * one edit. Used by the targeted-update path when a specific file changed.
 */
export async function getAllOperationsForAgentInstanceIdAndFilepath(
  db: SnapshotDb,
  agentInstanceId: AgentInstanceId,
  filepath: string,
): Promise<OperationWithExternal[]> {
  const contributor = `agent-${agentInstanceId}` as `agent-${AgentInstanceId}`;

  // Quick check: did the agent contribute to this filepath at all?
  const hasContribution = await db
    .select({ idx: schema.operations.idx })
    .from(schema.operations)
    .where(
      and(
        eq(schema.operations.filepath, filepath),
        eq(schema.operations.contributor, contributor),
      ),
    )
    .limit(1)
    .all();
  if (hasContribution.length === 0) return [];

  // Fetch all ops for the filepath (with snapshot join).
  const allOps = await db
    .select({
      idx: schema.operations.idx,
      filepath: schema.operations.filepath,
      operation: schema.operations.operation,
      snapshot_oid: schema.operations.snapshot_oid,
      reason: schema.operations.reason,
      contributor: schema.operations.contributor,
      isExternal: schema.snapshots.is_external,
    })
    .from(schema.operations)
    .leftJoin(
      schema.snapshots,
      eq(schema.operations.snapshot_oid, schema.snapshots.oid),
    )
    .where(eq(schema.operations.filepath, filepath))
    .orderBy(schema.operations.idx)
    .all();

  if (allOps.length === 0) return [];

  // Apply the same session-inclusion logic as the bulk variant.
  const initIndices = allOps
    .filter((op) => op.reason === 'init')
    .map((op) => op.idx);

  const result: OperationWithExternal[] = [];
  for (let i = 0; i < initIndices.length; i++) {
    const sessionStart = initIndices[i];
    const sessionEnd =
      initIndices[i + 1] !== undefined
        ? BigInt(initIndices[i + 1]) - 1n
        : allOps[allOps.length - 1].idx;
    const sessionOps = allOps.filter(
      (op) => op.idx >= sessionStart && op.idx <= sessionEnd,
    );
    const agentContributed = sessionOps.some(
      (op) => op.contributor === contributor && op.operation === 'edit',
    );
    if (agentContributed) {
      for (const op of sessionOps) {
        result.push({
          idx: op.idx,
          filepath: op.filepath,
          operation: op.operation,
          snapshot_oid: op.snapshot_oid,
          reason: op.reason,
          contributor: op.contributor,
          isExternal: op.isExternal ?? false,
        } as OperationWithExternal);
      }
    }
  }
  return result;
}

/**
 * Get the latest operation for a filepath.
 * Includes isExternal flag from joined snapshot.
 */
export async function getLatestOperation(
  db: SnapshotDb,
  filepath: string,
): Promise<OperationWithExternal | null> {
  const row = await db
    .select({
      idx: schema.operations.idx,
      filepath: schema.operations.filepath,
      operation: schema.operations.operation,
      snapshot_oid: schema.operations.snapshot_oid,
      reason: schema.operations.reason,
      contributor: schema.operations.contributor,
      isExternal: schema.snapshots.is_external,
    })
    .from(schema.operations)
    .leftJoin(
      schema.snapshots,
      eq(schema.operations.snapshot_oid, schema.snapshots.oid),
    )
    .where(eq(schema.operations.filepath, filepath))
    .orderBy(desc(schema.operations.idx))
    .limit(1)
    .get();

  if (!row) return null;

  return {
    idx: row.idx,
    filepath: row.filepath,
    operation: row.operation,
    snapshot_oid: row.snapshot_oid,
    reason: row.reason,
    contributor: row.contributor,
    isExternal: row.isExternal ?? false,
  } as OperationWithExternal;
}

/**
 * Get operation at a specific index for a filepath.
 * Includes isExternal flag from joined snapshot.
 */
export async function getOperationAt(
  db: SnapshotDb,
  filepath: string,
  idx: number,
): Promise<OperationWithExternal | null> {
  const row = await db
    .select({
      idx: schema.operations.idx,
      filepath: schema.operations.filepath,
      operation: schema.operations.operation,
      snapshot_oid: schema.operations.snapshot_oid,
      reason: schema.operations.reason,
      contributor: schema.operations.contributor,
      isExternal: schema.snapshots.is_external,
    })
    .from(schema.operations)
    .leftJoin(
      schema.snapshots,
      eq(schema.operations.snapshot_oid, schema.snapshots.oid),
    )
    .where(
      and(
        eq(schema.operations.filepath, filepath),
        eq(schema.operations.idx, idx),
      ),
    )
    .get();

  if (!row) return null;

  return {
    idx: row.idx,
    filepath: row.filepath,
    operation: row.operation,
    snapshot_oid: row.snapshot_oid,
    reason: row.reason,
    contributor: row.contributor,
    isExternal: row.isExternal ?? false,
  } as OperationWithExternal;
}

/**
 * Get all operations for a filepath, ordered by idx ascending.
 * Includes isExternal flag from joined snapshot.
 */
export async function getOperationHistory(
  db: SnapshotDb,
  filepath: string,
): Promise<OperationWithExternal[]> {
  const rows = await db
    .select({
      idx: schema.operations.idx,
      filepath: schema.operations.filepath,
      operation: schema.operations.operation,
      snapshot_oid: schema.operations.snapshot_oid,
      reason: schema.operations.reason,
      contributor: schema.operations.contributor,
      isExternal: schema.snapshots.is_external,
    })
    .from(schema.operations)
    .leftJoin(
      schema.snapshots,
      eq(schema.operations.snapshot_oid, schema.snapshots.oid),
    )
    .where(eq(schema.operations.filepath, filepath))
    .orderBy(schema.operations.idx)
    .all();

  return rows.map((row) => ({
    idx: row.idx,
    filepath: row.filepath,
    operation: row.operation,
    snapshot_oid: row.snapshot_oid,
    reason: row.reason,
    contributor: row.contributor,
    isExternal: row.isExternal ?? false,
  })) as OperationWithExternal[];
}

/**
 * Insert a new operation.
 * idx is auto-generated by SQLite AUTOINCREMENT.
 */
export async function insertOperation(
  db: SnapshotDb,
  filepath: string,
  snapshotOid: string | null,
  meta: OperationMeta,
) {
  return db
    .insert(schema.operations)
    .values({
      filepath,
      snapshot_oid: snapshotOid,
      operation: meta.operation,
      reason: meta.reason,
      contributor: meta.contributor,
    })
    .run();
}

/**
 * Copies a block of operations for a filepath from the init baseline (inclusive)
 * up to the target idx (inclusive).
 * This is the "revert/undo" functionality - it restores the full session context
 * (starting from init baseline) up to the target operation.
 *
 * Finding the init baseline (rather than any baseline) ensures that:
 * 1. Edit summaries work correctly (they look for ops from init baseline)
 * 2. Pending edits detection works correctly (checks for latest_init_idx)
 * 3. Session semantics are preserved (sessions always start with init baseline)
 *
 * @param db - Database connection
 * @param filepath - The file path to revert operations for
 * @param targetIdx - The idx of the target operation to restore to
 * @returns The target operation (for writing to disk), or null if no init baseline found
 */
export async function copyOperationsUpToInitBaseline(
  db: SnapshotDb,
  filepath: string,
  targetIdx: number,
): Promise<OperationWithExternal | null> {
  // Query 1: Find the most recent INIT baseline at or before the target idx
  const baselineResults = await db
    .select({ idx: schema.operations.idx })
    .from(schema.operations)
    .where(
      and(
        eq(schema.operations.filepath, filepath),
        eq(schema.operations.operation, 'baseline'),
        eq(schema.operations.reason, 'init'),
        sql`${schema.operations.idx} <= ${targetIdx}`,
      ),
    )
    .orderBy(desc(schema.operations.idx))
    .limit(1)
    .all();

  if (baselineResults.length === 0) {
    // No init baseline found at or before target - cannot copy
    return null;
  }

  const baseline_idx = baselineResults[0].idx;

  // Query 2: INSERT ... SELECT to copy the operations block (idx auto-generated)
  await db.run(sql`
    INSERT INTO operations (filepath, operation, snapshot_oid, reason, contributor)
    SELECT 
      filepath,
      operation,
      snapshot_oid,
      reason,
      contributor
    FROM operations 
    WHERE filepath = ${filepath} AND idx >= ${baseline_idx} AND idx <= ${targetIdx}
    ORDER BY idx
  `);

  // Get the target operation (for writing to disk)
  const targetOp = await getOperationAt(db, filepath, targetIdx);
  return targetOp;
}

type FilePath = string;

/**
 * Get the undo target operation for each filepath that was modified by any of the given tool-call IDs.
 * Used by undoToolCalls to determine which files need to be restored and to what state.
 *
 * For each file that was modified by any of the given tool-calls, this returns the operation
 * **immediately before** the earliest tool-call modification. This is the "undo target" - the
 * state the file should be restored to when undoing those tool-calls.
 *
 * The returned operation could be:
 * - An 'init' baseline (if tool-call was the first edit after session start)
 * - A 'user-save' edit (if user saved after previous tool-call)
 * - An 'accept' baseline (if user accepted edits before this tool-call)
 * - A 'reject' edit (if user rejected edits before this tool-call)
 * - Another tool-call edit (from a different agent/session not being undone)
 *
 * @param db - Database connection
 * @param toolcallIds - Array of tool-call IDs to undo
 * @returns Record mapping filepath to the operation to restore to (the state before the tool-calls)
 */
export async function getUndoTargetForToolCallsByFilePath(
  db: SnapshotDb,
  toolcallIds: ToolCallId[],
  agentInstanceId?: string,
): Promise<Record<FilePath, OperationWithExternal>> {
  if (toolcallIds.length === 0) return {};

  // Build reason patterns: 'tool-id1', 'tool-id2', etc.
  const reasons = toolcallIds.map((id) => `tool-${id}` as `tool-${ToolCallId}`);

  // Step 1: Find the earliest tool-call operation for each file
  // Query all operations matching these tool-call reasons, joined with snapshots for isExternal
  // Ordered by filepath then idx so we can easily pick the earliest per file
  const toolCallRows = await db
    .select({
      idx: schema.operations.idx,
      filepath: schema.operations.filepath,
    })
    .from(schema.operations)
    .where(
      and(
        agentInstanceId
          ? eq(schema.operations.contributor, `agent-${agentInstanceId}`)
          : undefined,
        inArray(schema.operations.reason, reasons),
      ),
    )
    .orderBy(schema.operations.filepath, schema.operations.idx)
    .all();

  // Group by filepath and keep only the earliest (first) idx per file
  const earliestIdxPerFile: Record<FilePath, number> = {};
  for (const row of toolCallRows)
    if (earliestIdxPerFile[row.filepath] === undefined)
      earliestIdxPerFile[row.filepath] = row.idx;

  if (Object.keys(earliestIdxPerFile).length === 0) return {};

  // Step 2: For each file, find the operation immediately BEFORE the earliest tool-call
  // This is the "undo target" - the state we want to restore to
  const result: Record<FilePath, OperationWithExternal> = {};

  for (const [filepath, earliestToolCallIdx] of Object.entries(
    earliestIdxPerFile,
  )) {
    // Find the operation with the highest idx that is less than earliestToolCallIdx
    const beforeOp = await db
      .select({
        idx: schema.operations.idx,
        filepath: schema.operations.filepath,
        operation: schema.operations.operation,
        snapshot_oid: schema.operations.snapshot_oid,
        reason: schema.operations.reason,
        contributor: schema.operations.contributor,
        isExternal: schema.snapshots.is_external,
      })
      .from(schema.operations)
      .leftJoin(
        schema.snapshots,
        eq(schema.operations.snapshot_oid, schema.snapshots.oid),
      )
      .where(
        and(
          eq(schema.operations.filepath, filepath),
          sql`${schema.operations.idx} < ${earliestToolCallIdx}`,
        ),
      )
      .orderBy(desc(schema.operations.idx))
      .limit(1)
      .get();

    if (beforeOp) {
      result[filepath] = {
        idx: beforeOp.idx,
        filepath: beforeOp.filepath,
        operation: beforeOp.operation,
        snapshot_oid: beforeOp.snapshot_oid,
        reason: beforeOp.reason,
        contributor: beforeOp.contributor,
        isExternal: beforeOp.isExternal ?? false,
      } as OperationWithExternal;
    }
    // If no operation exists before the tool-call, skip this file
    // (this shouldn't happen per the spec - tool-calls always follow an init baseline)
  }

  return result;
}

/**
 * Store new file content with reverse-delta compression.
 * Optionally inserts an operation with meta into the ops table.
 * Returns the oid of the stored content.
 */
export async function storeFileContent(
  db: SnapshotDb,
  filepath: string,
  content: Buffer,
  meta?: OperationMeta,
): Promise<string> {
  const newOid = computeOid(content);

  // Get current latest for this filepath (for delta compression)
  const latestOp = await getLatestOperation(db, filepath);

  // Check if this exact content already exists
  if (!(await snapshotExists(db, newOid))) {
    if (latestOp?.snapshot_oid) {
      // Try to convert previous keyframe to delta (skip if previous is external)
      const previousContent = await retrieveContentForOid(
        db,
        latestOp.snapshot_oid,
      );
      if (previousContent) {
        // fossil-delta accepts Uint8Array (which Buffer extends) and returns the same type
        const delta = Buffer.from(
          fossilDelta.createDelta(content, previousContent),
        );

        // Previous becomes delta pointing to new
        convertKeyframeToDelta(db, latestOp.snapshot_oid, newOid, delta);
      }
      // If previous was external, we skip delta conversion - both remain keyframes
    }

    // New content becomes keyframe
    insertKeyframe(db, newOid, content);
  }

  // Record operation (idx auto-generated)
  if (meta) insertOperation(db, filepath, newOid, meta);

  return newOid;
}

/**
 * Store large file content using LFS (Large File Storage).
 * Streams content to disk blob store instead of SQLite.
 * Returns the oid of the stored content.
 *
 * @param db - Database connection
 * @param blobsDir - Directory for storing blob files
 * @param source - Async iterable of content chunks (e.g., from createReadStream)
 * @param filepath - Logical file path for operation tracking
 * @param meta - Operation metadata
 */
export async function storeLargeContent(
  db: SnapshotDb,
  blobsDir: string,
  source: AsyncIterable<Buffer>,
  filepath: string,
  meta: OperationMeta,
): Promise<string> {
  // Ensure blobs directory exists
  await mkdir(blobsDir, { recursive: true });

  const tempPath = path.join(blobsDir, `temp-${randomUUID()}`);
  const hash = createHash('sha256');
  const writeStream = createWriteStream(tempPath);

  // Single pass: hash while writing to temp file
  for await (const chunk of source) {
    hash.update(chunk);
    writeStream.write(chunk);
  }
  writeStream.end();

  // Wait for write to complete
  await new Promise<void>((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  const oid = hash.digest('hex');
  const blobPath = path.join(blobsDir, oid);

  // Atomic rename (overwrites if exists = dedup)
  await rename(tempPath, blobPath);

  // Check if snapshot record exists
  if (!(await snapshotExists(db, oid))) {
    // Insert external snapshot record (empty payload, is_external=true)
    insertKeyframe(db, oid, Buffer.alloc(0), true);
  }

  // Record operation (idx auto-generated)
  insertOperation(db, filepath, oid, meta);

  return oid;
}

/**
 * Stream content from an external (LFS) blob.
 * Use this for memory-efficient retrieval of large files.
 *
 * @param blobsDir - Directory containing blob files
 * @param oid - Content oid to retrieve
 */
export async function* streamContent(
  blobsDir: string,
  oid: string,
): AsyncGenerator<Buffer> {
  const blobPath = path.join(blobsDir, oid);
  const stream = createReadStream(blobPath);

  for await (const chunk of stream) {
    yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  }
}

/**
 * Copy content from an external (LFS) blob directly to a destination path.
 * Use this for reverting deletions of large files - never loads full content into memory.
 *
 * @param blobsDir - Directory containing blob files
 * @param oid - Content oid to copy
 * @param destPath - Destination file path
 */
export async function copyContentToPath(
  blobsDir: string,
  oid: string,
  destPath: string,
): Promise<void> {
  const blobPath = path.join(blobsDir, oid);
  const readStream = createReadStream(blobPath);
  const writeStream = createWriteStream(destPath);

  await pipeline(readStream, writeStream);
}

/**
 * Check if a file has pending edits (uncommitted agent changes).
 *
 * A file has pending edits when:
 * 1. The latest baseline snapshot differs from the latest edit snapshot
 *
 * Used by registerAgentEdit to determine if an 'init' baseline operation
 * needs to be inserted before recording the edit.
 *
 * @param db - Database connection
 * @param filepath - Absolute path to check
 * @returns true if file has pending edits, false otherwise
 */
export async function hasPendingEditsForFilepath(
  db: SnapshotDb,
  filepath: string,
): Promise<boolean> {
  const summaryQuery = sql`
    SELECT 
      (SELECT snapshot_oid FROM operations o2 
       WHERE o2.filepath = ${filepath} AND o2.operation = 'baseline' 
       ORDER BY o2.idx DESC LIMIT 1) as latest_baseline_oid,
      (SELECT snapshot_oid FROM operations o2 
       WHERE o2.filepath = ${filepath} AND o2.operation = 'edit' 
       ORDER BY o2.idx DESC LIMIT 1) as latest_edit_oid
  `;

  const result = await db.get<{
    latest_baseline_oid: string | null;
    latest_edit_oid: string | null;
  }>(summaryQuery);

  // No result → no pending edits (file not tracked yet)
  if (!result) return false;

  // Has init baseline, check if baseline differs from latest edit
  return result.latest_baseline_oid !== result.latest_edit_oid;
}

/**
 * Get all pending operations across all files in the system.
 * Pending edit operations for a file are defined as operations where
 * the latest baseline snapshot_oid differs from the latest edit snapshot_oid.
 *
 * Unlike getPendingOperationsForAgentInstanceId, this function returns pending
 * operations for ALL files regardless of which agent contributed.
 *
 * Returns all operations from the latest 'init' baseline to the latest operation
 * for each file that has pending edits. Includes isExternal flag from joined snapshot.
 */
export async function getAllPendingOperations(
  db: SnapshotDb,
): Promise<OperationWithExternal[]> {
  // Query 1: Get summary per filepath using raw SQL with correlated subqueries
  // This returns: filepath, latest_baseline_oid, latest_edit_oid, latest_init_idx
  // No contributor filter - we want ALL files with pending edits
  const summaryQuery = sql`
    SELECT 
      filepath,
      (SELECT snapshot_oid FROM operations o2 
       WHERE o2.filepath = operations.filepath AND o2.operation = 'baseline' 
       ORDER BY o2.idx DESC LIMIT 1) as latest_baseline_oid,
      (SELECT snapshot_oid FROM operations o2 
       WHERE o2.filepath = operations.filepath AND o2.operation = 'edit' 
       ORDER BY o2.idx DESC LIMIT 1) as latest_edit_oid,
      (SELECT MAX(o2.idx) FROM operations o2 
       WHERE o2.filepath = operations.filepath 
       AND o2.operation = 'baseline' AND o2.reason = 'init') as latest_init_idx
    FROM operations
    GROUP BY filepath
  `;

  const summaryResult = await db.all<FileSummary>(summaryQuery);

  // Filter for files with pending edits (baseline_oid !== edit_oid)
  const pendingFiles = summaryResult.filter(
    (row) =>
      row.latest_init_idx !== null &&
      row.latest_baseline_oid !== row.latest_edit_oid,
  );

  if (pendingFiles.length === 0) return [];

  // Query 2: Fetch all operations for pending files from their init baseline
  // Build OR conditions: (filepath = X AND idx >= Y) OR (filepath = Z AND idx >= W) ...
  const conditions = pendingFiles.map((file) =>
    and(
      eq(schema.operations.filepath, file.filepath),
      gte(schema.operations.idx, file.latest_init_idx!),
    ),
  );

  // Join with snapshots to get is_external flag
  const rows = await db
    .select({
      idx: schema.operations.idx,
      filepath: schema.operations.filepath,
      operation: schema.operations.operation,
      snapshot_oid: schema.operations.snapshot_oid,
      reason: schema.operations.reason,
      contributor: schema.operations.contributor,
      isExternal: schema.snapshots.is_external,
    })
    .from(schema.operations)
    .leftJoin(
      schema.snapshots,
      eq(schema.operations.snapshot_oid, schema.snapshots.oid),
    )
    .where(or(...conditions))
    .orderBy(schema.operations.filepath, schema.operations.idx)
    .all();

  return rows.map((row) => ({
    idx: row.idx,
    filepath: row.filepath,
    operation: row.operation,
    snapshot_oid: row.snapshot_oid,
    reason: row.reason,
    contributor: row.contributor,
    isExternal: row.isExternal ?? false,
  })) as OperationWithExternal[];
}

/**
 * Get all unique filepaths that have operations.
 */
export async function getAllFilepaths(db: SnapshotDb): Promise<string[]> {
  const rows = await db
    .selectDistinct({ filepath: schema.operations.filepath })
    .from(schema.operations)
    .all();

  return rows.map((r) => r.filepath);
}

/**
 * Delete all operations and orphaned snapshots for a filepath.
 */
export function deleteFileHistory(db: SnapshotDb, filepath: string): void {
  db.delete(schema.operations)
    .where(eq(schema.operations.filepath, filepath))
    .run();
}

/**
 * Returns a Map<filepath, maxIdx> for the given set of filepaths.
 * Used as the self-invalidating cache key in the diff-history output cache:
 * a newer max idx for a filepath strictly means the cached FileDiff is stale
 * (the operations table is append-only).
 */
export async function getLatestOperationIdxPerFilepath(
  db: SnapshotDb,
  filepaths: string[],
): Promise<Map<string, number>> {
  if (filepaths.length === 0) return new Map();
  const result = new Map<string, number>();
  // SQLite variable limit is 999; chunk at 500 for safety.
  for (let i = 0; i < filepaths.length; i += 500) {
    const chunk = filepaths.slice(i, i + 500);
    const rows = await db
      .select({
        filepath: schema.operations.filepath,
        maxIdx: sql<number>`MAX(${schema.operations.idx})`.as('maxIdx'),
      })
      .from(schema.operations)
      .where(inArray(schema.operations.filepath, chunk))
      .groupBy(schema.operations.filepath);
    for (const row of rows) result.set(row.filepath, Number(row.maxIdx));
  }
  return result;
}

/**
 * Returns the agent-instance-ids of agents that have any operations for the
 * given filepath. Used to scope chokidar file-change events to only the
 * hydrated agents affected by that file.
 */
export async function getAgentInstanceIdsWithOperationsForFilepath(
  db: SnapshotDb,
  filepath: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ contributor: schema.operations.contributor })
    .from(schema.operations)
    .where(
      and(
        eq(schema.operations.filepath, filepath),
        sql`${schema.operations.contributor} LIKE 'agent-%'`,
      ),
    );
  return rows.map((r) => r.contributor.replace(/^agent-/, ''));
}
