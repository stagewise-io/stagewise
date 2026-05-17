import { describe, expect, it, vi } from 'vitest';
import { GitService, type GitCommandRunner } from './index';
import type { Logger } from '@/services/logger';
import type { TelemetryService } from '@/services/telemetry';

const logger = {
  debug: vi.fn(),
} as unknown as Logger;

const telemetryService = {
  captureException: vi.fn(),
} as unknown as TelemetryService;

function createGitService(responses: Record<string, string | null>) {
  const runGitCommand: GitCommandRunner = async (_cwd, args) => {
    const key = args.join(' ');
    return responses[key] ?? null;
  };

  return GitService.create({
    logger,
    telemetryService,
    resolvedEnvPromise: Promise.resolve({ PATH: '/usr/bin' }),
    runGitCommand,
  });
}

describe('GitService', () => {
  it('returns null mounted workspace summary when git commands fail', async () => {
    const service = await createGitService({});

    await expect(
      service.getMountedWorkspaceSummary('/tmp/not-a-repo'),
    ).resolves.toBeNull();
  });

  it('returns branch summary for a normal repo', async () => {
    const service = await createGitService({
      'rev-parse --show-toplevel --git-common-dir': '/repo\n/repo/.git\n',
      'rev-parse --show-toplevel --abbrev-ref HEAD HEAD':
        '/repo\nmain\nabc123\n',
      'worktree list --porcelain':
        'worktree /repo\nHEAD abc123\nbranch refs/heads/main\n',
      'status --porcelain': '',
    });

    const summary = await service.getMountedWorkspaceSummary('/repo');

    expect(summary).toMatchObject({
      repositoryId: '/repo/.git',
      worktreeId: '/repo',
      repoRoot: '/repo',
      commonGitDir: '/repo/.git',
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
    const service = await createGitService({
      'rev-parse --show-toplevel --git-common-dir': '/repo\n/repo/.git\n',
      'rev-parse --show-toplevel --abbrev-ref HEAD HEAD':
        '/repo\nHEAD\nabc123\n',
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
      branch: null,
      headSha: 'abc123',
    });
  });

  it('parses multiple worktree porcelain entries', async () => {
    const service = await createGitService({
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
        worktreeId: '/repo',
        path: '/repo',
        branch: 'main',
        headSha: 'abc123',
        isDetached: false,
        isMainWorktree: true,
      },
      {
        worktreeId: '/repo-linked',
        path: '/repo-linked',
        branch: 'feature/test',
        headSha: 'def456',
        isDetached: false,
        isMainWorktree: false,
      },
    ]);
  });

  it('reports linked worktree summary as worktree', async () => {
    const service = await createGitService({
      'rev-parse --show-toplevel --git-common-dir':
        '/repo-linked\n/repo/.git\n',
      'rev-parse --show-toplevel --abbrev-ref HEAD HEAD':
        '/repo-linked\nfeature/test\ndef456\n',
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
      repositoryId: '/repo/.git',
      worktreeId: '/repo-linked',
      isWorktree: true,
      branch: 'feature/test',
      headSha: 'def456',
      status: {
        dirty: true,
        stagedCount: 1,
        unstagedCount: 0,
        untrackedCount: 1,
      },
    });
  });
});
