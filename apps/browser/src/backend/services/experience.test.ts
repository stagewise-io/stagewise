import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecentlyOpenedWorkspace } from '@shared/karton-contracts/ui';

vi.hoisted(() => {
  vi.stubGlobal('__APP_BASE_NAME__', 'stagewise-test');
  vi.stubGlobal('__APP_NAME__', 'stagewise-test');
  vi.stubGlobal('__APP_BUNDLE_ID__', 'io.stagewise.test');
  vi.stubGlobal('__APP_VERSION__', '0.0.0-test');
  vi.stubGlobal('__APP_PLATFORM__', 'darwin');
  vi.stubGlobal('__APP_RELEASE_CHANNEL__', 'test');
  vi.stubGlobal('__APP_AUTHOR__', 'stagewise');
  vi.stubGlobal('__APP_COPYRIGHT__', 'stagewise');
  vi.stubGlobal('__APP_HOMEPAGE__', 'https://stagewise.io');
  vi.stubGlobal('__APP_ARCH__', 'arm64');
});
import type { GitService } from './git';
import type { KartonService } from './karton';
import type { Logger } from './logger';
import type { TelemetryService } from './telemetry';

const persistedData = new Map<string, unknown>();
const existingPaths = new Set<string>();

vi.mock('node:fs/promises', () => ({
  default: {
    access: vi.fn(async (path: string) => {
      if (!existingPaths.has(path)) throw new Error('Path does not exist');
    }),
  },
}));

vi.mock('../utils/persisted-data', () => ({
  readPersistedData: vi.fn(async (key: string, _schema: unknown, fallback) =>
    persistedData.has(key) ? persistedData.get(key) : fallback,
  ),
  writePersistedData: vi.fn(async (key: string, _schema: unknown, value) => {
    persistedData.set(key, value);
  }),
}));

import { UserExperienceService } from './experience';

function createGitService(
  worktreesByPath: Record<
    string,
    Array<{
      path: string;
      isMainWorktree: boolean;
    }>
  >,
  repositoryIdsByPath: Record<string, string> = {},
  failingWorktreePaths = new Set<string>(),
  repositoryRootsByPath: Record<string, string> = {},
) {
  for (const worktrees of Object.values(worktreesByPath)) {
    for (const worktree of worktrees) {
      existingPaths.add(worktree.path);
    }
  }

  const getRepositoryInfo = vi.fn(async (workspacePath: string) => {
    const repositoryId =
      repositoryIdsByPath[workspacePath] ??
      worktreesByPath[workspacePath]?.find(
        (worktree) => worktree.isMainWorktree,
      )?.path;
    if (!repositoryId) return null;
    return {
      repositoryId,
      repoRoot: repositoryRootsByPath[workspacePath] ?? workspacePath,
      commonGitDir: repositoryId,
    };
  });

  const listWorktrees = vi.fn(async (workspacePath: string) => {
    if (failingWorktreePaths.has(workspacePath)) {
      throw new Error('worktree list failed');
    }
    return (
      worktreesByPath[workspacePath]?.map((worktree) => ({
        worktreeId: worktree.path,
        path: worktree.path,
        branch: worktree.isMainWorktree ? 'main' : 'feature',
        headSha: 'abc123',
        isDetached: false,
        isMainWorktree: worktree.isMainWorktree,
      })) ?? []
    );
  });

  return {
    getRepositoryInfo,
    getWorkspaceRepositoryInfo: vi.fn(async (workspacePath: string) => {
      const repositoryInfo = await getRepositoryInfo(workspacePath);
      if (!repositoryInfo) return null;
      if (repositoryInfo.repoRoot !== workspacePath) return null;
      return repositoryInfo;
    }),
    getWorkspaceMainWorktreePath: vi.fn(async (workspacePath: string) => {
      const repositoryInfo = await getRepositoryInfo(workspacePath);
      if (!repositoryInfo) return null;
      if (repositoryInfo.repoRoot !== workspacePath) return null;
      const worktrees = await listWorktrees(workspacePath);
      return (
        worktrees.find((worktree) => worktree.isMainWorktree)?.path ?? null
      );
    }),
    listWorktrees,
  } as unknown as GitService;
}

