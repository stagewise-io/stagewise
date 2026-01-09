import type { GlobalDataPathService } from './global-data-path';
import fs from 'node:fs/promises';
import type { Logger } from './logger';
import type { KartonService } from './karton';
import {
  type GlobalConfig,
  globalConfigSchema,
} from '@shared/karton-contracts/ui/shared-types';
import { DisposableService } from './disposable';

/**
 * The global config service gives access to a global config objects that's stored
 * independently of any workspace etc.
 */
export class GlobalConfigService extends DisposableService {
  private readonly globalDataPathService: GlobalDataPathService;
  private config: GlobalConfig | null = null;
  private configUpdatedListeners: ((
    newConfig: GlobalConfig,
    oldConfig: GlobalConfig | null,
  ) => void)[] = [];
  private readonly logger: Logger;
  private readonly uiKarton: KartonService;

  private constructor(
    globalDataPathService: GlobalDataPathService,
    logger: Logger,
    uiKarton: KartonService,
  ) {
    super();
    this.globalDataPathService = globalDataPathService;
    this.logger = logger;
    this.uiKarton = uiKarton;
  }

  private async initialize(): Promise<void> {
    this.logger.debug('[GlobalConfigService] Initializing...');
    const configPath = this.globalDataPathService.configFilePath;
    const configFile = await fs.readFile(configPath, 'utf-8').catch(() => {
      this.logger.debug(
        '[GlobalConfigService] No config file found. Creating a new one...',
      );
      return '{}';
    });

    // Now, we validate the loaded config and set that as the current config in this service.
    // If the config is invalid, we throw an error.
    const parsedConfig = globalConfigSchema.safeParse(
      safeParseJSON(configFile, {}),
    );
    if (!parsedConfig.success) {
      this.logger.error(
        `The global config file is invalid. Error: ${parsedConfig.error.message} Path: ${configPath}`,
      );
      throw new Error('Invalid global config');
    }
    this.config = parsedConfig.data;

    this.uiKarton.setState((draft) => {
      draft.globalConfig = parsedConfig.data;
    });
    this.uiKarton.registerServerProcedureHandler(
      'config.set',
      async (_callingClientId: string, config: GlobalConfig) =>
        this.set(config),
    );

    // We also store the config once it's validated. We do that to make sure that the stored config is always aligned with the schema.
    this.logger.debug(
      '[GlobalConfigService] Saving config file after validation...',
    );
    await this.saveConfigFile();
    this.logger.debug('[GlobalConfigService] Initialized');
  }

  public static async create(
    globalDataPathService: GlobalDataPathService,
    logger: Logger,
    uiKarton: KartonService,
  ): Promise<GlobalConfigService> {
    const instance = new GlobalConfigService(
      globalDataPathService,
      logger,
      uiKarton,
    );
    await instance.initialize();
    return instance;
  }

  protected onTeardown(): void {
    this.uiKarton.removeServerProcedureHandler('config.set');
    this.configUpdatedListeners = [];
    this.config = null;
    this.logger.debug('[GlobalConfigService] Teardown complete');
  }

  public get(): GlobalConfig {
    this.assertNotDisposed();
    if (!this.config) {
      this.logger.error(
        '[GlobalConfigService] Requested global config, but it is not initialized',
      );
      throw new Error('Global config not initialized');
    }
    return structuredClone(this.config);
  }

  /**
   * Set the global config and notify all listeners.
   * @param newConfig
   */
  public async set(newConfig: GlobalConfig): Promise<void> {
    this.logger.debug('[GlobalConfigService] Setting global config...');
    const oldConfig = structuredClone(this.config);
    const parsedConfig = globalConfigSchema.parse(newConfig);
    this.config = parsedConfig;
    await this.saveConfigFile();
    this.uiKarton.setState((draft) => {
      draft.globalConfig = parsedConfig;
    });
    this.configUpdatedListeners.forEach((listener) =>
      listener(newConfig, oldConfig),
    );
    this.logger.debug(
      `[GlobalConfigService] Global config set: ${JSON.stringify(this.config)}`,
    );
  }

  private async saveConfigFile(): Promise<void> {
    const configPath = this.globalDataPathService.configFilePath;
    this.logger.debug(
      `[GlobalConfigService] Saving config file to path ${configPath}...`,
    );
    const config = globalConfigSchema.parse(this.config);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    this.logger.debug('[GlobalConfigService] Config file saved');
  }

  public addConfigUpdatedListener(
    listener: (config: GlobalConfig, oldConfig: GlobalConfig | null) => void,
  ): void {
    this.logger.debug(
      '[GlobalConfigService] Adding config updated listener...',
    );
    this.configUpdatedListeners.push(listener);
  }

  public removeConfigUpdatedListener(
    listener: (config: GlobalConfig, oldConfig: GlobalConfig | null) => void,
  ): void {
    this.logger.debug(
      '[GlobalConfigService] Removing config updated listener...',
    );
    this.configUpdatedListeners = this.configUpdatedListeners.filter(
      (l) => l !== listener,
    );
  }
}

const safeParseJSON = <T>(json: string, fallback: T): T => {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
};
