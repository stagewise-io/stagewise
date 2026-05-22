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

  it('keeps source branch hydration tied to source branch defaults', () => {
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
});
