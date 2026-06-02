import { describe, expect, it, vi } from 'vitest';
import { collectWorkspaceLastUsedAtByPath } from '@stagewise/agent-core/agent-persistence';

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
