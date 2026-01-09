/**
 * The experience state service is responsible for managing the state of the global user experience.
 *
 * This includes preferences for what's shown in UI, the progress of getting started experiences etc.
 *
 * @warning The state of worksapce-specific experiences is to be managed by the workspace manager etc.
 */

import {
  recentlyOpenedWorkspacesArraySchema,
  onboardingStateSchema,
  type StoredExperienceData,
  type RecentlyOpenedWorkspace,
  type InspirationWebsite,
} from '@shared/karton-contracts/ui';
import type { KartonService } from './karton';
import type { Logger } from './logger';
import type { GlobalDataPathService } from './global-data-path';
import type { PagesService } from './pages';
import {
  type AppRouter,
  createNodeApiClient,
  type TRPCClient,
} from '@stagewise/api-client';
import { API_URL } from './auth/server-interop';
import { DisposableService } from './disposable';
import { readPersistedData, writePersistedData } from '../utils/persisted-data';

export class UserExperienceService extends DisposableService {
  private readonly logger: Logger;
  private readonly uiKarton: KartonService;
  private readonly globalDataPathService: GlobalDataPathService;
  private pagesService?: PagesService;
  private inspirationSeed = crypto.randomUUID();
  private cachedInspirationWebsites: InspirationWebsite = {
    websites: [],
    total: 0,
    seed: '',
  };
  private inspirationFetchInProgress: Promise<InspirationWebsite> | null = null;

  private unAuthenticatedApiClient: TRPCClient<AppRouter> = createNodeApiClient(
    {
      baseUrl: API_URL,
    },
  );

  // Store bound callback reference for proper unregistration
  private readonly boundHandleServiceStateChange: () => void;

  private constructor(
    logger: Logger,
    uiKarton: KartonService,
    globalDataPathService: GlobalDataPathService,
  ) {
    super();
    this.logger = logger;
    this.uiKarton = uiKarton;
    this.globalDataPathService = globalDataPathService;

    // Bind once and store reference for later unregistration
    this.boundHandleServiceStateChange =
      this.handleServiceStateChange.bind(this);
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
      this.boundHandleServiceStateChange,
    );

    void this.pruneRecentlyOpenedWorkspaces({
      maxAmount: 10,
      hasBeenOpenedBeforeDate: Date.now() - 1000 * 60 * 60 * 24 * 30, // 30 days ago
    });

