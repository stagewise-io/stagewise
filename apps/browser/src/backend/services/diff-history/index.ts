import { DisposableService } from '@/services/disposable';
import type { FileResult } from '@shared/karton-contracts/ui/shared-types';
import { isBinaryFile } from 'isbinaryfile';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { type Client, createClient } from '@libsql/client';
import * as schema from './schema';
import chokidar, { type FSWatcher } from 'chokidar';
import { LRUMap } from './utils/lru-map';
import type { Logger } from '@/services/logger';
import type { TelemetryService } from '@/services/telemetry';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { KartonService } from '@/services/karton';
import {
  HARDCODED_DENY_SEGMENTS,
  loadWorkspaceIgnore,
  type WorkspaceIgnoreMatcher,
} from '@/utils/load-gitignore';
import { pickOwningWorkspace } from '@/utils/workspace-resolution';
import {
  getDiffHistoryDbPath,
  getDiffHistoryBlobsDir,
  getAgentAppsDir,
  getPlansDir,
  getLogsDir,
} from '@/utils/paths';
import {
  type FileDiff,
  MAX_DIFF_TEXT_FILE_SIZE,
} from '@shared/karton-contracts/ui/shared-types';
import {
  getAllOperationsForAgentInstanceId,
  getAllOperationsForAgentInstanceIdAndFilepath,
  getAllPendingOperations,
  getPendingOperationsForAgentInstanceId,
  getPendingOperationsForAgentInstanceIdAndFilepath,
  insertOperation,
  copyContentToPath,
  retrieveContentsForOids,
  retrieveContentForOid,
  copyOperationsUpToInitBaseline,
  getUndoTargetForToolCallsByFilePath,
  storeFileContent,
  storeLargeContent,
  hasPendingEditsForFilepath,
  streamContent,
  getLatestOperationIdxPerFilepath,
  getAgentInstanceIdsWithOperationsForFilepath,
} from './utils/db';
import {
  acceptAndRejectHunks as acceptAndRejectHunksUtils,
  buildContributorMap,
  buildContributorMapIncremental,
  type ContributorMapState,
  type ContributorMaps,
  createFileDiffsFromGenerations,
  type OperationWithContent,
  segmentFileOperationsIntoGenerations,
} from './utils/diff';
import type { Operation, OperationMeta } from './schema';
import type { OperationWithExternal } from './utils/db';
import { createReadStream } from 'node:fs';
import { migrateDatabase } from '@/utils/migrate-database';
import { registry, schemaVersion } from './migrations';
import initSql from './schema.sql?raw';

type AgentFileEdit = {
  agentInstanceId: string;
  path: string;
  toolCallId: string;
  /**
   * Absolute path of the mounted workspace that owns `path`, when the
   * caller already knows it. Used as the fast-path for the gitignore
   * check in `registerAgentEdit`. Optional — when omitted, the service
   * walks up against its known mount set.
   */
  workspaceRoot?: string | null;
} & (
  | {
      isExternal: false;
      contentBefore: string | null;
      contentAfter: string | null;
    }
  | {
      isExternal: true;
      tempPathToBeforeContent: string | null;
      tempPathToAfterContent: string | null;
    }
);

/**
 * Coarse category of a filesystem path used as the telemetry-safe
 * replacement for the raw `first_dropped_path` we used to ship in the
 * `diff-history-fanout-cap-hit` event. Categories are intentionally
 * chunky so the payload cannot leak usernames, repo names, or
 * directory structure while still providing useful analytics signal
 * (e.g. "90% of cap hits happen under node_modules").
 */
export type FanoutPathCategory =
  | 'node_modules'
  | 'build-output'
  | 'tooling-cache'
  | 'dotfile'
  | 'other';

const FANOUT_BUILD_OUTPUT_SEGMENTS: ReadonlySet<string> = new Set([
  'dist',
  'build',
  'out',
  '.output',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.astro',
]);

const FANOUT_TOOLING_CACHE_SEGMENTS: ReadonlySet<string> = new Set([
  '.turbo',
  '.cache',
  '.parcel-cache',
  '.vite',
  '.angular',
  '.gradle',
  'coverage',
]);

/**
 * Maps an absolute filesystem path to a coarse category for telemetry.
 *
 * Precedence is top-down: a match in a higher row wins even if lower
 * rows would also match. `node_modules` deliberately outranks
 * `dotfile` so that e.g. `node_modules/.bin/foo` still reports as
 * `node_modules`.
 *
 * Never returns the path itself — that is the whole point.
 */
export function categorizeFanoutPath(filepath: string): FanoutPathCategory {
  const segments = filepath.split(path.sep);
  if (segments.includes('node_modules')) return 'node_modules';
  for (const seg of segments) {
    if (FANOUT_BUILD_OUTPUT_SEGMENTS.has(seg)) return 'build-output';
    if (FANOUT_TOOLING_CACHE_SEGMENTS.has(seg)) return 'tooling-cache';
  }
  const basename = segments[segments.length - 1] ?? '';
  if (basename.startsWith('.')) return 'dotfile';
  return 'other';
}

export class DiffHistoryService extends DisposableService {
  private readonly logger: Logger;
  private readonly uiKarton: KartonService;
  private readonly telemetryService: TelemetryService;
  private watcher: FSWatcher | null = null;
  private filesIgnoredByWatcher: Set<string> = new Set();
  private currentlyWatchedFiles: Set<string> = new Set();
  private dbDriver: Client;
  private db: LibSQLDatabase<typeof schema>;
  private hydratedAgentInstanceIds = new Set<string>();
  private blobsDir: string;
  private readonly boundOnStateChange: () => void;

  /**
   * Per-file diff output cache, keyed by `${agentId}::${filepath}::${mode}`.
   * Entries self-invalidate via `latestIdx` comparison against the ops table
   * (append-only, so a newer idx strictly means staleness). Cleared on agent
   * removal (pruneRemovedAgentInstances) and teardown.
   */
  private fileDiffCache = new Map<
    string,
    { latestIdx: number; diff: FileDiff }
  >();

  /**
   * Intermediate contributor-map state cache. Key format:
   *   `${agentId}::${filepath}::${mode}::${firstOpIdx}`
   *
   * Value holds the `ContributorMapState` after processing all operations
   * up to and including `latestOpIdx`. Subsequent calls can resume from
   * this state and replay only operations whose `idx > latestOpIdx`,
   * turning the ~O(N-history-length) `buildContributorMap` rebuild into
   * an O(new_ops) extension.
   *
   * The `firstOpIdx` is part of the key so that pending-mode trimming
   * (which can shift the starting baseline after an accept) does not
   * reuse a stale state from the pre-trim sequence.
   */
  private contributorStateCache = new Map<
    string,
    { latestOpIdx: number; state: ContributorMapState }
  >();

  /**
   * Decompressed snapshot content cache, keyed by OID (SHA-256 hash).
   * OIDs are content-addressed and immutable — once stored, the mapping
   * never changes, so no invalidation is needed. Cleared only on teardown
   * to bound memory across the service lifetime.
   */
  private oidContentCache = new LRUMap<string, string>(4096);

