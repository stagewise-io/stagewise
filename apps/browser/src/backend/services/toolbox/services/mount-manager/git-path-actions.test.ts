import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockHomeDir = path.join(os.tmpdir(), 'mount-manager-mock-home');

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) =>
      name === 'home' ? mockHomeDir : path.join(os.tmpdir(), `mock-${name}`),
  },
}));

import { MountManagerService } from '.';
import type { FilePickerService } from '@/services/file-picker';
import type { GitService } from '@/services/git';
import type { KartonService } from '@/services/karton';
import type { Logger } from '@/services/logger';
import type { TelemetryService } from '@/services/telemetry';
import type { UserExperienceService } from '@/services/experience';
import { getWorktreesDir } from '@/utils/paths';

beforeEach(async () => {
  mockHomeDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'mount-manager-mock-home-'),
  );
});

afterEach(async () => {
  await fs.rm(mockHomeDir, { recursive: true, force: true });
});

function createHarness({ recentPaths = [] }: { recentPaths?: string[] } = {}) {
  const procedureHandlers = new Map<string, (...args: unknown[]) => unknown>();
  const state = {
    toolbox: {
      agent1: {
        workspace: {
          mounts: [] as Array<{
            prefix: string;
            path: string;
            git: null;
            skills: Array<{ name: string; description: string }>;
            workspaceMdContent: string | null;
            agentsMdContent: string | null;
          }>,
        },
        pendingFileDiffs: [],
        editSummary: [],
        pendingUserQuestion: null,
      },
    },
    agents: { instances: { agent1: { type: 'regular' } } },
  };

  const uiKarton = {
    state,
    setState: vi.fn((recipe: (draft: typeof state) => void) => recipe(state)),
    registerServerProcedureHandler: vi.fn(
      (name: string, handler: (...args: unknown[]) => unknown) => {
        procedureHandlers.set(name, handler);
      },
    ),
    removeServerProcedureHandler: vi.fn(),
  } as unknown as KartonService;

  const gitService = {
    listBranches: vi.fn(async (workspacePath: string) => ({
      current: 'main',
      defaultBranch: 'main',
      branches: [
        {
          name: 'main',
          current: true,
          checkedOut: true,
          checkedOutPath: workspacePath,
        },
      ],
    })),
    listWorkspaceWorktrees: vi.fn(async (workspacePath: string) => ({
      currentPath: workspacePath,
      worktrees: [
        {
          worktreeId: workspacePath,
          path: workspacePath,
          branch: 'main',
          headSha: 'abc123',
          isDetached: false,
          isMainWorktree: true,
          current: true,
        },
      ],
    })),
    switchBranch: vi.fn(async () => ({ ok: true, git: null })),
    createBranch: vi.fn(async () => ({ ok: true, git: null })),
    createWorktree: vi.fn(async (workspacePath: string) => ({
      ok: true,
      path: path.join(workspacePath, '..', 'created-worktree'),
      git: null,
    })),
  } as unknown as GitService;

  const userExperienceService = {
    getRecentlyOpenedWorkspaces: vi.fn(async () =>
      recentPaths.map((workspacePath) => ({
        path: workspacePath,
        name: path.basename(workspacePath),
        openedAt: Date.now(),
      })),
    ),
    saveRecentlyOpenedWorkspace: vi.fn(),
  } as unknown as UserExperienceService;

  const preferencesService = {
    get: vi.fn(() => ({
      agent: { workspaceGitCleanup: { dismissedCandidates: {} } },
    })),
    snoozeWorkspaceGitCleanupCandidates: vi.fn(),
    pruneWorkspaceGitCleanupSnoozes: vi.fn(),
  };

  const service = new MountManagerService(
    { warn: vi.fn() } as unknown as Logger,
    {} as FilePickerService,
    userExperienceService,
    uiKarton,
    { capture: vi.fn() } as unknown as TelemetryService,
    gitService,
    preferencesService as never,
  );

  return { service, procedureHandlers, state, gitService };
}

async function initializeService(service: MountManagerService) {
  const initialize = Reflect.get(service, 'initialize') as () => Promise<void>;
  await initialize.call(service);
}

function setWorkspacePathForMount(
  service: MountManagerService,
  mountPrefix: string,
  workspacePath: string,
) {
  const workspacePathsPerMount = Reflect.get(
    service,
    'workspacePathsPerMount',
  ) as Map<string, string>;
  workspacePathsPerMount.set(mountPrefix, workspacePath);
}

