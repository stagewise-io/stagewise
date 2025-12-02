/**
 * The experience state service is responsible for managing the state of the global user experience.
 *
 * This includes preferences for what's shown in UI, the progress of getting started experiences etc.
 *
 * @warning The state of worksapce-specific experiences is to be managed by the workspace manager etc.
 */

import { Layout, MainTab } from '@shared/karton-contracts/ui';
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
    this.kartonService.registerServerProcedureHandler(
      'userExperience.mainLayout.mainLayout.devAppPreview.changeScreenSize',
      async (
        size: {
          width: number;
          height: number;
          presetName: string;
        } | null,
      ) => {
        this.kartonService.setState((draft) => {
          if (
            draft.userExperience.activeLayout === Layout.MAIN &&
            draft.userExperience.activeMainTab === MainTab.DEV_APP_PREVIEW
          ) {
            draft.userExperience.devAppPreview.customScreenSize = size
              ? {
                  width: size.width,
                  height: size.height,
                  presetName: size.presetName,
                }
              : null;
          }
        });
      },
    );
    this.kartonService.registerServerProcedureHandler(
      'userExperience.mainLayout.mainLayout.devAppPreview.toggleShowCodeMode',
      async () => {
        this.kartonService.setState((draft) => {
          if (
            draft.userExperience.activeLayout === Layout.MAIN &&
            draft.userExperience.activeMainTab === MainTab.DEV_APP_PREVIEW
          ) {
            draft.userExperience.devAppPreview.inShowCodeMode =
              !draft.userExperience.devAppPreview.inShowCodeMode;
          }
        });
      },
    );
    this.kartonService.registerServerProcedureHandler(
      'userExperience.mainLayout.mainLayout.devAppPreview.toggleFullScreen',
      async () => {
        this.kartonService.setState((draft) => {
          if (
            draft.userExperience.activeLayout === Layout.MAIN &&
            draft.userExperience.activeMainTab === MainTab.DEV_APP_PREVIEW
          ) {
            draft.userExperience.devAppPreview.isFullScreen =
              !draft.userExperience.devAppPreview.isFullScreen;
          }
        });
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
          !draft.workspace?.setupActive &&
          !draft.userExperience.activeMainTab
        ) {
          this.logger.debug('[ExperienceService] Showing dev app preview tab');
          draft.userExperience = {
            activeLayout: Layout.MAIN,
            activeMainTab: MainTab.DEV_APP_PREVIEW,
            devAppPreview: {
              isFullScreen: false,
              inShowCodeMode: false,
              customScreenSize: null,
            },
          };
        }
      }
    });
  }

  public changeMainTab(tab: MainTab) {
    this.kartonService.setState((draft) => {
      if (
        tab ===
        (draft.userExperience as { activeMainTab: MainTab }).activeMainTab
      ) {
        return;
      }

      if (draft.userExperience.activeLayout === Layout.MAIN) {
        draft.userExperience.activeMainTab = tab;
        if (draft.userExperience.activeMainTab === MainTab.DEV_APP_PREVIEW) {
          // TODO We can make this nicer by persisting the config in between sessions.
          draft.userExperience.devAppPreview = {
            isFullScreen: false,
            inShowCodeMode: false,
            customScreenSize: null,
          };
        }
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
