import type { BaseAgent } from '@/agents/shared/base-agent';
import {
  type AgentHistoryEntry,
  AgentTypes,
} from '@shared/karton-contracts/ui/agent';
import { DisposableService } from '../disposable';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import { AgentsMap, type AgentTypeMap } from '@/agents/agents-map';
import { randomUUID } from 'node:crypto';
import type { KartonService } from '../karton';
import type { TelemetryService } from '../telemetry';
import type { Logger } from '../logger';
import type { ToolboxService } from '../toolbox';
import type { ModelProviderService } from '@/agents/model-provider';
import type { ModelId } from '@shared/available-models';
import {
  DEFAULT_TOOL_APPROVAL_MODE,
  toolApprovalModeSchema,
  type ToolApprovalMode,
} from '@shared/karton-contracts/ui/shared-types';
import type { z } from 'zod';
import { AgentPersistenceDB } from './persistence/db';
import type { AgentState } from '@shared/karton-contracts/ui/agent';
import { writeBlob, deleteAgentBlobs } from '@/utils/attachment-blobs';
import { shell } from 'electron';
import { existsSync } from 'node:fs';
import { getAgentDir } from '@/utils/paths';
import { generateAttachmentFilename } from '@shared/utils/attachment-filename';

import type { QuestionAnswerValue } from '@shared/karton-contracts/ui/agent/tools/types';
import { readWorkspaceMd } from '@/agents/shared/prompts/utils/read-workspace-md';
import {
  extractSlashIdsFromText,
  redactSlashIdsForTelemetry,
} from '@/agents/shared/prompts/utils/metadata-converter/slash-items';
import { getGitInfo } from '@/utils/git-tools';
import type { AssetCacheService } from '@/services/asset-cache';
import type { ProcessedImageCacheService } from '@/services/processed-image-cache';

function toFiniteTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }

  if (typeof value === 'string') {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }

  return undefined;
}

/**
 * @note Due to the complex type inference for all this stuff, we sometimes explicitly define types here to avoid errors.
 *       This is a bit of a hack, but it's the best we can do for now.
 */

export class AgentManagerService extends DisposableService {
  /** Server-side bounds for user-editable agent titles. Slightly more permissive
   * than the UI's 2–80 range so minor client/server drift never silently drops
   * a valid title. */
  private static readonly TITLE_MIN_LENGTH = 1;
  private static readonly TITLE_MAX_LENGTH = 200;

  private activeAgents = new Map<
    string,
    BaseAgent<any, any> | BaseAgent<never, any>
  >();

  private readonly karton: KartonService;
  private readonly telemetryService: TelemetryService;
  private readonly toolbox: ToolboxService;
  private readonly logger: Logger;
  private readonly modelProviderService: ModelProviderService;
  private readonly assetCacheService?: AssetCacheService;
  private readonly processedImageCacheService?: ProcessedImageCacheService;

  private agentPersistenceDB: AgentPersistenceDB | null = null;
  private readonly dbReadyPromise: Promise<AgentPersistenceDB | null>;

  public constructor(
    karton: KartonService,
    telemetryService: TelemetryService,
    toolbox: ToolboxService,
    logger: Logger,
    modelProviderService: ModelProviderService,
    assetCacheService?: AssetCacheService,
    processedImageCacheService?: ProcessedImageCacheService,
  ) {
    super();
    this.karton = karton;
    this.telemetryService = telemetryService;
    this.toolbox = toolbox;
    this.logger = logger;
    this.modelProviderService = modelProviderService;
    this.assetCacheService = assetCacheService;
    this.processedImageCacheService = processedImageCacheService;

    this.registerKartonHandlers();

    // Initialize the DB and store the promise so we can await it in handlers
    this.dbReadyPromise = AgentPersistenceDB.create(logger)
      .then((db) => {
        this.agentPersistenceDB = db;
        return db;
      })
      .catch((error) => {
        this.report(error as Error, 'dbInit');
        return null;
      });

    // Create an empty default agent only after the DB is ready
    // This ensures that when there's an active agent, the DB is guaranteed to be initialized
    this.dbReadyPromise.then(async () => {
      const agent = await this.createAgent(AgentTypes.CHAT, undefined);
      const lastWorkspaces =
        await this.agentPersistenceDB?.getLastChatWorkspacePaths();
      if (!lastWorkspaces) return;
      for (const ws of lastWorkspaces) {
        try {
          await this.toolbox.handleMountWorkspace(
            agent.instanceId,
            ws.path,
            ws.permissions,
          );
        } catch (error) {
          this.logger.warn(
            `[AgentManager] Failed to mount workspace ${ws.path} on startup`,
            { error },
          );
        }
      }
    });
  }

  private report(
    error: Error,
    operation: string,
    extra?: Record<string, unknown>,
  ) {
    this.telemetryService.captureException(error, {
      service: 'agent-manager',
      operation,
      ...extra,
    });
  }

