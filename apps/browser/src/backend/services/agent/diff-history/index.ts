import { DisposableService } from '@/services/disposable';
import chokidar, { type FSWatcher } from 'chokidar';
import { v4 as uuidv4 } from 'uuid';
import type { Logger } from '@/services/logger';
import type { FileDiff } from '@stagewise/agent-types';
import fs from 'node:fs/promises';
import type { KartonService } from '@/services/karton';
import { join } from 'node:path';

// 1. The File State at a specific moment
type FileMap = {
  [filePath: string]: string; // FULL Content of the file
};

type FileOperations = {
  filesToWrite: FileMap;
  filesToDelete: string[];
};

// 2. A node in our timeline
interface TimelineNode {
  id: string; // UUID
  timestamp: number;
  userMessageId: string;
  chatId: string; // Tracks which chat context caused this change
  files: FileMap; // FULL content of all managed files at this moment
  trigger:
    | 'AGENT_EDIT'
    | 'USER_SAVE'
    | 'INITIAL_LOAD'
    | 'PARTIAL_USER_ACCEPT'
    | 'USER_REJECT';

  // Which files were "committed/accepted" at this specific step.
  acceptedPaths: string[];
}

export class DiffHistoryService extends DisposableService {
  private readonly logger: Logger;
  private readonly uiKarton: KartonService;
  private readonly history: TimelineNode[] = [];
  private watcher: FSWatcher | null = null;
  private currentIndex = -1;
  private filesLockedByAgent: Set<string> = new Set();

  private constructor(logger: Logger, uiKarton: KartonService) {
    super();
    this.logger = logger;
    this.uiKarton = uiKarton;
  }

  public static async create(
    logger: Logger,
    uiKarton: KartonService,
  ): Promise<DiffHistoryService> {
    const instance = new DiffHistoryService(logger, uiKarton);
    await instance.initialize();
    logger.debug('[DiffHistoryService] Created service');
    return instance;
  }

  private async initialize(): Promise<void> {
    this.watcher = chokidar
      .watch([], {
        persistent: true,
        atomic: true,
        ignoreInitial: true,
      })
      .on('change', async (path) => {
        if (this.filesLockedByAgent.has(path)) return;

        try {
          const fileContent = await fs.readFile(path, 'utf8');

          // Get current state to merge with
          const currentFiles =
            this.currentIndex >= 0 ? this.history[this.currentIndex].files : {};

          const newFiles = { ...currentFiles, [path]: fileContent };

          this.pushSnapshot('USER_SAVE', newFiles, []);
        } catch (error) {
          this.logError(`[DiffHistory] Failed to read file: ${path}`, error);
          return;
        }
        this.logDebug(`File changed: ${path}`);
      })
      .on('unlink', (path) => {
        if (this.filesLockedByAgent.has(path)) return;

        // Get current state and remove the file
        const currentFiles =
          this.currentIndex >= 0 ? this.history[this.currentIndex].files : {};

        const newFiles = { ...currentFiles };
        delete newFiles[path];

        this.pushSnapshot('USER_SAVE', newFiles, []);
        this.logDebug(`File unlinked: ${path}`);
      });

    // TODO: Load from persistent storage
  }

  protected onTeardown(): Promise<void> | void {}

