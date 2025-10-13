/**
 * This file contains the workspace setup service class.
 * The workspace setup service is responsible for guiding the user through the setup process of the workspace.
 * Once the setup is finished, this service will notify all listeners and clean the UI state for the setup process.
 *
 * Running this service should only be mandatory if the workspace wasn't setup before. Otherwise, this can simply be skipped and will lead to confusion.
 *
 * Setup progress isn't stored, and if a setup was done is only determined based on the fact if a config file existed or not.
 */

import type { Logger } from '@/services/logger';
import type { KartonService } from '@/services/karton';
import fs from 'node:fs';
import path from 'node:path';
import {
  type WorkspaceConfig,
  workspaceConfigSchema,
} from '@stagewise/karton-contract/shared-types';

export class ConfigNotExistingException extends Error {
  constructor() {
    super('Config not existing');
  }
}

export class WorkspaceSetupService {
  private logger: Logger;
  private kartonService: KartonService;
  private workspacePath: string;
  private _setupCompleted = false;
  private onSetupCompleted?: (config: WorkspaceConfig | null) => void;

  private constructor(
    logger: Logger,
    kartonService: KartonService,
    workspacePath: string,
    onSetupCompleted?: (config: WorkspaceConfig | null) => void,
  ) {
    this.logger = logger;
    this.kartonService = kartonService;
    this.workspacePath = workspacePath;
    this.onSetupCompleted = onSetupCompleted;
  }

  private async initialize(): Promise<void> {
    this.logger.debug('[WorkspaceSetupService] Initializing...');
    const configFilePath = path.join(this.workspacePath, 'stagewise.json');
    const configFileExisting = fs.existsSync(configFilePath);
    if (configFileExisting) {
      // Check if the existing config file is valid. If yes, we make an early exit out of the init function and report the proper values.
      this.logger.debug(
        '[WorkspaceSetupService] Existing config file found. Checking for validity...',
      );
      const configFile = fs.readFileSync(configFilePath, 'utf-8');
      const validatedConfig = workspaceConfigSchema.safeParse(
        JSON.parse(configFile),
      );
      if (validatedConfig.success) {
        this.logger.debug(
          '[WorkspaceSetupService] Config file is valid. Setting setup completed to true..',
        );
        this._setupCompleted = true;
        this.onSetupCompleted?.(null);
        return;
      }
    }

    // Register karton procedure handlers
    this.kartonService.registerServerProcedureHandler(
      'workspace.setup.checkForActiveAppOnPort',
      this.handleCheckForActiveAppOnPort.bind(this),
    );
    this.kartonService.registerServerProcedureHandler(
      'workspace.setup.submit',
      this.handleSetupSubmission.bind(this),
    );

    // Update the karton state to reflect
    this.kartonService.setState((draft) => {
      if (draft.workspace) {
        draft.workspace.setupActive = true;
      }
    });

    this.logger.debug(
      '[WorkspaceSetupService] Config file is invalid. Setting setup completed to false...',
    );
    this._setupCompleted = false;
  }

  public static async create(
    logger: Logger,
    kartonService: KartonService,
    workspacePath: string,
    onSetupCompleted?: (config: WorkspaceConfig | null) => void,
  ): Promise<WorkspaceSetupService> {
    const instance = new WorkspaceSetupService(
      logger,
      kartonService,
      workspacePath,
      onSetupCompleted,
    );
    await instance.initialize();
    return instance;
  }

  public async teardown(): Promise<void> {
    this.kartonService.removeServerProcedureHandler(
      'workspace.setup.checkForActiveAppOnPort',
    );
    this.kartonService.removeServerProcedureHandler('workspace.setup.submit');

    this.kartonService.setState((draft) => {
      if (draft.workspace) {
        draft.workspace.setupActive = false;
      }
    });
    this._setupCompleted = false;
  }

  public async handleSetupSubmission(config: WorkspaceConfig): Promise<void> {
    // Check if the given data is valid.
    this.logger.debug(
      `[WorkspaceSetupService] Validating config: ${JSON.stringify(config)}`,
    );
    const validatedConfig = workspaceConfigSchema.safeParse(config);
    if (!validatedConfig.success) {
      throw new Error('Invalid config', { cause: validatedConfig.error });
    }

    // Update the karton state to reflect the new config
    this.kartonService.setState((draft) => {
      if (draft.workspace) {
        draft.workspace.setupActive = false;
      }
    });

    this.logger.debug(
      `[WorkspaceSetupService] Finished setup submission and notifying listeners`,
    );

    // Notify the listeners
    this._setupCompleted = true;
    this.onSetupCompleted?.(validatedConfig.data);
  }

  private async handleCheckForActiveAppOnPort(port: number): Promise<boolean> {
    this.logger.debug(
      `[WorkspaceSetupService] Checking for active app on port ${port}...`,
    );
    const result = await fetch(`http://localhost:${port}/`, {
      method: 'GET',
      redirect: 'follow',
    })
      .then((res) => {
        this.logger.debug(
          `[WorkspaceSetupService] Result from port ${port}: ${res.status} ${res.statusText}`,
        );
        return res.status === 200;
      })
      .catch((err) => {
        this.logger.debug(
          `[WorkspaceSetupService] Error while checking for active app on port ${port}: ${err}`,
        );
        return false;
      });

    return result;
  }

  public get setupCompleted(): boolean {
    return this._setupCompleted;
  }
}
