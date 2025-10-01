/**
 * This file contains the workspace setup service class.
 * The workspace setup service is responsible for guiding the user through the setup process of the workspace.
 * Once the setup is finished, this service will notify all listeners and clean the UI state for the setup process.
 *
 * Running this service should only be mandatory if the workspace wasn't setup before. Otherwise, this can simply be skipped and will lead to confusion.
 *
 * Setup progress isn't stored, and if a setup was done is only determined based on the fact if a config file existed or not.
 */

import type { Logger } from '@/services/logger';
import type { KartonService } from '@/services/karton';
import fs from 'node:fs';
import path from 'node:path';
import { workspaceConfigSchema } from './config';

export class ConfigNotExistingException extends Error {
  constructor() {
    super('Config not existing');
  }
}

export class WorkspaceSetupService {
  private logger: Logger;
  private kartonService: KartonService;
  private workspacePath: string;
  private setupCompleted = false;

  private constructor(
    logger: Logger,
    kartonService: KartonService,
    workspacePath: string,
  ) {
    this.logger = logger;
    this.kartonService = kartonService;
    this.workspacePath = workspacePath;
  }

  private async initialize(): Promise<void> {
    this.logger.debug('[WorkspaceSetupService] Initializing...');
    const configFilePath = path.join(this.workspacePath, 'stagewise.json');
    const configFileExisting = fs.existsSync(configFilePath);
    if (configFileExisting) {
      // Check if the existing config file is valid. If yes, we make an early exit out of the init function and report the proper values.
      this.logger.debug(
        '[WorkspaceSetupService] Existing config file found. Checking for validity...',
      );
      const configFile = fs.readFileSync(configFilePath, 'utf-8');
      const validatedConfig = workspaceConfigSchema.safeParse(
        JSON.parse(configFile),
      );
      if (validatedConfig.success) {
        this.logger.debug(
          '[WorkspaceSetupService] Config file is valid. Setting setup completed to true..',
        );
        this.setupCompleted = true;
        return;
      }
    }

    this.logger.debug(
      '[WorkspaceSetupService] Config file is invalid. Setting setup completed to false...',
    );
    this.setupCompleted = false;
  }

  public static async create(
    logger: Logger,
    kartonService: KartonService,
    workspacePath: string,
  ): Promise<WorkspaceSetupService> {
    const instance = new WorkspaceSetupService(
      logger,
      kartonService,
      workspacePath,
    );
    await instance.initialize();
    return instance;
  }
}