function createService(gitService: GitService) {
  const state = {
    userExperience: {
      storedExperienceData: {
        recentlyOpenedWorkspaces: [],
        hasSeenOnboardingFlow: null,
        lastViewedChats: {},
      },
    },
  };
  const uiKarton = {
    setState: vi.fn((updater: (draft: typeof state) => void) => {
      updater(state);
    }),
    registerStateChangeCallback: vi.fn(),
    unregisterStateChangeCallback: vi.fn(),
    registerServerProcedureHandler: vi.fn(),
  } as unknown as KartonService;
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;
  const telemetryService = {
    capture: vi.fn(),
    captureException: vi.fn(),
  } as unknown as TelemetryService;

  return UserExperienceService.create(
    logger,
    uiKarton,
    telemetryService,
    gitService,
  );
}

function setRecentWorkspaces(workspaces: RecentlyOpenedWorkspace[]) {
  persistedData.set('recently-opened-workspaces', workspaces);
  for (const workspace of workspaces) {
    existingPaths.add(workspace.path);
  }
}

function setMissingPaths(paths: string[]) {
  for (const path of paths) {
    existingPaths.delete(path);
  }
}

function getRecentWorkspaces() {
  return persistedData.get(
    'recently-opened-workspaces',
  ) as RecentlyOpenedWorkspace[];
}

