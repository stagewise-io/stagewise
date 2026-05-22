import type { SelectItem } from '@stagewise/stage-ui/components/select';
import type { WorkspaceGitActionPreferences } from '@shared/karton-contracts/ui/shared-types';
import type { WorkspaceActionConfig } from './workspace-select';

export type WorkspaceGitActionGeneralPreference =
  WorkspaceGitActionPreferences['general'];
export type WorkspaceGitActionRepositoryPreference =
  WorkspaceGitActionPreferences['repositories'][string];

function firstAvailableWorkspaceActionValue(
  candidates: Array<string | undefined>,
  available: ReadonlySet<string>,
  fallback: string,
): string {
  const candidate = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && available.has(candidate),
  );

  if (typeof candidate === 'string') return candidate;
  if (available.has(fallback)) return fallback;

  return available.values().next().value ?? fallback;
}

export function applyWorkspaceGitActionPreferences(
  defaults: WorkspaceActionConfig,
  sourceBranchItems: SelectItem<string>[],
  worktreeItems: SelectItem<string>[],
  generalPreference?: WorkspaceGitActionGeneralPreference,
  repositoryPreference?: WorkspaceGitActionRepositoryPreference,
): WorkspaceActionConfig {
  const sourceBranches = new Set(sourceBranchItems.map((item) => item.value));
  const worktrees = new Set(worktreeItems.map((item) => item.value));
  const switchWorktreeTarget = repositoryPreference?.switchWorktreeTarget;

  return {
    ...defaults,
    selectedAction:
      repositoryPreference?.selectedAction ??
      generalPreference?.selectedAction ??
      defaults.selectedAction,
    createWorktreeFrom: firstAvailableWorkspaceActionValue(
      [
        repositoryPreference?.createWorktreeFrom,
        repositoryPreference?.createBranchFrom,
      ],
      sourceBranches,
      defaults.createWorktreeFrom,
    ),
    createBranchFrom: firstAvailableWorkspaceActionValue(
      [
        repositoryPreference?.createBranchFrom,
        repositoryPreference?.createWorktreeFrom,
      ],
      sourceBranches,
      defaults.createBranchFrom,
    ),
    switchWorktreeTarget:
      typeof switchWorktreeTarget === 'string' &&
      worktrees.has(switchWorktreeTarget)
        ? switchWorktreeTarget
        : defaults.switchWorktreeTarget,
  };
}
