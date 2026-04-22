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
   * @param edit - The edit to register
   * @returns void
   */
  public async registerAgentEdit(edit: AgentFileEdit) {
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
