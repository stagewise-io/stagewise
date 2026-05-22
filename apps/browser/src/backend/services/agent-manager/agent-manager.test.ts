import { describe, expect, it, vi } from 'vitest';
import { collectWorkspaceLastUsedAtByPath } from './persistence/db';
import { resolveNewAgentWorkspaceMountPath } from './workspace-mount-normalization';

describe('collectWorkspaceLastUsedAtByPath', () => {
  it('matches stored symlink workspace paths to canonical target paths', async () => {
    const resolveUsagePath = vi.fn(async (workspacePath: string) => {
      if (workspacePath === '/link/worktree') return '/real/worktree';
      return workspacePath;
    });

    const usage = await collectWorkspaceLastUsedAtByPath(
      ['/real/worktree'],
      [
        {
          lastMessageAt: new Date(1_000),
          mountedWorkspaces: [{ path: '/link/worktree' }],
        },
      ],
      resolveUsagePath,
    );

    expect(usage.get('/real/worktree')).toBe(1_000);
  });

  it('keeps the latest usage timestamp across aliases', async () => {
    const resolveUsagePath = vi.fn(async (workspacePath: string) => {
      if (workspacePath === '/link/worktree') return '/real/worktree';
      return workspacePath;
    });

    const usage = await collectWorkspaceLastUsedAtByPath(
      ['/real/worktree'],
      [
        {
          lastMessageAt: new Date(1_000),
          mountedWorkspaces: [{ path: '/real/worktree' }],
        },
        {
          lastMessageAt: new Date(2_000),
          mountedWorkspaces: [{ path: '/link/worktree' }],
        },
      ],
      resolveUsagePath,
    );

    expect(usage.get('/real/worktree')).toBe(2_000);
  });
});

describe('resolveNewAgentWorkspaceMountPath', () => {
  it('resolves inherited git worktree paths to the main worktree path', async () => {
    const getMainWorktreePath = vi.fn(async () => '/repo');

    await expect(
      resolveNewAgentWorkspaceMountPath('/repo-linked', getMainWorktreePath),
    ).resolves.toBe('/repo');

    expect(getMainWorktreePath).toHaveBeenCalledWith('/repo-linked');
  });

  it('keeps the original workspace path when no main worktree resolves', async () => {
    const getMainWorktreePath = vi.fn(async () => null);

    await expect(
      resolveNewAgentWorkspaceMountPath('/non-git', getMainWorktreePath),
    ).resolves.toBe('/non-git');
  });

  it('keeps the original workspace path when git resolution fails', async () => {
    const error = new Error('git failed');
    const getMainWorktreePath = vi.fn(async () => {
      throw error;
    });
    const logger = { warn: vi.fn() };

    await expect(
      resolveNewAgentWorkspaceMountPath(
        '/repo-linked',
        getMainWorktreePath,
        logger,
      ),
    ).resolves.toBe('/repo-linked');

    expect(logger.warn).toHaveBeenCalledWith(
      '[AgentManager] Failed to resolve main worktree for workspace /repo-linked',
      { error },
    );
  });
});