  /**
   * Monotonically increasing counter bumped on every operations-table
   * mutation. Used by `updateDiffKartonState` to skip DB queries when
   * the table has not changed since the last computation for a given agent.
   */
  private _opsSeq = 0;

  /**
   * Per-agent snapshot of the last `updateDiffKartonState` result, keyed
   * by `agentInstanceId`. Entries are valid while `opsSeq` matches
   * `this._opsSeq`. Cleared on agent removal and teardown.
   */
  private _agentDiffSnapshot = new Map<
    string,
    {
      opsSeq: number;
      pendingFileDiffs: FileDiff[];
      editSummary: FileDiff[];
    }
  >();

  /**
   * Maximum number of file edits a single tool call may register in the
   * ops table. Edits past this threshold are dropped on the floor — the
   * tool's on-disk write has already succeeded; we just refuse to track
   * it so a single rogue tool call cannot flood the diff store with
   * thousands of entries.
   *
   * 50 is comfortably above any realistic hand-authored multi-file edit
   * and well below the ~hundreds-of-files threshold at which the pending
   * diff computation becomes UI-blocking.
   */
  private readonly MAX_EDITS_PER_TOOL_CALL = 50;

  /**
   * Memory-safety cap on `_toolCallEditCounts` / `_toolCallTruncatedWarned`
   * size. These maps are keyed by `toolCallId` and have no natural
   * expiry (a tool call completes in seconds but we never know when
   * its last edit arrived). Rather than wire GC plumbing for what are
   * tiny integer entries, we reset both maps when the count map
   * crosses this threshold. Worst case: a previously-capped tool call
   * could register 50 more edits after a reset — acceptable, and
   * exceedingly unlikely in practice because tool calls are short-lived.
   */
  private static readonly MAX_TRACKED_TOOL_CALLS = 10_000;

  /** Per-tool-call running count of registered edits. */
  private _toolCallEditCounts = new Map<string, number>();

  /**
   * Tool-call IDs for which we have already emitted the one-shot
   * "exceeded fan-out cap" warning. Prevents log/telemetry spam.
   */
  private _toolCallTruncatedWarned = new Set<string>();

  /**
   * Cache of `WorkspaceIgnoreMatcher` instances keyed by absolute
   * workspace root. The matcher holds one `Ignore` instance per
   * `.gitignore` file found under the workspace so the check honors
   * git's nested-`.gitignore` semantics. Entries expire after
   * `IGNORE_TTL_MS` so edits to any `.gitignore` in the tree are
   * eventually picked up without the complexity of a dedicated
   * per-file watcher.
   */
  private _ignoreCache = new Map<
    string,
    { matcher: WorkspaceIgnoreMatcher; expiresAt: number }
  >();
  private static readonly IGNORE_TTL_MS = 30_000;

  /**
   * Injected via `setMountPathsResolver` after construction (to avoid
   * a circular dep with ToolboxService / MountManagerService at
   * DiffHistoryService.create() time). Returns the current set of
   * absolute workspace root paths. Used to resolve the owning workspace
   * of a filepath when the caller did not provide it explicitly.
   */
  private _mountPathsResolver: (() => Set<string>) | null = null;

  private cacheKey(
    agentId: string,
    filepath: string,
    mode: 'pending' | 'summary',
  ): string {
    return `${agentId}::${filepath}::${mode}`;
  }

  private constructor(
    logger: Logger,
    uiKarton: KartonService,
    telemetryService: TelemetryService,
  ) {
    super();
    this.logger = logger;
    this.uiKarton = uiKarton;
    this.telemetryService = telemetryService;
    const dbPath = getDiffHistoryDbPath();
    this.dbDriver = createClient({ url: `file:${dbPath}`, intMode: 'bigint' });
    this.db = drizzle(this.dbDriver, { schema });
    this.blobsDir = getDiffHistoryBlobsDir();
    this.boundOnStateChange = this.onKartonStateChange.bind(this);
  }

  public static async create(
    logger: Logger,
    uiKarton: KartonService,
    telemetryService: TelemetryService,
  ): Promise<DiffHistoryService> {
    const instance = new DiffHistoryService(logger, uiKarton, telemetryService);
    await instance.initialize();
    logger.debug('[DiffHistoryService] Created service');
    return instance;
  }
  private async initialize(): Promise<void> {
    // Run database migrations
    try {
      await migrateDatabase({
        db: this.db,
        client: this.dbDriver,
        registry,
        initSql,
        schemaVersion,
      });
      this.logDebug('Database migrated successfully');
    } catch (error) {
      this.logError('Failed to migrate database', error);
      throw error;
    }

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.acceptHunks',
      async (_callingClientId: string, hunkIds: string[]) => {
        await this.acceptAndRejectHunks(hunkIds, []);
        this.telemetryService.capture('edits-accepted', {
          hunk_count: hunkIds.length,
        });
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'toolbox.rejectHunks',
      async (_callingClientId: string, hunkIds: string[]) => {
        await this.acceptAndRejectHunks([], hunkIds);
        this.telemetryService.capture('edits-rejected', {
          hunk_count: hunkIds.length,
        });
      },
    );

    const storeFileAndAddOperation = async (
      path: string,
      meta: OperationMeta,
    ) => {
      const stats = await fs.stat(path);
      let isExternal = false;
      // If file is too large, do **not** create a buffer and store as external
      if (stats.size > MAX_DIFF_TEXT_FILE_SIZE)
        return await this.storeExternalFile(path, meta);

      const fileContent = await fs.readFile(path, 'utf8');
      const bufferContent = Buffer.from(fileContent, 'utf8');
      if (await isBinaryFile(bufferContent)) isExternal = true;

      if (!isExternal)
        await storeFileContent(this.db, path, bufferContent, meta);
      else await this.storeExternalFile(path, meta);
    };

    this.watcher = chokidar
      .watch([], {
        persistent: true,
        atomic: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 150,
          pollInterval: 50,
        },
      })
      .on('change', async (path) => {
        if (this.filesIgnoredByWatcher.has(path)) return;
        // NOTE: we deliberately do NOT re-run `shouldTrackFilepath`
        // here. Every path in the watch set was approved by the
        // gitignore guard at `registerAgentEdit` time, so a change
        // to `.gitignore` after the fact (or a newly added nested
        // mount) must not silently suppress the user-save op for a
        // file that still has pending ops — doing so would leave
        // a stale current snapshot that never self-heals and could
        // clobber user changes on Accept.
        try {
          await storeFileAndAddOperation(path, {
            operation: 'edit',
            contributor: 'user',
            reason: 'user-save',
          });
        } catch (error) {
          this.logError(`Failed to read file: ${path}`, error);
          return;
        }
        this.logDebug(`File changed: ${path}`);
        this._opsSeq++;
        await this.updateAgentsAffectedByFilepath(path);
      })
      .on('unlink', async (path) => {
        // Same rationale as the `change` handler above: re-running
        // the gitignore filter here would cause silent data loss
        // for files that were legitimately tracked but later fell
        // into an ignored path.
        if (this.filesIgnoredByWatcher.has(path)) return;
        await insertOperation(this.db, path, null, {
          operation: 'edit',
          contributor: 'user',
          reason: 'user-save',
        });
        this.logDebug(`File unlinked: ${path}`);
        this._opsSeq++;
        await this.updateAgentsAffectedByFilepath(path);
      });

