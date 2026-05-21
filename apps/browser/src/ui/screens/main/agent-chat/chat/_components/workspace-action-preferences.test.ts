import { describe, expect, it } from 'vitest';
import type { SelectItem } from '@stagewise/stage-ui/components/select';
import type { WorkspaceActionConfig } from './workspace-select';
import { applyWorkspaceGitActionPreferences } from './workspace-action-preferences';

const sourceBranchItems: SelectItem<string>[] = [
  { value: 'main', label: 'main' },
  { value: 'develop', label: 'develop' },
  { value: 'release', label: 'release' },
];

const defaults: WorkspaceActionConfig = {
  selectedAction: 'create-worktree',
  worktreeNameLabel: 'fresh-worktree',
  branchNameLabel: 'fresh-branch',
  createWorktreeFrom: 'main',
  createBranchFrom: 'main',
  switchBranchTarget: 'main',
  switchWorktreeTarget: '/repo',
};

describe('applyWorkspaceGitActionPreferences', () => {
  it('applies general selected action preference', () => {
    expect(
      applyWorkspaceGitActionPreferences(defaults, sourceBranchItems, {
        selectedAction: 'create-branch',
      }).selectedAction,
    ).toBe('create-branch');
  });

  it('lets repository selected action override general selected action', () => {
    expect(
      applyWorkspaceGitActionPreferences(
        defaults,
        sourceBranchItems,
        { selectedAction: 'create-branch' },
        { selectedAction: 'switch-branch' },
      ).selectedAction,
    ).toBe('switch-branch');
  });

  it('uses createBranchFrom as createWorktreeFrom fallback', () => {
    expect(
      applyWorkspaceGitActionPreferences(
        defaults,
        sourceBranchItems,
        undefined,
        { createBranchFrom: 'develop' },
      ).createWorktreeFrom,
    ).toBe('develop');
  });

  it('uses createWorktreeFrom as createBranchFrom fallback', () => {
    expect(
      applyWorkspaceGitActionPreferences(
        defaults,
        sourceBranchItems,
        undefined,
        { createWorktreeFrom: 'release' },
      ).createBranchFrom,
    ).toBe('release');
  });

  it('ignores remembered branches that are unavailable', () => {
    const config = applyWorkspaceGitActionPreferences(
      defaults,
      sourceBranchItems,
      undefined,
      {
        createWorktreeFrom: 'deleted',
        createBranchFrom: 'missing',
      },
    );

    expect(config.createWorktreeFrom).toBe('main');
    expect(config.createBranchFrom).toBe('main');
  });

  it('preserves freshly generated names from defaults', () => {
    const config = applyWorkspaceGitActionPreferences(
      defaults,
      sourceBranchItems,
      { selectedAction: 'create-branch' },
      {
        selectedAction: 'create-worktree',
        createWorktreeFrom: 'develop',
        createBranchFrom: 'release',
      },
    );

    expect(config.worktreeNameLabel).toBe('fresh-worktree');
    expect(config.branchNameLabel).toBe('fresh-branch');
  });
});
