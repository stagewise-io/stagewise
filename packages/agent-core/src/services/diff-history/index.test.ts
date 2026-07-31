import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createTestAgentHost,
  createTestHostPaths,
} from '../../host/test-utils';
import { AgentStore, createInitialAgentSystemState } from '../../store';
import { DiffHistoryService } from './index';

describe('DiffHistoryService finalization', () => {
  let root: string | undefined;
  let service: DiffHistoryService | undefined;

  afterEach(async () => {
    await service?.teardown();
    service = undefined;
    if (root) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it('can undo a tool edit after its pending edits were finalized', async () => {
    const testRoot = await mkdtemp(
      path.join(os.tmpdir(), 'diff-history-service-'),
    );
    root = testRoot;
    const at = (...parts: string[]) => path.join(testRoot, ...parts);
    const workspace = path.join(testRoot, 'workspace');
    const filePath = path.join(workspace, 'example.txt');
    const paths = createTestHostPaths({
      diffHistoryDbPath: () => at('diff-history', 'data.sqlite'),
      diffHistoryBlobsDir: () => at('diff-history', 'blobs'),
      agentAppsDir: (agentId) => at('agents', agentId, 'apps'),
      plansDir: () => at('plans'),
      logsDir: () => at('logs'),
    });
    await Promise.all([
      mkdir(workspace, { recursive: true }),
      mkdir(paths.diffHistoryBlobsDir(), { recursive: true }),
    ]);

    service = await DiffHistoryService.create({
      host: createTestAgentHost({ paths }),
      store: new AgentStore(createInitialAgentSystemState()),
      mountPathsResolver: () => new Set([workspace]),
    });
    await writeFile(filePath, 'edited\n', 'utf8');
    await service.registerAgentEdit({
      agentInstanceId: 'agent-1',
      toolCallId: 'tool-1',
      path: filePath,
      workspaceRoot: workspace,
      isExternal: false,
      contentBefore: 'original\n',
      contentAfter: 'edited\n',
    });

    await service.finalizePendingEditsForAgent('agent-1');
    expect(await readFile(filePath, 'utf8')).toBe('edited\n');

    await service.undoToolCalls(['tool-1'], 'agent-1');
    expect(await readFile(filePath, 'utf8')).toBe('original\n');
  });
});
