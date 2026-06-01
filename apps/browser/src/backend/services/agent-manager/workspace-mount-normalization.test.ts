import { describe, expect, it, vi } from 'vitest';
import { resolveNewAgentWorkspaceMountPath } from './workspace-mount-normalization';

describe('resolveNewAgentWorkspaceMountPath', () => {
  it('remaps a linked-worktree path to the repository main worktree', async () => {
    const getMain = vi.fn(async (p: string) => p.replace('/linked', '/main'));

    const result = await resolveNewAgentWorkspaceMountPath(
      '/repos/linked/feature-x',
      getMain,
    );

    expect(result).toBe('/repos/main/feature-x');
    expect(getMain).toHaveBeenCalledWith('/repos/linked/feature-x');
  });

  it('falls back to the input when the resolver returns null (non-git or unknown)', async () => {
    const getMain = vi.fn(async () => null);

    const result = await resolveNewAgentWorkspaceMountPath(
      '/not/a/repo',
      getMain,
    );

    expect(result).toBe('/not/a/repo');
  });

  it('falls back to the input and warns when the resolver throws', async () => {
    const getMain = vi.fn(async () => {
      throw new Error('git binary missing');
    });
    const warn = vi.fn();

    const result = await resolveNewAgentWorkspaceMountPath(
      '/repos/broken',
      getMain,
      { warn },
    );

    expect(result).toBe('/repos/broken');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: re-resolving a main-worktree path returns the same path', async () => {
    // gitService.getWorkspaceMainWorktreePath returns the same path when
    // already on the main worktree (browser GitService behavior, see
    // its mock in git-path-actions.test.ts).
    const getMain = vi.fn(async (p: string) => p);

    const result = await resolveNewAgentWorkspaceMountPath(
      '/repos/main',
      getMain,
    );

    expect(result).toBe('/repos/main');
  });
});
