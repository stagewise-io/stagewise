import type { WorkspaceActionConfig } from './workspace-select';

export function hydrateWorkspaceActionConfigWithDefaults(
  config: WorkspaceActionConfig,
  defaults: WorkspaceActionConfig,
  previousDefaults: {
    sourceBranch: string;
    checkoutBranch: string;
    defaultBranch: string;
    worktree: string;
  } = {
    sourceBranch: 'main',
    checkoutBranch: 'main',
    defaultBranch: 'main',
    worktree: 'main',
  },
): WorkspaceActionConfig {
  // Source branch fields and checkout branch fields have different placeholder
  // defaults before live Git data loads. “Use existing branch” must follow the
  // actual current checkout unless the user picked a non-placeholder value in
  // the current UI session.
  const checkoutBranchPlaceholders = new Set([
    previousDefaults.checkoutBranch,
    previousDefaults.defaultBranch,
    'main',
  ]);

  return {
    ...config,
    createWorktreeFrom:
      config.createWorktreeFrom === previousDefaults.sourceBranch
        ? defaults.createWorktreeFrom
        : config.createWorktreeFrom,
    createBranchFrom:
      config.createBranchFrom === previousDefaults.sourceBranch
        ? defaults.createBranchFrom
        : config.createBranchFrom,
    switchBranchTarget:
      config.switchBranchTargetTouched !== true &&
      checkoutBranchPlaceholders.has(config.switchBranchTarget)
        ? defaults.switchBranchTarget
        : config.switchBranchTarget,
    switchWorktreeTarget:
      config.switchWorktreeTarget === previousDefaults.worktree
        ? defaults.switchWorktreeTarget
        : config.switchWorktreeTarget,
  };
}