  /**
   * Ensures the persistence DB is ready before performing operations.
   * Returns the DB instance or null if initialization failed.
   */
  private async ensureDBReady(): Promise<AgentPersistenceDB | null> {
    await this.dbReadyPromise;
    return this.agentPersistenceDB;
  }

  /**
   * Register all Karton procedure handlers.
   * Extracted to separate method to avoid "Expression produces a union type
   * that is too complex to represent" error in the constructor.
   */
  private registerKartonHandlers(): void {
    this.karton.registerServerProcedureHandler(
      'agents.create',
      async (
        _callingClientId: string,
        initialInputState?: string,
        modelId?: ModelId,
        workspacePaths?: string[],
      ) => {
        const agent = await this.createAgent(
          AgentTypes.CHAT,
          undefined,
          undefined,
          modelId ? { activeModelId: modelId } : undefined,
          undefined,
          initialInputState,
        );
        if (workspacePaths) {
          for (const wp of workspacePaths)
            await this.toolbox.handleMountWorkspace(agent.instanceId, wp);
        } else {
          const lastWorkspaces =
            await this.agentPersistenceDB?.getLastChatWorkspacePaths();
          if (lastWorkspaces) {
            for (const ws of lastWorkspaces) {
              try {
                await this.toolbox.handleMountWorkspace(
                  agent.instanceId,
                  ws.path,
                  ws.permissions,
                );
              } catch (error) {
                this.logger.warn(
                  `[AgentManager] Failed to auto-mount workspace ${ws.path}`,
                  { error },
                );
              }
            }
          }
        }
        return agent.instanceId;
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.resume',
      async (_callingClientId: string, instanceId: string) => {
        await this.resumeAgent(instanceId);
        return;
      },
    );

    this.karton.registerServerProcedureHandler(
      'agents.sendUserMessage',
      async (
        _callingClientId: string,
        instanceId: string,
        message: AgentMessage & { role: 'user' },
      ) => {
        await this.sendUserMessage(instanceId, message);
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.interruptQuestionWithMessage',
      async (
        _callingClientId: string,
        instanceId: string,
        questionId: string,
        message: AgentMessage & { role: 'user' },
        draftAnswers: Record<string, QuestionAnswerValue>,
      ) => {
        // Queue the message FIRST, then resolve the question — both in
        // one backend call so there's no race between separate RPCs.
        try {
          await this.sendUserMessage(instanceId, message);
        } finally {
          this.toolbox.cancelQuestion(
            instanceId,
            questionId,
            'user_sent_message',
            draftAnswers,
          );
        }
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.sendToolApprovalResponse',
      async (
        _callingClientId: string,
        instanceId: string,
        approvalId: string,
        approved: boolean,
        reason?: string,
      ) => {
        await this.sendToolApprovalResponse(
          instanceId,
          approvalId,
          approved,
          reason,
        );
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.setToolApprovalMode',
      async (
        _callingClientId: string,
        instanceId: string,
        mode: ToolApprovalMode,
        source?: 'panel-combobox' | 'inline-approval-button',
      ) => {
        const parsedMode = toolApprovalModeSchema.parse(mode);
        await this.setToolApprovalMode(instanceId, parsedMode, { source });
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.stop',
      async (_callingClientId: string, instanceId: string) => {
        await this.stopAgent(instanceId);
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.flushQueue',
      async (_callingClientId: string, instanceId: string) => {
        await this.flushQueue(instanceId);
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.clearQueue',
      async (_callingClientId: string, instanceId: string) => {
        await this.clearQueue(instanceId);
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.deleteQueuedMessage',
      async (
        _callingClientId: string,
        instanceId: string,
        messageId: string,
      ) => {
        await this.deleteQueuedMessage(instanceId, messageId);
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.revertToUserMessage',
      async (
        _callingClientId: string,
        instanceId: string,
        userMessageId: string,
        undoToolCalls: boolean,
      ) => {
        await this.revertToUserMessage(
          instanceId,
          userMessageId,
          undoToolCalls,
        );
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.replaceUserMessage',
      async (
        _callingClientId: string,
        instanceId: string,
        userMessageId: string,
        newMessage: AgentMessage & { role: 'user' },
        undoToolCalls: boolean,
      ) => {
        return await this.replaceUserMessage(
          instanceId,
          userMessageId,
          newMessage,
          undoToolCalls,
        );
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.delete',
      async (_callingClientId: string, instanceId: string) => {
        await this.deleteAgent(instanceId);
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.archive',
      async (_callingClientId: string, instanceId: string) => {
        await this.archiveAgent(instanceId);
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.markAsRead',
      async (_callingClientId: string, instanceId: string) => {
        if (this.karton.state.agents.instances[instanceId]) {
          this.karton.setState((draft) => {
            if (draft.agents.instances[instanceId]) {
              draft.agents.instances[instanceId].state.unread = false;
            }
          });
        }
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.setActiveModelId',
      async (
        _callingClientId: string,
        instanceId: string,
        modelId: ModelId,
      ) => {
        await this.updateActiveModelId(instanceId, modelId);
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.setTitle',
      async (_callingClientId: string, instanceId: string, title: string) => {
        const trimmed = title.trim();
        if (
          trimmed.length < AgentManagerService.TITLE_MIN_LENGTH ||
          trimmed.length > AgentManagerService.TITLE_MAX_LENGTH
        ) {
          throw new Error(
            `Invalid title length: ${trimmed.length} (must be ${AgentManagerService.TITLE_MIN_LENGTH}–${AgentManagerService.TITLE_MAX_LENGTH} chars)`,
          );
        }

        // Active path: let the agent handle it so Karton state updates and
        // titleLockedByUser is set via the normal state mutation.
        // The raw title is only transmitted at `full` telemetry. Titles
        // frequently contain project names, snippets, or other identifying
        // strings — `basic` should stay content-free.
        const isFullTelemetry = this.telemetryService.telemetryLevel === 'full';

        const agent = this.activeAgents.get(instanceId);
        if (agent) {
          await agent.setTitle(trimmed);
          // Read the type from Karton state rather than `agent.agentType`
          // to stay consistent with other emit sites in this file and
          // avoid coupling telemetry to a specific BaseAgent subclass shape.
          const agentType =
            this.karton.state.agents.instances[instanceId]?.type;
          this.telemetryService.capture('agent-renamed', {
            agent_instance_id: instanceId,
            was_active: true,
            new_title_length: trimmed.length,
            ...(agentType && { agent_type: agentType }),
            ...(isFullTelemetry && { new_title: trimmed }),
          });
          return;
        }

        // Inactive path: update the persisted row directly — no hydration,
        // no Karton fan-out; the UI's optimistic local update is authoritative
        // until the next history refetch.
        if (!this.agentPersistenceDB) {
          throw new Error('Persistence layer unavailable');
        }
        const updated = await this.agentPersistenceDB.updateAgentTitle(
          instanceId,
          trimmed,
        );
        if (!updated) {
          throw new Error(`Agent with instance id ${instanceId} not found`);
        }
        this.telemetryService.capture('agent-renamed', {
          agent_instance_id: instanceId,
          was_active: false,
          new_title_length: trimmed.length,
          ...(isFullTelemetry && { new_title: trimmed }),
        });
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.getAgentsHistoryList',
      async (
        _callingClientId: string,
        offset: number,
        limit: number,
        searchString?: string,
      ) => {
        return await this.getAgentsHistoryList(offset, limit, searchString);
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.updateInputState',
      async (
        _callingClientId: string,
        instanceId: string,
        inputState: string,
      ) => {
        await this.updateInputState(instanceId, inputState);
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.retryLastUserMessage',
      async (_callingClientId: string, instanceId: string) => {
        await this.retryLastUserMessage(instanceId);
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.storeAttachment',
      async (
        _callingClientId: string,
        agentId: string,
        originalFileName: string,
        data: string,
      ): Promise<string> => {
        const fileName = generateAttachmentFilename(originalFileName);
        const buffer = Buffer.from(data, 'base64');
        await writeBlob(agentId, fileName, buffer);
        return fileName;
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.storeAttachmentByPath',
      async (
        _callingClientId: string,
        agentId: string,
        originalFileName: string,
        filePath: string,
      ): Promise<string> => {
        const fileName = generateAttachmentFilename(originalFileName);
        await writeBlob(agentId, fileName, filePath);
        return fileName;
      },
    );
    this.karton.registerServerProcedureHandler(
      'toolbox.generateWorkspaceMd',
      async (
        _callingClientId: string,
        agentInstanceId: string,
        mountPrefix: string,
      ) => {
        const mounts =
          this.karton.state.toolbox[agentInstanceId]?.workspace?.mounts;
        const mount = mounts?.find((m) => m.prefix === mountPrefix);
        if (!mount) throw new Error(`Mount ${mountPrefix} not found`);

        await this.generateWorkspaceMdForPath(mount.path);
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.getStoredInstance',
      async (_callingClientId: string, agentId: string) => {
        const db = await this.dbReadyPromise;
        if (!db) return null;
        const row = await db.getStoredAgentInstanceById(agentId);
        if (!row) return null;

        const mountedWorkspaces = row.mountedWorkspaces
          ? await Promise.all(
              row.mountedWorkspaces.map(async (w) => ({
                ...w,
                ...(await getGitInfo(w.path)),
              })),
            )
          : null;

        return {
          id: row.id,
          type: row.type,
          title: row.title,
          createdAt: row.createdAt,
          lastMessageAt: row.lastMessageAt,
          activeModelId: row.activeModelId,
          messageCount: row.history.length,
          mountedWorkspaces,
        };
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.getTouchedFiles',
      async (_callingClientId: string, agentId: string) => {
        return this.toolbox.getEditedFilePathsForAgent(agentId);
      },
    );
    this.karton.registerServerProcedureHandler(
      'agents.revealWorkingDirectory',
      async (_callingClientId: string, agentId: string) => {
        try {
          // Agent's own per-instance data directory inside user-data — not
          // the mounted user project. This is the dev-option "working dir"
          // exposed via the context menu: where the agent's attachments,
          // shell logs, apps, etc. live on disk.
          const dir = getAgentDir(agentId);
          if (!existsSync(dir)) {
            return {
              success: false,
              error: `Agent directory does not exist: ${dir}`,
            };
          }
          const errorMessage = await shell.openPath(dir);
          if (errorMessage) {
            return { success: false, error: errorMessage };
          }
          return { success: true };
        } catch (error) {
          this.report(
            error instanceof Error ? error : new Error(String(error)),
            'revealWorkingDirectory',
          );
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    );
  }

  protected async onTeardown(): Promise<void> {
    for (const agent of this.activeAgents.values()) {
      await agent.onTeardown();
    }
    this.activeAgents.clear();
  }

  /**
   * Trigger WORKSPACE.md generation for a specific workspace path.
   * Finds a parent chat agent that has this path mounted and spawns
   * a workspace-md agent under it.
   */
  public async generateWorkspaceMdForPath(
    workspacePath: string,
  ): Promise<void> {
    let parentAgentId: string | undefined;
    for (const [agentId, toolboxState] of Object.entries(
      this.karton.state.toolbox,
    )) {
      if (toolboxState.workspace.mounts.some((m) => m.path === workspacePath)) {
        parentAgentId = agentId;
        break;
      }
    }

    await this.createAgent(
      AgentTypes.WORKSPACE_MD,
      { workspacePath },
      {
        parentInstanceId: parentAgentId ?? '',
        onFinish: async () => {
          const content = await readWorkspaceMd(workspacePath);
          this.toolbox.setWorkspaceMdContent(workspacePath, content);
        },
        onError: (error) => {
          this.report(error, 'workspaceMdGenerationFailed');
          this.logger.error('[AgentManager] WorkspaceMd generation failed', {
            error,
          });
        },
      },
    );
  }

  // Create a new agent. Should be called when the user creates a new agent.
  public async createAgent<TAgentType extends keyof AgentTypeMap>(
    type: TAgentType,
    instanceConfig: InstanceType<AgentTypeMap[TAgentType]>['instanceConfig'],
    parent?: {
      parentInstanceId: string;
      onFinish: (
        finishOutput: z.infer<
          (typeof AgentsMap)[TAgentType]['config']['finishToolOutputSchema']
        >,
      ) => void | Promise<void>;
      onError: (error: Error) => void | Promise<void>;
    },
    initialState?: Partial<AgentState>,
    instanceId?: string,
    initialInputState?: string,
  ): Promise<
    BaseAgent<
      (typeof AgentsMap)[TAgentType]['config']['finishToolOutputSchema'] extends z.ZodType
        ? (typeof AgentsMap)[TAgentType]['config']['finishToolOutputSchema']
        : never,
      InstanceType<AgentTypeMap[TAgentType]>['instanceConfig']
    >
  > {
    const agentInstanceId = instanceId ?? randomUUID();

    // For new chat agents (not resumed), use the model from the last persisted chat
    // Validate the model still exists (it may have been a deleted custom model)
    const lastChatModelId = await this.agentPersistenceDB?.getLastChatModelId();
    const lastModelValid =
      lastChatModelId && this.modelProviderService.modelExists(lastChatModelId);

    // Build state object outside setState to avoid "Type instantiation is excessively deep" error
    // caused by complex Draft<[]> inference from the 'ai' package's UIMessage type
    const defaultState: AgentState = {
      title: '',
      isWorking: false,
      history: [],
      queuedMessages: [],
      activeModelId: 'claude-sonnet-4.6',
      toolApprovalMode: DEFAULT_TOOL_APPROVAL_MODE,
      pendingApprovals: {},
      inputState: initialInputState ?? '',
      usedTokens: 0,
    };

    // Use type assertion to avoid "Type instantiation is excessively deep" error
    // caused by Draft<> inference on deeply nested  types from 'ai' package
    this.karton.setState((draft) => {
      (draft.agents.instances as Record<string, unknown>)[agentInstanceId] = {
        type: type,
        canSelectModel: AgentsMap[type].config.allowModelSelection,
        requiredModelCapabilities: AgentsMap[type].config.requiredCapabilities,
        allowUserInput: AgentsMap[type].config.allowUserInput,
        parentAgentInstanceId: parent?.parentInstanceId ?? null,
        state: defaultState,
      };
    });

    this.logger.info(
      `[AgentManager] Creating agent. ID: ${agentInstanceId}, Type: ${type}`,
    );

    const agent = new AgentsMap[type](
      agentInstanceId,
      {
        get: () =>
          this.karton.state.agents.instances[agentInstanceId]
            .state as Readonly<AgentState>,
        set: (recipe) => {
          this.karton.setState((draft) => {
            // @ts-ignore - We have to call the state update recipe with the draft this way to keep "immer" working.
            recipe(draft.agents.instances[agentInstanceId].state);
            draft.agents.instances[agentInstanceId].type = type;
          });
        },
        persist: (dirtyMessageIndices?: number[]) =>
          this.persistAgentState(agentInstanceId, dirtyMessageIndices),
      },
      this.toolbox,
      this.telemetryService,
      this.logger,
      this.modelProviderService,
      instanceConfig as any,
      async (childAgentType, instanceConfig, onFinish, onError) => {
        return await this.spawnChildAgent(
          agentInstanceId,
          childAgentType,
          instanceConfig,
          onFinish,
          onError,
        );
      },
      // @ts-ignore - The onFinish handler returns outputs with the configured schema of the agent. dunno why ts doesn't get this right.
      parent?.onFinish,
      parent?.onError,
      initialState ?? {
        activeModelId:
          lastModelValid && type === AgentTypes.CHAT
            ? lastChatModelId
            : undefined,
      },
      this.assetCacheService,
      this.processedImageCacheService,
    );

    this.activeAgents.set(agentInstanceId, agent);

    this.telemetryService.capture('agent-created', {
      agent_type: type,
      agent_instance_id: agentInstanceId,
      model_id:
        this.karton.state.agents.instances[agentInstanceId]?.state
          .activeModelId ?? 'unknown',
    });

    return agent as BaseAgent<
      (typeof AgentsMap)[TAgentType]['config']['finishToolOutputSchema'] extends z.ZodType
        ? (typeof AgentsMap)[TAgentType]['config']['finishToolOutputSchema']
        : never,
      InstanceType<AgentTypeMap[TAgentType]>['instanceConfig']
    >;
  }

  private async spawnChildAgent<TChildAgentType extends keyof AgentTypeMap>(
    parentInstanceId: string,
    childAgentType: TChildAgentType,
    instanceConfig: InstanceType<
      AgentTypeMap[TChildAgentType]
    >['instanceConfig'],
    onFinish: (
      finishOutput: z.infer<
        (typeof AgentsMap)[TChildAgentType]['config']['finishToolOutputSchema']
      >,
    ) => void | Promise<void>,
    onError: (error: Error) => void | Promise<void>,
  ): Promise<
    BaseAgent<
      (typeof AgentsMap)[TChildAgentType]['config']['finishToolOutputSchema'] extends z.ZodType
        ? (typeof AgentsMap)[TChildAgentType]['config']['finishToolOutputSchema']
        : never,
      InstanceType<AgentTypeMap[TChildAgentType]>['instanceConfig']
    >
  > {
    const childAgent = await this.createAgent(childAgentType, instanceConfig, {
      parentInstanceId: parentInstanceId,
      onFinish: onFinish,
      onError: onError,
    });

    return childAgent;
  }

  // Resume an agent from the last persisted state. Should probably be called when the user select the agent from a list of previous agents.
  public async resumeAgent(instanceId: string) {
    // Early exit if the agent is already active.
    if (this.activeAgents.has(instanceId)) {
      return this.activeAgents.get(instanceId);
    }

    this.logger.debug(`[AgentManager] Resuming agent. ID: ${instanceId}`);

    const agent =
      await this.agentPersistenceDB?.getStoredAgentInstanceById(instanceId);
    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    // Right now, we don't allow resuming sub-agents (because persisted agents stop all their tools calls anyway when they arew stopped and resumed - including any child agents).
    if (agent.parentAgentInstanceId) {
      throw new Error(
        `Agent with instance id ${instanceId} is a sub-agent and cannot be resumed`,
      );
    }

    // Validate that the persisted model still exists (it may have been a deleted custom model)
    const resumedModelValid =
      agent.activeModelId &&
      this.modelProviderService.modelExists(agent.activeModelId);

    const createdAgent = await this.createAgent(
      agent.type,
      agent.instanceConfig as any,
      undefined,
      {
        title: agent.title,
        titleLockedByUser: agent.titleLockedByUser ?? undefined,
        history: agent.history,
        queuedMessages: agent.queuedMessages,
        activeModelId: resumedModelValid ? agent.activeModelId : undefined,
        toolApprovalMode: agent.toolApprovalMode ?? DEFAULT_TOOL_APPROVAL_MODE,
        inputState: agent.inputState,
        usedTokens: agent.usedTokens,
        isWorking: false,
      },
      instanceId,
    );

    if (agent.mountedWorkspaces && Array.isArray(agent.mountedWorkspaces)) {
      for (const ws of agent.mountedWorkspaces) {
        try {
          await this.toolbox.handleMountWorkspace(
            instanceId,
            ws.path,
            ws.permissions,
          );
        } catch (error) {
          this.logger.warn(
            `[AgentManager] Failed to re-mount workspace ${ws.path} for agent ${instanceId}`,
            { error },
          );
        }
      }
    }

    await this.toolbox.restoreAssociatedBrowserTabsFromPersistence(
      instanceId,
      agent.associatedBrowserTabs,
    );

    this.telemetryService.capture('agent-resumed', {
      agent_type: agent.type,
      agent_instance_id: instanceId,
    });

    return createdAgent;
  }

  private async persistAgentState(
    instanceId: string,
    dirtyMessageIndices?: number[],
  ) {
    // Store agent state into DB.
    const agent = this.activeAgents.get(instanceId);

    const agentState = this.karton.state.agents.instances[instanceId].state;

    if (!agent || !agentState) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    if (agentState.history.length === 0) {
      // We don't persist empty agents.
    }

    const mountedWorkspaces =
      this.toolbox.getWorkspaceSnapshotForPersistence(instanceId);
    const associatedBrowserTabs =
      this.toolbox.getAssociatedBrowserTabsForPersistence(instanceId);

    await this.agentPersistenceDB?.storeAgentInstance(
      {
        id: instanceId,
        type: agent.agentType,
        title: agentState.title,
        titleLockedByUser: agentState.titleLockedByUser,
        activeModelId: agentState.activeModelId,
        toolApprovalMode: agentState.toolApprovalMode,
        createdAt: agentState.history[0].metadata?.createdAt ?? new Date(0), // Fallback should never be reached
        lastMessageAt:
          agentState.history[agentState.history.length - 1].metadata
            ?.createdAt ?? new Date(), // Fallback should never be reached
        queuedMessages: agentState.queuedMessages,
        inputState: agentState.inputState,
        usedTokens: agentState.usedTokens,
        mountedWorkspaces,
        associatedBrowserTabs,
      },
      agentState.history,
      dirtyMessageIndices,
    );
  }

  /**
   * Deletes an agent and all it's child agents permanently.
   *
   * @param instanceId The agent instance that should be deleted
   *
   * @note If you just want to stop an agent and remove it from the list of loaded agents, use the `archiveAgent` method instead.
   */
  private async deleteAgent(instanceId: string) {
    this.logger.debug(`[AgentManager] Deleting agent. ID: ${instanceId}`);

    const agentType =
      this.karton.state.agents.instances[instanceId]?.type ?? 'unknown';

    // Recursively delete all child agents first
    const childAgentInstanceIds = Object.entries(
      this.karton.state.agents.instances,
    )
      .filter(([_, instance]) => instance.parentAgentInstanceId === instanceId)
      .map(([id]) => id);
    for (const childAgentInstanceId of childAgentInstanceIds) {
      await this.deleteAgent(childAgentInstanceId);
    }

    // Archive this agent (stops it, tears down resources, removes from active state)
    await this.archiveAgent(instanceId);

    if (!this.agentPersistenceDB) {
      throw new Error('Agent persistence DB not found');
    }

    // Clear the agent from the persistence layer
    await this.agentPersistenceDB?.deleteAgentInstance(instanceId);

    // Permanently remove on-disk attachment blobs (archive intentionally
    // preserves them so a resumed agent can still access its attachments).
    void deleteAgentBlobs(instanceId);

    this.telemetryService.capture('agent-deleted', {
      agent_type: agentType,
      agent_instance_id: instanceId,
    });
  }

  /**
   * Stops an agent and deletes it's active instance while keeping the persisted state intact - must be resumed when it should be opened again.
   * @param instanceId The agent instance that should be archived (stopped and only persistence kept)
   */
  private async archiveAgent(instanceId: string) {
    this.logger.debug(`[AgentManager] Archiving agent. ID: ${instanceId}`);
    // Stop this agent and all child agents
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      return;
    }

    try {
      await this.persistAgentState(instanceId);
    } catch (error) {
      this.logger.error(
        `[AgentManager] Failed to persist agent ${instanceId} before archive`,
        error,
      );
    }

    await agent.stop();

    // Make sure to let the agent finish tool return with a failure so that a potential parent understands that the agent instance was deleted.
    await agent.reportErrorToParent(
      new Error("Agent was stopped and deleted before finishing it's task."),
    );

    // Accept all pending diffs before archiving so no "hanging" diffs remain
    try {
      await this.toolbox.acceptAllPendingEditsForAgent(instanceId);
    } catch (error) {
      this.logger.error(
        `[AgentManager] Failed to accept pending edits for agent ${instanceId}`,
        error,
      );
    }

    // Delete all child agents as well. Do this recursively.
    const childAgentInstanceIds = Object.entries(
      this.karton.state.agents.instances,
    )
      .filter(([_, instance]) => instance.parentAgentInstanceId === instanceId)
      .map(([id]) => id);
    for (const childAgentInstanceId of childAgentInstanceIds) {
      const childAgent = this.activeAgents.get(childAgentInstanceId);
      await childAgent?.onTeardown();
      await this.archiveAgent(childAgentInstanceId);
    }

    await agent.onTeardown();

    // Clear the active agents map.
    this.activeAgents.delete(instanceId);

    // Clear the karton state of the agent and its toolbox state.
    this.karton.setState((draft) => {
      delete draft.agents.instances[instanceId];
      delete draft.toolbox[instanceId];
    });

    this.telemetryService.capture('agent-archived', {
      agent_type: agent.agentType,
      agent_instance_id: instanceId,
    });
  }

  /**
   * ===============================
   * KARTON HANDLERS
   * ===============================
   */

  /**
   * Send a message to a specific agent
   */
  public async sendUserMessage(
    instanceId: string,
    message: AgentMessage & { role: 'user' },
  ) {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    const instance = this.karton.state.agents.instances[instanceId];
    const attachmentParts = message.parts.filter((p) => p.type === 'file');
    const slashCommandIds = extractSlashIdsFromText(
      message.parts as ReadonlyArray<{ type: string; text?: string }>,
    );
    // Redact before sending to telemetry: workspace/global skill IDs are
    // user-controlled (filesystem-derived) and can leak project/branch/
    // personal names. Only builtin/plugin IDs pass through as plaintext.
    const slashCommandIdsForTelemetry = redactSlashIdsForTelemetry(
      slashCommandIds,
      this.karton.state.skills ?? [],
    );
    const connectedWorkspaceCount =
      this.karton.state.toolbox[instanceId]?.workspace?.mounts?.length ?? 0;

    // Measure chat age / last-message gap *before* the message is dispatched
    // so the numbers reflect the state the user saw when sending.
    const historyBefore = instance?.state.history ?? [];
    const hasPriorUserMessage = historyBefore.some((m) => m.role === 'user');
    const lastMessage = historyBefore[historyBefore.length - 1];
    const lastMessageTs = toFiniteTimestamp(lastMessage?.metadata?.createdAt);
    const msSinceLastMessage =
      lastMessageTs !== undefined ? Date.now() - lastMessageTs : undefined;

    this.telemetryService.capture('agent-message-sent', {
      agent_type: instance?.type ?? 'unknown',
      agent_instance_id: instanceId,
      model_id: instance?.state.activeModelId ?? 'unknown',
      has_attachments: attachmentParts.length > 0,
      attachment_count: attachmentParts.length,
      slash_command_ids: slashCommandIdsForTelemetry,
      slash_command_count: slashCommandIds.length,
      connected_workspace_count: connectedWorkspaceCount,
      is_new_chat: !hasPriorUserMessage,
      ms_since_last_message: msSinceLastMessage,
      tool_approval_mode: instance?.state.toolApprovalMode ?? 'alwaysAsk',
    });

    await agent.sendUserMessage(message);
  }

  /**
   * Send a tool approval response to a specific agent
   */
  public async sendToolApprovalResponse(
    instanceId: string,
    approvalId: string,
    approved: boolean,
    reason?: string,
  ) {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    await agent.sendToolApprovalResponse({
      type: 'tool-approval-response',
      approvalId: approvalId,
      approved: approved,
      reason: reason,
    });
  }

  /**
   * Update the per-agent tool approval policy. Persists immediately so the
   * change survives agent resume. Safe to call on empty agents (no
   * history) because it uses a narrow DB update that bypasses the full
   * `persistAgentState` path.
   */
  public async setToolApprovalMode(
    instanceId: string,
    mode: ToolApprovalMode,
    telemetry?: {
      /** Which UI surface triggered the change; threaded from the RPC. */
      source?: 'panel-combobox' | 'inline-approval-button';
      /**
       * Only meaningful when `source === 'inline-approval-button'`:
       * the approval ID the user was responding to. Lets analytics
       * correlate the mode change with a specific approval request.
       */
      toolCallId?: string;
      /** Tool name for `inline-approval-button`; optional otherwise. */
      toolName?: string;
    },
  ) {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    const currentMode =
      this.karton.state.agents.instances[instanceId]?.state.toolApprovalMode ??
      'alwaysAsk';
    // No-op calls aren't logged — otherwise the combobox's onValueChange
    // firing on a reselection would emit spurious events.
    if (currentMode === mode) return;

    this.karton.setState((draft) => {
      draft.agents.instances[instanceId].state.toolApprovalMode = mode;
    });

    await this.agentPersistenceDB?.updateToolApprovalMode(instanceId, mode);

    this.telemetryService.capture('tool-approval-mode-changed', {
      agent_instance_id: instanceId,
      previous_mode: currentMode,
      new_mode: mode,
      source: telemetry?.source ?? 'unknown',
      ...(telemetry?.toolCallId && { tool_call_id: telemetry.toolCallId }),
      ...(telemetry?.toolName && { tool_name: telemetry.toolName }),
    });
  }

  /**
   * Stop a specific agent
   */
  public async stopAgent(instanceId: string) {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    const childAgents = Object.entries(this.karton.state.agents.instances)
      .filter(([_, instance]) => instance.parentAgentInstanceId === instanceId)
      .map(([id]) => id);

    for (const childAgentInstanceId of childAgents) {
      await this.stopAgent(childAgentInstanceId);
    }

    const history =
      this.karton.state.agents.instances[instanceId]?.state.history ?? [];
    const now = Date.now();
    let lastUserTs: number | undefined;
    let lastAgentTs: number | undefined;
    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i];
      const createdAt = m.metadata?.createdAt;
      if (createdAt === undefined) continue;

      const ts = toFiniteTimestamp(createdAt);
      if (ts === undefined) continue;

      if (lastUserTs === undefined && m.role === 'user') lastUserTs = ts;
      if (lastAgentTs === undefined && m.role === 'assistant') lastAgentTs = ts;
      if (lastUserTs !== undefined && lastAgentTs !== undefined) break;
    }

    await agent.stop();

    this.telemetryService.capture('agent-stopped', {
      agent_type: agent.agentType,
      agent_instance_id: instanceId,
      ms_since_last_user_message:
        lastUserTs !== undefined ? now - lastUserTs : undefined,
      ms_since_last_agent_message:
        lastAgentTs !== undefined ? now - lastAgentTs : undefined,
    });
  }

  /**
   * Flush the queue of a specific agent
   */
  public async flushQueue(instanceId: string) {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    await agent.flushQueue();
  }

  /**
   * Clear the queue of a specific agent
   */
  public async clearQueue(instanceId: string) {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    await agent.clearQueue();
  }

  /**
   * Delete queued message of an agent
   */
  public async deleteQueuedMessage(instanceId: string, messageId: string) {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    await agent.deleteQueuedMessage(messageId);
  }

  /**
   * Revert to a user message of an agent
   * @param instanceId
   * @param userMessageId
   * @param undoToolCalls
   */
  public async revertToUserMessage(
    instanceId: string,
    userMessageId: string,
    undoToolCalls: boolean,
  ) {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    await agent.revertToUserMessage(userMessageId, undoToolCalls);
  }

  public async replaceUserMessage(
    instanceId: string,
    userMessageId: string,
    newMessage: AgentMessage & { role: 'user' },
    undoToolCalls: boolean,
  ): Promise<string> {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    return await agent.replaceUserMessage(
      userMessageId,
      newMessage,
      undoToolCalls,
    );
  }

  /**
   * Retry the last user message that resulted in an error
   * @param instanceId
   */
  public async retryLastUserMessage(instanceId: string): Promise<void> {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    await agent.retryLastUserMessage();
  }

  private async updateInputState(instanceId: string, inputString: string) {
    const agent = this.activeAgents.get(instanceId);

    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }

    await agent.updateInputState(inputString);
  }

  private async updateActiveModelId(instanceId: string, modelId: ModelId) {
    const agent = this.activeAgents.get(instanceId);
    if (!agent) {
      throw new Error(`Agent with instance id ${instanceId} not found`);
    }
    if (!this.modelProviderService.modelExists(modelId)) {
      throw new Error(
        `Cannot set model: "${modelId}" does not exist (it may have been deleted)`,
      );
    }
    const fromModel =
      this.karton.state.agents.instances[instanceId]?.state.activeModelId ??
      'unknown';
    await agent.updateActiveModelId(modelId);
    this.telemetryService.capture('agent-model-changed', {
      agent_type: agent.agentType,
      agent_instance_id: instanceId,
      from_model: fromModel,
      to_model: modelId,
    });
  }

  /**
   * Responds with a list of agent history entries. Includes all existing agents (including currently active ones) and is sorted by agents (newest first).
   *
   * @param offset The offset to fetch the agents from
   * @param limit The number of agents to fetch
   * @param searchString The search string to filter the agents by (optional, case-insensitive)
   * @returns A list of agent history entries
   */
  private async getAgentsHistoryList(
    offset: number,
    limit: number,
    searchString?: string,
  ): Promise<AgentHistoryEntry[]> {
    // Wait for DB to be ready before querying
    const db = await this.ensureDBReady();

    // If the db initialization failed, return empty array
    if (!db) {
      return [];
    }

    return await db.getAgentHistoryEntries(
      limit,
      offset,
      [],
      searchString && searchString.trim().length > 0
        ? `%${searchString.trim()}%`
        : undefined,
    );
  }
}
