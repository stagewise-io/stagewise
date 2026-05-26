import { describe, expect, it } from 'vitest';
import {
  getWorkspaceDisplayInfo,
  getWorkspaceDisplayLabel,
  type WorkspaceDisplaySource,
} from './workspace-display';

describe('workspace display helpers', () => {
  it('uses the folder basename for non-Git workspaces', () => {
    expect(
      getWorkspaceDisplayLabel({
        path: '/Users/test/projects/plain-workspace',
        git: null,
      }),
    ).toBe('plain-workspace');
  });

  it('uses the mounted folder basename for main Git workspaces', () => {
    expect(
      getWorkspaceDisplayLabel({
        path: '/Users/test/projects/stagewise',
        git: gitSummary({ isWorktree: false }),
      }),
    ).toBe('stagewise');
  });

  it('combines the main worktree folder and branch for linked worktrees', () => {
    expect(
      getWorkspaceDisplayInfo({
        path: '/Users/test/projects/stagewise-worktrees/seedable-eventloop',
        git: gitSummary({
          isWorktree: true,
          mainWorktreePath: '/Users/test/projects/stagewise',
          branch: 'seedable-eventloop',
        }),
      }),
    ).toEqual({
      title: 'stagewise',
      qualifier: 'seedable-eventloop',
      label: 'stagewise seedable-eventloop',
    });
  });

  it('uses a short head SHA for detached linked worktrees', () => {
    expect(
      getWorkspaceDisplayLabel({
        path: '/Users/test/projects/stagewise-worktrees/detached',
        git: gitSummary({
          isWorktree: true,
          mainWorktreePath: '/Users/test/projects/stagewise',
          branch: null,
          headSha: '1234567890abcdef',
        }),
      }),
    ).toBe('stagewise 1234567');
  });

  it('falls back to the linked worktree folder when no branch or SHA exists', () => {
    expect(
      getWorkspaceDisplayLabel({
        path: '/Users/test/projects/stagewise-worktrees/local-folder',
        git: gitSummary({
          isWorktree: true,
          mainWorktreePath: '/Users/test/projects/stagewise',
          branch: null,
          headSha: null,
        }),
      }),
    ).toBe('stagewise local-folder');
  });

  it('uses the worktree folder as qualifier when the branch equals the repo folder', () => {
    expect(
      getWorkspaceDisplayInfo({
        path: '/Users/test/projects/worktrees/stagewise-linked',
        git: gitSummary({
          isWorktree: true,
          mainWorktreePath: '/Users/test/projects/stagewise',
          branch: 'stagewise',
        }),
      }),
    ).toEqual({
      title: 'stagewise',
      qualifier: 'stagewise-linked',
      label: 'stagewise stagewise-linked',
    });
  });
});

function gitSummary(
  overrides: Partial<NonNullable<WorkspaceDisplaySource['git']>> = {},
): NonNullable<WorkspaceDisplaySource['git']> {
  return {
    branch: 'main',
    headSha: 'abcdef1234567890',
    isWorktree: false,
    mainWorktreePath: null,
    repositoryId: 'repo-id',
    worktreeId: 'worktree-id',
    repoRoot: '/Users/test/projects/stagewise',
    commonGitDir: '/Users/test/projects/stagewise/.git',
    status: {
      dirty: false,
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
    },
    ...overrides,
  };
}
