import { DisposableService } from '@/services/disposable';
import type { FileResult } from '@shared/karton-contracts/ui/shared-types';
import { isBinaryFile } from 'isbinaryfile';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { type Client, createClient } from '@libsql/client';
import * as schema from './schema';
import chokidar, { type FSWatcher } from 'chokidar';
import type { Logger } from '@/services/logger';
import type { TelemetryService } from '@/services/telemetry';
import fs from 'node:fs/promises';
import type { KartonService } from '@/services/karton';
import {
  getDiffHistoryDbPath,
  getDiffHistoryBlobsDir,
  getAgentAppsDir,
  getPlansDir,
} from '@/utils/paths';
import {
  type FileDiff,
  MAX_DIFF_TEXT_FILE_SIZE,
} from '@shared/karton-contracts/ui/shared-types';
import {
  getAllOperationsForAgentInstanceId,
  getAllPendingOperations,
  getPendingOperationsForAgentInstanceId,
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
} from './utils/db';
import {
  acceptAndRejectHunks as acceptAndRejectHunksUtils,
  buildContributorMap,
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
        await this.updateAllHydratedAgentStates();
      })
      .on('unlink', async (path) => {
        if (this.filesIgnoredByWatcher.has(path)) return;
        await insertOperation(this.db, path, null, {
          operation: 'edit',
          contributor: 'user',
          reason: 'user-save',
        });
        this.logDebug(`File unlinked: ${path}`);
        await this.updateAllHydratedAgentStates();
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
        .then(() => this.updateWatcher())
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

    await this.updateAllHydratedAgentStates();
  }

  private async updateAllHydratedAgentStates(): Promise<void> {
    for (const id of this.hydratedAgentInstanceIds)
      await this.updateDiffKartonState(id);
    await this.updateWatcher();
  }

  private async updateDiffKartonState(agentInstanceId: string): Promise<{
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

    const appsDir = getAgentAppsDir(agentInstanceId);
    const plansDir = getPlansDir();
    const isInternalPath = (d: { path: string }) =>
      d.path.startsWith(appsDir) || d.path.startsWith(plansDir);

    const pendingFileDiffs = (
      await this.getPendingFileDiffsForAgentInstanceId(agentInstanceId)
    ).filter((d) => !isInternalPath(d));
    this.uiKarton.setState((draft) => {
      draft.toolbox[agentInstanceId].pendingFileDiffs = pendingFileDiffs;
    });
    const editSummary = (
      await this.getEditSummaryForAgentInstanceId(agentInstanceId)
    ).filter((d) => !isInternalPath(d));
    this.uiKarton.setState((draft) => {
      draft.toolbox[agentInstanceId].editSummary = editSummary;
    });
    return { pendingFileDiffs, editSummary };
  }

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
    const pendingDiffs = await this.getFileDiffForOperations(
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
    for (const [filePath, fileResult] of Object.entries(result)) {
      await this.doAccept(filePath, fileResult);
      await this.doReject(filePath, fileResult);
    }

    await this.updateAllHydratedAgentStates();
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
    await this.updateAllHydratedAgentStates();
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
    const fileDiffs = await this.getFileDiffForOperations(allops, 'summary');
    return fileDiffs;
  }

  private async getPendingFileDiffsForAgentInstanceId(
    agentInstanceId: string,
  ): Promise<FileDiff[]> {
    const pendingOps = await getPendingOperationsForAgentInstanceId(
      this.db,
      agentInstanceId,
    );
    const fileDiffs = await this.getFileDiffForOperations(
      pendingOps,
      'pending',
    );
    return fileDiffs;
  }

  private async getFileDiffForOperations(
    operations: OperationWithExternal[],
    mode: 'pending' | 'summary',
  ): Promise<FileDiff[]> {
    let ops = operations;

    if (mode === 'pending') {
      // Trim operations to start from the latest baseline per filepath.
      // After a partial accept, the latest baseline is the accept baseline,
      // not the init baseline. This ensures pending diffs show only
      // changes since the last accept.
      const latestBaselineIdx = new Map<string, number>();
      for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        if (op.operation === 'baseline') latestBaselineIdx.set(op.filepath, i);
      }
      if (latestBaselineIdx.size > 0) {
        const trimmed: OperationWithExternal[] = [];
        const seen = new Set<string>();
        for (let i = 0; i < ops.length; i++) {
          const op = ops[i];
          const startIdx = latestBaselineIdx.get(op.filepath);
          if (startIdx !== undefined && i >= startIdx) {
            if (!seen.has(op.filepath)) seen.add(op.filepath);
            trimmed.push(op);
          } else if (startIdx === undefined) trimmed.push(op);
        }
        ops = trimmed;
      }
    }

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
    const contributorMap = buildContributorMap(generations);
    const fileDiffs = createFileDiffsFromGenerations(
      generations,
      contributorMap,
    );
    return fileDiffs;
  }

  private async getOperationsWithContent(
    operations: Operation[],
  ): Promise<OperationWithContent[]> {
    const oids = operations.map((op) => op.snapshot_oid);
    const contents = await retrieveContentsForOids(this.db, oids);
    const stringContents = new Map<string, string>();
    for (const [oid, content] of contents.entries())
      stringContents.set(oid, content.toString('utf-8'));

    const o: OperationWithContent[] = [];
    for (const op of operations) {
      o.push({
        ...op,
        snapshot_content: stringContents.get(op.snapshot_oid ?? ''),
      } as OperationWithContent);
    }
    return o;
  }

  protected onTeardown(): Promise<void> | void {
    this.uiKarton.unregisterStateChangeCallback(this.boundOnStateChange);
    this.watcher?.close();
    this.dbDriver.close();
    this.filesIgnoredByWatcher.clear();
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
