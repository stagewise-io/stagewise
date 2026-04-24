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
import {
  getDataRoot,
  getLogsDir,
  getPlansDir,
  getTempRoot,
  getAgentShellLogsDir,
} from '@/utils/paths';
import { existsSync, mkdirSync, truncateSync } from 'node:fs';
import fsPromises from 'node:fs/promises';
import type { ApiClient } from '@stagewise/api-client';
import {
  deleteToolExecute,
  DESCRIPTION as DELETE_FILE_DESCRIPTION,
} from './tools/file-modification/delete-file';
import { glob as globTool } from './tools/file-modification/glob';
import { readFile as readTool } from './tools/file-modification/read';
import { ls as lsTool } from './tools/file-modification/ls';
import { getLintingDiagnostics as getLintingDiagnosticsTool } from './tools/file-modification/get-linting-diagnostics';
import { listLibraryDocs as listLibraryDocsTool } from './tools/research/list-library-docs';
import { searchInLibraryDocs as searchInLibraryDocsTool } from './tools/research/search-in-library-docs';
import {
  writeToolExecute,
  DESCRIPTION as WRITE_DESCRIPTION,
} from './tools/file-modification/write';
import {
  multiEditToolExecute,
  DESCRIPTION as MULTI_EDIT_DESCRIPTION,
} from './tools/file-modification/multi-edit';
import {
  copyToolExecute,
  DESCRIPTION as COPY_DESCRIPTION,
} from './tools/file-modification/copy';
import { mkdir as mkdirTool } from './tools/file-modification/mkdir';
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
  deleteToolInputSchema,
  multiEditToolInputSchema,
  writeToolInputSchema,
  copyToolInputSchema,
  type CopyToolInput,
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
  discoverGlobalSkills,
} from '@/agents/shared/prompts/utils/get-skills';
import type { SkillDefinition } from '@shared/skills';
import { toSkillDefinitionUI } from '@shared/skills';
import { readPlans } from '@/agents/shared/prompts/utils/read-plans';
import { readLogChannels } from '@/agents/shared/prompts/utils/read-logs';
import { PLANS_PREFIX, getAgentOwnedPlanPaths } from '@shared/plan-ownership';
import { LOGS_PREFIX, getAgentOwnedLogPaths } from '@shared/log-ownership';
import { LogIngestService } from '../log-ingest';
import { resolveMountedRelativePath } from './utils/path-mounting';
import { normalizePath } from '@shared/path-utils';
import { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import chokidar, { type FSWatcher } from 'chokidar';
import { homedir } from 'node:os';

type MountedPrefix = string;
type MountedPath = string;

function getGlobalSkillsMounts(): Array<{
  prefix: string;
  absolutePath: string;
}> {
  const home = homedir();
  return [
    {
      prefix: 'globalskills-sw',
      absolutePath: path.resolve(home, '.stagewise', 'skills'),
    },
    {
      prefix: 'globalskills-agents',
      absolutePath: path.resolve(home, '.agents', 'skills'),
    },
  ];
}

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
  private globalSkillsRuntimes = new Map<string, ClientRuntimeNode>();
  private appsRuntimes = new Map<string, ClientRuntimeNode>();
  private attRuntimes = new Map<string, ClientRuntimeNode>();
  private shellsRuntimes = new Map<string, ClientRuntimeNode>();

  private mountManagerService: MountManagerService | null = null;
  private unsubPreferenceSync: (() => void) | null = null;

  /** Cached API client - recreated when auth changes */
  private apiClient: ApiClient | null = null;

  public get globalDataPath(): string {
    return getDataRoot();
  }

  /**
   * Returns the mounted runtimes for the agent, including the
   * read-only plugins runtime, the per-agent apps runtime,
   * and the per-agent attachment blob runtime.
   */
  private getAllMountedRuntimes(
    agentInstanceId: string,
  ): MountedClientRuntimes | undefined {
    const runtimes =
      this.mountManagerService?.getMountedRuntimes(agentInstanceId);
    if (!runtimes) return undefined;
    if (this.pluginsRuntime) runtimes.set('plugins', this.pluginsRuntime);
    for (const mount of getGlobalSkillsMounts()) {
      const rt = this.getOrCreateGlobalSkillsRuntime(
        mount.prefix,
        mount.absolutePath,
      );
      if (rt) runtimes.set(mount.prefix, rt);
    }
    runtimes.set('apps', this.getOrCreateAppsRuntime(agentInstanceId));
    runtimes.set(PLANS_PREFIX, this.getOrCreatePlansRuntime());
    runtimes.set(LOGS_PREFIX, this.getOrCreateLogsRuntime());
    runtimes.set('att', this.getOrCreateAttRuntime(agentInstanceId));
    runtimes.set('shells', this.getOrCreateShellsRuntime(agentInstanceId));
    return runtimes;
  }

  /** Builtin commands discovered at startup — stored for refresh merging. */
  private builtinSkills: SkillDefinition[] = [];

  /** Monotonically increasing counter to discard stale `rebuildSkillsList` results. */
  private skillsRebuildGeneration = 0;

  private plansRuntime: ClientRuntimeNode | null = null;
  private plansWatcher: FSWatcher | null = null;
  private plansWatcherDebounce: ReturnType<typeof setTimeout> | null = null;

  private logsRuntime: ClientRuntimeNode | null = null;
  private logsWatcher: FSWatcher | null = null;
  private logsWatcherDebounce: ReturnType<typeof setTimeout> | null = null;
  private logIngestService: LogIngestService | null = null;

  private globalSkillsWatchers: FSWatcher[] = [];
  private globalSkillsWatcherDebounce: ReturnType<typeof setTimeout> | null =
    null;

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

  private getOrCreateLogsRuntime(): ClientRuntimeNode {
    if (this.logsRuntime) return this.logsRuntime;
    const logsDir = getLogsDir();
    mkdirSync(logsDir, { recursive: true });
    this.logsRuntime = new ClientRuntimeNode({
      workingDirectory: logsDir,
      rgBinaryBasePath: getRipgrepBasePath(),
    });
    return this.logsRuntime;
  }

  private getOrCreateGlobalSkillsRuntime(
    prefix: string,
    absolutePath: string,
  ): ClientRuntimeNode | null {
    const existing = this.globalSkillsRuntimes.get(prefix);
    if (existing) return existing;
    if (!existsSync(absolutePath)) return null;
    const runtime = new ClientRuntimeNode({
      workingDirectory: absolutePath,
      rgBinaryBasePath: getRipgrepBasePath(),
    });
    this.globalSkillsRuntimes.set(prefix, runtime);
    return runtime;
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

  private getOrCreateAttRuntime(agentInstanceId: string): ClientRuntimeNode {
    const existing = this.attRuntimes.get(agentInstanceId);
    if (existing) return existing;
    const attDir = getAgentBlobDir(agentInstanceId);
    mkdirSync(attDir, { recursive: true });
    const runtime = new ClientRuntimeNode({
      workingDirectory: attDir,
      rgBinaryBasePath: getRipgrepBasePath(),
    });
    this.attRuntimes.set(agentInstanceId, runtime);
    return runtime;
  }

  private getOrCreateShellsRuntime(agentInstanceId: string): ClientRuntimeNode {
    const existing = this.shellsRuntimes.get(agentInstanceId);
    if (existing) return existing;
    const shellLogsDir = getAgentShellLogsDir(agentInstanceId);
    mkdirSync(shellLogsDir, { recursive: true });
    const runtime = new ClientRuntimeNode({
      workingDirectory: shellLogsDir,
      rgBinaryBasePath: getRipgrepBasePath(),
    });
    this.shellsRuntimes.set(agentInstanceId, runtime);
    return runtime;
  }

  /** Temp directory for capturing file state (external/binary files) */
  private get tempDir(): string {
    return path.join(getTempRoot(), 'agent-temp-files');
  }

  /**
   * Narrow accessor used by `DiffHistoryService` to resolve which
   * filepaths belong to a mounted workspace (for the gitignore check).
   * Returns an empty set before the mount manager has finished its
   * async initialization — callers must tolerate that window.
   */
  public getAllMountedPaths(): Set<string> {
    return this.mountManagerService?.getAllMountedPaths() ?? new Set();
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
   * @param inputSchema - Zod schema for tool input (must have path field)
   * @param executeFn - The actual tool execute function
   * @param agentInstanceId - The agent instance ID for diff-history attribution
   * @returns A wrapped tool that registers edits with diff-history
   */
  private wrapFileModifyingTool<TParams extends { path: string }>(
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
      strict: false,
      execute: async (params, options) => {
        const mountedRuntimes = this.getAllMountedRuntimes(agentInstanceId);
        if (!mountedRuntimes) throw new Error('No mounted workspaces found');

        const mountPrefix = normalizePath(params.path).split('/')[0];
        if (NON_WORKSPACE_PREFIXES.has(mountPrefix))
          return executeFn(params, mountedRuntimes);

        const { clientRuntime, path } = resolveMountedRelativePath(
          mountedRuntimes,
          params.path,
        );
        const { toolCallId } = options as { toolCallId: string };
        const absolutePath = clientRuntime.fileSystem.resolvePath(path);

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
            workspaceRoot:
              this.mountManagerService?.findWorkspaceForFile(
                agentInstanceId,
                absolutePath,
              ) ?? null,
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

  /**
   * Wraps the delete tool with special handling for directory deletions.
   * For single files, behaves like wrapFileModifyingTool.
   * For directories, captures before-state for all files inside, deletes them,
   * and registers individual diff-history entries for each file.
   */
  private wrapDeleteTool(agentInstanceId: string) {
    return tool({
      description: DELETE_FILE_DESCRIPTION,
      inputSchema: deleteToolInputSchema as z.ZodType<{ path: string }>,
      strict: false,
      execute: async (params, options) => {
        const mountedRuntimes = this.getAllMountedRuntimes(agentInstanceId);
        if (!mountedRuntimes) throw new Error('No mounted workspaces found');

        const mountPrefix = normalizePath(params.path).split('/')[0];
        if (NON_WORKSPACE_PREFIXES.has(mountPrefix))
          return deleteToolExecute(params, mountedRuntimes);

        const { clientRuntime, path: resolvedPath } =
          resolveMountedRelativePath(mountedRuntimes, params.path);
        const { toolCallId } = options as { toolCallId: string };
        const absolutePath = clientRuntime.fileSystem.resolvePath(resolvedPath);

        // Check if target is a directory
        const isDir = await clientRuntime.fileSystem.isDirectory(absolutePath);

        if (!isDir) {
          // Single file deletion — same logic as wrapFileModifyingTool
          const beforeState = await captureFileState(
            absolutePath,
            this.tempDir,
          );
          this.diffHistoryService.ignoreFileForWatcher(absolutePath);

          await deleteToolExecute(params, mountedRuntimes);
          const afterState = await captureFileState(absolutePath, this.tempDir);

          try {
            const { editContent, tempFilesToCleanup } =
              await buildAgentFileEditContent(
                beforeState,
                afterState,
                this.tempDir,
              );

            if (!editContent.isExternal && editContent.contentBefore !== null)
              void this.mountManagerService?.syncFileCloseWithLsp(
                agentInstanceId,
                absolutePath,
              );

            await this.diffHistoryService.registerAgentEdit({
              agentInstanceId,
              path: absolutePath,
              toolCallId,
              workspaceRoot:
                this.mountManagerService?.findWorkspaceForFile(
                  agentInstanceId,
                  absolutePath,
                ) ?? null,
              ...editContent,
            });

            for (const tempFile of tempFilesToCleanup)
              void cleanupTempFile(tempFile);
          } catch (error) {
            this.logger.error(
              '[ToolboxService] Failed to register agent edit',
              { error, path: absolutePath, toolCallId },
            );
            this.report(error as Error, 'registerAgentEdit', {
              path: absolutePath,
              toolCallId,
            });
          } finally {
            setTimeout(
              () =>
                this.diffHistoryService.unignoreFileForWatcher(absolutePath),
              500,
            );
          }

          const _diff =
            !beforeState.isExternal && !afterState.isExternal
              ? { before: beforeState.content, after: afterState.content }
              : null;

          return { _diff };
        }

        // Directory deletion — capture before-state for all files
        const filePaths = await this.collectAllFiles(absolutePath);

        // All children share the same owning workspace — resolve once.
        const dirWorkspaceRoot =
          this.mountManagerService?.findWorkspaceForFile(
            agentInstanceId,
            absolutePath,
          ) ?? null;

        // Capture before-state for each file and ignore them in watcher
        const beforeStates = new Map<
          string,
          Awaited<ReturnType<typeof captureFileState>>
        >();
        for (const filePath of filePaths) {
          beforeStates.set(
            filePath,
            await captureFileState(filePath, this.tempDir),
          );
          this.diffHistoryService.ignoreFileForWatcher(filePath);
        }

        // Execute the directory deletion
        await deleteToolExecute(params, mountedRuntimes);

        // Register diff-history for each deleted file
        try {
          for (const filePath of filePaths) {
            const beforeState = beforeStates.get(filePath);
            if (!beforeState) continue;

            // After deletion, file doesn't exist
            const afterState = await captureFileState(filePath, this.tempDir);

            const { editContent, tempFilesToCleanup } =
              await buildAgentFileEditContent(
                beforeState,
                afterState,
                this.tempDir,
              );

            // Close in LSP to clear diagnostics
            if (!editContent.isExternal && editContent.contentBefore !== null)
              void this.mountManagerService?.syncFileCloseWithLsp(
                agentInstanceId,
                filePath,
              );

            await this.diffHistoryService.registerAgentEdit({
              agentInstanceId,
              path: filePath,
              toolCallId,
              workspaceRoot: dirWorkspaceRoot,
              ...editContent,
            });

            for (const tempFile of tempFilesToCleanup)
              void cleanupTempFile(tempFile);
          }
        } catch (error) {
          this.logger.error(
            '[ToolboxService] Failed to register agent edit for directory deletion',
            { error, path: absolutePath, toolCallId },
          );
          this.report(error as Error, 'registerAgentEdit', {
            path: absolutePath,
            toolCallId,
          });
        } finally {
          for (const filePath of filePaths) {
            setTimeout(
              () => this.diffHistoryService.unignoreFileForWatcher(filePath),
              500,
            );
          }
        }

        // For directory deletions, _diff is null (no single-file diff to show)
        return { _diff: null };
      },
    });
  }

  /**
   * Recursively collect all file paths in a directory.
   */
  private async collectAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fsPromises.readdir(dirPath, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await this.collectAllFiles(fullPath);
        files.push(...subFiles);
      } else {
        files.push(fullPath);
      }
    }
    return files;
  }

  /**
   * Creates the copy/move tool with custom diff-history tracking.
   * Unlike wrapFileModifyingTool, this handles two paths (input + output)
   * and for moves also registers the source deletion.
   */
  private createCopyTool(agentInstanceId: string) {
    return tool({
      description: COPY_DESCRIPTION,
      inputSchema: copyToolInputSchema,
      strict: false,
      execute: async (params: CopyToolInput, options) => {
        const mountedRuntimes = this.getAllMountedRuntimes(agentInstanceId);
        if (!mountedRuntimes) throw new Error('No mounted workspaces found');

        const { toolCallId } = options as { toolCallId: string };
        const { input_path, output_path, move } = params;

        const srcMountPrefix = normalizePath(input_path).split('/')[0];
        const destMountPrefix = normalizePath(output_path).split('/')[0];

        // Block moves from read-only mounts (att, plugins)
        if (move && NON_WORKSPACE_PREFIXES.has(srcMountPrefix)) {
          throw new Error(
            `Cannot move from read-only mount '${srcMountPrefix}'. Use copy instead.`,
          );
        }

        // Block writes into read-only mounts
        if (NON_WORKSPACE_PREFIXES.has(destMountPrefix)) {
          throw new Error(
            `Cannot copy/move into read-only mount '${destMountPrefix}'.`,
          );
        }

        // Resolve both paths
        const { clientRuntime: srcRuntime, path: srcRelative } =
          resolveMountedRelativePath(mountedRuntimes, input_path);
        const { clientRuntime: destRuntime, path: destRelative } =
          resolveMountedRelativePath(mountedRuntimes, output_path);

        const srcAbsolute = srcRuntime.fileSystem.resolvePath(srcRelative);
        const destAbsolute = destRuntime.fileSystem.resolvePath(destRelative);
        const srcIsDir = await srcRuntime.fileSystem.isDirectory(srcAbsolute);

        // Collect all affected output files for diff-history
        // For a directory copy, we need to track every file that gets created
        let destFilePaths: string[];
        let srcFilePaths: string[];

        if (srcIsDir) {
          srcFilePaths = await this.collectAllFiles(srcAbsolute);
          // Map source file paths to their destination equivalents
          destFilePaths = srcFilePaths.map((srcFile) => {
            const relative = path.relative(srcAbsolute, srcFile);
            return path.join(destAbsolute, relative);
          });
        } else {
          // Single file — check if dest is a directory
          const destIsDir =
            await destRuntime.fileSystem.isDirectory(destAbsolute);
          const finalDest = destIsDir
            ? path.join(destAbsolute, path.basename(srcAbsolute))
            : destAbsolute;
          srcFilePaths = [srcAbsolute];
          destFilePaths = [finalDest];
        }

        // Capture before-state for destination files
        const destBeforeStates = new Map<
          string,
          Awaited<ReturnType<typeof captureFileState>>
        >();
        for (const destFile of destFilePaths) {
          destBeforeStates.set(
            destFile,
            await captureFileState(destFile, this.tempDir),
          );
          this.diffHistoryService.ignoreFileForWatcher(destFile);
        }

        // For moves, also capture before-state for source files
        const srcBeforeStates = new Map<
          string,
          Awaited<ReturnType<typeof captureFileState>>
        >();
        if (move) {
          for (const srcFile of srcFilePaths) {
            srcBeforeStates.set(
              srcFile,
              await captureFileState(srcFile, this.tempDir),
            );
            this.diffHistoryService.ignoreFileForWatcher(srcFile);
          }
        }

        // Execute the copy/move
        const result = await copyToolExecute(params, mountedRuntimes);

        // All dest files share the dest workspace; all src files share the src
        // workspace (src and dest may differ across a cross-workspace copy).
        const destWorkspaceRoot =
          this.mountManagerService?.findWorkspaceForFile(
            agentInstanceId,
            destAbsolute,
          ) ?? null;
        const srcWorkspaceRoot =
          this.mountManagerService?.findWorkspaceForFile(
            agentInstanceId,
            srcAbsolute,
          ) ?? null;

        // Register diff-history for destination files (created/overwritten)
        try {
          for (const destFile of destFilePaths) {
            const beforeState = destBeforeStates.get(destFile);
            if (!beforeState) continue;

            const afterState = await captureFileState(destFile, this.tempDir);
            const { editContent, tempFilesToCleanup } =
              await buildAgentFileEditContent(
                beforeState,
                afterState,
                this.tempDir,
              );

            if (!editContent.isExternal && editContent.contentAfter !== null)
              void this.mountManagerService?.syncFileWithLsp(
                agentInstanceId,
                destFile,
                editContent.contentAfter,
              );

            await this.diffHistoryService.registerAgentEdit({
              agentInstanceId,
              path: destFile,
              toolCallId,
              workspaceRoot: destWorkspaceRoot,
              ...editContent,
            });

            for (const tempFile of tempFilesToCleanup)
              void cleanupTempFile(tempFile);
          }

          // For moves, register source file deletions
          if (move) {
            for (const srcFile of srcFilePaths) {
              const beforeState = srcBeforeStates.get(srcFile);
              if (!beforeState) continue;

              const afterState = await captureFileState(srcFile, this.tempDir);
              const { editContent, tempFilesToCleanup } =
                await buildAgentFileEditContent(
                  beforeState,
                  afterState,
                  this.tempDir,
                );

              if (!editContent.isExternal && editContent.contentBefore !== null)
                void this.mountManagerService?.syncFileCloseWithLsp(
                  agentInstanceId,
                  srcFile,
                );

              await this.diffHistoryService.registerAgentEdit({
                agentInstanceId,
                path: srcFile,
                toolCallId,
                workspaceRoot: srcWorkspaceRoot,
                ...editContent,
              });

              for (const tempFile of tempFilesToCleanup)
                void cleanupTempFile(tempFile);
            }
          }
        } catch (error) {
          this.logger.error(
            '[ToolboxService] Failed to register agent edit for copy/move',
            { error, input_path, output_path, toolCallId },
          );
          this.report(error as Error, 'registerAgentEdit', {
            path: output_path,
            toolCallId,
          });
        } finally {
          for (const destFile of destFilePaths) {
            setTimeout(
              () => this.diffHistoryService.unignoreFileForWatcher(destFile),
              500,
            );
          }
          if (move) {
            for (const srcFile of srcFilePaths) {
              setTimeout(
                () => this.diffHistoryService.unignoreFileForWatcher(srcFile),
                500,
              );
            }
          }
        }

        return { ...(result as object), _diff: null };
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
      case 'write':
        if (mountedRuntimes.size === 0) return null;
        return this.wrapFileModifyingTool(
          WRITE_DESCRIPTION,
          writeToolInputSchema,
          writeToolExecute,
          agentInstanceId,
        );
      case 'read':
        if (mountedRuntimes.size === 0) return null;
        return readTool(mountedRuntimes);
      case 'ls':
        if (mountedRuntimes.size === 0) return null;
        return lsTool(mountedRuntimes);
      case 'delete':
        if (mountedRuntimes.size === 0) return null;
        return this.wrapDeleteTool(agentInstanceId);
      case 'glob':
        if (mountedRuntimes.size === 0) return null;
        return globTool(mountedRuntimes);
      case 'grepSearch':
        if (mountedRuntimes.size === 0) return null;
        return grepSearchTool(mountedRuntimes);
      case 'multiEdit':
        if (mountedRuntimes.size === 0) return null;
        return this.wrapFileModifyingTool(
          MULTI_EDIT_DESCRIPTION,
          multiEditToolInputSchema,
          multiEditToolExecute,
          agentInstanceId,
        );
      case 'mkdir':
        if (mountedRuntimes.size === 0) return null;
        return mkdirTool(mountedRuntimes);
      case 'copy':
        if (mountedRuntimes.size === 0) return null;
        return this.createCopyTool(agentInstanceId);
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
  public async undoToolCalls(
    toolCallIds: string[],
    agentInstanceId?: string,
  ): Promise<void> {
    return this.diffHistoryService.undoToolCalls(toolCallIds, agentInstanceId);
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

    const shellLogsDir = getAgentShellLogsDir(agentInstanceId);
    mkdirSync(shellLogsDir, { recursive: true });
    mounts.push({
      prefix: 'shells',
      absolutePath: shellLogsDir,
      permissions: READ_ONLY_PERMISSIONS,
    });

    mounts.push({
      prefix: 'plugins',
      absolutePath: getPluginsPath(),
      permissions: READ_ONLY_PERMISSIONS,
    });

    for (const gs of getGlobalSkillsMounts()) {
      if (existsSync(gs.absolutePath)) {
        mounts.push({
          prefix: gs.prefix,
          absolutePath: gs.absolutePath,
          permissions: READ_ONLY_PERMISSIONS,
        });
      }
    }

    const appsDir = getAgentAppsDir(agentInstanceId);
    mkdirSync(appsDir, { recursive: true });
    mounts.push({
      prefix: 'apps',
      absolutePath: appsDir,
      permissions: FULL_PERMISSIONS,
    });

    mounts.push({
      prefix: LOGS_PREFIX,
      absolutePath: getLogsDir(),
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

  public killShellSession(sessionId: string): void {
    this.shellService?.killSession(sessionId);
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
        prefix: 'shells',
        path: getAgentShellLogsDir(agentInstanceId),
        permissions: [...READ_ONLY_PERMISSIONS] as MountPermission[],
      },
      {
        prefix: 'plugins',
        path: getPluginsPath(),
        permissions: [...READ_ONLY_PERMISSIONS] as MountPermission[],
      },
      ...getGlobalSkillsMounts()
        .filter((gs) => existsSync(gs.absolutePath))
        .map((gs) => ({
          prefix: gs.prefix,
          path: gs.absolutePath,
          permissions: [...READ_ONLY_PERMISSIONS] as MountPermission[],
        })),
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
      {
        prefix: LOGS_PREFIX,
        path: getLogsDir(),
        permissions: [...FULL_PERMISSIONS] as MountPermission[],
      },
    ];

    const [
      agentsMdEntries,
      workspaceMdEntries,
      commands,
      planEntries,
      logEntries,
    ] = await Promise.all([
      this.getAllAgentsMdEntries(agentInstanceId),
      this.getWorkspaceMd(agentInstanceId),
      this.getSkillsList(agentInstanceId),
      this.getPlansList(agentInstanceId),
      this.getLogsList(agentInstanceId),
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
      logs: {
        entries: logEntries,
      },
      logIngest: this.logIngestService
        ? {
            port: this.logIngestService.getPort(),
            token: this.logIngestService.getToken(),
          }
        : null,
      shells: (() => {
        const shellSnap = this.shellService?.getShellSnapshot(
          agentInstanceId,
        ) ?? {
          sessions: [],
        };
        return shellSnap;
      })() ?? {
        sessions: [],
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
    // Trigger a full rebuild for all active agents so builtins get
    // merged with any already-discovered workspace/plugin skills.
    const activeIds = Object.keys(this.uiKarton.state.agents.instances);
    if (activeIds.length > 0) {
      for (const id of activeIds) void this.rebuildSkillsList(id);
    } else {
      // No agents yet — push builtins directly so they're available
      // when the first agent is created.
      this.uiKarton.setState((draft) => {
        draft.skills = cmds.map(toSkillDefinitionUI);
      });
    }
  }

  /**
   * Rebuild the unified commands list (builtins + workspace skills +
   * plugin skills) for a given agent and push it to Karton state.
   * Called on mount/unmount to keep the slash-command list in sync.
   */
  private async rebuildSkillsList(agentInstanceId: string): Promise<void> {
    const gen = ++this.skillsRebuildGeneration;
    const commands = await this.getSkillsList(agentInstanceId);
    // Discard result if a newer rebuild was triggered while we
    // were awaiting (prevents stale lists from overwriting).
    if (gen !== this.skillsRebuildGeneration) return;
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

    // Workspace skills first — workspace overrides global.
    // Also collect disabled skill names so globals can be suppressed.
    const allDisabled = new Set<string>();
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
        for (const name of disabled) allDisabled.add(name);
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

    // Global (user-level) skills — after workspace so workspace wins on dupes.
    // Also suppressed by workspace-level disabledSkills.
    const globalSkills = await discoverGlobalSkills();
    const globalMounts = getGlobalSkillsMounts();
    for (const skill of globalSkills) {
      if (allDisabled.has(skill.name)) continue;
      const id = `skill:${skill.name}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const mount = globalMounts.find(
        (m) =>
          skill.path === m.absolutePath ||
          skill.path.startsWith(m.absolutePath + path.sep),
      );
      if (!mount) continue;
      const relativePath = path.relative(mount.absolutePath, skill.path);
      result.push({
        id,
        displayName: skill.name,
        description: skill.description,
        source: 'global',
        contentPath: path.resolve(skill.path, 'SKILL.md'),
        skillPath: `${mount.prefix}/${relativePath}`,
        userInvocable: skill.userInvocable,
        agentInvocable: skill.agentInvocable,
      });
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

  private async getLogsList(agentInstanceId: string): Promise<
    Array<{
      filename: string;
      byteSize: number;
      lineCount: number;
      tailLines: string[];
    }>
  > {
    const agentEntry = this.uiKarton.state.agents.instances[agentInstanceId];
    const ownedPaths = agentEntry
      ? getAgentOwnedLogPaths(agentEntry.state.history)
      : new Set<string>();

    const logs = await readLogChannels(getLogsDir());
    return logs.filter((log) => {
      const toolPath = `${LOGS_PREFIX}/${log.filename}`;
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
    const result = new Map<MountedPrefix, MountedPath>();
    if (mounts) {
      for (const mount of mounts) result.set(mount.prefix, mount.path);
    }

    // Include always-available special mounts so that path references
    // from plugin skill reads (plugins/), attachment blobs (att/), and
    // agent apps (apps/) can be resolved during content injection.
    result.set('plugins', getPluginsPath());
    result.set('apps', getAgentAppsDir(agentInstanceId));
    result.set('att', getAgentBlobDir(agentInstanceId));
    result.set(PLANS_PREFIX, getPlansDir());
    result.set(LOGS_PREFIX, getLogsDir());

    for (const gs of getGlobalSkillsMounts()) {
      if (existsSync(gs.absolutePath)) {
        result.set(gs.prefix, gs.absolutePath);
      }
    }

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
    this.shellsRuntimes.delete(agentInstanceId);
    if (deleteBlobs) {
      void deleteAgentBlobs(agentInstanceId);
      this.shellService?.deleteShellLogs(agentInstanceId);
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

    // Start watching the global logs directory
    this.startLogsWatcher();

    // Start the log ingest HTTP server
    try {
      this.logIngestService = await LogIngestService.create();
      this.uiKarton.setState((draft) => {
        draft.logIngest = {
          port: this.logIngestService!.getPort(),
          token: this.logIngestService!.getToken(),
        };
      });
    } catch (err) {
      this.logIngestService = null;
      this.uiKarton.setState((draft) => {
        draft.logIngest = null;
      });
      this.logger.error(
        '[ToolboxService] Failed to start LogIngestService:',
        err,
      );
    }

    // Start watching global skills directories (~/.stagewise/skills, ~/.agents/skills)
    this.startGlobalSkillsWatchers();

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
      'toolbox.killShellSession',
      async (
        _callingClientId: string,
        _agentInstanceId: string,
        sessionId: string,
      ) => {
        this.killShellSession(sessionId);
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

    this.uiKarton.registerServerProcedureHandler(
      'toolbox.clearLogChannel',
      async (_callingClientId: string, filename: string) => {
        if (
          typeof filename !== 'string' ||
          !filename.endsWith('.jsonl') ||
          filename !== path.basename(filename)
        )
          throw new Error('Invalid log channel filename.');

        const logsDir = path.resolve(getLogsDir());
        const filePath = path.resolve(logsDir, filename);
        if (!filePath.startsWith(logsDir + path.sep))
          throw new Error('Invalid log channel filename.');

        try {
          truncateSync(filePath, 0);
        } catch {
          // File may not exist — ignore
        }
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

  /**
   * Watch parent dirs (`~/.stagewise/`, `~/.agents/`) for changes to their
   * `skills/` subdirectories. Follows the workspace watcher pattern: watch
   * parents with an ignored filter so we detect `skills/` being created
   * for the first time.
   */
  private startGlobalSkillsWatchers(): void {
    const scheduleRefresh = () => {
      if (this.globalSkillsWatcherDebounce)
        clearTimeout(this.globalSkillsWatcherDebounce);
      this.globalSkillsWatcherDebounce = setTimeout(() => {
        this.globalSkillsWatcherDebounce = null;
        // Evict stale runtimes for directories that were removed.
        for (const mount of getGlobalSkillsMounts()) {
          if (
            this.globalSkillsRuntimes.has(mount.prefix) &&
            !existsSync(mount.absolutePath)
          )
            this.globalSkillsRuntimes.delete(mount.prefix);
        }
        // Rebuild skills list for all active agents.
        const activeIds = Object.keys(this.uiKarton.state.agents.instances);
        for (const id of activeIds) void this.rebuildSkillsList(id);
      }, 400);
    };

    for (const mount of getGlobalSkillsMounts()) {
      const parentDir = path.dirname(mount.absolutePath);
      if (!existsSync(parentDir)) continue;

      const watcher = chokidar.watch(parentDir, {
        persistent: true,
        ignoreInitial: true,
        depth: 3,
        awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
        ignored: (filePath: string) => {
          if (filePath === parentDir) return false;
          const rel = path.relative(parentDir, filePath);
          const segments = rel.split(path.sep);
          // Only allow the 'skills' subdirectory.
          if (segments.length === 1) return segments[0] !== 'skills';
          return segments[0] !== 'skills';
        },
      });

      watcher
        .on('add', scheduleRefresh)
        .on('change', scheduleRefresh)
        .on('unlink', scheduleRefresh)
        .on('addDir', scheduleRefresh)
        .on('unlinkDir', scheduleRefresh)
        .on('error', (error) => {
          this.logger.debug('[ToolboxService] Global skills watcher error', {
            error,
          });
        });

      this.globalSkillsWatchers.push(watcher);
    }
  }

  private stopGlobalSkillsWatchers(): void {
    if (this.globalSkillsWatcherDebounce) {
      clearTimeout(this.globalSkillsWatcherDebounce);
      this.globalSkillsWatcherDebounce = null;
    }
    for (const watcher of this.globalSkillsWatchers) void watcher.close();

    this.globalSkillsWatchers = [];
  }

  /**
   * Start a chokidar watcher on the global logs directory.
   * On any change, re-reads all log channels and pushes updated list to Karton state.
   */
  private startLogsWatcher(): void {
    const logsDir = getLogsDir();
    mkdirSync(logsDir, { recursive: true });
    this.logsWatcher = chokidar.watch(logsDir, {
      persistent: true,
      ignoreInitial: false,
      depth: 0,
      awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    });

    const scheduleRefresh = () => {
      if (this.logsWatcherDebounce) clearTimeout(this.logsWatcherDebounce);
      this.logsWatcherDebounce = setTimeout(() => {
        this.logsWatcherDebounce = null;
        void this.refreshGlobalLogs();
      }, 400);
    };

    this.logsWatcher
      .on('add', scheduleRefresh)
      .on('change', scheduleRefresh)
      .on('unlink', scheduleRefresh)
      .on('error', (error) => {
        this.logger.debug('[ToolboxService] Logs watcher error', { error });
      });
  }

  private stopLogsWatcher(): void {
    if (this.logsWatcherDebounce) {
      clearTimeout(this.logsWatcherDebounce);
      this.logsWatcherDebounce = null;
    }
    if (this.logsWatcher) {
      void this.logsWatcher.close();
      this.logsWatcher = null;
    }
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

  /** Re-read all log channels from disk and push to top-level Karton state. */
  private async refreshGlobalLogs(): Promise<void> {
    try {
      const logs = await readLogChannels(getLogsDir());
      this.uiKarton.setState((draft) => {
        draft.logChannels = logs.map((ch) => ({
          filename: ch.filename,
          byteSize: ch.byteSize,
          lineCount: ch.lineCount,
          tailLines: ch.tailLines,
        }));
      });
    } catch (error) {
      this.logger.debug('[ToolboxService] Failed to refresh global logs', {
        error,
      });
      this.report(error as Error, 'refreshGlobalLogs');
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
    this.stopLogsWatcher();
    this.stopGlobalSkillsWatchers();

    void this.logIngestService?.teardown();
    this.logIngestService = null;

    void this.mountManagerService?.teardown();
    this.mountManagerService = null;

    void this.sandboxService?.teardown();
    this.sandboxService = null;

    void this.shellService?.teardown();
    this.shellService = null;
  }
}