  /*
   * Called each time the agent edits a new file.
   *
   * @param files - The files that the agent edited.
   */
  public addInitialFileSnapshotIfNeeded(files: FileMap): void {
    if (this.currentIndex === -1) this.pushSnapshot('INITIAL_LOAD', files, []);
    else if (
      this.history.length > 0 &&
      this.history[0].trigger === 'INITIAL_LOAD'
    ) {
      for (const file of Object.keys(files)) {
        // Check if file is already being tracked in current snapshot (created by agent)
        const currentFiles = this.history[this.currentIndex]?.files ?? {};
        const isAlreadyTracked = Object.hasOwn(currentFiles, file);

        if (!this.history[0].files[file] && !isAlreadyTracked) {
          // File doesn't exist in initial snapshot AND not already tracked
          // This means it's an existing file being edited for the first time
          this.history[0].files[file] = files[file];
        } else if (this.history[0].files[file]) {
          // File exists - check if disk content differs from computed baseline
          // This handles cases where user reverted changes externally (e.g., git checkout)
          const baseline = this.getComputedBaseline(this.currentIndex);
          if (baseline[file] !== files[file]) {
            // External change detected - push a new snapshot to record the change
            // This preserves undo history while correctly updating the baseline
            const currentFiles =
              this.currentIndex >= 0
                ? this.history[this.currentIndex].files
                : {};
            const newFiles = { ...currentFiles, [file]: files[file] };
            // Mark the file as accepted so it becomes the new baseline
            this.pushSnapshot('USER_SAVE', newFiles, [file]);
          }
        }
      }
    }
  }

  /**
   * Call this whenever:
   * 1. The Agent finishes an edit.
   * 2. The File Watcher detects a user save on a managed file.
   * 3. We load the initial state of the project.
   */
  /**
   * Convenience method for agent file edits that handles merging with current state.
   * Use this when the agent modifies a single file and you want to preserve other tracked files.
   *
   * @param path - Absolute path of the file being edited
   * @param afterContent - New content of the file, or null if the file was deleted
   */
  public pushAgentFileEdit(path: string, afterContent: string | null): void {
    const currentFiles =
      this.currentIndex >= 0 ? this.history[this.currentIndex].files : {};
    const newFiles = { ...currentFiles };

    if (afterContent === null) {
      // File was deleted
      delete newFiles[path];
    } else {
      // File was created or modified
      newFiles[path] = afterContent;
    }

    this.pushSnapshot('AGENT_EDIT', newFiles, []);
  }

  /**
   * Low-level method to push a complete snapshot.
   * The caller is responsible for providing the FULL state of all managed files.
   * For single-file agent edits, prefer using `pushAgentFileEdit` which handles merging.
   */
  public pushSnapshot(
    trigger: TimelineNode['trigger'],
    files: FileMap,
    acceptedPaths: string[] = [], // Default to empty (Pending)
  ): void {
    const chatId = this.uiKarton.state.agentChat?.activeChatId;
    const userMessageId = this.getLastUserMessageId();
    if (!userMessageId || !chatId) {
      this.logError(
        'No user message id found',
        new Error('No user message id found'),
      );
      return;
    }

    // 1. Handle "Time Travel Paradox" (Branching)
    if (this.currentIndex < this.history.length - 1) {
      this.logDebug(
        `[DiffHistory] Branching history. Dropping ${this.history.length - 1 - this.currentIndex} future nodes.`,
      );
      this.history.splice(this.currentIndex + 1);
    }

    // 2. Create Node - files should be the FULL state of all managed files
    const node: TimelineNode = {
      id: uuidv4(),
      timestamp: Date.now(),
      userMessageId,
      chatId,
      files: { ...files }, // Deep copy
      trigger,
      acceptedPaths: [...acceptedPaths], // Deep copy
    };

    // 3. Update State
    this.history.push(node);
    this.currentIndex++;

    // 4. Update Watcher
    this.updateWatcher();
    this.uiKarton.setState((draft) => {
      if (draft.agentChat)
        draft.agentChat.chats[chatId].pendingEdits = this.getDiffState();
    });
    this.logDebug(
      `[DiffHistory] Snapshot recorded. Trigger: ${trigger}. ChatId: ${chatId}. History Size: ${this.history.length}`,
    );
  }

