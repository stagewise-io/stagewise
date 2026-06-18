import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockHomeDir = path.join(os.tmpdir(), 'git-service-mock-home');
let mockElectronHomeDir = mockHomeDir;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) =>
      name === 'home'
        ? mockElectronHomeDir
        : path.join(os.tmpdir(), `mock-${name}`),
  },
}));

import {
  GitService,
  type GitCommandRunner,
  type GitStrictCommandRunner,
} from './index';
import type { Logger } from '@/services/logger';
import type { TelemetryService } from '@/services/telemetry';

beforeEach(async () => {
  mockHomeDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'git-service-mock-home-'),
  );
  mockElectronHomeDir = mockHomeDir;
});

afterEach(async () => {
  await fs.rm(mockHomeDir, { recursive: true, force: true });
});

const logger = {
  debug: vi.fn(),
} as unknown as Logger;

const telemetryService = {
  captureException: vi.fn(),
} as unknown as TelemetryService;

async function createGitService(
  responses: Record<string, string | null>,
  mutationResponses: Record<
    string,
    { stdout?: string; stderr?: string; exitCode?: number }
  > = {},
) {
  const mutationCalls: string[] = [];
  const readCalls: string[] = [];
  const runGitCommand: GitCommandRunner = async (_cwd, args) => {
    const key = args.join(' ');
    readCalls.push(key);
    return responses[key] ?? null;
  };
  const runGitMutationCommand: GitStrictCommandRunner = async (_cwd, args) => {
    const key = args.join(' ');
    mutationCalls.push(key);
    const response = mutationResponses[key] ?? {};
    return {
      stdout: response.stdout ?? '',
      stderr: response.stderr ?? '',
      exitCode: response.exitCode ?? 0,
    };
  };

  const service = await GitService.create({
    logger,
    telemetryService,
    resolvedEnvPromise: Promise.resolve({ PATH: '/usr/bin' }),
    runGitCommand,
    runGitMutationCommand,
  });

  return { service, mutationCalls, readCalls };
}

const repoPath = path.resolve('/repo');
const repoLinkedPath = path.resolve('/repo-linked');
const repoGitDir = path.join(repoPath, '.git');

const baseReadResponses = {
  'rev-parse --show-toplevel --git-common-dir': `${repoPath}\n${repoGitDir}\n`,
  'rev-parse --show-toplevel --abbrev-ref HEAD HEAD': `${repoPath}\nmain\nabc123\n`,
  'worktree list --porcelain':
    'worktree /repo\nHEAD abc123\nbranch refs/heads/main\n',
  'status --porcelain': '',
};

