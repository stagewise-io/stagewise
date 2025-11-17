import envPaths, { type Paths } from 'env-paths';
import path from 'node:path';
import { getEnvMode } from '@/utils/env';
import fs from 'node:fs/promises';
import type { Logger } from './logger';

/**
 * This service provides the paths to a variety of global data directories that this app can use to store data and configurations etc.
 */
export class GlobalDataPathService {
  private paths: Paths;
  private logger: Logger;
  private constructor(logger: Logger) {
    this.logger = logger;
    this.paths = envPaths(
      getEnvMode() === 'dev' ? 'stagewise-dev' : 'stagewise',
      {
        suffix: '',
      },
    );
  }

  public static async create(logger: Logger): Promise<GlobalDataPathService> {
    const instance = new GlobalDataPathService(logger);
    await instance.initialize();
    logger.debug('[GlobalDataPathService] Created service');
    return instance;
  }

  private async initialize(): Promise<void> {
    // Create all paths that are needed (if they don't exist already)
    await fs.mkdir(this.paths.config, { recursive: true });
    await fs.mkdir(this.paths.data, { recursive: true });
    await fs.mkdir(this.paths.cache, { recursive: true });
    await fs.mkdir(this.paths.temp, { recursive: true });
  }

  get configFilePath(): string {
    return path.join(this.paths.config, 'config.json');
  }

  get identifierFilePath(): string {
    return path.join(this.paths.data, 'identifier.json');
  }

  /**
   * Returns the path to a data folder
   *
   * It's recommended to use this folder for data that should be persisted between runs.
   *
   * Make sure to properly sort the data in this folder to avoid conflicts.
   *
   * @warning If you store workspace related data, use the getWorkspaceDataPath method instead.
   */
  get globalDataPath(): string {
    return this.paths.data;
  }

  /**
   * Returns the path to a cache folder
   *
   * It's recommended to use this folder for temporary files that are not needed after the CLI has finished running.
   */
  get globalCachePath(): string {
    return this.paths.cache;
  }

  /**
   * Return the path to a temp folder
   *
   * It's recommended to use this folder for temporary files that are expected to be deleted by the system.
   */
  get globalTempPath(): string {
    return this.paths.temp;
  }
}
