import type { Logger } from '@/services/logger';
import {
  getPluginsPath,
  getRipgrepBasePath,
  getAgentAppsDir,
} from '@/utils/paths';
import { syncDerivedState } from '@/utils/sync-derived-state';
import { MountManagerService } from './services/mount-manager';
import type { FilePickerService } from '@/services/file-picker';
import type { UserExperienceService } from '@/services/experience';
import { SandboxService } from '../sandbox';
import { ShellService, detectShell, resolveShellEnv } from './services/shell';
import {
  FULL_PERMISSIONS,
  NON_WORKSPACE_PREFIXES,
  READ_ONLY_PERMISSIONS,
  type MountDescriptor,
} from '../sandbox/ipc';
import type { WorkspaceAgentSettings } from '@shared/karton-contracts/ui/shared-types';
import type { Attachment } from '@shared/karton-contracts/ui/agent/metadata';
import type { KartonService } from '@/services/karton';
import type { GlobalConfigService } from '@/services/global-config';
import { DisposableService } from '@/services/disposable';
import type { DiffHistoryService } from '@/services/diff-history';
import type { WindowLayoutService } from '@/services/window-layout';
import { getBrowserSessionId } from '@/services/window-layout/browser-session';
import type { AuthService } from '@/services/auth';
import type { TelemetryService } from '@/services/telemetry';
import type { CredentialsService } from '@/services/credentials';
import type { CredentialTypeId } from '@shared/credential-types';
import { createAuthenticatedClient } from './utils/create-authenticated-client';
import { createFileDiffHandler } from './utils/sandbox-callbacks';
import { deleteAgentBlobs, getAgentBlobDir } from '@/utils/attachment-blobs';
import { getDataRoot, getPlansDir, getTempRoot } from '@/utils/paths';
import { mkdirSync } from 'node:fs';
import type { ApiClient } from '@stagewise/api-client';
import {
  deleteFileToolExecute,
  DESCRIPTION as DELETE_FILE_DESCRIPTION,
} from './tools/file-modification/delete-file';
import { glob as globTool } from './tools/file-modification/glob';
import { readFile as readFileTool } from './tools/file-modification/read-file';
import { getLintingDiagnostics as getLintingDiagnosticsTool } from './tools/file-modification/get-linting-diagnostics';
import { listLibraryDocs as listLibraryDocsTool } from './tools/research/list-library-docs';
import { searchInLibraryDocs as searchInLibraryDocsTool } from './tools/research/search-in-library-docs';
import {
  overwriteFileToolExecute,
  DESCRIPTION as OVERWRITE_FILE_DESCRIPTION,
} from './tools/file-modification/overwrite-file';
import { listFiles as listFilesTool } from './tools/file-modification/list-files';
import {
  multiEditToolExecute,
  DESCRIPTION as MULTI_EDIT_DESCRIPTION,
} from './tools/file-modification/multi-edit';
import { grepSearch as grepSearchTool } from './tools/file-modification/grep-search';
import { executeSandboxJs as executeSandboxJsTool } from './tools/browser/execute-sandbox-js';
import { executeShellCommand as executeShellCommandTool } from './tools/shell/execute-shell-command';
import { readConsoleLogs as readConsoleLogsTool } from './tools/browser/read-console-logs';
import {
  askUserQuestions as askUserQuestionsTool,
  advanceOrCompleteQuestion,
  cancelQuestion,
  goBackQuestion,
  cleanupQuestionsForAgent,
} from './tools/user-interaction/ask-user-questions';
import { type Tool, tool } from 'ai';
import {
  buildAgentFileEditContent,
  captureFileState,
  cleanupTempFile,
  type MountedClientRuntimes,
} from './utils';
import path from 'node:path';
import type { z } from 'zod';
import {
  deleteFileToolInputSchema,
  multiEditToolInputSchema,
  overwriteFileToolInputSchema,
  type StagewiseToolSet,
  type QuestionAnswerValue,
} from '@shared/karton-contracts/ui/agent/tools/types';
import type { BrowserSnapshot, WorkspaceSnapshot } from './types';
import type {
  EnvironmentSnapshot,
  MountPermission,
} from '@shared/karton-contracts/ui/agent/metadata';
import { createEnvironmentDiffSnapshot } from '@/services/diff-history/utils/diff';
import type { WorkspaceInfo } from '@/agents/shared/prompts/utils/workspace-info';
import { getWorkspaceInfo as getWorkspaceInfoUtil } from '@/agents/shared/prompts/utils/workspace-info';
import { readAgentsMd } from '@/agents/shared/prompts/utils/read-agents-md';
import {
  readWorkspaceMd,
  WORKSPACE_MD_DIR,
  WORKSPACE_MD_FILENAME,
} from '@/agents/shared/prompts/utils/read-workspace-md';
import type { ContextFilesResult } from '@shared/karton-contracts/pages-api/types';
import {
  getSkills,
  discoverSkills,
} from '@/agents/shared/prompts/utils/get-skills';
import type { SkillDefinition } from '@shared/skills';
import { toSkillDefinitionUI } from '@shared/skills';
import { readPlans } from '@/agents/shared/prompts/utils/read-plans';
import { PLANS_PREFIX, getAgentOwnedPlanPaths } from '@shared/plan-ownership';
import { resolveMountedRelativePath } from './utils/path-mounting';
import { normalizePath } from '@shared/path-utils';
import { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import chokidar, { type FSWatcher } from 'chokidar';

type MountedPrefix = string;
type MountedPath = string;

export class ToolboxService extends DisposableService {
  private readonly logger: Logger;
  private readonly uiKarton: KartonService;
  private readonly globalConfigService: GlobalConfigService;
  private readonly diffHistoryService: DiffHistoryService;
  private readonly windowLayoutService: WindowLayoutService;
  private readonly authService: AuthService;
  private readonly telemetryService: TelemetryService;
  private readonly filePickerService: FilePickerService;
  private readonly userExperienceService: UserExperienceService;
  private readonly credentialsService: CredentialsService;

  private sandboxService: SandboxService | null = null;
  private shellService: ShellService | null = null;
  private pluginsRuntime: ClientRuntimeNode | null = null;
  private appsRuntimes = new Map<string, ClientRuntimeNode>();

  private mountManagerService: MountManagerService | null = null;
  private unsubPreferenceSync: (() => void) | null = null;

  /** Cached API client - recreated when auth changes */
  private apiClient: ApiClient | null = null;

  public get globalDataPath(): string {
    return getDataRoot();
  }

  /**
   * Returns the mounted runtimes for the agent, including the
   * read-only plugins runtime and the per-agent apps runtime.
   */
  private getAllMountedRuntimes(
    agentInstanceId: string,
  ): MountedClientRuntimes | undefined {
    const runtimes =
      this.mountManagerService?.getMountedRuntimes(agentInstanceId);
    if (!runtimes) return undefined;
    if (this.pluginsRuntime) runtimes.set('plugins', this.pluginsRuntime);
    runtimes.set('apps', this.getOrCreateAppsRuntime(agentInstanceId));
    runtimes.set(PLANS_PREFIX, this.getOrCreatePlansRuntime());
    return runtimes;
  }

  /** Builtin commands discovered at startup — stored for refresh merging. */
  private builtinSkills: SkillDefinition[] = [];

  private plansRuntime: ClientRuntimeNode | null = null;
  private plansWatcher: FSWatcher | null = null;
  private plansWatcherDebounce: ReturnType<typeof setTimeout> | null = null;

  private getOrCreatePlansRuntime(): ClientRuntimeNode {
    if (this.plansRuntime) return this.plansRuntime;
    const plansDir = getPlansDir();
    mkdirSync(plansDir, { recursive: true });
    this.plansRuntime = new ClientRuntimeNode({
      workingDirectory: plansDir,
      rgBinaryBasePath: getRipgrepBasePath(),
    });
    return this.plansRuntime;
  }

  private getOrCreateAppsRuntime(agentInstanceId: string): ClientRuntimeNode {
    const existing = this.appsRuntimes.get(agentInstanceId);
    if (existing) return existing;
    const appsDir = getAgentAppsDir(agentInstanceId);
    mkdirSync(appsDir, { recursive: true });
    const runtime = new ClientRuntimeNode({
      workingDirectory: appsDir,
      rgBinaryBasePath: getRipgrepBasePath(),
    });
    this.appsRuntimes.set(agentInstanceId, runtime);
    return runtime;
  }

  /** Temp directory for capturing file state (external/binary files) */
  private get tempDir(): string {
    return path.join(getTempRoot(), 'agent-temp-files');
  }

  private constructor(
    logger: Logger,
    uiKarton: KartonService,
    globalConfigService: GlobalConfigService,
    diffHistoryService: DiffHistoryService,
    windowLayoutService: WindowLayoutService,
    authService: AuthService,
    telemetryService: TelemetryService,
    filePickerService: FilePickerService,
    userExperienceService: UserExperienceService,
    credentialsService: CredentialsService,
  ) {
    super();
    this.logger = logger;
    this.uiKarton = uiKarton;
    this.globalConfigService = globalConfigService;
    this.diffHistoryService = diffHistoryService;
    this.windowLayoutService = windowLayoutService;
    this.authService = authService;
    this.telemetryService = telemetryService;
    this.filePickerService = filePickerService;
    this.userExperienceService = userExperienceService;
    this.credentialsService = credentialsService;
  }

  public static async create(
    logger: Logger,
    uiKarton: KartonService,
    globalConfigService: GlobalConfigService,
    diffHistoryService: DiffHistoryService,
    windowLayoutService: WindowLayoutService,
    authService: AuthService,
    telemetryService: TelemetryService,
    filePickerService: FilePickerService,
    userExperienceService: UserExperienceService,
    credentialsService: CredentialsService,
  ): Promise<ToolboxService> {
    const instance = new ToolboxService(
      logger,
      uiKarton,
      globalConfigService,
      diffHistoryService,
      windowLayoutService,
      authService,
      telemetryService,
      filePickerService,
      userExperienceService,
      credentialsService,
    );
    await instance.initialize();
    return instance;
  }

  private report(
    error: Error,
    operation: string,
    extra?: Record<string, unknown>,
  ) {
    this.telemetryService.captureException(error, {
      service: 'toolbox',
      operation,
      ...extra,
    });
  }

  /**
   * Wraps a file-modifying tool to capture before/after state and register with diff-history.
   *
   * @param description - Tool description for AI SDK
   * @param inputSchema - Zod schema for tool input (must have relative_path field)
   * @param executeFn - The actual tool execute function
   * @param agentInstanceId - The agent instance ID for diff-history attribution
   * @returns A wrapped tool that registers edits with diff-history
   */
  private wrapFileModifyingTool<TParams extends { relative_path: string }>(
    description: string,
    inputSchema: z.ZodType<TParams>,
    executeFn: (
      params: TParams,
      mountedRuntimes: MountedClientRuntimes,
    ) => Promise<unknown>,
    agentInstanceId: string,
  ) {
    // Cast to any to bypass AI SDK's strict FlexibleSchema type inference
    // The schemas are validated Zod schemas that work correctly at runtime
    return tool({
      description,
      inputSchema: inputSchema as z.ZodType<TParams>,
      strict: true,
      execute: async (params, options) => {
        const mountedRuntimes = this.getAllMountedRuntimes(agentInstanceId);
        if (!mountedRuntimes) throw new Error('No mounted workspaces found');

        const mountPrefix = normalizePath(params.relative_path).split('/')[0];
        if (NON_WORKSPACE_PREFIXES.has(mountPrefix))
          return executeFn(params, mountedRuntimes);

        const { clientRuntime, relativePath } = resolveMountedRelativePath(
          mountedRuntimes,
          params.relative_path,
        );
        const { toolCallId } = options as { toolCallId: string };
        const absolutePath = clientRuntime.fileSystem.resolvePath(relativePath);

        const beforeState = await captureFileState(absolutePath, this.tempDir);
        this.diffHistoryService.ignoreFileForWatcher(absolutePath);
        // Execute the actual tool
        const result = await executeFn(params, mountedRuntimes);
        const afterState = await captureFileState(absolutePath, this.tempDir);

        // Build AgentFileEdit and register with diff-history
        try {
          const { editContent, tempFilesToCleanup } =
            await buildAgentFileEditContent(
              beforeState,
              afterState,
              this.tempDir,
            );

          // Sync with LSP based on operation type
          // File created/modified - update LSP
          if (!editContent.isExternal && editContent.contentAfter !== null)
            void this.mountManagerService?.syncFileWithLsp(
              agentInstanceId,
              absolutePath,
              editContent.contentAfter,
            );
          // File deleted - close in LSP to clear diagnostics
          else if (
            !editContent.isExternal &&
            editContent.contentBefore !== null
          )
            void this.mountManagerService?.syncFileCloseWithLsp(
              agentInstanceId,
              absolutePath,
            );

          await this.diffHistoryService.registerAgentEdit({
            agentInstanceId,
            path: absolutePath,
            toolCallId,
            ...editContent,
          });

          // Clean up temp files after registration
          for (const tempFile of tempFilesToCleanup)
            void cleanupTempFile(tempFile);
        } catch (error) {
          this.logger.error('[ToolboxService] Failed to register agent edit', {
            error,
            path: absolutePath,
            toolCallId,
          });
          this.report(error as Error, 'registerAgentEdit', {
            path: absolutePath,
            toolCallId,
          });
          // Don't fail the tool execution if diff-history registration fails
        } finally {
          setTimeout(
            () => this.diffHistoryService.unignoreFileForWatcher(absolutePath),
            500,
          );
        }

        // Attach diff data for UI rendering (stripped before LLM sees it)
        const _diff =
          !beforeState.isExternal && !afterState.isExternal
            ? { before: beforeState.content, after: afterState.content }
            : null;

        return { ...(result as object), _diff };
      },
    });
  }

  public async getTool<TToolName extends keyof StagewiseToolSet>(
    tool: TToolName,
    agentInstanceId: string,
  ): Promise<StagewiseToolSet[TToolName] | null>;

  /**
   * Used by the agent to get a tool that can be forwarded to the AI-SDK
   *
   * @param tool - the name of the tool that should be returned
   * @param agentInstanceId - the id of the agent instance that is requesting the tool.
   *                            Should be used to link the following tool calls to the given agent instance.
   *
   * @returns the tool that can be forwarded to the AI-SDK
   *
   * @note In order to get the specific tool call ID, the tool's `execute` function should
   *        look at the `options` parameter which includes the `toolCallId` as a property.
   *
   * @note Based on the here provided `agentInstanceId` and the `toolCallId` provided at time of tool execution,
   *        the toolbox can clearly match a tool call to it's related agent and other tool calls made by the agent.
   */
  public async getTool<TToolName extends keyof StagewiseToolSet>(
    tool: TToolName,
    agentInstanceId: string,
  ): Promise<Tool | null> {
    const mountedRuntimes = this.getAllMountedRuntimes(agentInstanceId);
    if (!mountedRuntimes) return null;

    const mountedLspServices =
      this.mountManagerService?.getMountedLspServices(agentInstanceId);
    if (!mountedLspServices) return null;

    switch (tool) {
      case 'deleteFile':
        if (mountedRuntimes.size === 0) return null;
        return this.wrapFileModifyingTool(
          DELETE_FILE_DESCRIPTION,
          deleteFileToolInputSchema,
          deleteFileToolExecute,
          agentInstanceId,
        );
      case 'glob':
        if (mountedRuntimes.size === 0) return null;
        return globTool(mountedRuntimes);
      case 'grepSearch':
        if (mountedRuntimes.size === 0) return null;
        return grepSearchTool(mountedRuntimes);
      case 'listFiles':
        if (mountedRuntimes.size === 0) return null;
        return listFilesTool(mountedRuntimes);
      case 'multiEdit':
        if (mountedRuntimes.size === 0) return null;
        return this.wrapFileModifyingTool(
          MULTI_EDIT_DESCRIPTION,
          multiEditToolInputSchema,
          multiEditToolExecute,
          agentInstanceId,
        );
      case 'overwriteFile':
        if (mountedRuntimes.size === 0) return null;
        return this.wrapFileModifyingTool(
          OVERWRITE_FILE_DESCRIPTION,
          overwriteFileToolInputSchema,
          overwriteFileToolExecute,
          agentInstanceId,
        );
      case 'readFile':
        if (mountedRuntimes.size === 0) return null;
        return readFileTool(mountedRuntimes);
      case 'listLibraryDocs':
        if (!this.apiClient) return null;
        return listLibraryDocsTool(this.apiClient);
      case 'searchInLibraryDocs':
        if (!this.apiClient) return null;
        return searchInLibraryDocsTool(this.apiClient);
      case 'getLintingDiagnostics': {
        if (!mountedLspServices) return null;
        return getLintingDiagnosticsTool(mountedLspServices);
      }
      case 'executeSandboxJs':
        if (!this.windowLayoutService) return null;
        return executeSandboxJsTool(this.sandboxService!, agentInstanceId);
      case 'readConsoleLogs':
        if (!this.windowLayoutService) return null;
        return readConsoleLogsTool(this.windowLayoutService);
      case 'askUserQuestions':
        return askUserQuestionsTool(this.uiKarton, agentInstanceId);
      case 'executeShellCommand':
        if (!this.shellService?.isAvailable()) return null;
        return executeShellCommandTool(this.shellService, agentInstanceId, () =>
          this.getMountedPathsForAgent(agentInstanceId),
        );
      default:
        this.logger.error('[ToolboxService] Tool not found', { tool });
        return null;
    }
  }

  /**
   * Used by the agent to undo all tool calls given by IDs.
   *
   * @param toolCallIds - the ids of the tool calls that should be undone
   *
   * @note The toolbox should revert all given tool calls by reverting to the
   *        last known state of affected files before the first tool call was executed.
   *
   * @note If multiple given tools calls affect the same file, the toolbox should revert to the previous version
   *        of the earliest related tool call in the list, and all other tool calls affecting the same file
   *        are also to be treated as "reverted".
   */
  public async undoToolCalls(toolCallIds: string[]): Promise<void> {
    return this.diffHistoryService.undoToolCalls(toolCallIds);
  }

  public getWorkspaceSnapshot(agentInstanceId: string): WorkspaceSnapshot {
    return (
      this.mountManagerService?.getWorkspaceSnapshot(agentInstanceId) ?? {
        mounts: [],
      }
    );
  }

  public async handleMountWorkspace(
    agentInstanceId: string,
    workspacePath: string,
    permissions?: MountPermission[],
  ) {
    await this.mountManagerService?.handleMountWorkspace(
      agentInstanceId,
      workspacePath,
      permissions,
    );
  }

  public async handleUnmountWorkspace(
    agentInstanceId: string,
    mountPrefix: string,
  ) {
    await this.mountManagerService?.handleUnmountWorkspace(
      agentInstanceId,
      mountPrefix,
    );
  }

  /**
   * Push current mount configuration for an agent to the sandbox worker
   * so the isolated fs stays in sync.
   */
  private getSandboxMounts(agentInstanceId: string): MountDescriptor[] {
    const mountsWithRt =
      this.mountManagerService?.getMountedPathsWithRuntimes(agentInstanceId);
    const mounts: MountDescriptor[] =
      mountsWithRt?.map((m) => ({
        prefix: m.prefix,
        absolutePath: m.path,
        permissions: m.permissions,
      })) ?? [];

    const attDir = getAgentBlobDir(agentInstanceId);
    mkdirSync(attDir, { recursive: true });
    mounts.push({
      prefix: 'att',
      absolutePath: attDir,
      permissions: READ_ONLY_PERMISSIONS,
    });

    mounts.push({
      prefix: 'plugins',
      absolutePath: getPluginsPath(),
      permissions: READ_ONLY_PERMISSIONS,
    });

    const appsDir = getAgentAppsDir(agentInstanceId);
    mkdirSync(appsDir, { recursive: true });
    mounts.push({
      prefix: 'apps',
      absolutePath: appsDir,
      permissions: FULL_PERMISSIONS,
    });

    return mounts;
  }

  private pushMountsToSandbox(agentInstanceId: string) {
    if (!this.sandboxService) return;
    this.sandboxService.updateAgentMounts(
      agentInstanceId,
      this.getSandboxMounts(agentInstanceId),
    );
  }

  public setWorkspaceMdContent(
    workspacePath: string,
    content: string | null,
  ): void {
    this.mountManagerService?.setWorkspaceMdContent(workspacePath, content);
  }

  public async getWorkspaceInfo(
    agentInstanceId: string,
  ): Promise<WorkspaceInfo[]> {
    const mountsWithRt =
      this.mountManagerService?.getMountedRuntimes(agentInstanceId);
    if (!mountsWithRt) return [];
    if (mountsWithRt.size === 0) return [];
    return Promise.all(
      [...mountsWithRt.values()].map((m) => getWorkspaceInfoUtil(m)),
    );
  }

  public getShellInfo(): { type: string; path: string } | null {
    return this.shellService?.getShellInfo() ?? null;
  }

  public cancelShellCommand(toolCallId: string): void {
    this.shellService?.cancelCommand(toolCallId);
  }

  public getBrowserSnapshot(): BrowserSnapshot {
    const browser = this.uiKarton.state.browser;
    const activeTab = browser.activeTabId
      ? browser.tabs[browser.activeTabId]
      : null;

    const allTabs = Object.values(browser.tabs)
      .sort((a, b) => b.lastFocusedAt - a.lastFocusedAt)
      .map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        error: tab.error
          ? { code: tab.error.code, message: tab.error.message }
          : null,
        consoleLogCount: tab.consoleLogCount,
        consoleErrorCount: tab.consoleErrorCount,
        faviconUrl: tab.faviconUrls?.[0],
        lastFocusedAt: tab.lastFocusedAt,
      }));

    return {
      activeTab: activeTab
        ? {
            id: activeTab.id,
            title: activeTab.title,
            url: activeTab.url,
            error: activeTab.error,
            consoleLogCount: activeTab.consoleLogCount,
            consoleErrorCount: activeTab.consoleErrorCount,
          }
        : null,
      tabs: allTabs,
      totalTabCount: Object.keys(browser.tabs).length,
    };
  }

  public async captureEnvironmentSnapshot(
    agentInstanceId: string,
  ): Promise<EnvironmentSnapshot> {
    const browserState = this.getBrowserSnapshot();
    const workspaceState =
      this.mountManagerService?.getWorkspaceSnapshot(agentInstanceId);
    const toolboxState = this.uiKarton.state.toolbox[agentInstanceId];

    const workspaceMounts = workspaceState?.mounts ?? [];
    const allMounts = [
      ...workspaceMounts,
      {
        prefix: 'att',
        path: getAgentBlobDir(agentInstanceId),
        permissions: [...READ_ONLY_PERMISSIONS] as MountPermission[],
      },
      {
        prefix: 'plugins',
        path: getPluginsPath(),
        permissions: [...READ_ONLY_PERMISSIONS] as MountPermission[],
      },
      {
        prefix: 'apps',
        path: getAgentAppsDir(agentInstanceId),
        permissions: [...FULL_PERMISSIONS] as MountPermission[],
      },
      {
        prefix: PLANS_PREFIX,
        path: getPlansDir(),
        permissions: [...FULL_PERMISSIONS] as MountPermission[],
      },
    ];

    const [agentsMdEntries, workspaceMdEntries, commands, planEntries] =
      await Promise.all([
        this.getAllAgentsMdEntries(agentInstanceId),
        this.getWorkspaceMd(agentInstanceId),
        this.getSkillsList(agentInstanceId),
        this.getPlansList(agentInstanceId),
      ]);

    const mounts =
      this.mountManagerService?.getMountedPathsWithRuntimes(agentInstanceId);
    const respectedMounts: string[] = [];
    if (mounts) {
      for (const mount of mounts) {
        const settings = this.uiKarton.state.preferences?.agent
          ?.workspaceSettings?.[mount.path] ?? {
          respectAgentsMd: false,
          disabledSkills: [],
        };
        if (settings.respectAgentsMd) {
          respectedMounts.push(mount.prefix);
        }
      }
    }

    const snapshot: EnvironmentSnapshot = {
      browser: {
        tabs: browserState.tabs.map((t) => ({
          id: t.id,
          url: t.url,
          title: t.title,
          consoleErrorCount: t.consoleErrorCount,
          consoleLogCount: t.consoleLogCount,
          error: t.error,
          lastFocusedAt: t.lastFocusedAt,
        })),
        activeTabId: browserState.activeTab?.id ?? null,
      },
      workspace: { mounts: allMounts },
      fileDiffs: toolboxState
        ? createEnvironmentDiffSnapshot(
            toolboxState.pendingFileDiffs,
            toolboxState.editSummary,
          )
        : { pending: [], summary: [] },
      sandboxSessionId:
        this.sandboxService?.getSandboxSessionId(agentInstanceId) ?? null,
      activeApp: toolboxState?.activeApp
        ? {
            appId: toolboxState.activeApp.appId,
            pluginId: toolboxState.activeApp.pluginId,
          }
        : null,
      agentsMd: {
        entries: agentsMdEntries.map((e) => ({
          mountPrefix: e.mountPrefix,
          content: e.content,
        })),
        respectedMounts,
      },
      workspaceMd: {
        entries: workspaceMdEntries.map((e) => ({
          mountPrefix: e.mountPrefix,
          content: e.content,
        })),
      },
      enabledSkills: {
        paths: commands
          .filter((c) => c.agentInvocable !== false && c.skillPath)
          .map((c) => c.skillPath!),
      },
      browserSessionId: getBrowserSessionId(),
      plans: {
        entries: planEntries,
      },
    };

    return snapshot;
  }

  /**
   * Store the builtin commands discovered at startup and push the
   * initial commands list to Karton state.
   */
  public setBuiltinSkills(cmds: SkillDefinition[]): void {
    this.builtinSkills = cmds;
    // Push builtins immediately (no workspace skills yet).
    this.uiKarton.setState((draft) => {
      draft.skills = cmds.map(toSkillDefinitionUI);
    });
  }

  /**
   * Rebuild the unified commands list (builtins + workspace skills +
   * plugin skills) for a given agent and push it to Karton state.
   * Called on mount/unmount to keep the slash-command list in sync.
   */
  private async rebuildSkillsList(agentInstanceId: string): Promise<void> {
    const commands = await this.getSkillsList(agentInstanceId);
    this.uiKarton.setState((draft) => {
      draft.skills = commands
        .filter((c) => c.userInvocable !== false)
        .map(toSkillDefinitionUI);
    });
  }

  /**
   * Returns the full `SkillDefinition[]` (with `contentPath`) for
   * the given agent. Used at inference time by `resolveSlashSkill`
   * to read command/skill content from the correct disk path.
   */
  public async getSkillsList(
    agentInstanceId: string,
  ): Promise<SkillDefinition[]> {
    const result: SkillDefinition[] = [...this.builtinSkills];
    const seen = new Set(result.map((c) => c.id));

    // Workspace skills
    const mounts =
      this.mountManagerService?.getMountedPathsWithRuntimes(agentInstanceId);
    if (mounts) {
      for (const mount of mounts) {
        const settings = this.uiKarton.state.preferences?.agent
          ?.workspaceSettings?.[mount.path] ?? {
          respectAgentsMd: false,
          disabledSkills: [],
        };
        const disabled = new Set(settings.disabledSkills);
        const skills = await getSkills(mount.clientRuntime);

        for (const skill of skills) {
          if (disabled.has(skill.name)) continue;
          const id = `skill:${skill.name}`;
          if (seen.has(id)) continue;
          seen.add(id);
          const relativePath = path.relative(mount.path, skill.path);
          result.push({
            id,
            displayName: skill.name,
            description: skill.description,
            source: 'workspace',
            contentPath: path.resolve(skill.path, 'SKILL.md'),
            skillPath: `${mount.prefix}/${relativePath}`,
            workspacePrefix: mount.prefix,
            userInvocable: skill.userInvocable,
            agentInvocable: skill.agentInvocable,
          });
        }
      }
    }

    // Plugin skills
    const disabledPlugins = new Set(
      this.uiKarton.state.preferences?.agent?.disabledPluginIds ?? [],
    );
    const pluginSkills = await discoverSkills(getPluginsPath());
    for (const skill of pluginSkills) {
      const pluginId = path.basename(skill.path);
      if (disabledPlugins.has(pluginId)) continue;
      const id = `plugin:${pluginId}:${skill.name}`;
      if (seen.has(id)) continue;
      seen.add(id);
      result.push({
        id,
        displayName: skill.name,
        description: skill.description,
        source: 'plugin',
        contentPath: path.resolve(skill.path, 'SKILL.md'),
        skillPath: `plugins/${pluginId}/SKILL.md`,
        pluginId,
        userInvocable: skill.userInvocable,
        agentInvocable: skill.agentInvocable,
      });
    }

    return result;
  }

  private async getPlansList(agentInstanceId: string): Promise<
    Array<{
      name: string;
      description: string | null;
      filename: string;
      totalTasks: number;
      completedTasks: number;
      taskGroups: Array<{
        label: string;
        tasks: Array<{ text: string; completed: boolean; depth: number }>;
      }>;
    }>
  > {
    const agentEntry = this.uiKarton.state.agents.instances[agentInstanceId];
    const ownedPaths = agentEntry
      ? getAgentOwnedPlanPaths(agentEntry.state.history)
      : new Set<string>();

    const plans = await readPlans(getPlansDir());
    return plans.filter((plan) => {
      const toolPath = `${PLANS_PREFIX}/${plan.filename}`;
      return ownedPaths.has(toolPath);
    });
  }

  public getWorkspaceAgentSettings(
    agentInstanceId: string,
  ): Map<string, WorkspaceAgentSettings> {
    const mounts =
      this.mountManagerService?.getMountedPathsWithRuntimes(agentInstanceId);
    const result = new Map<string, WorkspaceAgentSettings>();
    for (const mount of mounts ?? []) {
      result.set(
        mount.prefix,
        this.uiKarton.state.preferences?.agent?.workspaceSettings?.[
          mount.path
        ] ?? { respectAgentsMd: false, disabledSkills: [] },
      );
    }
    return result;
  }

  private async getAllAgentsMdEntries(
    agentInstanceId: string,
  ): Promise<Array<{ mountPrefix: string; content: string }>> {
    const mounts =
      this.mountManagerService?.getMountedPathsWithRuntimes(agentInstanceId);
    if (!mounts) return [];
    if (mounts.length === 0) return [];
    const results: Array<{ mountPrefix: string; content: string }> = [];
    for (const mount of mounts) {
      const content = await readAgentsMd(mount.clientRuntime);
      if (content) results.push({ mountPrefix: mount.prefix, content });
    }
    return results;
  }

  public async getWorkspaceMd(
    agentInstanceId: string,
  ): Promise<Array<{ mountPrefix: string; path: string; content: string }>> {
    const mounts =
      this.mountManagerService?.getMountedPathsWithRuntimes(agentInstanceId);
    if (!mounts) return [];
    if (mounts.length === 0) return [];
    const results: Array<{
      mountPrefix: string;
      path: string;
      content: string;
    }> = [];
    for (const mount of mounts) {
      const content = await readWorkspaceMd(mount.path);
      if (content) {
        results.push({
          mountPrefix: mount.prefix,
          path: mount.path,
          content,
        });
      }
    }
    return results;
  }

  public async getContextFilesForAllWorkspaces(): Promise<ContextFilesResult> {
    const uniquePaths = this.mountManagerService?.getAllMountedPaths();
    const result: ContextFilesResult = {};

    await Promise.all(
      [...(uniquePaths ?? [])].map(async (wsPath) => {
        const clientRuntime =
          this.mountManagerService?.getClientRuntimeForPath(wsPath);
        if (!clientRuntime) return;

        const workspaceMdPath = path.resolve(
          wsPath,
          WORKSPACE_MD_DIR,
          WORKSPACE_MD_FILENAME,
        );
        const agentsMdPath = path.resolve(wsPath, 'AGENTS.md');

        const [workspaceMdContent, agentsMdContent] = await Promise.all([
          readWorkspaceMd(wsPath),
          clientRuntime ? readAgentsMd(clientRuntime) : null,
        ]);

        result[wsPath] = {
          workspaceMd: {
            exists: workspaceMdContent !== null,
            path: workspaceMdPath,
            content: workspaceMdContent,
          },
          agentsMd: {
            exists: agentsMdContent !== null,
            path: agentsMdPath,
            content: agentsMdContent,
          },
        };
      }),
    );

    return result;
  }

  /**
   * Get or create an authenticated API client.
   * Returns null if not authenticated.
   */
  private getOrCreateApiClient(): ApiClient | null {
    const accessToken = this.authService.accessToken;
    if (!accessToken) {
      this.apiClient = null;
      return null;
    }

    // Create new client if not cached
    if (!this.apiClient) {
      try {
        this.apiClient = createAuthenticatedClient(accessToken);
      } catch (error) {
        this.logger.error(
          '[ToolboxService] Failed to create authenticated client',
          { error },
        );
        this.report(error as Error, 'createApiClient');
        return null;
      }
    }

    return this.apiClient;
  }

  /**
   * Drains all pending sandbox attachments (created via API.createAttachment()
   * during this step) for the given agent and returns them as a flat array.
   * Clears the pending buffers as a side effect.
   */
  public drainSandboxAttachments(agentInstanceId: string): Attachment[] {
    if (!this.sandboxService) return [];
    return this.sandboxService.drainPendingAttachments(agentInstanceId);
  }

  public getMountedPathsForAgent(
    agentInstanceId: string,
  ): Map<MountedPrefix, MountedPath> {
    const mounts =
      this.mountManagerService?.getMountedPathsWithRuntimes(agentInstanceId);
    if (!mounts) return new Map();
    const result = new Map<MountedPrefix, MountedPath>();
    for (const mount of mounts) result.set(mount.prefix, mount.path);

    return result;
  }

  public getWorkspaceSnapshotForPersistence(
    agentInstanceId: string,
  ): Array<{ path: string; permissions: MountPermission[] }> {
    const mounts =
      this.mountManagerService?.getMountedPathsWithRuntimes(agentInstanceId);
    if (!mounts) return [];
    return mounts.map((m) => ({
      path: m.path,
      permissions: m.permissions,
    }));
  }

  /**
   * Refresh the API client (e.g., after auth state changes).
   * Call this when the auth token is refreshed.
   */
  public refreshApiClient(): void {
    this.apiClient = null;
    this.apiClient = this.getOrCreateApiClient();
  }

  public async acceptAllPendingEditsForAgent(
    agentInstanceId: string,
  ): Promise<void> {
    await this.diffHistoryService.acceptAllPendingEditsForAgent(
      agentInstanceId,
    );
  }

  /**
   * Clear tracking data for a specific agent instance.
   * Call this when an agent session ends.
   */
  /**
   * Cancel any pending user questions for a specific agent instance.
   * Call this when the agent is stopped to dismiss the question UI.
   */
  public cancelPendingQuestions(agentInstanceId: string): void {
    cleanupQuestionsForAgent(agentInstanceId, this.uiKarton);
  }

  /** Resolve a specific pending question with a given reason. */
  public cancelQuestion(
    agentInstanceId: string,
    questionId: string,
    reason: 'user_cancelled' | 'user_sent_message' | 'agent_stopped',
    draftAnswers?: Record<string, QuestionAnswerValue>,
  ): void {
    cancelQuestion(
      questionId,
      reason,
      this.uiKarton,
      agentInstanceId,
      draftAnswers,
    );
  }

  /**
   * Release runtime resources (sandbox, shell, mounts, etc.) for an agent.
   *
   * @param deleteBlobs When `true`, permanently removes the agent's on-disk
   *   attachment blobs.  Pass `false` (or omit) when *archiving* an agent so
   *   that blobs survive for a later `resumeAgent` call.
   */
  public clearAgentTracking(
    agentInstanceId: string,
    { deleteBlobs = false }: { deleteBlobs?: boolean } = {},
  ): void {
    this.mountManagerService?.clearAgentMounts(agentInstanceId);
    this.sandboxService?.destroyAgent(agentInstanceId);
    this.shellService?.destroyAgent(agentInstanceId);
    this.appsRuntimes.delete(agentInstanceId);
    if (deleteBlobs) {
      void deleteAgentBlobs(agentInstanceId);
    }
    this.cancelPendingQuestions(agentInstanceId);
  }

  private async initialize(): Promise<void> {
    this.logger.debug('[ToolboxService] Initializing...');

    const pluginsDir = getPluginsPath();
    this.pluginsRuntime = new ClientRuntimeNode({
      workingDirectory: pluginsDir,
      rgBinaryBasePath: getRipgrepBasePath(),
    });

    // Eagerly initialize the API client if auth is already available
    this.apiClient = this.getOrCreateApiClient();

    // Resolve the user's shell environment once, shared by both ShellService
    // and LSP servers so they can find node/npx/etc. on the real PATH.
    // Kicked off eagerly but NOT awaited here — MountManagerService receives
    // the promise and only awaits it inside handleMountWorkspace() (user-
    // initiated), so env resolution never blocks app startup.
    const detectedShell = detectShell();
    const resolvedEnvPromise: Promise<Record<string, string> | null> =
      detectedShell
        ? resolveShellEnv(detectedShell).catch((err) => {
            this.logger.warn(
              '[ToolboxService] Error resolving shell environment — falling back to process.env',
              err,
            );
            return null;
          })
        : Promise.resolve(null);

    this.mountManagerService = await MountManagerService.create(
      this.logger,
      this.filePickerService,
      this.userExperienceService,
      this.uiKarton,
      this.telemetryService,
      resolvedEnvPromise,
    );

    this.mountManagerService.setOnMountsChanged((agentInstanceId) => {
      this.pushMountsToSandbox(agentInstanceId);
      void this.rebuildSkillsList(agentInstanceId);
    });

    // Rebuild the slash-command list whenever skill/plugin preferences change
    // so toggles in Agent Settings take effect immediately.
    this.unsubPreferenceSync = syncDerivedState(
      this.uiKarton,
      (state) => ({
        ws: state.preferences?.agent?.workspaceSettings,
        plugins: state.preferences?.agent?.disabledPluginIds,
      }),
      () => {
        const activeIds = Object.keys(this.uiKarton.state.agents.instances);
        for (const id of activeIds) void this.rebuildSkillsList(id);
      },
    );

    // Start watching the global plans directory
    this.startPlansWatcher();

    const fileDiffHandler = createFileDiffHandler({
      mountManager: this.mountManagerService,
      diffHistoryService: this.diffHistoryService,
      logger: this.logger,
      telemetryService: this.telemetryService,
    });

    this.sandboxService = await SandboxService.create(
      this.windowLayoutService,
      this.logger,
      fileDiffHandler,
      (agentId) => this.getSandboxMounts(agentId),
      async (typeId) => {
        const resolved = await this.credentialsService.resolve(
          typeId as CredentialTypeId,
        );
        if (!resolved) return null;
        return {
          data: resolved.data,
          secretEntries: [...resolved.secretMap.entries()].map(
            ([placeholder, entry]) =>
              [placeholder, entry.value, entry.allowedOrigins] as [
                string,
                string,
                string[],
              ],
          ),
        };
      },
      this.uiKarton,
    );

    // ShellService needs the resolved value eagerly (configures loginFallback).
    // By this point the promise has likely already settled (SandboxService
    // creation above takes non-trivial time), so the await is ~instant.
    const resolvedEnv = await resolvedEnvPromise;
    this.shellService = await ShellService.create(
      this.logger,
      this.uiKarton,
      detectedShell,
      resolvedEnv,
    );

    // Use arrow function to preserve `this` binding when called as callback
    this.authService.registerAuthStateChangeCallback(() =>
      this.refreshApiClient(),
    );

    // Register askUserQuestions procedure handlers
    this.uiKarton.registerServerProcedureHandler(
      'toolbox.submitUserQuestionStep',
      async (
        _callingClientId: string,
        agentInstanceId: string,
        questionId: string,
        stepAnswers: Record<string, QuestionAnswerValue>,
      ) => {
        advanceOrCompleteQuestion(
          questionId,
          stepAnswers,
          this.uiKarton,
          agentInstanceId,
        );
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.cancelUserQuestion',
      async (
        _callingClientId: string,
        agentInstanceId: string,
        questionId: string,
        reason: 'user_cancelled' | 'user_sent_message',
      ) => {
        cancelQuestion(questionId, reason, this.uiKarton, agentInstanceId);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.goBackUserQuestion',
      async (
        _callingClientId: string,
        agentInstanceId: string,
        questionId: string,
      ) => {
        goBackQuestion(questionId, this.uiKarton, agentInstanceId);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.cancelShellCommand',
      async (
        _callingClientId: string,
        _agentInstanceId: string,
        toolCallId: string,
      ) => {
        this.cancelShellCommand(toolCallId);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.dismissActiveApp',
      async (_callingClientId: string, agentInstanceId: string) => {
        this.uiKarton.setState((draft) => {
          if (draft.toolbox[agentInstanceId]) {
            draft.toolbox[agentInstanceId].activeApp = null;
          }
        });
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.forwardAppMessage',
      async (
        _callingClientId: string,
        agentInstanceId: string,
        appId: string,
        pluginId: string | undefined,
        data: unknown,
      ) => {
        this.sandboxService?.forwardAppMessage(
          agentInstanceId,
          appId,
          pluginId,
          data,
        );
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.clearPendingAppMessage',
      async (_callingClientId: string, agentInstanceId: string) => {
        this.uiKarton.setState((draft) => {
          if (draft.toolbox[agentInstanceId]) {
            draft.toolbox[agentInstanceId].pendingAppMessage = null;
          }
        });
      },
    );
  }

  /**
   * Start a chokidar watcher on the global plans directory.
   * On any change, re-reads all plans and pushes updated list to Karton state.
   */
  private startPlansWatcher(): void {
    const plansDir = getPlansDir();
    this.plansWatcher = chokidar.watch(plansDir, {
      persistent: true,
      ignoreInitial: false,
      depth: 0,
      awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    });

    const scheduleRefresh = () => {
      if (this.plansWatcherDebounce) clearTimeout(this.plansWatcherDebounce);
      this.plansWatcherDebounce = setTimeout(() => {
        this.plansWatcherDebounce = null;
        void this.refreshGlobalPlans();
      }, 400);
    };

    this.plansWatcher
      .on('add', scheduleRefresh)
      .on('change', scheduleRefresh)
      .on('unlink', scheduleRefresh)
      .on('error', (error) => {
        this.logger.debug('[ToolboxService] Plans watcher error', { error });
      });
  }

  private stopPlansWatcher(): void {
    if (this.plansWatcherDebounce) {
      clearTimeout(this.plansWatcherDebounce);
      this.plansWatcherDebounce = null;
    }
    if (this.plansWatcher) {
      void this.plansWatcher.close();
      this.plansWatcher = null;
    }
  }

  /** Re-read all plans from disk and push to top-level Karton state. */
  private async refreshGlobalPlans(): Promise<void> {
    try {
      const plans = await readPlans(getPlansDir());
      this.uiKarton.setState((draft) => {
        draft.plans = plans.map((p) => ({
          name: p.name,
          description: p.description,
          filename: p.filename,
          totalTasks: p.totalTasks,
          completedTasks: p.completedTasks,
          taskGroups: p.taskGroups,
        }));
      });
    } catch (error) {
      this.logger.debug('[ToolboxService] Failed to refresh global plans', {
        error,
      });
      this.report(error as Error, 'refreshGlobalPlans');
    }
  }

  protected onTeardown(): Promise<void> | void {
    this.unsubPreferenceSync?.();
    this.unsubPreferenceSync = null;

    this.apiClient = null;

    this.stopPlansWatcher();

    void this.mountManagerService?.teardown();
    this.mountManagerService = null;

    void this.sandboxService?.teardown();
    this.sandboxService = null;

    void this.shellService?.teardown();
    this.shellService = null;
  }
}
