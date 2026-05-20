import type { Logger } from '@/services/logger';
import type { TelemetryService } from '@/services/telemetry';
import type {
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

export type GitWorktreeInfo = {
  worktreeId: string;
  path: string;
  branch: string | null;
  headSha: string | null;
  isDetached: boolean;
  isMainWorktree: boolean;
};

export type GitBranchInfo = {
  name: string;
  current: boolean;
  checkedOut: boolean;
  checkedOutPath?: string;
};

export type GitBranchListResult = {
  current: string | null;
  defaultBranch: string | null;
  branches: GitBranchInfo[];
};

export type GitWorktreeListResult = {
  currentPath: string | null;
  worktrees: Array<GitWorktreeInfo & { current: boolean }>;
};

export type GitActionFailureReason =
  | 'not-git-repo'
  | 'branch-not-found'
  | 'branch-already-exists'
  | 'branch-checked-out'
  | 'worktree-already-exists'
  | 'invalid-name'
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
  | { ok: true; path: string; git: MountedWorkspaceGitSummary | null }
  | GitActionFailure;

export type GitCreateBranchOptions = {
  branchName: string;
  sourceBranch: string;
};

export type GitCreateWorktreeOptions = {
  worktreeName: string;
  sourceBranch: string;
};

export type GitStatusSummary = MountedWorkspaceGitStatusSummary;
export type { MountedWorkspaceGitSummary };
