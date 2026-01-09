/**
 * This file contains the workspace config service class.
 * The workspace config service loads the config file in the workspace and also offers a way to update the config.
 * When the config doesn't exist, the instantiation of this service will fail with an error "ConfigNotExistingException".
 */

import type { Logger } from '@/services/logger';
import type { KartonService } from '@/services/karton';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  type WorkspaceConfig,
  workspaceConfigSchema,
} from '@shared/karton-contracts/ui/shared-types';
import { DisposableService } from '@/services/disposable';

export class ConfigNotExistingException extends Error {
  constructor() {
    super('Config not existing');
  }
}

export class WorkspaceConfigService extends DisposableService {
  private config: WorkspaceConfig | null = null;
  private configUpdatedListeners: ((
    config: WorkspaceConfig,
    oldConfig: WorkspaceConfig | null,
  ) => void)[] = [];
  private readonly logger: Logger;
  private readonly uiKarton: KartonService;
  private readonly workspacePath: string;

  private constructor(
    logger: Logger,
    uiKarton: KartonService,
    workspacePath: string,
  ) {
    super();
    this.logger = logger;
    this.uiKarton = uiKarton;
    this.workspacePath = workspacePath;
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
      this.uiKarton.setState((draft) => {
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

      this.uiKarton.setState((draft) => {
        if (draft.workspace) {
          draft.workspace.config = this.config;
        }
      });
    }

    this.uiKarton.registerServerProcedureHandler(
      'workspace.config.set',
      async (_callingClientId: string, config: WorkspaceConfig) =>
        this.set(config),
    );

    this.logger.debug('[WorkspaceConfigService] Initialized');
  }

  public static async create(
    logger: Logger,
    uiKarton: KartonService,
    workspacePath: string,
    initialConfig: WorkspaceConfig | null = null,
  ): Promise<WorkspaceConfigService> {
    const instance = new WorkspaceConfigService(
      logger,
      uiKarton,
      workspacePath,
    );
    await instance.initialize(initialConfig);
    return instance;
  }

  protected onTeardown(): void {
    this.logger.debug('[WorkspaceConfigService] Teardown called');
    this.config = null;
    this.configUpdatedListeners = [];
    this.uiKarton.removeServerProcedureHandler('workspace.config.set');
    this.logger.debug('[WorkspaceConfigService] Teardown complete');
  }

  public get(): WorkspaceConfig {
    this.assertNotDisposed();
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
    this.uiKarton.setState((draft) => {
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
