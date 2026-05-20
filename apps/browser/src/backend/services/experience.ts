/**
 * The experience state service is responsible for managing the state of the global user experience.
 *
 * This includes preferences for what's shown in UI, the progress of getting started experiences etc.
 *
 * @warning The state of workspace-specific experiences is to be managed by the workspace manager etc.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  recentlyOpenedWorkspacesArraySchema,
  onboardingStateSchema,
  type StoredExperienceData,
  type RecentlyOpenedWorkspace,
  type InspirationWebsite,
} from '@shared/karton-contracts/ui';
import type { KartonService } from './karton';
import type { Logger } from './logger';
import { type ApiClient, createApiClient } from '@stagewise/api-client';
import { API_URL } from './auth/server-interop';
import { DisposableService } from './disposable';
import { readPersistedData, writePersistedData } from '../utils/persisted-data';
import type { TelemetryService } from './telemetry';
import type { ModelProvider } from '@shared/karton-contracts/ui/shared-types';
import type { CodingPlanId } from '@shared/coding-plans';
import type { GitRepositoryInfo, GitService } from './git';

export type OnboardingAuthCompletion = {
  auth_method: 'stagewise' | 'api-keys' | 'coding-plan' | 'unknown';
  provider?: ModelProvider;
  plan_id?: CodingPlanId;
};

function redactWorkspacePathForTelemetry(workspacePath: string): string {
  return createHash('sha256').update(workspacePath).digest('hex').slice(0, 12);
}

export class UserExperienceService extends DisposableService {
  private readonly logger: Logger;
  private readonly uiKarton: KartonService;
  private readonly telemetryService: TelemetryService;
  private readonly gitService: GitService;
  private inspirationSeed = crypto.randomUUID();
  private cachedInspirationWebsites: InspirationWebsite = {
    websites: [],
    total: 0,
    seed: '',
  };
  private inspirationFetchInProgress: Promise<InspirationWebsite> | null = null;

  private unAuthenticatedApiClient: ApiClient = createApiClient(API_URL);

  // Store bound callback reference for proper unregistration
  private readonly boundHandleServiceStateChange: () => void;

  // Flag to prevent re-entrant initialization
  private isLoadingStoredExperienceData = false;
  private hasInitializedStoredExperienceData = false;

  private constructor(
    logger: Logger,
    uiKarton: KartonService,
    telemetryService: TelemetryService,
    gitService: GitService,
  ) {
    super();
    this.logger = logger;
    this.uiKarton = uiKarton;
    this.telemetryService = telemetryService;
    this.gitService = gitService;

    // Bind once and store reference for later unregistration
    this.boundHandleServiceStateChange =
      this.handleServiceStateChange.bind(this);
  }

  private report(
    error: Error,
    operation: string,
    extra?: Record<string, unknown>,
  ) {
    this.telemetryService.captureException(error, {
      service: 'experience',
      operation,
      ...extra,
    });
  }

  public static async create(
    logger: Logger,
    uiKarton: KartonService,
    telemetryService: TelemetryService,
    gitService: GitService,
  ) {
    logger.debug('[UserExperienceService] Creating service');
    const instance = new UserExperienceService(
      logger,
      uiKarton,
      telemetryService,
      gitService,
    );
    await instance.initialize();
    logger.debug('[UserExperienceService] Created service');
    return instance;
  }

  private async initialize() {
    const hasSeenOnboarding = await this.readOnboardingState();
    this.uiKarton.setState((draft) => {
      draft.userExperience.storedExperienceData.hasSeenOnboardingFlow =
        hasSeenOnboarding;
    });

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
    this.uiKarton.registerServerProcedureHandler(
      'userExperience.setHasSeenOnboardingFlow',
      async (
        _callingClientId: string,
        input: boolean | { value: boolean; auth?: OnboardingAuthCompletion },
      ) => {
        const value = typeof input === 'boolean' ? input : input.value;
        const auth = typeof input === 'boolean' ? undefined : input.auth;
        await this.setHasSeenOnboardingFlow(value, auth);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'userExperience.clearPendingOnboardingSuggestion',
      async (_callingClientId: string) => {
        this.uiKarton.setState((draft) => {
          draft.userExperience.pendingOnboardingSuggestion = null;
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
    this.uiKarton.removeServerProcedureHandler(
      'userExperience.setHasSeenOnboardingFlow',
    );
    this.uiKarton.removeServerProcedureHandler(
      'userExperience.clearPendingOnboardingSuggestion',
    );
    this.logger.debug('[UserExperienceService] Teardown complete');
  }

  private handleServiceStateChange() {
    // Load stored experience data if needed (only once per session)
    const state = this.uiKarton.state;
    const needsInitialization =
      state.userAccount?.status === 'authenticated' &&
      !this.hasInitializedStoredExperienceData &&
      !this.isLoadingStoredExperienceData;

    if (needsInitialization) {
      // Set flag to prevent re-entrant calls
      this.isLoadingStoredExperienceData = true;

      // Load data asynchronously first
      void this.getStoredExperienceData().then((storedExperienceData) => {
        // Mark as initialized to prevent future re-loads
        this.hasInitializedStoredExperienceData = true;
        this.isLoadingStoredExperienceData = false;

        this.uiKarton.setState((draft) => {
          draft.userExperience.storedExperienceData = storedExperienceData;
        });
      });
    }
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
    // Note: We only check against total when we've actually fetched before (seed is set).
    // Otherwise total=0 initial state would incorrectly match cachedCount=0.
    const hasFetchedBefore = this.cachedInspirationWebsites.seed !== '';
    if (
      cachedCount >= requestedEnd ||
      (hasFetchedBefore && cachedCount >= this.cachedInspirationWebsites.total)
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
      const { data: response, error } =
        await this.unAuthenticatedApiClient.v1.inspiration.get({
          query: {
            offset: String(this.cachedInspirationWebsites.websites.length),
            limit: String(Math.max(minCount, 10)),
            seed: this.inspirationSeed,
          },
        });

      if (error || !response) {
        throw new Error(
          error ? String(error) : 'Empty response from inspiration API',
        );
      }

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
      this.report(error as Error, 'fetchInspirationWebsites');
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

  public async getRecentlyOpenedWorkspaces(): Promise<
    RecentlyOpenedWorkspace[]
  > {
    const persistedWorkspaces = await this.readRecentlyOpenedWorkspaces();
    const normalizedWorkspaces =
      await this.normalizeRecentlyOpenedWorkspaces(persistedWorkspaces);
    return normalizedWorkspaces;
  }

  private async getRecentWorkspaceRepositoryInfo(
    workspacePath: string,
  ): Promise<GitRepositoryInfo | null> {
    try {
      const repositoryInfo =
        await this.gitService.getWorkspaceRepositoryInfo(workspacePath);
      return repositoryInfo;
    } catch (error) {
      this.logger.debug(
        `[UserExperienceService] Failed to resolve repository info for recent workspace ${workspacePath}: ${error}`,
      );
      this.report(error as Error, 'resolveRecentWorkspaceRepository', {
        redactedWorkspacePath: redactWorkspacePathForTelemetry(workspacePath),
      });
      return null;
    }
  }

  private async getRecentWorkspaceMainWorktreePath(
    workspacePath: string,
  ): Promise<string | null> {
    try {
      return await this.gitService.getWorkspaceMainWorktreePath(workspacePath);
    } catch (error) {
      this.logger.debug(
        `[UserExperienceService] Failed to resolve main worktree for recent workspace ${workspacePath}: ${error}`,
      );
      this.report(error as Error, 'resolveRecentWorkspaceMainWorktree', {
        redactedWorkspacePath: redactWorkspacePathForTelemetry(workspacePath),
      });
      return null;
    }
  }

  private async recentWorkspacePathExists(
    workspacePath: string,
  ): Promise<boolean> {
    try {
      await fs.access(workspacePath);
      return true;
    } catch {
      return false;
    }
  }

  private async filterExistingRecentWorkspaces(
    workspaces: RecentlyOpenedWorkspace[],
  ): Promise<RecentlyOpenedWorkspace[]> {
    const existenceResults = await Promise.all(
      workspaces.map(async (workspace) => ({
        workspace,
        exists: await this.recentWorkspacePathExists(workspace.path),
      })),
    );

    return existenceResults
      .filter((result) => result.exists)
      .map((result) => result.workspace);
  }

  private async normalizeRecentlyOpenedWorkspace(
    workspace: RecentlyOpenedWorkspace,
  ): Promise<
    RecentlyOpenedWorkspace & {
      repositoryId?: string;
      hasResolvedMainWorktreePath: boolean;
    }
  > {
    const [repositoryInfo, mainWorktreePath] = await Promise.all([
      this.getRecentWorkspaceRepositoryInfo(workspace.path),
      this.getRecentWorkspaceMainWorktreePath(workspace.path),
    ]);

    const normalizedPath = mainWorktreePath ?? workspace.path;

    const normalizedWorkspace = {
      path: normalizedPath,
      name: path.basename(normalizedPath),
      openedAt: workspace.openedAt,
      repositoryId: repositoryInfo?.repositoryId,
      hasResolvedMainWorktreePath: mainWorktreePath !== null,
    };
    return normalizedWorkspace;
  }

  private async normalizeRecentlyOpenedWorkspaces(
    workspaces: RecentlyOpenedWorkspace[],
  ): Promise<RecentlyOpenedWorkspace[]> {
    const existingWorkspaces =
      await this.filterExistingRecentWorkspaces(workspaces);
    const normalizedWorkspaces = await Promise.all(
      existingWorkspaces.map((workspace) =>
        this.normalizeRecentlyOpenedWorkspace(workspace),
      ),
    );
    const workspacesByKey = new Map<
      string,
      RecentlyOpenedWorkspace & { hasResolvedMainWorktreePath: boolean }
    >();

    for (const workspace of normalizedWorkspaces) {
      const { repositoryId, ...recentWorkspace } = workspace;
      const key = repositoryId ?? recentWorkspace.path;
      const existing = workspacesByKey.get(key);
      if (!existing) {
        workspacesByKey.set(key, recentWorkspace);
        continue;
      }

      const preferredPathWorkspace =
        existing.hasResolvedMainWorktreePath ===
        recentWorkspace.hasResolvedMainWorktreePath
          ? recentWorkspace.openedAt > existing.openedAt
            ? recentWorkspace
            : existing
          : existing.hasResolvedMainWorktreePath
            ? existing
            : recentWorkspace;

      const mergedWorkspace = {
        ...preferredPathWorkspace,
        openedAt: Math.max(existing.openedAt, recentWorkspace.openedAt),
      };
      workspacesByKey.set(key, mergedWorkspace);
    }

    return [...workspacesByKey.values()]
      .map(
        ({ hasResolvedMainWorktreePath: _hasResolved, ...workspace }) =>
          workspace,
      )
      .sort((a, b) => b.openedAt - a.openedAt);
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
    const workspaceEntry = { path: workspacePath, name, openedAt };

    try {
      const persistedWorkspaces = await this.readRecentlyOpenedWorkspaces();
      const workspaces = await this.normalizeRecentlyOpenedWorkspaces([
        ...persistedWorkspaces,
        workspaceEntry,
      ]);

      await this.writeRecentlyOpenedWorkspaces(workspaces);
      // Update UI state with combined data
      const storedData = await this.getStoredExperienceData();
      this.uiKarton.setState((draft) => {
        draft.userExperience.storedExperienceData = storedData;
      });
      this.logger.debug(
        `[UserExperienceService] Saved recently opened workspace: ${workspacePath}`,
      );
    } catch (error) {
      this.logger.error(
        `[UserExperienceService] Failed to save recently opened workspace. Error: ${error}`,
      );
      this.report(error as Error, 'saveRecentWorkspace');
    }
  }

  /**
   * Get combined stored experience data from separate files.
   * This combines data from recently-opened-workspaces.json and onboarding-state.json.
   */
  public async getStoredExperienceData(): Promise<StoredExperienceData> {
    const [recentlyOpenedWorkspaces, hasSeenOnboardingFlow] = await Promise.all(
      [this.getRecentlyOpenedWorkspaces(), this.readOnboardingState()],
    );
    return {
      recentlyOpenedWorkspaces,
      hasSeenOnboardingFlow,
      lastViewedChats: {},
    };
  }

  public async setHasSeenOnboardingFlow(
    value: boolean,
    auth: OnboardingAuthCompletion = { auth_method: 'unknown' },
  ) {
    try {
      await this.writeOnboardingState(value);
      // Update UI state with combined data
      const storedData = await this.getStoredExperienceData();
      this.uiKarton.setState((draft) => {
        draft.userExperience.storedExperienceData = storedData;
      });
      this.logger.debug(
        `[UserExperienceService] Set hasSeenOnboardingFlow to: ${value}`,
      );
      if (value) {
        this.telemetryService.capture('onboarding-completed', {
          skipped: false,
          telemetry_level: this.telemetryService.telemetryLevel,
          ...auth,
        });
      }
    } catch (error) {
      this.logger.error(
        `[UserExperienceService] Failed to save hasSeenOnboardingFlow. Error: ${error}`,
      );
      this.report(error as Error, 'saveOnboardingState');
    }
  }

  private async pruneRecentlyOpenedWorkspaces({
    maxAmount,
    hasBeenOpenedBeforeDate,
  }: {
    maxAmount: number;
    hasBeenOpenedBeforeDate: number;
  }) {
    try {
      const persistedWorkspaces = await this.readRecentlyOpenedWorkspaces();
      const workspaces =
        await this.normalizeRecentlyOpenedWorkspaces(persistedWorkspaces);

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
      this.report(error as Error, 'pruneRecentWorkspaces');
    }
  }
}
