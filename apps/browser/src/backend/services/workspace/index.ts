/**
 * This file contains the workspace service class that is responsible for managing workspace lifecycle.
 * It acts as a singleton manager that can load and unload workspaces.
 */

import { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import type { KartonService } from '../karton';
import type { Logger } from '../logger';
import type { TelemetryService } from '../telemetry';
import type { FilePickerService } from '../file-picker';
import type { NotificationService } from '../notification';
import { RagService } from './services/rag';
import { StaticAnalysisService } from './services/static-analysis';
import { WorkspacePathsService } from './services/paths';
import type { GlobalDataPathService } from '@/services/global-data-path';
import { DisposableService } from '../disposable';
import path from 'node:path';
import { existsSync } from 'node:fs';
import {
  generateStagewiseMd,
  STAGEWISE_MD_FILENAME,
} from '../agent/generate-stagewise-md';
import { getModelOptions } from '../agent/utils/get-model-settings';
import type { AuthService } from '../auth';
import { generateId } from 'ai';

type WorkspaceChangedEvent =
  | { type: 'loaded'; selectedPath: string; name: string }
  | { type: 'unloaded' };

export class WorkspaceService extends DisposableService {
  private readonly logger: Logger;
  private readonly filePickerService: FilePickerService;
  private readonly telemetryService: TelemetryService;
  private readonly uiKarton: KartonService;
  private readonly globalDataPathService: GlobalDataPathService;
  private readonly notificationService: NotificationService;
  private readonly authService: AuthService;

  // Workspace state (null when no workspace is loaded)
  private currentWorkspacePath: string | null = null;
  private loadedOnStart = false;
  private pathGivenInStartingArg = false;

  // Workspace child services (null when no workspace is loaded)
  private workspacePathsService: WorkspacePathsService | null = null;
  private ragService: RagService | null = null;
  private staticAnalysisService: StaticAnalysisService | null = null;

  // Change listeners
  private workspaceChangeListeners: ((event: WorkspaceChangedEvent) => void)[] =
    [];

  private constructor(
    logger: Logger,
    filePickerService: FilePickerService,
    telemetryService: TelemetryService,
    uiKarton: KartonService,
    globalDataPathService: GlobalDataPathService,
    notificationService: NotificationService,
    authService: AuthService,
  ) {
    super();
    this.logger = logger;
    this.filePickerService = filePickerService;
    this.telemetryService = telemetryService;
    this.uiKarton = uiKarton;
    this.globalDataPathService = globalDataPathService;
    this.notificationService = notificationService;
    this.authService = authService;
  }

  private async initialize() {
    this.logger.debug('[WorkspaceService] Initializing...');

    // Set initial karton state
    this.uiKarton.setState((draft) => {
      draft.workspace = null;
      draft.workspaceStatus = 'closed';
    });

    // Register karton procedure handlers
    this.uiKarton.registerServerProcedureHandler(
      'workspace.open',
      async (_callingClientId: string, workspacePath) => {
        await this.loadWorkspace(workspacePath);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'workspace.close',
      async (_callingClientId: string) => {
        await this.unloadWorkspace();
      },
    );

    this.logger.debug('[WorkspaceService] Initialized');
  }

  public static async create(
    logger: Logger,
    filePickerService: FilePickerService,
    telemetryService: TelemetryService,
    uiKarton: KartonService,
    globalDataPathService: GlobalDataPathService,
    notificationService: NotificationService,
    authService: AuthService,
  ) {
    const instance = new WorkspaceService(
      logger,
      filePickerService,
      telemetryService,
      uiKarton,
      globalDataPathService,
      notificationService,
      authService,
    );
    await instance.initialize();
    logger.debug('[WorkspaceService] Created service');
    return instance;
  }

  public async loadWorkspace(
    workspacePath?: string,
    loadedOnStart = false,
    pathGivenInStartingArg = false,
  ) {
    // Fail if there already is a workspace loaded.
    if (this.currentWorkspacePath) {
      this.logger.error(
        '[WorkspaceService] Requested to load workspace, but one is already loaded.',
      );
      throw new Error('A workspace is already loaded.');
    }

    this.logger.debug('[WorkspaceService] Loading workspace...');

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
        '[WorkspaceService] No workspace path selected. Returning early.',
      );
      this.uiKarton.setState((draft) => {
        draft.workspaceStatus = 'closed';
      });
      return;
    }

    this.logger.debug(
      `[WorkspaceService] Opening workspace at path: "${selectedPath}"`,
    );

    // Initialize workspace
    try {
      await this.initializeWorkspace(
        selectedPath,
        loadedOnStart,
        pathGivenInStartingArg,
      );
    } catch (error) {
      this.logger.error(
        `[WorkspaceService] Failed to initialize workspace. Reason: ${error}`,
      );
      this.notificationService.showNotification({
        title: 'Failed to load workspace',
        message: `Failed to load workspace at path: "${selectedPath}". Reason: ${error}`,
        type: 'error',
        duration: 20000, // 20 seconds
        actions: [],
      });
      // Make sure that the karton state for the workspace section is cleaned up
      this.uiKarton.setState((draft) => {
        draft.workspaceStatus = 'closed';
        draft.workspace = null;
      });
      return;
    }

    // Notify listeners
    this.workspaceChangeListeners.forEach((listener) => {
      listener({
        type: 'loaded',
        selectedPath,
        name: selectedPath.split(path.sep).pop() ?? '',
      });
    });

    this.logger.debug('[WorkspaceService] Loaded workspace');
  }

  private async initializeWorkspace(
    workspacePath: string,
    loadedOnStart: boolean,
    pathGivenInStartingArg: boolean,
  ) {
    this.currentWorkspacePath = workspacePath;
    this.loadedOnStart = loadedOnStart;
    this.pathGivenInStartingArg = pathGivenInStartingArg;

    this.workspacePathsService = await WorkspacePathsService.create(
      this.logger,
      this.globalDataPathService,
      workspacePath,
    );

    this.uiKarton.setState((draft) => {
      draft.workspace = {
        path: workspacePath,
        paths: {
          data: '',
          temp: '',
        },
        agent: null,
        rag: {
          lastIndexedAt: null,
          indexedFiles: 0,
          statusInfo: { isIndexing: false },
        },
        loadedOnStart: loadedOnStart,
      };
      draft.workspaceStatus = 'open';
    });

    const clientRuntime = new ClientRuntimeNode({
      workingDirectory: workspacePath,
      rgBinaryBasePath: this.globalDataPathService.globalDataPath,
    });

    void this.checkAndGenerateStagewiseMd(clientRuntime);

    this.staticAnalysisService = await StaticAnalysisService.create(
      this.logger,
      workspacePath,
    );

    this.uiKarton.setState((draft) => {
      draft.workspace!.path = workspacePath;
      draft.workspace!.paths.data =
        this.workspacePathsService!.workspaceDataPath;
      draft.workspace!.paths.temp =
        this.workspacePathsService!.workspaceTempPath;
      draft.workspace!.agent = {
        accessPath: workspacePath,
      };
    });

    this.ragService = await RagService.create(
      this.logger,
      this.telemetryService,
      this.uiKarton,
      clientRuntime,
    ).catch((error) => {
      this.telemetryService.captureException(error as Error);
      this.logger.error('[WorkspaceService] Failed to create rag service', {
        cause: error,
      });
      return null;
    });

    this.telemetryService.capture('workspace-opened', {
      codebase_line_count:
        Object.values(
          this.staticAnalysisService?.linesOfCodeCounts ?? {},
        ).reduce((acc, curr) => acc + curr, 0) ?? 0,
      dependency_count: Object.keys(
        this.staticAnalysisService?.nodeDependencies,
      ).length,
      loading_method: loadedOnStart
        ? pathGivenInStartingArg
          ? 'on_start_with_arg'
          : 'on_start'
        : 'at_runtime_by_user_action',
      initial_setup: false, // TODO: Check if stagewise.md present in workspace data path
    });
  }

  private async checkAndGenerateStagewiseMd(clientRuntime: ClientRuntime) {
    const stagewiseMdDirPath = this.workspacePathsService!.workspaceDataPath;
    if (existsSync(path.join(stagewiseMdDirPath, STAGEWISE_MD_FILENAME))) {
      this.logger.debug(
        `[WorkspaceService] stagewise.md already exists, skipping generation...`,
      );
      return;
    }

    // Make sure the access token is not expired
    await this.authService.refreshAuthState();
    if (this.authService.authState.status !== 'authenticated') return;
    const authKey = this.authService.accessToken;
    if (!authKey) return;

    const posthogTraceId = generateId();

    const modelOptions = getModelOptions('claude-haiku-4-5', authKey);
    const modelOptionsWithTracing = {
      model: this.telemetryService.withTracing(modelOptions.model, {
        posthogTraceId,
        posthogProperties: {
          $ai_span_name: 'generate-stagewise-md',
          modelId: modelOptions.model.modelId,
          posthogTraceId,
        },
      }),
      providerOptions: modelOptions.providerOptions,
      headers: modelOptions.headers,
    };

    this.logger.debug('[WorkspaceService] Generating stagewise.md...');
    await generateStagewiseMd(
      modelOptionsWithTracing,
      clientRuntime,
      new ClientRuntimeNode({
        workingDirectory: stagewiseMdDirPath,
        rgBinaryBasePath: this.globalDataPathService.globalDataPath,
      }),
    );
  }

  public async unloadWorkspace() {
    // Fail if there is no workspace loaded.
    if (!this.currentWorkspacePath) {
      this.logger.error(
        '[WorkspaceService] Requested to unload workspace, but none is loaded.',
      );
      throw new Error('No workspace is loaded.');
    }
    this.logger.debug('[WorkspaceService] Unloading workspace...');

    this.uiKarton.setState((draft) => {
      draft.workspaceStatus = 'closing';
    });

    // Teardown child services in LIFO order (reverse of creation)
    await this.ragService?.teardown();
    await this.staticAnalysisService?.teardown();
    await this.workspacePathsService?.teardown();

    // Null out references after teardown
    this.ragService = null;
    this.staticAnalysisService = null;
    this.workspacePathsService = null;
    this.currentWorkspacePath = null;

    this.uiKarton.setState((draft) => {
      draft.workspace = null;
      draft.workspaceStatus = 'closed';
    });

    // Notify listeners
    this.workspaceChangeListeners.forEach((listener) =>
      listener({ type: 'unloaded' }),
    );

    this.logger.debug('[WorkspaceService] Unloaded workspace');
  }

  protected async onTeardown(): Promise<void> {
    this.logger.debug('[WorkspaceService] Tearing down...');

    // Unregister server procedure handlers
    this.uiKarton.removeServerProcedureHandler('workspace.open');
    this.uiKarton.removeServerProcedureHandler('workspace.close');

    // Close the opened workspace (if it exists).
    if (this.currentWorkspacePath) {
      await this.unloadWorkspace();
    }
    this.workspaceChangeListeners = [];

    this.logger.debug('[WorkspaceService] Teardown complete');
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

  get isLoaded(): boolean {
    this.assertNotDisposed();
    return this.currentWorkspacePath !== null;
  }

  get id(): string {
    this.assertNotDisposed();
    if (!this.workspacePathsService) {
      throw new Error('No workspace is loaded.');
    }
    return this.workspacePathsService.workspaceId;
  }

  get path(): string {
    this.assertNotDisposed();
    if (!this.currentWorkspacePath) {
      throw new Error('No workspace is loaded.');
    }
    return this.currentWorkspacePath;
  }
}
