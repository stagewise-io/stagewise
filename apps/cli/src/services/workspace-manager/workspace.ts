/**
 * This file contains the workspace service class that is responsible for loading and unloading all the functionality surrounding a workspace.
 */

import { AgentService } from '@/services/workspace-manager/workspace-services/agent/agent';
import { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import type { KartonService } from '../karton';
import type { Logger } from '../logger';
import type { TelemetryService } from '../telemetry';
import type { WorkspaceLoadingOverrides } from './loading-overrides';
import { WorkspaceConfigService } from './workspace-services/config';
import { WorkspacePluginService } from './workspace-services/plugin';
import { WorkspaceSetupService } from './workspace-services/setup';
import type { AuthService } from '../auth';
import { RagService } from './workspace-services/rag';
import { StaticAnalysisService } from './workspace-services/static-analysis';
import { WorkspacePathsService } from './workspace-services/paths';
import type { GlobalDataPathService } from '@/services/global-data-path';
import type { NotificationService } from '../notification';
import path from 'node:path';
import { getRepoRootForPath } from '@/utils/git-tools';
import { WorkspaceDevAppStateService } from './workspace-services/dev-app-state';

export class WorkspaceService {
  private logger: Logger;
  private telemetryService: TelemetryService;
  private kartonService: KartonService;
  private authService: AuthService;
  private globalDataPathService: GlobalDataPathService;
  private notificationService: NotificationService;
  private workspacePath: string;
  private workspaceLoadingOverrides: WorkspaceLoadingOverrides | null = null;
  private loadedOnStart = false;
  private pathGivenInStartingArg = false;
  private wrappedCommand?: string;
  // Workspace child services
  private workspacePathsService: WorkspacePathsService | null = null;
  private workspaceConfigService: WorkspaceConfigService | null = null;
  private workspacePluginService: WorkspacePluginService | null = null;
  private workspaceDevAppStateService: WorkspaceDevAppStateService | null =
    null;
  private workspaceSetupService: WorkspaceSetupService | null = null;
  private _agentService: AgentService | null = null;
  private ragService: RagService | null = null;
  private staticAnalysisService: StaticAnalysisService | null = null;

  private constructor(
    logger: Logger,
    telemetryService: TelemetryService,
    kartonService: KartonService,
    authService: AuthService,
    globalDataPathService: GlobalDataPathService,
    notificationService: NotificationService,
    workspacePath: string,
    workspaceLoadingOverrides: WorkspaceLoadingOverrides | null,
    loadedOnStart: boolean,
    pathGivenInStartingArg: boolean,
    wrappedCommand?: string,
  ) {
    this.logger = logger;
    this.telemetryService = telemetryService;
    this.kartonService = kartonService;
    this.authService = authService;
    this.globalDataPathService = globalDataPathService;
    this.notificationService = notificationService;
    this.workspacePath = workspacePath;
    this.workspaceLoadingOverrides = workspaceLoadingOverrides;
    this.loadedOnStart = loadedOnStart;
    this.pathGivenInStartingArg = pathGivenInStartingArg;
    this.wrappedCommand = wrappedCommand;
  }

  public async initialize() {
    this.logger.debug('[WorkspaceService] Initializing...');

    this.workspacePathsService = await WorkspacePathsService.create(
      this.logger,
      this.globalDataPathService,
      this.workspacePath,
    );

    this.kartonService.setState((draft) => {
      draft.workspace = {
        path: this.workspacePath,
        paths: {
          data: '',
          cache: '', // TODO: Find a way to initialize these -> Datapaths are only initialized after workspace setup.
          temp: '',
        },
        inspirationComponents: [],
        agentChat: null,
        agent: null,
        devAppStatus: null,
        config: null,
        plugins: null,
        setupActive: false,
        rag: {
          lastIndexedAt: null,
          indexedFiles: 0,
          statusInfo: { isIndexing: false },
        },
        loadedOnStart: this.loadedOnStart,
      };
    });

    this.kartonService.registerServerProcedureHandler(
      'workspace.getAbsoluteAgentAccessPath',
      async () => {
        return this.getAbsoluteAgentAccessPath();
      },
    );

    const clientRuntime = new ClientRuntimeNode({
      workingDirectory: this.getAbsoluteAgentAccessPath(),
      rgBinaryBasePath: this.globalDataPathService.globalDataPath,
    });

    // Start all child services of the workspace. All regular services should only be started if the setup service is done.
    this.workspaceSetupService = await WorkspaceSetupService.create(
      this.logger,
      this.kartonService,
      this.workspacePath,
      async (setupConfig) => {
        this.workspacePath = setupConfig?.appPath ?? this.workspacePath;
        await this.workspacePathsService?.teardown();
        this.workspacePathsService = await WorkspacePathsService.create(
          this.logger,
          this.globalDataPathService,
          this.workspacePath,
        );
        this.kartonService.setState((draft) => {
          draft.workspace!.path = this.workspacePath;
          draft.workspace!.paths.data =
            this.workspacePathsService!.workspaceDataPath;
          draft.workspace!.paths.cache =
            this.workspacePathsService!.workspaceCachePath;
          draft.workspace!.paths.temp =
            this.workspacePathsService!.workspaceTempPath;
        });
        // TODO: Start everything with the right appPath!! (Not the initial workspace path)
        this.workspaceConfigService = await WorkspaceConfigService.create(
          this.logger,
          this.kartonService,
          this.workspacePath,
          this.workspaceLoadingOverrides,
          setupConfig,
        );

        this.staticAnalysisService = await StaticAnalysisService.create(
          this.logger,
          this.workspacePath,
        );

        this.workspacePluginService = await WorkspacePluginService.create(
          this.logger,
          this.kartonService,
          this.workspaceConfigService,
          this.staticAnalysisService,
          this.notificationService,
        );

        this.kartonService.setState((draft) => {
          draft.workspace!.agent = {
            accessPath: clientRuntime.fileSystem.getCurrentWorkingDirectory(),
          };
        });
        this.workspaceConfigService.addConfigUpdatedListener((newConfig) => {
          clientRuntime.updateWorkingDirectory(
            this.getAbsoluteAgentAccessPath(newConfig.agentAccessPath),
          );
          this.kartonService.setState((draft) => {
            draft.workspace!.agent = {
              accessPath: clientRuntime.fileSystem.getCurrentWorkingDirectory(),
            };
          });
        });

        this.workspaceDevAppStateService =
          await WorkspaceDevAppStateService.create(
            this.logger,
            this.telemetryService,
            this.kartonService,
            this.workspaceConfigService,
            this.workspacePath,
            this.wrappedCommand,
          );

        this.ragService =
          (await RagService.create(
            this.logger,
            this.telemetryService,
            this.kartonService,
            clientRuntime,
          ).catch((error) => {
            this.telemetryService.captureException(error as Error);
            this.logger.error(
              '[WorkspaceService] Failed to create rag service',
              {
                cause: error,
              },
            );
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
      },
    );

    this._agentService =
      (await AgentService.create(
        this.logger,
        this.telemetryService,
        this.kartonService,
        this.authService,
        clientRuntime,
        this.workspaceSetupService,
      ).catch((error) => {
        this.telemetryService.captureException(error as Error);
        this.logger.error(
          `[WorkspaceService] Failed to create agent service. Error: ${error}`,
        );
      })) ?? null;
  }

  public static async create(
    logger: Logger,
    telemetryService: TelemetryService,
    kartonService: KartonService,
    authService: AuthService,
    globalDataPathService: GlobalDataPathService,
    notificationService: NotificationService,
    workspacePath: string,
    workspaceLoadingOverrides: WorkspaceLoadingOverrides | null,
    loadedOnStart: boolean,
    pathGivenInStartingArg: boolean,
    wrappedCommand?: string,
  ) {
    const instance = new WorkspaceService(
      logger,
      telemetryService,
      kartonService,
      authService,
      globalDataPathService,
      notificationService,
      workspacePath,
      workspaceLoadingOverrides,
      loadedOnStart,
      pathGivenInStartingArg,
      wrappedCommand,
    );
    await instance.initialize();
    logger.debug('[WorkspaceService] Created service');
    return instance;
  }

  public async teardown() {
    this.logger.debug('[WorkspaceService] Teardown called');

    // TODO: Teardown all the child services hosted within this workspace.
    await this.workspaceDevAppStateService?.teardown();
    this._agentService?.teardown();
    this.ragService?.teardown();
    await this.workspaceSetupService?.teardown();
    await this.workspacePluginService?.teardown();
    await this.workspaceConfigService?.teardown();
    await this.staticAnalysisService?.teardown();
    await this.workspacePathsService?.teardown();

    this.kartonService.removeServerProcedureHandler(
      'workspace.getAbsoluteAgentAccessPath',
    );

    this.kartonService.setState((draft) => {
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

  get path(): string {
    return this.workspacePath;
  }

  get configService(): WorkspaceConfigService | null {
    return this.workspaceConfigService!;
  }

  get pluginService(): WorkspacePluginService | null {
    return this.workspacePluginService!;
  }

  get agentService(): AgentService | null {
    return this._agentService!;
  }

  get devAppStateService(): WorkspaceDevAppStateService | null {
    return this.workspaceDevAppStateService!;
  }
}
