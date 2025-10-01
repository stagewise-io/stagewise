/**
 * This file contains the workspace config service class.
 * The workspace config service loads the config file in the workspace and also offers a way to update the config.
 * When the config doesn't exist, the instantiation of this service will fail with an error "ConfigNotExistingException".
 */

import type { Logger } from '@/services/logger';
import type { KartonService } from '@/services/karton';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { WorkspaceLoadingOverrides } from '../loading-overrides';

const pluginSchema = z.union([
  z.string(),
  z
    .object({
      name: z.string(),
      path: z.string().optional(),
      url: z.string().optional(),
    })
    .refine((data) => (data.path && !data.url) || (!data.path && data.url), {
      message: 'Plugin must have either path or url, but not both',
    }),
]);

export const workspaceConfigSchema = z
  .object({
    appPort: z.number(),
    eddyMode: z.enum(['flappy']).optional(),
    autoPlugins: z.boolean().optional(),
    plugins: z.array(pluginSchema).optional(),
  })
  .passthrough();

export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;

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

  private async initialize(): Promise<void> {
    this.logger.debug('[WorkspaceConfigService] Initializing...');
    const configFilePath = path.join(this.workspacePath, 'stagewise.json');
    const configFile = await fs.readFile(configFilePath, 'utf-8').catch(() => {
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
      throw new Error('Invalid global config');
    }
    this.config = parsedConfig.data;

    // If a workspace loading override was set, now is the time to override the parts of the config that were overridden.
    // We only do this once on initialization.
    if (this.workspaceLoadingOverrides) {
      this.config.appPort =
        this.workspaceLoadingOverrides.appPort ?? this.config.appPort;
    }

    this.kartonService.setState((draft) => {
      if (draft.workspace) {
        draft.workspace.config = {
          appPort: parsedConfig.data.appPort,
          eddyMode: parsedConfig.data.eddyMode,
          autoPlugins: parsedConfig.data.autoPlugins ?? true,
          plugins: parsedConfig.data.plugins ?? [],
        };
      }
    });

    // We also store the config once it's validated. We do that to make sure that the stored config is always aligned with the schema.
    this.logger.debug(
      '[WorkspaceConfigService] Saving config file after validation...',
    );
    await this.saveConfigFile();
    this.logger.debug('[WorkspaceConfigService] Initialized');
  }

  public static async create(
    logger: Logger,
    kartonService: KartonService,
    workspacePath: string,
    workspaceLoadingOverrides: WorkspaceLoadingOverrides | null = null,
  ): Promise<WorkspaceConfigService> {
    const instance = new WorkspaceConfigService(
      logger,
      kartonService,
      workspacePath,
      workspaceLoadingOverrides,
    );
    await instance.initialize();
    return instance;
  }

  public async teardown(): Promise<void> {
    this.logger.debug('[WorkspaceConfigService] Teardown called');
    this.config = null;
    this.configUpdatedListeners = [];
  }

  /**
   * This function should be used to create a new config file for a workspace.
   * The service will only start if the config file exists.
   */
  public static async createNewConfigFile(
    config: WorkspaceConfig,
    workspacePath: string,
  ) {
    const configPath = path.join(workspacePath, 'stagewise.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
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
    await this.saveConfigFile();
    this.config = newConfig;
    this.configUpdatedListeners.forEach((listener) =>
      listener(newConfig, oldConfig),
    );
    this.logger.debug('[WorkspaceConfigService] Workspace config set');
  }

  private async saveConfigFile(): Promise<void> {
    this.logger.debug('[WorkspaceConfigService] Saving config file...');
    const configPath = path.join(this.workspacePath, 'stagewise.json');
    const config = workspaceConfigSchema.parse(this.config);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
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
