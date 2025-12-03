/**
 * This file hosts the workspace manager service that orchestrates the loading and unloading of workspaces.
 *
 * Workspaces are loaded through the WorkspaceService, that get's instantiated and torn down by the workspace manager.
 */

import { WorkspaceService } from './workspace';
import type { Logger } from './logger';
import type { FilePickerService } from './file-picker';
import type { TelemetryService } from './telemetry';
import type { KartonService } from './karton';
import type { AuthService } from './auth';
import type { GlobalDataPathService } from './global-data-path';
import type { NotificationService } from './notification';
import type { GlobalConfigService } from './global-config';

export class WorkspaceManagerService {
  private currentWorkspace: WorkspaceService | null = null;
  private logger: Logger;
  private filePickerService: FilePickerService;
  private telemetryService: TelemetryService;
  private kartonService: KartonService;
  private globalConfigService: GlobalConfigService;
  private authService: AuthService;
  private globalDataPathService: GlobalDataPathService;
  private notificationService: NotificationService;
  private workspaceChangeListeners: (() => void)[] = [];

  private constructor(
    logger: Logger,
    filePickerService: FilePickerService,
    telemetryService: TelemetryService,
    kartonService: KartonService,
    globalConfigService: GlobalConfigService,
    authService: AuthService,
    globalDataPathService: GlobalDataPathService,
    notificationService: NotificationService,
  ) {
    this.logger = logger;
    this.filePickerService = filePickerService;
    this.telemetryService = telemetryService;
    this.kartonService = kartonService;
    this.globalConfigService = globalConfigService;
    this.authService = authService;
    this.globalDataPathService = globalDataPathService;
    this.notificationService = notificationService;
  }

  private async initialize() {
    this.kartonService.setState((draft) => {
      draft.workspace = null;
      draft.workspaceStatus = 'closed';
    });

    this.kartonService.registerServerProcedureHandler(
      'workspace.open',
      async (workspacePath) => {
        await this.loadWorkspace(workspacePath);
      },
    );

    this.kartonService.registerServerProcedureHandler(
      'workspace.close',
      async () => {
        await this.unloadWorkspace();
      },
    );
  }

  public static async create(
    logger: Logger,
    filePickerService: FilePickerService,
    telemetryService: TelemetryService,
    kartonService: KartonService,
    globalConfigService: GlobalConfigService,
    authService: AuthService,
    globalDataPathService: GlobalDataPathService,
    notificationService: NotificationService,
  ) {
    const instance = new WorkspaceManagerService(
      logger,
      filePickerService,
      telemetryService,
      kartonService,
      globalConfigService,
      authService,
      globalDataPathService,
      notificationService,
    );
    await instance.initialize();
    logger.debug('[WorkspaceManagerService] Created service');
    return instance;
  }

  public async loadWorkspace(
    workspacePath?: string,
    loadedOnStart = false,
    pathGivenInStartingArg = false,
    wrappedCommand?: string,
  ) {
    // Fail if there already is a workspace loaded.
    if (this.currentWorkspace) {
      this.logger.error(
        '[WorkspaceManagerService] Requested to load workspace, but one is already loaded.',
      );
      throw new Error('A workspace is already loaded.');
    }

    this.logger.debug('[WorkspaceManagerService] Loading workspace...');

    this.kartonService.setState((draft) => {
      draft.workspaceStatus = 'loading';
    });

    // If no workspace path is provided, we wait for a user selection through the file picker.
    const selectedPath =
      workspacePath ??
      (
        await this.filePickerService.createRequest({
          title: 'Select a workspace',
          description: 'Select a workspace to load',
          type: 'directory',
          multiple: false,
        })
      )[0];

    if (!selectedPath) {
      this.logger.debug(
        '[WorkspaceManagerService] No workspace path selected. Returning early.',
      );
      return;
    }

    this.logger.debug(
      `[WorkspaceManagerService] Opening workspace at path: "${selectedPath}"`,
    );

    // If a workspace path is provided, we use it.
    // Instantiate a new workspace service within the correct working directory etc.
    // Initialize the workspace service.
    this.currentWorkspace = await WorkspaceService.create(
      this.logger,
      this.telemetryService,
      this.kartonService,
      this.globalConfigService,
      this.authService,
      this.globalDataPathService,
      this.notificationService,
      selectedPath!,
      loadedOnStart,
      pathGivenInStartingArg,
      wrappedCommand,
    ).catch((error) => {
      this.logger.error(
        `[WorkspaceManagerService] Failed to create workspace service. Reason: ${error}`,
      );
      this.notificationService.showNotification({
        title: 'Failed to load workspace',
        message: `Failed to load workspace at path: "${selectedPath}". Reason: ${error}`,
        type: 'error',
        duration: 20000, // 20 seconds
        actions: [],
      });
      return null;
    });

    if (!this.currentWorkspace) {
      this.logger.error(
        '[WorkspaceManagerService] Failed to create workspace service. Abort loading workspace.',
      );
      // Make sure that the karton state for the workspace section is cleaned up
      this.kartonService.setState((draft) => {
        draft.workspaceStatus = 'closed';
        draft.workspace = null;
      });
      return;
    }

    this.kartonService.setState((draft) => {
      draft.workspaceStatus = 'open';
    });

    this.workspaceChangeListeners.forEach((listener) => listener());

    this.logger.debug('[WorkspaceManagerService] Loaded workspace');
  }

  public async unloadWorkspace() {
    // Fail if there is no workspace loaded.
    if (!this.currentWorkspace) {
      this.logger.error(
        '[WorkspaceManagerService] Requested to unload workspace, but none is loaded.',
      );
      throw new Error('No workspace is loaded.');
    }
    this.logger.debug('[WorkspaceManagerService] Unloading workspace...');

    this.kartonService.setState((draft) => {
      draft.workspaceStatus = 'closing';
    });

    await this.currentWorkspace.teardown();
    this.currentWorkspace = null;

    this.kartonService.setState((draft) => {
      draft.workspaceStatus = 'closed';
    });

    this.workspaceChangeListeners.forEach((listener) => listener());

    this.logger.debug('[WorkspaceManagerService] Unloaded workspace');
  }

  public async shutdown() {
    this.logger.debug('[WorkspaceManagerService] Shutting down...');
    // Close the opened workspace (if it exists).
    if (this.currentWorkspace) {
      await this.unloadWorkspace();
    }
    this.workspaceChangeListeners = [];

    this.logger.debug('[WorkspaceManagerService] Shutdown complete');
  }

  public registerWorkspaceChangeListener(listener: () => void) {
    this.workspaceChangeListeners.push(listener);
  }

  public removeWorkspaceChangeListener(listener: () => void) {
    this.workspaceChangeListeners = this.workspaceChangeListeners.filter(
      (l) => l !== listener,
    );
  }

  get workspace(): WorkspaceService | null {
    return this.currentWorkspace;
  }
}
