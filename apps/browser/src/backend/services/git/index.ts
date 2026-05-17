import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { DisposableService } from '@/services/disposable';
import type {
  GitCommandRunner,
  GitRepositoryInfo,
  GitServiceDeps,
  GitStatusSummary,
  GitWorktreeInfo,
  MountedWorkspaceGitSummary,
} from './types';

export type {
  GitCommandRunner,
  GitRepositoryInfo,
  GitServiceDeps,
  GitStatusSummary,
  GitWorktreeInfo,
  MountedWorkspaceGitSummary,
} from './types';

const execFileAsync = promisify(execFile);
const DEFAULT_GIT_TIMEOUT_MS = 2_000;

const defaultRunGitCommand: GitCommandRunner = async (cwd, args, env) => {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    timeout: DEFAULT_GIT_TIMEOUT_MS,
    env,
  });
  return stdout.trim();
};

export class GitService extends DisposableService {
  private readonly logger: GitServiceDeps['logger'];
  private readonly telemetryService: GitServiceDeps['telemetryService'];
  private readonly resolvedEnvPromise: GitServiceDeps['resolvedEnvPromise'];
  private readonly runGitCommand: GitCommandRunner;

  private resolvedEnv: Record<string, string> | null = null;
  private resolvedEnvSettled = false;

  private constructor(deps: GitServiceDeps) {
    super();
    this.logger = deps.logger;
    this.telemetryService = deps.telemetryService;
    this.resolvedEnvPromise = deps.resolvedEnvPromise;
    this.runGitCommand = deps.runGitCommand ?? defaultRunGitCommand;
  }

  public static async create(deps: GitServiceDeps): Promise<GitService> {
    return new GitService(deps);
  }

  private async getResolvedEnv(): Promise<Record<string, string> | null> {
    if (this.resolvedEnvSettled) return this.resolvedEnv;

    try {
      this.resolvedEnv = await this.resolvedEnvPromise;
    } catch (error) {
      this.resolvedEnv = null;
      this.report(error as Error, 'resolveEnv');
    } finally {
      this.resolvedEnvSettled = true;
    }

    return this.resolvedEnv;
  }

  public async getMountedWorkspaceSummary(
    workspacePath: string,
  ): Promise<MountedWorkspaceGitSummary | null> {
    const [repositoryInfo, worktreeInfo] = await Promise.all([
      this.getRepositoryInfo(workspacePath),
      this.getWorktreeInfo(workspacePath),
    ]);

    if (!repositoryInfo || !worktreeInfo) return null;

    return {
      repositoryId: repositoryInfo.repositoryId,
      worktreeId: worktreeInfo.worktreeId,
      repoRoot: repositoryInfo.repoRoot,
      commonGitDir: repositoryInfo.commonGitDir,
      isWorktree: !worktreeInfo.isMainWorktree,
      branch: worktreeInfo.branch,
      headSha: worktreeInfo.headSha,
      status: await this.getStatusSummary(workspacePath),
    };
  }

  public async getRepositoryInfo(
    workspacePath: string,
  ): Promise<GitRepositoryInfo | null> {
    const result = await this.runGit(workspacePath, [
      'rev-parse',
      '--show-toplevel',
      '--git-common-dir',
    ]);
    if (!result) return null;

    const [repoRootRaw, commonGitDirRaw] = result
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!repoRootRaw || !commonGitDirRaw) return null;

    const repoRoot = path.resolve(repoRootRaw);
    const commonGitDir = path.isAbsolute(commonGitDirRaw)
      ? commonGitDirRaw
      : path.resolve(repoRoot, commonGitDirRaw);

