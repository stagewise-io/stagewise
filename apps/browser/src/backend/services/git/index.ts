import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { DisposableService } from '@/services/disposable';
import { getWorktreesDir } from '@/utils/paths';
import type {
  GitActionFailure,
  GitBranchInfo,
  GitBranchListResult,
  GitCommandRunner,
  GitCreateBranchOptions,
  GitCreateWorktreeOptions,
  GitCreateWorktreeResult,
  GitMutationResult,
  GitMergedTargetResult,
  GitRepositoryInfo,
  GitServiceDeps,
  GitStatusSummary,
  GitStrictCommandResult,
  GitWorktreeRemoveResult,
  GitStrictCommandRunner,
  GitWorktreeInfo,
  GitWorktreeListResult,
  MountedWorkspaceGitSummary,
} from './types';

export type {
  GitActionFailure,
  GitActionFailureReason,
  GitBranchInfo,
  GitBranchListResult,
  GitCommandRunner,
  GitCreateBranchOptions,
  GitCreateWorktreeOptions,
  GitCreateWorktreeResult,
  GitMutationResult,
  GitMergedTargetResult,
  GitRepositoryInfo,
  GitServiceDeps,
  GitStatusSummary,
  GitStrictCommandResult,
  GitStrictCommandRunner,
  GitWorktreeInfo,
  GitWorktreeListResult,
  MountedWorkspaceGitSummary,
} from './types';

const execFileAsync = promisify(execFile);
const DEFAULT_GIT_TIMEOUT_MS = 2_000;
const MUTATION_GIT_TIMEOUT_MS = 30_000;

function normalizeGitPath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

const defaultRunGitCommand: GitCommandRunner = async (cwd, args, env) => {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    timeout: DEFAULT_GIT_TIMEOUT_MS,
    env,
  });
  return stdout.replace(/\r?\n$/, '');
};

const defaultRunGitMutationCommand: GitStrictCommandRunner = async (
  cwd,
  args,
  env,
) => {
  try {
    const { stdout, stderr } = await execFileAsync(
      'git',
      ['-C', cwd, ...args],
      {
        encoding: 'utf8',
        timeout: MUTATION_GIT_TIMEOUT_MS,
        env,
      },
    );
    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
    };
    return {
      stdout: err.stdout?.trim() ?? '',
      stderr: err.stderr?.trim() ?? err.message,
      exitCode: typeof err.code === 'number' ? err.code : 1,
    };
  }
};

export class GitService extends DisposableService {
  private readonly logger: GitServiceDeps['logger'];
  private readonly telemetryService: GitServiceDeps['telemetryService'];
  private readonly resolvedEnvPromise: GitServiceDeps['resolvedEnvPromise'];
  private readonly runGitCommand: GitCommandRunner;
  private readonly runGitMutationCommand: GitStrictCommandRunner;

  private resolvedEnv: Record<string, string> | null = null;
  private resolvedEnvSettled = false;

