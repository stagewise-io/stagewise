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
import type { GlobalDataPathService } from './global-data-path';
import type { NotificationService } from './notification';

type WorkspaceChangedEvent =
  | { type: 'loaded'; selectedPath: string; accessPath?: string }
  | { type: 'unloaded' }
  | {
      type: 'setupCompleted';
      workspacePath: string;
      absoluteAgentAccessPath?: string;
      name?: string;
    };

export class WorkspaceManagerService {
  private currentWorkspace: WorkspaceService | null = null;
  private logger: Logger;
  private filePickerService: FilePickerService;
  private telemetryService: TelemetryService;
  private uiKarton: KartonService;
  private globalDataPathService: GlobalDataPathService;
  private notificationService: NotificationService;
  private workspaceChangeListeners: ((event: WorkspaceChangedEvent) => void)[] =
    [];
  private constructor(
    logger: Logger,
    filePickerService: FilePickerService,
    telemetryService: TelemetryService,
    uiKarton: KartonService,
    globalDataPathService: GlobalDataPathService,
    notificationService: NotificationService,
  ) {
    this.logger = logger;
    this.filePickerService = filePickerService;
    this.telemetryService = telemetryService;
    this.uiKarton = uiKarton;
    this.globalDataPathService = globalDataPathService;
    this.notificationService = notificationService;
  }

  private async initialize() {
    this.uiKarton.setState((draft) => {
      draft.workspace = null;
      draft.workspaceStatus = 'closed';
    });

    this.uiKarton.registerServerProcedureHandler(
      'workspace.open',
      async (workspacePath) => {
        await this.loadWorkspace(workspacePath);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
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
    uiKarton: KartonService,
    globalDataPathService: GlobalDataPathService,
    notificationService: NotificationService,
  ) {
    const instance = new WorkspaceManagerService(
      logger,
      filePickerService,
      telemetryService,
      uiKarton,
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

    this.uiKarton.setState((draft) => {
      draft.workspaceStatus = 'loading';
    });

    // If no workspace path is provided, we wait for a user selection through the file picker.
    const selectedPath =
      workspacePath !== undefined
        ? workspacePath
        : (
            await this.filePickerService.createRequest({
              title: 'Select a workspace',
              description: 'Select a workspace to load',
              type: 'directory',
              multiple: false,
            })
          )?.[0];

    if (!selectedPath) {
      this.logger.debug(
        '[WorkspaceManagerService] No workspace path selected. Returning early.',
      );
      this.uiKarton.setState((draft) => {
        draft.workspaceStatus = 'closed';
      });
      return;
    }

    this.logger.debug(
      `[WorkspaceManagerService] Opening workspace at path: "${selectedPath}"`,
    );

    this.uiKarton.setState((draft) => {
      draft.workspaceStatus = 'setup';
    });

    // If a workspace path is provided, we use it.
    // Instantiate a new workspace service within the correct working directory etc.
    // Initialize the workspace service.
    this.currentWorkspace = await WorkspaceService.create(
      this.logger,
      this.telemetryService,
      this.uiKarton,
      this.globalDataPathService,
      this.notificationService,
      selectedPath!,
      loadedOnStart,
      pathGivenInStartingArg,
      wrappedCommand,
      (workspacePath, absoluteAgentAccessPath, name) => {
        this.workspaceChangeListeners.forEach((listener) =>
          listener({
            type: 'setupCompleted',
            workspacePath,
            absoluteAgentAccessPath,
            name,
          }),
        );
        this.uiKarton.setState((draft) => {
          draft.workspaceStatus = 'open';
        });
      },
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
      this.uiKarton.setState((draft) => {
        draft.workspaceStatus = 'closed';
        draft.workspace = null;
      });
      return;
    }

    this.workspaceChangeListeners.forEach(async (listener) => {
      listener({
        type: 'loaded',
        selectedPath,
        accessPath: this.currentWorkspace?.configService?.get().agentAccessPath,
      });
    });

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

    this.uiKarton.setState((draft) => {
      draft.workspaceStatus = 'closing';
    });

    await this.currentWorkspace.teardown();
    this.currentWorkspace = null;

    this.uiKarton.setState((draft) => {
      draft.workspaceStatus = 'closed';
    });

    this.workspaceChangeListeners.forEach((listener) =>
      listener({ type: 'unloaded' }),
    );
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

  public registerWorkspaceChangeListener(
    listener: (event: WorkspaceChangedEvent) => void,
  ) {
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
