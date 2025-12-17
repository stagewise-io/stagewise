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
import {
  type AppRouter,
  createNodeApiClient,
  type TRPCClient,
} from '@stagewise/api-client';
import { API_URL } from './auth/server-interop';

export class UserExperienceService {
  private logger: Logger;
  private uiKarton: KartonService;
  private globalDataPathService: GlobalDataPathService;
  private inspirationWebsiteListOffset = 0;
  private inspirationWebsiteListSeed = crypto.randomUUID();

  private unAuthenticatedApiClient: TRPCClient<AppRouter> = createNodeApiClient(
    {
      baseUrl: API_URL,
    },
  );

  private constructor(
    logger: Logger,
    uiKarton: KartonService,
    globalDataPathService: GlobalDataPathService,
  ) {
    this.logger = logger;
    this.uiKarton = uiKarton;
    this.globalDataPathService = globalDataPathService;
  }

  public static async create(
    logger: Logger,
    uiKarton: KartonService,
    globalDataPathService: GlobalDataPathService,
  ) {
    logger.debug('[UserExperienceService] Creating service');
    const instance = new UserExperienceService(
      logger,
      uiKarton,
      globalDataPathService,
    );
    await instance.initialize();
    logger.debug('[UserExperienceService] Created service');
    return instance;
  }

  private async initialize() {
    this.uiKarton.registerStateChangeCallback(
      this.handleServiceStateChange.bind(this),
    );
    this.uiKarton.registerServerProcedureHandler(
      'userExperience.mainLayout.changeTab',
      async (tab: MainTab) => {
        this.changeMainTab(tab);
      },
    );

    try {
      this.unAuthenticatedApiClient.inspiration.list
        .query({
          offset: this.inspirationWebsiteListOffset,
          limit: 5,
          seed: this.inspirationWebsiteListSeed,
        })
        .then((response) => {
          this.inspirationWebsiteListOffset += response.websites.length;
          this.uiKarton.setState((draft) => {
            draft.userExperience.inspirationWebsites = response;
            draft.userExperience.inspirationWebsites.total = response.total;
          });
        });
    } catch (error) {
      this.logger.error(
        `[UserExperienceService] Failed to load inspiration websites. Error: ${error}`,
      );
    }

    void this.pruneRecentlyOpenedWorkspaces({
      maxAmount: 10,
      hasBeenOpenedBeforeDate: Date.now() - 1000 * 60 * 60 * 24 * 30, // 30 days ago
    });

    this.uiKarton.registerServerProcedureHandler(
      'userExperience.mainLayout.mainLayout.devAppPreview.changeScreenSize',
      async (
        size: {
          width: number;
          height: number;
          presetName: string;
        } | null,
      ) => {
        this.uiKarton.setState((draft) => {
          if (
            draft.userExperience.activeLayout === Layout.MAIN &&
            draft.userExperience.activeMainTab === MainTab.BROWSING
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
    this.uiKarton.registerServerProcedureHandler(
      'userExperience.inspiration.loadMore',
      async () => {
        return this.loadMoreInspirationWebsites();
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'userExperience.mainLayout.mainLayout.devAppPreview.toggleShowCodeMode',
      async () => {
        this.uiKarton.setState((draft) => {
          if (
            draft.userExperience.activeLayout === Layout.MAIN &&
            draft.userExperience.activeMainTab === MainTab.BROWSING
          ) {
            draft.userExperience.devAppPreview.inShowCodeMode =
              !draft.userExperience.devAppPreview.inShowCodeMode;
          }
        });
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'userExperience.mainLayout.mainLayout.devAppPreview.toggleFullScreen',
      async () => {
        this.uiKarton.setState((draft) => {
          if (
            draft.userExperience.activeLayout === Layout.MAIN &&
            draft.userExperience.activeMainTab === MainTab.BROWSING
          ) {
            draft.userExperience.devAppPreview.isFullScreen =
              !draft.userExperience.devAppPreview.isFullScreen;
          }
        });
      },
    );
  }

  public tearDown() {
    this.uiKarton.unregisterStateChangeCallback(
      this.handleServiceStateChange.bind(this),
    );
    this.uiKarton.removeServerProcedureHandler(
      'userExperience.mainLayout.changeTab',
    );
  }

  private handleServiceStateChange() {
    // Check if we need to load recently opened workspaces
    const state = this.uiKarton.state;
    const needsInitialization =
      this.activeScreen === Layout.MAIN &&
      !state.workspace?.setupActive &&
      state.userExperience.activeLayout === Layout.MAIN &&
      !(state.userExperience as { activeMainTab?: MainTab }).activeMainTab;

    if (needsInitialization) {
      // Load data asynchronously first
      void this.getRecentlyOpenedWorkspaces().then(
        (recentlyOpenedWorkspaces) => {
          this.uiKarton.setState((draft) => {
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
                  activeMainTab: MainTab.BROWSING,
                  devAppPreview: {
                    isFullScreen: false,
                    inShowCodeMode: false,
                    customScreenSize: null,
                  },
                  inspirationWebsites: {
                    websites: [],
                    total: 0,
                    seed: crypto.randomUUID(),
                  },
                };
              }
            }
          });
        },
      );
    } else {
      // No async data needed, update synchronously
      this.uiKarton.setState((draft) => {
        draft.userExperience.activeLayout = this.activeScreen;
      });
    }
  }

  private async loadMoreInspirationWebsites() {
    try {
      const response =
        await this.unAuthenticatedApiClient.inspiration.list.query({
          offset: this.inspirationWebsiteListOffset,
          limit: 5,
          seed: this.inspirationWebsiteListSeed,
        });
      this.inspirationWebsiteListOffset += response.websites.length;
      this.uiKarton.setState((draft) => {
        draft.userExperience.inspirationWebsites = {
          websites: [
            ...draft.userExperience.inspirationWebsites.websites,
            ...response.websites,
          ],
          total: response.total,
          seed: this.inspirationWebsiteListSeed,
        };
      });
    } catch (error) {
      this.logger.error(
        `[UserExperienceService] Failed to load more inspiration websites. Error: ${error}`,
      );
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
    name: string;
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
      this.uiKarton.setState((draft) => {
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
      this.uiKarton.setState((draft) => {
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
    this.uiKarton.setState((draft) => {
      if (
        tab ===
        (draft.userExperience as { activeMainTab: MainTab }).activeMainTab
      ) {
        return;
      }

      if (draft.userExperience.activeLayout === Layout.MAIN) {
        draft.userExperience.activeMainTab = tab;
        if (draft.userExperience.activeMainTab === MainTab.BROWSING) {
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
    if (this.uiKarton.state.userAccount?.status === 'unauthenticated') {
      return Layout.SIGNIN;
    }

    return Layout.MAIN;
  }
}
