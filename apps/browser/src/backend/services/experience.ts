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
import type { GlobalDataPathService } from './global-data-path';
import path from 'node:path';
import fs from 'node:fs/promises';
import { recentlyOpenedWorkspacesArraySchema } from '@shared/karton-contracts/ui';
import type { RecentlyOpenedWorkspace } from '@shared/karton-contracts/ui';

export class UserExperienceService {
  private logger: Logger;
  private kartonService: KartonService;
  private globalDataPathService: GlobalDataPathService;

  private constructor(
    logger: Logger,
    kartonService: KartonService,
    globalDataPathService: GlobalDataPathService,
  ) {
    this.logger = logger;
    this.kartonService = kartonService;
    this.globalDataPathService = globalDataPathService;
  }

  public static async create(
    logger: Logger,
    kartonService: KartonService,
    globalDataPathService: GlobalDataPathService,
  ) {
    logger.debug('[UserExperienceService] Creating service');
    const instance = new UserExperienceService(
      logger,
      kartonService,
      globalDataPathService,
    );
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

    void this.pruneRecentlyOpenedWorkspaces({
      maxAmount: 10,
      hasBeenOpenedBeforeDate: Date.now() - 1000 * 60 * 60 * 24 * 30, // 30 days ago
    });

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
    // Check if we need to load recently opened workspaces
    const state = this.kartonService.state;
    const needsInitialization =
      this.activeScreen === Layout.MAIN &&
      !state.workspace?.setupActive &&
      state.userExperience.activeLayout === Layout.MAIN &&
      !(state.userExperience as { activeMainTab?: MainTab }).activeMainTab;

    if (needsInitialization) {
      // Load data asynchronously first
      void this.getRecentlyOpenedWorkspaces().then(
        (recentlyOpenedWorkspaces) => {
          this.kartonService.setState((draft) => {
            draft.userExperience.activeLayout = this.activeScreen;

            if (draft.userExperience.activeLayout === Layout.MAIN) {
              const mainExperience = draft.userExperience as {
                activeMainTab?: MainTab;
              };
              if (
                !draft.workspace?.setupActive &&
                !mainExperience.activeMainTab
              ) {
                this.logger.debug(
                  '[ExperienceService] Showing dev app preview tab',
                );
                draft.userExperience = {
                  recentlyOpenedWorkspaces,
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
        },
      );
    } else {
      // No async data needed, update synchronously
      this.kartonService.setState((draft) => {
        draft.userExperience.activeLayout = this.activeScreen;
      });
    }
  }

  private async getRecentlyOpenedWorkspacesFilePath(): Promise<string> {
    return path.join(
      this.globalDataPathService.globalDataPath,
      'recently-opened-workspaces.json',
    );
  }

  private async readRecentlyOpenedWorkspaces(): Promise<
    RecentlyOpenedWorkspace[]
  > {
    const filePath = await this.getRecentlyOpenedWorkspacesFilePath();
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const parsedJson = JSON.parse(fileContent);
    return recentlyOpenedWorkspacesArraySchema.parse(parsedJson);
  }

  private async writeRecentlyOpenedWorkspaces(
    recentlyOpenedWorkspaces: RecentlyOpenedWorkspace[],
  ) {
    const filePath = await this.getRecentlyOpenedWorkspacesFilePath();
    await fs.writeFile(
      filePath,
      JSON.stringify(recentlyOpenedWorkspaces, null, 2),
      'utf-8',
    );
  }

  public async saveRecentlyOpenedWorkspace({
    path: workspacePath,
    name,
    openedAt,
  }: {
    path: string;
    name?: string;
    openedAt: number;
  }) {
    let recentlyOpenedWorkspaces: RecentlyOpenedWorkspace[] = [];

    try {
      recentlyOpenedWorkspaces = await this.readRecentlyOpenedWorkspaces();
    } catch {
      this.logger.debug(
        `[UserExperienceService] No existing recently opened workspaces file found, creating new one`,
      );
    }

    // Check if workspace with this path already exists
    const existingIndex = recentlyOpenedWorkspaces.findIndex(
      (ws) => ws.path === workspacePath,
    );

    const workspaceEntry: RecentlyOpenedWorkspace = {
      path: workspacePath,
      name,
      openedAt,
    };

    // Update existing entry
    if (existingIndex !== -1)
      recentlyOpenedWorkspaces[existingIndex] = workspaceEntry;
    // Add new entry
    else recentlyOpenedWorkspaces.push(workspaceEntry);

    try {
      await this.writeRecentlyOpenedWorkspaces(recentlyOpenedWorkspaces);
      this.kartonService.setState((draft) => {
        draft.userExperience.recentlyOpenedWorkspaces =
          recentlyOpenedWorkspaces;
      });
      this.logger.debug(
        `[UserExperienceService] Saved recently opened workspace: ${workspacePath}`,
      );
    } catch (error) {
      this.logger.error(
        `[UserExperienceService] Failed to save recently opened workspaces file. Error: ${error}`,
      );
    }
  }

  public async getRecentlyOpenedWorkspaces(): Promise<
    RecentlyOpenedWorkspace[]
  > {
    try {
      return await this.readRecentlyOpenedWorkspaces();
    } catch {
      this.logger.debug(
        `[UserExperienceService] No recently opened workspaces found or file read failed`,
      );
      return [];
    }
  }

  private async pruneRecentlyOpenedWorkspaces({
    maxAmount,
    hasBeenOpenedBeforeDate,
  }: {
    maxAmount: number;
    hasBeenOpenedBeforeDate: number;
  }) {
    let recentlyOpenedWorkspaces: RecentlyOpenedWorkspace[] = [];

    try {
      recentlyOpenedWorkspaces = await this.readRecentlyOpenedWorkspaces();
    } catch {
      this.logger.debug(
        `[UserExperienceService] No recently opened workspaces file found to prune`,
      );
      return;
    }

    // Filter out workspaces opened before the specified date
    let filteredWorkspaces = recentlyOpenedWorkspaces.filter(
      (ws) => ws.openedAt >= hasBeenOpenedBeforeDate,
    );

    // Sort by openedAt (most recent first)
    filteredWorkspaces.sort((a, b) => b.openedAt - a.openedAt);
    // Keep only the most recent maxAmount entries
    if (filteredWorkspaces.length > maxAmount)
      filteredWorkspaces = filteredWorkspaces.slice(0, maxAmount);

    try {
      await this.writeRecentlyOpenedWorkspaces(filteredWorkspaces);
      this.kartonService.setState((draft) => {
        draft.userExperience.recentlyOpenedWorkspaces = filteredWorkspaces;
      });
      this.logger.debug(
        `[UserExperienceService] Pruned recently opened workspaces. Kept ${filteredWorkspaces.length} entries`,
      );
    } catch (error) {
      this.logger.error(
        `[UserExperienceService] Failed to write pruned recently opened workspaces. Error: ${error}`,
      );
    }
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

    return Layout.MAIN;
  }
}
