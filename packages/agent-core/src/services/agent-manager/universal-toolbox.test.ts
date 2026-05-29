import { describe, expect, it, vi } from 'vitest';
import type { AgentHost } from '../../host/host';
import { createTestAgentHost } from '../../host/test-utils';
import type { HostPaths } from '../../host/paths';
import type { MountManager } from '../mount-manager/mount-registry';
import { createUniversalToolbox } from './universal-toolbox';

describe('createUniversalToolbox', () => {
  it('returns null for non-universal tool names', async () => {
    const tb = createUniversalToolbox({
      host: makeHost(),
      mountManager: makeMountManager(),
    });
    expect(await tb.getTool('not-a-universal-tool', 'a1')).toBeNull();
  });

  it('returns a tool for read', async () => {
    const tb = createUniversalToolbox({
      host: makeHost(),
      mountManager: makeMountManager(),
    });
    const tool = await tb.getTool('read', 'a1');
    expect(tool).not.toBeNull();
    expect(typeof (tool as { execute?: unknown }).execute).toBe('function');
  });

  it('delegates handleMountWorkspace to mountManager', async () => {
    const mountWorkspace = vi.fn(async () => {});
    const tb = createUniversalToolbox({
      host: makeHost(),
      mountManager: makeMountManager({ mountWorkspace }),
    });
    await tb.handleMountWorkspace('a1', '/abs/ws');
    expect(mountWorkspace).toHaveBeenCalledWith('a1', '/abs/ws');
  });

  it('getMountedPathsForAgent maps prefixes to absolute paths', () => {
    const getMountPrefixes = vi.fn(() => ['p1'] as const);
    const getWorkspacePathForPrefix = vi.fn((p: string) =>
      p === 'p1' ? '/abs/root' : undefined,
    );
    const tb = createUniversalToolbox({
      host: makeHost(),
      mountManager: makeMountManager({
        getMountPrefixes,
        getWorkspacePathForPrefix,
      }),
    });
    const map = tb.getMountedPathsForAgent('a1');
    expect([...map.entries()]).toEqual([['p1', '/abs/root']]);
  });
});

function makeHost(): AgentHost {
  const noopPath = () => '/tmp/stagewise-test';
  const paths: HostPaths = {
    dataDir: noopPath,
    tempDir: noopPath,
    agentsDir: noopPath,
    agentDir: () => '/tmp/agent',
    agentAttachmentsDir: () => '/tmp/att',
    agentAttachmentPath: () => '/tmp/att/f',
    agentAppsDir: () => '/tmp/apps',
    agentShellLogsDir: () => '/tmp/shell',
    diffHistoryDir: noopPath,
    diffHistoryDbPath: () => '/tmp/dh.db',
    diffHistoryBlobsDir: () => '/tmp/dh-blobs',
    agentDbPath: () => '/tmp/agents.db',
    fileReadCacheDbPath: () => '/tmp/frc.db',
    processedImageCacheDbPath: () => '/tmp/pic.db',
    userDataDir: noopPath,
    plansDir: noopPath,
    logsDir: noopPath,
    pluginsDir: noopPath,
    builtinSkillsDir: noopPath,
    ripgrepBaseDir: noopPath,
  };
  return createTestAgentHost({
    paths,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  });
}

function makeMountManager(
  overrides: {
    mountWorkspace?: MountManager['mountWorkspace'];
    getMountPrefixes?: MountManager['getMountPrefixes'];
    getWorkspacePathForPrefix?: MountManager['getWorkspacePathForPrefix'];
    getWorkspaceSnapshot?: MountManager['getWorkspaceSnapshot'];
  } = {},
): MountManager {
  return {
    mountWorkspace: vi.fn(async () => {}),
    getMountPrefixes: vi.fn(() => undefined),
    getWorkspacePathForPrefix: vi.fn(() => undefined),
    getWorkspaceSnapshot: vi.fn(() => ({ mounts: [] })),
    ...overrides,
  } as unknown as MountManager;
}
