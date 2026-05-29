/**
 * Host-side `MountManager` shell.
 *
 * After Phase 8, all reasoning / state / watcher / mention-search
 * logic lives inside `@stagewise/agent-core`. This file is a thin
 * Electron-aware wrapper that:
 *
 *   - Owns per-workspace `ClientRuntimeNode` and `LspService`.
 *   - Resolves a file-picker dialog when the UI requests a mount
 *     without a path.
 *   - Persists recently-opened workspaces.
 *   - Tracks per-agent-per-prefix sandbox permissions (not part of
 *     the core `MountEntry`).
 *   - Registers the three `toolbox.*` Karton procedures.
 *   - Delegates registry / cache / watcher / mention-search work to
 *     the core `MountManager` and `MentionSearchService`.
 *
 * The public surface used by `ToolboxService` is preserved so no
 * callers outside this folder need to change.
 */
import { DisposableService } from '@/services/disposable';
import type { Logger } from '@/services/logger';
import { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import { LspService } from '../lsp';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  MentionSearchService,
  MountManager,
  mountPrefixForPath,
  type MentionSearchContext,
} from '@stagewise/agent-core/mount-manager';
import type { FilePickerService } from '@/services/file-picker';
import type { KartonService } from '@/services/karton';
import type { UserExperienceService } from '@/services/experience';
import type { TelemetryService } from '@/services/telemetry';
import type { PreferencesService } from '@/services/preferences';
import type { GitService } from '@/services/git';
import type {
  MountedWorkspaceGitSummary,
  WorkspaceGitCleanupCandidate,
  WorkspaceGitCleanupResult,
  WorkspaceGitCleanupState,
  MountEntry,
  WorkspaceGitCreateBranchOptions,
  WorkspaceGitCreateWorktreeOptions,
  WorkspaceGitCreateWorktreeResult,
  WorkspaceGitMutationResult,
} from '@shared/karton-contracts/ui';
import type { WorkspaceSnapshot } from '../../types';
import { FULL_PERMISSIONS, type MountPermission } from '@/services/sandbox/ipc';
import type { MountsStateController } from '@/services/agent-core-bridge/state/toolbox-mounts';
import { createBrowserTelemetrySink } from '@/services/agent-core-bridge/host-telemetry';
import { getRipgrepBasePath, getWorktreesDir } from '@/utils/paths';
import {
  WorktreeSetupRunner,
  type WorktreeSetupMetadata,
} from './worktree-setup-runner';

type KartonStateDraft = {
  workspaceGitCleanup: WorkspaceGitCleanupState;
  toolbox: Record<
    string,
    {
      workspace: { mounts: MountEntry[] };
      pendingFileDiffs: unknown[];
      editSummary: unknown[];
      pendingUserQuestion: unknown;
    }
  >;
};

const WORKTREE_CLEANUP_UNUSED_DAYS = 7;
const WORKTREE_CLEANUP_UNUSED_MS =
  WORKTREE_CLEANUP_UNUSED_DAYS * 24 * 60 * 60 * 1000;
const WORKTREE_CLEANUP_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
const PENDING_WORKTREE_SETUP_TTL_MS = 10 * 60 * 1000;

// Re-export the canonical workspace resolver so the existing import
// path `from '@/services/toolbox/services/mount-manager'` keeps
// working (notably for the `index.test.ts` unit tests in this folder
// and for `DiffHistoryService`). The single implementation lives in
// `@stagewise/agent-core/workspace`.
export { pickOwningWorkspace } from '@stagewise/agent-core/mount-manager';

type AgentInstanceId = string;
type MountPrefix = string;
type WorkspacePath = string;
type PendingWorktreeSetup = WorktreeSetupMetadata & { createdAt: number };

async function safeRealpath(targetPath: string): Promise<string | null> {
  try {
    return await fs.realpath(targetPath);
  } catch {
    return null;
  }
}

export type MountedClientRuntimes = Map<MountPrefix, ClientRuntimeNode>;
export type MountedLspServices = Map<MountPrefix, LspService>;

/**
 * Thin host adapter around the core `MountManager`. Keeps all
 * Electron / Karton / ClientRuntime / LSP coupling on this side and
 * forwards pure registry + watcher work into the core.
 */
export class MountManagerService extends DisposableService {
  private readonly logger: Logger;
  private readonly filePickerService: FilePickerService;
  private readonly userExperienceService: UserExperienceService;
  private readonly uiKarton: KartonService;
  private readonly telemetryService: TelemetryService;
  private readonly gitService: GitService;
  private readonly preferencesService: PreferencesService;
  private readonly resolvedEnvPromise: Promise<Record<string, string> | null>;
  private readonly worktreeSetupRunner: WorktreeSetupRunner;
  private readonly pendingWorktreeSetups = new Map<
    string,
    PendingWorktreeSetup
  >();
  /**
   * Resolver injected by `ToolboxService` post-construction so the
   * Git-cleanup candidate scanner can look up workspace last-used
   * timestamps from `AgentPersistenceDB` without taking a direct
   * dependency on the agent manager. Defaults to an empty map.
   */
  private getWorkspaceLastUsedAtByPath: (
    workspacePaths: string[],
  ) => Promise<Map<string, number>> = async () => new Map();

