/**
 * This file contains the workspace config service class.
 * The workspace config service loads the config file in the workspace and also offers a way to update the config.
 * When the config doesn't exist, the instantiation of this service will fail with an error "ConfigNotExistingException".
 */

import type { Logger } from '@/services/logger';
import type { KartonService } from '@/services/karton';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { WorkspaceLoadingOverrides } from './loading-overrides';
import {
  type WorkspaceConfig,
  workspaceConfigSchema,
} from '@stagewise/karton-contract/shared-types';

export class ConfigNotExistingException extends Error {
  constructor() {
    super('Config not existing');
  }
}

export class WorkspaceConfigService {
  private config: WorkspaceConfig | null = null;
  private configUpdatedListeners: ((
    config: WorkspaceConfig,
    oldConfig: WorkspaceConfig | null,
  ) => void)[] = [];
  private logger: Logger;
  private kartonService: KartonService;
  private workspacePath: string;
  private workspaceLoadingOverrides: WorkspaceLoadingOverrides | null = null;

  private constructor(
    logger: Logger,
    kartonService: KartonService,
    workspacePath: string,
    workspaceLoadingOverrides: WorkspaceLoadingOverrides | null = null,
  ) {
    this.logger = logger;
    this.kartonService = kartonService;
    this.workspacePath = workspacePath;
    this.workspaceLoadingOverrides = workspaceLoadingOverrides;
  }

  private async initialize(
    newConfig: WorkspaceConfig | null = null,
  ): Promise<void> {
    this.logger.debug('[WorkspaceConfigService] Initializing...');

    // If a initial config was passed, we use that instead of the config file and immediately store it
    if (newConfig) {
      this.logger.debug(
        `[WorkspaceConfigService] Received initial config: ${JSON.stringify(newConfig)}`,
      );
      const parsedConfig = workspaceConfigSchema.safeParse(newConfig);
      if (!parsedConfig.success) {
        this.logger.error('The workspace config is invalid.', {
          cause: parsedConfig.error,
        });
        throw new Error('Invalid workspace config');
      }
      this.config = newConfig;
      void this.saveConfigFile();
      this.kartonService.setState((draft) => {
        if (draft.workspace) {
          draft.workspace.config = parsedConfig.data;
        }
      });
    } else {
      const configFilePath = path.join(this.workspacePath, 'stagewise.json');
      const configFile = await fs
        .readFile(configFilePath, 'utf-8')
        .catch(() => {
          this.logger.debug(
            '[WorkspaceConfigService] No workspace config file found.',
          );
          throw new ConfigNotExistingException();
        });
      const storedConfig = workspaceConfigSchema.parse(JSON.parse(configFile));

      // Now, we validate the loaded config and set that as the current config in this service.
      // If the config is invalid, we throw an error.
      const parsedConfig = workspaceConfigSchema.safeParse(storedConfig);
      if (!parsedConfig.success) {
        this.logger.error('The workspace config file is invalid.', {
          cause: parsedConfig.error,
          path: configFilePath,
        });
        throw new Error('Invalid workspace config');
      }
      this.config = parsedConfig.data;

      // We also store the config once it's validated. We do that to make sure that the stored config is always aligned with the schema.
      this.logger.debug(
        '[WorkspaceConfigService] Saving config file after validation...',
      );
      void this.saveConfigFile();

      // If a workspace loading override was set, now is the time to override the parts of the config that were overridden.
      // We only do this once on initialization.
      if (this.workspaceLoadingOverrides) {
        this.config.appPort =
          this.workspaceLoadingOverrides.appPort ?? this.config.appPort;
      }

      this.kartonService.setState((draft) => {
        if (draft.workspace) {
          draft.workspace.config = this.config;
        }
      });
    }

    this.kartonService.registerServerProcedureHandler(
      'workspace.config.set',
      async (config: WorkspaceConfig) => this.set(config),
    );

    this.logger.debug('[WorkspaceConfigService] Initialized');
  }

  public static async create(
    logger: Logger,
    kartonService: KartonService,
    workspacePath: string,
    workspaceLoadingOverrides: WorkspaceLoadingOverrides | null = null,
    initialConfig: WorkspaceConfig | null = null,
  ): Promise<WorkspaceConfigService> {
    const instance = new WorkspaceConfigService(
      logger,
      kartonService,
      workspacePath,
      workspaceLoadingOverrides,
    );
    await instance.initialize(initialConfig);
    return instance;
  }

  public async teardown(): Promise<void> {
    this.logger.debug('[WorkspaceConfigService] Teardown called');
    this.config = null;
    this.configUpdatedListeners = [];
    this.kartonService.removeServerProcedureHandler('workspace.config.set');
  }

  public get(): WorkspaceConfig {
    if (!this.config) {
      this.logger.error(
        '[WorkspaceConfigService] Requested workspace config, but it is not initialized',
      );
      throw new Error('Workspace config not initialized');
    }
    return structuredClone(this.config);
  }

  /**
   * Set the workspace config and notify all listeners.
   *
   * The config in the service will not be updated till all listeners have been notified.
   * This is done to allow the listeners to compare both old and new config.
   * @param newConfig
   */
  public async set(newConfig: WorkspaceConfig): Promise<void> {
    this.logger.debug('[WorkspaceConfigService] Setting workspace config...');
    const oldConfig = structuredClone(this.config);
    const parsedConfig = workspaceConfigSchema.parse(newConfig);
    this.config = parsedConfig;
    await this.saveConfigFile();
    this.kartonService.setState((draft) => {
      if (draft.workspace) {
        draft.workspace.config = this.config;
      }
    });
    this.configUpdatedListeners.forEach((listener) =>
      listener(newConfig, oldConfig),
    );
    this.logger.debug(
      `[WorkspaceConfigService] Workspace config set: ${JSON.stringify(this.config)}`,
    );
  }

  private async saveConfigFile(): Promise<void> {
    const configPath = path.join(this.workspacePath, 'stagewise.json');
    this.logger.debug(
      `[WorkspaceConfigService] Saving config file to path ${configPath}...`,
    );
    const config = workspaceConfigSchema.parse(this.config);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), {
      encoding: 'utf-8',
      flush: true,
    });
    this.logger.debug('[WorkspaceConfigService] Config file saved');
  }

  public addConfigUpdatedListener(
    listener: (
      config: WorkspaceConfig,
      oldConfig: WorkspaceConfig | null,
    ) => void,
  ): void {
    this.logger.debug(
      '[WorkspaceConfigService] Adding config updated listener...',
    );
    this.configUpdatedListeners.push(listener);
  }

  public removeConfigUpdatedListener(
    listener: (
      config: WorkspaceConfig,
      oldConfig: WorkspaceConfig | null,
    ) => void,
  ): void {
    this.logger.debug(
      '[WorkspaceConfigService] Removing config updated listener...',
    );
    this.configUpdatedListeners = this.configUpdatedListeners.filter(
      (l) => l !== listener,
    );
  }
}
