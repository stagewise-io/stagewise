import type { Logger } from '@/services/logger';
import type { TelemetryService } from '@/services/telemetry';
import type {
  MountedWorkspaceGitDiffEntry,
  MountedWorkspaceGitDiffSummary,
  MountedWorkspaceGitStatusSummary,
  MountedWorkspaceGitSummary,
} from '@shared/karton-contracts/ui';

export type GitCommandRunner = (
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) => Promise<string | null>;

export type GitStrictCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type GitStrictCommandRunner = (
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) => Promise<GitStrictCommandResult>;

export type GitServiceDeps = {
  logger: Logger;
  telemetryService: TelemetryService;
  resolvedEnvPromise: Promise<Record<string, string> | null>;
  runGitCommand?: GitCommandRunner;
  runGitMutationCommand?: GitStrictCommandRunner;
};

export type GitRepositoryInfo = {
  repositoryId: string;
  repoRoot: string;
  commonGitDir: string;
};

export type GitRepositoryRemoteInfo = {
  remoteName: string;
  url: string;
};

export type GitWorktreeInfo = {
  worktreeId: string;
  path: string;
  branch: string | null;
  headSha: string | null;
  isDetached: boolean;
  isMainWorktree: boolean;
  /**
   * Worktree creation time in epoch ms, derived from the birthtime of the
   * worktree's `.git` entry. `null` when the worktree is gone from disk or the
   * filesystem reports no usable timestamp. Used by the sidebar to order
   * worktrees newest-first; `git worktree list` order is filesystem/alphabetical
   * and not a reliable age signal.
   */
  createdAt: number | null;
};

export type GitBranchKind = 'local' | 'remote';

export type GitBranchInfo = {
  name: string;
  kind: GitBranchKind;
  remoteName?: string;
  remoteBranchName?: string;
  current: boolean;
  checkedOut: boolean;
  checkedOutPath?: string;
};

export type GitBranchListResult = {
  current: string | null;
  defaultBranch: string | null;
  defaultRemoteBranch: string | null;
  branches: GitBranchInfo[];
  /**
   * Whether the remote refresh succeeded. Always `false` when no refresh
   * was requested. When `true`, the on-disk refs are up-to-date with the
   * remote and the caller may reset its staleness timer.
   */
  refreshSucceeded: boolean;
};

export type GitWorktreeListResult = {
  currentPath: string | null;
  worktrees: Array<GitWorktreeInfo & { current: boolean }>;
};

export type GitMergedTargetResult = {
  merged: boolean;
  target: string | null;
};

export type GitWorktreeRemoveResult =
  | { ok: true }
  | { ok: false; message: string };

export type GitActionFailureReason =
  | 'not-git-repo'
  | 'branch-not-found'
  | 'branch-already-exists'
  | 'branch-checked-out'
  | 'worktree-already-exists'
  | 'invalid-name'
  | 'branch-create-failed'
  | 'checkout-failed'
  | 'worktree-create-failed';

export type GitActionFailure = {
  ok: false;
  reason: GitActionFailureReason;
  message: string;
};

export type GitMutationResult =
  | { ok: true; git: MountedWorkspaceGitSummary | null }
  | GitActionFailure;

export type GitCreateWorktreeResult =
  | {
      ok: true;
      path: string;
      branchName: string;
      git: MountedWorkspaceGitSummary | null;
    }
  | GitActionFailure;

export type GitCreateBranchOptions = {
  branchName: string;
  sourceBranch: string;
};

export type GitCreateWorktreeOptions = {
  worktreeName: string;
  sourceBranch: string;
};

export type GitDiffNumstatEntry = MountedWorkspaceGitDiffEntry;
export type GitDiffNumstatSummary = MountedWorkspaceGitDiffSummary;

export type GitStatusSummary = MountedWorkspaceGitStatusSummary;
export type { MountedWorkspaceGitSummary };