  private readonly core: MountManager;
  private readonly mentionSearch: MentionSearchService;

  /**
   * Per-agent-per-prefix sandbox permissions. Not part of the core
   * `MountEntry` slice — only the sandbox isolation layer consumes
   * it, via `getMountedPathsWithRuntimes`.
   */
  private agentPermissions: Map<
    AgentInstanceId,
    Map<MountPrefix, MountPermission[]>
  > = new Map();

  private clientRuntimesPerPath: Map<string, ClientRuntimeNode> = new Map();
  private lspServicesPerPath: Map<string, LspService> = new Map();
  /** Promise that resolves when LSP service is ready (or null if no workspace) */
  private lspReady: Map<string, Promise<LspService | null>> = new Map();

  private onMountsChanged?: (agentInstanceId: string) => void;

  public constructor(
    logger: Logger,
    filePickerService: FilePickerService,
    userExperienceService: UserExperienceService,
    uiKarton: KartonService,
    telemetryService: TelemetryService,
    gitService: GitService,
    preferencesService: PreferencesService,
    mountsController: MountsStateController,
    resolvedEnvPromise?: Promise<Record<string, string> | null>,
  ) {
    super();
    this.logger = logger;
    this.filePickerService = filePickerService;
    this.userExperienceService = userExperienceService;
    this.uiKarton = uiKarton;
    this.telemetryService = telemetryService;
    this.gitService = gitService;
    this.preferencesService = preferencesService;
    this.resolvedEnvPromise = resolvedEnvPromise ?? Promise.resolve(null);
    this.worktreeSetupRunner = new WorktreeSetupRunner({
      logger,
      telemetryService,
      uiKarton,
      resolvedEnvPromise: this.resolvedEnvPromise,
    });

    this.core = new MountManager({
      store: mountsController,
      logger: this.logger,
      telemetry: createBrowserTelemetrySink(this.telemetryService, {
        logger: this.logger,
      }),
      hooks: {
        onWorkspaceAttached: (wsPath) => this.attachWorkspaceRuntime(wsPath),
        onWorkspaceReleased: (wsPath) => this.releaseWorkspaceRuntime(wsPath),
        onMountsChanged: (agentId) => this.onMountsChanged?.(agentId),
        getWorkspaceGitSummary: (wsPath) =>
          this.gitService.getMountedWorkspaceSummary(wsPath),
      },
      getAgentType: (agentInstanceId) =>
        this.uiKarton.state.agents.instances[agentInstanceId]?.type ??
        'unknown',
    });

    const searchCtx: MentionSearchContext = {
      getWorkspacePathForPrefix: (prefix) =>
        this.core.getWorkspacePathForPrefix(prefix),
      getClientRuntimeForPrefix: (prefix) => {
        const wsPath = this.core.getWorkspacePathForPrefix(prefix);
        return wsPath ? this.clientRuntimesPerPath.get(wsPath) : undefined;
      },
      getToolboxState: (agentInstanceId) =>
        this.uiKarton.state.toolbox[agentInstanceId],
      getMountPrefixes: (agentInstanceId) =>
        this.core.getMountPrefixes(agentInstanceId),
    };
    this.mentionSearch = new MentionSearchService(this.logger, searchCtx);
  }

  public static async create(
    logger: Logger,
    filePickerService: FilePickerService,
    userExperienceService: UserExperienceService,
    uiKarton: KartonService,
    telemetryService: TelemetryService,
    gitService: GitService,
    preferencesService: PreferencesService,
    mountsController: MountsStateController,
    resolvedEnvPromise?: Promise<Record<string, string> | null>,
  ): Promise<MountManagerService> {
    const instance = new MountManagerService(
      logger,
      filePickerService,
      userExperienceService,
      uiKarton,
      telemetryService,
      gitService,
      preferencesService,
      mountsController,
      resolvedEnvPromise,
    );
    await instance.initialize();
    return instance;
  }

  public setOnMountsChanged(cb: (agentInstanceId: string) => void) {
    this.onMountsChanged = cb;
  }

  public setWorkspaceLastUsedAtResolver(
    resolver: (workspacePaths: string[]) => Promise<Map<string, number>>,
  ): void {
    this.getWorkspaceLastUsedAtByPath = resolver;
  }

  /**
   * Expose the package-owned `MountManager` so core-side environment
   * providers (e.g. `WorkspaceProvider`, `AgentsMdProvider`) can read
   * mount state directly without routing through this host shell.
   */
  public getCoreMountManager(): MountManager {
    return this.core;
  }