    return {
      repositoryId: commonGitDir,
      repoRoot,
      commonGitDir,
    };
  }

  public async getWorktreeInfo(
    workspacePath: string,
  ): Promise<GitWorktreeInfo | null> {
    const result = await this.runGit(workspacePath, [
      'rev-parse',
      '--show-toplevel',
      '--abbrev-ref',
      'HEAD',
      'HEAD',
    ]);
    if (!result) return null;

    const [worktreePathRaw, branchRaw, headShaRaw] = result
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!worktreePathRaw || !branchRaw || !headShaRaw) return null;

    const worktreePath = path.resolve(worktreePathRaw);
    const worktrees = await this.listWorktrees(workspacePath);
    const matchedWorktree = worktrees.find(
      (worktree) => path.resolve(worktree.path) === worktreePath,
    );
    if (matchedWorktree) return matchedWorktree;

    const branch = branchRaw === 'HEAD' ? null : branchRaw;

    return {
      worktreeId: worktreePath,
      path: worktreePath,
      branch,
      headSha: headShaRaw,
      isDetached: branch === null,
      isMainWorktree: true,
    };
  }

  public async listWorktrees(
    workspacePath: string,
  ): Promise<GitWorktreeInfo[]> {
    const result = await this.runGit(workspacePath, [
      'worktree',
      'list',
      '--porcelain',
    ]);
    if (!result) return [];

    const entries = result
      .trim()
      .split(/\n\s*\n/g)
      .filter(Boolean);
    return entries.flatMap((entry, index) => {
      const info = this.parseWorktreeEntry(entry, index === 0);
      return info ? [info] : [];
    });
  }

  private async getStatusSummary(
    workspacePath: string,
  ): Promise<GitStatusSummary | null> {
    const result = await this.runGit(workspacePath, ['status', '--porcelain']);
    if (result === null) return null;

    let stagedCount = 0;
    let unstagedCount = 0;
    let untrackedCount = 0;

    for (const line of result.split('\n')) {
      if (!line) continue;
      const staged = line[0];
      const unstaged = line[1];
      if (staged === '?' && unstaged === '?') {
        untrackedCount++;
        continue;
      }
      if (staged && staged !== ' ') stagedCount++;
      if (unstaged && unstaged !== ' ') unstagedCount++;
    }

    return {
      dirty: stagedCount > 0 || unstagedCount > 0 || untrackedCount > 0,
      stagedCount,
      unstagedCount,
      untrackedCount,
    };
  }

  private parseWorktreeEntry(
    entry: string,
    isMainWorktree: boolean,
  ): GitWorktreeInfo | null {
    let worktreePath: string | null = null;
    let headSha: string | null = null;
    let branch: string | null = null;
    let isDetached = false;

    for (const line of entry.split('\n')) {
      if (line.startsWith('worktree ')) {
        worktreePath = path.resolve(line.slice('worktree '.length));
      } else if (line.startsWith('HEAD ')) {
        headSha = line.slice('HEAD '.length).trim() || null;
      } else if (line.startsWith('branch ')) {
        const raw = line.slice('branch '.length).trim();
        branch = raw.startsWith('refs/heads/')
          ? raw.slice('refs/heads/'.length)
          : raw || null;
      } else if (line === 'detached') {
        isDetached = true;
      }
    }

    if (!worktreePath) return null;

    return {
      worktreeId: worktreePath,
      path: worktreePath,
      branch,
      headSha,
      isDetached: isDetached || branch === null,
      isMainWorktree,
    };
  }

  private async runGit(cwd: string, args: string[]): Promise<string | null> {
    this.assertNotDisposed();
    try {
      const resolvedEnv = await this.getResolvedEnv();
      const result = await this.runGitCommand(
        cwd,
        args,
        resolvedEnv ?? process.env,
      );
      return result?.trim() ?? null;
    } catch (error) {
      this.logger.debug('[GitService] Git command failed', {
        cwd,
        args,
        error,
      });
      return null;
    }
  }

  private report(
    error: Error,
    operation: string,
    extra?: Record<string, unknown>,
  ): void {
    this.telemetryService.captureException(error, {
      service: 'git',
      operation,
      ...extra,
    });
  }

  protected onTeardown(): void {
    this.resolvedEnv = null;
    this.resolvedEnvSettled = false;
  }
}
