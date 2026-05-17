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

export type GitServiceDeps = {
  logger: Logger;
  telemetryService: TelemetryService;
  resolvedEnvPromise: Promise<Record<string, string> | null>;
  runGitCommand?: GitCommandRunner;
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

export type GitStatusSummary = MountedWorkspaceGitStatusSummary;
export type { MountedWorkspaceGitSummary };