describe('GitService', () => {
  it('returns null mounted workspace summary when git commands fail', async () => {
    const { service } = await createGitService({});

    await expect(
      service.getMountedWorkspaceSummary('/tmp/not-a-repo'),
    ).resolves.toBeNull();
  });

  it('returns workspace repository info for an exact repo root', async () => {
    const { service } = await createGitService(baseReadResponses);

    await expect(service.getWorkspaceRepositoryInfo('/repo')).resolves.toEqual({
      repositoryId: repoGitDir,
      repoRoot: repoPath,
      commonGitDir: repoGitDir,
    });
  });

  it('returns null workspace repository info for a repo subdirectory', async () => {
    const { service } = await createGitService(baseReadResponses);

    await expect(
      service.getWorkspaceRepositoryInfo('/repo/packages/pkg'),
    ).resolves.toBeNull();
  });

  it('returns normalized web URL for HTTPS Git remotes', async () => {
    const { service } = await createGitService({
      'remote -v':
        'origin\thttps://github.com/stagewise-io/stagewise.git (fetch)\n' +
        'origin\thttps://github.com/stagewise-io/stagewise.git (push)\n',
    });

    await expect(service.getRepositoryRemoteUrl('/repo')).resolves.toBe(
      'https://github.com/stagewise-io/stagewise',
    );
  });

  it('returns normalized web URL for SSH Git remotes', async () => {
    const { service } = await createGitService({
      'remote -v':
        'origin\tgit@gitlab.com:stagewise-io/stagewise.git (fetch)\n' +
        'origin\tgit@gitlab.com:stagewise-io/stagewise.git (push)\n',
    });

    await expect(service.getRepositoryRemoteUrl('/repo')).resolves.toBe(
      'https://gitlab.com/stagewise-io/stagewise',
    );
  });

  it('returns normalized web URL for ssh protocol Git remotes', async () => {
    const { service } = await createGitService({
      'remote -v':
        'origin\tssh://git@bitbucket.org/stagewise-io/stagewise.git (fetch)\n' +
        'origin\tssh://git@bitbucket.org/stagewise-io/stagewise.git (push)\n',
    });

    await expect(service.getRepositoryRemoteUrl('/repo')).resolves.toBe(
      'https://bitbucket.org/stagewise-io/stagewise',
    );
  });

  it('prefers the origin remote web URL', async () => {
    const { service } = await createGitService({
      'remote -v':
        'upstream\thttps://github.com/stagewise-io/upstream.git (fetch)\n' +
        'origin\thttps://github.com/stagewise-io/stagewise.git (fetch)\n',
    });

    await expect(service.getRepositoryRemoteUrl('/repo')).resolves.toBe(
      'https://github.com/stagewise-io/stagewise',
    );
  });

  it('returns null when no parseable Git remote exists', async () => {
    const { service } = await createGitService({
      'remote -v': 'origin\tfile:///tmp/repo.git (fetch)\n',
    });

    await expect(service.getRepositoryRemoteUrl('/repo')).resolves.toBeNull();
  });

  it('returns branch summary for a normal repo', async () => {
    const { service } = await createGitService(baseReadResponses);

    const summary = await service.getMountedWorkspaceSummary('/repo');

    expect(summary).toMatchObject({
      repositoryId: repoGitDir,
      worktreeId: repoPath,
      repoRoot: repoPath,
      mainWorktreePath: repoPath,
      commonGitDir: repoGitDir,
      isWorktree: false,
      branch: 'main',
      headSha: 'abc123',
      status: {
        dirty: false,
        stagedCount: 0,
        unstagedCount: 0,
        untrackedCount: 0,
      },
    });
    expect(summary !== null).toBe(true);
    expect(summary?.branch ?? null).toBe('main');
  });

  it('returns detached worktree info for detached HEAD', async () => {
    const { service } = await createGitService({
      'rev-parse --show-toplevel --git-common-dir': `${repoPath}\n${repoGitDir}\n`,
      'rev-parse --show-toplevel --abbrev-ref HEAD HEAD': `${repoPath}\nHEAD\nabc123\n`,
      'worktree list --porcelain': 'worktree /repo\nHEAD abc123\ndetached\n',
      'status --porcelain': '',
    });

    await expect(service.getWorktreeInfo('/repo')).resolves.toMatchObject({
      isDetached: true,
      branch: null,
      headSha: 'abc123',
    });
    await expect(
      service.getMountedWorkspaceSummary('/repo'),
    ).resolves.toMatchObject({
      mainWorktreePath: repoPath,
      branch: null,
      headSha: 'abc123',
    });
  });

  it('parses multiple worktree porcelain entries', async () => {
    const { service } = await createGitService({
      'worktree list --porcelain': [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /repo-linked',
        'HEAD def456',
        'branch refs/heads/feature/test',
      ].join('\n'),
    });

    await expect(service.listWorktrees('/repo')).resolves.toEqual([
      {
        worktreeId: repoPath,
        path: repoPath,
        branch: 'main',
        headSha: 'abc123',
        isDetached: false,
        isMainWorktree: true,
        createdAt: null,
      },
      {
        worktreeId: repoLinkedPath,
        path: repoLinkedPath,
        branch: 'feature/test',
        headSha: 'def456',
        isDetached: false,
        isMainWorktree: false,
        createdAt: null,
      },
    ]);
  });

  it('drops prunable worktrees whose working tree is gone', async () => {
    const { service } = await createGitService({
      'worktree list --porcelain': [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /repo-linked',
        'HEAD def456',
        'branch refs/heads/feature/test',
        'prunable gitdir file points to non-existent location',
      ].join('\n'),
    });

    await expect(service.listWorktrees('/repo')).resolves.toEqual([
      {
        worktreeId: repoPath,
        path: repoPath,
        branch: 'main',
        headSha: 'abc123',
        isDetached: false,
        isMainWorktree: true,
        createdAt: null,
      },
    ]);
  });

  it('populates createdAt from the worktree .git birthtime', async () => {
    const liveRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'git-wt-live-'));
    await fs.mkdir(path.join(liveRepo, '.git'));
    try {
      const { service } = await createGitService({
        'worktree list --porcelain': [
          `worktree ${liveRepo}`,
          'HEAD abc123',
          'branch refs/heads/main',
        ].join('\n'),
      });

      const worktrees = await service.listWorktrees(liveRepo);
      expect(worktrees).toHaveLength(1);
      expect(typeof worktrees[0].createdAt).toBe('number');
      expect(worktrees[0].createdAt).toBeGreaterThan(0);
    } finally {
      await fs.rm(liveRepo, { recursive: true, force: true });
    }
  });

  it('returns null mounted workspace summary for a repo subdirectory', async () => {
    const { service, readCalls } = await createGitService(baseReadResponses);

    await expect(
      service.getMountedWorkspaceSummary('/repo/packages/pkg'),
    ).resolves.toBeNull();
    expect(readCalls).toEqual(['rev-parse --show-toplevel --git-common-dir']);
  });

  it('reports linked worktree summary as worktree', async () => {
    const { service } = await createGitService({
      'rev-parse --show-toplevel --git-common-dir': `${repoLinkedPath}\n${repoGitDir}\n`,
      'rev-parse --show-toplevel --abbrev-ref HEAD HEAD': `${repoLinkedPath}\nfeature/test\ndef456\n`,
      'worktree list --porcelain': [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /repo-linked',
        'HEAD def456',
        'branch refs/heads/feature/test',
      ].join('\n'),
      'status --porcelain': ' M src/index.ts\n?? tmp.txt\n',
    });

    await expect(
      service.getMountedWorkspaceSummary('/repo-linked'),
    ).resolves.toMatchObject({
      repositoryId: repoGitDir,
      worktreeId: repoLinkedPath,
      mainWorktreePath: repoPath,
      isWorktree: true,
      branch: 'feature/test',
      headSha: 'def456',
      status: {
        dirty: true,
        stagedCount: 0,
        unstagedCount: 1,
        untrackedCount: 1,
      },
    });
  });

  it('lists local branches with current, default, and checked-out metadata', async () => {
    const { service } = await createGitService({
      ...baseReadResponses,
      'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads': [
        'main\t*',
        'feature/test\t',
      ].join('\n'),
      'for-each-ref --format=%(refname:short) refs/remotes': [
        'origin/HEAD',
        'origin/main',
      ].join('\n'),
      'worktree list --porcelain': [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /repo-linked',
        'HEAD def456',
        'branch refs/heads/feature/test',
      ].join('\n'),
    });

    await expect(service.listBranches('/repo')).resolves.toEqual({
      current: 'main',
      defaultBranch: 'main',
      defaultRemoteBranch: 'origin/main',
      branches: [
        {
          name: 'main',
          kind: 'local',
          current: true,
          checkedOut: true,
          checkedOutPath: repoPath,
        },
        {
          name: 'feature/test',
          kind: 'local',
          current: false,
          checkedOut: true,
          checkedOutPath: repoLinkedPath,
        },
        {
          name: 'origin/main',
          kind: 'remote',
          remoteName: 'origin',
          remoteBranchName: 'main',
          current: false,
          checkedOut: false,
        },
      ],
    });
  });

  it('prefers origin HEAD as the default branch', async () => {
    const { service, readCalls } = await createGitService({
      ...baseReadResponses,
      'rev-parse --show-toplevel --abbrev-ref HEAD HEAD':
        '/repo\ndevelop\nabc123\n',
      'worktree list --porcelain':
        'worktree /repo\nHEAD abc123\nbranch refs/heads/develop\n',
      'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads': [
        'develop\t*',
        'main\t',
      ].join('\n'),
      'for-each-ref --format=%(refname:short) refs/remotes': [
        'origin/HEAD',
        'origin/main',
      ].join('\n'),
      'symbolic-ref --quiet --short refs/remotes/origin/HEAD': 'origin/main',
    });

    await expect(service.listBranches('/repo')).resolves.toMatchObject({
      current: 'develop',
      defaultBranch: 'main',
      defaultRemoteBranch: 'origin/main',
    });
    expect(readCalls).toContain(
      'symbolic-ref --quiet --short refs/remotes/origin/HEAD',
    );
  });

  it('prefers the configured branch remote for remote defaults', async () => {
    const { service, readCalls } = await createGitService({
      ...baseReadResponses,
      'rev-parse --show-toplevel --abbrev-ref HEAD HEAD':
        '/repo\ndevelop\nabc123\n',
      'worktree list --porcelain':
        'worktree /repo\nHEAD abc123\nbranch refs/heads/develop\n',
      'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads': [
        'develop\t*',
        'main\t',
      ].join('\n'),
      'for-each-ref --format=%(refname:short) refs/remotes': [
        'origin/main',
        'upstream/main',
      ].join('\n'),
      remote: ['origin', 'upstream'].join('\n'),
      'config --get branch.develop.remote': 'upstream',
      'symbolic-ref --quiet --short refs/remotes/upstream/HEAD':
        'upstream/main',
    });

    await expect(service.listBranches('/repo')).resolves.toMatchObject({
      current: 'develop',
      defaultBranch: 'main',
      defaultRemoteBranch: 'upstream/main',
    });
    expect(readCalls).toContain(
      'symbolic-ref --quiet --short refs/remotes/upstream/HEAD',
    );
  });

  it('falls back to the first available remote when origin is unavailable', async () => {
    const { service } = await createGitService({
      ...baseReadResponses,
      'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads': 'main\t*',
      'for-each-ref --format=%(refname:short) refs/remotes': [
        'upstream/main',
        'fork/main',
      ].join('\n'),
      remote: ['upstream', 'fork'].join('\n'),
      'symbolic-ref --quiet --short refs/remotes/upstream/HEAD':
        'upstream/main',
    });

    await expect(service.listBranches('/repo')).resolves.toMatchObject({
      defaultRemoteBranch: 'upstream/main',
    });
  });

  it('falls back to main when origin HEAD is unavailable', async () => {
    const { service } = await createGitService({
      ...baseReadResponses,
      'rev-parse --show-toplevel --abbrev-ref HEAD HEAD':
        '/repo\ndevelop\nabc123\n',
      'worktree list --porcelain':
        'worktree /repo\nHEAD abc123\nbranch refs/heads/develop\n',
      'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads': [
        'develop\t*',
        'main\t',
      ].join('\n'),
    });

    await expect(service.listBranches('/repo')).resolves.toMatchObject({
      current: 'develop',
      defaultBranch: 'main',
      defaultRemoteBranch: null,
    });
  });

  it('switches branches with checkout', async () => {
    const { service, mutationCalls } = await createGitService({
      ...baseReadResponses,
      'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads': [
        'main\t*',
        'feature\t',
      ].join('\n'),
    });

    await expect(
      service.switchBranch('/repo', 'feature'),
    ).resolves.toMatchObject({ ok: true });
    expect(mutationCalls).toContain('checkout feature');
  });

  it('returns structured checkout failure', async () => {
    const { service } = await createGitService(
      {
        ...baseReadResponses,
        'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads': [
          'main\t*',
          'feature\t',
        ].join('\n'),
      },
      {
        'checkout feature': {
          exitCode: 1,
          stderr: 'local changes would be overwritten',
        },
      },
    );

    await expect(service.switchBranch('/repo', 'feature')).resolves.toEqual({
      ok: false,
      reason: 'checkout-failed',
      message: 'local changes would be overwritten',
    });
  });

  it('prevents switching to a remote branch ref', async () => {
    const { service, mutationCalls } = await createGitService({
      ...baseReadResponses,
      'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads': 'main\t*',
      'for-each-ref --format=%(refname:short) refs/remotes': 'origin/main',
      remote: 'origin',
    });

    await expect(service.switchBranch('/repo', 'origin/main')).resolves.toEqual(
      {
        ok: false,
        reason: 'branch-not-found',
        message: 'Branch origin/main is not a local branch.',
      },
    );
    expect(mutationCalls).not.toContain('checkout origin/main');
  });

  it('prevents switching to a branch checked out in another worktree', async () => {
    const { service } = await createGitService({
      ...baseReadResponses,
      'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads': [
        'main\t*',
        'feature/test\t',
      ].join('\n'),
      'worktree list --porcelain': [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /repo-linked',
        'HEAD def456',
        'branch refs/heads/feature/test',
      ].join('\n'),
    });

    await expect(
      service.switchBranch('/repo', 'feature/test'),
    ).resolves.toEqual({
      ok: false,
      reason: 'branch-checked-out',
      message:
        'Branch feature/test is already checked out in another worktree.',
    });
  });

  it('creates and checks out a branch from a source branch', async () => {
    const { service, mutationCalls } = await createGitService({
      ...baseReadResponses,
      'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads': 'main\t*',
    });

    await expect(
      service.createBranch('/repo', {
        branchName: 'feature/login',
        sourceBranch: 'main',
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(mutationCalls).toContain('check-ref-format --branch feature/login');
    expect(mutationCalls).toContain('checkout -b feature/login main');
  });

  it('fetches remote source branches before creating a branch', async () => {
    const { service, mutationCalls } = await createGitService({
      ...baseReadResponses,
      'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads': 'main\t*',
      'for-each-ref --format=%(refname:short) refs/remotes': 'origin/main',
    });

    await expect(
      service.createBranch('/repo', {
        branchName: 'feature/new',
        sourceBranch: 'origin/main',
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(mutationCalls).toContain(
      'fetch --prune origin refs/heads/main:refs/remotes/origin/main',
    );
    expect(mutationCalls).toContain('checkout -b feature/new origin/main');
  });

  it('returns branch-create-failed when fetching a remote source branch fails', async () => {
    const { service } = await createGitService(
      {
        ...baseReadResponses,
        'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads':
          'main\t*',
        'for-each-ref --format=%(refname:short) refs/remotes': 'origin/main',
      },
      {
        'fetch --prune origin refs/heads/main:refs/remotes/origin/main': {
          exitCode: 1,
          stderr: 'network error',
        },
      },
    );

    await expect(
      service.createBranch('/repo', {
        branchName: 'feature/new',
        sourceBranch: 'origin/main',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'branch-create-failed',
      message: 'network error',
    });
  });

  it('returns worktree-create-failed when fetching a remote source branch fails for worktree', async () => {
    const { service } = await createGitService(
      {
        ...baseReadResponses,
        'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads':
          'main\t*',
        'for-each-ref --format=%(refname:short) refs/remotes': 'origin/main',
      },
      {
        'fetch --prune origin refs/heads/main:refs/remotes/origin/main': {
          exitCode: 1,
          stderr: 'auth failed',
        },
      },
    );

    await expect(
      service.createWorktree('/repo', {
        worktreeName: 'new-work',
        sourceBranch: 'origin/main',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'worktree-create-failed',
      message: 'auth failed',
    });
  });

  it('rejects create-branch branch collisions', async () => {
    const { service } = await createGitService({
      ...baseReadResponses,
      'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads': [
        'main\t*',
        'feature\t',
      ].join('\n'),
    });

    await expect(
      service.createBranch('/repo', {
        branchName: 'feature',
        sourceBranch: 'main',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'branch-already-exists',
      message: 'Branch feature already exists.',
    });
  });

  it('creates worktrees under the home worktrees directory', async () => {
    const { service, mutationCalls } = await createGitService({
      ...baseReadResponses,
      'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads': 'main\t*',
    });

    const result = await service.createWorktree('/repo', {
      worktreeName: 'new-work',
      sourceBranch: 'main',
    });

    const expectedWorktreePathPattern = escapeRegExp(
      path.join(mockHomeDir, '.stagewise', 'worktrees'),
    );

    expect(result.ok).toBe(true);
    expect(mutationCalls).toContain('check-ref-format --branch new-work');
    expect(
      mutationCalls.find((call) => call.startsWith('worktree add -b ')),
    ).toMatch(
      new RegExp(
        `^worktree add -b new-work ${expectedWorktreePathPattern}${escapeRegExp(path.sep)}[a-f0-9]{12}${escapeRegExp(path.sep)}new-work main$`,
      ),
    );
  });

  it('fetches remote source branches before creating worktrees', async () => {
    const { service, mutationCalls } = await createGitService({
      ...baseReadResponses,
      'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads': 'main\t*',
      'for-each-ref --format=%(refname:short) refs/remotes': 'origin/main',
    });

    const result = await service.createWorktree('/repo', {
      worktreeName: 'new-work',
      sourceBranch: 'origin/main',
    });

    expect(result.ok).toBe(true);
    expect(mutationCalls).toContain(
      'fetch --prune origin refs/heads/main:refs/remotes/origin/main',
    );
    expect(
      mutationCalls.find((call) => call.startsWith('worktree add -b ')),
    ).toContain('worktree add -b new-work --no-track ');
  });

  it('rejects create-worktree branch collisions', async () => {
    const { service } = await createGitService({
      ...baseReadResponses,
      'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads': [
        'main\t*',
        'new-work\t',
      ].join('\n'),
    });

    await expect(
      service.createWorktree('/repo', {
        worktreeName: 'new-work',
        sourceBranch: 'main',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'branch-already-exists',
      message: 'Branch new-work already exists.',
    });
  });

  it('accepts slash-separated worktree branch names', async () => {
    const { service, mutationCalls } = await createGitService({
      ...baseReadResponses,
      'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads': 'main\t*',
    });

    const result = await service.createWorktree('/repo', {
      worktreeName: 'feature/login',
      sourceBranch: 'main',
    });

    const expectedWorktreePathPattern = escapeRegExp(
      path.join(mockHomeDir, '.stagewise', 'worktrees'),
    );

    expect(result.ok).toBe(true);
    expect(mutationCalls).toContain('check-ref-format --branch feature/login');
    expect(
      mutationCalls.find((call) => call.startsWith('worktree add -b ')),
    ).toMatch(
      new RegExp(
        `^worktree add -b feature/login ${expectedWorktreePathPattern}${escapeRegExp(path.sep)}[a-f0-9]{12}${escapeRegExp(path.sep)}feature${escapeRegExp(path.sep)}login main$`,
      ),
    );
  });

  it('returns structured failure when creating the worktree directory fails', async () => {
    const mkdirSpy = vi
      .spyOn(fs, 'mkdir')
      .mockRejectedValueOnce(new Error('mkdir failed'));
    const { service } = await createGitService({
      ...baseReadResponses,
      'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads': 'main\t*',
    });

    const result = await service.createWorktree('/repo', {
      worktreeName: 'new-work',
      sourceBranch: 'main',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'worktree-create-failed',
      message: 'Failed to create worktree directory: mkdir failed',
    });
    expect(mkdirSpy).toHaveBeenCalledOnce();
  });

  it('detects a branch merged into the default branch', async () => {
    const { service, mutationCalls } = await createGitService(
      {
        ...baseReadResponses,
        'rev-parse --show-toplevel --abbrev-ref HEAD HEAD': `${repoPath}\nfeature-a\ndef456\n`,
        'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads':
          'main\t\nfeature-a\t*',
        'symbolic-ref --quiet --short refs/remotes/origin/HEAD': 'origin/main',
      },
      {
        'merge-base --is-ancestor feature-a main': { exitCode: 0 },
      },
    );

    await expect(
      service.findMergedTarget('/repo', 'feature-a'),
    ).resolves.toEqual({
      merged: true,
      target: 'main',
    });
    expect(mutationCalls).toContain('merge-base --is-ancestor feature-a main');
  });

  it('returns unmerged when no safe target contains the branch', async () => {
    const { service } = await createGitService(
      {
        ...baseReadResponses,
        'rev-parse --show-toplevel --abbrev-ref HEAD HEAD': `${repoPath}\nfeature-a\ndef456\n`,
        'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads':
          'main\t\nfeature-a\t*',
        'symbolic-ref --quiet --short refs/remotes/origin/HEAD': 'origin/main',
      },
      {
        'merge-base --is-ancestor feature-a main': { exitCode: 1 },
      },
    );

    await expect(
      service.findMergedTarget('/repo', 'feature-a'),
    ).resolves.toEqual({
      merged: false,
      target: null,
    });
  });

  it('removes worktrees without force', async () => {
    const { service, mutationCalls } =
      await createGitService(baseReadResponses);

    await expect(service.removeWorktree('/repo')).resolves.toEqual({
      ok: true,
    });
    expect(mutationCalls).toContain('worktree remove /repo');
  });

  it('returns structured worktree command failure', async () => {
    const { service } = await createGitService(
      {
        ...baseReadResponses,
        'for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads':
          'main\t*',
      },
      {
        'check-ref-format --branch ../bad': {
          exitCode: 1,
          stderr: 'fatal: invalid branch name',
        },
        'worktree add -b new-work /dev/null main': {
          exitCode: 1,
          stderr: 'boom',
        },
      },
    );

    await expect(
      service.createWorktree('/repo', {
        worktreeName: '../bad',
        sourceBranch: 'main',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'invalid-name',
      message: 'Worktree name is invalid.',
    });
  });

  describe('getDiffNumstat', () => {
    const diffBaseResponses = {
      'rev-parse --show-toplevel --git-common-dir': `${repoPath}\n${repoGitDir}\n`,
      'diff --cached --find-renames --numstat': null,
      'ls-files --others --exclude-standard -z': null,
      'diff --cached --find-renames --name-status': null,
    };

    it('returns null when not a git repository', async () => {
      const { service } = await createGitService({});
      await expect(service.getDiffNumstat('/not-a-repo')).resolves.toBeNull();
    });

    it('returns empty summary when all git commands produce empty output', async () => {
      const { service } = await createGitService({
        ...diffBaseResponses,
        'diff --find-renames --numstat': '',
        'diff --find-renames --name-status': '',
      });
      await expect(service.getDiffNumstat('/repo')).resolves.toEqual({
        entries: [],
        totalAdded: 0,
        totalDeleted: 0,
      });
    });

    describe('rename detection', () => {
      it('parses compact rename at root: {old => new}/file.ts', async () => {
        const { service } = await createGitService({
          ...diffBaseResponses,
          'diff --find-renames --numstat': '3\t2\t{old-name => new-name}.ts',
          'diff --find-renames --name-status': 'R100\told-name.ts\tnew-name.ts',
        });

        const result = await service.getDiffNumstat('/repo');
        expect(result?.entries).toEqual([
          {
            path: 'new-name.ts',
            added: 3,
            deleted: 2,
            changeType: 'renamed',
            oldPath: 'old-name.ts',
            staged: false,
          },
        ]);
        expect(result?.totalAdded).toBe(3);
        expect(result?.totalDeleted).toBe(2);
      });

      it('parses compact rename with directory prefix: src/{old => new}/file.ts', async () => {
        const { service } = await createGitService({
          ...diffBaseResponses,
          'diff --find-renames --numstat':
            '5\t3\tsrc/{old-dir => new-dir}/utils.ts',
          'diff --find-renames --name-status':
            'R100\tsrc/old-dir/utils.ts\tsrc/new-dir/utils.ts',
        });

        const result = await service.getDiffNumstat('/repo');
        expect(result?.entries).toEqual([
          {
            path: 'src/new-dir/utils.ts',
            added: 5,
            deleted: 3,
            changeType: 'renamed',
            oldPath: 'src/old-dir/utils.ts',
            staged: false,
          },
        ]);
      });

      it('parses compact rename with no prefix/suffix: {old => new}', async () => {
        const { service } = await createGitService({
          ...diffBaseResponses,
          'diff --find-renames --numstat': '0\t0\t{legacy => modern}',
          'diff --find-renames --name-status': 'R100\tlegacy\tmodern',
        });

        const result = await service.getDiffNumstat('/repo');
        expect(result?.entries).toEqual([
          {
            path: 'modern',
            added: 0,
            deleted: 0,
            changeType: 'renamed',
            oldPath: 'legacy',
            staged: false,
          },
        ]);
      });

      it('parses full-path rename: old/file.ts => new/file.ts', async () => {
        const { service } = await createGitService({
          ...diffBaseResponses,
          'diff --find-renames --numstat':
            '1\t1\told/path/file.ts => new/path/file.ts',
          'diff --find-renames --name-status':
            'R100\told/path/file.ts\tnew/path/file.ts',
        });

        const result = await service.getDiffNumstat('/repo');
        expect(result?.entries).toEqual([
          {
            path: 'new/path/file.ts',
            added: 1,
            deleted: 1,
            changeType: 'renamed',
            oldPath: 'old/path/file.ts',
            staged: false,
          },
        ]);
      });

      it('parses rename with content changes (non-zero added/deleted)', async () => {
        const { service } = await createGitService({
          ...diffBaseResponses,
          'diff --find-renames --numstat': '10\t5\t{old => new}/README.md',
          'diff --find-renames --name-status':
            'R078\told/README.md\tnew/README.md',
        });

        const result = await service.getDiffNumstat('/repo');
        expect(result?.entries).toEqual([
          {
            path: 'new/README.md',
            added: 10,
            deleted: 5,
            changeType: 'renamed',
            oldPath: 'old/README.md',
            staged: false,
          },
        ]);
      });
    });

    describe('changeType from name-status', () => {
      it('labels modified files correctly via name-status (not count-based)', async () => {
        // Pure additions (5/0) — would be 'added' by count logic,
        // but name-status says 'M' (modified).
        const { service } = await createGitService({
          ...diffBaseResponses,
          'diff --find-renames --numstat': '5\t0\tREADME.md',
          'diff --find-renames --name-status': 'M\tREADME.md',
        });

        const result = await service.getDiffNumstat('/repo');
        expect(result?.entries).toEqual([
          {
            path: 'README.md',
            added: 5,
            deleted: 0,
            changeType: 'modified',
            staged: false,
          },
        ]);
      });

      it('labels deleted files via name-status (not count-based)', async () => {
        // Modified file with only deletions (0/3) — would be 'deleted'
        // by count logic, but name-status says 'M'.
        const { service } = await createGitService({
          ...diffBaseResponses,
          'diff --find-renames --numstat': '0\t3\tDEPRECATED.ts',
          'diff --find-renames --name-status': 'M\tDEPRECATED.ts',
        });

        const result = await service.getDiffNumstat('/repo');
        expect(result?.entries).toEqual([
          {
            path: 'DEPRECATED.ts',
            added: 0,
            deleted: 3,
            changeType: 'modified',
            staged: false,
          },
        ]);
      });

      it('labels fully deleted files via name-status', async () => {
        const { service } = await createGitService({
          ...diffBaseResponses,
          'diff --find-renames --numstat': '0\t42\tremoved.ts',
          'diff --find-renames --name-status': 'D\tremoved.ts',
        });

        const result = await service.getDiffNumstat('/repo');
        expect(result?.entries).toEqual([
          {
            path: 'removed.ts',
            added: 0,
            deleted: 42,
            changeType: 'deleted',
            staged: false,
          },
        ]);
      });

      it('labels added files via name-status', async () => {
        const { service } = await createGitService({
          ...diffBaseResponses,
          'diff --find-renames --numstat': '100\t0\tnew-file.ts',
          'diff --find-renames --name-status': 'A\tnew-file.ts',
        });

        const result = await service.getDiffNumstat('/repo');
        expect(result?.entries).toEqual([
          {
            path: 'new-file.ts',
            added: 100,
            deleted: 0,
            changeType: 'added',
            staged: false,
          },
        ]);
      });

      it('falls back to count-based inference when name-status is empty', async () => {
        const { service } = await createGitService({
          ...diffBaseResponses,
          'diff --find-renames --numstat':
            '8\t0\tadded.ts\n0\t6\tdeleted.ts\n4\t2\tmodified.ts',
          'diff --find-renames --name-status': '',
        });

        const result = await service.getDiffNumstat('/repo');
        expect(result?.entries).toEqual([
          {
            path: 'added.ts',
            added: 8,
            deleted: 0,
            changeType: 'added',
            staged: false,
          },
          {
            path: 'deleted.ts',
            added: 0,
            deleted: 6,
            changeType: 'deleted',
            staged: false,
          },
          {
            path: 'modified.ts',
            added: 4,
            deleted: 2,
            changeType: 'modified',
            staged: false,
          },
        ]);
      });

      it('merges staged and unstaged entries for the same file', async () => {
        const { service } = await createGitService({
          ...diffBaseResponses,
          'diff --find-renames --numstat': '3\t0\tboth.ts',
          'diff --find-renames --name-status': 'M\tboth.ts',
          'diff --cached --find-renames --numstat': '0\t2\tboth.ts',
          'diff --cached --find-renames --name-status': 'M\tboth.ts',
        });

        const result = await service.getDiffNumstat('/repo');
        expect(result?.entries).toEqual([
          {
            path: 'both.ts',
            added: 3,
            deleted: 2,
            // staged=true because at least one side is staged
            changeType: 'modified',
            staged: true,
          },
        ]);
      });

      it('accumulates totals across all entries', async () => {
        const { service } = await createGitService({
          ...diffBaseResponses,
          'diff --find-renames --numstat':
            '10\t5\ta.ts\n3\t0\tb.ts\n0\t1\tc.ts',
          'diff --find-renames --name-status': 'M\ta.ts\nA\tb.ts\nD\tc.ts',
        });

        const result = await service.getDiffNumstat('/repo');
        expect(result?.totalAdded).toBe(13);
        expect(result?.totalDeleted).toBe(6);
      });
    });

    describe('untracked files', () => {
      it('includes untracked files with line counts and totals', async () => {
        const { service } = await createGitService({
          ...diffBaseResponses,
          'diff --find-renames --numstat': '',
          'diff --find-renames --name-status': '',
          'ls-files --others --exclude-standard -z':
            'new-file.ts\0unlisted.md\0',
        });

        // Spy on private countFileLines to return known line counts
        // without touching the filesystem.
        const countSpy = vi
          .spyOn(
            service as unknown as {
              countFileLines: (p: string) => Promise<number>;
            },
            'countFileLines',
          )
          .mockImplementation(async (absPath: string) => {
            if (absPath.endsWith('new-file.ts')) return 42;
            if (absPath.endsWith('unlisted.md')) return 7;
            return 0;
          });

        const result = await service.getDiffNumstat('/repo');

        expect(countSpy).toHaveBeenCalledTimes(2);
        countSpy.mockRestore();

        expect(result?.entries).toEqual([
          {
            path: 'new-file.ts',
            added: 42,
            deleted: 0,
            changeType: 'untracked',
            staged: false,
          },
          {
            path: 'unlisted.md',
            added: 7,
            deleted: 0,
            changeType: 'untracked',
            staged: false,
          },
        ]);
        expect(result?.totalAdded).toBe(49);
        expect(result?.totalDeleted).toBe(0);
      });

      it('skips untracked paths already present in diff entries', async () => {
        const { service } = await createGitService({
          ...diffBaseResponses,
          'diff --find-renames --numstat': '5\t0\tshared.ts',
          'diff --find-renames --name-status': 'A\tshared.ts',
          'ls-files --others --exclude-standard -z': 'shared.ts\0only-new.ts\0',
        });

        const countSpy = vi
          .spyOn(
            service as unknown as {
              countFileLines: (p: string) => Promise<number>;
            },
            'countFileLines',
          )
          .mockImplementation(async (absPath: string) => {
            if (absPath.endsWith('only-new.ts')) return 3;
            return 0;
          });

        const result = await service.getDiffNumstat('/repo');

        // shared.ts is already covered by the diff; only only-new.ts
        // should trigger a countFileLines call.
        expect(countSpy).toHaveBeenCalledTimes(1);
        countSpy.mockRestore();

        expect(result?.entries).toHaveLength(2);
        expect(result?.entries).toEqual(
          expect.arrayContaining([
            {
              path: 'shared.ts',
              added: 5,
              deleted: 0,
              changeType: 'added',
              staged: false,
            },
            {
              path: 'only-new.ts',
              added: 3,
              deleted: 0,
              changeType: 'untracked',
              staged: false,
            },
          ]),
        );
        expect(result?.totalAdded).toBe(8);
        expect(result?.totalDeleted).toBe(0);
      });

      it('updates deleted entry when untracked file recreated at same path', async () => {
        // staged D + recreated untracked: file was deleted and staged,
        // then recreated on disk before committing.
        const { service } = await createGitService({
          ...diffBaseResponses,
          'diff --find-renames --numstat': '',
          'diff --find-renames --name-status': '',
          'diff --cached --find-renames --numstat': '0\t15\treborn.ts',
          'diff --cached --find-renames --name-status': 'D\treborn.ts',
          'ls-files --others --exclude-standard -z': 'reborn.ts\0other.ts\0',
        });

        const countSpy = vi
          .spyOn(
            service as unknown as {
              countFileLines: (p: string) => Promise<number>;
            },
            'countFileLines',
          )
          .mockImplementation(async (absPath: string) => {
            if (absPath.endsWith('reborn.ts')) return 22;
            if (absPath.endsWith('other.ts')) return 5;
            return 0;
          });

        const result = await service.getDiffNumstat('/repo');

        countSpy.mockRestore();

        // reborn.ts: staged D (15 deleted lines) + untracked (22 new lines)
        // → merged entry shows both, changeType promoted from deleted to
        // modified so the Diff view allows clicking.
        expect(result?.entries).toHaveLength(2);
        expect(result?.entries).toEqual(
          expect.arrayContaining([
            {
              path: 'reborn.ts',
              added: 22,
              deleted: 15,
              changeType: 'modified',
              staged: true,
            },
            {
              path: 'other.ts',
              added: 5,
              deleted: 0,
              changeType: 'untracked',
              staged: false,
            },
          ]),
        );
        expect(result?.totalAdded).toBe(27);
        expect(result?.totalDeleted).toBe(15);
      });
    });

    describe('split staged/unstaged status', () => {
      it('preserves per-side changeType when a file appears in both', async () => {
        // staged: M (modified), unstaged: D (deleted)
        // Without separate status maps the staged 'M' would overwrite
        // unstaged 'D', hiding that the working-tree file was deleted.
        const { service } = await createGitService({
          ...diffBaseResponses,
          // Unstaged: file deleted in working tree
          'diff --find-renames --numstat': '0\t42\tsplit.ts',
          'diff --find-renames --name-status': 'D\tsplit.ts',
          // Staged: file modified and staged
          'diff --cached --find-renames --numstat': '10\t0\tsplit.ts',
          'diff --cached --find-renames --name-status': 'M\tsplit.ts',
        });

        const result = await service.getDiffNumstat('/repo');

        // The unstaged deletion lines (42) and staged addition lines (10)
        // should both be present. When either side reports deleted, the
        // merged entry must be deleted so the Diff view disables clicks.
        expect(result?.totalAdded).toBe(10);
        expect(result?.totalDeleted).toBe(42);
        expect(result?.entries).toHaveLength(1);
        expect(result!.entries![0]).toMatchObject({
          path: 'split.ts',
          added: 10,
          deleted: 42,
          changeType: 'deleted',
          staged: true,
        });
      });
    });
  });
});
