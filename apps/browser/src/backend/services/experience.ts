/**
 * The experience state service is responsible for managing the state of the global user experience.
 *
 * This includes preferences for what's shown in UI, the progress of getting started experiences etc.
 *
 * @warning The state of workspace-specific experiences is to be managed by the workspace manager etc.
 */

import { z } from 'zod';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  recentlyOpenedWorkspacesArraySchema,
  onboardingStateSchema,
  tutorialStateSchema,
  experienceSurveySchema,
  founderCallSurveySchema,
  type StoredExperienceData,
  type RecentlyOpenedWorkspace,
  type ExperienceSurvey,
  type FounderCallSurvey,
} from '@shared/karton-contracts/ui';
import type { KartonService } from './karton';
import type { Logger } from './logger';
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

export type GetOldestAgentCreatedAt = () => Promise<Date | null>;
export type GetAgentCount = () => Promise<number>;

export class UserExperienceService extends DisposableService {
  private readonly logger: Logger;
  private readonly uiKarton: KartonService;
  private readonly telemetryService: TelemetryService;
  private readonly gitService: GitService;
  private readonly getOldestAgentCreatedAt?: GetOldestAgentCreatedAt;
  private readonly getAgentCount?: GetAgentCount;
  // Store bound callback reference for proper unregistration
  private readonly boundHandleServiceStateChange: () => void;

  // Flag to prevent re-entrant initialization
  private isLoadingStoredExperienceData = false;
  private hasInitializedStoredExperienceData = false;

  // Serialize tutorial step writes to prevent races from fire-and-forget saves
  private tutorialStepLock: Promise<void> = Promise.resolve();

  // Prevent concurrent firstUsedAt writes
  private isSettingFirstUsedAt = false;

  // Prevent concurrent totalAgentCount refresh queries
  private isRefreshingAgentCount = false;

  private constructor(
    logger: Logger,
    uiKarton: KartonService,
    telemetryService: TelemetryService,
    gitService: GitService,
    getOldestAgentCreatedAt?: GetOldestAgentCreatedAt,
    getAgentCount?: GetAgentCount,
  ) {
    super();
    this.logger = logger;
    this.uiKarton = uiKarton;
    this.telemetryService = telemetryService;
    this.gitService = gitService;
    this.getOldestAgentCreatedAt = getOldestAgentCreatedAt;
    this.getAgentCount = getAgentCount;

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
    getOldestAgentCreatedAt?: GetOldestAgentCreatedAt,
    getAgentCount?: GetAgentCount,
  ) {
    logger.debug('[UserExperienceService] Creating service');
    const instance = new UserExperienceService(
      logger,
      uiKarton,
      telemetryService,
      gitService,
      getOldestAgentCreatedAt,
      getAgentCount,
    );
    await instance.initialize();
    logger.debug('[UserExperienceService] Created service');
    return instance;
  }

