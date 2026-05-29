import { DisposableService } from '@/services/disposable';
import type { Logger } from '@/services/logger';
import { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import { LspService } from '../lsp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pickOwningWorkspace } from '@/utils/workspace-resolution';
import { createHash } from 'node:crypto';
import chokidar, { type FSWatcher } from 'chokidar';
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
  WorkspaceGitWorktreeDeleteOptions,
  WorkspaceGitWorktreeDeleteResult,
  WorkspaceGitWorktreeDeletionInfo,
  MountEntry,
  WorkspaceGitCreateBranchOptions,
  WorkspaceGitCreateWorktreeOptions,
  WorkspaceGitCreateWorktreeResult,
  WorkspaceGitMutationResult,
} from '@shared/karton-contracts/ui';
import type { WorkspaceSnapshot } from '../../types';
import { FULL_PERMISSIONS, type MountPermission } from '@/services/sandbox/ipc';
import {
  MentionSearchService,
  type MentionSearchContext,
} from './mention-search';
import {
  readWorkspaceMd,
  WORKSPACE_MD_FILENAME,
} from '@/agents/shared/prompts/utils/read-workspace-md';
import { readAgentsMd } from '@/agents/shared/prompts/utils/read-agents-md';
import { getSkills } from '@/agents/shared/prompts/utils/get-skills';
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

function mountPrefixForPath(workspacePath: string): MountPrefix {
  const hash = createHash('sha256')
    .update(workspacePath)
    .digest('hex')
    .slice(0, 4);
  return `w${hash}`;
}

export type MountedClientRuntimes = Map<MountPrefix, ClientRuntimeNode>;
export type MountedLspServices = Map<MountPrefix, LspService>;

// Re-export the canonical workspace resolver so the existing import
// path `from '@/services/toolbox/services/mount-manager'` keeps
// working for code that already uses it (including this file's own
// tests). The single implementation lives in the shared utility at
// `@/utils/workspace-resolution` so `DiffHistoryService` can use it
// too without introducing a toolbox→diff-history import cycle.
export { pickOwningWorkspace } from '@/utils/workspace-resolution';

export class MountManagerService extends DisposableService {
  private readonly logger: Logger;
  private readonly filePickerService: FilePickerService;
  private readonly userExperienceService: UserExperienceService;
  private readonly uiKarton: KartonService;
  private readonly telemetryService: TelemetryService;
  private readonly gitService: GitService;
  private readonly preferencesService: PreferencesService;
  private readonly mentionSearch: MentionSearchService;
  private readonly resolvedEnvPromise: Promise<Record<string, string> | null>;
  private readonly worktreeSetupRunner: WorktreeSetupRunner;
  private readonly pendingWorktreeSetups = new Map<
    string,
    PendingWorktreeSetup
  >();
  private onMountsChanged?: (agentInstanceId: string) => void;
  private getWorkspaceLastUsedAtByPath: (
    workspacePaths: string[],
  ) => Promise<Map<string, number>> = async () => new Map();

  private agentMounts: Map<
    AgentInstanceId,
    Map<MountPrefix, MountPermission[]>
  > = new Map();
  private workspacePathsPerMount: Map<MountPrefix, WorkspacePath> = new Map();

  private clientRuntimesPerPath: Map<string, ClientRuntimeNode> = new Map();
  private lspServicesPerPath: Map<string, LspService> = new Map();

  /** Promise that resolves when LSP service is ready (or null if no workspace) */
  private lspReady: Map<string, Promise<LspService | null>> = new Map();

  /** Per-workspace chokidar watchers for reactive skill/MD file updates */
  private watchersPerPath: Map<WorkspacePath, FSWatcher> = new Map();
  private watcherDebounceTimers: Map<
    WorkspacePath,
    ReturnType<typeof setTimeout>
  > = new Map();