  private constructor(deps: GitServiceDeps) {
    super();
    this.logger = deps.logger;
    this.telemetryService = deps.telemetryService;
    this.resolvedEnvPromise = deps.resolvedEnvPromise;
    this.runGitCommand = deps.runGitCommand ?? defaultRunGitCommand;
    this.runGitMutationCommand =
      deps.runGitMutationCommand ?? defaultRunGitMutationCommand;
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
    const repositoryInfo = await this.getWorkspaceRepositoryInfo(workspacePath);
    if (!repositoryInfo) return null;

    const worktreeInfo = await this.getWorktreeInfo(workspacePath);
    if (!worktreeInfo) return null;

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

  public async getWorkspaceRepositoryInfo(
    workspacePath: string,
  ): Promise<GitRepositoryInfo | null> {
    const repositoryInfo = await this.getRepositoryInfo(workspacePath);
    if (!repositoryInfo) return null;
    if (!this.isExactGitRoot(workspacePath, repositoryInfo.repoRoot)) {
      return null;
    }
    return repositoryInfo;
  }

  public async getWorkspaceMainWorktreePath(
    workspacePath: string,
  ): Promise<string | null> {
    const repositoryInfo = await this.getWorkspaceRepositoryInfo(workspacePath);
    if (!repositoryInfo) return null;

    const worktrees = await this.listWorktrees(workspacePath);
    return worktrees.find((worktree) => worktree.isMainWorktree)?.path ?? null;
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

  private isExactGitRoot(workspacePath: string, repoRoot: string): boolean {
    return normalizeGitPath(workspacePath) === normalizeGitPath(repoRoot);
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
    const normalizedWorktreePath = normalizeGitPath(worktreePath);
    const worktrees = await this.listWorktrees(workspacePath);
    const matchedWorktree = worktrees.find(
      (worktree) => normalizeGitPath(worktree.path) === normalizedWorktreePath,
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

  public async listBranches(
    workspacePath: string,
  ): Promise<GitBranchListResult | null> {
    const summary = await this.getMountedWorkspaceSummary(workspacePath);
    if (!summary) return null;

    const result = await this.runGit(workspacePath, [
      'for-each-ref',
      '--format=%(refname:short)%09%(HEAD)',
      'refs/heads',
    ]);
    if (result === null) return null;

    const worktrees = await this.listWorktrees(workspacePath);
    const branches = result
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line): GitBranchInfo => {
        const [nameRaw, headRaw] = line.split('\t');
        const name = nameRaw.trim();
        const current = headRaw?.trim() === '*' || name === summary.branch;
        const checkedOutWorktree = worktrees.find(
          (worktree) => worktree.branch === name,
        );

        return {
          name,
          current,
          checkedOut: checkedOutWorktree !== undefined,
          checkedOutPath: checkedOutWorktree?.path,
        };
      });

    return {
      current: summary.branch,
      defaultBranch: await this.resolveDefaultBranch(workspacePath, branches),
      branches,
    };
  }

  private async resolveDefaultBranch(
    workspacePath: string,
    branches: GitBranchInfo[],
  ): Promise<string | null> {
    const branchNames = new Set(branches.map((branch) => branch.name));
    const originHead = await this.runGit(workspacePath, [
      'symbolic-ref',
      '--quiet',
      '--short',
      'refs/remotes/origin/HEAD',
    ]);
    const originDefaultBranch = originHead?.startsWith('origin/')
      ? originHead.slice('origin/'.length)
      : originHead;

    if (originDefaultBranch && branchNames.has(originDefaultBranch)) {
      return originDefaultBranch;
    }
    if (branchNames.has('main')) return 'main';
    if (branchNames.has('master')) return 'master';
    return (
      branches.find((branch) => branch.current)?.name ??
      branches[0]?.name ??
      null
    );
  }

  public async listWorkspaceWorktrees(
    workspacePath: string,
  ): Promise<GitWorktreeListResult | null> {
    const summary = await this.getMountedWorkspaceSummary(workspacePath);
    if (!summary) return null;

    const currentPath = path.resolve(summary.worktreeId);
    const normalizedCurrentPath = normalizeGitPath(currentPath);
    const worktrees = (await this.listWorktrees(workspacePath)).map(
      (worktree) => ({
        ...worktree,
        current: normalizeGitPath(worktree.path) === normalizedCurrentPath,
      }),
    );

    return {
      currentPath,
      worktrees,
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

  public async getWorktreeStatus(
    workspacePath: string,
  ): Promise<GitStatusSummary | null> {
    return this.getStatusSummary(workspacePath);
  }

  public async findMergedTarget(
    workspacePath: string,
    branchName: string,
  ): Promise<GitMergedTargetResult> {
    const branches = await this.listBranches(workspacePath);
    if (!branches) return { merged: false, target: null };

    const availableBranches = new Set(
      branches.branches.map((branch) => branch.name),
    );
    const candidateTargets = [
      branches.defaultBranch,
      'main',
      'master',
      'develop',
      'dev',
    ].filter(
      (branch): branch is string =>
        typeof branch === 'string' &&
        branch !== branchName &&
        availableBranches.has(branch),
    );

    for (const target of Array.from(new Set(candidateTargets))) {
      const result = await this.runGitStrict(workspacePath, [
        'merge-base',
        '--is-ancestor',
        branchName,
        target,
      ]);
      if (result.exitCode === 0) return { merged: true, target };
    }

    return { merged: false, target: null };
  }

  public async removeWorktree(
    workspacePath: string,
  ): Promise<GitWorktreeRemoveResult> {
    const repositoryInfo = await this.getRepositoryInfo(workspacePath);
    const cwd = repositoryInfo?.repoRoot ?? workspacePath;
    const result = await this.runGitStrict(cwd, [
      'worktree',
      'remove',
      workspacePath,
    ]);
    if (result.exitCode === 0) return { ok: true };
    return {
      ok: false,
      message: result.stderr || `Failed to remove worktree ${workspacePath}.`,
    };
  }

  public async switchBranch(
    workspacePath: string,
    branchName: string,
  ): Promise<GitMutationResult> {
    const validation = await this.validateBranchCheckout(
      workspacePath,
      branchName,
    );
    if (validation) return validation;

    const result = await this.runGitStrict(workspacePath, [
      'checkout',
      branchName,
    ]);
    if (result.exitCode !== 0) {
      return this.failure(
        'checkout-failed',
        result.stderr || `Failed to check out branch ${branchName}.`,
      );
    }

    return {
      ok: true,
      git: await this.getMountedWorkspaceSummary(workspacePath),
    };
  }

  public async createBranch(
    workspacePath: string,
    options: GitCreateBranchOptions,
  ): Promise<GitMutationResult> {
    const branchName = await this.normalizeNewBranchName(
      workspacePath,
      options.branchName,
    );
    if (!branchName) {
      return this.failure('invalid-name', 'Branch name is invalid.');
    }

    const branches = await this.listBranches(workspacePath);
    if (!branches)
      return this.failure('not-git-repo', 'Workspace is not a Git repo.');

    if (
      !branches.branches.some((branch) => branch.name === options.sourceBranch)
    ) {
      return this.failure(
        'branch-not-found',
        `Source branch ${options.sourceBranch} does not exist.`,
      );
    }

    if (branches.branches.some((branch) => branch.name === branchName)) {
      return this.failure(
        'branch-already-exists',
        `Branch ${branchName} already exists.`,
      );
    }

    const result = await this.runGitStrict(workspacePath, [
      'checkout',
      '-b',
      branchName,
      options.sourceBranch,
    ]);
    if (result.exitCode !== 0) {
      return this.failure(
        'checkout-failed',
        result.stderr || `Failed to create branch ${branchName}.`,
      );
    }

    return {
      ok: true,
      git: await this.getMountedWorkspaceSummary(workspacePath),
    };
  }

  public async createWorktree(
    workspacePath: string,
    options: GitCreateWorktreeOptions,
  ): Promise<GitCreateWorktreeResult> {
    const worktreeName = await this.normalizeNewBranchName(
      workspacePath,
      options.worktreeName,
    );
    if (!worktreeName) {
      return this.failure('invalid-name', 'Worktree name is invalid.');
    }

    const branches = await this.listBranches(workspacePath);
    if (!branches)
      return this.failure('not-git-repo', 'Workspace is not a Git repo.');

    if (
      !branches.branches.some((branch) => branch.name === options.sourceBranch)
    ) {
      return this.failure(
        'branch-not-found',
        `Source branch ${options.sourceBranch} does not exist.`,
      );
    }

    if (branches.branches.some((branch) => branch.name === worktreeName)) {
      return this.failure(
        'branch-already-exists',
        `Branch ${worktreeName} already exists.`,
      );
    }

    const targetPath = await this.resolveWorktreePath(
      workspacePath,
      worktreeName,
    );
    if (!targetPath)
      return this.failure('not-git-repo', 'Workspace is not a Git repo.');

    if (await this.pathExists(targetPath)) {
      return this.failure(
        'worktree-already-exists',
        `Worktree path ${targetPath} already exists.`,
      );
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    const result = await this.runGitStrict(workspacePath, [
      'worktree',
      'add',
      '-b',
      worktreeName,
      targetPath,
      options.sourceBranch,
    ]);
    if (result.exitCode !== 0) {
      return this.failure(
        'worktree-create-failed',
        result.stderr || `Failed to create worktree ${worktreeName}.`,
      );
    }

    return {
      ok: true,
      path: targetPath,
      git: await this.getMountedWorkspaceSummary(targetPath),
    };
  }

  private async validateBranchCheckout(
    workspacePath: string,
    branchName: string,
  ): Promise<GitActionFailure | null> {
    const branches = await this.listBranches(workspacePath);
    if (!branches)
      return this.failure('not-git-repo', 'Workspace is not a Git repo.');

    const branch = branches.branches.find((item) => item.name === branchName);
    if (!branch) {
      return this.failure(
        'branch-not-found',
        `Branch ${branchName} does not exist.`,
      );
    }

    if (branch.current) return null;

    if (branch.checkedOut) {
      return this.failure(
        'branch-checked-out',
        `Branch ${branchName} is already checked out in another worktree.`,
      );
    }

    return null;
  }

  private async resolveWorktreePath(
    workspacePath: string,
    worktreeName: string,
  ): Promise<string | null> {
    const repositoryInfo = await this.getRepositoryInfo(workspacePath);
    if (!repositoryInfo) return null;

    const repoHash = createHash('sha256')
      .update(repositoryInfo.repositoryId)
      .digest('hex')
      .slice(0, 12);

    return path.join(getWorktreesDir(), repoHash, worktreeName);
  }

  private async normalizeNewBranchName(
    workspacePath: string,
    name: string,
  ): Promise<string | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;

    const result = await this.runGitStrict(workspacePath, [
      'check-ref-format',
      '--branch',
      trimmed,
    ]);
    if (result.exitCode !== 0) return null;

    return trimmed;
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  private failure(
    reason: GitActionFailure['reason'],
    message: string,
  ): GitActionFailure {
    return { ok: false, reason, message };
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
      return result?.replace(/\r?\n$/, '') ?? null;
    } catch (error) {
      this.logger.debug('[GitService] Git command failed', {
        cwd,
        args,
        error,
      });
      return null;
    }
  }

  private async runGitStrict(
    cwd: string,
    args: string[],
  ): Promise<GitStrictCommandResult> {
    this.assertNotDisposed();
    const resolvedEnv = await this.getResolvedEnv();
    const result = await this.runGitMutationCommand(
      cwd,
      args,
      resolvedEnv ?? process.env,
    );
    this.logger.debug('[GitService] Git mutation finished', {
      cwd,
      args,
      exitCode: result.exitCode,
    });
    return result;
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