    this.uiKarton.registerServerProcedureHandler(
      'userExperience.devAppPreview.changeScreenSize',
      async (
        _callingClientId: string,
        size: {
          width: number;
          height: number;
          presetName: string;
        } | null,
      ) => {
        this.uiKarton.setState((draft) => {
          draft.userExperience.devAppPreview.customScreenSize = size
            ? {
                width: size.width,
                height: size.height,
                presetName: size.presetName,
              }
            : null;
        });
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'userExperience.devAppPreview.toggleShowCodeMode',
      async (_callingClientId: string) => {
        this.uiKarton.setState((draft) => {
          draft.userExperience.devAppPreview.inShowCodeMode =
            !draft.userExperience.devAppPreview.inShowCodeMode;
        });
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'userExperience.devAppPreview.toggleFullScreen',
      async (_callingClientId: string) => {
        this.uiKarton.setState((draft) => {
          draft.userExperience.devAppPreview.isFullScreen =
            !draft.userExperience.devAppPreview.isFullScreen;
        });
      },
    );
  }

  protected onTeardown(): void {
    this.uiKarton.unregisterStateChangeCallback(
      this.boundHandleServiceStateChange,
    );
    this.uiKarton.removeServerProcedureHandler(
      'userExperience.devAppPreview.changeScreenSize',
    );
    this.uiKarton.removeServerProcedureHandler(
      'userExperience.devAppPreview.toggleShowCodeMode',
    );
    this.uiKarton.removeServerProcedureHandler(
      'userExperience.devAppPreview.toggleFullScreen',
    );
    this.logger.debug('[UserExperienceService] Teardown complete');
  }

  private handleServiceStateChange() {
    // Load stored experience data if needed
    const state = this.uiKarton.state;
    const needsInitialization =
      state.userAccount?.status === 'authenticated' &&
      !state.workspace?.setupActive &&
      !state.userExperience.storedExperienceData.hasSeenOnboardingFlow;

    if (needsInitialization) {
      // Load data asynchronously first
      void this.getStoredExperienceData().then((storedExperienceData) => {
        this.uiKarton.setState((draft) => {
          draft.userExperience.storedExperienceData = storedExperienceData;
        });
        // Sync to pages API
        this.syncHomePageStateToPagesService();
      });
    }

    // Always sync workspace status changes to pages API
    this.syncHomePageStateToPagesService();
  }

  /**
   * Get inspiration websites with pagination.
   * Results are cached - will only fetch from API if we don't have enough cached data.
   */
  public async getInspirationWebsites(params: {
    offset: number;
    limit: number;
  }): Promise<InspirationWebsite> {
    const { offset, limit } = params;
    const requestedEnd = offset + limit;
    const cachedCount = this.cachedInspirationWebsites.websites.length;

    // Check if we have enough cached data
    if (
      cachedCount >= requestedEnd ||
      cachedCount >= this.cachedInspirationWebsites.total
    ) {
      // Return slice from cache
      return {
        websites: this.cachedInspirationWebsites.websites.slice(
          offset,
          requestedEnd,
        ),
        total: this.cachedInspirationWebsites.total,
        seed: this.inspirationSeed,
      };
    }

    // Need to fetch more - deduplicate concurrent requests
    if (this.inspirationFetchInProgress) {
      await this.inspirationFetchInProgress;
      // After waiting, check cache again
      return this.getInspirationWebsites(params);
    }

    // Fetch more websites from API
    this.inspirationFetchInProgress = this.fetchMoreInspirationWebsites(
      requestedEnd - cachedCount,
    );
    try {
      await this.inspirationFetchInProgress;
    } finally {
      this.inspirationFetchInProgress = null;
    }

    // Return slice from updated cache
    return {
      websites: this.cachedInspirationWebsites.websites.slice(
        offset,
        requestedEnd,
      ),
      total: this.cachedInspirationWebsites.total,
      seed: this.inspirationSeed,
    };
  }

  /**
   * Internal method to fetch more inspiration websites from API.
   */
  private async fetchMoreInspirationWebsites(
    minCount: number,
  ): Promise<InspirationWebsite> {
    try {
      const response =
        await this.unAuthenticatedApiClient.inspiration.list.query({
          offset: this.cachedInspirationWebsites.websites.length,
          limit: Math.max(minCount, 10), // Fetch at least 10 at a time
          seed: this.inspirationSeed,
        });

      this.cachedInspirationWebsites = {
        websites: [
          ...this.cachedInspirationWebsites.websites,
          ...response.websites,
        ],
        total: response.total,
        seed: this.inspirationSeed,
      };

      this.logger.debug(
        `[UserExperienceService] Fetched ${response.websites.length} inspiration websites, total cached: ${this.cachedInspirationWebsites.websites.length}`,
      );

      return this.cachedInspirationWebsites;
    } catch (error) {
      this.logger.error(
        `[UserExperienceService] Failed to fetch inspiration websites: ${error}`,
      );
      // Return current cache even on error
      return this.cachedInspirationWebsites;
    }
  }

  /**
   * Read the recently opened workspaces from persisted data.
   */
  private async readRecentlyOpenedWorkspaces(): Promise<
    RecentlyOpenedWorkspace[]
  > {
    return readPersistedData(
      'recently-opened-workspaces',
      recentlyOpenedWorkspacesArraySchema,
      [],
    );
  }

  /**
   * Write the recently opened workspaces to persisted data.
   */
  private async writeRecentlyOpenedWorkspaces(
    workspaces: RecentlyOpenedWorkspace[],
  ): Promise<void> {
    await writePersistedData(
      'recently-opened-workspaces',
      recentlyOpenedWorkspacesArraySchema,
      workspaces,
    );
  }

  /**
   * Read the onboarding state from persisted data.
   */
  private async readOnboardingState(): Promise<boolean> {
    const data = await readPersistedData(
      'onboarding-state',
      onboardingStateSchema,
      { hasSeenOnboardingFlow: false },
    );
    return data.hasSeenOnboardingFlow;
  }

  /**
   * Write the onboarding state to persisted data.
   */
  private async writeOnboardingState(
    hasSeenOnboardingFlow: boolean,
  ): Promise<void> {
    await writePersistedData('onboarding-state', onboardingStateSchema, {
      hasSeenOnboardingFlow,
    });
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
    // Load existing workspaces
    const workspaces = await this.readRecentlyOpenedWorkspaces();

    // Check if workspace with this path already exists
    const existingIndex = workspaces.findIndex(
      (ws) => ws.path === workspacePath,
    );

    const workspaceEntry: RecentlyOpenedWorkspace = {
      path: workspacePath,
      name,
      openedAt,
    };

    // Update existing entry or add new one
    if (existingIndex !== -1) {
      workspaces[existingIndex] = workspaceEntry;
    } else {
      workspaces.push(workspaceEntry);
    }

    try {
      await this.writeRecentlyOpenedWorkspaces(workspaces);
      // Update UI state with combined data
      const storedData = await this.getStoredExperienceData();
      this.uiKarton.setState((draft) => {
        draft.userExperience.storedExperienceData = storedData;
      });
      // Sync to pages API
      this.syncHomePageStateToPagesService();
      this.logger.debug(
        `[UserExperienceService] Saved recently opened workspace: ${workspacePath}`,
      );
    } catch (error) {
      this.logger.error(
        `[UserExperienceService] Failed to save recently opened workspace. Error: ${error}`,
      );
    }
  }

  /**
   * Get combined stored experience data from separate files.
   * This combines data from recently-opened-workspaces.json and onboarding-state.json.
   */
  public async getStoredExperienceData(): Promise<StoredExperienceData> {
    const [recentlyOpenedWorkspaces, hasSeenOnboardingFlow] = await Promise.all(
      [this.readRecentlyOpenedWorkspaces(), this.readOnboardingState()],
    );
    return {
      recentlyOpenedWorkspaces,
      hasSeenOnboardingFlow,
    };
  }

  public async setHasSeenOnboardingFlow(value: boolean) {
    try {
      await this.writeOnboardingState(value);
      // Update UI state with combined data
      const storedData = await this.getStoredExperienceData();
      this.uiKarton.setState((draft) => {
        draft.userExperience.storedExperienceData = storedData;
      });
      // Sync to pages API
      this.syncHomePageStateToPagesService();
      this.logger.debug(
        `[UserExperienceService] Set hasSeenOnboardingFlow to: ${value}`,
      );
    } catch (error) {
      this.logger.error(
        `[UserExperienceService] Failed to save hasSeenOnboardingFlow. Error: ${error}`,
      );
    }
  }

  /**
   * Set the PagesService instance for syncing home page state.
   * This should be called by main.ts after services are created.
   */
  public setPagesService(pagesService: PagesService): void {
    this.pagesService = pagesService;
    // Sync initial state
    this.syncHomePageStateToPagesService();
  }

  /**
   * Sync current home page state to PagesService.
   * Called when stored experience data or workspace status changes.
   */
  private syncHomePageStateToPagesService(): void {
    if (!this.pagesService) {
      return;
    }
    const state = this.uiKarton.state;
    this.pagesService.syncHomePageState({
      storedExperienceData: state.userExperience.storedExperienceData,
      workspaceStatus: state.workspaceStatus,
    });
  }

  private async pruneRecentlyOpenedWorkspaces({
    maxAmount,
    hasBeenOpenedBeforeDate,
  }: {
    maxAmount: number;
    hasBeenOpenedBeforeDate: number;
  }) {
    const workspaces = await this.readRecentlyOpenedWorkspaces();

    if (workspaces.length === 0) {
      this.logger.debug(
        `[UserExperienceService] No recently opened workspaces to prune`,
      );
      return;
    }

    // Filter out workspaces opened before the specified date
    let filteredWorkspaces = workspaces.filter(
      (ws) => ws.openedAt >= hasBeenOpenedBeforeDate,
    );

    // Sort by openedAt (most recent first)
    filteredWorkspaces.sort((a, b) => b.openedAt - a.openedAt);
    // Keep only the most recent maxAmount entries
    if (filteredWorkspaces.length > maxAmount) {
      filteredWorkspaces = filteredWorkspaces.slice(0, maxAmount);
    }

    try {
      await this.writeRecentlyOpenedWorkspaces(filteredWorkspaces);
      // Update UI state with combined data
      const storedData = await this.getStoredExperienceData();
      this.uiKarton.setState((draft) => {
        draft.userExperience.storedExperienceData = storedData;
      });
      this.logger.debug(
        `[UserExperienceService] Pruned recently opened workspaces. Kept ${filteredWorkspaces.length} entries`,
      );
    } catch (error) {
      this.logger.error(
        `[UserExperienceService] Failed to write pruned workspaces data. Error: ${error}`,
      );
    }
  }
}
