import fs from 'node:fs/promises';
import path from 'node:path';
import type { GitService } from '@/services/git';
import type { Logger } from '@/services/logger';
import type { UserExperienceService } from '@/services/experience';
import { getWorktreesDir } from '@/utils/paths';
import type {
  DeleteWorktreeSetupWorktreeResult,
  WorktreeSetupManagedWorktree,
  WorktreeSetupRepositoriesResult,
  WorktreeSetupRepositorySettings,
  SaveWorktreeSetupScriptResult,
} from '@shared/karton-contracts/ui';

const SETUP_SCRIPT_RELATIVE_PATH = path.join('.stagewise', 'worktree-setup.sh');
const MANAGED_WORKTREE_INSPECTION_CONCURRENCY = 4;

type ManagedWorktreeInspection = WorktreeSetupManagedWorktree & {
  repositoryId: string | null;
  mainWorktreePath: string | null;
  normalizedMainWorktreePath: string | null;
};

async function safeRealpath(targetPath: string): Promise<string | null> {
  try {
    return await fs.realpath(targetPath);
  } catch {
    return null;
  }
}

function normalizePathForKey(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function getLatestRepositoryWorktreeUsage(
  repository: WorktreeSetupRepositorySettings,
): number {
  return Math.max(
    ...repository.managedWorktrees.map((worktree) => worktree.lastUsedAt ?? 0),
    0,
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export class WorktreeSetupSettingsService {
  private listRepositoriesInFlight: Promise<WorktreeSetupRepositoriesResult> | null =
    null;

  private constructor(
    private readonly logger: Logger,
    private readonly userExperienceService: UserExperienceService,
    private readonly gitService: GitService,
    private getWorkspaceLastUsedAtByPath: (
      workspacePaths: string[],
    ) => Promise<Map<string, number>>,
    private getMountedWorkspacePaths: () => Set<string>,
  ) {}

  public static create(deps: {
    logger: Logger;
    userExperienceService: UserExperienceService;
    gitService: GitService;
    getWorkspaceLastUsedAtByPath: (
      workspacePaths: string[],
    ) => Promise<Map<string, number>>;
    getMountedWorkspacePaths: () => Set<string>;
  }): WorktreeSetupSettingsService {
    return new WorktreeSetupSettingsService(
      deps.logger,
      deps.userExperienceService,
      deps.gitService,
      deps.getWorkspaceLastUsedAtByPath,
      deps.getMountedWorkspacePaths,
    );
  }

  public async listRepositories(): Promise<WorktreeSetupRepositoriesResult> {
    if (this.listRepositoriesInFlight) {
      return this.listRepositoriesInFlight;
    }

    this.listRepositoriesInFlight = this.resolveRepositoryList();
    try {
      return await this.listRepositoriesInFlight;
    } finally {
      this.listRepositoriesInFlight = null;
    }
  }

  private async resolveRepositoryList(): Promise<WorktreeSetupRepositoriesResult> {
    const repositories = await this.resolveRepositories();
    return { repositories };
  }

  public async saveScript(
    mainWorktreePath: string,
    content: string,
  ): Promise<SaveWorktreeSetupScriptResult> {
    const repository =
      await this.findRepositoryByMainWorktreePath(mainWorktreePath);
    if (!repository) {
      return { ok: false, message: 'Repository is no longer available.' };
    }

    try {
      await fs.mkdir(path.dirname(repository.scriptPath), { recursive: true });
      await fs.writeFile(repository.scriptPath, content, 'utf8');
      if (process.platform !== 'win32') {
        await fs.chmod(repository.scriptPath, 0o755);
      }
      const refreshed = await this.findRepositoryByMainWorktreePath(
        repository.mainWorktreePath,
      );
      return {
        ok: true,
        repository: refreshed ?? {
          ...repository,
          scriptExists: true,
          scriptContent: content,
        },
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to save worktree setup script.',
      };
    }
  }

  public async deleteManagedWorktree(
    worktreePath: string,
  ): Promise<DeleteWorktreeSetupWorktreeResult> {
    const resolvedWorktreePath =
      await this.resolveManagedWorktreePath(worktreePath);
    if (!resolvedWorktreePath) {
      return { ok: false, message: 'Worktree is not stagewise-managed.' };
    }

    const repositories = await this.resolveRepositories();
    const owningRepository = repositories.find((repository) =>
      repository.managedWorktrees.some(
        (worktree) =>
          normalizePathForKey(worktree.path) ===
          normalizePathForKey(resolvedWorktreePath),
      ),
    );
    if (!owningRepository) {
      return { ok: false, message: 'Worktree repository is not known.' };
    }

    const worktree = owningRepository.managedWorktrees.find(
      (item) =>
        normalizePathForKey(item.path) ===
        normalizePathForKey(resolvedWorktreePath),
    );
    if (!worktree?.removable) {
      return {
        ok: false,
        message: worktree?.disabledReason ?? 'Worktree is not safe to delete.',
      };
    }

    const result = await this.gitService.removeWorktree(resolvedWorktreePath);
    if (!result.ok) return { ok: false, message: result.message };

    const refreshed = await this.findRepositoryByMainWorktreePath(
      owningRepository.mainWorktreePath,
    );
    return { ok: true, repository: refreshed };
  }

  private async findRepositoryByMainWorktreePath(
    mainWorktreePath: string,
  ): Promise<WorktreeSetupRepositorySettings | null> {
    const requestedPath =
      (await safeRealpath(mainWorktreePath)) ?? path.resolve(mainWorktreePath);
    const repositories = await this.resolveRepositories();
    return (
      repositories.find(
        (repository) =>
          normalizePathForKey(repository.mainWorktreePath) ===
          normalizePathForKey(requestedPath),
      ) ?? null
    );
  }

  private async resolveRepositories(): Promise<
    WorktreeSetupRepositorySettings[]
  > {
    const recentWorkspaces =
      await this.userExperienceService.getRecentlyOpenedWorkspaces();

    const repositoriesByKey = new Map<
      string,
      {
        repositoryId: string | null;
        mainWorktreePath: string;
        openedAt: number;
      }
    >();

    await Promise.all(
      recentWorkspaces.map(async (workspace) => {
        try {
          const [repositoryInfo, mainWorktreePath] = await Promise.all([
            this.gitService.getWorkspaceRepositoryInfo(workspace.path),
            this.gitService.getWorkspaceMainWorktreePath(workspace.path),
          ]);
          if (!repositoryInfo || !mainWorktreePath) return;

          const resolvedMainWorktreePath =
            (await safeRealpath(mainWorktreePath)) ??
            path.resolve(mainWorktreePath);
          const key =
            repositoryInfo.repositoryId ??
            normalizePathForKey(resolvedMainWorktreePath);
          const existing = repositoriesByKey.get(key);
          if (existing && existing.openedAt >= workspace.openedAt) return;

          repositoriesByKey.set(key, {
            repositoryId: repositoryInfo.repositoryId,
            mainWorktreePath: resolvedMainWorktreePath,
            openedAt: workspace.openedAt,
          });
        } catch (error) {
          this.logger.debug(
            `[WorktreeSetupSettings] Failed to resolve recent repository ${workspace.path}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
    );

    const managedWorktrees = await this.inspectManagedWorktrees();
    for (const worktree of managedWorktrees) {
      if (!worktree.mainWorktreePath) continue;
      const key =
        worktree.repositoryId ?? normalizePathForKey(worktree.mainWorktreePath);
      const existing = repositoriesByKey.get(key);
      if (existing && existing.openedAt >= 0) continue;

      repositoriesByKey.set(key, {
        repositoryId: worktree.repositoryId,
        mainWorktreePath: worktree.mainWorktreePath,
        openedAt: 0,
      });
    }

    const repositories = await Promise.all(
      [...repositoriesByKey.values()].map((repository) =>
        this.buildRepositorySettings(
          repository.mainWorktreePath,
          repository.repositoryId,
          managedWorktrees,
        ),
      ),
    );

    const sortedRepositories = repositories.sort((a, b) => {
      const latestA = getLatestRepositoryWorktreeUsage(a);
      const latestB = getLatestRepositoryWorktreeUsage(b);
      if (latestA !== latestB) return latestB - latestA;
      return a.name.localeCompare(b.name);
    });

    return sortedRepositories;
  }

  private async buildRepositorySettings(
    mainWorktreePath: string,
    repositoryId: string | null,
    managedWorktrees: ManagedWorktreeInspection[],
  ): Promise<WorktreeSetupRepositorySettings> {
    const scriptPath = path.join(mainWorktreePath, SETUP_SCRIPT_RELATIVE_PATH);
    const scriptContent = await this.readScriptContent(scriptPath);
    return {
      id: repositoryId ?? normalizePathForKey(mainWorktreePath),
      name: path.basename(mainWorktreePath),
      mainWorktreePath,
      repositoryId,
      scriptPath,
      scriptExists: scriptContent !== null,
      scriptContent: scriptContent ?? '',
      managedWorktrees: this.filterManagedWorktreesForRepository(
        mainWorktreePath,
        repositoryId,
        managedWorktrees,
      ),
    };
  }

  private async readScriptContent(scriptPath: string): Promise<string | null> {
    try {
      return await fs.readFile(scriptPath, 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return null;
      this.logger.debug(
        `[WorktreeSetupSettings] Failed to read setup script ${scriptPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private filterManagedWorktreesForRepository(
    mainWorktreePath: string,
    repositoryId: string | null,
    managedWorktrees: ManagedWorktreeInspection[],
  ): WorktreeSetupManagedWorktree[] {
    const normalizedMainWorktreePath = normalizePathForKey(mainWorktreePath);
    return managedWorktrees
      .filter((worktree) => {
        if (repositoryId) return worktree.repositoryId === repositoryId;
        return (
          worktree.normalizedMainWorktreePath === normalizedMainWorktreePath
        );
      })
      .map(
        ({
          repositoryId: _repositoryId,
          mainWorktreePath: _mainWorktreePath,
          normalizedMainWorktreePath: _normalizedMainWorktreePath,
          ...worktree
        }) => worktree,
      )
      .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
  }

  private async inspectManagedWorktrees(): Promise<
    ManagedWorktreeInspection[]
  > {
    const managedPaths = await this.listManagedWorktreePaths();

    const lastUsedByPath =
      await this.getWorkspaceLastUsedAtByPath(managedPaths);
    const mountedPaths = await this.getNormalizedMountedPaths();

    const worktrees = await mapWithConcurrency(
      managedPaths,
      MANAGED_WORKTREE_INSPECTION_CONCURRENCY,
      async (managedPath): Promise<ManagedWorktreeInspection | null> => {
        try {
          const summary =
            await this.gitService.getMountedWorkspaceSummary(managedPath);
          if (!summary?.isWorktree) return null;
          const summaryMainWorktreePath = summary.mainWorktreePath
            ? ((await safeRealpath(summary.mainWorktreePath)) ??
              path.resolve(summary.mainWorktreePath))
            : null;
          const normalizedMainWorktreePath = summaryMainWorktreePath
            ? normalizePathForKey(summaryMainWorktreePath)
            : null;

          const worktreeInfo =
            await this.gitService.getWorktreeInfo(managedPath);
          const status = await this.gitService.getWorktreeStatus(managedPath);
          const clean = status?.dirty === false;
          const normalizedManagedPath = normalizePathForKey(managedPath);
          const current = worktreeInfo?.isMainWorktree === true;
          let disabledReason: string | null = null;
          if (current) {
            disabledReason = 'Main worktree cannot be deleted.';
          } else if (mountedPaths.has(normalizedManagedPath)) {
            disabledReason = 'Worktree is currently mounted.';
          } else if (!worktreeInfo?.branch || worktreeInfo.isDetached) {
            disabledReason = 'Detached worktrees cannot be deleted.';
          } else if (!clean) {
            disabledReason = 'Worktree has uncommitted changes.';
          }

          return {
            path: managedPath,
            name: path.basename(managedPath),
            branch: worktreeInfo?.branch ?? summary.branch,
            headSha: worktreeInfo?.headSha ?? summary.headSha,
            lastUsedAt: lastUsedByPath.get(managedPath) ?? null,
            clean,
            current,
            removable: disabledReason === null,
            disabledReason,
            repositoryId: summary.repositoryId ?? null,
            mainWorktreePath: summaryMainWorktreePath,
            normalizedMainWorktreePath,
          } satisfies ManagedWorktreeInspection;
        } catch (error) {
          this.logger.debug(
            `[WorktreeSetupSettings] Failed to inspect managed worktree ${managedPath}: ${error instanceof Error ? error.message : String(error)}`,
          );
          return null;
        }
      },
    );

    const inspectedWorktrees = worktrees.filter(
      (worktree): worktree is ManagedWorktreeInspection => Boolean(worktree),
    );

    return inspectedWorktrees;
  }

  private async listManagedWorktreePaths(): Promise<string[]> {
    const worktreesDir = getWorktreesDir();
    let repoEntries: string[];
    try {
      repoEntries = await fs.readdir(worktreesDir);
    } catch {
      return [];
    }

    const paths: string[] = [];
    const visitDirectory = async (directoryPath: string): Promise<void> => {
      try {
        const stat = await fs.lstat(directoryPath);
        if (!stat.isDirectory() || stat.isSymbolicLink()) return;

        await fs.lstat(path.join(directoryPath, '.git'));
        const resolvedPath =
          await this.resolveManagedWorktreePath(directoryPath);
        if (resolvedPath) paths.push(resolvedPath);
        return;
      } catch {
        // No .git entry at this level, or the directory is not readable.
      }

      let directoryEntries: string[];
      try {
        directoryEntries = await fs.readdir(directoryPath);
      } catch {
        return;
      }

      await Promise.all(
        directoryEntries
          .filter((entry) => entry !== '.git')
          .map((entry) => visitDirectory(path.join(directoryPath, entry))),
      );
    };

    await Promise.all(
      repoEntries.map((repoEntry) =>
        visitDirectory(path.join(worktreesDir, repoEntry)),
      ),
    );

    return paths;
  }

  private async resolveManagedWorktreePath(
    workspacePath: string,
  ): Promise<string | null> {
    const [worktreesDir, resolvedPath] = await Promise.all([
      safeRealpath(getWorktreesDir()),
      safeRealpath(workspacePath),
    ]);
    if (!worktreesDir || !resolvedPath) return null;
    const relativeToWorktrees = path.relative(worktreesDir, resolvedPath);
    if (
      relativeToWorktrees.length === 0 ||
      relativeToWorktrees.startsWith('..') ||
      path.isAbsolute(relativeToWorktrees)
    ) {
      return null;
    }
    return resolvedPath;
  }

  private async getNormalizedMountedPaths(): Promise<Set<string>> {
    const mountedPaths = this.getMountedWorkspacePaths();
    const normalized = new Set<string>();
    await Promise.all(
      [...mountedPaths].map(async (mountedPath) => {
        const resolvedPath =
          (await safeRealpath(mountedPath)) ?? path.resolve(mountedPath);
        normalized.add(normalizePathForKey(resolvedPath));
      }),
    );
    return normalized;
  }
}
