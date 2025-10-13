/**
 * The experience state service is responsible for managing the state of the global user experience.
 *
 * This includes preferences for what's shown in UI, the progress of getting started experiences etc.
 *
 * @warning The state of worksapce-specific experiences is to be managed by the workspace manager etc.
 */

import { Layout, MainTab } from '@stagewise/karton-contract';
import type { KartonService } from './karton';
import type { Logger } from './logger';

export class UserExperienceService {
  private logger: Logger;
  private kartonService: KartonService;

  private constructor(logger: Logger, kartonService: KartonService) {
    this.logger = logger;
    this.kartonService = kartonService;
  }

  public static async create(logger: Logger, kartonService: KartonService) {
    logger.debug('[UserExperienceService] Creating service');
    const instance = new UserExperienceService(logger, kartonService);
    await instance.initialize();
    logger.debug('[UserExperienceService] Created service');
    return instance;
  }

  private async initialize() {
    this.kartonService.registerStateChangeCallback(
      this.handleServiceStateChange.bind(this),
    );
    this.kartonService.registerServerProcedureHandler(
      'userExperience.mainLayout.changeTab',
      async (tab: MainTab) => {
        this.changeMainTab(tab);
      },
    );
  }

  public tearDown() {
    this.kartonService.unregisterStateChangeCallback(
      this.handleServiceStateChange.bind(this),
    );
    this.kartonService.removeServerProcedureHandler(
      'userExperience.mainLayout.changeTab',
    );
  }

  private handleServiceStateChange() {
    this.kartonService.setState((draft) => {
      draft.userExperience.activeLayout = this.activeScreen;

      if (draft.userExperience.activeLayout === Layout.MAIN) {
        if (
          draft.workspaceStatus === 'open' &&
          !draft.workspace?.setupActive &&
          !draft.userExperience.activeMainTab
        ) {
          this.logger.debug('[ExperienceService] Showing dev app preview tab');
          draft.userExperience.activeMainTab = MainTab.DEV_APP_PREVIEW;
        }
      }
    });
  }

  public changeMainTab(tab: MainTab) {
    this.kartonService.setState((draft) => {
      if (draft.userExperience.activeLayout === Layout.MAIN) {
        draft.userExperience.activeMainTab = tab;
      } else {
        throw new Error('Cannot change Tab when not in main layout');
      }
    });
  }

  public get activeScreen(): Layout {
    // Depending on the state of auth and workspace servcie, we render different screens.
    if (this.kartonService.state.userAccount?.status === 'unauthenticated') {
      return Layout.SIGNIN;
    }
    if (this.kartonService.state.workspaceStatus === 'closed') {
      return Layout.OPEN_WORKSPACE;
    }
    if (this.kartonService.state.workspace?.setupActive) {
      return Layout.SETUP_WORKSPACE;
    }

    return Layout.MAIN;
  }
}
