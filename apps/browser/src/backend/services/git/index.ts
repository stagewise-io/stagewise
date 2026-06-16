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
  GitDiffNumstatEntry,
  GitDiffNumstatSummary,
  GitMutationResult,
  GitMergedTargetResult,
  GitRepositoryInfo,
  GitRepositoryRemoteInfo,
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
  GitDiffNumstatEntry,
  GitDiffNumstatSummary,
  GitMutationResult,
  GitMergedTargetResult,
  GitRepositoryInfo,
  GitRepositoryRemoteInfo,
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

function stripGitSuffix(value: string): string {
  return value.replace(/\.git\/?$/, '').replace(/\/$/, '');
}

function normalizeRemotePathname(pathname: string): string {
  const withoutSuffix = stripGitSuffix(pathname);
  return withoutSuffix.startsWith('/') ? withoutSuffix : `/${withoutSuffix}`;
}

function remoteUrlToWebUrl(remoteUrl: string): string | null {
  const trimmed = remoteUrl.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      parsed.username = '';
      parsed.password = '';
      parsed.pathname = normalizeRemotePathname(parsed.pathname);
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return null;
    }
  }

  if (/^(ssh|git):\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (!parsed.hostname || !parsed.pathname) return null;
      return `https://${parsed.hostname}${normalizeRemotePathname(
        parsed.pathname,
      )}`;
    } catch {
      return null;
    }
  }

  const scpLikeMatch = trimmed.match(/^(?:[^@\s]+@)?([^:\s]+):(.+)$/);
  if (scpLikeMatch) {
    const [, host, repoPath] = scpLikeMatch;
    if (!host || !repoPath || repoPath.startsWith('/')) return null;
    return `https://${host}${normalizeRemotePathname(repoPath)}`;
  }

  return null;
}

function parseRemoteList(output: string): GitRepositoryRemoteInfo | null {
  const remotes = output
    .split('\n')
    .map((line) => line.trim().match(/^(\S+)\s+(\S+)\s+\(fetch\)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      remoteName: match[1]!,
      url: match[2]!,
    }));

  return (
    remotes.find((remote) => remote.remoteName === 'origin') ??
    remotes[0] ??
    null
  );
}

