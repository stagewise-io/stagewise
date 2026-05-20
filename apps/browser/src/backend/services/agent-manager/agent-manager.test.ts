import { describe, expect, it, vi } from 'vitest';
import { resolveNewAgentWorkspaceMountPath } from './workspace-mount-normalization';

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
