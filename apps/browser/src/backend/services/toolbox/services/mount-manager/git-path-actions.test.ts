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
import type { WorkspaceGitSetupRun } from '@shared/karton-contracts/ui';
import {
  AgentStore,
  createInitialAgentSystemState,
} from '@stagewise/agent-core';

const services: MountManagerService[] = [];

beforeEach(async () => {
  mockHomeDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'mount-manager-mock-home-'),
  );
});

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.teardown()));
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
    workspaceGitSetup: {
      runsByPath: {} as Record<string, WorkspaceGitSetupRun>,
    },
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
    getWorkspaceRepositoryInfo: vi.fn(async (workspacePath: string) => ({
      repositoryId: path.join(workspacePath, '.git'),
      repoRoot: workspacePath,
      commonGitDir: path.join(workspacePath, '.git'),
    })),
    getWorkspaceMainWorktreePath: vi.fn(async (workspacePath: string) =>
      workspacePath.includes('linked-worktree')
        ? workspacePath.replace('linked-worktree', 'main-worktree')
        : workspacePath,
    ),
    getMountedWorkspaceSummary: vi.fn(async () => null),
    switchBranch: vi.fn(async () => ({ ok: true, git: null })),
    createBranch: vi.fn(async () => ({ ok: true, git: null })),
    createWorktree: vi.fn(async (workspacePath: string, options) => ({
      ok: true,
      path: path.join(workspacePath, '..', 'created-worktree'),
      branchName: options.worktreeName.trim(),
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

  const agentStore = new AgentStore(createInitialAgentSystemState());

  const service = new MountManagerService(
    {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      isDebugEnabled: false,
    } as unknown as Logger,
    {} as FilePickerService,
    userExperienceService,
    uiKarton,
    {
      capture: vi.fn(),
      captureException: vi.fn(),
    } as unknown as TelemetryService,
    gitService,
    preferencesService as never,
    agentStore,
  );

  services.push(service);

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
  const core = service.getCoreMountManager();
  const workspacePathsPerMount = Reflect.get(
    core,
    'workspacePathsPerMount',
  ) as Map<string, string>;
  workspacePathsPerMount.set(mountPrefix, workspacePath);
}

function setAgentMount(
  service: MountManagerService,
  agentId: string,
  mountPrefix: string,
) {
  const core = service.getCoreMountManager();
  const agentMounts = Reflect.get(core, 'agentMounts') as Map<
    string,
    Set<string>
  >;
  const mounts = agentMounts.get(agentId) ?? new Set<string>();
  mounts.add(mountPrefix);
  agentMounts.set(agentId, mounts);
}

function detachWorkspacePathFromAgents(
  service: MountManagerService,
  workspacePath: string,
): Promise<string[]> {
  const fn = Reflect.get(service, 'detachWorkspacePathFromAgents') as (
    p: string,
  ) => Promise<string[]>;
  return fn.call(service, workspacePath);
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

  it('creates worktrees from the main worktree when called from a linked worktree', async () => {
    const repoDir = path.join(getWorktreesDir(), 'repo-hash');
    await fs.mkdir(repoDir, { recursive: true });
    const linkedPath = await fs.mkdtemp(path.join(repoDir, 'linked-worktree-'));
    const mainPath = linkedPath.replace('linked-worktree', 'main-worktree');
    await fs.mkdir(mainPath, { recursive: true });
    const createdPath = path.join(mainPath, '..', 'created-worktree');
    const scriptPath = path.join(
      createdPath,
      '.stagewise',
      'worktree-setup.sh',
    );
    await fs.mkdir(path.dirname(scriptPath), { recursive: true });
    await fs.writeFile(scriptPath, 'exit 0');
    const { service, procedureHandlers, gitService, state } = createHarness({
      recentPaths: [linkedPath],
    });
    await initializeService(service);

    const handler = procedureHandlers.get('toolbox.createGitWorktreeByPath');
    await expect(
      handler?.('client1', linkedPath, {
        worktreeName: 'feature-a',
        sourceBranch: 'main',
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(gitService.createWorktree).toHaveBeenCalledWith(mainPath, {
      worktreeName: 'feature-a',
      sourceBranch: 'main',
    });

    const mountHandler = procedureHandlers.get('toolbox.mountWorkspace');
    await mountHandler?.('client1', 'agent1', createdPath);

    await vi.waitFor(() => {
      expect(state.workspaceGitSetup.runsByPath[createdPath]).toMatchObject({
        workspacePath: createdPath,
        sourceWorktreePath: linkedPath,
        mainWorktreePath: mainPath,
      });
    });
  });

  it('rejects worktree creation when the derived main worktree is untrusted', async () => {
    const repoDir = path.join(getWorktreesDir(), 'repo-hash');
    await fs.mkdir(repoDir, { recursive: true });
    const linkedPath = await fs.mkdtemp(path.join(repoDir, 'linked-worktree-'));
    const untrustedMainPath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'untrusted-main-worktree-'),
    );
    const { service, procedureHandlers, gitService } = createHarness();
    vi.mocked(gitService.getWorkspaceMainWorktreePath).mockResolvedValueOnce(
      untrustedMainPath,
    );
    vi.mocked(gitService.getWorkspaceRepositoryInfo).mockImplementation(
      async (workspacePath: string) => {
        if (workspacePath === untrustedMainPath) return null;
        return {
          repositoryId: path.join(linkedPath, '.git'),
          repoRoot: linkedPath,
          commonGitDir: path.join(linkedPath, '.git'),
        };
      },
    );
    await initializeService(service);

    const handler = procedureHandlers.get('toolbox.createGitWorktreeByPath');
    await expect(
      handler?.('client1', linkedPath, {
        worktreeName: 'feature-a',
        sourceBranch: 'main',
      }),
    ).resolves.toMatchObject({
      ok: false,
      reason: 'not-git-repo',
    });

    expect(gitService.createWorktree).not.toHaveBeenCalled();
  });

  it('starts pending setup only after mounting the created worktree', async () => {
    const recentPath = await fs.mkdtemp(path.join(os.tmpdir(), 'recent-repo-'));
    const createdPath = path.join(recentPath, '..', 'created-worktree');
    const scriptPath = path.join(
      createdPath,
      '.stagewise',
      'worktree-setup.sh',
    );
    await fs.mkdir(path.dirname(scriptPath), { recursive: true });
    await fs.writeFile(scriptPath, 'exit 0');
    const { service, procedureHandlers, state } = createHarness({
      recentPaths: [recentPath],
    });
    await initializeService(service);

    const createHandler = procedureHandlers.get(
      'toolbox.createGitWorktreeByPath',
    );
    await createHandler?.('client1', recentPath, {
      worktreeName: 'feature-a',
      sourceBranch: 'main',
    });
    expect(state.workspaceGitSetup.runsByPath[createdPath]).toBeUndefined();

    const mountHandler = procedureHandlers.get('toolbox.mountWorkspace');
    await mountHandler?.('client1', 'agent1', createdPath);

    await vi.waitFor(() => {
      expect(state.workspaceGitSetup.runsByPath[createdPath]).toBeDefined();
    });
  });

  it('does not start setup for manually mounted worktrees', async () => {
    const manualPath = await fs.mkdtemp(path.join(os.tmpdir(), 'manual-repo-'));
    const scriptPath = path.join(manualPath, '.stagewise', 'worktree-setup.sh');
    await fs.mkdir(path.dirname(scriptPath), { recursive: true });
    await fs.writeFile(scriptPath, 'exit 0');
    const { service, procedureHandlers, state } = createHarness();
    await initializeService(service);

    const mountHandler = procedureHandlers.get('toolbox.mountWorkspace');
    await mountHandler?.('client1', 'agent1', manualPath);

    expect(state.workspaceGitSetup.runsByPath[manualPath]).toBeUndefined();
  });

  it('does not create setup state when the setup script is missing', async () => {
    const recentPath = await fs.mkdtemp(path.join(os.tmpdir(), 'recent-repo-'));
    const createdPath = path.join(recentPath, '..', 'created-worktree');
    const { service, procedureHandlers, state } = createHarness({
      recentPaths: [recentPath],
    });
    await initializeService(service);

    const createHandler = procedureHandlers.get(
      'toolbox.createGitWorktreeByPath',
    );
    await createHandler?.('client1', recentPath, {
      worktreeName: 'feature-a',
      sourceBranch: 'main',
    });
    const mountHandler = procedureHandlers.get('toolbox.mountWorkspace');
    await mountHandler?.('client1', 'agent1', createdPath);

    expect(state.workspaceGitSetup.runsByPath[createdPath]).toBeUndefined();
  });

  it('keeps failed setup worktrees mounted', async () => {
    const recentPath = await fs.mkdtemp(path.join(os.tmpdir(), 'recent-repo-'));
    const createdPath = path.join(recentPath, '..', 'created-worktree');
    const scriptPath = path.join(
      createdPath,
      '.stagewise',
      'worktree-setup.sh',
    );
    await fs.mkdir(path.dirname(scriptPath), { recursive: true });
    await fs.writeFile(scriptPath, 'echo failed >&2\nexit 1');
    const { service, procedureHandlers, state } = createHarness({
      recentPaths: [recentPath],
    });
    await initializeService(service);

    const createHandler = procedureHandlers.get(
      'toolbox.createGitWorktreeByPath',
    );
    await createHandler?.('client1', recentPath, {
      worktreeName: 'feature-a',
      sourceBranch: 'main',
    });
    const mountHandler = procedureHandlers.get('toolbox.mountWorkspace');
    await mountHandler?.('client1', 'agent1', createdPath);

    await vi.waitFor(() => {
      expect(state.workspaceGitSetup.runsByPath[createdPath]?.status).toBe(
        'failed',
      );
    });
    // A failed setup must not unmount the worktree: the core mount
    // registry still tracks it after the run resolves to `failed`.
    expect(service.getCoreMountManager().getAllMountedPaths()).toContain(
      createdPath,
    );
  });

  it('detaches a deleted worktree path from agent mounts', async () => {
    const worktreePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'deleted-worktree-'),
    );
    const { service, state } = createHarness();
    await initializeService(service);

    state.toolbox.agent1.workspace.mounts.push({
      prefix: 'w1234',
      path: worktreePath,
      git: null,
      skills: [],
      workspaceMdContent: null,
      agentsMdContent: null,
    });
    setWorkspacePathForMount(service, 'w1234', worktreePath);
    setAgentMount(service, 'agent1', 'w1234');

    const affected = await detachWorkspacePathFromAgents(service, worktreePath);

    expect(affected).toEqual(['agent1']);
    expect(state.toolbox.agent1.workspace.mounts).toHaveLength(0);

    const core = service.getCoreMountManager();
    const agentMounts = Reflect.get(core, 'agentMounts') as Map<
      string,
      Set<string>
    >;
    expect(agentMounts.get('agent1')?.has('w1234')).toBe(false);

    const workspacePathsPerMount = Reflect.get(
      core,
      'workspacePathsPerMount',
    ) as Map<string, string>;
    expect(workspacePathsPerMount.has('w1234')).toBe(false);
  });

  it('leaves unrelated agent mounts untouched when detaching', async () => {
    const deletedPath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'deleted-worktree-'),
    );
    const keptPath = await fs.mkdtemp(path.join(os.tmpdir(), 'kept-worktree-'));
    const { service, state } = createHarness();
    await initializeService(service);

    state.toolbox.agent1.workspace.mounts.push(
      {
        prefix: 'wdead',
        path: deletedPath,
        git: null,
        skills: [],
        workspaceMdContent: null,
        agentsMdContent: null,
      },
      {
        prefix: 'wkeep',
        path: keptPath,
        git: null,
        skills: [],
        workspaceMdContent: null,
        agentsMdContent: null,
      },
    );
    setWorkspacePathForMount(service, 'wdead', deletedPath);
    setWorkspacePathForMount(service, 'wkeep', keptPath);
    setAgentMount(service, 'agent1', 'wdead');
    setAgentMount(service, 'agent1', 'wkeep');

    await detachWorkspacePathFromAgents(service, deletedPath);

    expect(
      state.toolbox.agent1.workspace.mounts.map((mount) => mount.prefix),
    ).toEqual(['wkeep']);

    const core = service.getCoreMountManager();
    const agentMounts = Reflect.get(core, 'agentMounts') as Map<
      string,
      Set<string>
    >;
    expect(agentMounts.get('agent1')?.has('wkeep')).toBe(true);
    expect(agentMounts.get('agent1')?.has('wdead')).toBe(false);
  });
});