  private async initialize(): Promise<void> {
    this.uiKarton.registerServerProcedureHandler(
      'toolbox.mountWorkspace',
      async (
        _callingClientId: string,
        agentInstanceId: string,
        workspacePath?: string,
        permissions?: MountPermission[],
      ) => {
        await this.handleMountWorkspace(
          agentInstanceId,
          workspacePath,
          permissions,
        );
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.unmountWorkspace',
      async (
        _callingClientId: string,
        agentInstanceId: string,
        mountPrefix: string,
      ) => {
        await this.handleUnmountWorkspace(agentInstanceId, mountPrefix);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.listGitBranchesByPath',
      async (_callingClientId: string, workspacePath: string) => {
        return this.listGitBranchesByPath(workspacePath);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.listGitWorktreesByPath',
      async (_callingClientId: string, workspacePath: string) => {
        return this.listGitWorktreesByPath(workspacePath);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.switchGitBranchByPath',
      async (
        _callingClientId: string,
        workspacePath: string,
        branchName: string,
      ) => {
        return this.switchGitBranchByPath(workspacePath, branchName);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.createGitBranchByPath',
      async (
        _callingClientId: string,
        workspacePath: string,
        options: WorkspaceGitCreateBranchOptions,
      ) => {
        return this.createGitBranchByPath(workspacePath, options);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.createGitWorktreeByPath',
      async (
        _callingClientId: string,
        workspacePath: string,
        options: WorkspaceGitCreateWorktreeOptions,
      ) => {
        return this.createGitWorktreeByPath(workspacePath, options);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.listWorkspaceGitBranches',
      async (
        _callingClientId: string,
        agentInstanceId: string,
        mountPrefix: string,
      ) => {
        const mount = this.resolveMountedWorkspace(
          agentInstanceId,
          mountPrefix,
        );
        if (!mount) return null;
        return this.listGitBranchesByPath(mount.path);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.listWorkspaceGitWorktrees',
      async (
        _callingClientId: string,
        agentInstanceId: string,
        mountPrefix: string,
      ) => {
        const mount = this.resolveMountedWorkspace(
          agentInstanceId,
          mountPrefix,
        );
        if (!mount) return null;
        return this.listGitWorktreesByPath(mount.path);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.switchWorkspaceGitBranch',
      async (
        _callingClientId: string,
        agentInstanceId: string,
        mountPrefix: string,
        branchName: string,
      ) => {
        const mount = this.resolveMountedWorkspace(
          agentInstanceId,
          mountPrefix,
        );
        if (!mount) return this.notGitRepoResult();
        const result = await this.switchGitBranchByPath(mount.path, branchName);
        if (result.ok) {
          this.updateMountedWorkspaceGit(
            agentInstanceId,
            mountPrefix,
            result.git,
          );
        }
        return result;
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.createWorkspaceGitBranch',
      async (
        _callingClientId: string,
        agentInstanceId: string,
        mountPrefix: string,
        options: WorkspaceGitCreateBranchOptions,
      ) => {
        const mount = this.resolveMountedWorkspace(
          agentInstanceId,
          mountPrefix,
        );
        if (!mount) return this.notGitRepoResult();
        const result = await this.createGitBranchByPath(mount.path, options);
        if (result.ok) {
          this.updateMountedWorkspaceGit(
            agentInstanceId,
            mountPrefix,
            result.git,
          );
        }
        return result;
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.createWorkspaceGitWorktree',
      async (
        _callingClientId: string,
        agentInstanceId: string,
        mountPrefix: string,
        options: WorkspaceGitCreateWorktreeOptions,
      ) => {
        const mount = this.resolveMountedWorkspace(
          agentInstanceId,
          mountPrefix,
        );
        if (!mount) return this.notGitRepoCreateWorktreeResult();
        return this.createGitWorktreeByPath(mount.path, options);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.dismissWorkspaceGitCleanupPrompt',
      async () => {
        const paths = this.uiKarton.state.workspaceGitCleanup.candidates.map(
          (candidate: WorkspaceGitCleanupCandidate) => candidate.path,
        );
        await this.preferencesService.snoozeWorkspaceGitCleanupCandidates(
          paths,
        );
        this.uiKarton.setState((draft: KartonStateDraft) => {
          draft.workspaceGitCleanup.dismissed = true;
        });
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.cleanWorkspaceGitWorktrees',
      async (_callingClientId: string, paths: string[]) => {
        return this.cleanWorkspaceGitWorktrees(paths);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.searchMentionFiles',
      async (
        _callingClientId: string,
        agentInstanceId: string,
        query: string,
      ) => {
        return this.mentionSearch.search(agentInstanceId, query);
      },
    );
  }

  private resolveMountedWorkspace(
    agentInstanceId: string,
    mountPrefix: string,
  ): { prefix: string; path: string } | null {
    const mount = this.uiKarton.state.toolbox[
      agentInstanceId
    ]?.workspace.mounts.find((item: MountEntry) => item.prefix === mountPrefix);
    if (!mount) return null;
    return { prefix: mount.prefix, path: mount.path };
  }

  private notGitRepoResult(): WorkspaceGitMutationResult {
    return {
      ok: false,
      reason: 'not-git-repo',
      message: 'Workspace is not a Git repo.',
    };
  }

  private notGitRepoCreateWorktreeResult(): WorkspaceGitCreateWorktreeResult {
    return {
      ok: false,
      reason: 'not-git-repo',
      message: 'Workspace is not a Git repo.',
    };
  }

  private isPathInside(parentPath: string, childPath: string): boolean {
    const relativePath = path.relative(parentPath, childPath);
    return (
      relativePath.length > 0 &&
      !relativePath.startsWith('..') &&
      !path.isAbsolute(relativePath)
    );
  }

  private async isTrustedGitPath(workspacePath: string): Promise<boolean> {
    const resolvedPath = await safeRealpath(workspacePath);
    if (!resolvedPath) return false;

    for (const mountedPath of this.core.getAllMountedPaths()) {
      const resolvedMountedPath = await safeRealpath(mountedPath);
      if (resolvedMountedPath === resolvedPath) return true;
    }

    const recentWorkspaces =
      await this.userExperienceService.getRecentlyOpenedWorkspaces();
    for (const workspace of recentWorkspaces) {
      const resolvedRecentPath = await safeRealpath(workspace.path);
      if (resolvedRecentPath === resolvedPath) return true;
    }

    const worktreesDir = await safeRealpath(getWorktreesDir());
    if (!worktreesDir) return false;

    return this.isPathInside(worktreesDir, resolvedPath);
  }

  private async isTrustedMainWorktreePath(
    workspacePath: string,
    mainWorktreePath: string,
  ): Promise<boolean> {
    if (await this.isTrustedGitPath(mainWorktreePath)) return true;

    const [resolvedWorkspacePath, resolvedMainWorktreePath, worktreesDir] =
      await Promise.all([
        safeRealpath(workspacePath),
        safeRealpath(mainWorktreePath),
        safeRealpath(getWorktreesDir()),
      ]);
    if (!resolvedWorkspacePath || !resolvedMainWorktreePath || !worktreesDir) {
      return false;
    }
    if (!this.isPathInside(worktreesDir, resolvedWorkspacePath)) return false;

    const repositoryInfo =
      await this.gitService.getWorkspaceRepositoryInfo(mainWorktreePath);
    if (!repositoryInfo) return false;

    const resolvedRepoRoot = await safeRealpath(repositoryInfo.repoRoot);
    return resolvedRepoRoot === resolvedMainWorktreePath;
  }

  private async listGitBranchesByPath(workspacePath: string) {
    if (!(await this.isTrustedGitPath(workspacePath))) return null;
    return this.gitService.listBranches(workspacePath);
  }

  private async listGitWorktreesByPath(workspacePath: string) {
    if (!(await this.isTrustedGitPath(workspacePath))) return null;
    return this.gitService.listWorkspaceWorktrees(workspacePath);
  }

  private async switchGitBranchByPath(
    workspacePath: string,
    branchName: string,
  ): Promise<WorkspaceGitMutationResult> {
    if (!(await this.isTrustedGitPath(workspacePath))) {
      return this.notGitRepoResult();
    }
    return this.gitService.switchBranch(workspacePath, branchName);
  }

  private async createGitBranchByPath(
    workspacePath: string,
    options: WorkspaceGitCreateBranchOptions,
  ): Promise<WorkspaceGitMutationResult> {
    if (!(await this.isTrustedGitPath(workspacePath))) {
      return this.notGitRepoResult();
    }
    return this.gitService.createBranch(workspacePath, options);
  }

  private async createGitWorktreeByPath(
    workspacePath: string,
    options: WorkspaceGitCreateWorktreeOptions,
  ): Promise<WorkspaceGitCreateWorktreeResult> {
    if (!(await this.isTrustedGitPath(workspacePath))) {
      return this.notGitRepoCreateWorktreeResult();
    }

    const [repositoryInfo, mainWorktreePath] = await Promise.all([
      this.gitService.getWorkspaceRepositoryInfo(workspacePath),
      this.gitService.getWorkspaceMainWorktreePath(workspacePath),
    ]);
    if (!repositoryInfo || !mainWorktreePath) {
      return this.notGitRepoCreateWorktreeResult();
    }
    if (
      !(await this.isTrustedMainWorktreePath(workspacePath, mainWorktreePath))
    ) {
      return this.notGitRepoCreateWorktreeResult();
    }

    const result = await this.gitService.createWorktree(
      mainWorktreePath,
      options,
    );
    if (result.ok) {
      await this.setPendingWorktreeSetup(result.path, {
        workspacePath: result.path,
        mainWorktreePath,
        repositoryId: repositoryInfo.repositoryId,
        sourceBranch: options.sourceBranch,
        worktreeBranch: result.branchName,
      });
    }
    return result;
  }

  private updateMountedWorkspaceGit(
    agentInstanceId: string,
    mountPrefix: string,
    git: MountedWorkspaceGitSummary | null,
  ): void {
    this.uiKarton.setState((draft: KartonStateDraft) => {
      const mount = draft.toolbox[agentInstanceId]?.workspace.mounts.find(
        (item: MountEntry) => item.prefix === mountPrefix,
      );
      if (mount) mount.git = git;
    });
    this.onMountsChanged?.(agentInstanceId);
  }

  /**
   * Handle the UI's mount request: resolve the path (opening the file
   * picker if none was supplied), persist it to the recents list,
   * stash host-side permissions, then delegate the actual registry /
   * cache / watcher work to the core `MountManager`.
   */
  public async handleMountWorkspace(
    agentInstanceId: string,
    workspacePath?: string,
    permissions?: MountPermission[],
  ): Promise<void> {
    const resolvedPermissions: MountPermission[] =
      permissions ?? ([...FULL_PERMISSIONS] as MountPermission[]);

    let resolvedWorkspacePath: string | undefined;
    if (!workspacePath) {
      const filePickerResponses = await this.filePickerService.createRequest({
        title: 'Select a workspace',
        description: 'Select a workspace to load',
        type: 'directory',
        multiple: false,
      });
      if (filePickerResponses.length === 0) return;
      resolvedWorkspacePath = filePickerResponses[0];
    } else {
      resolvedWorkspacePath = workspacePath;
    }
    if (!resolvedWorkspacePath) return;

    await this.userExperienceService.saveRecentlyOpenedWorkspace({
      path: resolvedWorkspacePath,
      name: path.basename(resolvedWorkspacePath),
      openedAt: Date.now(),
    });

    const prefix = mountPrefixForPath(resolvedWorkspacePath);
    let perAgent = this.agentPermissions.get(agentInstanceId);
    if (!perAgent) {
      perAgent = new Map<MountPrefix, MountPermission[]>();
      this.agentPermissions.set(agentInstanceId, perAgent);
    }
    // Record permissions up-front so `getMountedPathsWithRuntimes`
    // can observe them in the `onMountsChanged` callback that fires
    // from within `core.mountWorkspace`.
    perAgent.set(prefix, resolvedPermissions);

    await this.core.mountWorkspace(agentInstanceId, resolvedWorkspacePath);

    // Worktree-setup is host-side git tooling: if this mount corresponds
    // to a worktree we just created, kick off its setup commands now that
    // the workspace is mounted and its runtime is available.
    const pendingSetup = await this.takePendingWorktreeSetup(
      resolvedWorkspacePath,
    );
    if (pendingSetup) {
      void this.worktreeSetupRunner.start(pendingSetup);
    }
  }

  public async handleUnmountWorkspace(
    agentInstanceId: string,
    mountPrefix: string,
  ): Promise<void> {
    this.agentPermissions.get(agentInstanceId)?.delete(mountPrefix);
    this.core.unmountWorkspace(agentInstanceId, mountPrefix);
  }

  public clearAgentMounts(agentInstanceId: string): void {
    this.agentPermissions.delete(agentInstanceId);
    this.core.clearAgentMounts(agentInstanceId);
  }

  public setWorkspaceMdContent(
    workspacePath: string,
    content: string | null,
  ): void {
    this.core.setWorkspaceMdContent(workspacePath, content);
  }

  public getMountedPathsWithRuntimes(agentInstanceId: string): Array<{
    prefix: string;
    path: string;
    permissions: MountPermission[];
    clientRuntime: ClientRuntimeNode;
  }> {
    const prefixes = this.core.getMountPrefixes(agentInstanceId);
    if (!prefixes) return [];
    const perAgent = this.agentPermissions.get(agentInstanceId);
    const result: Array<{
      prefix: string;
      path: string;
      permissions: MountPermission[];
      clientRuntime: ClientRuntimeNode;
    }> = [];
    for (const prefix of prefixes) {
      const wsPath = this.core.getWorkspacePathForPrefix(prefix);
      const rt = wsPath ? this.clientRuntimesPerPath.get(wsPath) : undefined;
      const permissions =
        perAgent?.get(prefix) ?? ([...FULL_PERMISSIONS] as MountPermission[]);
      if (wsPath && rt) {
        result.push({ prefix, path: wsPath, permissions, clientRuntime: rt });
      }
    }
    return result;
  }

  public findWorkspaceForFile(
    agentInstanceId: string,
    filePath: string,
  ): string | undefined {
    return this.core.findWorkspaceForFile(agentInstanceId, filePath);
  }

  public getMountPrefixes(agentInstanceId: string): string[] | undefined {
    return this.core.getMountPrefixes(agentInstanceId);
  }

  public getWorkspacePathForPrefix(prefix: string): string | undefined {
    return this.core.getWorkspacePathForPrefix(prefix);
  }

  public getAllMountedPaths(): Set<string> {
    return this.core.getAllMountedPaths();
  }

  public async scanWorkspaceGitCleanupCandidatesOnStartup(): Promise<void> {
    try {
      const candidates = await this.getWorkspaceGitCleanupCandidates();
      const now = Date.now();
      const dismissedCandidates =
        this.preferencesService.get().agent.workspaceGitCleanup
          .dismissedCandidates;
      const promptableCandidates = candidates.filter((candidate) => {
        const dismissedAt = dismissedCandidates[candidate.path]?.dismissedAt;
        return (
          dismissedAt === undefined ||
          now - dismissedAt >= WORKTREE_CLEANUP_DISMISS_MS
        );
      });
      this.uiKarton.setState((draft: KartonStateDraft) => {
        draft.workspaceGitCleanup.checkedAt = now;
        draft.workspaceGitCleanup.dismissed = promptableCandidates.length === 0;
        draft.workspaceGitCleanup.cleaning = false;
        draft.workspaceGitCleanup.candidates = promptableCandidates;
        draft.workspaceGitCleanup.lastResult = null;
      });
      await this.preferencesService.pruneWorkspaceGitCleanupSnoozes(
        candidates.map(
          (candidate: WorkspaceGitCleanupCandidate) => candidate.path,
        ),
        WORKTREE_CLEANUP_DISMISS_MS,
        now,
      );
    } catch (error) {
      this.logger.warn(
        `[MountManager] Failed to scan worktree cleanup candidates: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.uiKarton.setState((draft: KartonStateDraft) => {
        draft.workspaceGitCleanup.checkedAt = Date.now();
        draft.workspaceGitCleanup.cleaning = false;
      });
    }
  }

  private async cleanWorkspaceGitWorktrees(
    paths: string[],
  ): Promise<WorkspaceGitCleanupResult> {
    const uniquePaths = Array.from(new Set(paths));
    this.uiKarton.setState((draft: KartonStateDraft) => {
      draft.workspaceGitCleanup.cleaning = true;
    });

    const removed: WorkspaceGitCleanupResult['removed'] = [];
    const failed: WorkspaceGitCleanupResult['failed'] = [];
    let lastUsedByPath: Map<string, number>;
    try {
      const usagePaths = Array.from(
        new Set(
          await Promise.all(
            uniquePaths.map(async (workspacePath) => {
              return (
                (await this.resolveManagedWorktreePath(workspacePath)) ??
                workspacePath
              );
            }),
          ),
        ),
      );
      lastUsedByPath = await this.getWorkspaceLastUsedAtByPath(usagePaths);
    } catch (error) {
      this.logger.warn(
        `[MountManager] Failed to resolve worktree cleanup usage data: ${error instanceof Error ? error.message : String(error)}`,
      );
      const result = {
        removed,
        failed: uniquePaths.map((workspacePath) => ({
          path: workspacePath,
          message: 'Unable to verify worktree usage data.',
        })),
      } satisfies WorkspaceGitCleanupResult;
      this.uiKarton.setState((draft: KartonStateDraft) => {
        draft.workspaceGitCleanup.cleaning = false;
        draft.workspaceGitCleanup.lastResult = result;
      });
      return result;
    }

    for (const workspacePath of uniquePaths) {
      try {
        const candidate = await this.getCleanupCandidateForPath(
          workspacePath,
          lastUsedByPath,
        );
        if (!candidate) {
          failed.push({
            path: workspacePath,
            message: 'Worktree is no longer safe to clean.',
          });
          continue;
        }

        const result = await this.gitService.removeWorktree(candidate.path);
        if (result.ok) {
          removed.push({ path: candidate.path, branch: candidate.branch });
        } else {
          failed.push({ path: candidate.path, message: result.message });
        }
      } catch (error) {
        failed.push({
          path: workspacePath,
          message:
            error instanceof Error
              ? error.message
              : 'Unexpected cleanup failure.',
        });
      }
    }

    const removedPaths = new Set(removed.map((item) => item.path));
    const result = { removed, failed };
    this.uiKarton.setState((draft: KartonStateDraft) => {
      draft.workspaceGitCleanup.cleaning = false;
      draft.workspaceGitCleanup.lastResult = result;
      draft.workspaceGitCleanup.candidates =
        draft.workspaceGitCleanup.candidates.filter(
          (candidate: WorkspaceGitCleanupCandidate) =>
            !removedPaths.has(candidate.path),
        );
      if (draft.workspaceGitCleanup.candidates.length === 0) {
        draft.workspaceGitCleanup.dismissed = true;
      }
    });
    try {
      const remainingCleanupCandidates =
        await this.getWorkspaceGitCleanupCandidates();
      await this.preferencesService.pruneWorkspaceGitCleanupSnoozes(
        remainingCleanupCandidates.map(
          (candidate: WorkspaceGitCleanupCandidate) => candidate.path,
        ),
        WORKTREE_CLEANUP_DISMISS_MS,
      );
    } catch (error) {
      this.logger.warn(
        `[MountManager] Failed to prune worktree cleanup snoozes after cleanup: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return result;
  }

  private async getWorkspaceGitCleanupCandidates(): Promise<
    WorkspaceGitCleanupCandidate[]
  > {
    const paths = await this.listManagedWorktreePaths();
    const lastUsedByPath = await this.getWorkspaceLastUsedAtByPath(paths);
    const candidates: WorkspaceGitCleanupCandidate[] = [];

    for (const workspacePath of paths) {
      const candidate = await this.getCleanupCandidateForPath(
        workspacePath,
        lastUsedByPath,
      );
      if (candidate) candidates.push(candidate);
    }

    return candidates;
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
      let directoryEntries: string[];
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

  private async getCleanupCandidateForPath(
    workspacePath: string,
    lastUsedByPath: ReadonlyMap<string, number>,
  ): Promise<WorkspaceGitCleanupCandidate | null> {
    const resolvedWorkspacePath =
      await this.resolveManagedWorktreePath(workspacePath);
    if (!resolvedWorkspacePath) return null;
    if (await this.isCurrentlyMounted(resolvedWorkspacePath)) return null;

    const summary = await this.gitService.getMountedWorkspaceSummary(
      resolvedWorkspacePath,
    );
    if (!summary?.isWorktree || !summary.branch) return null;

    const worktrees = await this.gitService.listWorktrees(
      resolvedWorkspacePath,
    );
    let currentWorktree = null;
    for (const worktree of worktrees) {
      const resolvedWorktreePath =
        (await safeRealpath(worktree.path)) ?? path.resolve(worktree.path);
      if (resolvedWorktreePath === resolvedWorkspacePath) {
        currentWorktree = worktree;
        break;
      }
    }
    if (!currentWorktree || currentWorktree.isMainWorktree) return null;
    if (currentWorktree.isDetached || !currentWorktree.branch) return null;

    const status = await this.gitService.getWorktreeStatus(
      resolvedWorkspacePath,
    );
    if (!status || status.dirty) return null;

    const lastUsedAt = lastUsedByPath.get(resolvedWorkspacePath) ?? null;
    if (
      lastUsedAt !== null &&
      Date.now() - lastUsedAt < WORKTREE_CLEANUP_UNUSED_MS
    ) {
      return null;
    }

    const merged = await this.gitService.findMergedTarget(
      resolvedWorkspacePath,
      currentWorktree.branch,
    );
    if (!merged.merged || !merged.target) return null;

    return {
      path: resolvedWorkspacePath,
      branch: currentWorktree.branch,
      headSha: currentWorktree.headSha,
      repositoryId: summary.repositoryId,
      repoRoot: summary.repoRoot,
      lastUsedAt,
      mergedInto: merged.target,
      status: {
        dirty: false,
        stagedCount: 0,
        unstagedCount: 0,
        untrackedCount: 0,
      },
    };
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

  private async isCurrentlyMounted(workspacePath: string): Promise<boolean> {
    const normalizedPath =
      (await safeRealpath(workspacePath)) ?? path.resolve(workspacePath);
    for (const mountedPath of this.core.getAllMountedPaths()) {
      const normalizedMountedPath =
        (await safeRealpath(mountedPath)) ?? path.resolve(mountedPath);
      if (normalizedMountedPath === normalizedPath) return true;
    }
    return false;
  }

  public getMountedRuntimes(agentInstanceId: string): MountedClientRuntimes {
    const prefixes = this.core.getMountPrefixes(agentInstanceId) ?? [];
    const result: MountedClientRuntimes = new Map();
    for (const prefix of prefixes) {
      const wsPath = this.core.getWorkspacePathForPrefix(prefix);
      if (!wsPath) continue;
      const rt = this.clientRuntimesPerPath.get(wsPath);
      if (rt) result.set(prefix, rt);
    }
    return result;
  }

  public getMountedLspServices(agentInstanceId: string): MountedLspServices {
    const prefixes = this.core.getMountPrefixes(agentInstanceId) ?? [];
    const result: MountedLspServices = new Map();
    for (const prefix of prefixes) {
      const wsPath = this.core.getWorkspacePathForPrefix(prefix);
      if (!wsPath) continue;
      const lsp = this.lspServicesPerPath.get(wsPath);
      if (lsp) result.set(prefix, lsp);
    }
    return result;
  }

  public getClientRuntimeForPath(
    wsPath: string,
  ): ClientRuntimeNode | undefined {
    return this.clientRuntimesPerPath.get(wsPath);
  }

  public getWorkspaceSnapshot(agentInstanceId: string): WorkspaceSnapshot {
    const prefixes = this.core.getMountPrefixes(agentInstanceId);
    if (!prefixes || prefixes.length === 0) return { mounts: [] };
    const perAgent = this.agentPermissions.get(agentInstanceId);
    return {
      mounts: prefixes
        .map((prefix) => ({
          prefix,
          path: this.core.getWorkspacePathForPrefix(prefix) ?? '',
          permissions: perAgent?.get(prefix),
        }))
        .filter((m) => m.path !== ''),
    };
  }

  /**
   * Update a file's content in all applicable LSP servers.
   * Call this after a file is modified by a tool.
   * Waits for LSP service to be ready before syncing.
   */
  public async syncFileWithLsp(
    agentInstanceId: string,
    filePath: string,
    content: string,
  ): Promise<void> {
    const wsPath = this.findWorkspaceForFile(agentInstanceId, filePath);
    if (!wsPath) return;
    const lsp = await this.lspReady.get(wsPath);
    if (!lsp) return;

    try {
      await lsp.touchFile(filePath);
      await lsp.updateFile(filePath, content);
    } catch (err) {
      this.logger.debug('[MountManager] Failed to sync file with LSP', {
        error: err,
        path: filePath,
      });
      this.telemetryService.captureException(err as Error, {
        service: 'mount-manager',
        operation: 'syncFileWithLsp',
        path: filePath,
      });
    }
  }

  /**
   * Close a file in all applicable LSP servers.
   * Call this after a file is deleted by a tool.
   * Waits for LSP service to be ready before closing.
   */
  public async syncFileCloseWithLsp(
    agentInstanceId: string,
    filePath: string,
  ): Promise<void> {
    const wsPath = this.findWorkspaceForFile(agentInstanceId, filePath);
    if (!wsPath) return;
    const lsp = await this.lspReady.get(wsPath);
    if (!lsp) return;
    try {
      await lsp.closeFile(filePath);
    } catch (err) {
      this.logger.debug('[MountManager] Failed to close file in LSP', {
        error: err,
        path: filePath,
      });
      this.telemetryService.captureException(err as Error, {
        service: 'mount-manager',
        operation: 'syncFileCloseWithLsp',
        path: filePath,
      });
    }
  }

  /**
   * Core hook: first agent to reference `wsPath` — spin up the host
   * `ClientRuntimeNode` + `LspService`. Awaited by core before it
   * issues its first workspace-info read so the runtime is ready.
   */
  private async attachWorkspaceRuntime(wsPath: string): Promise<void> {
    if (this.clientRuntimesPerPath.has(wsPath)) return;
    const runtime = new ClientRuntimeNode({
      workingDirectory: wsPath,
      rgBinaryBasePath: getRipgrepBasePath(),
    });
    this.clientRuntimesPerPath.set(wsPath, runtime);
    const resolvedEnv = await this.resolvedEnvPromise;
    const lspPromise = LspService.create(this.logger, runtime, resolvedEnv);
    this.lspReady.set(wsPath, lspPromise);
    const lspService = await lspPromise;
    this.lspServicesPerPath.set(wsPath, lspService);
  }

  /**
   * Core hook: last reference to `wsPath` released — tear down the
   * host runtime + LSP. Fire-and-forget from the core's perspective.
   */
  private releaseWorkspaceRuntime(wsPath: string): void {
    const lspService = this.lspServicesPerPath.get(wsPath);
    if (lspService) void lspService.teardown();
    this.clientRuntimesPerPath.delete(wsPath);
    this.lspServicesPerPath.delete(wsPath);
    this.lspReady.delete(wsPath);
  }

  private async getPendingWorktreeSetupKey(
    workspacePath: string,
  ): Promise<string> {
    return (await safeRealpath(workspacePath)) ?? workspacePath;
  }

  private pruneExpiredPendingWorktreeSetups(now = Date.now()): void {
    for (const [key, setup] of this.pendingWorktreeSetups) {
      if (now - setup.createdAt > PENDING_WORKTREE_SETUP_TTL_MS) {
        this.pendingWorktreeSetups.delete(key);
      }
    }
  }

  private async setPendingWorktreeSetup(
    workspacePath: string,
    setup: WorktreeSetupMetadata,
  ): Promise<void> {
    this.pruneExpiredPendingWorktreeSetups();
    this.pendingWorktreeSetups.set(
      await this.getPendingWorktreeSetupKey(workspacePath),
      {
        ...setup,
        createdAt: Date.now(),
      },
    );
  }

  private async takePendingWorktreeSetup(
    workspacePath: string,
  ): Promise<WorktreeSetupMetadata | null> {
    this.pruneExpiredPendingWorktreeSetups();
    const key = await this.getPendingWorktreeSetupKey(workspacePath);
    const setup = this.pendingWorktreeSetups.get(key);
    if (!setup) return null;
    this.pendingWorktreeSetups.delete(key);

    const { createdAt: _createdAt, ...metadata } = setup;
    return metadata;
  }

  protected onTeardown(): Promise<void> | void {
    this.pendingWorktreeSetups.clear();
    this.worktreeSetupRunner.teardown();
    void this.core.teardownWatchers();
    for (const lspService of this.lspServicesPerPath.values())
      void lspService.teardown();
    this.lspServicesPerPath.clear();
    this.clientRuntimesPerPath.clear();
    this.lspReady.clear();
    this.uiKarton.removeServerProcedureHandler('toolbox.mountWorkspace');
    this.uiKarton.removeServerProcedureHandler('toolbox.unmountWorkspace');
    this.uiKarton.removeServerProcedureHandler('toolbox.listGitBranchesByPath');
    this.uiKarton.removeServerProcedureHandler(
      'toolbox.listGitWorktreesByPath',
    );
    this.uiKarton.removeServerProcedureHandler('toolbox.switchGitBranchByPath');
    this.uiKarton.removeServerProcedureHandler('toolbox.createGitBranchByPath');
    this.uiKarton.removeServerProcedureHandler(
      'toolbox.createGitWorktreeByPath',
    );
    this.uiKarton.removeServerProcedureHandler(
      'toolbox.dismissWorkspaceGitCleanupPrompt',
    );
    this.uiKarton.removeServerProcedureHandler(
      'toolbox.cleanWorkspaceGitWorktrees',
    );
    this.uiKarton.removeServerProcedureHandler(
      'toolbox.listWorkspaceGitBranches',
    );
    this.uiKarton.removeServerProcedureHandler(
      'toolbox.listWorkspaceGitWorktrees',
    );
    this.uiKarton.removeServerProcedureHandler(
      'toolbox.switchWorkspaceGitBranch',
    );
    this.uiKarton.removeServerProcedureHandler(
      'toolbox.createWorkspaceGitBranch',
    );
    this.uiKarton.removeServerProcedureHandler(
      'toolbox.createWorkspaceGitWorktree',
    );
    this.uiKarton.removeServerProcedureHandler('toolbox.searchMentionFiles');
  }
}

// Keep the prefix helper available via the old import path for any
// remaining host-side callers.
export { mountPrefixForPath };
