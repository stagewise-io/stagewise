import { DisposableService } from '@/services/disposable';
import type { Logger } from '@/services/logger';
import { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import { LspService } from '../lsp';
import path from 'node:path';
import { pickOwningWorkspace } from '@/utils/workspace-resolution';
import { createHash } from 'node:crypto';
import chokidar, { type FSWatcher } from 'chokidar';
import type { FilePickerService } from '@/services/file-picker';
import type { KartonService } from '@/services/karton';
import type { UserExperienceService } from '@/services/experience';
import type { TelemetryService } from '@/services/telemetry';
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
import { isGitRepo, getGitBranch } from '@/utils/git-tools';
import { getRipgrepBasePath } from '@/utils/paths';

type AgentInstanceId = string;
type MountPrefix = string;
type WorkspacePath = string;

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
  private readonly mentionSearch: MentionSearchService;
  private readonly resolvedEnvPromise: Promise<Record<string, string> | null>;
  private onMountsChanged?: (agentInstanceId: string) => void;

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
    resolvedEnvPromise?: Promise<Record<string, string> | null>,
  ) {
    super();
    this.logger = logger;
    this.filePickerService = filePickerService;
    this.userExperienceService = userExperienceService;
    this.uiKarton = uiKarton;
    this.telemetryService = telemetryService;
    this.resolvedEnvPromise = resolvedEnvPromise ?? Promise.resolve(null);

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
    resolvedEnvPromise?: Promise<Record<string, string> | null>,
  ): Promise<MountManagerService> {
    const instance = new MountManagerService(
      logger,
      filePickerService,
      userExperienceService,
      uiKarton,
      telemetryService,
      resolvedEnvPromise,
    );
    await instance.initialize();
    return instance;
  }

  public setOnMountsChanged(cb: (agentInstanceId: string) => void) {
    this.onMountsChanged = cb;
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
      this.uiKarton.setState((draft) => {
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
    const gitRepo = isGitRepo(resolvedWorkspacePath);
    const gitBranch = getGitBranch(resolvedWorkspacePath);

    this.uiKarton.setState((draft) => {
      draft.toolbox[agentInstanceId].workspace.mounts.push({
        prefix,
        path: resolvedWorkspacePath,
        isGitRepo: gitRepo,
        gitBranch,
        skills: skills.map((s) => ({
          name: s.name,
          description: s.description,
        })),
        workspaceMdContent,
        agentsMdContent,
      });
    });

    this.onMountsChanged?.(agentInstanceId);

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

    this.uiKarton.setState((draft) => {
      draft.toolbox[agentInstanceId].workspace.mounts = draft.toolbox[
        agentInstanceId
      ].workspace.mounts.filter((m) => m.prefix !== mountPrefix);
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
    this.uiKarton.setState((draft) => {
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

      const gitBranch = getGitBranch(wsPath);

      this.uiKarton.setState((draft) => {
        for (const agentId in draft.toolbox) {
          for (const mount of draft.toolbox[agentId].workspace.mounts) {
            if (mount.path !== wsPath) continue;
            mount.skills = skillEntries;
            mount.gitBranch = gitBranch;
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
    this.uiKarton.removeServerProcedureHandler('toolbox.searchMentionFiles');
  }
}