  /**
   * Called when user clicks "Undo to this message".
   * Logic: "Reset the world to the state BEFORE this message caused any changes."
   *
   * @param targetUserMessageId - The ID of the user message to revert to.
   * @returns The operations performed.
   */
  public revertToMessage(targetUserMessageId: string): FileOperations | null {
    const chatId = this.uiKarton.state.agentChat?.activeChatId;
    if (!chatId) {
      this.logError('No chat id found', new Error('No chat id found'));
      return null;
    }
    const firstIndexForMessage = this.history.findIndex(
      (n) => n.userMessageId === targetUserMessageId,
    );

    if (firstIndexForMessage === -1) {
      this.logger.warn(
        `[DiffHistory] No snapshots found for userMessageId ${targetUserMessageId}.`,
      );
      return null;
    }

    // Target is the state immediately BEFORE this message's effects.
    const targetIndex = firstIndexForMessage - 1;

    if (targetIndex < 0) {
      this.logger.warn('[DiffHistory] Undoing past the beginning of history.');
      // Handle edge case of undoing everything (returning to empty or init state)
      const targetFiles = this.history.length > 0 ? this.history[0].files : {};
      const operations = this.calculateOperations(targetFiles);

      // Update state if possible, though usually we don't drop index < 0
      this.currentIndex = 0;
      this.writeFilesToDisk(operations);
      this.updateWatcher();
      this.uiKarton.setState((draft) => {
        if (draft.agentChat?.activeChatId === chatId) {
          draft.agentChat.chats[chatId].pendingEdits = [];
        }
      });
      return operations;
    }

    this.logger.info(
      `[DiffHistory] Reverting to index ${targetIndex} (State BEFORE message: ${targetUserMessageId})`,
    );

    const targetNode = this.history[targetIndex];

    // 1. Calculate operations needed to go from CURRENT -> TARGET
    const operations = this.calculateOperations(targetNode.files);

    // 2. Update Pointer
    this.currentIndex = targetIndex;

    // 3. Perform Disk I/O
    this.writeFilesToDisk(operations);

    // 4. Update Watcher
    this.updateWatcher();

    this.uiKarton.setState((draft) => {
      if (draft.agentChat?.activeChatId === chatId) {
        draft.agentChat.chats[chatId].pendingEdits = this.getDiffState();
      }
    });

    return operations;
  }

  /**
   * Calculates the diff between the current node and the "Computed Baseline".
   * The Baseline is the accumulated state of all ACCEPTED changes up to now.
   */
  public getDiffState(): FileDiff[] {
    if (this.currentIndex === -1 || this.history.length === 0) return [];

    const currentNode = this.history[this.currentIndex];

    // 1. Calculate the "Safe State" (Baseline) by replaying accepts
    const baselineFiles = this.getComputedBaseline(this.currentIndex);

    // 2. Compare Current vs Baseline
    return this.calculateDiff(baselineFiles, currentNode.files);
  }

  /**
   * Calculates total session changes (Current vs Initial).
   */
  public getSessionDiffState(): FileDiff[] {
    if (this.currentIndex === -1 || this.history.length === 0) return [];

    const initialNode = this.history[0];
    const currentNode = this.history[this.currentIndex];

    return this.calculateDiff(initialNode.files, currentNode.files);
  }

  /**
   * User clicks "Accept All".
   * Marks ALL files in the current node as accepted, including deletions.
   */
  public acceptPendingChanges(): void {
    if (this.currentIndex === -1) return;

    const currentNode = this.history[this.currentIndex];
    const chatId = this.uiKarton.state.agentChat?.activeChatId;
    if (!chatId) {
      this.logError('No chat id found', new Error('No chat id found'));
      return;
    }

    // Get previous baseline to detect deletions
    const previousBaseline =
      this.currentIndex > 0
        ? this.getComputedBaseline(this.currentIndex - 1)
        : (this.history[0]?.files ?? {});

    // Files that currently exist
    const existingPaths = Object.keys(currentNode.files);

    // Files that were deleted (existed in baseline but not in current)
    const deletedPaths = Object.keys(previousBaseline).filter(
      (path) => !Object.hasOwn(currentNode.files, path),
    );

    // Mark both existing AND deleted files as accepted
    currentNode.acceptedPaths = [...existingPaths, ...deletedPaths];

    this.updateWatcher();
    this.uiKarton.setState((draft) => {
      if (draft.agentChat?.activeChatId === chatId) {
        draft.agentChat.chats[chatId].pendingEdits = [];
      }
    });
    this.logger.debug(
      `[DiffHistory] State accepted (All files). ID: ${currentNode.id}`,
    );
  }

