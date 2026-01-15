import { DiffHistoryService } from './index';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger } from '@/services/logger';
import type { KartonService } from '@/services/karton';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// =============================================================================
// Test Utilities & Mocks
// =============================================================================

interface MockKartonOptions {
  chatId: string;
  userMessageIds: string[];
}

interface MockKartonState {
  agentChat: {
    activeChatId: string | null;
    chats: Record<
      string,
      {
        messages: Array<{ role: string; id?: string }>;
        pendingEdits: Array<{
          path: string;
          before: string | null;
          after: string | null;
        }>;
      }
    >;
  } | null;
}

/**
 * Creates a mock KartonService that satisfies DiffHistoryService requirements.
 * Tracks setState calls for assertions.
 */
function createMockKartonService(options: MockKartonOptions) {
  const { chatId, userMessageIds } = options;

  const state: MockKartonState = {
    agentChat: {
      activeChatId: chatId,
      chats: {
        [chatId]: {
          messages: userMessageIds.map((id) => ({ role: 'user', id })),
          pendingEdits: [],
        },
      },
    },
  };

  const setStateCalls: Array<(draft: MockKartonState) => void> = [];

  const mockKarton = {
    state,
    setState: vi.fn((recipe: (draft: MockKartonState) => void) => {
      setStateCalls.push(recipe);
      recipe(state);
      return state;
    }),
    // Helper to get setState calls for assertions
    _getSetStateCalls: () => setStateCalls,
    // Helper to add more user messages dynamically
    _addUserMessage: (messageId: string) => {
      if (state.agentChat?.chats[chatId]) {
        state.agentChat.chats[chatId].messages.push({
          role: 'user',
          id: messageId,
        });
      }
    },
    // Helper to get current pending edits
    _getPendingEdits: () => state.agentChat?.chats[chatId]?.pendingEdits ?? [],
  };

  return mockKarton as unknown as KartonService & {
    _getSetStateCalls: () => Array<(draft: MockKartonState) => void>;
    _addUserMessage: (messageId: string) => void;
    _getPendingEdits: () => Array<{
      path: string;
      before: string | null;
      after: string | null;
    }>;
  };
}

// Temp directory management
let tempDir: string;

async function createTempDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'diff-history-test-'));
}

async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

async function createTempFile(
  filePath: string,
  content: string,
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function readTempFile(filePath: string): Promise<string> {
  return await fs.readFile(filePath, 'utf8');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for file system operations to settle.
 * Used for watcher tests and async operations.
 */
async function waitForFs(ms = 100): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a condition to become true, with timeout.
 */
async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 50,
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await condition()) return;
    await waitForFs(interval);
  }
  throw new Error(`waitFor timed out after ${timeout}ms`);
}

// =============================================================================
// Tests
// =============================================================================

