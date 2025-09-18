import envPaths, { type Paths } from 'env-paths';
import path from 'node:path';
import { getEnvMode } from '@/utils/env';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import type { Logger } from './logger';

/**
 * This service provides the paths to a variety of global data directories that this app can use to store data and configurations etc.
 */
export class GlobalDataPathService {
  private paths: Paths;
  private logger: Logger;
  private constructor(logger: Logger) {
    this.logger = logger;
    this.paths = envPaths(getEnvMode() ? 'stagewise-dev' : 'stagewise', {
      suffix: '',
    });
  }

  public static async create(logger: Logger): Promise<GlobalDataPathService> {
    const instance = new GlobalDataPathService(logger);
    return instance;
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
   * Returns the path to a data folder for a specific workspace
   *
   * The path is hashed to avoid conflicts with other workspaces.
   *
   * @warning If the user moves the workspace, the path will change and thus the old data will become inaccessible.
   *
   * @param workspacePath Path to the workspace
   * @returns Path to the data folder for the workspace
   */
  public getWorkspaceDataPath(workspacePath: string): string {
    try {
      // Fetch folder form the path and get it's creation time
      const workspaceFolder = path.dirname(workspacePath);
      const workspaceFolderCreationTimeSalt = fs
        .statSync(workspaceFolder)
        .ctime.getTime()
        .toFixed(0);
      const workspacePathHash = createHash('sha256')
        .update(workspacePath + workspaceFolderCreationTimeSalt)
        .digest('hex');
      return path.join(this.paths.data, 'workspaces', workspacePathHash);
    } catch (error) {
      this.logger.error(
        '[GlobalDataPathService] Failed to get workspace data path',
        { cause: error },
      );
      throw new Error('Failed to get workspace data path', { cause: error });
    }
  }

  /**
   * Returns the path to a cache folder
   *
   * It's recommended to use this folder for temporary files that are not needed after the CLI has finished running.
   */
  get cachePath(): string {
    return this.paths.cache;
  }

  /**
   * Return the path to a temp folder
   *
   * It's recommended to use this folder for temporary files that are expected to be deleted by the system.
   */
  get tempPath(): string {
    return this.paths.temp;
  }
}