  /**
   * User clicks "Accept" on specific files (Granular Commit).
   * This handles both file modifications/creations AND deletions.
   * A deletion is accepted when the file path is in filesToAccept but
   * doesn't exist in the current files (it was deleted).
   */
  public partialAccept(filesToAccept: string[]): void {
    if (this.currentIndex === -1) throw new Error('No history');

    const currentNode = this.history[this.currentIndex];

    // Push new snapshot: Files stay exactly the same!
    // The filesToAccept array can include both:
    // - Paths of files that exist (modifications/creations)
    // - Paths of files that were deleted (not in currentNode.files)
    // The getComputedBaseline() method handles both cases correctly.
    this.pushSnapshot(
      'PARTIAL_USER_ACCEPT',
      currentNode.files,
      filesToAccept, // These become part of the baseline (including deletions)
    );
  }

  /**
   * Called when the user clicks "Reject" on a specific file (or list of files).
   * Logic: "Reset ONLY these specific files to the Computed Baseline."
   */
  public partialReject(filesToReject: string[]): FileOperations {
    // 1. Calculate what the "Safe State" is (Baseline)
    const baseline = this.getComputedBaseline(this.currentIndex);

    // 2. Start with the CURRENT state
    const currentFiles = this.history[this.currentIndex].files;
    const newFileMap = { ...currentFiles };

    // 3. Revert only the target files
    filesToReject.forEach((path) => {
      if (Object.hasOwn(baseline, path)) {
        // Restore to baseline version
        newFileMap[path] = baseline[path];
      } else {
        // It wasn't in the baseline -> deleting it.
        delete newFileMap[path];
      }
    });

    this.logger.info(
      `[DiffHistory] Partially rejecting ${filesToReject.length} files.`,
    );

    // 4. Calculate Operations (Current vs New)
    const operations = this.calculateOperations(newFileMap);

    // 5. Push the new state.
    this.pushSnapshot('USER_REJECT', newFileMap, []);

    // 6. Perform Disk I/O
    this.writeFilesToDisk(operations);

    return operations;
  }

  /**
   * Called when user clicks "Reject Pending".
   * Logic: "Revert the files to the last Computed Baseline."
   */
  public rejectPendingChanges(): FileOperations {
    // 1. Calculate what the files SHOULD look like (Baseline)
    const safeFiles = this.getComputedBaseline(this.currentIndex);

    this.logger.info(
      `[DiffHistory] Rejecting pending changes. Reverting to Computed Baseline.`,
    );

    // 2. Calculate Operations (Current vs Safe)
    const operations = this.calculateOperations(safeFiles);

    // 3. Create a NEW snapshot with the safe content.
    this.pushSnapshot('USER_REJECT', safeFiles, Object.keys(safeFiles));

    // 4. Perform Disk I/O
    this.writeFilesToDisk(operations);

    return operations;
  }

  /**
   * Constructs the "Baseline" state by replaying history and applying
   * only the changes that were marked as 'acceptedPaths'.
   */
  private getComputedBaseline(targetIndex: number): FileMap {
    if (this.history.length === 0) return {};

    // Start with the initial state (Index 0).
    const baseline: FileMap = { ...this.history[0].files };

    // Walk forward from 1 to current
    for (let i = 1; i <= targetIndex; i++) {
      const node = this.history[i];

      // If this node has committed files, apply them to baseline
      if (node.acceptedPaths && node.acceptedPaths.length > 0) {
        node.acceptedPaths.forEach((path) => {
          if (Object.hasOwn(node.files, path)) {
            // Case A: File exists -> Update/Add to baseline
            baseline[path] = node.files[path];
          } else {
            // Case B: File is in acceptedPaths but NOT in files map -> It was deleted
            delete baseline[path];
          }
        });
      }
    }

    return baseline;
  }