    this.uiKarton.registerStateChangeCallback(this.boundOnStateChange);
    // Hydrate any agent instances already present in karton state
    this.hydrateNewAgentInstances();
  }

  private hydrateNewAgentInstances(): void {
    const currentIds = Object.keys(this.uiKarton.state.agents.instances);
    for (const id of currentIds) {
      if (this.hydratedAgentInstanceIds.has(id)) continue;
      this.hydratedAgentInstanceIds.add(id);
      this.updateDiffKartonState(id)
        .then((result) => {
          for (const diff of result.pendingFileDiffs) {
            this.ensureWatched(diff.path);
          }
        })
        .catch((error) => {
          this.logError(
            `Failed to hydrate diff state for agent instance ${id}`,
            error,
          );
        });
    }
  }

  private onKartonStateChange(): void {
    this.hydrateNewAgentInstances();
    this.pruneRemovedAgentInstances();
  }

  private pruneRemovedAgentInstances(): void {
    const currentIds = new Set(
      Object.keys(this.uiKarton.state.agents.instances),
    );
    for (const id of this.hydratedAgentInstanceIds) {
      if (!currentIds.has(id)) {
        this.hydratedAgentInstanceIds.delete(id);
        // Drop cached FileDiff entries for the removed agent so memory does
        // not grow unboundedly across the app session.
        const prefix = `${id}::`;
        for (const key of this.fileDiffCache.keys()) {
          if (key.startsWith(prefix)) this.fileDiffCache.delete(key);
        }
        for (const key of this.contributorStateCache.keys()) {
          if (key.startsWith(prefix)) this.contributorStateCache.delete(key);
        }
      }
    }
  }

  /**
   * Injects the resolver used to discover which absolute paths are
   * currently mounted as agent workspaces. Called once from `main.ts`
   * after both `DiffHistoryService` and `ToolboxService` (which owns
   * the `MountManagerService`) have been constructed.
   *
   * Without a resolver the service still functions, but
   * `shouldTrackFilepath` falls back to segment-only denylist matching
   * for edits whose `workspaceRoot` was not explicitly passed in.
   */
  public setMountPathsResolver(fn: () => Set<string>): void {
    this._mountPathsResolver = fn;
  }

  /**
   * Longest-prefix match of `filepath` against the currently mounted
   * workspace roots. Returns `null` when the resolver has not been
   * wired, when no mount is registered, or when the path lies outside
   * every mount. Longest match wins so nested mounts resolve to the
   * innermost workspace (whose `.gitignore` is the relevant one).
   */
  private findWorkspaceRoot(filepath: string): string | null {
    const mounts = this._mountPathsResolver?.();
    if (!mounts || mounts.size === 0) return null;
    // Single source of truth shared with `MountManagerService` so the
    // two callers can't drift on path-boundary / longest-prefix /
    // filesystem-root semantics.
    return pickOwningWorkspace(filepath, mounts) ?? null;
  }

  /**
   * TTL-cached `WorkspaceIgnoreMatcher` for a workspace root. The
   * matcher scans every `.gitignore` file under the workspace once
   * per TTL and answers git-accurate ignore queries for any file
   * beneath the root. The cache TTL is low (30s) so `.gitignore`
   * edits are eventually honored without the complexity of a
   * dedicated watcher on every ignore file.
   */
  private async getCachedIgnore(
    workspaceRoot: string,
  ): Promise<WorkspaceIgnoreMatcher> {
    const now = Date.now();
    const hit = this._ignoreCache.get(workspaceRoot);
    if (hit && hit.expiresAt > now) return hit.matcher;
    const matcher = await loadWorkspaceIgnore(workspaceRoot);
    this._ignoreCache.set(workspaceRoot, {
      matcher,
      expiresAt: now + DiffHistoryService.IGNORE_TTL_MS,
    });
    return matcher;
  }

  /**
   * Decides whether a filepath should be tracked by diff-history.
   *
   * Three-phase check, cheapest-first:
   *   1. Synchronous walk-up against `HARDCODED_DENY_SEGMENTS`. This
   *      catches the pathological cases (`node_modules`, build dirs,
   *      tooling caches) in microseconds with zero allocations, which
   *      matters when a runaway tool fans out across thousands of
   *      ignored paths. Segments in this list represent universally
   *      non-committed output — no real project keeps them under
   *      version control — so applying them unconditionally is safe.
   *   2. Resolve the owning workspace (caller-provided hint, else
   *      walk-up against the mounted set) and, if found, consult the
   *      workspace's `.gitignore` (TTL-cached). When a workspace
   *      resolves, its `.gitignore` is **authoritative**: negations
   *      like `!dist/keep.ts` are honored and no further segment
   *      check is applied after it.
   *   3. Outside any mounted workspace with the segment check already
   *      clean: allow the edit.
   *
   * Never throws — returns `true` on any unexpected error so we fail
   * open (prefer tracking over silently dropping).
   */
  private async shouldTrackFilepath(
    filepath: string,
    workspaceRoot?: string | null,
  ): Promise<boolean> {
    try {
      // Phase 1: synchronous segment denylist. Hot path for runaway
      // node_modules fan-out; rejects in microseconds.
      const segments = filepath.split(path.sep);
      for (const seg of segments) {
        if (HARDCODED_DENY_SEGMENTS.has(seg)) return false;
      }

      // Phase 2: authoritative per-workspace `.gitignore`, honoring
      // nested `.gitignore` files at every level from the root down
      // to the file's parent. The matcher internally walks layers
      // and takes the deepest definitive verdict, so we do NOT fall
      // through to any further segment check after this.
      const root = workspaceRoot ?? this.findWorkspaceRoot(filepath);
      if (root) {
        const matcher = await this.getCachedIgnore(root);
        return !matcher.ignores(filepath);
      }

      // Phase 3: no workspace found, segment check already passed.
      return true;
    } catch (error) {
      // Never let an ignore-check failure block a real edit. Log and
      // fall open so the edit is tracked as it would have been before.
      this.logError(
        `shouldTrackFilepath failed for ${filepath} — failing open`,
        error,
      );
      return true;
    }
  }

  /**
   * Registers an agent edit in the diff-db and updates the diff karton state.
   * **The caller is responsible for detecting binaries/ blobs and providing before/ after content accordingly.**
   * Binary content will be provided as temporary paths to files - the caller is responsible for cleaning up the temporary
   * files after the edit is registered.
   *
   * **To mark a deletion:**
   * - set 'before*' to content and 'after*' to null
   *
   * **To mark a creation:**
   * - set 'before*' to null and 'after*' to content
   *
   * **For regular file edits:**
   * - set 'before*' to content and 'after*' to content
   *
   * Two defensive guards apply before any DB write:
   *   1. `shouldTrackFilepath` drops edits in gitignored / denylisted paths.
   *   2. A per-`toolCallId` counter caps fan-out at `MAX_EDITS_PER_TOOL_CALL`.
   * Both are silent no-ops from the caller's perspective — the tool's
   * on-disk write has already succeeded; we just refuse to store
   * untrackable / runaway entries in the ops table.
   *
   * @param edit - The edit to register
   * @returns void
   */
  public async registerAgentEdit(edit: AgentFileEdit) {
    // Guard 1: gitignore / hardcoded-denylist filter.
    if (!(await this.shouldTrackFilepath(edit.path, edit.workspaceRoot))) {
      this.logDebug(`Skipping ignored path: ${edit.path}`);
      return;
    }

    // Guard 2: per-tool-call fan-out cap. Single runaway tool call can
    // otherwise flood the ops table with thousands of entries.
    const prev = this._toolCallEditCounts.get(edit.toolCallId) ?? 0;
    // Memory-safety reset: if we are about to track a brand-new tool
    // call and the map has grown past the hard cap, drop both maps.
    // See `MAX_TRACKED_TOOL_CALLS` JSDoc for the trade-off.
    if (
      prev === 0 &&
      this._toolCallEditCounts.size >= DiffHistoryService.MAX_TRACKED_TOOL_CALLS
    ) {
      this._toolCallEditCounts.clear();
      this._toolCallTruncatedWarned.clear();
    }
    const next = prev + 1;
    this._toolCallEditCounts.set(edit.toolCallId, next);
    if (next > this.MAX_EDITS_PER_TOOL_CALL) {
      if (!this._toolCallTruncatedWarned.has(edit.toolCallId)) {
        this._toolCallTruncatedWarned.add(edit.toolCallId);
        this.logger.warn(
          `[DiffHistory] Tool call ${edit.toolCallId} exceeded fan-out cap ` +
            `(${this.MAX_EDITS_PER_TOOL_CALL} edits). Further edits in ` +
            `this call are dropped from diff history; on-disk writes are unaffected.`,
        );
        this.telemetryService.capture('diff-history-fanout-cap-hit', {
          tool_call_id: edit.toolCallId,
          agent_instance_id: edit.agentInstanceId,
          // Intentionally NOT `edit.path` — raw paths leak usernames
          // and repo names into analytics. See `FanoutPathCategory`.
          path_category: categorizeFanoutPath(edit.path),
          cap: this.MAX_EDITS_PER_TOOL_CALL,
        });
      }
      return;
    }

    // If path is null, it's a newly created blob
    const hasPendingEdits = edit.path
      ? await hasPendingEditsForFilepath(this.db, edit.path)
      : false;
    const needsInitBaseline = !hasPendingEdits;
    const initMeta = {
      operation: 'baseline',
      contributor: 'user',
      reason: 'init',
    } as const;
    // If it's a blob and it's not pending (doesn't have an init baseline) and had content before,
    // store the content before as an init baseline
    if (needsInitBaseline && edit.isExternal && edit.tempPathToBeforeContent) {
      const asyncIterableBuffer = createReadStream(
        edit.tempPathToBeforeContent,
      );
      await storeLargeContent(
        this.db,
        this.blobsDir,
        asyncIterableBuffer,
        edit.path,
        initMeta,
      );
    }
    // If it's a file and it's not pending (doesn't have an init baseline) and had content before,
    // store the content before as an init baseline
    if (needsInitBaseline && !edit.isExternal && edit.contentBefore !== null) {
      await storeFileContent(
        this.db,
        edit.path,
        Buffer.from(edit.contentBefore, 'utf8'),
        initMeta,
      );
    }
    // If no baseline exists and no previous content, add an init baseline op with null oid to mark the file as new
    if (
      needsInitBaseline &&
      ((edit.isExternal && edit.tempPathToBeforeContent == null) ||
        (!edit.isExternal && edit.contentBefore == null))
    ) {
      await insertOperation(this.db, edit.path, null, initMeta);
    }
    // Tracking edit ops:
    // If the file was deleted (external or not), add an edit op with null oid to mark the file as deleted
    const editMeta = {
      operation: 'edit',
      contributor: `agent-${edit.agentInstanceId}`,
      reason: `tool-${edit.toolCallId}`,
    } as const;
    if (
      (edit.isExternal && edit.tempPathToAfterContent === null) ||
      (!edit.isExternal && edit.contentAfter === null)
    ) {
      await insertOperation(this.db, edit.path, null, editMeta);
    }
    // If it's a blob and it's not deleted, store the new content as an edit op
    if (edit.isExternal && edit.tempPathToAfterContent !== null) {
      const asyncIterableBuffer = createReadStream(edit.tempPathToAfterContent);
      await storeLargeContent(
        this.db,
        this.blobsDir,
        asyncIterableBuffer,
        edit.path,
        editMeta,
      );
    }
    // If it's a file and it's not deleted, store the new content as an edit op
    if (!edit.isExternal && edit.contentAfter !== null) {
      await storeFileContent(
        this.db,
        edit.path,
        Buffer.from(edit.contentAfter, 'utf8'),
        editMeta,
      );
    }

    this._opsSeq++;
    // Scoped update: only the editing agent is affected by its own tool call,
    // and we know exactly which file changed — pass the hint so
    // `updateDiffKartonState` can take the targeted-patch fast path.
    await this.updateHydratedAgentState(edit.agentInstanceId, [edit.path]);
    this.ensureWatched(edit.path);
  }

  /**
   * Recomputes and publishes diff state for a single hydrated agent.
   * No-op if the agent is not currently hydrated. Does not update the
   * watcher — caller is responsible for that.
   */
  private async updateHydratedAgentState(
    agentInstanceId: string,
    changedFilepaths?: string[],
  ): Promise<void> {
    if (!this.hydratedAgentInstanceIds.has(agentInstanceId)) return;
    await this.updateDiffKartonState(agentInstanceId, changedFilepaths);
  }

  /**
   * Scoped update triggered by file-watcher events (user-save, unlink):
   * looks up which hydrated agents have any operations for the given filepath
   * and updates only those agents, then refreshes the watcher.
   */
  private async updateAgentsAffectedByFilepath(
    filepath: string,
  ): Promise<void> {
    const affectedIds = await getAgentInstanceIdsWithOperationsForFilepath(
      this.db,
      filepath,
    );
    for (const id of affectedIds) {
      if (this.hydratedAgentInstanceIds.has(id)) {
        await this.updateHydratedAgentState(id, [filepath]);
      }
    }
    // Unwatch if the user-save resolved all pending diffs for this file;
    // otherwise the file stays watched (unwatchResolvedFiles is a no-op
    // for files that still have pending operations).
    await this.unwatchResolvedFiles([filepath]);
  }

  private async updateAllHydratedAgentStates(): Promise<void> {
    for (const id of this.hydratedAgentInstanceIds)
      await this.updateDiffKartonState(id);
    await this.updateWatcher();
  }

  private async updateDiffKartonState(
    agentInstanceId: string,
    changedFilepaths?: string[],
  ): Promise<{
    pendingFileDiffs: FileDiff[];
    editSummary: FileDiff[];
  }> {
    if (!this.uiKarton.state.toolbox[agentInstanceId])
      this.uiKarton.setState((draft) => {
        draft.toolbox[agentInstanceId] = {
          workspace: {
            mounts: [],
          },
          pendingFileDiffs: [],
          editSummary: [],
          pendingUserQuestion: null,
        };
      });

    // Fast path: if the operations table has not changed since the last
    // computation for this agent, replay the cached result without any
    // DB queries (~0ms instead of ~80ms).
    const snapshot = this._agentDiffSnapshot.get(agentInstanceId);
    if (snapshot && snapshot.opsSeq === this._opsSeq) {
      this.uiKarton.setState((draft) => {
        draft.toolbox[agentInstanceId].pendingFileDiffs =
          snapshot.pendingFileDiffs;
        draft.toolbox[agentInstanceId].editSummary = snapshot.editSummary;
      });
      return {
        pendingFileDiffs: snapshot.pendingFileDiffs,
        editSummary: snapshot.editSummary,
      };
    }

    // Targeted-patch path: when the caller tells us exactly which files
    // changed AND we have a prior snapshot to patch, we can skip the full
    // ops-table scan and only query for the changed file(s). This is the
    // hot path for tool edits (which always touch exactly one file).
    if (changedFilepaths && changedFilepaths.length > 0 && snapshot) {
      const nextPending = [...snapshot.pendingFileDiffs];
      const nextSummary = [...snapshot.editSummary];

      for (const filepath of changedFilepaths) {
        // Internal paths (apps/, plans/, logs/) never make it into the UI.
        if (this.isInternalFilepath(agentInstanceId, filepath)) {
          // Still drop any lingering entry for this filepath in case the
          // classification changed (extremely unlikely, but safe).
          const dropIdxP = nextPending.findIndex((d) => d.path === filepath);
          if (dropIdxP !== -1) nextPending.splice(dropIdxP, 1);
          const dropIdxS = nextSummary.findIndex((d) => d.path === filepath);
          if (dropIdxS !== -1) nextSummary.splice(dropIdxS, 1);
          continue;
        }

        // Pending diff for the changed file.
        const pendingOps =
          await getPendingOperationsForAgentInstanceIdAndFilepath(
            this.db,
            agentInstanceId,
            filepath,
          );
        const pendingDiffs = await this.getFileDiffForOperations(
          agentInstanceId,
          pendingOps,
          'pending',
        );
        const newPending = pendingDiffs.find((d) => d.path === filepath);
        const existingPendingIdx = nextPending.findIndex(
          (d) => d.path === filepath,
        );
        if (existingPendingIdx !== -1)
          nextPending.splice(existingPendingIdx, 1);
        if (newPending) nextPending.push(newPending);

        // Summary diff for the changed file.
        const allOps = await getAllOperationsForAgentInstanceIdAndFilepath(
          this.db,
          agentInstanceId,
          filepath,
        );
        const summaryDiffs = await this.getFileDiffForOperations(
          agentInstanceId,
          allOps,
          'summary',
        );
        const newSummary = summaryDiffs.find((d) => d.path === filepath);
        const existingSummaryIdx = nextSummary.findIndex(
          (d) => d.path === filepath,
        );
        if (existingSummaryIdx !== -1)
          nextSummary.splice(existingSummaryIdx, 1);
        if (newSummary) nextSummary.push(newSummary);
      }

      this.uiKarton.setState((draft) => {
        draft.toolbox[agentInstanceId].pendingFileDiffs = nextPending;
        draft.toolbox[agentInstanceId].editSummary = nextSummary;
      });

      this._agentDiffSnapshot.set(agentInstanceId, {
        opsSeq: this._opsSeq,
        pendingFileDiffs: nextPending,
        editSummary: nextSummary,
      });

      return { pendingFileDiffs: nextPending, editSummary: nextSummary };
    }

    // Full-recompute path: no snapshot to patch, or no filepath hint.
    // Internal-path filtering (apps/, plans/, logs/) is handled inside
    // getFileDiffForOperations so those paths never enter the output cache.
    const pendingFileDiffs =
      await this.getPendingFileDiffsForAgentInstanceId(agentInstanceId);
    const editSummary =
      await this.getEditSummaryForAgentInstanceId(agentInstanceId);
    this.uiKarton.setState((draft) => {
      draft.toolbox[agentInstanceId].pendingFileDiffs = pendingFileDiffs;
      draft.toolbox[agentInstanceId].editSummary = editSummary;
    });

    this._agentDiffSnapshot.set(agentInstanceId, {
      opsSeq: this._opsSeq,
      pendingFileDiffs,
      editSummary,
    });

    return { pendingFileDiffs, editSummary };
  }

  /**
   * Lightweight watcher update: ensures a single filepath is watched.
   * Use on hot paths (registerAgentEdit, file-watcher events) where we
   * already know the file has pending edits and just needs to be added
   * to the watch set — avoids the expensive full-table scan.
   */
  private ensureWatched(filepath: string): void {
    if (!this.currentlyWatchedFiles.has(filepath)) {
      this.watcher?.add(filepath);
      this.currentlyWatchedFiles.add(filepath);
    }
  }

  /**
   * Targeted unwatch: checks only the given filepaths for remaining pending
   * operations and unwatches any that are fully resolved.
   * Use instead of `updateWatcher()` when the set of affected files is known.
   */
  private async unwatchResolvedFiles(filepaths: string[]): Promise<void> {
    for (const filepath of filepaths) {
      if (!this.currentlyWatchedFiles.has(filepath)) continue;
      const stillPending = await hasPendingEditsForFilepath(this.db, filepath);
      if (!stillPending) {
        this.watcher?.unwatch(filepath);
        this.currentlyWatchedFiles.delete(filepath);
      }
    }
  }

  /**
   * Full watcher reconciliation: queries all pending operations to build
   * the authoritative watch set, adding new files and removing resolved ones.
   * Use only on cold paths (accept/reject/undo) where files may need unwatching.
   */
  private async updateWatcher(): Promise<void> {
    const pendingDiffs = await getAllPendingOperations(this.db);
    const pendingSet = new Set(pendingDiffs.map((diff) => diff.filepath));
    const needsToBeWatched = pendingDiffs
      .filter((diff) => !this.currentlyWatchedFiles.has(diff.filepath))
      .map((diff) => diff.filepath);
    const needsToBeUnwatched = [...this.currentlyWatchedFiles].filter(
      (path) => !pendingSet.has(path),
    );
    needsToBeWatched.forEach((path) => {
      this.watcher?.add(path);
      this.currentlyWatchedFiles.add(path);
    });
    needsToBeUnwatched.forEach((path) => {
      this.watcher?.unwatch(path);
      this.currentlyWatchedFiles.delete(path);
    });
  }

  /**
   * Accepts all pending diff hunks for a given agent instance.
   * Should be called before an agent is deleted to ensure no
   * "hanging" pending diffs remain in the system.
   */
  public async acceptAllPendingEditsForAgent(
    agentInstanceId: string,
  ): Promise<void> {
    const pendingDiffs =
      await this.getPendingFileDiffsForAgentInstanceId(agentInstanceId);
    if (pendingDiffs.length === 0) return;

    const hunkIds = pendingDiffs.flatMap((e) =>
      !e.isExternal ? e.hunks.map((h) => h.id) : [e.hunkId],
    );
    if (hunkIds.length === 0) return;

    this.logDebug(
      `Accepting all ${hunkIds.length} pending hunks for agent ${agentInstanceId}`,
    );
    await this.acceptAndRejectHunks(hunkIds, []);
  }

  public async acceptAndRejectHunks(
    hunkIdsToAccept: string[],
    hunkIdsToReject: string[],
  ) {
    const pendingOperations = await getAllPendingOperations(this.db);
    // Uncached: this path aggregates pending ops across ALL agents for hunk
    // lookup (not per-agent), so it does not share a cache key with the
    // per-agent computation. This call fires only on explicit user
    // accept/reject actions, which are infrequent.
    const pendingDiffs = await this.computeFileDiffsUncached(
      null,
      pendingOperations,
      'pending',
    );

    const { result, failedAcceptedHunkIds, failedRejectedHunkIds } =
      acceptAndRejectHunksUtils(pendingDiffs, hunkIdsToAccept, hunkIdsToReject);
    if ((failedAcceptedHunkIds?.length ?? 0) > 0)
      this.logError(
        `Failed to accept hunks: ${failedAcceptedHunkIds?.join(', ')}`,
        failedAcceptedHunkIds,
      );
    if ((failedRejectedHunkIds?.length ?? 0) > 0)
      this.logError(
        `Failed to reject hunks: ${failedRejectedHunkIds?.join(', ')}`,
        failedRejectedHunkIds,
      );
    const changedFilepaths: string[] = [];
    for (const [filePath, fileResult] of Object.entries(result)) {
      await this.doAccept(filePath, fileResult);
      await this.doReject(filePath, fileResult);
      changedFilepaths.push(filePath);
    }

    this._opsSeq++;
    // Scoped update: we know exactly which files were affected. Rather than
    // recomputing every hydrated agent's full state (O(agents × files)),
    // only patch the affected files in each hydrated agent's cached snapshot.
    // Accept/reject can affect multiple agents because operations for a given
    // filepath may have been created by different agents, so we still iterate
    // all hydrated agents — but pass the filepath hint so each one takes the
    // targeted-patch fast path instead of a full recompute.
    for (const id of this.hydratedAgentInstanceIds) {
      await this.updateDiffKartonState(id, changedFilepaths);
    }
    await this.unwatchResolvedFiles(changedFilepaths);
  }

  private async storeExternalFile(filePath: string, meta: OperationMeta) {
    const asyncIterableBuffer = createReadStream(filePath);
    const oid = await storeLargeContent(
      this.db,
      this.blobsDir,
      asyncIterableBuffer,
      filePath,
      meta,
    );
    return oid;
  }

  private async doReject(filePath: string, fileResult: FileResult) {
    if (fileResult.isExternal && fileResult.newCurrentOid === undefined) return;
    if (!fileResult.isExternal && fileResult.newCurrent === undefined) return;
    // Lock file to prevent watcher from treating this write as a user change
    this.ignoreFileForWatcher(filePath);
    const isExternal = fileResult.isExternal;
    let newCurrentOid: string | null;

    try {
      // Copy content from blob to file system
      if (isExternal && typeof fileResult.newCurrentOid === 'string') {
        await copyContentToPath(
          this.blobsDir,
          fileResult.newCurrentOid,
          filePath,
        );
        newCurrentOid = fileResult.newCurrentOid;
      } else if (!isExternal && typeof fileResult.newCurrent === 'string') {
        await fs.writeFile(filePath, fileResult.newCurrent, 'utf8');
        newCurrentOid = await storeFileContent(
          this.db,
          filePath,
          Buffer.from(fileResult.newCurrent),
        );
      } else {
        await fs.unlink(filePath);
        newCurrentOid = null;
      }
    } catch (error) {
      newCurrentOid = null;
      this.logError(`Failed to write file: ${filePath}`, error);
    } finally {
      // Unlock after a small delay to allow chokidar to see and ignore the event
      setTimeout(() => this.unignoreFileForWatcher(filePath), 500);
    }

    await insertOperation(this.db, filePath, newCurrentOid, {
      operation: 'edit',
      contributor: 'user',
      reason: 'reject',
    });
  }

  private async doAccept(filePath: string, fileResult: FileResult) {
    if (!fileResult.isExternal && fileResult.newBaseline === undefined) return;
    if (fileResult.isExternal && fileResult.newBaselineOid === undefined)
      return;

    const newContentIsNull =
      !fileResult.isExternal && fileResult.newBaseline === null;
    const isExternal = fileResult.isExternal;

    // Not necessary to store new content if it's null or if it's an external file
    if (newContentIsNull || isExternal)
      return await insertOperation(
        this.db,
        filePath,
        isExternal ? (fileResult.newBaselineOid ?? null) : null,
        {
          operation: 'baseline',
          contributor: 'user',
          reason: 'accept',
        },
      );

    await storeFileContent(
      this.db,
      filePath,
      Buffer.from(fileResult.newBaseline!, 'utf8'),
      { operation: 'baseline', contributor: 'user', reason: 'accept' },
    );
  }

  /**
   * Undoes the given tool calls by restoring files to the state BEFORE
   * the earliest tool-call operation for each affected file.
   *
   * For each file affected by any of the tool calls:
   * 1. Finds the operation immediately before the earliest tool-call
   * 2. Copies operations from baseline up to that point
   * 3. Writes the restored content to disk
   * 4. If restored to an init baseline, adds a user-save edit to close the session
   *
   * @param toolCallIds - The tool call IDs to undo
   * @returns void
   */
  public async undoToolCalls(
    toolCallIds: string[],
    agentInstanceId?: string,
  ): Promise<void> {
    const undoTargets = await getUndoTargetForToolCallsByFilePath(
      this.db,
      toolCallIds,
      agentInstanceId,
    );

    for (const [filePath, targetOp] of Object.entries(undoTargets)) {
      // Copy operations from init baseline up to the undo target
      const copiedOp = await copyOperationsUpToInitBaseline(
        this.db,
        filePath,
        targetOp.idx,
      );

      if (!copiedOp) {
        this.logError(
          `Failed to copy operations for ${filePath} - no init baseline found`,
          null,
        );
        continue;
      }

      // Lock file to prevent watcher from treating this write as a user change
      this.ignoreFileForWatcher(filePath);

      try {
        // Write the restored content to disk
        if (copiedOp.snapshot_oid === null) {
          await fs.unlink(filePath);
        } else if (copiedOp.isExternal) {
          await copyContentToPath(
            this.blobsDir,
            copiedOp.snapshot_oid,
            filePath,
          );
        } else {
          const content = await retrieveContentForOid(
            this.db,
            copiedOp.snapshot_oid,
          );
          if (content) await fs.writeFile(filePath, content, 'utf8');
        }

        // Handle init baseline edge case:
        // If we restored to an init baseline, we need to add a user-save edit
        // with the same snapshot_oid to close the session (make b_n == e_n)
        // Otherwise it would appear as having pending edits.
        if (targetOp.operation === 'baseline' && targetOp.reason === 'init')
          await insertOperation(this.db, filePath, targetOp.snapshot_oid, {
            operation: 'edit',
            contributor: 'user',
            reason: 'user-save',
          });
      } catch (error) {
        this.logError(`Failed to undo tool calls for ${filePath}`, error);
      } finally {
        // Unlock after a small delay to allow chokidar to see and ignore the event
        setTimeout(() => this.unignoreFileForWatcher(filePath), 500);
      }
    }

    this._opsSeq++;
    // Fan out to all hydrated agents — other agents may also have
    // pending/edit-summary state for the same files that the undo touched.
    // This mirrors the cross-agent invalidation in acceptAndRejectHunks.
    if (agentInstanceId) {
      const changedFiles = Object.keys(undoTargets);
      for (const id of this.hydratedAgentInstanceIds) {
        await this.updateHydratedAgentState(id, changedFiles);
      }
      await this.unwatchResolvedFiles(changedFiles);
    } else {
      await this.updateAllHydratedAgentStates();
    }
  }

  /**
   * Retrieves the content of an external (binary/large) file by its blob OID.
   * Returns base64-encoded content and inferred MIME type based on common file extensions.
   *
   * @param oid - The blob OID (SHA-256 hash) of the external file
   * @returns Object with base64 content and MIME type, or null if blob not found
   */
  public async getExternalFileContent(
    oid: string,
  ): Promise<{ content: string; mimeType: string | null } | null> {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of streamContent(this.blobsDir, oid))
        chunks.push(chunk);

      const content = Buffer.concat(chunks).toString('base64');

      // Infer MIME type from content magic bytes (first few bytes)
      const mimeType = this.inferMimeTypeFromBuffer(
        chunks[0] ?? Buffer.alloc(0),
      );

      return { content, mimeType };
    } catch (error) {
      // Blob file doesn't exist or can't be read
      this.logError(
        `Failed to read external file content for oid ${oid}`,
        error,
      );
      return null;
    }
  }

  /**
   * Infers MIME type from buffer magic bytes.
   * Supports common image and document formats.
   */
  private inferMimeTypeFromBuffer(buffer: Buffer): string | null {
    if (buffer.length < 4) return null;

    // Check magic bytes for common formats
    // PNG: 89 50 4E 47
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return 'image/png';
    }
    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }
    // GIF: 47 49 46 38
    if (
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38
    ) {
      return 'image/gif';
    }
    // WebP: 52 49 46 46 ... 57 45 42 50
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer.length >= 12 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return 'image/webp';
    }
    // BMP: 42 4D
    if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
      return 'image/bmp';
    }
    // ICO: 00 00 01 00
    if (
      buffer[0] === 0x00 &&
      buffer[1] === 0x00 &&
      buffer[2] === 0x01 &&
      buffer[3] === 0x00
    ) {
      return 'image/x-icon';
    }
    // PDF: 25 50 44 46
    if (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    ) {
      return 'application/pdf';
    }
    // SVG starts with "<?xml" or "<svg" (text-based)
    const textStart = buffer.toString('utf8', 0, Math.min(buffer.length, 100));
    if (
      textStart.includes('<svg') ||
      (textStart.includes('<?xml') && textStart.includes('svg'))
    ) {
      return 'image/svg+xml';
    }

    return null;
  }

  private async getEditSummaryForAgentInstanceId(
    agentInstanceId: string,
  ): Promise<FileDiff[]> {
    const allops = await getAllOperationsForAgentInstanceId(
      this.db,
      agentInstanceId,
    );
    return this.getFileDiffForOperations(agentInstanceId, allops, 'summary');
  }

  private async getPendingFileDiffsForAgentInstanceId(
    agentInstanceId: string,
  ): Promise<FileDiff[]> {
    const pendingOps = await getPendingOperationsForAgentInstanceId(
      this.db,
      agentInstanceId,
    );
    return this.getFileDiffForOperations(
      agentInstanceId,
      pendingOps,
      'pending',
    );
  }

  /**
   * Returns true if the given filepath is an internal path (apps/, plans/, logs/)
   * that should not be surfaced to the UI.
   */
  private isInternalFilepath(
    agentInstanceId: string,
    filepath: string,
  ): boolean {
    const appsDir = getAgentAppsDir(agentInstanceId);
    const plansDir = getPlansDir();
    const logsDir = getLogsDir();
    return (
      filepath.startsWith(appsDir + path.sep) ||
      filepath.startsWith(plansDir + path.sep) ||
      filepath.startsWith(logsDir + path.sep)
    );
  }

  /**
   * Trims operations for `pending` mode so each filepath starts at its latest
   * baseline. Extracted from the old getFileDiffForOperations so both cached
   * and uncached paths can share this logic.
   */
  private trimPendingOpsToLatestBaseline(
    ops: OperationWithExternal[],
  ): OperationWithExternal[] {
    // Trim operations to start from the latest baseline per filepath.
    // After a partial accept, the latest baseline is the accept baseline,
    // not the init baseline. This ensures pending diffs show only
    // changes since the last accept.
    const latestBaselineIdx = new Map<string, number>();
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      if (op.operation === 'baseline') latestBaselineIdx.set(op.filepath, i);
    }
    if (latestBaselineIdx.size === 0) return ops;

    const trimmed: OperationWithExternal[] = [];
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const startIdx = latestBaselineIdx.get(op.filepath);
      if (startIdx !== undefined && i >= startIdx) trimmed.push(op);
      else if (startIdx === undefined) trimmed.push(op);
    }
    return trimmed;
  }

  /**
   * Runs the full diff-compute pipeline over the given operations with no
   * caching and no internal-path filtering. Used by the global accept/reject
   * path (acceptAndRejectHunks) which passes ops spanning all agents, and as
   * the inner implementation for per-filepath recomputation on cache misses.
   */
  private async computeFileDiffsUncached(
    agentInstanceId: string | null,
    operations: OperationWithExternal[],
    mode: 'pending' | 'summary',
  ): Promise<FileDiff[]> {
    const ops =
      mode === 'pending'
        ? this.trimPendingOpsToLatestBaseline(operations)
        : operations;

    const nonExternalOps = ops.filter((op) => !op.isExternal);
    const externalOps = ops
      .filter((op) => op.isExternal)
      .map((op) => ({
        ...op,
        snapshot_content: null,
      }));
    const nonExternalOpsWithContent =
      await this.getOperationsWithContent(nonExternalOps);
    const mergedOps = [...nonExternalOpsWithContent, ...externalOps].sort(
      (a, b) => Number(a.idx) - Number(b.idx),
    );
    const generations = segmentFileOperationsIntoGenerations(mergedOps);

    // When agentInstanceId is null (e.g. acceptAndRejectHunks processing
    // pending ops across all agents), we skip the per-agent incremental
    // cache and fall back to a from-scratch build. This keeps the cache
    // contract simple: one cache entry per (agent, filepath, mode,
    // firstOpIdx).
    if (agentInstanceId === null) {
      const contributorMap = buildContributorMap(generations);
      return createFileDiffsFromGenerations(generations, contributorMap);
    }

    // Per-agent path: for each file, reuse the cached contributor-map
    // state when its `firstOpIdx` matches and its `latestOpIdx` sits
    // inside the current op range. Otherwise rebuild from scratch for
    // that file and seed a fresh cache entry.
    const contributorMap: Record<string, ContributorMaps> = {};
    for (const fileId of Object.keys(generations)) {
      const fileOps = generations[fileId];
      if (fileOps.length === 0) {
        contributorMap[fileId] = { lineMap: {}, removalMap: {} };
        continue;
      }
      const filepath = fileOps[0].filepath;
      const firstOpIdx = Number(fileOps[0].idx);
      const cacheKey = this.contributorStateCacheKey(
        agentInstanceId,
        filepath,
        mode,
        firstOpIdx,
      );
      const cached = this.contributorStateCache.get(cacheKey);

      // Reuse only if the cached latestOpIdx corresponds to an op that
      // is still present in the current op list (so the tail after it
      // is an unambiguous extension, not a truncation).
      const canReuse =
        cached !== undefined &&
        fileOps.some((op) => Number(op.idx) === cached.latestOpIdx);

      let priorState: ContributorMapState | null = null;
      let priorLatestIdx: number | null = null;
      let opsToProcess: OperationWithContent[];
      if (canReuse && cached !== undefined) {
        // structuredClone gives us an independent copy the incremental
        // function can mutate without disturbing the cache entry (we
        // overwrite the cache with the new finalState below).
        priorState = structuredClone(cached.state);
        priorLatestIdx = cached.latestOpIdx;
        opsToProcess = fileOps;
      } else {
        opsToProcess = fileOps;
      }

      const { maps, finalState, finalLatestOpIdx } =
        buildContributorMapIncremental(
          opsToProcess,
          priorState,
          priorLatestIdx,
        );
      contributorMap[fileId] = maps;
      if (finalLatestOpIdx >= 0) {
        this.contributorStateCache.set(cacheKey, {
          latestOpIdx: finalLatestOpIdx,
          state: finalState,
        });
      }
    }

    return createFileDiffsFromGenerations(generations, contributorMap);
  }

  private contributorStateCacheKey(
    agentInstanceId: string,
    filepath: string,
    mode: 'pending' | 'summary',
    firstOpIdx: number,
  ): string {
    return `${agentInstanceId}::${filepath}::${mode}::${firstOpIdx}`;
  }

  /**
   * Per-agent, cache-aware diff computation.
   *
   * Skips recomputation for files whose latest operation idx has not advanced
   * since the last cache write. Only the changed files are recomputed.
   * Internal paths (apps/, plans/, logs/) are filtered before any computation
   * and never enter the cache.
   */
  private async getFileDiffForOperations(
    agentInstanceId: string,
    operations: OperationWithExternal[],
    mode: 'pending' | 'summary',
  ): Promise<FileDiff[]> {
    // 1. Pending-mode trim (before cache keying so trimmed ops match what
    //    was cached last time).
    const trimmed =
      mode === 'pending'
        ? this.trimPendingOpsToLatestBaseline(operations)
        : operations;

    // 2. Drop internal paths (apps/, plans/, logs/) here so they never get
    //    computed or cached.
    const visibleOps = trimmed.filter(
      (op) => !this.isInternalFilepath(agentInstanceId, op.filepath),
    );
    if (visibleOps.length === 0) return [];

    // 3. Partition ops by filepath and resolve cache state via the latest
    //    idx query.
    const opsByFilepath = new Map<string, OperationWithExternal[]>();
    for (const op of visibleOps) {
      const list = opsByFilepath.get(op.filepath) ?? [];
      list.push(op);
      opsByFilepath.set(op.filepath, list);
    }
    const filepaths = [...opsByFilepath.keys()];
    const latestIdxMap = await getLatestOperationIdxPerFilepath(
      this.db,
      filepaths,
    );

    const cachedDiffs: FileDiff[] = [];
    const uncachedOps: OperationWithExternal[] = [];
    const uncachedFilepaths: string[] = [];
    for (const [filepath, fileOps] of opsByFilepath.entries()) {
      const latestIdx = latestIdxMap.get(filepath);
      const key = this.cacheKey(agentInstanceId, filepath, mode);
      const cached = this.fileDiffCache.get(key);
      if (
        latestIdx !== undefined &&
        cached !== undefined &&
        cached.latestIdx === latestIdx
      ) {
        cachedDiffs.push(cached.diff);
      } else {
        uncachedOps.push(...fileOps);
        uncachedFilepaths.push(filepath);
      }
    }

    // 4. Compute diffs for the uncached subset and store them.
    if (uncachedOps.length === 0) return cachedDiffs;

    const computed = await this.computeFileDiffsUncached(
      agentInstanceId,
      uncachedOps,
      mode,
    );

    // Index computed diffs by path so we can associate them with their
    // latestIdx for caching. createFileDiffsFromGenerations returns one diff
    // per unique filepath in the input ops, so a Map by path is sufficient.
    const computedByPath = new Map<string, FileDiff>();
    for (const diff of computed) computedByPath.set(diff.path, diff);

    for (const filepath of uncachedFilepaths) {
      const diff = computedByPath.get(filepath);
      const latestIdx = latestIdxMap.get(filepath);
      if (diff && latestIdx !== undefined) {
        this.fileDiffCache.set(this.cacheKey(agentInstanceId, filepath, mode), {
          latestIdx,
          diff,
        });
      }
    }

    return [...cachedDiffs, ...computed];
  }

  private async getOperationsWithContent(
    operations: Operation[],
  ): Promise<OperationWithContent[]> {
    const allOids = operations
      .map((op) => op.snapshot_oid)
      .filter((oid): oid is string => !!oid);

    // Partition into cached and uncached OIDs.
    const uncachedOids: string[] = [];
    for (const oid of allOids) {
      if (!this.oidContentCache.has(oid)) uncachedOids.push(oid);
    }

    // Fetch only the uncached subset from the database.
    if (uncachedOids.length > 0) {
      const fetched = await retrieveContentsForOids(this.db, uncachedOids);
      for (const [oid, buf] of fetched.entries()) {
        this.oidContentCache.set(oid, buf.toString('utf-8'));
      }
    }

    const o: OperationWithContent[] = [];
    for (const op of operations) {
      o.push({
        ...op,
        snapshot_content: this.oidContentCache.get(op.snapshot_oid ?? ''),
      } as OperationWithContent);
    }
    return o;
  }

  protected onTeardown(): Promise<void> | void {
    this.uiKarton.unregisterStateChangeCallback(this.boundOnStateChange);
    this.watcher?.close();
    this.dbDriver.close();
    this.filesIgnoredByWatcher.clear();
    this.fileDiffCache.clear();
    this.contributorStateCache.clear();
    this.oidContentCache.clear();
    this._agentDiffSnapshot.clear();
    this._toolCallEditCounts.clear();
    this._toolCallTruncatedWarned.clear();
    this._ignoreCache.clear();
    this._mountPathsResolver = null;
    this.uiKarton.removeServerProcedureHandler('toolbox.acceptHunks');
    this.uiKarton.removeServerProcedureHandler('toolbox.rejectHunks');
  }

  public ignoreFileForWatcher(path: string): void {
    this.filesIgnoredByWatcher.add(path);
  }
  public unignoreFileForWatcher(path: string): void {
    this.filesIgnoredByWatcher.delete(path);
  }

  private logError(error: string, e: unknown) {
    this.logger.error(`[DiffHistory] ${error}`, e);
  }
  private logDebug(debug: string) {
    this.logger.debug(`[DiffHistory] ${debug}`);
  }
  private logInfo(info: string) {
    this.logger.info(`[DiffHistory] ${info}`);
  }
}
