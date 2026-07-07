import { describe, expect, it } from 'vitest';
import type { WorkspaceActionConfig } from './workspace-select';
import { hydrateWorkspaceActionConfigWithDefaults } from './workspace-action-config-utils';

const defaults: WorkspaceActionConfig = {
  selectedAction: 'create-worktree',
  worktreeNameLabel: 'fresh-worktree',
  branchNameLabel: 'fresh-branch',
  createWorktreeFrom: 'main',
  createBranchFrom: 'main',
  switchBranchTarget: 'feature/current',
  switchWorktreeTarget: '/repo',
};

const previousDefaults = {
  sourceBranch: 'main',
  checkoutBranch: 'main',
  defaultBranch: 'main',
  worktree: 'main',
};

describe('hydrateWorkspaceActionConfigWithDefaults', () => {
  it('updates placeholder switch branch targets to the current branch default', () => {
    expect(
      hydrateWorkspaceActionConfigWithDefaults(
        {
          ...defaults,
          switchBranchTarget: 'main',
        },
        defaults,
        previousDefaults,
      ).switchBranchTarget,
    ).toBe('feature/current');
  });

  it('preserves explicit placeholder switch branch selections', () => {
    expect(
      hydrateWorkspaceActionConfigWithDefaults(
        {
          ...defaults,
          switchBranchTarget: 'main',
          switchBranchTargetTouched: true,
        },
        defaults,
        previousDefaults,
      ).switchBranchTarget,
    ).toBe('main');
  });

  it('preserves explicit non-placeholder switch branch selections', () => {
    expect(
      hydrateWorkspaceActionConfigWithDefaults(
        {
          ...defaults,
          switchBranchTarget: 'feature/other',
        },
        defaults,
        previousDefaults,
      ).switchBranchTarget,
    ).toBe('feature/other');
  });

  it('updates untouched source branch placeholders to live defaults', () => {
    const hydrated = hydrateWorkspaceActionConfigWithDefaults(
      {
        ...defaults,
        createWorktreeFrom: 'main',
        createBranchFrom: 'main',
      },
      {
        ...defaults,
        createWorktreeFrom: 'develop',
        createBranchFrom: 'develop',
      },
      previousDefaults,
    );

    expect(hydrated.createWorktreeFrom).toBe('develop');
    expect(hydrated.createBranchFrom).toBe('develop');
  });

  it('preserves explicitly touched create-worktree source placeholders', () => {
    expect(
      hydrateWorkspaceActionConfigWithDefaults(
        {
          ...defaults,
          createWorktreeFrom: 'main',
          createWorktreeFromTouched: true,
        },
        {
          ...defaults,
          createWorktreeFrom: 'develop',
        },
        previousDefaults,
      ).createWorktreeFrom,
    ).toBe('main');
  });

  it('preserves explicitly touched create-branch source placeholders', () => {
    expect(
      hydrateWorkspaceActionConfigWithDefaults(
        {
          ...defaults,
          createBranchFrom: 'main',
          createBranchFromTouched: true,
        },
        {
          ...defaults,
          createBranchFrom: 'develop',
        },
        previousDefaults,
      ).createBranchFrom,
    ).toBe('main');
  });

  // Regression: when a new chat auto-mounts, panel-footer creates the
  // initial config with fallback branch items (always including 'main').
  // The stored preference (e.g. 'master') is not in that fallback set, so
  // applyWorkspaceGitActionPreferences rejects it and the config keeps 'main'.
  // When real git data loads, previousDefaults.sourceBranch becomes the
  // actual git ref (e.g. 'master'), which no longer equals the config's
  // 'main'. The old strict-equality check failed to hydrate in this case.
  it('hydrates createWorktreeFrom when fallback main differs from previousDefaults sourceBranch', () => {
    expect(
      hydrateWorkspaceActionConfigWithDefaults(
        {
          ...defaults,
          createWorktreeFrom: 'main',
        },
        {
          ...defaults,
          createWorktreeFrom: 'origin/master',
        },
        {
          ...previousDefaults,
          sourceBranch: 'master',
        },
      ).createWorktreeFrom,
    ).toBe('origin/master');
  });

  it('hydrates createBranchFrom when fallback main differs from previousDefaults sourceBranch', () => {
    expect(
      hydrateWorkspaceActionConfigWithDefaults(
        {
          ...defaults,
          createBranchFrom: 'main',
        },
        {
          ...defaults,
          createBranchFrom: 'origin/master',
        },
        {
          ...previousDefaults,
          sourceBranch: 'master',
        },
      ).createBranchFrom,
    ).toBe('origin/master');
  });
});
