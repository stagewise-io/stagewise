/**
 * The experience state service is responsible for managing the state of the global user experience.
 *
 * This includes preferences for what's shown in UI, the progress of getting started experiences etc.
 *
 * @warning The state of worksapce-specific experiences is to be managed by the workspace manager etc.
 */

import type { KartonService } from './karton';
import type { Logger } from './logger';

export class ExperienceStateService {
  private logger: Logger;
  private kartonService: KartonService;

  private constructor(logger: Logger, kartonService: KartonService) {
    this.logger = logger;
    this.kartonService = kartonService;
  }

  public static async create(logger: Logger, kartonService: KartonService) {
    const instance = new ExperienceStateService(logger, kartonService);
    return instance;
  }
}
