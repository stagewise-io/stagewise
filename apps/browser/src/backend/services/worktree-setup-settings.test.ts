import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockHomeDir = path.join(os.tmpdir(), 'worktree-setup-settings-home');

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) =>
      name === 'home' ? mockHomeDir : path.join(os.tmpdir(), `mock-${name}`),
  },
}));

import { WorktreeSetupSettingsService } from './worktree-setup-settings';
import { getWorktreesDir } from '@/utils/paths';
import type { GitService } from '@/services/git';
import type { Logger } from '@/services/logger';
import type { UserExperienceService } from '@/services/experience';

const logger = {
  debug: vi.fn(),
  warn: vi.fn(),
} as unknown as Logger;

let repoPath = path.join(os.tmpdir(), 'worktree-setup-settings-repo');
let repoGitDir = path.join(repoPath, '.git');

beforeEach(async () => {
  mockHomeDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'worktree-setup-settings-home-'),
  );
  repoPath = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'worktree-setup-settings-repo-')),
  );
  repoGitDir = path.join(repoPath, '.git');
});

afterEach(async () => {
  await fs.rm(mockHomeDir, { recursive: true, force: true });
  await fs.rm(repoPath, { recursive: true, force: true });
  vi.clearAllMocks();
});

function createService({
  recentPaths = [repoPath],
  managedPath,
  dirty = false,
}: {
  recentPaths?: string[];
  managedPath?: string;
  dirty?: boolean;
} = {}) {
  const userExperienceService = {
    getRecentlyOpenedWorkspaces: vi.fn(async () =>
      recentPaths.map((workspacePath) => ({
        path: workspacePath,
        name: path.basename(workspacePath),
        openedAt: 1,
      })),
    ),
  } as unknown as UserExperienceService;

  const gitService = {
    getWorkspaceRepositoryInfo: vi.fn(async (workspacePath: string) => {
      if (workspacePath === repoPath) {
        return {
          repositoryId: repoGitDir,
          repoRoot: repoPath,
          commonGitDir: repoGitDir,
        };
      }
      return null;
    }),
    getWorkspaceMainWorktreePath: vi.fn(async (workspacePath: string) =>
      workspacePath === repoPath ? repoPath : null,
    ),
    getMountedWorkspaceSummary: vi.fn(async (workspacePath: string) => {
      if (workspacePath !== managedPath) return null;
      return {
        repositoryId: repoGitDir,
        repoRoot: workspacePath,
        worktreeId: workspacePath,
        mainWorktreePath: repoPath,
        commonGitDir: repoGitDir,
        isWorktree: true,
        branch: 'feature-a',
        headSha: 'abc123',
        status: {
          dirty,
          stagedCount: dirty ? 1 : 0,
          unstagedCount: 0,
          untrackedCount: 0,
        },
      };
    }),
    getWorktreeInfo: vi.fn(async (workspacePath: string) => ({
      worktreeId: workspacePath,
      path: workspacePath,
      branch: 'feature-a',
      headSha: 'abc123',
      isDetached: false,
      isMainWorktree: false,
    })),
    getWorktreeStatus: vi.fn(async () => ({
      dirty,
      stagedCount: dirty ? 1 : 0,
      unstagedCount: 0,
      untrackedCount: 0,
    })),
    removeWorktree: vi.fn(async () => ({ ok: true })),
  } as unknown as GitService;

  const service = WorktreeSetupSettingsService.create({
    logger,
    userExperienceService,
    gitService,
    getWorkspaceLastUsedAtByPath: async (workspacePaths) =>
      new Map(workspacePaths.map((workspacePath) => [workspacePath, 123])),
    getMountedWorkspacePaths: () => new Set(),
  });

  return { service, gitService };
}

async function createManagedWorktree(relativePath = 'repo-hash/feature-a') {
  const worktreePath = path.join(getWorktreesDir(), relativePath);
  await fs.mkdir(path.join(worktreePath, '.git'), { recursive: true });
  return await fs.realpath(worktreePath);
}