  public constructor(
    logger: Logger,
    filePickerService: FilePickerService,
    userExperienceService: UserExperienceService,
    uiKarton: KartonService,
    telemetryService: TelemetryService,
    gitService: GitService,
    preferencesService: PreferencesService,
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

    const searchCtx: MentionSearchContext = {
      getWorkspacePathForPrefix: (prefix) =>
        this.workspacePathsPerMount.get(prefix),
      getClientRuntimeForPrefix: (prefix) => {
        const wsPath = this.workspacePathsPerMount.get(prefix);
        return wsPath ? this.clientRuntimesPerPath.get(wsPath) : undefined;
      },
      getToolboxState: (agentInstanceId) =>
        this.uiKarton.state.toolbox[agentInstanceId],
      getMountPrefixes: (agentInstanceId) => {
        const mounts = this.agentMounts.get(agentInstanceId);
        return mounts ? [...mounts.keys()] : undefined;
      },
    };
    this.mentionSearch = new MentionSearchService(logger, searchCtx);
  }

  public static async create(
    logger: Logger,
    filePickerService: FilePickerService,
    userExperienceService: UserExperienceService,
    uiKarton: KartonService,
    telemetryService: TelemetryService,
    gitService: GitService,
    preferencesService: PreferencesService,
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
      'toolbox.getGitRepositoryRemoteUrlByPath',
      async (_callingClientId: string, workspacePath: string) => {
        return this.getGitRepositoryRemoteUrlByPath(workspacePath);
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
      'toolbox.getGitWorktreeDeletionInfo',
      async (_callingClientId: string, workspacePath: string) => {
        return this.getGitWorktreeDeletionInfo(workspacePath);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.deleteGitWorktreeByPath',
      async (
        _callingClientId: string,
        workspacePath: string,
        options?: WorkspaceGitWorktreeDeleteOptions,
      ) => {
        return this.deleteGitWorktreeByPath(workspacePath, options);
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

    for (const mountedPath of this.workspacePathsPerMount.values()) {
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

  private async getGitRepositoryRemoteUrlByPath(
    workspacePath: string,
  ): Promise<string | null> {
    if (!(await this.isTrustedGitPath(workspacePath))) return null;
    return this.gitService.getRepositoryRemoteUrl(workspacePath);
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

    if (!this.clientRuntimesPerPath.has(resolvedWorkspacePath)) {
      this.clientRuntimesPerPath.set(
        resolvedWorkspacePath,
        new ClientRuntimeNode({
          workingDirectory: resolvedWorkspacePath,
          rgBinaryBasePath: getRipgrepBasePath(),
        }),
      );
      const resolvedEnv = await this.resolvedEnvPromise;
      const lspPromise = LspService.create(
        this.logger,
        this.clientRuntimesPerPath.get(resolvedWorkspacePath)!,
        resolvedEnv,
      );
      this.lspReady.set(resolvedWorkspacePath, lspPromise);
      const lspService = await lspPromise;
      this.lspServicesPerPath.set(resolvedWorkspacePath, lspService);

      this.startWorkspaceWatcher(
        resolvedWorkspacePath,
        this.clientRuntimesPerPath.get(resolvedWorkspacePath)!,
      );
    }

    await this.userExperienceService.saveRecentlyOpenedWorkspace({
      path: resolvedWorkspacePath,
      name: path.basename(resolvedWorkspacePath),
      openedAt: Date.now(),
    });

    if (!this.uiKarton.state.toolbox[agentInstanceId]) {
      this.uiKarton.setState((draft: KartonStateDraft) => {
        draft.toolbox[agentInstanceId] = {
          workspace: { mounts: [] },
          pendingFileDiffs: [],
          editSummary: [],
          pendingUserQuestion: null,
        };
      });
    }

    const mounts =
      this.agentMounts.get(agentInstanceId) ??
      new Map<MountPrefix, MountPermission[]>();
    const alreadyMounted = [...mounts.keys()].some(
      (prefix) =>
        this.workspacePathsPerMount.get(prefix) === resolvedWorkspacePath,
    );
    if (alreadyMounted) return;

    const prefix = mountPrefixForPath(resolvedWorkspacePath);
    mounts.set(prefix, resolvedPermissions);
    this.agentMounts.set(agentInstanceId, mounts);
    this.workspacePathsPerMount.set(prefix, resolvedWorkspacePath);

    const clientRuntime = this.clientRuntimesPerPath.get(
      resolvedWorkspacePath,
    )!;

    const [workspaceMdContent, agentsMdContent, skills] = await Promise.all([
      readWorkspaceMd(resolvedWorkspacePath),
      readAgentsMd(clientRuntime),
      getSkills(clientRuntime),
    ]);
    const git = await this.gitService.getMountedWorkspaceSummary(
      resolvedWorkspacePath,
    );

    this.uiKarton.setState((draft: KartonStateDraft) => {
      draft.toolbox[agentInstanceId].workspace.mounts.push({
        prefix,
        path: resolvedWorkspacePath,
        git,
        skills: skills.map((s) => ({
          name: s.name,
          description: s.description,
        })),
        workspaceMdContent,
        agentsMdContent,
      });
    });

    this.onMountsChanged?.(agentInstanceId);

    const pendingSetup = await this.takePendingWorktreeSetup(
      resolvedWorkspacePath,
    );
    if (pendingSetup) {
      void this.worktreeSetupRunner.start(pendingSetup);
    }

    const agentType =
      this.uiKarton.state.agents.instances[agentInstanceId]?.type ?? 'unknown';
    this.telemetryService.capture('workspace-mounted', {
      agent_type: agentType,
      agent_instance_id: agentInstanceId,
    });
  }

  public async handleUnmountWorkspace(
    agentInstanceId: string,
    mountPrefix: string,
  ): Promise<void> {
    const agentType =
      this.uiKarton.state.agents.instances[agentInstanceId]?.type ?? 'unknown';
    const mounts = this.agentMounts.get(agentInstanceId);
    if (!mounts?.has(mountPrefix)) return;

    mounts.delete(mountPrefix);
    this.releaseMountIfUnused(mountPrefix);

    this.uiKarton.setState((draft: KartonStateDraft) => {
      draft.toolbox[agentInstanceId].workspace.mounts = draft.toolbox[
        agentInstanceId
      ].workspace.mounts.filter((m: MountEntry) => m.prefix !== mountPrefix);
    });

    this.onMountsChanged?.(agentInstanceId);
    this.telemetryService.capture('workspace-unmounted', {
      agent_type: agentType,
      agent_instance_id: agentInstanceId,
    });
  }

  /**
   * If `mountPrefix` is no longer referenced by any agent, tears down
   * all resources keyed on its workspace path: watcher, LSP service,
   * client runtime, and the `workspacePathsPerMount` entry itself.
   *
   * Central helper for both `handleUnmountWorkspace` (explicit unmount)
   * and `clearAgentMounts` (agent teardown). Without this cleanup in
   * `clearAgentMounts`, orphaned workspace paths would stick around in
   * `workspacePathsPerMount` indefinitely, which (a) leaks watchers /
   * LSP processes across the app session and (b) causes
   * `getAllMountedPaths()` to return stale roots, making
   * `DiffHistoryService.findWorkspaceRoot` pick the wrong workspace's
   * `.gitignore` matcher for later edits.
   */
  private releaseMountIfUnused(mountPrefix: string): void {
    const stillInUse = [...this.agentMounts.values()].some((m) =>
      m.has(mountPrefix),
    );
    if (stillInUse) return;
    const workspacePath = this.workspacePathsPerMount.get(mountPrefix);
    if (!workspacePath) return;
    this.workspacePathsPerMount.delete(mountPrefix);
    this.stopWorkspaceWatcher(workspacePath);
    const lspService = this.lspServicesPerPath.get(workspacePath);
    if (lspService) {
      // Fire-and-forget is fine here — the workspace is already
      // detached. But the rejection must be caught so it doesn't
      // surface as an unhandled rejection when a client teardown
      // races the server exit.
      lspService.teardown().catch((err) => {
        this.logger.warn(
          `[MountManager] Failed to teardown LSP for ${workspacePath}`,
          err,
        );
      });
    }
    this.clientRuntimesPerPath.delete(workspacePath);
    this.lspServicesPerPath.delete(workspacePath);
    this.lspReady.delete(workspacePath);
  }

  public getMountedPathsWithRuntimes(agentInstanceId: string): Array<{
    prefix: string;
    path: string;
    permissions: MountPermission[];
    clientRuntime: ClientRuntimeNode;
  }> {
    const mounts = this.agentMounts.get(agentInstanceId);
    if (!mounts) return [];
    const result: Array<{
      prefix: string;
      path: string;
      permissions: MountPermission[];
      clientRuntime: ClientRuntimeNode;
    }> = [];
    for (const [prefix, permissions] of mounts) {
      const wsPath = this.workspacePathsPerMount.get(prefix);
      const rt = wsPath ? this.clientRuntimesPerPath.get(wsPath) : undefined;
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
    const mounts = this.agentMounts.get(agentInstanceId);
    if (!mounts) return undefined;
    const candidates: string[] = [];
    for (const prefix of mounts.keys()) {
      const wsPath = this.workspacePathsPerMount.get(prefix);
      if (wsPath) candidates.push(wsPath);
    }
    return pickOwningWorkspace(filePath, candidates);
  }

  public getAllMountedPaths(): Set<string> {
    return new Set(this.workspacePathsPerMount.values());
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

  private async getGitWorktreeDeletionInfo(
    workspacePath: string,
  ): Promise<WorkspaceGitWorktreeDeletionInfo | null> {
    if (!(await this.isTrustedGitPath(workspacePath))) return null;

    const resolvedWorkspacePath = await safeRealpath(workspacePath);
    if (!resolvedWorkspacePath) return null;

    const summary = await this.gitService.getMountedWorkspaceSummary(
      resolvedWorkspacePath,
    );
    if (!summary?.isWorktree) return null;

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
    if (!currentWorktree) return null;

    const status = await this.gitService.getWorktreeStatus(
      resolvedWorkspacePath,
    );

    return {
      path: resolvedWorkspacePath,
      branch: currentWorktree.branch,
      isMainWorktree: currentWorktree.isMainWorktree,
      status,
      hasUncommittedChanges: status?.dirty ?? true,
    };
  }

  private async deleteGitWorktreeByPath(
    workspacePath: string,
    options: WorkspaceGitWorktreeDeleteOptions = {},
  ): Promise<WorkspaceGitWorktreeDeleteResult> {
    const info = await this.getGitWorktreeDeletionInfo(workspacePath);
    if (!info) {
      return { ok: false, message: 'Worktree is no longer available.' };
    }
    if (info.isMainWorktree) {
      return { ok: false, message: 'Cannot delete the root worktree.' };
    }
    if (info.hasUncommittedChanges && !options.force) {
      return {
        ok: false,
        message: 'Worktree has uncommitted changes. Confirm force deletion.',
      };
    }

    const result = await this.gitService.removeWorktree(info.path, {
      force: options.force,
    });
    if (!result.ok) return result;

    // The worktree directory no longer exists on disk. Detach it from
    // every agent that still mounts it so the sidebar stops showing the
    // dead path and follow-up actions (open path, create agent) can't
    // target a workspace that's gone. Agents themselves are preserved.
    await this.detachWorkspacePathFromAgents(info.path);

    this.uiKarton.setState((draft: KartonStateDraft) => {
      draft.workspaceGitCleanup.candidates =
        draft.workspaceGitCleanup.candidates.filter(
          (candidate: WorkspaceGitCleanupCandidate) =>
            candidate.path !== info.path,
        );
    });

    return { ok: true, path: info.path, branch: info.branch };
  }

  /**
   * Removes every active mount that points at `workspacePath` from all
   * agents — both the internal runtime maps (so watcher / LSP / runtime
   * resources are released via `releaseMountIfUnused`) and the Karton UI
   * state (so the sidebar stops grouping agents under the now-deleted
   * path). Agents themselves are intentionally preserved; an agent left
   * with no remaining mounts simply moves to the "No workspace" group.
   *
   * Paths are compared after `realpath` resolution because mount paths
   * may differ from `workspacePath` by symlink or trailing separators.
   * Returns the distinct agent instance ids that lost a mount.
   */
  private async detachWorkspacePathFromAgents(
    workspacePath: string,
  ): Promise<string[]> {
    const resolvedTarget =
      (await safeRealpath(workspacePath)) ?? path.resolve(workspacePath);

    const affected: Array<{ agentId: string; prefix: string }> = [];
    for (const [agentId, mounts] of this.agentMounts) {
      for (const prefix of mounts.keys()) {
        const mountedPath = this.workspacePathsPerMount.get(prefix);
        if (!mountedPath) continue;
        const resolvedMounted =
          (await safeRealpath(mountedPath)) ?? path.resolve(mountedPath);
        if (resolvedMounted === resolvedTarget) {
          affected.push({ agentId, prefix });
        }
      }
    }

    if (affected.length === 0) return [];

    for (const { agentId, prefix } of affected) {
      this.agentMounts.get(agentId)?.delete(prefix);
      this.releaseMountIfUnused(prefix);
    }

    this.uiKarton.setState((draft: KartonStateDraft) => {
      for (const { agentId, prefix } of affected) {
        const toolbox = draft.toolbox[agentId];
        if (!toolbox) continue;
        toolbox.workspace.mounts = toolbox.workspace.mounts.filter(
          (mount: MountEntry) => mount.prefix !== prefix,
        );
      }
    });

    const affectedAgentIds = [...new Set(affected.map((a) => a.agentId))];
    for (const agentId of affectedAgentIds) {
      this.onMountsChanged?.(agentId);
    }
    return affectedAgentIds;
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
    for (const mountedPath of this.workspacePathsPerMount.values()) {
      const normalizedMountedPath =
        (await safeRealpath(mountedPath)) ?? path.resolve(mountedPath);
      if (normalizedMountedPath === normalizedPath) return true;
    }
    return false;
  }

  public getMountedRuntimes(agentInstanceId: string): MountedClientRuntimes {
    const mounts = this.agentMounts.get(agentInstanceId);
    const result: MountedClientRuntimes = new Map();
    for (const prefix of mounts?.keys() ?? []) {
      const wsPath = this.workspacePathsPerMount.get(prefix);
      if (!wsPath) continue;
      const rt = this.clientRuntimesPerPath.get(wsPath);
      if (rt) result.set(prefix, rt);
    }
    return result;
  }

  public getMountedLspServices(agentInstanceId: string): MountedLspServices {
    const mounts = this.agentMounts.get(agentInstanceId);
    const result: MountedLspServices = new Map();
    for (const prefix of mounts?.keys() ?? []) {
      const wsPath = this.workspacePathsPerMount.get(prefix);
      if (!wsPath) continue;
      const lsp = this.lspServicesPerPath.get(wsPath);
      if (lsp) result.set(prefix, lsp);
    }
    return result;
  }

  public clearAgentMounts(agentInstanceId: string): void {
    const mounts = this.agentMounts.get(agentInstanceId);
    this.agentMounts.delete(agentInstanceId);
    if (!mounts) return;
    // Release every mount this agent was holding so orphaned
    // workspace paths (and their watcher / LSP / runtime state) do
    // not leak when an agent is torn down without going through
    // `handleUnmountWorkspace` first. See `releaseMountIfUnused`.
    for (const prefix of mounts.keys()) this.releaseMountIfUnused(prefix);
  }

  public setWorkspaceMdContent(
    workspacePath: string,
    content: string | null,
  ): void {
    this.uiKarton.setState((draft: KartonStateDraft) => {
      for (const agentId in draft.toolbox) {
        const mounts = draft.toolbox[agentId].workspace.mounts;
        for (const mount of mounts)
          if (mount.path === workspacePath) mount.workspaceMdContent = content;
      }
    });
  }

  public getClientRuntimeForPath(
    wsPath: string,
  ): ClientRuntimeNode | undefined {
    return this.clientRuntimesPerPath.get(wsPath);
  }

  public getWorkspaceSnapshot(agentInstanceId: string): WorkspaceSnapshot {
    const mounts = this.agentMounts.get(agentInstanceId);
    if (!mounts || mounts.size === 0) return { mounts: [] };

    return {
      mounts: [...mounts.entries()]
        .map(([prefix, permissions]) => ({
          prefix,
          path: this.workspacePathsPerMount.get(prefix) ?? '',
          permissions,
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
      this.report(err as Error, 'syncFileWithLsp', { path: filePath });
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
      this.report(err as Error, 'syncFileCloseWithLsp', {
        path: filePath,
      });
    }
  }

  /**
   * Watches the workspace root for changes to skills and MD files.
   *
   * We watch the root with an `ignored` filter rather than specific subdirectory
   * paths because chokidar v4 silently drops non-existent watch targets. By
   * watching the root, we reliably detect newly created directories (e.g. when
   * `.stagewise/skills/` is created for the first time).
   *
   * The `ignored` filter aggressively prunes the tree at depth 1 so only
   * `.stagewise/`, `.agents/`, and `AGENTS.md` are traversed — keeping the
   * number of active fs.watch handles to ~15-20 regardless of workspace size.
   */
  private startWorkspaceWatcher(
    wsPath: WorkspacePath,
    clientRuntime: ClientRuntimeNode,
  ): void {
    if (this.watchersPerPath.has(wsPath)) return;

    const allowedTopLevel = new Set([
      '.stagewise',
      '.agents',
      '.git',
      'AGENTS.md',
    ]);
    const allowedChildren: Record<string, Set<string>> = {
      '.stagewise': new Set(['skills', WORKSPACE_MD_FILENAME]),
      '.agents': new Set(['skills']),
      '.git': new Set(['HEAD']),
    };

    const watcher = chokidar.watch(wsPath, {
      persistent: true,
      ignoreInitial: true,
      // depth 4 = .stagewise/skills/<skill-name>/SKILL.md
      depth: 4,
      awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
      ignored: (filePath: string) => {
        if (filePath === wsPath) return false;
        const rel = path.relative(wsPath, filePath);
        const segments = rel.split(path.sep);
        if (segments.length === 1) return !allowedTopLevel.has(segments[0]);
        if (segments.length === 2) {
          const allowed = allowedChildren[segments[0]];
          return !allowed?.has(segments[1]);
        }
        return !(
          (segments[0] === '.stagewise' || segments[0] === '.agents') &&
          segments[1] === 'skills'
        );
      },
    });

    const scheduleRefresh = () => {
      const existing = this.watcherDebounceTimers.get(wsPath);
      if (existing) clearTimeout(existing);
      this.watcherDebounceTimers.set(
        wsPath,
        setTimeout(() => {
          this.watcherDebounceTimers.delete(wsPath);
          void this.refreshWorkspaceInfo(wsPath, clientRuntime);
        }, 400),
      );
    };

    watcher
      .on('add', scheduleRefresh)
      .on('change', scheduleRefresh)
      .on('unlink', scheduleRefresh)
      .on('addDir', scheduleRefresh)
      .on('unlinkDir', scheduleRefresh)
      .on('error', (error) => {
        this.logger.debug('[MountManager] Workspace watcher error', {
          error,
          path: wsPath,
        });
      });

    this.watchersPerPath.set(wsPath, watcher);
    this.logger.debug('[MountManager] Started workspace watcher', {
      path: wsPath,
    });
  }

  private stopWorkspaceWatcher(wsPath: WorkspacePath): void {
    const timer = this.watcherDebounceTimers.get(wsPath);
    if (timer) {
      clearTimeout(timer);
      this.watcherDebounceTimers.delete(wsPath);
    }
    const watcher = this.watchersPerPath.get(wsPath);
    if (watcher) {
      void watcher.close();
      this.watchersPerPath.delete(wsPath);
      this.logger.debug('[MountManager] Stopped workspace watcher', {
        path: wsPath,
      });
    }
  }

  /** Re-reads skills and MD files from disk, then pushes updated data to UI state. */
  private async refreshWorkspaceInfo(
    wsPath: WorkspacePath,
    clientRuntime: ClientRuntimeNode,
  ): Promise<void> {
    try {
      const [workspaceMdContent, agentsMdContent, skills] = await Promise.all([
        readWorkspaceMd(wsPath),
        readAgentsMd(clientRuntime),
        getSkills(clientRuntime),
      ]);

      const skillEntries = skills.map((s) => ({
        name: s.name,
        description: s.description,
      }));

      const git = await this.gitService.getMountedWorkspaceSummary(wsPath);

      this.uiKarton.setState((draft: KartonStateDraft) => {
        for (const agentId in draft.toolbox) {
          for (const mount of draft.toolbox[agentId].workspace.mounts) {
            if (mount.path !== wsPath) continue;
            mount.skills = skillEntries;
            mount.git = git;
            mount.workspaceMdContent = workspaceMdContent;
            mount.agentsMdContent = agentsMdContent;
          }
        }
      });

      // Skills inside this workspace may have changed (added/removed/edited)
      // — notify every agent that mounts this workspace so the unified
      // slash-command list (`draft.skills`) gets rebuilt. Without this,
      // workspace skill additions only become visible after a
      // mount/unmount or preference change.
      for (const [agentId, mounts] of this.agentMounts) {
        for (const prefix of mounts.keys()) {
          if (this.workspacePathsPerMount.get(prefix) === wsPath) {
            this.onMountsChanged?.(agentId);
            break;
          }
        }
      }
    } catch (error) {
      this.logger.debug('[MountManager] Failed to refresh workspace info', {
        error,
        path: wsPath,
      });
      this.report(error as Error, 'refreshWorkspaceInfo', { path: wsPath });
    }
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

  private report(
    error: Error,
    operation: string,
    extra?: Record<string, unknown>,
  ): void {
    this.telemetryService.captureException(error, {
      service: 'mount-manager',
      operation,
      ...extra,
    });
  }

  protected async onTeardown(): Promise<void> {
    this.pendingWorktreeSetups.clear();
    this.worktreeSetupRunner.teardown();

    for (const wsPath of this.watchersPerPath.keys())
      this.stopWorkspaceWatcher(wsPath);

    // Await every LSP teardown so the overall shutdown chain (main
    // process -> toolbox -> mount-manager -> lsp -> client) is fully
    // sequenced. Per-service rejections are caught individually to
    // prevent one failing LSP from aborting the aggregate teardown.
    const teardownPromises = Array.from(this.lspServicesPerPath.values()).map(
      (lspService) =>
        lspService.teardown().catch((err) => {
          this.logger.warn(
            '[MountManager] Failed to teardown LSP during onTeardown',
            err,
          );
        }),
    );
    await Promise.all(teardownPromises);

    this.lspServicesPerPath.clear();
    this.clientRuntimesPerPath.clear();
    this.uiKarton.removeServerProcedureHandler('toolbox.mountWorkspace');
    this.uiKarton.removeServerProcedureHandler('toolbox.unmountWorkspace');
    this.uiKarton.removeServerProcedureHandler('toolbox.listGitBranchesByPath');
    this.uiKarton.removeServerProcedureHandler(
      'toolbox.listGitWorktreesByPath',
    );
    this.uiKarton.removeServerProcedureHandler(
      'toolbox.getGitRepositoryRemoteUrlByPath',
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