  private calculateDiff(base: FileMap, current: FileMap): FileDiff[] {
    const diffs: FileDiff[] = [];
    const allPaths = new Set([...Object.keys(base), ...Object.keys(current)]);

    allPaths.forEach((path) => {
      const beforeContent = base[path];
      const afterContent = current[path];
      if (beforeContent === afterContent) return;
      diffs.push({
        path,
        before: beforeContent ?? null,
        after: afterContent ?? null,
      });
    });

    return diffs;
  }

  private getLastUserMessageId(): string | null {
    const activeChatId = this.uiKarton.state.agentChat?.activeChatId;
    if (!activeChatId) return null;
    const chat = this.uiKarton.state.agentChat?.chats[activeChatId];
    if (!chat) return null;

    // Find LAST message (search from end)
    const messages = chat.messages || [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'user' && 'id' in m) return m.id;
    }
    return null;
  }

  public lockFileForAgent(path: string): void {
    this.filesLockedByAgent.add(path);
  }

  public unlockFileForAgent(path: string): void {
    this.filesLockedByAgent.delete(path);
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

  private writeFilesToDisk(fileOperation: FileOperations): void {
    Object.entries(fileOperation.filesToWrite).forEach(([path, content]) => {
      try {
        // We lock here to ensure the watcher ignores these specific writes
        // even if 'atomic' behavior causes multiple events
        this.lockFileForAgent(path);
        fs.writeFile(path, content, 'utf8').finally(() => {
          // Unlock after a small delay to allow chokidar to see and ignore it
          setTimeout(() => this.unlockFileForAgent(path), 500);
        });
      } catch (error) {
        this.logError(`Failed to write file: ${path}`, error);
      }
    });
    fileOperation.filesToDelete.forEach((path) => {
      try {
        this.lockFileForAgent(path);
        fs.unlink(path).finally(() => {
          setTimeout(() => this.unlockFileForAgent(path), 500);
        });
      } catch (error) {
        this.logError(`Failed to delete file: ${path}`, error);
      }
    });
  }

  /**
   * Calculates what needs to be written vs deleted to transition
   * from the current state to the target state.
   */
  private calculateOperations(targetFiles: FileMap): FileOperations {
    const currentFiles = this.history[this.currentIndex]?.files || {};
    const filesToDelete: string[] = [];
    const filesToWrite: FileMap = {};

    // 1. Files to Write (Modified or New)
    Object.keys(targetFiles).forEach((path) => {
      if (targetFiles[path] !== currentFiles[path]) {
        filesToWrite[path] = targetFiles[path];
      }
    });

    // 2. Files to Delete (Exist in current, missing in target)
    Object.keys(currentFiles).forEach((path) => {
      if (!Object.hasOwn(targetFiles, path)) {
        filesToDelete.push(path);
      }
    });

    return {
      filesToWrite,
      filesToDelete,
    };
  }

  private updateWatcher(): void {
    const currentPendingChanges = this.getDiffState().map((diff) => diff.path);
    const currentlyWatchedFiles = Object.entries(
      this.watcher?.getWatched() ?? {},
    ).flatMap(([dirPath, fileNames]) =>
      fileNames.map((fileName) => join(dirPath, fileName)),
    );

    const needsToBeWatched = currentPendingChanges.filter(
      (path) => !currentlyWatchedFiles.includes(path),
    );
    const needsToBeUnwatched = currentlyWatchedFiles.filter(
      (path: string) => !currentPendingChanges.includes(path),
    );

    needsToBeWatched.forEach((path) => {
      this.watcher?.add(path);
    });
    needsToBeUnwatched.forEach((path) => {
      this.watcher?.unwatch(path);
    });
  }
}