function parseRemoteNames(output: string | null): string[] {
  return (output ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseRemoteBranchRef(
  refName: string,
  remoteNames: string[],
): { remoteName: string; branchName: string } | null {
  const matchingRemote = [...remoteNames]
    .sort((a, b) => b.length - a.length)
    .find(
      (remoteName) =>
        refName === remoteName || refName.startsWith(`${remoteName}/`),
    );

  if (matchingRemote) {
    const branchName = refName.slice(matchingRemote.length + 1);
    if (!branchName || branchName === 'HEAD') return null;
    return { remoteName: matchingRemote, branchName };
  }

  const [remoteName, ...branchParts] = refName.split('/');
  const branchName = branchParts.join('/');
  if (!remoteName || !branchName || branchName === 'HEAD') return null;
  return { remoteName, branchName };
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

    const worktrees = await this.listWorktrees(workspacePath);
    const worktreeInfo = await this.getWorktreeInfo(workspacePath, worktrees);
    if (!worktreeInfo) return null;

    const mainWorktreePath =
      worktrees.find((worktree) => worktree.isMainWorktree)?.path ?? null;

    return {
      repositoryId: repositoryInfo.repositoryId,
      worktreeId: worktreeInfo.worktreeId,
      repoRoot: repositoryInfo.repoRoot,
      mainWorktreePath,
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

  public async getRepositoryRemoteUrl(
    workspacePath: string,
  ): Promise<string | null> {
    const remotesOutput = await this.runGit(workspacePath, ['remote', '-v']);
    if (!remotesOutput) return null;

    const remote = parseRemoteList(remotesOutput);
    return remote ? remoteUrlToWebUrl(remote.url) : null;
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
    knownWorktrees?: GitWorktreeInfo[],
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
    const worktrees =
      knownWorktrees ?? (await this.listWorktrees(workspacePath));
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
      createdAt: await this.getWorktreeCreatedAt(worktreePath),
    };
  }

  public async listBranches(
    workspacePath: string,
  ): Promise<GitBranchListResult | null> {
    const summary = await this.getMountedWorkspaceSummary(workspacePath);
    if (!summary) return null;

    const [localResult, remoteResult, remoteNamesResult] = await Promise.all([
      this.runGit(workspacePath, [
        'for-each-ref',
        '--format=%(refname:short)%09%(HEAD)',
        'refs/heads',
      ]),
      this.runGit(workspacePath, [
        'for-each-ref',
        '--format=%(refname:short)',
        'refs/remotes',
      ]),
      this.runGit(workspacePath, ['remote']),
    ]);
    if (localResult === null) return null;

    const worktrees = await this.listWorktrees(workspacePath);
    const localBranches = localResult
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
          kind: 'local',
          current,
          checkedOut: checkedOutWorktree !== undefined,
          checkedOutPath: checkedOutWorktree?.path,
        };
      });
    const remoteNames = parseRemoteNames(remoteNamesResult);
    const remoteBranches = (remoteResult ?? '')
      .split('\n')
      .map((line) => line.trim())
      .map((name) => ({
        name,
        parsed: parseRemoteBranchRef(name, remoteNames),
      }))
      .filter(({ name, parsed }) => name && parsed)
      .map(
        ({ name, parsed }): GitBranchInfo => ({
          name,
          kind: 'remote',
          remoteName: parsed?.remoteName,
          remoteBranchName: parsed?.branchName,
          current: false,
          checkedOut: false,
        }),
      );
    const branches = [...localBranches, ...remoteBranches];
    const defaultBranch = await this.resolveDefaultBranch(
      workspacePath,
      localBranches,
    );

    return {
      current: summary.branch,
      defaultBranch,
      defaultRemoteBranch: await this.resolveDefaultRemoteBranch(
        workspacePath,
        branches,
        summary.branch,
        defaultBranch,
      ),
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

  private async resolveDefaultRemoteBranch(
    workspacePath: string,
    branches: GitBranchInfo[],
    currentBranch: string | null,
    defaultBranch: string | null,
  ): Promise<string | null> {
    const remoteBranches = branches.filter(
      (branch) => branch.kind === 'remote' && branch.remoteName,
    );
    if (remoteBranches.length === 0) return null;

    const remoteNames = Array.from(
      new Set(remoteBranches.map((branch) => branch.remoteName!)),
    );
    const configuredRemote = await this.resolveConfiguredDefaultRemote(
      workspacePath,
      [currentBranch, defaultBranch],
      remoteNames,
    );
    const selectedRemote =
      configuredRemote ??
      (remoteNames.includes('origin') ? 'origin' : undefined) ??
      remoteNames[0];
    if (!selectedRemote) return null;

    return this.resolveRemoteDefaultBranch(
      workspacePath,
      selectedRemote,
      remoteBranches,
    );
  }

  private async resolveConfiguredDefaultRemote(
    workspacePath: string,
    branchNames: Array<string | null>,
    remoteNames: string[],
  ): Promise<string | null> {
    const uniqueBranchNames = Array.from(
      new Set(branchNames.filter((name): name is string => Boolean(name))),
    );

    for (const branchName of uniqueBranchNames) {
      const remoteName = await this.runGit(workspacePath, [
        'config',
        '--get',
        `branch.${branchName}.remote`,
      ]);
      const trimmed = remoteName?.trim();
      if (trimmed && remoteNames.includes(trimmed)) return trimmed;
    }

    return null;
  }

  private async resolveRemoteDefaultBranch(
    workspacePath: string,
    remoteName: string,
    branches: GitBranchInfo[],
  ): Promise<string | null> {
    const branchNames = new Set(
      branches
        .filter((branch) => branch.remoteName === remoteName)
        .map((branch) => branch.name),
    );
    if (branchNames.size === 0) return null;

    const remoteHead = await this.runGit(workspacePath, [
      'symbolic-ref',
      '--quiet',
      '--short',
      `refs/remotes/${remoteName}/HEAD`,
    ]);
    if (remoteHead && branchNames.has(remoteHead)) return remoteHead;

    for (const candidate of [`${remoteName}/main`, `${remoteName}/master`]) {
      if (branchNames.has(candidate)) return candidate;
    }

    return branchNames.values().next().value ?? null;
  }

  private async fetchRemoteSourceBranch(
    workspacePath: string,
    sourceBranch: string,
  ): Promise<GitActionFailure | null> {
    const [remoteName, ...branchParts] = sourceBranch.split('/');
    const branchName = branchParts.join('/');
    if (!remoteName || !branchName) return null;

    const result = await this.runGitStrict(workspacePath, [
      'fetch',
      '--prune',
      remoteName,
      `refs/heads/${branchName}:refs/remotes/${remoteName}/${branchName}`,
    ]);
    if (result.exitCode === 0) return null;

    return this.failure(
      'worktree-create-failed',
      result.stderr || `Failed to update ${sourceBranch} from remote.`,
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
    const parsed = entries.flatMap((entry, index) => {
      const info = this.parseWorktreeEntry(entry, index === 0);
      return info ? [info] : [];
    });
    const enriched = await Promise.all(
      parsed.map(async ({ prunable, ...info }) => ({
        info: {
          ...info,
          createdAt: await this.getWorktreeCreatedAt(info.path),
        },
        prunable,
      })),
    );
    // Drop stale worktrees whose working tree was deleted on disk but not yet
    // pruned: git keeps reporting them (flagged `prunable`) until
    // `git worktree prune` runs, which otherwise leaves ghost entries in the
    // sidebar. The main worktree is always kept.
    return enriched
      .filter(({ info, prunable }) => info.isMainWorktree || !prunable)
      .map(({ info }) => info);
  }

  /**
   * Best-effort worktree creation time (epoch ms). The `.git` entry inside a
   * worktree (a gitdir pointer file for linked worktrees, a directory for the
   * main worktree) is written once at creation and effectively never rewritten,
   * so its birthtime is a stable age signal. Falls back to ctime/mtime when the
   * filesystem reports no birthtime, and to `null` when the worktree is gone.
   */
  private async getWorktreeCreatedAt(
    worktreePath: string,
  ): Promise<number | null> {
    try {
      const stat = await fs.stat(path.join(worktreePath, '.git'));
      const ms = stat.birthtimeMs || stat.ctimeMs || stat.mtimeMs;
      return Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : null;
    } catch {
      return null;
    }
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
      branches.branches
        .filter((branch) => branch.kind === 'local')
        .map((branch) => branch.name),
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
    options: { force?: boolean } = {},
  ): Promise<GitWorktreeRemoveResult> {
    const repositoryInfo = await this.getRepositoryInfo(workspacePath);
    const cwd = repositoryInfo?.repoRoot ?? workspacePath;
    const result = await this.runGitStrict(cwd, [
      'worktree',
      'remove',
      ...(options.force ? ['--force'] : []),
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

    const sourceBranch = branches.branches.find(
      (branch) => branch.name === options.sourceBranch,
    );
    if (!sourceBranch) {
      return this.failure(
        'branch-not-found',
        `Source branch ${options.sourceBranch} does not exist.`,
      );
    }

    if (
      branches.branches.some(
        (branch) => branch.kind === 'local' && branch.name === worktreeName,
      )
    ) {
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

    try {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
    } catch (error) {
      const message =
        error instanceof Error
          ? `Failed to create worktree directory: ${error.message}`
          : 'Failed to create worktree directory.';
      return this.failure('worktree-create-failed', message);
    }

    if (sourceBranch.kind === 'remote') {
      const fetchFailure = await this.fetchRemoteSourceBranch(
        workspacePath,
        sourceBranch.name,
      );
      if (fetchFailure) return fetchFailure;
    }

    const result = await this.runGitStrict(workspacePath, [
      'worktree',
      'add',
      '-b',
      worktreeName,
      ...(sourceBranch.kind === 'remote' ? ['--no-track'] : []),
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
      branchName: worktreeName,
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

    if (branch.kind !== 'local') {
      return this.failure(
        'branch-not-found',
        `Branch ${branchName} is not a local branch.`,
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

  public async getDiffNumstat(
    workspacePath: string,
  ): Promise<GitDiffNumstatSummary | null> {
    const repositoryInfo = await this.getRepositoryInfo(workspacePath);
    if (!repositoryInfo) return null;

    const [
      unstagedRaw,
      stagedRaw,
      untrackedRaw,
      unstagedStatusRaw,
      stagedStatusRaw,
    ] = await Promise.all([
      this.runGit(workspacePath, ['diff', '--find-renames', '--numstat']),
      this.runGit(workspacePath, [
        'diff',
        '--cached',
        '--find-renames',
        '--numstat',
      ]),
      this.runGit(workspacePath, [
        'ls-files',
        '--others',
        '--exclude-standard',
        '-z',
      ]),
      this.runGit(workspacePath, ['diff', '--find-renames', '--name-status']),
      this.runGit(workspacePath, [
        'diff',
        '--cached',
        '--find-renames',
        '--name-status',
      ]),
    ]);

    if (unstagedRaw === null && stagedRaw === null && !untrackedRaw)
      return null;

    // Build separate status maps for staged and unstaged so that
    // a file appearing in both (e.g. staged M + unstaged D) keeps
    // the correct per-side change type instead of having staged
    // status overwrite unstaged.
    // Keys are file paths; for renames (R100\told\tnew), key by
    // the new path.
    const buildStatusMap = (raw: string | null): Map<string, string> => {
      const map = new Map<string, string>();
      if (!raw) return map;
      for (const line of raw.split('\n')) {
        if (!line) continue;
        const [code, ...rest] = line.split('\t');
        if (!code) continue;
        if (code.startsWith('R') && rest.length >= 2) {
          // R100\told\tnew — key by new path
          map.set(rest[1]!, code[0]!);
        } else if (rest.length >= 1) {
          map.set(rest[0]!, code[0]!);
        }
      }
      return map;
    };
    const stagedStatusMap = buildStatusMap(stagedStatusRaw);
    const unstagedStatusMap = buildStatusMap(unstagedStatusRaw);

    const stagedEntries = stagedRaw
      ? this.parseNumstat(stagedRaw, true, stagedStatusMap)
      : [];
    const unstagedEntries = unstagedRaw
      ? this.parseNumstat(unstagedRaw, false, unstagedStatusMap)
      : [];

    // Merge staged + unstaged entries for the same file.
    // When a path appears on both sides, sum the line counts and
    // keep staged = true if either side is staged.  If either side
    // reports the file as deleted the merged entry must be deleted
    // too — the Diff view disables clicks for deleted files, and
    // clicking a file that no longer exists on disk is broken UX.
    const merged = new Map<string, GitDiffNumstatEntry>();

    for (const entry of [...stagedEntries, ...unstagedEntries]) {
      const existing = merged.get(entry.path);
      if (existing) {
        existing.added += entry.added;
        existing.deleted += entry.deleted;
        existing.staged = existing.staged || entry.staged;
        if (entry.changeType === 'deleted') {
          existing.changeType = 'deleted';
        }
      } else {
        merged.set(entry.path, { ...entry });
      }
    }

    // Add untracked files (not in git): every line counts as "added".
    // Normally untracked paths that already exist in merged are skipped,
    // but when a tracked file was staged for deletion and then recreated
    // at the same path, the untracked file represents the new content.
    // In that case update the existing deleted entry instead of dropping
    // the recreated file.
    if (untrackedRaw) {
      const untrackedPaths = untrackedRaw.split('\0').filter(Boolean);
      const newPaths = untrackedPaths.filter(
        (p) => !merged.has(p) || merged.get(p)?.changeType === 'deleted',
      );
      const lineCounts = await Promise.all(
        newPaths.map(async (relPath) => ({
          relPath,
          added: await this.countFileLines(path.join(workspacePath, relPath)),
        })),
      );
      for (const { relPath, added } of lineCounts) {
        const existing = merged.get(relPath);
        if (existing?.changeType === 'deleted') {
          existing.added += added;
          existing.changeType = 'modified';
        } else {
          merged.set(relPath, {
            path: relPath,
            added,
            deleted: 0,
            changeType: 'untracked',
            staged: false,
          });
        }
      }
    }

    const entries = [...merged.values()];
    const totalAdded = entries.reduce((sum, e) => sum + e.added, 0);
    const totalDeleted = entries.reduce((sum, e) => sum + e.deleted, 0);

    return { entries, totalAdded, totalDeleted };
  }

  private parseNumstat(
    raw: string,
    staged: boolean,
    statusMap: Map<string, string>,
  ): GitDiffNumstatEntry[] {
    const entries: GitDiffNumstatEntry[] = [];
    for (const line of raw.split('\n')) {
      if (!line) continue;
      const parts = line.split('\t');
      if (parts.length === 3) {
        const [addedStr, deletedStr, pathStr] = parts;
        const added =
          addedStr === '-' ? 0 : Number.parseInt(addedStr!, 10) || 0;
        const deleted =
          deletedStr === '-' ? 0 : Number.parseInt(deletedStr!, 10) || 0;

        // Handle renamed files. Git numstat emits two rename formats:
        //   Full path:   old/dir/file => new/dir/file
        //   Compact:     prefix{old => new}suffix
        // Try compact first (has '{... => ...}'), then full-path.
        const compactMatch = pathStr!.match(
          /^(.*?)\{([^}]+)\s*=>\s*([^}]+)\}(.*)$/,
        );
        if (compactMatch) {
          const prefix = compactMatch[1]!;
          // Greedy [^}]+ capture groups may include whitespace around =>.
          // Trim to get clean path segments.
          const oldPart = compactMatch[2]!.trim();
          const newPart = compactMatch[3]!.trim();
          const suffix = compactMatch[4]!;
          const oldPath = prefix + oldPart + suffix;
          const newPath = prefix + newPart + suffix;
          entries.push({
            path: newPath,
            added,
            deleted,
            changeType: 'renamed' as const,
            oldPath,
            staged,
          });
        } else {
          const renameMatch = pathStr!.match(/^(.+)\s*=>\s*(.+)$/);
          if (renameMatch) {
            entries.push({
              path: renameMatch[2]!.trim(),
              added,
              deleted,
              changeType: 'renamed' as const,
              oldPath: renameMatch[1]!.trim(),
              staged,
            });
          } else {
            // Use git name-status as the authoritative source for changeType.
            // Numstat counts alone can't distinguish "file deleted" from
            // "file modified with only deletions" (both show 0/N counts).
            const statusCode = statusMap.get(pathStr!);
            const changeType: GitDiffNumstatEntry['changeType'] =
              statusCode === 'M'
                ? 'modified'
                : statusCode === 'A'
                  ? 'added'
                  : statusCode === 'D'
                    ? 'deleted'
                    : statusCode === 'R'
                      ? 'renamed'
                      : added === 0 && deleted > 0
                        ? 'deleted'
                        : deleted === 0 && added > 0
                          ? 'added'
                          : 'modified';

            entries.push({
              path: pathStr!,
              added,
              deleted,
              changeType,
              staged,
            });
          }
        }
      }
    }
    return entries;
  }

  private async countFileLines(absPath: string): Promise<number> {
    try {
      const buf = await fs.readFile(absPath);
      if (buf.length === 0) return 0;
      // Count \n bytes.
      let count = 0;
      for (const byte of buf) {
        if (byte === 0x0a) count++;
      }
      // If the file doesn't end with a newline, the last line still counts.
      if (buf[buf.length - 1] !== 0x0a) count++;
      return count;
    } catch {
      return 0;
    }
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
  ): (GitWorktreeInfo & { prunable: boolean }) | null {
    let worktreePath: string | null = null;
    let headSha: string | null = null;
    let branch: string | null = null;
    let isDetached = false;
    let prunable = false;

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
      } else if (line === 'prunable' || line.startsWith('prunable ')) {
        prunable = true;
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
      createdAt: null,
      prunable,
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