describe('UserExperienceService recent workspace normalization', () => {
  beforeEach(() => {
    persistedData.clear();
    existingPaths.clear();
    persistedData.set('onboarding-state', { hasSeenOnboardingFlow: false });
  });

  it('normalizes linked worktree recents to the main worktree path', async () => {
    setRecentWorkspaces([
      { path: '/repo-linked', name: 'repo-linked', openedAt: 10 },
    ]);
    const service = await createService(
      createGitService({
        '/repo-linked': [
          { path: '/repo', isMainWorktree: true },
          { path: '/repo-linked', isMainWorktree: false },
        ],
      }),
    );

    await expect(service.getRecentlyOpenedWorkspaces()).resolves.toEqual([
      { path: '/repo', name: 'repo', openedAt: 10 },
    ]);
  });

  it('dedupes multiple worktrees from one repo and keeps the latest openedAt', async () => {
    setRecentWorkspaces([
      { path: '/repo-linked-a', name: 'repo-linked-a', openedAt: 10 },
      { path: '/repo-linked-b', name: 'repo-linked-b', openedAt: 20 },
    ]);
    const service = await createService(
      createGitService({
        '/repo-linked-a': [
          { path: '/repo', isMainWorktree: true },
          { path: '/repo-linked-a', isMainWorktree: false },
        ],
        '/repo-linked-b': [
          { path: '/repo', isMainWorktree: true },
          { path: '/repo-linked-b', isMainWorktree: false },
        ],
      }),
    );

    await expect(service.getRecentlyOpenedWorkspaces()).resolves.toEqual([
      { path: '/repo', name: 'repo', openedAt: 20 },
    ]);
  });

  it('prefers the main worktree path when only one recent entry resolves it', async () => {
    setRecentWorkspaces([
      { path: '/repo', name: 'repo', openedAt: 10 },
      { path: '/repo-linked', name: 'repo-linked', openedAt: 20 },
    ]);
    const service = await createService(
      createGitService(
        {
          '/repo': [
            { path: '/repo', isMainWorktree: true },
            { path: '/repo-linked', isMainWorktree: false },
          ],
          '/repo-linked': [],
        },
        {
          '/repo': '/repo/.git',
          '/repo-linked': '/repo/.git',
        },
        new Set(['/repo-linked']),
      ),
    );

    await expect(service.getRecentlyOpenedWorkspaces()).resolves.toEqual([
      { path: '/repo', name: 'repo', openedAt: 20 },
    ]);
  });

  it('dedupes linked worktrees by repository id when worktree listing fails', async () => {
    setRecentWorkspaces([
      { path: '/repo-linked-a', name: 'repo-linked-a', openedAt: 10 },
      { path: '/repo-linked-b', name: 'repo-linked-b', openedAt: 20 },
    ]);
    const service = await createService(
      createGitService(
        {
          '/repo-linked-a': [],
          '/repo-linked-b': [],
        },
        {
          '/repo-linked-a': '/repo/.git',
          '/repo-linked-b': '/repo/.git',
        },
        new Set(['/repo-linked-a', '/repo-linked-b']),
      ),
    );

    await expect(service.getRecentlyOpenedWorkspaces()).resolves.toEqual([
      { path: '/repo-linked-b', name: 'repo-linked-b', openedAt: 20 },
    ]);
  });

  it('keeps existing non-git or unresolved recent paths unchanged', async () => {
    setRecentWorkspaces([
      { path: '/plain-folder', name: 'plain-folder', openedAt: 10 },
    ]);
    const service = await createService(createGitService({}));

    await expect(service.getRecentlyOpenedWorkspaces()).resolves.toEqual([
      { path: '/plain-folder', name: 'plain-folder', openedAt: 10 },
    ]);
  });

  it('keeps subfolders inside parent repos unchanged', async () => {
    setRecentWorkspaces([
      { path: '/home', name: 'home', openedAt: 10 },
      { path: '/home/plain-folder', name: 'plain-folder', openedAt: 20 },
    ]);
    const service = await createService(
      createGitService(
        {
          '/home': [{ path: '/home', isMainWorktree: true }],
        },
        {
          '/home': '/home/.git',
          '/home/plain-folder': '/home/.git',
        },
        new Set(),
        {
          '/home': '/home',
          '/home/plain-folder': '/home',
        },
      ),
    );

    await expect(service.getRecentlyOpenedWorkspaces()).resolves.toEqual([
      { path: '/home/plain-folder', name: 'plain-folder', openedAt: 20 },
      { path: '/home', name: 'home', openedAt: 10 },
    ]);
  });

  it('drops missing recent paths from returned recent workspaces', async () => {
    setRecentWorkspaces([
      { path: '/existing-folder', name: 'existing-folder', openedAt: 10 },
      { path: '/missing-folder', name: 'missing-folder', openedAt: 20 },
    ]);
    setMissingPaths(['/missing-folder']);
    const service = await createService(createGitService({}));

    await expect(service.getRecentlyOpenedWorkspaces()).resolves.toEqual([
      { path: '/existing-folder', name: 'existing-folder', openedAt: 10 },
    ]);
  });

  it('writes pruned recent workspaces without missing paths', async () => {
    const openedAt = Date.now();
    setRecentWorkspaces([
      { path: '/existing-folder', name: 'existing-folder', openedAt },
      { path: '/missing-folder', name: 'missing-folder', openedAt },
    ]);
    setMissingPaths(['/missing-folder']);

    await createService(createGitService({}));

    await vi.waitFor(() => {
      expect(getRecentWorkspaces()).toEqual([
        { path: '/existing-folder', name: 'existing-folder', openedAt },
      ]);
    });
  });

  it('saves linked worktree recents as the main worktree path', async () => {
    const service = await createService(
      createGitService({
        '/repo-linked': [
          { path: '/repo', isMainWorktree: true },
          { path: '/repo-linked', isMainWorktree: false },
        ],
      }),
    );

    await service.saveRecentlyOpenedWorkspace({
      path: '/repo-linked',
      name: 'repo-linked',
      openedAt: 10,
    });

    expect(getRecentWorkspaces()).toEqual([
      { path: '/repo', name: 'repo', openedAt: 10 },
    ]);
  });
});
