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

  // Source-branch fields ("Create worktree from" / "Create branch from")
  // have the same placeholder problem as checkout-branch fields: the initial
  // controlled config from panel-footer uses a fallback default ('main') before
  // real Git data loads. Use a set so any of those placeholder values triggers
  // re-hydration once the real preference-backed default is available.
  const sourceBranchPlaceholders = new Set([
    previousDefaults.sourceBranch,
    previousDefaults.defaultBranch,
    'main',
  ]);

  return {
    ...config,
    createWorktreeFrom:
      config.createWorktreeFromTouched !== true &&
      sourceBranchPlaceholders.has(config.createWorktreeFrom)
        ? defaults.createWorktreeFrom
        : config.createWorktreeFrom,
    createBranchFrom:
      config.createBranchFromTouched !== true &&
      sourceBranchPlaceholders.has(config.createBranchFrom)
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
