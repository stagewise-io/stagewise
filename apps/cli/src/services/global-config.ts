import type { GlobalDataPathService } from './global-data-path';
import { z } from 'zod';
import fs from 'node:fs/promises';
import type { Logger } from './logger';

const globalConfigSchema = z
  .object({
    telemetryLevel: z.enum(['off', 'anonymous', 'full']).default('anonymous'),
  })
  .passthrough();

export type GlobalConfig = z.infer<typeof globalConfigSchema>;

/**
 * The global config service gives access to a global config objects that's stored
 * independently of any workspace etc.
 */
export class GlobalConfigService {
  private globalDataPathService: GlobalDataPathService;
  private config: GlobalConfig | null = null;
  private configUpdatedListeners: ((config: GlobalConfig) => void)[] = [];
  private logger: Logger;

  private constructor(
    globalDataPathService: GlobalDataPathService,
    logger: Logger,
  ) {
    this.globalDataPathService = globalDataPathService;
    this.logger = logger;
  }

  private async initialize(): Promise<void> {
    // TODO: Load the global config file (if it exists), validate it and set it as the current config in this service.
    const configPath = this.globalDataPathService.configFilePath;
    const configFile = await fs.readFile(configPath, 'utf-8');
    const storedConfig = globalConfigSchema.parse(JSON.parse(configFile));

    // Now, we validate the loaded config and set that as the current config in this service.
    // If the config is invalid, we throw an error.
    const parsedConfig = globalConfigSchema.safeParse(storedConfig);
    if (!parsedConfig.success) {
      this.logger.error('The global config file is invalid.', {
        cause: parsedConfig.error,
        path: configPath,
      });
      throw new Error('Invalid global config');
    }
    this.config = parsedConfig.data;

    // We also store the config once it's validated. We do that to make sure that the stored config is always aligned with the schema.
    await this.saveConfigFile();
  }

  public static async create(
    globalDataPathService: GlobalDataPathService,
    logger: Logger,
  ): Promise<GlobalConfigService> {
    const instance = new GlobalConfigService(globalDataPathService, logger);
    await instance.initialize();
    return instance;
  }

  public get(): GlobalConfig {
    if (!this.config) {
      throw new Error('Global config not initialized');
    }
    return structuredClone(this.config);
  }

  /**
   * Set the global config and notify all listeners.
   *
   * The config in the servcie will not be updated till all listeners have been notified.
   * This is done to allow the listeners to compare both old and new config.
   * @param newConfig
   */
  public async set(newConfig: GlobalConfig): Promise<void> {
    this.configUpdatedListeners.forEach((listener) => listener(newConfig));
    await this.saveConfigFile();
    this.config = newConfig;
  }

  private async saveConfigFile(): Promise<void> {
    // TODO: Store the config file in the global data path if it doesn't exist
    const configPath = this.globalDataPathService.configFilePath;
    const config = globalConfigSchema.parse(this.config);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  public addConfigUpdatedListener(
    listener: (config: GlobalConfig) => void,
  ): void {
    this.configUpdatedListeners.push(listener);
  }

  public removeConfigUpdatedListener(
    listener: (config: GlobalConfig) => void,
  ): void {
    this.configUpdatedListeners = this.configUpdatedListeners.filter(
      (l) => l !== listener,
    );
  }
}