describe('MountManagerService path-based Git actions', () => {
  it('accepts a recent workspace path', async () => {
    const recentPath = await fs.mkdtemp(path.join(os.tmpdir(), 'recent-repo-'));
    const { service, procedureHandlers, gitService } = createHarness({
      recentPaths: [recentPath],
    });
    await initializeService(service);

    const handler = procedureHandlers.get('toolbox.listGitBranchesByPath');
    await expect(handler?.('client1', recentPath)).resolves.toMatchObject({
      current: 'main',
    });
    expect(gitService.listBranches).toHaveBeenCalledWith(recentPath);
  });

  it('accepts a mounted workspace path', async () => {
    const mountedPath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mounted-repo-'),
    );
    const { service, procedureHandlers, state, gitService } = createHarness();
    state.toolbox.agent1.workspace.mounts.push({
      prefix: 'w1234',
      path: mountedPath,
      git: null,
      skills: [],
      workspaceMdContent: null,
      agentsMdContent: null,
    });
    setWorkspacePathForMount(service, 'w1234', mountedPath);
    await initializeService(service);

    const handler = procedureHandlers.get('toolbox.listGitBranchesByPath');
    await expect(handler?.('client1', mountedPath)).resolves.toMatchObject({
      current: 'main',
    });
    expect(gitService.listBranches).toHaveBeenCalledWith(mountedPath);
  });

  it('accepts a managed worktree path', async () => {
    const worktreePath = path.join(getWorktreesDir(), 'repo-hash', 'feature-a');
    await fs.mkdir(worktreePath, { recursive: true });
    const { service, procedureHandlers, gitService } = createHarness();
    await initializeService(service);

    const handler = procedureHandlers.get('toolbox.listGitBranchesByPath');
    await expect(handler?.('client1', worktreePath)).resolves.toMatchObject({
      current: 'main',
    });
    expect(gitService.listBranches).toHaveBeenCalledWith(worktreePath);
  });

  it('discovers managed worktrees with slash branch paths', async () => {
    const repoHash = `repo-hash-${Date.now()}-${Math.random()}`;
    const worktreePath = path.join(
      getWorktreesDir(),
      repoHash,
      'feature',
      'login',
    );
    await fs.mkdir(worktreePath, { recursive: true });
    await fs.writeFile(path.join(worktreePath, '.git'), 'gitdir: mock');

    const expectedWorktreePath = await fs.realpath(worktreePath);
    const { service } = createHarness();
    const listManagedWorktreePaths = Reflect.get(
      service,
      'listManagedWorktreePaths',
    ) as () => Promise<string[]>;

    await expect(listManagedWorktreePaths.call(service)).resolves.toContain(
      expectedWorktreePath,
    );
  });

  it('rejects an unrelated arbitrary path', async () => {
    const arbitraryPath = path.join(
      os.tmpdir(),
      `arbitrary-repo-${Date.now()}-${Math.random()}`,
    );
    const { service, procedureHandlers, gitService } = createHarness();
    await initializeService(service);

    const listHandler = procedureHandlers.get('toolbox.listGitBranchesByPath');
    await expect(listHandler?.('client1', arbitraryPath)).resolves.toBeNull();
    expect(gitService.listBranches).not.toHaveBeenCalled();

    const createHandler = procedureHandlers.get(
      'toolbox.createGitWorktreeByPath',
    );
    await expect(
      createHandler?.('client1', arbitraryPath, {
        worktreeName: 'feature-a',
        sourceBranch: 'main',
      }),
    ).resolves.toMatchObject({
      ok: false,
      reason: 'not-git-repo',
    });
    expect(gitService.createWorktree).not.toHaveBeenCalled();
  });

  it('rejects symlink escapes from the managed worktrees directory', async () => {
    const externalPath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'external-repo-'),
    );
    const symlinkPath = path.join(
      getWorktreesDir(),
      'repo-hash',
      'symlink-escape',
    );
    await fs.mkdir(path.dirname(symlinkPath), { recursive: true });
    await fs.rm(symlinkPath, { force: true, recursive: true });
    await fs.symlink(externalPath, symlinkPath, 'dir');

    const { service, procedureHandlers, gitService } = createHarness();
    await initializeService(service);

    const handler = procedureHandlers.get('toolbox.listGitBranchesByPath');
    await expect(handler?.('client1', symlinkPath)).resolves.toBeNull();
    expect(gitService.listBranches).not.toHaveBeenCalled();
  });

  it('creates a worktree by path without requiring a mount prefix', async () => {
    const recentPath = await fs.mkdtemp(path.join(os.tmpdir(), 'recent-repo-'));
    const { service, procedureHandlers, gitService } = createHarness({
      recentPaths: [recentPath],
    });
    await initializeService(service);

    const handler = procedureHandlers.get('toolbox.createGitWorktreeByPath');
    await expect(
      handler?.('client1', recentPath, {
        worktreeName: 'feature-a',
        sourceBranch: 'main',
      }),
    ).resolves.toMatchObject({
      ok: true,
      path: path.join(recentPath, '..', 'created-worktree'),
    });
    expect(gitService.createWorktree).toHaveBeenCalledWith(recentPath, {
      worktreeName: 'feature-a',
      sourceBranch: 'main',
    });
  });
});
