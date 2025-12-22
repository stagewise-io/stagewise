/**
 * This file contains the workspace service class that is responsible for loading and unloading all the functionality surrounding a workspace.
 */

import { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import type { KartonService } from '../karton';
import type { Logger } from '../logger';
import type { TelemetryService } from '../telemetry';
import { WorkspaceConfigService } from './services/config';
import { WorkspacePluginService } from './services/plugin';
import { WorkspaceSetupService } from './services/setup';
import { RagService } from './services/rag';
import { StaticAnalysisService } from './services/static-analysis';
import { WorkspacePathsService } from './services/paths';
import type { GlobalDataPathService } from '@/services/global-data-path';
import type { NotificationService } from '../notification';
import path from 'node:path';
import { getRepoRootForPath } from '@/utils/git-tools';

export class WorkspaceService {
  private logger: Logger;
  private telemetryService: TelemetryService;
  private uiKarton: KartonService;
  private globalDataPathService: GlobalDataPathService;
  private notificationService: NotificationService;
  private workspacePath: string;
  private loadedOnStart = false;
  private pathGivenInStartingArg = false;
  private wrappedCommand?: string;
  // Workspace child services
  private workspacePathsService: WorkspacePathsService | null = null;
  private workspaceConfigService: WorkspaceConfigService | null = null;
  private workspacePluginService: WorkspacePluginService | null = null;
  private workspaceSetupService: WorkspaceSetupService | null = null;
  private ragService: RagService | null = null;
  private staticAnalysisService: StaticAnalysisService | null = null;
  private onWorkspaceSetupCompleted?: (
    workspacePath: string,
    absoluteAgentAccessPath?: string,
    name?: string,
  ) => void;

  private constructor(
    logger: Logger,
    telemetryService: TelemetryService,
    uiKarton: KartonService,
    globalDataPathService: GlobalDataPathService,
    notificationService: NotificationService,
    workspacePath: string,
    loadedOnStart: boolean,
    pathGivenInStartingArg: boolean,
    wrappedCommand?: string,
    onWorkspaceSetupCompleted?: (
      workspacePath: string,
      absoluteAgentAccessPath?: string,
      name?: string,
    ) => void,
  ) {
    this.logger = logger;
    this.telemetryService = telemetryService;
    this.uiKarton = uiKarton;
    this.globalDataPathService = globalDataPathService;
    this.notificationService = notificationService;
    this.workspacePath = workspacePath;
    this.loadedOnStart = loadedOnStart;
    this.pathGivenInStartingArg = pathGivenInStartingArg;
    this.wrappedCommand = wrappedCommand;
    this.onWorkspaceSetupCompleted = onWorkspaceSetupCompleted;
  }

  public async initialize() {
    this.logger.debug('[WorkspaceService] Initializing...');

    this.workspacePathsService = await WorkspacePathsService.create(
      this.logger,
      this.globalDataPathService,
      this.workspacePath,
    );

    this.uiKarton.setState((draft) => {
      draft.workspace = {
        path: this.workspacePath,
        paths: {
          data: '',
          temp: '',
        },
        agent: null,
        config: null,
        plugins: null,
        setupActive: false,
        rag: {
          lastIndexedAt: null,
          indexedFiles: 0,
          statusInfo: { isIndexing: false },
        },
        loadedOnStart: this.loadedOnStart,
        childWorkspacePaths: [],
      };
    });

    this.uiKarton.registerServerProcedureHandler(
      'workspace.getGitRepoRoot',
      async () => {
        return getRepoRootForPath(this.workspacePath);
      },
    );

    const clientRuntime = new ClientRuntimeNode({
      workingDirectory: this.getAbsoluteAgentAccessPath(),
      rgBinaryBasePath: this.globalDataPathService.globalDataPath,
    });

    // We immediately make a search for configures workspaces in child paths in order to show this to the user if necessary.
    const childWorkspacePaths = await searchForChildWorkspacePaths(
      clientRuntime,
      this.workspacePath,
    );
    this.uiKarton.setState((draft) => {
      draft.workspace!.childWorkspacePaths = childWorkspacePaths;
    });
    const isOwnInChildWorkspaces = childWorkspacePaths.includes(
      this.workspacePath,
    );
    const childWorkspaceCount =
      childWorkspacePaths.length - (isOwnInChildWorkspaces ? 1 : 0);
    this.telemetryService.capture('workspace-with-child-workspaces-opened', {
      child_workspace_count: childWorkspaceCount,
      includes_itself: isOwnInChildWorkspaces,
    });

    // Start all child services of the workspace. All regular services should only be started if the setup service is done.
    this.workspaceSetupService = await WorkspaceSetupService.create(
      this.logger,
      this.uiKarton,
      this.workspacePath,
      async (setupConfig, newWorkspacePath) => {
        if (newWorkspacePath) this.workspacePath = newWorkspacePath;
        await this.workspacePathsService?.teardown();
        this.workspacePathsService = await WorkspacePathsService.create(
          this.logger,
          this.globalDataPathService,
          this.workspacePath,
        );

        this.workspaceConfigService = await WorkspaceConfigService.create(
          this.logger,
          this.uiKarton,
          this.workspacePath,
          setupConfig,
        );

        this.staticAnalysisService = await StaticAnalysisService.create(
          this.logger,
          this.workspacePath,
        );

        this.workspacePluginService = await WorkspacePluginService.create(
          this.logger,
          this.uiKarton,
          this.workspaceConfigService,
          this.staticAnalysisService,
          this.notificationService,
        );

        this.uiKarton.setState((draft) => {
          draft.workspace!.path = this.workspacePath;
          draft.workspace!.paths.data =
            this.workspacePathsService!.workspaceDataPath;
          draft.workspace!.paths.temp =
            this.workspacePathsService!.workspaceTempPath;
          draft.workspace!.agent = {
            accessPath: this.getAbsoluteAgentAccessPath(
              setupConfig?.agentAccessPath,
            ),
          };
        });

        this.workspaceConfigService.addConfigUpdatedListener((newConfig) => {
          clientRuntime.fileSystem.setCurrentWorkingDirectory(
            this.getAbsoluteAgentAccessPath(newConfig.agentAccessPath),
          );
          this.uiKarton.setState((draft) => {
            draft.workspace!.agent = {
              accessPath: clientRuntime.fileSystem.getCurrentWorkingDirectory(),
            };
          });
        });

        this.ragService =
          (await RagService.create(
            this.logger,
            this.telemetryService,
            this.uiKarton,
            clientRuntime,
          ).catch((error) => {
            this.telemetryService.captureException(error as Error);
            this.logger.error(
              '[WorkspaceService] Failed to create rag service',
              {
                cause: error,
              },
            );
            return null;
          })) ?? null;

        this.telemetryService.capture('workspace-opened', {
          auto_plugins_enabled:
            this.workspaceConfigService.get().autoPlugins ?? true,
          manual_plugins_count:
            this.workspacePluginService.loadedPlugins.filter((p) => !p.bundled)
              .length,
          loaded_plugins: this.workspacePluginService.loadedPlugins.map(
            (plugin) => plugin.name,
          ),
          has_wrapped_command: this.wrappedCommand !== undefined,
          codebase_line_count:
            Object.values(
              this.staticAnalysisService?.linesOfCodeCounts ?? {},
            ).reduce((acc, curr) => acc + curr, 0) ?? 0,
          dependency_count: Object.keys(
            this.staticAnalysisService?.nodeDependencies,
          ).length,
          loading_method: this.loadedOnStart
            ? this.pathGivenInStartingArg
              ? 'on_start_with_arg'
              : 'on_start'
            : 'at_runtime_by_user_action',
          initial_setup: setupConfig !== null,
        });

        this.onWorkspaceSetupCompleted?.(
          this.workspacePath,
          this.getAbsoluteAgentAccessPath(),
          this.workspacePath.split(path.sep).pop() ?? undefined,
        );
      },
    );
  }

  public static async create(
    logger: Logger,
    telemetryService: TelemetryService,
    uiKarton: KartonService,
    globalDataPathService: GlobalDataPathService,
    notificationService: NotificationService,
    workspacePath: string,
    loadedOnStart: boolean,
    pathGivenInStartingArg: boolean,
    wrappedCommand?: string,
    onWorkspaceSetupCompleted?: (
      workspacePath: string,
      absoluteAgentAccessPath?: string,
      name?: string,
    ) => void,
  ) {
    const instance = new WorkspaceService(
      logger,
      telemetryService,
      uiKarton,
      globalDataPathService,
      notificationService,
      workspacePath,
      loadedOnStart,
      pathGivenInStartingArg,
      wrappedCommand,
      onWorkspaceSetupCompleted,
    );
    await instance.initialize();
    logger.debug('[WorkspaceService] Created service');
    return instance;
  }

  public async teardown() {
    this.logger.debug('[WorkspaceService] Teardown called');

    this.ragService?.teardown();
    await this.workspaceSetupService?.teardown();
    await this.workspacePluginService?.teardown();
    await this.workspaceConfigService?.teardown();
    await this.staticAnalysisService?.teardown();
    await this.workspacePathsService?.teardown();

    this.uiKarton.removeServerProcedureHandler('workspace.getGitRepoRoot');

    this.uiKarton.setState((draft) => {
      draft.workspace = null;
    });
  }

  /**
   * Resolves the absolute agent access path.
   * If the agent access path is not a git repo root, the agent access path will be joined with the workspace path.
   *
   * @param agentAccessPath - The access path to the agent. If not provided, the agent access path from the workspace config will be used.
   * @returns The absolute agent access path.
   */
  private getAbsoluteAgentAccessPath(agentAccessPath?: string): string {
    const accessPath =
      agentAccessPath ?? this.workspaceConfigService?.get().agentAccessPath;
    if (!accessPath) return getRepoRootForPath(this.workspacePath);
    const isGitRepoRoot = accessPath.trim() === '{GIT_REPO_ROOT}';
    if (isGitRepoRoot) return getRepoRootForPath(this.workspacePath);

    const absolutePath = path.join(this.workspacePath, accessPath);
    return absolutePath;
  }

  get id(): string {
    return this.workspacePathsService!.workspaceId;
  }

  get path(): string {
    return this.workspacePath;
  }

  get configService(): WorkspaceConfigService | null {
    return this.workspaceConfigService!;
  }

  get pluginService(): WorkspacePluginService | null {
    return this.workspacePluginService!;
  }

  get setupService(): WorkspaceSetupService | null {
    return this.workspaceSetupService!;
  }
}

const searchForChildWorkspacePaths = async (
  clientRuntime: ClientRuntime,
  workspacePath: string,
): Promise<string[]> => {
  // Search for files called "stagewise.json" inside the cwd
  const result = await clientRuntime.fileSystem.glob('stagewise.json', {
    absoluteSearchPath: workspacePath,
    respectGitignore: true,
    excludePatterns: [
      '**/node_modules/',
      '**/dist/',
      '**/build/',
      '**/binaries/',
      '**/bin/',
    ],
  });

  const paths = result.absolutePaths.map((res) => path.dirname(res)) ?? [];

  return paths;
};