describe('WorktreeSetupSettingsService', () => {
  it('rejects setup script saves for unknown repositories', async () => {
    const { service } = createService({ recentPaths: [] });

    await expect(service.saveScript(repoPath, '#!/bin/sh')).resolves.toEqual({
      ok: false,
      message: 'Repository is no longer available.',
    });
  });

  it('saves setup scripts only under the repository setup script path', async () => {
    const { service } = createService();

    const result = await service.saveScript(repoPath, '#!/bin/sh\necho ok\n');

    expect(result.ok).toBe(true);
    await expect(
      fs.readFile(
        path.join(repoPath, '.stagewise', 'worktree-setup.sh'),
        'utf8',
      ),
    ).resolves.toBe('#!/bin/sh\necho ok\n');
  });

  it('returns the saved script state when refresh after save cannot find the repository', async () => {
    let repositoryAvailable = true;
    const userExperienceService = {
      getRecentlyOpenedWorkspaces: vi.fn(async () => {
        const workspaces = repositoryAvailable
          ? [
              {
                path: repoPath,
                name: path.basename(repoPath),
                openedAt: 1,
              },
            ]
          : [];
        repositoryAvailable = false;
        return workspaces;
      }),
    } as unknown as UserExperienceService;
    const gitService = {
      getWorkspaceRepositoryInfo: vi.fn(async (workspacePath: string) => {
        if (workspacePath !== repoPath) return null;
        return {
          repositoryId: repoGitDir,
          repoRoot: repoPath,
          commonGitDir: repoGitDir,
        };
      }),
      getWorkspaceMainWorktreePath: vi.fn(async (workspacePath: string) =>
        workspacePath === repoPath ? repoPath : null,
      ),
      getMountedWorkspaceSummary: vi.fn(async () => null),
      getWorktreeInfo: vi.fn(),
      getWorktreeStatus: vi.fn(),
      removeWorktree: vi.fn(async () => ({ ok: true })),
    } as unknown as GitService;
    const service = WorktreeSetupSettingsService.create({
      logger,
      userExperienceService,
      gitService,
      getWorkspaceLastUsedAtByPath: async () => new Map(),
      getMountedWorkspacePaths: () => new Set(),
    });
    const content = '#!/bin/sh\necho saved\n';

    const result = await service.saveScript(repoPath, content);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.repository).toMatchObject({
        mainWorktreePath: repoPath,
        scriptExists: true,
        scriptContent: content,
      });
    }
  });

  it('sorts repositories by latest managed worktree usage', async () => {
    const alphaRepo = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'worktree-settings-alpha-')),
    );
    const bravoRepo = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'worktree-settings-bravo-')),
    );
    const olderRepo = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'worktree-settings-older-')),
    );
    const newerRepo = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'worktree-settings-newer-')),
    );
    const olderWorktree = await createManagedWorktree('older/feature-a');
    const newerWorktree = await createManagedWorktree('newer/feature-b');
    const repos = [bravoRepo, olderRepo, newerRepo, alphaRepo];
    const repoGitDirs = new Map(
      repos.map((repo) => [repo, path.join(repo, '.git')]),
    );
    const worktreeRepoPaths = new Map([
      [olderWorktree, olderRepo],
      [newerWorktree, newerRepo],
    ]);

    try {
      const userExperienceService = {
        getRecentlyOpenedWorkspaces: vi.fn(async () =>
          repos.map((workspacePath) => ({
            path: workspacePath,
            name: path.basename(workspacePath),
            openedAt: 1,
          })),
        ),
      } as unknown as UserExperienceService;

      const gitService = {
        getWorkspaceRepositoryInfo: vi.fn(async (workspacePath: string) => {
          const commonGitDir = repoGitDirs.get(workspacePath);
          if (!commonGitDir) return null;
          return {
            repositoryId: commonGitDir,
            repoRoot: workspacePath,
            commonGitDir,
          };
        }),
        getWorkspaceMainWorktreePath: vi.fn(async (workspacePath: string) =>
          repoGitDirs.has(workspacePath) ? workspacePath : null,
        ),
        getMountedWorkspaceSummary: vi.fn(async (workspacePath: string) => {
          const mainWorktreePath = worktreeRepoPaths.get(workspacePath);
          if (!mainWorktreePath) return null;
          const commonGitDir = repoGitDirs.get(mainWorktreePath);
          return {
            repositoryId: commonGitDir,
            repoRoot: workspacePath,
            worktreeId: workspacePath,
            mainWorktreePath,
            commonGitDir,
            isWorktree: true,
            branch: 'feature-a',
            headSha: 'abc123',
            status: {
              dirty: false,
              stagedCount: 0,
              unstagedCount: 0,
              untrackedCount: 0,
            },
          };
        }),
        getWorktreeInfo: vi.fn(async (workspacePath: string) => ({
          worktreeId: workspacePath,
          path: workspacePath,
          branch: 'feature-a',
          headSha: 'abc123',
          isDetached: false,
          isMainWorktree: false,
        })),
        getWorktreeStatus: vi.fn(async () => ({
          dirty: false,
          stagedCount: 0,
          unstagedCount: 0,
          untrackedCount: 0,
        })),
        removeWorktree: vi.fn(async () => ({ ok: true })),
      } as unknown as GitService;

      const service = WorktreeSetupSettingsService.create({
        logger,
        userExperienceService,
        gitService,
        getWorkspaceLastUsedAtByPath: async () =>
          new Map([
            [olderWorktree, 100],
            [newerWorktree, 200],
          ]),
        getMountedWorkspacePaths: () => new Set(),
      });

      const result = await service.listRepositories();

      expect(result.repositories.map((repo) => repo.mainWorktreePath)).toEqual([
        newerRepo,
        olderRepo,
        alphaRepo,
        bravoRepo,
      ]);
    } finally {
      await Promise.all(
        repos.map((repo) => fs.rm(repo, { recursive: true, force: true })),
      );
    }
  });

  it('keeps listing repositories when one setup script is unreadable', async () => {
    const readableRepo = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'worktree-readable-')),
    );
    const unreadableRepo = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'worktree-unreadable-')),
    );
    const repos = [readableRepo, unreadableRepo];
    const repoGitDirs = new Map(
      repos.map((repo) => [repo, path.join(repo, '.git')]),
    );
    const realReadFile = fs.readFile;
    const readFileSpy = vi
      .spyOn(fs, 'readFile')
      .mockImplementation(
        async (
          filePath: Parameters<typeof fs.readFile>[0],
          options?: Parameters<typeof fs.readFile>[1],
        ) => {
          if (
            String(filePath) ===
            path.join(unreadableRepo, '.stagewise', 'worktree-setup.sh')
          ) {
            throw Object.assign(new Error('permission denied'), {
              code: 'EACCES',
            });
          }
          return realReadFile(filePath, options);
        },
      );

    try {
      const userExperienceService = {
        getRecentlyOpenedWorkspaces: vi.fn(async () =>
          repos.map((workspacePath) => ({
            path: workspacePath,
            name: path.basename(workspacePath),
            openedAt: 1,
          })),
        ),
      } as unknown as UserExperienceService;
      const gitService = {
        getWorkspaceRepositoryInfo: vi.fn(async (workspacePath: string) => {
          const commonGitDir = repoGitDirs.get(workspacePath);
          if (!commonGitDir) return null;
          return {
            repositoryId: commonGitDir,
            repoRoot: workspacePath,
            commonGitDir,
          };
        }),
        getWorkspaceMainWorktreePath: vi.fn(async (workspacePath: string) =>
          repoGitDirs.has(workspacePath) ? workspacePath : null,
        ),
        getMountedWorkspaceSummary: vi.fn(async () => null),
        getWorktreeInfo: vi.fn(),
        getWorktreeStatus: vi.fn(),
        removeWorktree: vi.fn(async () => ({ ok: true })),
      } as unknown as GitService;
      const service = WorktreeSetupSettingsService.create({
        logger,
        userExperienceService,
        gitService,
        getWorkspaceLastUsedAtByPath: async () => new Map(),
        getMountedWorkspacePaths: () => new Set(),
      });

      const result = await service.listRepositories();

      expect(result.repositories.map((repo) => repo.mainWorktreePath)).toEqual([
        readableRepo,
        unreadableRepo,
      ]);
      expect(
        result.repositories.find(
          (repo) => repo.mainWorktreePath === unreadableRepo,
        )?.scriptExists,
      ).toBe(false);
    } finally {
      readFileSpy.mockRestore();
      await Promise.all(
        repos.map((repo) => fs.rm(repo, { recursive: true, force: true })),
      );
    }
  });

  it('includes managed-only repositories and deletes their worktrees', async () => {
    const managedPath = await createManagedWorktree();
    const { service, gitService } = createService({
      recentPaths: [],
      managedPath,
    });

    const listResult = await service.listRepositories();

    expect(listResult.repositories).toHaveLength(1);
    expect(listResult.repositories[0]).toMatchObject({
      mainWorktreePath: repoPath,
      repositoryId: repoGitDir,
    });
    expect(listResult.repositories[0]?.managedWorktrees).toHaveLength(1);
    expect(listResult.repositories[0]?.managedWorktrees[0]?.path).toBe(
      managedPath,
    );

    const deleteResult = await service.deleteManagedWorktree(managedPath);

    expect(deleteResult.ok).toBe(true);
    expect(gitService.removeWorktree).toHaveBeenCalledWith(managedPath);
  });

  it('rejects deleting dirty managed worktrees', async () => {
    const managedPath = await createManagedWorktree();
    const { service, gitService } = createService({ managedPath, dirty: true });

    await expect(service.deleteManagedWorktree(managedPath)).resolves.toEqual({
      ok: false,
      message: 'Worktree has uncommitted changes.',
    });
    expect(gitService.removeWorktree).not.toHaveBeenCalled();
  });

  it('rejects deleting paths outside the managed worktree directory', async () => {
    const { service, gitService } = createService();

    await expect(
      service.deleteManagedWorktree('/tmp/outside'),
    ).resolves.toEqual({
      ok: false,
      message: 'Worktree is not stagewise-managed.',
    });
    expect(gitService.removeWorktree).not.toHaveBeenCalled();
  });

  it('deletes clean managed worktrees and returns refreshed repository state', async () => {
    const managedPath = await createManagedWorktree();
    const { service, gitService } = createService({ managedPath });

    const result = await service.deleteManagedWorktree(managedPath);

    expect(result.ok).toBe(true);
    expect(gitService.removeWorktree).toHaveBeenCalledWith(managedPath);
    if (result.ok) {
      expect(result.repository?.mainWorktreePath).toBe(repoPath);
    }
  });
});
