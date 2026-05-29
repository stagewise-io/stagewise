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
      },
      {
        worktreeId: repoLinkedPath,
        path: repoLinkedPath,
        branch: 'feature/test',
        headSha: 'def456',
        isDetached: false,
        isMainWorktree: false,
      },
    ]);
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
      branches: [
        {
          name: 'main',
          current: true,
          checkedOut: true,
          checkedOutPath: repoPath,
        },
        {
          name: 'feature/test',
          current: false,
          checkedOut: true,
          checkedOutPath: repoLinkedPath,
        },
      ],
    });
  });

  it('prefers origin HEAD as the default branch', async () => {
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
      'symbolic-ref --quiet --short refs/remotes/origin/HEAD': 'origin/main',
    });

    await expect(service.listBranches('/repo')).resolves.toMatchObject({
      current: 'develop',
      defaultBranch: 'main',
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
});