  private async initialize() {
    const [
      hasSeenOnboarding,
      tutorialState,
      surveyState,
      founderCallSurveyState,
      firstUsedAt,
      totalAgentCount,
    ] = await Promise.all([
      this.readOnboardingState(),
      this.readTutorialState(),
      this.readSurveyState(),
      this.readFounderCallSurveyState(),
      this.readFirstUsedAt(),
      this.readAgentCount(),
    ]);
    this.uiKarton.setState((draft) => {
      draft.userExperience.storedExperienceData.hasSeenOnboardingFlow =
        hasSeenOnboarding;
      draft.userExperience.storedExperienceData.tutorialState = tutorialState;
      draft.userExperience.storedExperienceData.experienceSurvey = surveyState;
      draft.userExperience.storedExperienceData.founderCallSurvey =
        founderCallSurveyState;
      draft.userExperience.storedExperienceData.firstUsedAt = firstUsedAt;
      draft.userExperience.storedExperienceData.totalAgentCount =
        totalAgentCount;
      draft.userExperience.experienceSurvey = surveyState;
      draft.userExperience.founderCallSurvey = founderCallSurveyState;
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
      'userExperience.tutorial.setStep',
      async (
        _callingClientId: string,
        { tutorialId, stepIndex }: { tutorialId: string; stepIndex: number },
      ) => {
        await this.setTutorialStep(tutorialId, stepIndex);
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
      'userExperience.survey.answer',
      async (_callingClientId: string, answer: 'yes' | 'no') => {
        await this.answerSurvey(answer);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'userExperience.survey.dismiss',
      async (_callingClientId: string) => {
        await this.dismissSurvey();
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'userExperience.survey.submitFeedback',
      async (_callingClientId: string, feedback: string) => {
        await this.submitSurveyFeedback(feedback);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'userExperience.founderCall.survey.open',
      async (_callingClientId: string) => {
        await this.openFounderCallSurvey();
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'userExperience.founderCall.survey.dismiss',
      async (_callingClientId: string) => {
        await this.dismissFounderCallSurvey();
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
      'userExperience.tutorial.setStep',
    );
    this.uiKarton.removeServerProcedureHandler('userExperience.survey.answer');
    this.uiKarton.removeServerProcedureHandler('userExperience.survey.dismiss');
    this.uiKarton.removeServerProcedureHandler(
      'userExperience.survey.submitFeedback',
    );
    this.uiKarton.removeServerProcedureHandler(
      'userExperience.founderCall.survey.open',
    );
    this.uiKarton.removeServerProcedureHandler(
      'userExperience.founderCall.survey.dismiss',
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
          draft.userExperience.experienceSurvey =
            storedExperienceData.experienceSurvey;
          draft.userExperience.founderCallSurvey =
            storedExperienceData.founderCallSurvey;
        });
      });
    }

    // Set firstUsedAt on first user message in any agent
    const currentState = this.uiKarton.state;
    if (this.isSettingFirstUsedAt) return;
    if (currentState.userExperience.storedExperienceData.firstUsedAt !== null)
      return;
    const hasMessages = Object.values(currentState.agents.instances).some(
      (instance) => instance.state.history.length > 0,
    );
    if (hasMessages) {
      void this.setFirstUsedAt();
    }

    // Refresh totalAgentCount from DB — the DB is the source of truth,
    // not the in-memory agent instances (which may be a subset).
    // The guard prevents concurrent queries from rapid state changes.
    if (this.getAgentCount && !this.isRefreshingAgentCount) {
      this.isRefreshingAgentCount = true;
      void this.getAgentCount()
        .then((count) => {
          // Read storedCount fresh from state — the closure value may be stale
          // if an earlier callback already updated it.
          const currentStored =
            this.uiKarton.state.userExperience.storedExperienceData
              .totalAgentCount;
          if (count > currentStored) {
            this.uiKarton.setState((draft) => {
              draft.userExperience.storedExperienceData.totalAgentCount = count;
            });
          }
        })
        .catch((error) => {
          this.report(error as Error, 'refreshAgentCount');
        })
        .finally(() => {
          this.isRefreshingAgentCount = false;
        });
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

  /**
   * Read the tutorial state from persisted data.
   */
  private async readTutorialState(): Promise<Record<string, number>> {
    return readPersistedData('tutorial-state', tutorialStateSchema, {});
  }

  /**
   * Write the tutorial state to persisted data.
   */
  private async writeTutorialState(
    state: Record<string, number>,
  ): Promise<void> {
    await writePersistedData('tutorial-state', tutorialStateSchema, state);
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
    const [
      recentlyOpenedWorkspaces,
      hasSeenOnboardingFlow,
      tutorialState,
      experienceSurvey,
      founderCallSurvey,
      firstUsedAt,
      totalAgentCount,
    ] = await Promise.all([
      this.getRecentlyOpenedWorkspaces(),
      this.readOnboardingState(),
      this.readTutorialState(),
      this.readSurveyState(),
      this.readFounderCallSurveyState(),
      this.readFirstUsedAt(),
      this.readAgentCount(),
    ]);
    return {
      recentlyOpenedWorkspaces,
      hasSeenOnboardingFlow,
      lastViewedChats: {},
      tutorialState,
      experienceSurvey,
      firstUsedAt,
      founderCallSurvey,
      totalAgentCount,
    };
  }

  /**
   * Read the experience survey state from persisted data.
   */
  private async readSurveyState(): Promise<ExperienceSurvey> {
    const state = await readPersistedData(
      'experience-survey',
      experienceSurveySchema,
      {
        dismissedAt: null,
        dismissedCount: 0,
        answered: false,
        answeredAt: null,
      },
    );
    const answeredAt = this.validateTimestamp(
      state.answeredAt,
      'survey.answeredAt',
    );
    const dismissedAt = this.validateTimestamp(
      state.dismissedAt,
      'survey.dismissedAt',
    );
    // If the survey was answered but the timestamp is corrupted, use now
    // as a fallback so the founder-call stagger check has a valid baseline.
    return {
      ...state,
      answeredAt: answeredAt ?? (state.answered ? Date.now() : null),
      dismissedAt,
    };
  }

  /**
   * Write the experience survey state to persisted data.
   */
  private async writeSurveyState(state: ExperienceSurvey): Promise<void> {
    await writePersistedData(
      'experience-survey',
      experienceSurveySchema,
      state,
    );
  }

  public async answerSurvey(answer: 'yes' | 'no') {
    try {
      const now = Date.now();
      const survey = await this.readSurveyState();
      survey.answered = true;
      survey.answeredAt = now;
      await this.writeSurveyState(survey);

      // Update UI state
      const storedData = await this.getStoredExperienceData();
      this.uiKarton.setState((draft) => {
        draft.userExperience.storedExperienceData = storedData;
        draft.userExperience.experienceSurvey = survey;
      });

      // Fire telemetry even if telemetry is off (bypass list).
      this.telemetryService.capture('experience-survey-answered', { answer });

      this.logger.debug(`[UserExperienceService] Survey answered: ${answer}`);
    } catch (error) {
      this.logger.error(
        `[UserExperienceService] Failed to save survey answer. Error: ${error}`,
      );
      this.report(error as Error, 'saveSurveyAnswer');
    }
  }

  public async dismissSurvey() {
    try {
      const survey = await this.readSurveyState();
      if (survey.answered) return;

      survey.dismissedAt = Date.now();
      survey.dismissedCount = Math.min(survey.dismissedCount + 1, 3);
      await this.writeSurveyState(survey);

      const storedData = await this.getStoredExperienceData();
      this.uiKarton.setState((draft) => {
        draft.userExperience.storedExperienceData = storedData;
        draft.userExperience.experienceSurvey = survey;
      });

      this.logger.debug(
        `[UserExperienceService] Survey dismissed (count: ${survey.dismissedCount})`,
      );
    } catch (error) {
      this.logger.error(
        `[UserExperienceService] Failed to dismiss survey. Error: ${error}`,
      );
      this.report(error as Error, 'dismissSurvey');
    }
  }

  public async submitSurveyFeedback(feedback: string) {
    try {
      // Fire telemetry even if telemetry is off (bypass list).
      this.telemetryService.capture('experience-survey-feedback-submitted', {
        feedback,
        feedback_length: feedback.length,
      });

      this.logger.debug('[UserExperienceService] Survey feedback submitted');
    } catch (error) {
      this.logger.error(
        `[UserExperienceService] Failed to submit survey feedback. Error: ${error}`,
      );
      this.report(error as Error, 'submitSurveyFeedback');
    }
  }

  /**
   * Read the founder call survey state from persisted data.
   */
  private async readFounderCallSurveyState(): Promise<FounderCallSurvey> {
    const state = await readPersistedData(
      'experience-founder-call-survey',
      founderCallSurveySchema,
      {
        dismissedAt: null,
        dismissedCount: 0,
        answered: false,
        answeredAt: null,
      },
    );
    return {
      ...state,
      answeredAt: this.validateTimestamp(
        state.answeredAt,
        'founderCallSurvey.answeredAt',
      ),
      dismissedAt: this.validateTimestamp(
        state.dismissedAt,
        'founderCallSurvey.dismissedAt',
      ),
    };
  }

  /**
   * Write the founder call survey state to persisted data.
   */
  private async writeFounderCallSurveyState(
    state: FounderCallSurvey,
  ): Promise<void> {
    await writePersistedData(
      'experience-founder-call-survey',
      founderCallSurveySchema,
      state,
    );
  }

  public async openFounderCallSurvey() {
    try {
      const now = Date.now();
      const survey = await this.readFounderCallSurveyState();
      survey.answered = true;
      survey.answeredAt = now;
      await this.writeFounderCallSurveyState(survey);

      const storedData = await this.getStoredExperienceData();
      this.uiKarton.setState((draft) => {
        draft.userExperience.storedExperienceData = storedData;
        draft.userExperience.founderCallSurvey = survey;
      });

      this.telemetryService.capture(
        'experience-founder-call-survey-opened',
        undefined,
      );

      this.logger.debug('[UserExperienceService] Founder call survey opened');
    } catch (error) {
      this.logger.error(
        `[UserExperienceService] Failed to save founder call survey answer. Error: ${error}`,
      );
      this.report(error as Error, 'saveFounderCallSurveyAnswer');
    }
  }

  public async dismissFounderCallSurvey() {
    try {
      const survey = await this.readFounderCallSurveyState();
      if (survey.answered) return;

      survey.dismissedAt = Date.now();
      survey.dismissedCount = Math.min(survey.dismissedCount + 1, 3);
      await this.writeFounderCallSurveyState(survey);

      const storedData = await this.getStoredExperienceData();
      this.uiKarton.setState((draft) => {
        draft.userExperience.storedExperienceData = storedData;
        draft.userExperience.founderCallSurvey = survey;
      });

      this.telemetryService.capture(
        'experience-founder-call-survey-dismissed',
        undefined,
      );

      this.logger.debug(
        `[UserExperienceService] Founder call survey dismissed (count: ${survey.dismissedCount})`,
      );
    } catch (error) {
      this.logger.error(
        `[UserExperienceService] Failed to dismiss founder call survey. Error: ${error}`,
      );
      this.report(error as Error, 'dismissFounderCallSurvey');
    }
  }

  private async setFirstUsedAt() {
    this.isSettingFirstUsedAt = true;
    try {
      // For existing users with chat history, backfill from the oldest
      // agent instance's createdAt instead of using Date.now(). This
      // ensures long-time users are immediately eligible for the founder
      // call survey instead of having to wait 4 more days.
      let timestamp = Date.now();
      if (this.getOldestAgentCreatedAt) {
        const oldest = await this.getOldestAgentCreatedAt();
        if (oldest !== null) {
          const oldestMs = oldest.getTime();
          // Use the same plausibility threshold as readFirstUsedAt() /
          // validateTimestamp(). Only persist if the value is plausible
          // (>= Jan 1, 2000 and not in the future); otherwise fall back
          // to now so a valid timestamp is always written and the
          // backfill is not retried on every state change.
          if (this.validateTimestamp(oldestMs, 'firstUsedAt') !== null) {
            timestamp = oldestMs;
          }
        }
      }
      await this.writeFirstUsedAt(timestamp);
      this.uiKarton.setState((draft) => {
        draft.userExperience.storedExperienceData.firstUsedAt = timestamp;
      });
      this.logger.debug(
        `[UserExperienceService] Set firstUsedAt to ${new Date(timestamp).toISOString()}`,
      );
    } catch (error) {
      this.logger.error(
        `[UserExperienceService] Failed to set firstUsedAt. Error: ${error}`,
      );
      this.report(error as Error, 'setFirstUsedAt');
    } finally {
      this.isSettingFirstUsedAt = false;
    }
  }

  // Minimum plausible timestamp: Jan 1, 2000. Anything below this is
  // corrupted (e.g. 0, 100 from epoch-0 agent records) and should be
  // treated as null so setFirstUsedAt() re-runs and backfills correctly.
  private static readonly MIN_PLAUSIBLE_TIMESTAMP = 946684800000;

  /**
   * Returns the timestamp if plausible, or null if corrupted (pre-2000
   * or in the future). Logs a debug message for diagnostics.
   */
  private validateTimestamp(raw: number | null, field: string): number | null {
    if (raw === null) return null;
    if (
      raw < UserExperienceService.MIN_PLAUSIBLE_TIMESTAMP ||
      raw > Date.now()
    ) {
      this.logger.debug(
        `[UserExperienceService] Detected implausible ${field} value ${raw}, treating as null.`,
      );
      return null;
    }
    return raw;
  }

  private async readFirstUsedAt(): Promise<number | null> {
    const raw = await readPersistedData(
      'first-used-at',
      z.number().nullable(),
      null,
    );
    return this.validateTimestamp(raw, 'firstUsedAt');
  }

  private async readAgentCount(): Promise<number> {
    if (!this.getAgentCount) return 0;
    try {
      return await this.getAgentCount();
    } catch {
      return 0;
    }
  }

  private async writeFirstUsedAt(value: number): Promise<void> {
    await writePersistedData('first-used-at', z.number().nullable(), value);
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

  public async setTutorialStep(tutorialId: string, stepIndex: number) {
    // Serialize writes by chaining onto the previous one. The UI sends
    // these fire-and-forget, so two rapid saves can otherwise read the
    // same stale state and drop each other's updates. Errors are handled
    // inside the chained task, so the chain itself never rejects.
    const run = this.tutorialStepLock.then(async () => {
      try {
        const currentState = await this.readTutorialState();
        // Only move forward — never regress. An older fire-and-forget
        // save can still arrive *after* a newer one, even when serialized.
        currentState[tutorialId] = Math.max(
          currentState[tutorialId] ?? stepIndex,
          stepIndex,
        );
        await this.writeTutorialState(currentState);
        // Patch only the tutorial slice — rebuilding the whole
        // storedExperienceData object would hand new references to
        // unrelated consumers (e.g. recently opened workspaces) and
        // re-render them on every step advance.
        this.uiKarton.setState((draft) => {
          draft.userExperience.storedExperienceData.tutorialState =
            currentState;
        });
        this.logger.debug(
          `[UserExperienceService] Set tutorial ${tutorialId} step to: ${stepIndex}`,
        );
      } catch (error) {
        this.logger.error(
          `[UserExperienceService] Failed to save tutorial step. Error: ${error}`,
        );
        this.report(error as Error, 'saveTutorialStep');
      }
    });
    this.tutorialStepLock = run;
    await run;
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
