/**
 * Identifier service
 *
 * Returns a unique identifier of the machine.
 */

import path from 'node:path';
import type { GlobalDataPathService } from './global-data-path';
import type { Logger } from './logger';
import fs from 'node:fs/promises';
import { DisposableService } from './disposable';

export class IdentifierService extends DisposableService {
  private readonly globalDataPathService: GlobalDataPathService;
  private readonly logger: Logger;
  private machineId: string | null = null;

  private constructor(
    globalDataPathService: GlobalDataPathService,
    logger: Logger,
  ) {
    super();
    this.globalDataPathService = globalDataPathService;
    this.logger = logger;
  }

  private async initialize(): Promise<void> {
    // Check if a machine ID exists. If not, create a new one.
    const identifierFilePath = path.resolve(
      this.globalDataPathService.globalDataPath,
      'identity.json',
    );
    await fs
      .readFile(identifierFilePath, 'utf-8')
      .then((fileContent) => {
        this.machineId = fileContent;
      })
      .catch(async () => {
        this.logger.debug(
          '[IdentifierService] No identifier file found. Creating a new one...',
        );
        this.machineId = crypto.randomUUID();
        await fs.writeFile(identifierFilePath, this.machineId);
      });
  }

  public static async create(
    globalDataService: GlobalDataPathService,
    logger: Logger,
  ): Promise<IdentifierService> {
    const instance = new IdentifierService(globalDataService, logger);
    await instance.initialize();
    return instance;
  }

  public getMachineId(): string {
    if (!this.machineId) {
      this.logger.error(
        "[IdentifierService] Machine ID not found. This shouldn't happen.",
      );
      throw new Error("Machine ID not found. This shouldn't happen.");
    }
    return this.machineId;
  }

  protected onTeardown(): void {
    this.machineId = null;
    this.logger.debug('[IdentifierService] Teardown complete');
  }
}
