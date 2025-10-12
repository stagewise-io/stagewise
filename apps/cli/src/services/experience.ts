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
        if (draft.workspaceStatus === 'open' && !draft.workspace?.config) {
          this.logger.debug('[ExperienceService] Showing workspace setup tab');
          draft.userExperience.activeMainTab = MainTab.WORKSPACE_SETUP;
        } else if (
          draft.workspaceStatus === 'open' &&
          draft.workspace?.config &&
          (!draft.userExperience.activeMainTab ||
            draft.userExperience.activeMainTab === MainTab.WORKSPACE_SETUP)
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
        if (tab === MainTab.WORKSPACE_SETUP && draft.workspace?.config) {
          // Do nothing since we don't allow setup if the workspace config exists.
          return;
        }

        if (tab !== MainTab.WORKSPACE_SETUP && !draft.workspace?.config) {
          // If the workspace config doesn't exist, we force going into the workspace setup tab
          draft.userExperience.activeMainTab = MainTab.WORKSPACE_SETUP;
          return;
        }

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

    return Layout.MAIN;
  }
}
