import type { Logger } from './logger';
import type { KartonService } from './karton';
import {
  type GlobalConfig,
  globalConfigSchema,
} from '@shared/karton-contracts/ui/shared-types';
import { DisposableService } from './disposable';
import { readPersistedData, writePersistedData } from '@/utils/persisted-data';

/**
 * The global config service gives access to a global config objects that's stored
 * independently of any workspace etc.
 */
export class GlobalConfigService extends DisposableService {
  private config: GlobalConfig | null = null;
  private configUpdatedListeners: ((
    newConfig: GlobalConfig,
    oldConfig: GlobalConfig | null,
  ) => void)[] = [];
  private readonly logger: Logger;
  private readonly uiKarton: KartonService;

  private constructor(logger: Logger, uiKarton: KartonService) {
    super();
    this.logger = logger;
    this.uiKarton = uiKarton;
  }

  private async initialize(): Promise<void> {
    this.logger.debug('[GlobalConfigService] Initializing...');

    const loadedConfig = await readPersistedData(
      'config',
      globalConfigSchema,
      globalConfigSchema.parse({}),
    );

    this.config = loadedConfig;

    this.uiKarton.setState((draft) => {
      draft.globalConfig = loadedConfig;
    });
    this.uiKarton.registerServerProcedureHandler(
      'config.set',
      async (_callingClientId: string, configPatch: Partial<GlobalConfig>) =>
        this.set({
          ...this.get(),
          ...configPatch,
        }),
    );

    this.logger.debug(
      '[GlobalConfigService] Saving config file after validation...',
    );
    await this.saveConfigFile();
    this.logger.debug('[GlobalConfigService] Initialized');
  }

  public static async create(
    logger: Logger,
    uiKarton: KartonService,
  ): Promise<GlobalConfigService> {
    const instance = new GlobalConfigService(logger, uiKarton);
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
    this.logger.debug('[GlobalConfigService] Saving config file...');
    const config = globalConfigSchema.parse(this.config);
    await writePersistedData('config', globalConfigSchema, config);
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
