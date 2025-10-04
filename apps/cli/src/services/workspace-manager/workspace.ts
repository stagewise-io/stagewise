/**
 * This file contains the workspace service class that is responsible for loading and unloading all the functionality surrounding a workspace.
 */

import { discoverDependencies } from '@/utils/dependency-parser';
import { AgentService } from '@/services/agent';
import { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import type { KartonService } from '../karton';
import type { Logger } from '../logger';
import type { TelemetryService } from '../telemetry';
import type { WorkspaceLoadingOverrides } from './loading-overrides';
import { WorkspaceConfigService } from './workspace-services/config';
import { WorkspacePluginService } from './workspace-services/plugin';
import { WorkspaceSetupService } from './workspace-services/setup';
import type { AuthService } from '../auth';
import { RagService } from '../rag';

export class WorkspaceService {
  private logger: Logger;
  private telemetryService: TelemetryService;
  private kartonService: KartonService;
  private authService: AuthService;
  private workspacePath: string;
  private workspaceLoadingOverrides: WorkspaceLoadingOverrides | null = null;
  private loadedOnStart = false;
  private pathGivenInStartingArg = false;
  // Workspace child services
  private workspaceConfigService: WorkspaceConfigService | null = null;
  private workspacePluginService: WorkspacePluginService | null = null;
  private workspaceSetupService: WorkspaceSetupService | null = null;
  private agentService: AgentService | null = null;
  private ragService: RagService | null = null;

  private constructor(
    logger: Logger,
    telemetryService: TelemetryService,
    kartonService: KartonService,
    authService: AuthService,
    workspacePath: string,
    workspaceLoadingOverrides: WorkspaceLoadingOverrides | null,
    loadedOnStart: boolean,
    pathGivenInStartingArg: boolean,
  ) {
    this.logger = logger;
    this.telemetryService = telemetryService;
    this.kartonService = kartonService;
    this.authService = authService;
    this.workspacePath = workspacePath;
    this.workspaceLoadingOverrides = workspaceLoadingOverrides;
    this.loadedOnStart = loadedOnStart;
    this.pathGivenInStartingArg = pathGivenInStartingArg;
  }

  public async initialize() {
    this.logger.debug('[WorkspaceService] Initializing...');

    this.kartonService.setState((draft) => {
      draft.workspace = {
        agentChat: null,
        devAppStatus: null,
        path: this.workspacePath,
        config: null,
        plugins: null,
        setupActive: false,
        loadedOnStart: this.loadedOnStart,
      };
    });

    // Start all child services of the workspace. All regular services should only be staarted if the setup service is done.
    this.workspaceSetupService = await WorkspaceSetupService.create(
      this.logger,
      this.kartonService,
      this.workspacePath,
      async (setupConfig) => {
        this.workspaceConfigService = await WorkspaceConfigService.create(
          this.logger,
          this.kartonService,
          this.workspacePath,
          this.workspaceLoadingOverrides,
          setupConfig,
        );

        this.workspacePluginService = await WorkspacePluginService.create(
          this.logger,
          this.kartonService,
          this.workspaceConfigService,
          this.workspacePath,
        );

        const clientRuntime = new ClientRuntimeNode({
          workingDirectory: this.workspacePath,
        });

        this.agentService = await AgentService.create(
          this.logger,
          this.telemetryService,
          this.kartonService,
          this.authService,
          clientRuntime,
        );

        this.ragService = await RagService.create(
          this.logger,
          this.telemetryService,
          this.kartonService,
          this.authService,
          clientRuntime,
        );

        this.telemetryService.capture('workspace-opened', {
          auto_plugins_enabled:
            this.workspaceConfigService.get().autoPlugins ?? true,
          manual_plugins_count:
            this.workspacePluginService.loadedPlugins.filter((p) => !p.bundled)
              .length,
          loaded_plugins: this.workspacePluginService.loadedPlugins.map(
            (plugin) => plugin.name,
          ),
          has_wrapped_command: false, // TODO: Add has wrapped command flag
          codebase_line_count: 0, // TODO: Add codebase line count
          dependency_count: Object.keys(
            await discoverDependencies(this.workspacePath),
          ).length, // TODO: Add dependency count
          loading_method: this.loadedOnStart
            ? this.pathGivenInStartingArg
              ? 'on_start_with_arg'
              : 'on_start'
            : 'at_runtime_by_user_action',
          initial_setup: false, // TODO
        });
      },
    );
  }

  public static async create(
    logger: Logger,
    telemetryService: TelemetryService,
    kartonService: KartonService,
    authService: AuthService,
    workspacePath: string,
    workspaceLoadingOverrides: WorkspaceLoadingOverrides | null,
    loadedOnStart: boolean,
    pathGivenInStartingArg: boolean,
  ) {
    const instance = new WorkspaceService(
      logger,
      telemetryService,
      kartonService,
      authService,
      workspacePath,
      workspaceLoadingOverrides,
      loadedOnStart,
      pathGivenInStartingArg,
    );
    await instance.initialize();
    logger.debug('[WorkspaceService] Created service');
    return instance;
  }

  public async teardown() {
    this.logger.debug('[WorkspaceService] Teardown called');

    // TODO: Teardown all the child services hosted within this workspace.
    this.agentService?.teardown();
    this.ragService?.teardown();
    await this.workspaceSetupService?.teardown();
    await this.workspacePluginService?.teardown();
    await this.workspaceConfigService?.teardown();

    this.kartonService.setState((draft) => {
      draft.workspace = null;
    });
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
}
