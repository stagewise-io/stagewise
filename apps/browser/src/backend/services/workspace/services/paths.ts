import type { GlobalDataPathService } from '@/services/global-data-path';
import type { Logger } from '@/services/logger';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * This service offers information on where to store workspace related and global data.
 *
 * If should be used by workspace services instead of the global data path service.
 */
export class WorkspacePathsService {
  private logger: Logger;
  private globalDataPathService: GlobalDataPathService;
  private workspaceFolderName = '';
  private cacheFolderName = randomUUID();

  private constructor(
    logger: Logger,
    globalDataPathService: GlobalDataPathService,
  ) {
    this.logger = logger;
    this.globalDataPathService = globalDataPathService;
  }

  public static async create(
    logger: Logger,
    globalDataPathService: GlobalDataPathService,
    workspacePath: string,
  ) {
    const instance = new WorkspacePathsService(logger, globalDataPathService);
    await instance.initialize(workspacePath);
    return instance;
  }

  private async initialize(workspacePath: string) {
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
    try {
      // Fetch folder form the path and get it's creation time
      const workspaceFolder = path.dirname(workspacePath);
      const workspaceFolderCreationTimeSalt = await fs
        .stat(workspaceFolder)
        .then((stats) => stats.ctime.getTime().toFixed(0));
      const workspacePathHash = createHash('sha256')
        .update(workspacePath + workspaceFolderCreationTimeSalt)
        .digest('hex')
        .slice(0, 32);
      this.workspaceFolderName = workspacePathHash;
    } catch (error) {
      this.logger.error(
        '[WorkspacePathsService] Failed to determine workspace data path',
        { cause: error },
      );
      throw new Error('Failed to get workspace data path', { cause: error });
    }

    this.logger.debug(
      `[WorkspacePathsService] Workspace data path: "${this.workspaceDataPath}"`,
    );
    this.logger.debug(
      `[WorkspacePathsService] Workspace temp path: "${this.workspaceTempPath}"`,
    );
  }

  public async teardown() {
    // NO-OP
    this.logger.debug('[WorkspacePathsService] Shutting down');
  }

  public get workspaceDataPath(): string {
    return path.join(
      this.globalDataPathService.globalDataPath,
      'workspaces',
      this.workspaceFolderName,
    );
  }

  /**
   * Return the path to a temp folder.
   *
   * The temp folder path will be persisted between startups.
   *
   * It's recommended to use this folder for temporary files that are expected to be deleted by the system.
   */
  get workspaceTempPath(): string {
    return path.join(
      this.globalDataPathService.globalTempPath,
      'workspaces',
      this.workspaceFolderName,
    );
  }

  /**
   * Return the ID that's used as a base for the workspace data path.
   *
   * @warning This ID is not guaranteed to be unique and should not be used for any other purpose than identifying the workspace.
   */
  get workspaceId(): string {
    return this.workspaceFolderName;
  }
}