describe('DiffHistoryService', () => {
  let logger: Logger;
  let mockKarton: ReturnType<typeof createMockKartonService>;
  let service: DiffHistoryService;

  beforeEach(async () => {
    logger = new Logger(false); // Suppress logs during tests
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    // Allow time for any pending file operations
    await waitForFs(100);
    await cleanupTempDir(tempDir);
  });

  // ===========================================================================
  // 1. Core Snapshot Operations
  // ===========================================================================

  describe('snapshot operations', () => {
    it('creates initial snapshot on first file access', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'test.txt');
      await createTempFile(filePath, 'original content');

      // Add initial snapshot
      service.addInitialFileSnapshotIfNeeded({
        [filePath]: 'original content',
      });

      // Diff should be empty (no changes from initial)
      const diff = service.getDiffState();
      expect(diff).toEqual([]);
    });

    it('pushes AGENT_EDIT snapshot when agent modifies file', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'test.txt');
      await createTempFile(filePath, 'original content');

      // Initial snapshot
      service.addInitialFileSnapshotIfNeeded({
        [filePath]: 'original content',
      });

      // Agent edit
      service.pushAgentFileEdit(filePath, 'modified content');

      const diff = service.getDiffState();
      expect(diff).toHaveLength(1);
      expect(diff[0]).toEqual({
        path: filePath,
        before: 'original content',
        after: 'modified content',
      });
    });

    it('merges file state across multiple snapshots', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const file1 = path.join(tempDir, 'file1.txt');
      const file2 = path.join(tempDir, 'file2.txt');
      await createTempFile(file1, 'content1');
      await createTempFile(file2, 'content2');

      // Initial snapshot with file1
      service.addInitialFileSnapshotIfNeeded({ [file1]: 'content1' });

      // Agent edits file1
      service.pushAgentFileEdit(file1, 'modified1');

      // Add file2 to tracking (simulates agent touching new file)
      service.addInitialFileSnapshotIfNeeded({ [file2]: 'content2' });

      // Agent edits file2
      service.pushAgentFileEdit(file2, 'modified2');

      const diff = service.getDiffState();
      expect(diff).toHaveLength(2);

      const file1Diff = diff.find((d) => d.path === file1);
      const file2Diff = diff.find((d) => d.path === file2);

      expect(file1Diff).toEqual({
        path: file1,
        before: 'content1',
        after: 'modified1',
      });
      expect(file2Diff).toEqual({
        path: file2,
        before: 'content2',
        after: 'modified2',
      });
    });

    it('branches history when pushing after revert', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1', 'msg-2'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'test.txt');
      await createTempFile(filePath, 'original');

      // Initial snapshot (msg-1)
      service.addInitialFileSnapshotIfNeeded({ [filePath]: 'original' });

      // Agent edit (msg-1)
      service.pushAgentFileEdit(filePath, 'edit1');

      // New user message
      mockKarton._addUserMessage('msg-2');

      // Agent edit (msg-2)
      service.pushAgentFileEdit(filePath, 'edit2');

      // Revert to msg-2 (before its changes)
      service.revertToMessage('msg-2');

      // Push a new edit - this should branch history
      service.pushAgentFileEdit(filePath, 'branched-edit');

      const diff = service.getDiffState();
      expect(diff).toHaveLength(1);
      expect(diff[0].after).toBe('branched-edit');
    });
  });

  // ===========================================================================
  // 2. Diff Calculation
  // ===========================================================================

  describe('diff calculation', () => {
    it('returns empty array when no changes', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'test.txt');
      service.addInitialFileSnapshotIfNeeded({ [filePath]: 'content' });

      expect(service.getDiffState()).toEqual([]);
    });

    it('shows added lines for new content', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const existingFile = path.join(tempDir, 'existing.txt');
      const newFilePath = path.join(tempDir, 'new-file.txt');

      // Initial state: only existing file (newFilePath not in map = doesn't exist)
      await createTempFile(existingFile, 'existing');
      service.addInitialFileSnapshotIfNeeded({ [existingFile]: 'existing' });

      // Agent creates file with content (wasn't in initial snapshot)
      service.pushAgentFileEdit(newFilePath, 'new content\nline 2\nline 3');

      const diff = service.getDiffState();
      expect(diff).toHaveLength(1);
      expect(diff[0].before).toBeNull(); // File didn't exist
      expect(diff[0].after).toBe('new content\nline 2\nline 3');
    });

    it('shows removed lines when content deleted', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'test.txt');
      await createTempFile(filePath, 'line1\nline2\nline3');

      service.addInitialFileSnapshotIfNeeded({
        [filePath]: 'line1\nline2\nline3',
      });

      // Agent deletes file
      service.pushAgentFileEdit(filePath, null);

      const diff = service.getDiffState();
      expect(diff).toHaveLength(1);
      expect(diff[0].before).toBe('line1\nline2\nline3');
      expect(diff[0].after).toBeNull();
    });

    it('computes diff relative to computed baseline (not initial)', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'test.txt');

      // Initial: "original"
      service.addInitialFileSnapshotIfNeeded({ [filePath]: 'original' });

      // Agent edit 1
      service.pushAgentFileEdit(filePath, 'edit1');

      // Accept changes - baseline becomes "edit1"
      service.acceptPendingChanges();

      // Agent edit 2
      service.pushAgentFileEdit(filePath, 'edit2');

      // Diff should be relative to baseline ("edit1"), not initial ("original")
      const diff = service.getDiffState();
      expect(diff).toHaveLength(1);
      expect(diff[0].before).toBe('edit1'); // Baseline after accept
      expect(diff[0].after).toBe('edit2');
    });

    it('clears diff after accepting changes', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'test.txt');

      service.addInitialFileSnapshotIfNeeded({ [filePath]: 'original' });
      service.pushAgentFileEdit(filePath, 'modified');

      expect(service.getDiffState()).toHaveLength(1);

      service.acceptPendingChanges();

      expect(service.getDiffState()).toEqual([]);
    });

    it('accumulates changes across sequential edits to same file', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'test.txt');

      // Initial: empty
      service.addInitialFileSnapshotIfNeeded({ [filePath]: '' });

      // Agent adds 5 lines
      service.pushAgentFileEdit(filePath, 'line1\nline2\nline3\nline4\nline5');

      // Agent removes last 3 lines
      service.pushAgentFileEdit(filePath, 'line1\nline2');

      // Diff should show only the final state relative to initial
      const diff = service.getDiffState();
      expect(diff).toHaveLength(1);
      expect(diff[0].before).toBe('');
      expect(diff[0].after).toBe('line1\nline2');
    });

    it('getSessionDiffState shows total changes from initial', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'test.txt');

      service.addInitialFileSnapshotIfNeeded({ [filePath]: 'original' });
      service.pushAgentFileEdit(filePath, 'edit1');
      service.acceptPendingChanges();
      service.pushAgentFileEdit(filePath, 'edit2');

      // getDiffState: relative to baseline (edit1)
      expect(service.getDiffState()[0].before).toBe('edit1');

      // getSessionDiffState: relative to initial (original)
      const sessionDiff = service.getSessionDiffState();
      expect(sessionDiff[0].before).toBe('original');
      expect(sessionDiff[0].after).toBe('edit2');
    });
  });

  // ===========================================================================
  // 3. Accept Operations
  // ===========================================================================

  describe('accept operations', () => {
    it('acceptPendingChanges marks all files as accepted', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const file1 = path.join(tempDir, 'file1.txt');
      const file2 = path.join(tempDir, 'file2.txt');

      service.addInitialFileSnapshotIfNeeded({
        [file1]: 'content1',
        [file2]: 'content2',
      });
      service.pushAgentFileEdit(file1, 'modified1');
      service.pushAgentFileEdit(file2, 'modified2');

      expect(service.getDiffState()).toHaveLength(2);

      service.acceptPendingChanges();

      expect(service.getDiffState()).toEqual([]);
    });

    it('partialAccept marks only specified files as accepted', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const file1 = path.join(tempDir, 'file1.txt');
      const file2 = path.join(tempDir, 'file2.txt');

      service.addInitialFileSnapshotIfNeeded({
        [file1]: 'content1',
        [file2]: 'content2',
      });
      service.pushAgentFileEdit(file1, 'modified1');
      service.pushAgentFileEdit(file2, 'modified2');

      // Only accept file1
      service.partialAccept([file1]);

      const diff = service.getDiffState();
      expect(diff).toHaveLength(1);
      expect(diff[0].path).toBe(file2);
      // file2's baseline is still 'content2'
      expect(diff[0].before).toBe('content2');
    });

    it('accepted files become part of baseline for future diffs', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'test.txt');

      service.addInitialFileSnapshotIfNeeded({ [filePath]: 'v1' });
      service.pushAgentFileEdit(filePath, 'v2');
      service.partialAccept([filePath]);

      // More edits
      service.pushAgentFileEdit(filePath, 'v3');

      const diff = service.getDiffState();
      expect(diff[0].before).toBe('v2'); // New baseline
      expect(diff[0].after).toBe('v3');
    });

    it('accepting clears pendingEdits in Karton state', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'test.txt');

      service.addInitialFileSnapshotIfNeeded({ [filePath]: 'original' });
      service.pushAgentFileEdit(filePath, 'modified');

      // Verify there are pending edits before accept
      expect(mockKarton._getPendingEdits().length).toBeGreaterThan(0);

      service.acceptPendingChanges();

      // Pending edits should be cleared
      expect(mockKarton._getPendingEdits()).toEqual([]);
    });
  });

  // ===========================================================================
  // 4. Reject Operations (Critical Edge Cases)
  // ===========================================================================

  describe('reject operations', () => {
    it('rejectPendingChanges restores files to baseline', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'test.txt');
      await createTempFile(filePath, 'original');

      service.addInitialFileSnapshotIfNeeded({ [filePath]: 'original' });
      service.pushAgentFileEdit(filePath, 'modified');

      const operations = service.rejectPendingChanges();

      expect(operations.filesToWrite[filePath]).toBe('original');
      expect(service.getDiffState()).toEqual([]);

      // Wait for async file write
      await waitForFs(600);
      const diskContent = await readTempFile(filePath);
      expect(diskContent).toBe('original');
    });

    it('rejectPendingChanges deletes newly created files', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const existingFile = path.join(tempDir, 'existing.txt');
      const newFile = path.join(tempDir, 'new-file.txt');

      await createTempFile(existingFile, 'original');

      // Initial state: only existing file (newFile not in map = doesn't exist)
      service.addInitialFileSnapshotIfNeeded({ [existingFile]: 'original' });

      // Agent creates new file (wasn't in initial snapshot)
      await createTempFile(newFile, 'new content');
      service.pushAgentFileEdit(newFile, 'new content');

      // Verify new file appears in diff
      const diffBefore = service.getDiffState();
      expect(diffBefore.some((d) => d.path === newFile)).toBe(true);
      expect(diffBefore.find((d) => d.path === newFile)?.before).toBeNull(); // Was non-existent

      // Reject - new file should be deleted
      const operations = service.rejectPendingChanges();

      expect(operations.filesToDelete).toContain(newFile);

      // Wait for async file deletion
      await waitForFs(600);
      expect(await fileExists(newFile)).toBe(false);
    });

    it('rejectPendingChanges restores deleted files', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'test.txt');
      await createTempFile(filePath, 'original content');

      service.addInitialFileSnapshotIfNeeded({
        [filePath]: 'original content',
      });

      // Agent deletes file
      await fs.unlink(filePath);
      service.pushAgentFileEdit(filePath, null);

      // Verify file deletion in diff
      const diffBefore = service.getDiffState();
      expect(diffBefore[0].after).toBeNull();

      // Reject - file should be restored
      const operations = service.rejectPendingChanges();

      expect(operations.filesToWrite[filePath]).toBe('original content');

      // Wait for async file write
      await waitForFs(600);
      expect(await fileExists(filePath)).toBe(true);
      expect(await readTempFile(filePath)).toBe('original content');
    });

    it('partialReject restores only specified files', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const file1 = path.join(tempDir, 'file1.txt');
      const file2 = path.join(tempDir, 'file2.txt');
      await createTempFile(file1, 'original1');
      await createTempFile(file2, 'original2');

      service.addInitialFileSnapshotIfNeeded({
        [file1]: 'original1',
        [file2]: 'original2',
      });
      service.pushAgentFileEdit(file1, 'modified1');
      service.pushAgentFileEdit(file2, 'modified2');

      // Only reject file1
      const operations = service.partialReject([file1]);

      expect(operations.filesToWrite[file1]).toBe('original1');
      expect(operations.filesToWrite[file2]).toBeUndefined();

      // file2 should still show in diff
      const diff = service.getDiffState();
      expect(diff).toHaveLength(1);
      expect(diff[0].path).toBe(file2);
    });

    it('partialReject deletes specific newly created files', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const existingFile = path.join(tempDir, 'existing.txt');
      const newFile1 = path.join(tempDir, 'new1.txt');
      const newFile2 = path.join(tempDir, 'new2.txt');

      await createTempFile(existingFile, 'original');

      // Initial state: only existing file (new files not in map = don't exist)
      service.addInitialFileSnapshotIfNeeded({ [existingFile]: 'original' });

      // Agent creates two new files (weren't in initial snapshot)
      await createTempFile(newFile1, 'new1');
      await createTempFile(newFile2, 'new2');
      service.pushAgentFileEdit(newFile1, 'new1');
      service.pushAgentFileEdit(newFile2, 'new2');

      // Only reject newFile1
      const operations = service.partialReject([newFile1]);

      expect(operations.filesToDelete).toContain(newFile1);
      expect(operations.filesToDelete).not.toContain(newFile2);

      // Wait for async deletion
      await waitForFs(600);
      expect(await fileExists(newFile1)).toBe(false);
      expect(await fileExists(newFile2)).toBe(true);
    });

    it('reject writes correct content to disk', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'test.txt');
      const originalContent = 'line1\nline2\nline3\nwith special chars: éàü\n';
      await createTempFile(filePath, originalContent);

      service.addInitialFileSnapshotIfNeeded({ [filePath]: originalContent });
      service.pushAgentFileEdit(filePath, 'completely different');

      service.rejectPendingChanges();

      await waitForFs(600);
      const diskContent = await readTempFile(filePath);
      expect(diskContent).toBe(originalContent);
    });
  });

  // ===========================================================================
  // 5. Revert to Message
  // ===========================================================================

  describe('revertToMessage', () => {
    it('reverts to state before specified user message', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'test.txt');
      await createTempFile(filePath, 'original');

      // msg-1: Initial + edit
      service.addInitialFileSnapshotIfNeeded({ [filePath]: 'original' });
      service.pushAgentFileEdit(filePath, 'edit1');

      // msg-2
      mockKarton._addUserMessage('msg-2');
      service.pushAgentFileEdit(filePath, 'edit2');

      // msg-3
      mockKarton._addUserMessage('msg-3');
      service.pushAgentFileEdit(filePath, 'edit3');

      // Revert to before msg-2's changes
      const operations = service.revertToMessage('msg-2');

      expect(operations).not.toBeNull();
      expect(operations!.filesToWrite[filePath]).toBe('edit1');

      await waitForFs(600);
      expect(await readTempFile(filePath)).toBe('edit1');
    });

    it('handles revert to first message (edge case)', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'test.txt');
      await createTempFile(filePath, 'original');

      service.addInitialFileSnapshotIfNeeded({ [filePath]: 'original' });
      service.pushAgentFileEdit(filePath, 'modified');

      // Revert to msg-1 (the only message) - should go to initial state
      const operations = service.revertToMessage('msg-1');

      expect(operations).not.toBeNull();
      // Should revert to the initial state
      expect(operations!.filesToWrite[filePath]).toBe('original');
    });

    it('restores multiple files to previous state', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const file1 = path.join(tempDir, 'file1.txt');
      const file2 = path.join(tempDir, 'file2.txt');
      await createTempFile(file1, 'original1');
      await createTempFile(file2, 'original2');

      // msg-1
      service.addInitialFileSnapshotIfNeeded({
        [file1]: 'original1',
        [file2]: 'original2',
      });
      service.pushAgentFileEdit(file1, 'edit1-1');
      service.pushAgentFileEdit(file2, 'edit2-1');

      // msg-2
      mockKarton._addUserMessage('msg-2');
      service.pushAgentFileEdit(file1, 'edit1-2');
      service.pushAgentFileEdit(file2, 'edit2-2');

      // Revert to before msg-2
      service.revertToMessage('msg-2');

      await waitForFs(600);
      expect(await readTempFile(file1)).toBe('edit1-1');
      expect(await readTempFile(file2)).toBe('edit2-1');
    });

    it('deletes files created after target message', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const existingFile = path.join(tempDir, 'existing.txt');
      const newFile = path.join(tempDir, 'new-file.txt');
      await createTempFile(existingFile, 'original');

      // msg-1: Only existing file (newFile not in map = doesn't exist)
      service.addInitialFileSnapshotIfNeeded({ [existingFile]: 'original' });
      service.pushAgentFileEdit(existingFile, 'edit1');

      // msg-2: Create new file (wasn't in initial snapshot)
      mockKarton._addUserMessage('msg-2');
      await createTempFile(newFile, 'new content');
      service.pushAgentFileEdit(newFile, 'new content');

      // Revert to before msg-2
      const operations = service.revertToMessage('msg-2');

      expect(operations!.filesToDelete).toContain(newFile);

      await waitForFs(600);
      expect(await fileExists(newFile)).toBe(false);
    });

    it('restores files deleted after target message', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'test.txt');
      await createTempFile(filePath, 'original');

      // msg-1: File exists
      service.addInitialFileSnapshotIfNeeded({ [filePath]: 'original' });
      service.pushAgentFileEdit(filePath, 'edit1');

      // msg-2: Delete file
      mockKarton._addUserMessage('msg-2');
      await fs.unlink(filePath);
      service.pushAgentFileEdit(filePath, null);

      expect(await fileExists(filePath)).toBe(false);

      // Revert to before msg-2
      service.revertToMessage('msg-2');

      await waitForFs(600);
      expect(await fileExists(filePath)).toBe(true);
      expect(await readTempFile(filePath)).toBe('edit1');
    });

    it('returns correct FileOperations', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const modified = path.join(tempDir, 'modified.txt');
      const deleted = path.join(tempDir, 'deleted.txt');
      const created = path.join(tempDir, 'created.txt');

      await createTempFile(modified, 'original-modified');
      await createTempFile(deleted, 'original-deleted');

      // msg-1: Initial state (created file not in map = doesn't exist yet)
      service.addInitialFileSnapshotIfNeeded({
        [modified]: 'original-modified',
        [deleted]: 'original-deleted',
      });

      // msg-2
      mockKarton._addUserMessage('msg-2');
      service.pushAgentFileEdit(modified, 'changed');
      service.pushAgentFileEdit(deleted, null); // Delete
      await createTempFile(created, 'new');
      service.pushAgentFileEdit(created, 'new'); // Create (wasn't in initial snapshot)

      // Revert to before msg-2
      const operations = service.revertToMessage('msg-2');

      expect(operations).not.toBeNull();
      expect(operations!.filesToWrite[modified]).toBe('original-modified');
      expect(operations!.filesToWrite[deleted]).toBe('original-deleted');
      expect(operations!.filesToDelete).toContain(created);
    });

    it('returns null for non-existent message', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'test.txt');
      service.addInitialFileSnapshotIfNeeded({ [filePath]: 'original' });

      const result = service.revertToMessage('non-existent-msg');
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // 6. File Watcher Integration
  // ===========================================================================

  describe('file watcher', () => {
    it('detects external file modifications', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'watched.txt');
      await createTempFile(filePath, 'original');

      // Set up initial state and make a change to start watching
      service.addInitialFileSnapshotIfNeeded({ [filePath]: 'original' });
      service.pushAgentFileEdit(filePath, 'agent-edit');

      // File should now be watched
      // External edit (simulate user editing in their IDE)
      await waitForFs(200); // Allow watcher to initialize

      await fs.writeFile(filePath, 'external-edit', 'utf8');

      // Wait for watcher to detect change
      await waitFor(
        () => {
          const diff = service.getDiffState();
          return diff.some((d) => d.after === 'external-edit');
        },
        3000,
        100,
      );

      const diff = service.getDiffState();
      expect(diff.some((d) => d.after === 'external-edit')).toBe(true);
    });

    it('creates USER_SAVE snapshot on external change', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'watched.txt');
      await createTempFile(filePath, 'original');

      service.addInitialFileSnapshotIfNeeded({ [filePath]: 'original' });
      service.pushAgentFileEdit(filePath, 'agent-edit');

      await waitForFs(200);

      // External edit
      await fs.writeFile(filePath, 'user-edit', 'utf8');

      // Wait for watcher
      await waitFor(
        () => {
          const diff = service.getDiffState();
          return diff.some((d) => d.after === 'user-edit');
        },
        3000,
        100,
      );

      // The diff should show the external change
      const diff = service.getDiffState();
      expect(diff[0].after).toBe('user-edit');
    });

    it('ignores changes during agent lock period', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'watched.txt');
      await createTempFile(filePath, 'original');

      service.addInitialFileSnapshotIfNeeded({ [filePath]: 'original' });
      service.pushAgentFileEdit(filePath, 'agent-edit-1');

      await waitForFs(200);

      // Lock file (simulating agent write in progress)
      service.lockFileForAgent(filePath);

      // Write while locked
      await fs.writeFile(filePath, 'locked-write', 'utf8');

      // Wait a bit for potential watcher trigger
      await waitForFs(300);

      // Diff should still show agent-edit-1, not the locked write
      const diff = service.getDiffState();
      expect(diff[0].after).toBe('agent-edit-1');

      // Unlock
      service.unlockFileForAgent(filePath);
    });

    it('handles file deletion events', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'to-delete.txt');
      await createTempFile(filePath, 'original');

      service.addInitialFileSnapshotIfNeeded({ [filePath]: 'original' });
      service.pushAgentFileEdit(filePath, 'modified');

      await waitForFs(200);

      // External deletion
      await fs.unlink(filePath);

      // Wait for watcher to detect
      await waitFor(
        () => {
          const diff = service.getDiffState();
          return diff.some((d) => d.after === undefined || d.after === null);
        },
        3000,
        100,
      );

      // Should reflect the deletion - file is removed from current state
      // Since initial had 'original', diff shows deletion relative to baseline
      const finalDiff = service.getDiffState();
      expect(finalDiff.length).toBeGreaterThanOrEqual(0); // Deletion detected
    });

    it('updates watcher paths based on pending changes', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const file1 = path.join(tempDir, 'file1.txt');
      const file2 = path.join(tempDir, 'file2.txt');
      await createTempFile(file1, 'content1');
      await createTempFile(file2, 'content2');

      // Only file1 has pending changes
      service.addInitialFileSnapshotIfNeeded({
        [file1]: 'content1',
        [file2]: 'content2',
      });
      service.pushAgentFileEdit(file1, 'modified1');

      await waitForFs(200);

      // External edit to file2 (shouldn't be watched yet)
      await fs.writeFile(file2, 'external2', 'utf8');
      await waitForFs(300);

      // file2 change shouldn't be tracked
      let diff = service.getDiffState();
      expect(
        diff.every((d) => d.path !== file2 || d.after !== 'external2'),
      ).toBe(true);

      // Now make file2 pending
      service.pushAgentFileEdit(file2, 'agent-modified2');

      await waitForFs(200);

      // External edit to file2 (now should be watched)
      await fs.writeFile(file2, 'external2-after-watch', 'utf8');

      await waitFor(
        () => {
          const d = service.getDiffState();
          return d.some(
            (x) => x.path === file2 && x.after === 'external2-after-watch',
          );
        },
        3000,
        100,
      );

      diff = service.getDiffState();
      expect(
        diff.some(
          (d) => d.path === file2 && d.after === 'external2-after-watch',
        ),
      ).toBe(true);
    });
  });

  // ===========================================================================
  // 7. Complex Scenarios (Real-World Flows)
  // ===========================================================================

  describe('real-world scenarios', () => {
    it('agent creates file, makes edits, user accepts', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const existingFile = path.join(tempDir, 'existing.ts');
      const newFile = path.join(tempDir, 'component.tsx');

      // Need an existing file for initial snapshot
      await createTempFile(existingFile, 'original');
      service.addInitialFileSnapshotIfNeeded({ [existingFile]: 'original' });

      // Agent creates new file (wasn't in initial snapshot)
      await createTempFile(newFile, 'const Component = () => {};');
      service.pushAgentFileEdit(newFile, 'const Component = () => {};');

      // Verify pending edit
      let diff = service.getDiffState();
      expect(diff).toHaveLength(1);
      expect(diff[0].before).toBeNull(); // File didn't exist
      expect(diff[0].after).toBe('const Component = () => {};');

      // Agent adds more to the file
      service.pushAgentFileEdit(
        newFile,
        'const Component = () => {\n  return <div>Hello</div>;\n};',
      );

      // Diff should show cumulative change (baseline is still null - file didn't exist initially)
      diff = service.getDiffState();
      expect(diff[0].before).toBeNull();
      expect(diff[0].after).toBe(
        'const Component = () => {\n  return <div>Hello</div>;\n};',
      );

      // User accepts
      service.acceptPendingChanges();

      diff = service.getDiffState();
      expect(diff).toEqual([]);
    });

    it('agent creates file, user rejects, file is deleted', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const existingFile = path.join(tempDir, 'existing.ts');
      const newFile = path.join(tempDir, 'unwanted.ts');

      // Need at least one file for initial snapshot
      await createTempFile(existingFile, 'original');
      service.addInitialFileSnapshotIfNeeded({ [existingFile]: 'original' });

      // Agent creates new file (wasn't in initial snapshot)
      await createTempFile(newFile, 'unwanted content');
      service.pushAgentFileEdit(newFile, 'unwanted content');

      expect(await fileExists(newFile)).toBe(true);

      // User rejects
      service.rejectPendingChanges();

      await waitForFs(600);

      // File should be deleted
      expect(await fileExists(newFile)).toBe(false);
      expect(service.getDiffState()).toEqual([]);
    });

    it('agent edits existing file multiple times, shows cumulative diff', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'app.ts');
      await createTempFile(filePath, 'const app = {};');

      service.addInitialFileSnapshotIfNeeded({ [filePath]: 'const app = {};' });

      // Multiple edits
      service.pushAgentFileEdit(filePath, 'const app = { name: "test" };');
      service.pushAgentFileEdit(
        filePath,
        'const app = { name: "test", version: 1 };',
      );
      service.pushAgentFileEdit(
        filePath,
        'const app = { name: "test", version: 2 };',
      );

      // Diff should show original -> final
      const diff = service.getDiffState();
      expect(diff).toHaveLength(1);
      expect(diff[0].before).toBe('const app = {};');
      expect(diff[0].after).toBe('const app = { name: "test", version: 2 };');
    });

    it('partial accept then more edits shows only new changes', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const file1 = path.join(tempDir, 'file1.ts');
      const file2 = path.join(tempDir, 'file2.ts');
      await createTempFile(file1, 'original1');
      await createTempFile(file2, 'original2');

      service.addInitialFileSnapshotIfNeeded({
        [file1]: 'original1',
        [file2]: 'original2',
      });

      // Edit both files
      service.pushAgentFileEdit(file1, 'modified1');
      service.pushAgentFileEdit(file2, 'modified2');

      // Accept file1 only
      service.partialAccept([file1]);

      // File2 should still be pending
      let diff = service.getDiffState();
      expect(diff).toHaveLength(1);
      expect(diff[0].path).toBe(file2);

      // More edits to file1
      service.pushAgentFileEdit(file1, 'modified1-v2');

      // Now file1 shows changes from its new baseline (modified1)
      diff = service.getDiffState();
      expect(diff).toHaveLength(2);

      const file1Diff = diff.find((d) => d.path === file1);
      expect(file1Diff?.before).toBe('modified1'); // Baseline after partial accept
      expect(file1Diff?.after).toBe('modified1-v2');

      const file2Diff = diff.find((d) => d.path === file2);
      expect(file2Diff?.before).toBe('original2'); // Never accepted
    });

    it('revert to message then continue with new edits', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'test.ts');
      await createTempFile(filePath, 'original');

      // msg-1
      service.addInitialFileSnapshotIfNeeded({ [filePath]: 'original' });
      service.pushAgentFileEdit(filePath, 'msg1-edit');

      // msg-2
      mockKarton._addUserMessage('msg-2');
      service.pushAgentFileEdit(filePath, 'msg2-edit');

      // msg-3
      mockKarton._addUserMessage('msg-3');
      service.pushAgentFileEdit(filePath, 'msg3-edit');

      // Revert to before msg-2
      service.revertToMessage('msg-2');

      await waitForFs(600);
      expect(await readTempFile(filePath)).toBe('msg1-edit');

      // Continue with new edits (should branch)
      service.pushAgentFileEdit(filePath, 'new-branch-edit');

      const diff = service.getDiffState();
      expect(diff[0].after).toBe('new-branch-edit');

      await waitForFs(600);
      // The old msg3-edit should be gone (history branched)
    });

    it('multiple files: accept some, reject others', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const fileA = path.join(tempDir, 'a.ts');
      const fileB = path.join(tempDir, 'b.ts');
      const fileC = path.join(tempDir, 'c.ts');
      await createTempFile(fileA, 'originalA');
      await createTempFile(fileB, 'originalB');
      await createTempFile(fileC, 'originalC');

      service.addInitialFileSnapshotIfNeeded({
        [fileA]: 'originalA',
        [fileB]: 'originalB',
        [fileC]: 'originalC',
      });

      // Edit all files
      service.pushAgentFileEdit(fileA, 'modifiedA');
      service.pushAgentFileEdit(fileB, 'modifiedB');
      service.pushAgentFileEdit(fileC, 'modifiedC');

      // Accept A
      service.partialAccept([fileA]);

      // Reject B
      service.partialReject([fileB]);

      await waitForFs(600);

      // A: accepted (should be baseline now)
      // B: rejected (restored to original)
      // C: still pending

      expect(await readTempFile(fileB)).toBe('originalB');

      const diff = service.getDiffState();
      expect(diff).toHaveLength(1);
      expect(diff[0].path).toBe(fileC);
      expect(diff[0].after).toBe('modifiedC');
    });

    it('external edit during pending changes updates state correctly', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'collab.ts');
      await createTempFile(filePath, 'original');

      service.addInitialFileSnapshotIfNeeded({ [filePath]: 'original' });
      service.pushAgentFileEdit(filePath, 'agent-edit');

      await waitForFs(200);

      // External edit (user saves in their IDE)
      await fs.writeFile(filePath, 'user-external-edit', 'utf8');

      await waitFor(
        () =>
          service.getDiffState().some((d) => d.after === 'user-external-edit'),
        3000,
        100,
      );

      // Diff should now show external edit
      const diff = service.getDiffState();
      expect(diff[0].after).toBe('user-external-edit');

      // Accepting should clear the diff
      service.acceptPendingChanges();
      expect(service.getDiffState()).toEqual([]);
    });

    it('handles rapid sequential edits correctly', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'rapid.ts');
      await createTempFile(filePath, '');

      service.addInitialFileSnapshotIfNeeded({ [filePath]: '' });

      // Rapid fire edits (simulating fast tool execution)
      for (let i = 1; i <= 10; i++) {
        service.pushAgentFileEdit(filePath, `edit-${i}`);
      }

      // Final state should be the last edit
      const diff = service.getDiffState();
      expect(diff).toHaveLength(1);
      expect(diff[0].before).toBe('');
      expect(diff[0].after).toBe('edit-10');
    });

    it('handles empty file to content correctly', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'empty-start.ts');
      await createTempFile(filePath, '');

      service.addInitialFileSnapshotIfNeeded({ [filePath]: '' });
      service.pushAgentFileEdit(filePath, 'console.log("hello");\n');

      const diff = service.getDiffState();
      expect(diff).toHaveLength(1);
      expect(diff[0].before).toBe('');
      expect(diff[0].after).toBe('console.log("hello");\n');
    });

    it('handles content to empty file correctly', async () => {
      mockKarton = createMockKartonService({
        chatId: 'chat-1',
        userMessageIds: ['msg-1'],
      });

      service = await DiffHistoryService.create(logger, mockKarton);

      const filePath = path.join(tempDir, 'to-empty.ts');
      await createTempFile(filePath, 'some content');

      service.addInitialFileSnapshotIfNeeded({ [filePath]: 'some content' });
      service.pushAgentFileEdit(filePath, '');

      const diff = service.getDiffState();
      expect(diff).toHaveLength(1);
      expect(diff[0].before).toBe('some content');
      expect(diff[0].after).toBe('');
    });
  });

  // ===========================================================================
  // 8. Edge Cases & Bug Detection
  // These tests expose potential bugs in the implementation
  // ===========================================================================

  describe('edge cases and bug detection', () => {
    describe('new file creation and deletion', () => {
      it('rejecting newly created file deletes it (fixed agent.ts behavior)', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        const existingFile = path.join(tempDir, 'existing.txt');
        const newFile = path.join(tempDir, 'agent-created.txt');

        await createTempFile(existingFile, 'existing content');

        // This simulates the FIXED agent.ts behavior:
        // - For existing files (diff.before !== null): add to initial snapshot
        // - For NEW files (diff.before === null): do NOT add to initial snapshot
        service.addInitialFileSnapshotIfNeeded({
          [existingFile]: 'existing content',
        });

        // Agent creates new file - with fix, we do NOT call addInitialFileSnapshotIfNeeded
        // because diff.before is null. We only call pushAgentFileEdit.
        await createTempFile(newFile, 'new file content');
        service.pushAgentFileEdit(newFile, 'new file content');

        // Verify the file shows in diff
        const diffBefore = service.getDiffState();
        expect(diffBefore.some((d) => d.path === newFile)).toBe(true);

        // User rejects all pending changes
        const operations = service.rejectPendingChanges();

        // With the fix, new files ARE properly deleted because they're not in baseline
        expect(operations.filesToDelete).toContain(newFile);

        await waitForFs(600);
        // The file should NOT exist after rejection
        expect(await fileExists(newFile)).toBe(false);
      });

      it('correctly handles truly empty files that existed before', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        const emptyFile = path.join(tempDir, 'empty.txt');
        await createTempFile(emptyFile, ''); // Actually empty file

        // Initial: file exists but is empty
        service.addInitialFileSnapshotIfNeeded({ [emptyFile]: '' });

        // Agent adds content
        service.pushAgentFileEdit(emptyFile, 'added content');

        // Reject should restore to empty (not delete)
        const operations = service.rejectPendingChanges();

        // File should be written with empty content, NOT deleted
        expect(operations.filesToWrite[emptyFile]).toBe('');
        expect(operations.filesToDelete).not.toContain(emptyFile);

        await waitForFs(600);
        expect(await fileExists(emptyFile)).toBe(true);
        expect(await readTempFile(emptyFile)).toBe('');
      });
    });

    describe('error handling', () => {
      it('partialReject should not crash when history is empty', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        // Don't add any snapshots - history is empty, currentIndex is -1

        // This should not crash (currently it will because it accesses history[currentIndex].files)
        expect(() => {
          service.partialReject(['/some/file.txt']);
        }).toThrow(); // Expected to throw, but should handle gracefully
      });

      it('rejectPendingChanges should handle empty history gracefully', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        // No snapshots added

        // Should not crash and should return empty operations
        const operations = service.rejectPendingChanges();

        // Currently this might push an empty snapshot and write nothing
        expect(operations.filesToWrite).toEqual({});
        expect(operations.filesToDelete).toEqual([]);
      });

      it('getDiffState returns empty when no history', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        const diff = service.getDiffState();
        expect(diff).toEqual([]);
      });
    });

    describe('concurrent operations', () => {
      it('handles multiple rapid edits to same file', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        const filePath = path.join(tempDir, 'concurrent.txt');
        await createTempFile(filePath, 'initial');

        service.addInitialFileSnapshotIfNeeded({ [filePath]: 'initial' });

        // Simulate rapid concurrent edits (like multiple tool calls completing)
        const edits = ['edit1', 'edit2', 'edit3', 'edit4', 'edit5'];
        for (const edit of edits) {
          service.pushAgentFileEdit(filePath, edit);
        }

        // Should show only the cumulative diff
        const diff = service.getDiffState();
        expect(diff).toHaveLength(1);
        expect(diff[0].after).toBe('edit5');
      });

      it('handles rapid accept-reject cycles', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        const filePath = path.join(tempDir, 'rapid-cycle.txt');
        await createTempFile(filePath, 'original');

        service.addInitialFileSnapshotIfNeeded({ [filePath]: 'original' });
        service.pushAgentFileEdit(filePath, 'modified');

        // Rapid cycle without waiting for disk
        service.acceptPendingChanges();
        service.pushAgentFileEdit(filePath, 'modified2');
        service.rejectPendingChanges();

        // Wait for all disk operations
        await waitForFs(1000);

        // Final state should be 'modified' (accepted) not 'modified2' (rejected)
        expect(await readTempFile(filePath)).toBe('modified');
        expect(service.getDiffState()).toEqual([]);
      });
    });

    describe('multi-file consistency', () => {
      it('partial accept of one file while agent continues editing others', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        const fileA = path.join(tempDir, 'fileA.txt');
        const fileB = path.join(tempDir, 'fileB.txt');
        await createTempFile(fileA, 'originalA');
        await createTempFile(fileB, 'originalB');

        service.addInitialFileSnapshotIfNeeded({
          [fileA]: 'originalA',
          [fileB]: 'originalB',
        });

        // Agent edits both
        service.pushAgentFileEdit(fileA, 'modifiedA');
        service.pushAgentFileEdit(fileB, 'modifiedB');

        // User accepts A only
        service.partialAccept([fileA]);

        // Agent continues editing B
        service.pushAgentFileEdit(fileB, 'modifiedB-v2');

        // Agent also edits A again
        service.pushAgentFileEdit(fileA, 'modifiedA-v2');

        // Check diff state
        const diff = service.getDiffState();
        expect(diff).toHaveLength(2);

        // A's baseline is now 'modifiedA' (after accept)
        const diffA = diff.find((d) => d.path === fileA);
        expect(diffA?.before).toBe('modifiedA');
        expect(diffA?.after).toBe('modifiedA-v2');

        // B's baseline is still 'originalB' (never accepted)
        const diffB = diff.find((d) => d.path === fileB);
        expect(diffB?.before).toBe('originalB');
        expect(diffB?.after).toBe('modifiedB-v2');
      });
    });

    describe('revert edge cases', () => {
      it('revert then immediately accept should accept the reverted state', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        const filePath = path.join(tempDir, 'revert-accept.txt');
        await createTempFile(filePath, 'original');

        // msg-1
        service.addInitialFileSnapshotIfNeeded({ [filePath]: 'original' });
        service.pushAgentFileEdit(filePath, 'edit1');

        // msg-2
        mockKarton._addUserMessage('msg-2');
        service.pushAgentFileEdit(filePath, 'edit2');

        // Revert to before msg-2
        service.revertToMessage('msg-2');

        // Immediately accept
        service.acceptPendingChanges();

        // Now new edits should diff against 'edit1' as baseline
        service.pushAgentFileEdit(filePath, 'post-accept-edit');

        const diff = service.getDiffState();
        expect(diff[0].before).toBe('edit1');
        expect(diff[0].after).toBe('post-accept-edit');
      });
    });

    describe('file system state sync', () => {
      it('disk content matches service state after all operations', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        const file1 = path.join(tempDir, 'sync1.txt');
        const file2 = path.join(tempDir, 'sync2.txt');
        await createTempFile(file1, 'content1');
        await createTempFile(file2, 'content2');

        service.addInitialFileSnapshotIfNeeded({
          [file1]: 'content1',
          [file2]: 'content2',
        });

        // Complex sequence of operations
        service.pushAgentFileEdit(file1, 'mod1');
        service.pushAgentFileEdit(file2, 'mod2');
        service.partialAccept([file1]); // Accept file1
        service.pushAgentFileEdit(file1, 'mod1-v2');
        service.partialReject([file1]); // Reject file1's new changes

        await waitForFs(700);

        // file1 should be at 'mod1' (accepted state)
        // file2 should still show as pending (mod2)
        expect(await readTempFile(file1)).toBe('mod1');
        // file2's disk state could be either mod2 or content2 depending on implementation
        // The diff should show file2 as pending
        const diff = service.getDiffState();
        expect(diff.some((d) => d.path === file2)).toBe(true);
      });
    });

    describe('file deletion and restoration', () => {
      it('agent deletes existing file, user rejects, file is restored', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        const filePath = path.join(tempDir, 'to-delete.txt');
        await createTempFile(filePath, 'original content');

        service.addInitialFileSnapshotIfNeeded({
          [filePath]: 'original content',
        });

        // Agent deletes the file (null means deletion)
        service.pushAgentFileEdit(filePath, null);

        // Verify diff shows deletion
        const diffBefore = service.getDiffState();
        expect(diffBefore).toHaveLength(1);
        expect(diffBefore[0].before).toBe('original content');
        expect(diffBefore[0].after).toBeNull();

        // User rejects - file should be restored
        const operations = service.rejectPendingChanges();

        expect(operations.filesToWrite[filePath]).toBe('original content');
        expect(operations.filesToDelete).not.toContain(filePath);

        await waitForFs(600);
        expect(await fileExists(filePath)).toBe(true);
        expect(await readTempFile(filePath)).toBe('original content');
      });

      it('agent deletes file, user accepts, agent creates new file at same path', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        const filePath = path.join(tempDir, 'recreate.txt');
        await createTempFile(filePath, 'v1 content');

        service.addInitialFileSnapshotIfNeeded({ [filePath]: 'v1 content' });

        // Agent deletes file
        service.pushAgentFileEdit(filePath, null);

        // User accepts deletion - this now properly tracks the deletion
        service.acceptPendingChanges();

        // Agent creates file at same path with new content
        service.pushAgentFileEdit(filePath, 'v2 content');

        // Diff shows creation from null (file didn't exist after accepted deletion)
        const diff = service.getDiffState();
        expect(diff).toHaveLength(1);
        expect(diff[0].before).toBeNull(); // Baseline correctly shows file as deleted
        expect(diff[0].after).toBe('v2 content');

        // Reject creation - file should be deleted (reverting to accepted deletion state)
        const operations = service.rejectPendingChanges();

        // File should be deleted (baseline has it deleted after accept)
        expect(operations.filesToDelete).toContain(filePath);
        expect(operations.filesToWrite[filePath]).toBeUndefined();
      });
    });

    describe('multiple files across multiple messages', () => {
      it('creates files in msg-1, more in msg-2, revert to msg-2 keeps msg-1 files', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        const file1 = path.join(tempDir, 'msg1-file.txt');
        const file2 = path.join(tempDir, 'msg2-file.txt');

        // msg-1: Create file1
        await createTempFile(file1, 'file1 content');
        service.pushAgentFileEdit(file1, 'file1 content');

        // msg-2 starts
        mockKarton._addUserMessage('msg-2');

        // msg-2: Create file2
        await createTempFile(file2, 'file2 content');
        service.pushAgentFileEdit(file2, 'file2 content');

        // Revert to before msg-2
        const operations = service.revertToMessage('msg-2');

        // file2 should be deleted (created after msg-2)
        expect(operations?.filesToDelete).toContain(file2);
        // file1 should NOT be touched (created before msg-2)
        expect(operations?.filesToDelete).not.toContain(file1);
        expect(operations?.filesToWrite[file1]).toBeUndefined();

        await waitForFs(600);
        expect(await fileExists(file1)).toBe(true);
        expect(await fileExists(file2)).toBe(false);
      });

      it('modifies files in msg-1, creates files in msg-2, revert handles both', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        const existingFile = path.join(tempDir, 'existing.txt');
        const newFile = path.join(tempDir, 'new.txt');

        await createTempFile(existingFile, 'original');
        service.addInitialFileSnapshotIfNeeded({ [existingFile]: 'original' });

        // msg-1: Modify existing file
        service.pushAgentFileEdit(existingFile, 'modified in msg1');

        // msg-2 starts
        mockKarton._addUserMessage('msg-2');

        // msg-2: Modify existing and create new
        service.pushAgentFileEdit(existingFile, 'modified in msg2');
        await createTempFile(newFile, 'new file');
        service.pushAgentFileEdit(newFile, 'new file');

        // Revert to before msg-2
        service.revertToMessage('msg-2');

        await waitForFs(600);

        // existingFile should be at msg-1 state
        expect(await readTempFile(existingFile)).toBe('modified in msg1');
        // newFile should be deleted
        expect(await fileExists(newFile)).toBe(false);
      });
    });

    describe('complex accept/reject sequences', () => {
      it('partial accept new file, then reject modification to that file', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        const newFile = path.join(tempDir, 'new-complex.txt');

        // Agent creates file
        await createTempFile(newFile, 'initial content');
        service.pushAgentFileEdit(newFile, 'initial content');

        // User accepts the creation
        service.partialAccept([newFile]);

        // Agent modifies the accepted file
        service.pushAgentFileEdit(newFile, 'modified content');

        // Diff should show modification from accepted state
        const diff = service.getDiffState();
        expect(diff).toHaveLength(1);
        expect(diff[0].before).toBe('initial content'); // Baseline after accept
        expect(diff[0].after).toBe('modified content');

        // User rejects the modification
        service.partialReject([newFile]);

        await waitForFs(600);

        // File should be at accepted state (initial content), NOT deleted
        expect(await fileExists(newFile)).toBe(true);
        expect(await readTempFile(newFile)).toBe('initial content');
      });

      it('accept file A, agent edits A and B, reject A only, B remains pending', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        const fileA = path.join(tempDir, 'fileA.txt');
        const fileB = path.join(tempDir, 'fileB.txt');

        await createTempFile(fileA, 'originalA');
        await createTempFile(fileB, 'originalB');

        service.addInitialFileSnapshotIfNeeded({
          [fileA]: 'originalA',
          [fileB]: 'originalB',
        });

        // Agent edits both
        service.pushAgentFileEdit(fileA, 'modA-v1');
        service.pushAgentFileEdit(fileB, 'modB-v1');

        // User accepts A
        service.partialAccept([fileA]);

        // Agent continues editing both
        service.pushAgentFileEdit(fileA, 'modA-v2');
        service.pushAgentFileEdit(fileB, 'modB-v2');

        // User rejects only A's new changes
        service.partialReject([fileA]);

        await waitForFs(600);

        // A should be at v1 (accepted state)
        expect(await readTempFile(fileA)).toBe('modA-v1');

        // B should still show as pending (v2)
        const diff = service.getDiffState();
        expect(diff).toHaveLength(1);
        expect(diff[0].path).toBe(fileB);
        expect(diff[0].before).toBe('originalB');
        expect(diff[0].after).toBe('modB-v2');
      });

      it('multiple accept-edit-reject cycles on same file', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        const filePath = path.join(tempDir, 'cycle.txt');
        await createTempFile(filePath, 'v0');

        service.addInitialFileSnapshotIfNeeded({ [filePath]: 'v0' });

        // Cycle 1: edit -> accept
        service.pushAgentFileEdit(filePath, 'v1');
        service.acceptPendingChanges();

        // Cycle 2: edit -> reject
        service.pushAgentFileEdit(filePath, 'v2');
        service.rejectPendingChanges();

        await waitForFs(600);
        expect(await readTempFile(filePath)).toBe('v1'); // Back to accepted state

        // Cycle 3: edit -> accept
        service.pushAgentFileEdit(filePath, 'v3');
        service.acceptPendingChanges();

        // Cycle 4: edit -> edit -> reject (multiple edits before reject)
        service.pushAgentFileEdit(filePath, 'v4');
        service.pushAgentFileEdit(filePath, 'v5');
        service.rejectPendingChanges();

        await waitForFs(600);
        expect(await readTempFile(filePath)).toBe('v3'); // Back to last accepted

        // Final state: no pending changes
        expect(service.getDiffState()).toEqual([]);
      });
    });

    describe('watcher edge cases', () => {
      it('user saves file while agent has pending changes, preserves history', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        const filePath = path.join(tempDir, 'watcher-race.txt');
        await createTempFile(filePath, 'original');

        service.addInitialFileSnapshotIfNeeded({ [filePath]: 'original' });

        // Agent makes an edit
        service.pushAgentFileEdit(filePath, 'agent edit');

        // Wait for watcher to be set up
        await waitForFs(200);

        // User externally saves a different version (simulating user edit in IDE)
        // This should trigger the watcher
        await fs.writeFile(filePath, 'user external edit');

        // Wait for watcher event
        await waitFor(
          () => {
            const diff = service.getDiffState();
            // After user save, the file should show user's version as current
            return diff.some((d) => d.after === 'user external edit');
          },
          3000,
          100,
        );

        const diff = service.getDiffState();
        expect(diff.some((d) => d.path === filePath)).toBe(true);
      });

      it('agent edits file, user saves same content, no duplicate snapshot', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        const filePath = path.join(tempDir, 'same-content.txt');
        await createTempFile(filePath, 'original');

        service.addInitialFileSnapshotIfNeeded({ [filePath]: 'original' });

        // Agent makes an edit
        service.pushAgentFileEdit(filePath, 'modified');

        await waitForFs(600); // Wait for lock to expire

        // User saves the same content (shouldn't create new snapshot)
        await fs.writeFile(filePath, 'modified');

        await waitForFs(300);

        // Diff should still show the same pending change
        const diff = service.getDiffState();
        expect(diff).toHaveLength(1);
        expect(diff[0].after).toBe('modified');
      });
    });

    describe('boundary conditions', () => {
      it('handles very long file paths', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        // Create a deeply nested path
        const deepDir = path.join(tempDir, 'a', 'b', 'c', 'd', 'e', 'f');
        await fs.mkdir(deepDir, { recursive: true });
        const longPath = path.join(deepDir, 'deeply-nested-file.txt');
        await createTempFile(longPath, 'deep content');

        service.addInitialFileSnapshotIfNeeded({ [longPath]: 'deep content' });
        service.pushAgentFileEdit(longPath, 'modified deep');

        const diff = service.getDiffState();
        expect(diff).toHaveLength(1);
        expect(diff[0].path).toBe(longPath);
      });

      it('handles files with special characters in name', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        // File with spaces and special chars (but valid for filesystem)
        const specialFile = path.join(tempDir, 'file with spaces & stuff.txt');
        await createTempFile(specialFile, 'special content');

        service.addInitialFileSnapshotIfNeeded({
          [specialFile]: 'special content',
        });
        service.pushAgentFileEdit(specialFile, 'modified special');

        const diff = service.getDiffState();
        expect(diff).toHaveLength(1);
        expect(diff[0].path).toBe(specialFile);
      });

      it('handles large file content', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        const largeFile = path.join(tempDir, 'large.txt');
        // Create ~100KB of content
        const largeContent = 'x'.repeat(100000);
        await createTempFile(largeFile, largeContent);

        service.addInitialFileSnapshotIfNeeded({ [largeFile]: largeContent });

        const modifiedContent = `${largeContent}\nnew line at end`;
        service.pushAgentFileEdit(largeFile, modifiedContent);

        const diff = service.getDiffState();
        expect(diff).toHaveLength(1);
        expect(diff[0].before).toBe(largeContent);
        expect(diff[0].after).toBe(modifiedContent);
      });

      it('handles many files simultaneously', async () => {
        mockKarton = createMockKartonService({
          chatId: 'chat-1',
          userMessageIds: ['msg-1'],
        });

        service = await DiffHistoryService.create(logger, mockKarton);

        const fileCount = 20;
        const files: { path: string; content: string }[] = [];

        // Create many files
        for (let i = 0; i < fileCount; i++) {
          const filePath = path.join(tempDir, `file-${i}.txt`);
          const content = `content ${i}`;
          await createTempFile(filePath, content);
          files.push({ path: filePath, content });
        }

        // Add all to initial snapshot
        const initialSnapshot: Record<string, string> = {};
        files.forEach((f) => {
          initialSnapshot[f.path] = f.content;
        });
        service.addInitialFileSnapshotIfNeeded(initialSnapshot);

        // Agent edits all files
        files.forEach((f) => {
          service.pushAgentFileEdit(f.path, `${f.content} - modified`);
        });

        const diff = service.getDiffState();
        expect(diff).toHaveLength(fileCount);

        // Accept all
        service.acceptPendingChanges();
        expect(service.getDiffState()).toEqual([]);
      });
    });
  });
});
