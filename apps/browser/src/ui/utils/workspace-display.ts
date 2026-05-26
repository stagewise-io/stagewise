import type { MountedWorkspaceGitSummary } from '@shared/karton-contracts/ui';
import { getBaseName } from '@shared/path-utils';

export type WorkspaceDisplaySource = {
  path: string;
  git: MountedWorkspaceGitSummary | null;
};

export type WorkspaceDisplayInfo = {
  title: string;
  qualifier: string | null;
  label: string;
};

export function getWorkspaceDisplayInfo(
  workspace: WorkspaceDisplaySource,
): WorkspaceDisplayInfo {
  const pathName = getBaseName(workspace.path) || workspace.path;

  if (!workspace.git?.isWorktree || !workspace.git.mainWorktreePath) {
    return { title: pathName, qualifier: null, label: pathName };
  }

  const repoName =
    getBaseName(workspace.git.mainWorktreePath) ||
    workspace.git.mainWorktreePath;
  const worktreeRef =
    workspace.git.branch ?? workspace.git.headSha?.slice(0, 7) ?? pathName;
  const qualifier = worktreeRef === repoName ? pathName : worktreeRef;

  return {
    title: repoName,
    qualifier,
    label: `${repoName} ${qualifier}`,
  };
}

export function getWorkspaceDisplayLabel(
  workspace: WorkspaceDisplaySource,
): string {
  return getWorkspaceDisplayInfo(workspace).label;
}
