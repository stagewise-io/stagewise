import {
  type ModelMessage,
  type Tool,
  type ToolApprovalResponse,
  streamText,
  smoothStream,
  type StepResult,
  type AsyncIterableStream,
  type InferUIMessageChunk,
  readUIMessageStream,
  tool,
  type DynamicToolUIPart,
  NoSuchToolError,
} from 'ai';
import type {
  AgentMessage,
  AgentTypes,
  AgentState,
  AgentRuntimeError,
} from '@shared/karton-contracts/ui/agent';
import type { FullEnvironmentSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import type { ModelCapabilities } from '@shared/karton-contracts/ui/shared-types';
import { type ModelId, getModelCapabilities } from '@shared/available-models';
import type { z } from 'zod';
import type { AgentTypeMap } from '../../agents-map';
import type { ToolboxService } from '@/services/toolbox';
import type { TelemetryService } from '@/services/telemetry';
import type { Logger } from '@/services/logger';
import type { ModelProviderService } from '../../model-provider';
import {
  convertAgentMessagesToModelMessages,
  capitalizeFirstLetter,
  type ContentLimits,
} from './utils';
import { generateSimpleTitle } from './title-generation';
import {
  generateSimpleCompressedHistory,
  estimateMessageTokens,
} from './history-compression';
import { readBlob } from '@/utils/attachment-blobs';
import { capToolOutput } from '@/services/toolbox/utils';
import fs from 'node:fs/promises';
import nodePath from 'node:path';
import type { AssetCacheService } from '@/services/asset-cache';
import type { ProcessedImageCacheService } from '@/services/processed-image-cache';
import { FileReadCacheService } from '@/services/file-read-cache';
import { getAgentDir } from '@/utils/paths';
import { randomUUID } from 'node:crypto';
import {
  resolveEffectiveSnapshot,
  sparsifySnapshot,
} from '../prompts/utils/environment-changes';
import { populatePathReferences } from './file-read-transformer/populate-path-references';
import { MessageCacheAnalyzer } from './message-cache-analyzer';
import { extractReadFilePathsFromAssistantMessage } from './file-read-transformer/path-references';
import { resolveMountedPath } from './file-read-transformer/resolve-path';
import { hashPath } from './file-read-transformer/hash';
import { deriveMaxReadChars } from './file-read-transformer/format-utils';
import type { StagewiseToolSet } from '@shared/karton-contracts/ui/agent/tools/types';
import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import { AgentsMap } from '../../agents-map';

/**
 * The base configuration for an agent. Should be defined by the inheriting class.
 */
export type BaseAgentConfig<TFinishToolOutputSchema extends z.ZodType | null> =
  {
    /**
     * Whether the agents state (including Messages) should be persisted to the database.
     */
    persistent: boolean;

    /**
     * The default suggested model ID to use for the agent.
     */
    defaultModelId: ModelId;

    /**
     * If user is allowed to select a different model than the default one.
     *
     * @note If set to `false`, the default model ID will be used and the UI should not show any model selection options.
     *        If a madel change call is made anyway, it get's ignored.
     */
    allowModelSelection: boolean;

    /**
     * The required capabilities for the model to be usable by the agent.
     *
     * @note The agent will not immediately crash when running a step with a different model (ai-sdk might crash though), but the UI can use the info to filter the available models etc.
     */
    requiredCapabilities: ModelCapabilities;

    /**
     * Configures, if the user can input content directly into the agent.
     *
     * @note If set to `false`, the UI should not show any input field for the agent.
     *
     * @note If set to `false`, the agent will include a `finish` tool that will be used to send response data to the parent agent. This tools output MUST be configured with the `finishToolOutput` property in this config.
     */
    allowUserInput: boolean;

    /**
     * Allows to configure the output format of a finish tool that can be used by the agentto send response data to the parent agent (if one exists).
     * @note If set to undefined, the agent will not include a finish tool.
     */
    finishToolOutputSchema: TFinishToolOutputSchema | undefined;

    /**
     * Whether the agent should generate titles for it's instance.
     *
     * @note The base agent provides a default implementation for generating titles, which can be modified by overriding the `generateTitle` method.
     */
    generateTitles: boolean;

    /**
     * The threshold of max context window size after which the chat history should be summarized.
     *
     * @note Accepts a value between 0 (0%) and 1 (100%).
     *
     * @note You can disable summarization by setting the value to -1.
     *
     * @note You can always trigger manual summarization while the agent is in idle by calling the `summarizeChatHistory` method.
     *
     * @note You can customize summarization logic by overriding the `summarizeChatHistory` method.
     *
     * @default 0.65
     */
    historyCompressionThreshold?: number;

    /**
     * Preferred number of recent messages to keep uncompacted after
     * history compression. The actual count may be lower if the kept
     * messages would exceed 30% of the model's context window (token
     * budget). In that case, the floor is reduced adaptively to fit.
     *
     * @note The minimum value is 5, any lower value will be clamped.
     *
     * @default 10
     */
    minUncompressedMessages?: number;

    /**
     * A configurable uinterval of user messages after which the title should be updated.
     *
     * @note If not set, the title will not be updated automatically and only be generated on the first user message.
     *
     * @note Only used if `generateTitles` is set to `true`.
     */
    updateTitlesEveryNUserMessages?: number;

    /**
     * A customizable reason text for the LLM in case a running tool call was aborted due to the user flushing the message queue.
     */
    flushQueueToolCallAbortReason?: string;

    /**
     * A customizable reason text for the LLM in case a open tool call approval request was denied due to the user sending a new message instead of waiting for the tool call to finish.
     */
    flushQueueToolCallRequestApprovalReason?: string;

    /**
     * A customizable reason text for the LLM in case a running tool call was aborted due to the user stopping the agent.
     */
    stopToolCallAbortReason?: string;

    /**
     * A customizable reason text for the LLM in case a open tool call approval request was denied due to the user stopping the agent.
     */
    stopToolCallRequestApprovalReason?: string;

    /**
     * A configurable amount of maximum steps to take before new step execution is force-stopped and a new user message is needed to resume the agents operation.
     *
     * @default infinite
     */
    maxSteps?: number;

    /**
     * A configurable amount of maximum retries the generation can take within one agent step.
     *
     * @default 1
     */
    maxRetries?: number;

    /**
     * A configurable amount of maximum time (ms) to spend before new step execution is force-stopped and a new user message is needed to resume the agents operation.
     *
     * @default infinite
     */
    maxTime?: number;

    /**
     * A configurable amount of maximum output tokens per step.
     */
    maxOutputTokens?: number;

    /**
     * Temperature setting.
     *
     * The value is passed through to the provider. The range depends on the provider and model.
     *
     * @note It is recommended to set either `temperature` or `topP`, but not both.
     */
    temperature?: number;

    /**
     * Nucleus sampling.
     *
     * The value is passed through to the provider. The range depends on the provider and model.
     *
     * @note It is recommended to set either `temperature` or `topP`, but not both.
     */
    topP?: number;

    /**
     * Only sample from the top K options for each subsequent token.
     *
     * Used to remove "long tail" low probability responses.
     *
     * @note Recommended for advanced use cases only. You usually only need to use temperature.
     */
    topK?: number;

    /**
     * Presence penalty setting.
     *
     * It affects the likelihood of the model to repeat information that is already in the prompt.
     * The value is passed through to the provider. The range depends on the provider and model
     */
    presencePenalty?: number;

    /**
     * Frequency penalty setting.
     *
     * It affects the likelihood of the model to repeatedly use the same words or phrases.
     * The value is passed through to the provider. The range depends on the provider and model.
     */
    frequencyPenalty?: number;

    /**
     * Sequences that will stop the generation of the text.
     *
     * If the model generates any of these sequences, it will stop generating further text.
     */
    stopSequences?: string[];

    /**
     * The seed (integer) to use for random sampling.
     *
     * If set and supported by the model, calls will generate deterministic results.
     */
    seed?: number;
  };

export type MessageId = string;

/**
 * Interface for the static (class) side of any agent.
 * This enables type-safe access to static properties like `config` and `agentType`
 * on agent classes (not instances).
 *
 * @example
 * ```ts
 * const AgentsMap = {
 *   [AgentTypes.CHAT]: ChatAgent,
 * } as const satisfies Record<AgentTypes, BaseAgentStatic>;
 *
 * // Type-safe access:
 * AgentsMap[AgentTypes.CHAT].config.defaultModelId
 * ```
 */
export interface BaseAgentStatic<
  TFinishToolOutputSchema extends z.ZodType | null,
> {
  readonly config: BaseAgentConfig<TFinishToolOutputSchema>;
  readonly agentType: AgentTypes;
}

/**
 * Utility type to extract the config type from an agent class.
 */
export type AgentConfig<T extends BaseAgentStatic<any>> = T['config'];

/**
 * A reusable base class for all agents.
 *
 * Implements a standard API for all agents, including capabilities to invoke sub-agents,
 * update state with patch functions (convenient to integrate into Karton etc.)
 * and support for stagewise custom formatting of attachments etc.
 *
 * Agents should simply extend this base class and implement the abstract methods as well as pass in a configuration.
 *
 * It's highly recommended that all agents define the BaseAgentConfig themselves isntead of receiving it from the outside.
 *
 * @note Subclasses MUST define `static readonly config` and `static readonly agentType`.
 *       TypeScript cannot enforce `abstract static`, so this is enforced by the `BaseAgentClass` interface.
 */
export abstract class BaseAgent<
  TFinishToolOutputSchema extends z.ZodType | null,
  TInstanceConfig,
> {
  public readonly instanceId: string;

  /**
   * Access the static config from the subclass.
   * This getter bridges the static config to instance access.
   */
  protected get config(): BaseAgentConfig<TFinishToolOutputSchema> {
    return (
      this.constructor as unknown as BaseAgentStatic<TFinishToolOutputSchema>
    ).config;
  }

  /**
   * Access the static agentType from the subclass.
   */
  public get agentType(): AgentTypes {
    return (
      this.constructor as unknown as BaseAgentStatic<TFinishToolOutputSchema>
    ).agentType;
  }

  /**
   * The state of the agent is stored in a central store (the agent manager owns that store and manages it efficiently)
   * and is accessed by the agent through the getter and setter.
   */
  private readonly state: {
    get: () => AgentState;
    set: (recipe: (draft: AgentState) => void) => void;
    persist: () => Promise<void>;
  };

  /**
   * The configuration of the agent instance.
   * Depends on the agent type.
   *
   * @note Must be serializable since this get's recovered when resuming the agent.
   */
  public readonly instanceConfig: TInstanceConfig;

  // External dependencies
  protected readonly toolbox: ToolboxService;
  protected readonly telemetryService: TelemetryService;
  protected readonly logger: Logger;
  protected readonly modelProviderService: ModelProviderService;

  /**
   * Asset cache for uploading attachment blobs to S3 and returning presigned
   * read URLs. Currently unused: all attachment data is sent inline (base64)
   * because the Vercel AI gateway may route to upstream providers that do
   * not support URL-based image/file inputs. The service and its wiring are
   * kept intact so URL-based delivery can be re-enabled per-provider once
   * we can determine the final routing target before building the request.
   *
   * See also: AssetCacheService in services/asset-cache/index.ts
   */
  protected readonly assetCacheService?: AssetCacheService;
  protected readonly processedImageCacheService?: ProcessedImageCacheService;
  protected fileReadCacheService?: FileReadCacheService;
  private _fileReadCacheInitPromise?: Promise<FileReadCacheService>;

  // Internal state
  private stepAbortController: AbortController | null = null;

  /**
   * Guard flag to prevent concurrent history compression runs.
   * Set to `true` when `compressHistoryInternal` starts and reset
   * when it finishes (success or failure). Subsequent calls bail
   * out immediately while a compression is in progress.
   */
  private _isCompressingHistory = false;

  /** Debug utility: tracks model messages per step to report cache stability. */
  private readonly _cacheAnalyzer: MessageCacheAnalyzer;

  /**
   * Monotonically increasing counter that identifies the "current" step.
   * Stream callbacks (onAbort, onFinish, onError) capture this value when
   * the step starts and compare before modifying `isWorking`. This prevents
   * stale callbacks from a previous (aborted) step from resetting isWorking
   * after a new step has already started.
   */
  private _stepGeneration = 0;
  private _stepStartTime = 0;
  private _stepProviderMode = '';
  private _toolCallDurations = new Map<string, number>();

  // Handler that get's called when the agent wants to spawn a child agent.
  private readonly spawnChildAgentHandler: <
    TAgentType extends keyof AgentTypeMap,
  >(
    // The type of the child agent to spawn.
    childAgentType: TAgentType,

    // The config with which the agent should be spawned
    instanceConfig: InstanceType<AgentTypeMap[TAgentType]>['instanceConfig'],

    // The handler that should be called when the child agent calls the finish tool.
    onFinish: (
      finishOutput: z.infer<
        (typeof AgentsMap)[TAgentType]['config']['finishToolOutputSchema']
      >,
    ) => void | Promise<void>,

    onError: (error: Error) => void | Promise<void>,
  ) => Promise<
    BaseAgent<
      (typeof AgentsMap)[TAgentType]['config']['finishToolOutputSchema'] extends z.ZodType
        ? (typeof AgentsMap)[TAgentType]['config']['finishToolOutputSchema']
        : never,
      InstanceType<AgentTypeMap[TAgentType]>['instanceConfig']
    >
  >;

  // Handler that get's called when the agent calls the finish tool (notify the parent).
  // The finish tool should be added to the list of tools when calling `streamText` on every step (if it's configured).
  private readonly finishToolHandler?: (
    finishOutput: TFinishToolOutputSchema extends z.ZodType
      ? z.infer<TFinishToolOutputSchema>
      : never,
  ) => void | Promise<void>;
  private readonly finishToolErrorHandler?: (
    error: Error,
  ) => void | Promise<void>;

  private messages: AgentMessage[] = [];

  public constructor(
    instanceId: string,
    state: {
      get: () => AgentState;
      set: (recipe: (draft: AgentState) => void) => void;
      persist: () => Promise<void>;
    },
    toolbox: ToolboxService,
    telemetryService: TelemetryService,
    logger: Logger,
    modelProviderService: ModelProviderService,
    instanceConfig: TInstanceConfig,
    spawnChildAgentHandler: <TAgentType extends keyof AgentTypeMap>(
      childAgentType: TAgentType,
      instanceConfig: InstanceType<AgentTypeMap[TAgentType]>['instanceConfig'],
      onFinish: (
        finishOutput: z.infer<
          (typeof AgentsMap)[TAgentType]['config']['finishToolOutputSchema']
        >,
      ) => void | Promise<void>,
      onError: (error: Error) => void | Promise<void>,
    ) => Promise<
      BaseAgent<
        (typeof AgentsMap)[TAgentType]['config']['finishToolOutputSchema'] extends z.ZodType
          ? (typeof AgentsMap)[TAgentType]['config']['finishToolOutputSchema']
          : never,
        InstanceType<AgentTypeMap[TAgentType]>['instanceConfig']
      >
    >,
    finishToolHandler?: (
      finishOutput: TFinishToolOutputSchema extends z.ZodType
        ? z.infer<TFinishToolOutputSchema>
        : never,
    ) => void | Promise<void>,
    finishToolErrorHandler?: (error: Error) => void | Promise<void>,
    initialState?: Partial<AgentState>,
    assetCacheService?: AssetCacheService,
    processedImageCacheService?: ProcessedImageCacheService,
  ) {
    this.instanceId = instanceId;
    this.state = state;
    this.toolbox = toolbox;
    this.telemetryService = telemetryService;
    this.logger = logger;
    this.modelProviderService = modelProviderService;
    this.instanceConfig = instanceConfig;
    this.spawnChildAgentHandler = spawnChildAgentHandler;
    this.finishToolHandler = finishToolHandler;
    this.finishToolErrorHandler = finishToolErrorHandler;
    this.assetCacheService = assetCacheService;
    this.processedImageCacheService = processedImageCacheService;
    this._cacheAnalyzer = new MessageCacheAnalyzer(instanceId, logger);

    this.state.set((draft) => {
      draft.title =
        initialState?.title ??
        `New ${capitalizeFirstLetter(this.agentType.toLowerCase())} Agent - ${new Date().toLocaleString(
          'en-US',
          {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          },
        )}`;
      draft.history = initialState?.history ?? [];
      draft.queuedMessages = initialState?.queuedMessages ?? [];
      draft.activeModelId =
        initialState?.activeModelId ?? this.config.defaultModelId;
      draft.inputState = initialState?.inputState ?? draft.inputState;
      draft.usedTokens = initialState?.usedTokens ?? 0;
    });

    this.onCreated();
  }

  /**
   * =======================================================
   * PUBLIC METHODS (STRANDARD API ACROSS ALL AGENTS)
   * =======================================================
   */

  /**
   * Send a message to the agent. If the agent is busy, the message will be queued.
   * @param message - The message to send to the agent
   *
   * @note If the agent is waiting for one or more tool approvals or not every tool call has been finished, the message will be queued and sent once the current step is finished.
   *
   * @note On send, the chat history is converted into model context with the following pipeline:
   *        `transformMessagesBeforeStep` -> `getSystemPrompt` -> `transformMessagesToModelMessages` -> `transformModelMessagesBeforeStep`.
   *
   * @note DO NOT OVERRIDE
   */
  public async sendUserMessage(
    message: AgentMessage & { role: 'user' },
  ): Promise<MessageId> {
    // We override the message id with a random UUID to ensure it's unique.
    const id = crypto.randomUUID();

    const msg = { ...message, id: id };

    // If the agent is running, we queue the message
    if (this.state.get().isWorking) {
      this.state.set((draft) => {
        draft.queuedMessages.push(msg);
      });

      this.logger.debug(`[BaseAgent:${this.instanceId}] Queued message`);

      return message.id;
    }

    this.logger.debug(`[BaseAgent:${this.instanceId}] Sending user message`);

    // Auto-deny any pending approval requests before the user message enters
    // history. Without this, a user message would sit after the assistant's
    // tool call but before any tool result, causing canRunStep() to block and
    // later approve/deny clicks to produce duplicate tool parts.
    this.state.set((draft) => {
      for (const historyMsg of draft.history) {
        if (historyMsg.role !== 'assistant') continue;
        for (let i = 0; i < historyMsg.parts.length; i++) {
          const p = historyMsg.parts[i];
          if (
            (p.type.startsWith('tool-') || p.type === 'dynamic-tool') &&
            (p as AgentToolUIPart | DynamicToolUIPart).state ===
              'approval-requested'
          ) {
            const toolPart = p as AgentToolUIPart | DynamicToolUIPart;
            const updatedToolPart: AgentToolUIPart | DynamicToolUIPart = {
              ...toolPart,
              state: 'output-denied' as const,
              approval: {
                ...toolPart.approval!,
                approved: false,
                reason:
                  this.config.flushQueueToolCallRequestApprovalReason ??
                  'User sent new message before tool call approval was granted.',
              },
            } as AgentToolUIPart | DynamicToolUIPart;
            historyMsg.parts[i] = updatedToolPart;
          }
        }
      }
    });

    // If the agent is not running, we add the message to the history and immediately send it to the model.
    this.state.set((draft) => {
      draft.history.push(msg);
    });

    void this.runStep();

    return id;
  }

  /**
   * Sends a tool approval response to the agent.
   *
   * @param toolCallResponse - The tool call response to send to the agent
   *
   * @note If the agent is busy, the response will be queued and sent once the current step is finished.
   *
   * @note If not all open approval requests have been responded to, the agent will not be triggered again until all requests have been responded with either deny or accept.
   *
   * @note DO NOT OVERRIDE
   */
  public async sendToolApprovalResponse(
    toolCallResponse: ToolApprovalResponse,
  ): Promise<void> {
    const approvalId = toolCallResponse.approvalId;
    const approved = toolCallResponse.approved;
    const reason = toolCallResponse.reason;

    this.state.set((draft) => {
      for (let i = draft.history.length - 1; i >= 0; i--) {
        const msg = draft.history[i];
        if (msg.role === 'assistant') {
          const toolPartIndex = msg.parts.findIndex(
            (part) =>
              (part.type.startsWith('tool-') || part.type === 'dynamic-tool') &&
              (part as AgentToolUIPart | DynamicToolUIPart).approval?.id ===
                approvalId,
          );
          if (toolPartIndex !== -1) {
            if (
              (msg.parts[toolPartIndex] as AgentToolUIPart | DynamicToolUIPart)
                .state === 'approval-requested'
            ) {
              const updatedToolPart = {
                ...(msg.parts[toolPartIndex] as
                  | AgentToolUIPart
                  | DynamicToolUIPart),
                state: 'approval-responded',
                approval: {
                  ...(
                    msg.parts[toolPartIndex] as
                      | AgentToolUIPart
                      | DynamicToolUIPart
                  ).approval,
                  approved: approved,
                  reason: reason,
                },
              };
              // @ts-expect-error - We know that the tool part is a ToolUIPart
              msg.parts[toolPartIndex] = updatedToolPart;
              break;
            } else {
              // no-op becuase no approval is needed anymore
              break;
            }
          }
        }
      }
    });

    // Find the tool name from the approval for telemetry
    let toolName = 'unknown';
    for (let i = this.state.get().history.length - 1; i >= 0; i--) {
      const msg = this.state.get().history[i];
      if (msg.role !== 'assistant') continue;
      const part = msg.parts.find(
        (p) =>
          (p.type.startsWith('tool-') || p.type === 'dynamic-tool') &&
          (p as AgentToolUIPart | DynamicToolUIPart).approval?.id ===
            approvalId,
      ) as AgentToolUIPart | DynamicToolUIPart | undefined;
      if (part) {
        toolName =
          part.type === 'dynamic-tool'
            ? 'dynamic-tool'
            : part.type.replace('tool-', '');
        break;
      }
    }
    if (approved) {
      this.telemetryService.capture('tool-approved', { tool_name: toolName });
    } else {
      this.telemetryService.capture('tool-denied', {
        tool_name: toolName,
        reason,
      });
    }

    this.runStep(true);

    return;
  }

  /**
   * Delete a queued message from the agent.
   * @param messageId - The id of the message to delete
   *
   * @note DO NOT OVERRIDE
   */
  public async deleteQueuedMessage(messageId: string): Promise<void> {
    this.state.set((draft) => {
      draft.queuedMessages = draft.queuedMessages.filter(
        (message) => message.id !== messageId,
      );
    });
    return;
  }

  /**
   * Clears/Empties the queue of the agent without sending any of the queued messages.
   */
  public async clearQueue(): Promise<void> {
    this.state.set((draft) => {
      draft.queuedMessages = [];
    });

    return;
  }

  /**
   * Immediately flushes the queue by stopping the agent (aborts any ongoing streams)
   * and sending all of the queued messages at once.
   *
   * @note Pending tool approvals will be denied with reason "User sent new message instead. Retry if necessary." or configurable response.
   * @note Pending tool calls will be aborted with reason "User sent new message instead. Retry if necessary." or configurable response.
   *
   * @note DO NOT OVERRIDE
   */
  public async flushQueue(): Promise<void> {
    await this.internalStop('user-flushed-queue');

    // Send all queued messages into the chat
    this.state.set((draft) => {
      draft.history.push(...draft.queuedMessages);
      draft.queuedMessages = [];
    });

    this.runStep();

    return;
  }

  /**
   * Immediately stops the agent, including aborting any ongoing streams.
   *
   * @note Unfinished messages will be persisted, unless the only include a "thinking" part and nothing else.
   *
   * @note DO NOT OVERRIDE
   */
  public async stop(): Promise<void> {
    await this.internalStop('user-stopped');
    this.state.set((draft) => {
      draft.isWorking = false;
    });
  }

  /**
   * Reports an error to the agents parent. Can be used to notify the parent if the agent is permanently stopped.
   *
   * @param error - The error to report to the parent.
   *
   * @note DO NOT OVERRIDE
   */
  public async reportErrorToParent(error: Error): Promise<void> {
    // TODO
    await this.finishToolErrorHandler?.(error);
  }

  /**
   * Replaces the given user message ID with a new message (replacing the old message in the history)
   *
   * @param userMessageId The ID of the user message to replace.
   * @param newUserMessage The new user message to replace the old message with.
   *
   * @returns The ID of the new user message.
   *
   * @note Permanently removes all messages that were happened after the given user message ID.
   *        Clears the queue of the agent as well.
   *
   * @note Automatically sends the new message to the model.
   *
   * @note DO NOT OVERRIDE
   */
  public async replaceUserMessage(
    userMessageId: string,
    newUserMessage: AgentMessage & { role: 'user' },
    undoToolCalls: boolean,
  ): Promise<string> {
    const undoneMessages = this.state
      .get()
      .history.slice(
        this.state.get().history.findIndex((msg) => msg.id === userMessageId),
      );

    const undoneToolCallIds = undoneMessages
      .filter((msg) => msg.role === 'assistant')
      .flatMap(
        (msg) =>
          msg.parts.filter(
            (part) =>
              part.type.startsWith('tool-') || part.type === 'dynamic-tool',
          ) as (AgentToolUIPart | DynamicToolUIPart)[],
      )
      .map((part) => (part as AgentToolUIPart | DynamicToolUIPart).toolCallId);

    if (undoneToolCallIds.length > 0 && undoToolCalls) {
      await this.toolbox.undoToolCalls(undoneToolCallIds);
    }

    this.state.set((draft) => {
      const replaceMessageIndex = draft.history.findIndex(
        (message) => message.id === userMessageId,
      );

      if (replaceMessageIndex === -1) {
        throw new Error('User message not found in history');
      }

      draft.history = draft.history.slice(0, replaceMessageIndex);
      draft.queuedMessages = [];
    });

    return await this.sendUserMessage(newUserMessage);
  }

  /**
   * Retries the last user message that resulted in an error.
   *
   * @note Only works if there is an error in the state and the last message is a user message.
   *
   * @note DO NOT OVERRIDE
   */
  public async retryLastUserMessage(): Promise<void> {
    const currentState = this.state.get();

    // Check if there's an error
    if (!currentState.error) {
      throw new Error('No error to retry');
    }

    // Find the last user message
    const history = currentState.history;
    let lastUserMessage: (AgentMessage & { role: 'user' }) | null = null;

    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user') {
        lastUserMessage = history[i] as AgentMessage & { role: 'user' };
        break;
      }
    }

    if (!lastUserMessage) {
      throw new Error('No user message found to retry');
    }

    // Revert to the last user message and resend it
    await this.revertToUserMessage(lastUserMessage.id, false);
    await this.sendUserMessage(lastUserMessage);
  }

  /**
   * Retrieves the current message history of the agent (including streaming messages).
   *
   * @note DO NOT OVERRIDE
   */
  public getMessages(): AgentMessage[] {
    return this.state.get().history;
  }

  /**
   * Reverts the agent to the state before the given user message ID.
   *
   * @param userMessageId - The ID of the user message to revert to.
   * @param undoToolCalls - Whether to undo the tool calls that were executed since the given user message ID.
   *
   * @note DO NOT OVERRIDE
   */
  public async revertToUserMessage(
    userMessageId: string,
    undoToolCalls: boolean,
  ): Promise<void> {
    if (this.state.get().isWorking) {
      throw new Error(
        'Cannot revert to user message while agent is still running',
      );
    }

    const msgIndex = this.state
      .get()
      .history.findIndex((msg) => msg.id === userMessageId);
    if (msgIndex === -1) {
      throw new Error('User message not found in history');
    }

    const undoneMessages = this.state.get().history.slice(msgIndex);

    const undoneToolCallIds = undoneMessages
      .filter((msg) => msg.role === 'assistant')
      .flatMap(
        (msg) =>
          msg.parts.filter(
            (part) =>
              part.type.startsWith('tool-') || part.type === 'dynamic-tool',
          ) as (AgentToolUIPart | DynamicToolUIPart)[],
      )
      .map((part) => (part as AgentToolUIPart | DynamicToolUIPart).toolCallId);

    if (undoneToolCallIds.length > 0 && undoToolCalls) {
      await this.toolbox.undoToolCalls(undoneToolCallIds);
    }

    this.state.set((draft) => {
      draft.history = draft.history.slice(0, msgIndex);
      draft.queuedMessages = [];
    });

    return;
  }

  public async updateInputState(newInputState: string): Promise<void> {
    this.state.set((draft) => {
      draft.inputState = newInputState;
    });

    return;
  }

  public async updateActiveModelId(modelId: ModelId): Promise<void> {
    // We accept model updates at all times, and the UI has to make enforce that model changes aren't allowed
    this.state.set((draft) => {
      draft.activeModelId = modelId;
    });

    return;
  }

  /**
   * =======================================================
   * EXTENDABLE METHODS (CONFIGURABLE BEHAVIOR BY THE INHERITING CLASS)
   * =======================================================
   */

  /**
   * Generates a title for a message. Override to customize the title generation.
   *
   * @param messages - The chat history for which the title should be generated.
   *
   * @returns The title for the message
   *
   * @note Will only be called if `generateTitles` in agent config is set to `true`.
   */
  protected async generateTitle(messages: AgentMessage[]): Promise<string> {
    try {
      return await generateSimpleTitle(
        messages,
        this.modelProviderService,
        this.instanceId,
      );
    } catch (e) {
      const error = e as Error;
      this.logger.error(
        `[BaseAgent:${this.instanceId}] Failed to generate title. Error: ${error.message}, Stack: ${error.stack}`,
      );
      this.report(error, 'generateTitle');
      return this.state.get().title;
    }
  }

  /**
   * Compresses the agent history. Override to customize the comapction logic.
   *
   * @param history - The agent history for which the compaction should be generated
   *
   * @returns A compoacted text that represents the given agent history.
   *
   * @note Will only be called automatically, if `summarizeChatHistoryThreshold` in agent config is set to a value greater than 0.
   */
  protected async compressHistory(history: AgentMessage[]): Promise<string> {
    // The standard compaction logic is very simple. We can make this more sophisticated later on.
    return await generateSimpleCompressedHistory(
      history,
      this.modelProviderService,
      this.instanceId,
      this.state.get().activeModelId,
    );
  }

  /**
   * Transforms/Updates the list of messages before a step is started.
   *
   * @param messages - The messages to transform
   *
   * @returns The transformed messages
   *
   * @note Does nothing by default (returns the messages as is).
   *
   * @note Can be overridden by the inheriting class to add additional logic before a step is started.
   *
   * @note Receives message history that may potentially be compacted already.
   *
   * @note If the transform to Model messages should be customized, override the `transformMessagesToModelMessages` instead.
   */
  protected transformMessagesBeforeStep(
    messages: AgentMessage[],
  ): AgentMessage[] | Promise<AgentMessage[]> {
    return messages;
  }

  /**
   * Transforms/Updates the list of messages before a step is started.
   *
   * @note Called when the agent is created.
   *
   * @note Can be overridden by the inheriting class to add additional logic when the agent is created.
   *
   * @note TODO: Think about race-conditions when multiple consumers trigger user messages.
   */
  protected onCreated(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Transforms/Updates UI messages into model messages that are sent to the model.
   *
   * @param messages - The UI messages to transform
   *
   * @param systemPrompt - The system prompt to use for the transformation (configured via `getSystemPrompt`)
   *
   * @returns An array of model messages for the given UI messages.
   *
   * @note By default converts all UI message to model messages with default stagewise conventions and standard system prompt.
   *
   * @note Also applies compacted conversation
   *
   * Lazily initialises the per-agent `FileReadCacheService`.
   *
   * The DB is stored inside the agent's data directory so each agent
   * instance has its own isolated cache. Initialisation is deduped —
   * concurrent calls share the same promise.
   */
  private getFileReadCache(): Promise<FileReadCacheService> {
    if (this.fileReadCacheService) {
      return Promise.resolve(this.fileReadCacheService);
    }
    if (!this._fileReadCacheInitPromise) {
      this._fileReadCacheInitPromise = (async () => {
        try {
          const dbDir = getAgentDir(this.instanceId);
          await fs.mkdir(dbDir, { recursive: true });
          const url = `file:${dbDir}/file-read-cache.sqlite`;
          this.fileReadCacheService = await FileReadCacheService.createWithUrl(
            url,
            this.logger,
          );
          return this.fileReadCacheService;
        } catch (err) {
          // Clear the cached promise so a subsequent step can retry if
          // the failure was transient (e.g. disk temporarily full).
          this._fileReadCacheInitPromise = undefined;

          const message = err instanceof Error ? err.message : String(err);
          throw new Error(
            `File read cache could not be initialised. ` +
              `The agent cannot operate without it. ` +
              `Please check disk permissions and available space. ` +
              `(${message})`,
          );
        }
      })();
    }
    return this._fileReadCacheInitPromise;
  }

  /**
   * @note Can be overriden by the inheriting class to transform the messages differently.
   *
   * @note If transformed model messages should simply be customized, override `transformModelMessagesBeforeStep` instead.
   *
   * @note The added system prompt is configured via the method `getSystemPrompt`.
   */
  protected async transformMessagesToModelMessages(
    messages: AgentMessage[],
    systemPrompt: string,
  ): Promise<ModelMessage[]> {
    const activeModelId = this.state.get().activeModelId;
    const fileReadCache = await this.getFileReadCache();
    const capabilities = getModelCapabilities(activeModelId);

    // Derive per-request content limits from the model's context window
    // so the transformer pipeline uses explicit values instead of
    // module-level globals.
    let contentLimits: ContentLimits | undefined;
    try {
      const { contextWindowSize } =
        this.modelProviderService.getModelWithOptions(activeModelId, '');
      contentLimits = {
        maxReadChars: deriveMaxReadChars(contextWindowSize),
        maxPreviewLines: 30,
      };
    } catch {
      // Model lookup can fail when the provider is misconfigured.
      // Fall through — undefined contentLimits lets transformers use
      // their built-in defaults.
    }

    const shellInfo = this.toolbox.getShellInfo();
    const skills = await this.toolbox.getSkillsList(this.instanceId);
    const skillDetails = new Map(
      skills
        .filter((c) => c.agentInvocable !== false && c.skillPath)
        .map((c) => [
          c.skillPath!,
          {
            name: c.displayName,
            description: c.description,
            path: c.skillPath!,
          },
        ]),
    );

    return convertAgentMessagesToModelMessages(
      messages,
      systemPrompt,
      await this.getToolsForStep(),
      this.instanceId,
      async (agentId, path) => {
        // path is always a full mount-prefixed path:
        //   "att/<key>"          — agent data-attachment blob
        //   "w{prefix}/<rel>"    — file inside an open workspace mount
        if (path.startsWith('att/')) {
          return readBlob(agentId, path.slice(4));
        }
        // Workspace path — resolve prefix via mount registry.
        const slashIdx = path.indexOf('/');
        if (slashIdx <= 0)
          throw new Error(`Unrecognised attachment path format: "${path}"`);
        const prefix = path.slice(0, slashIdx);
        const relative = path.slice(slashIdx + 1);
        const mountPaths = this.toolbox.getMountedPathsForAgent(agentId);
        const mountRoot = mountPaths.get(prefix);
        if (!mountRoot)
          throw new Error(`Mount "${prefix}" not found for agent ${agentId}`);
        const resolved = nodePath.resolve(nodePath.join(mountRoot, relative));
        const mountRootNormalized = nodePath.resolve(mountRoot);
        if (
          resolved !== mountRootNormalized &&
          !resolved.startsWith(mountRootNormalized + nodePath.sep)
        ) {
          throw new Error('Path traversal outside mount root');
        }
        return fs.readFile(resolved);
      },
      capabilities,
      shellInfo,
      skillDetails,
      this.logger,
      this.processedImageCacheService,
      skills,
      fileReadCache,
      this.toolbox.getMountedPathsForAgent(this.instanceId),
      contentLimits,
    );
  }

  /**
   * Transforms/Updates model messages before a step is started.
   *
   * @param modelMessages - The model messages to transform
   *
   * @returns The transformed model messages
   *
   * @note Does nothing by default (returns the model messages as is).
   *
   * @note Can be overriden by the inheriting class to customize the model message transformation.
   *
   * @note For most cases, the transformation of UI messages (`transformMessagesBeforeStep`) is a better place to do context compaction etc.
   *
   * @note If the transformation from UI to model messages should be customized, override `transformMessagesToModelMessages` instead.
   */
  protected transformModelMessagesBeforeStep(
    modelMessages: ModelMessage[],
  ): ModelMessage[] | Promise<ModelMessage[]> {
    return modelMessages;
  }

  /**
   * Retrieves the system prompt for the agent.
   *
   * @returns The system prompt for the agent.
   *
   * @note Can be overridden by the inheriting class to return a different system prompt.
   */
  protected abstract getSystemPrompt(): string | Promise<string>;

  /**
   * Retrieves the tools that the agent can use.
   *
   * @param messages - The current message history before the next step is started.
   *
   * @returns The tools that the agent can use.
   *
   * @note Can be overridden by the inheriting class to return a different list of tools.
   */
  protected abstract getTools(
    messages: AgentMessage[],
  ): Partial<StagewiseToolSet> | Promise<Partial<StagewiseToolSet>>;

  /**
   * Allowed to configure the settings that are passed to the model when running a step.
   *
   * @returns A partial config that shallow merges with the default config of the agent.
   */
  protected getModelSettings(
    _messages: AgentMessage[],
  ):
    | Partial<BaseAgentConfig<TFinishToolOutputSchema>>
    | Promise<Partial<BaseAgentConfig<TFinishToolOutputSchema>>> {
    return {};
  }

  /**
   * Configurable handler that is called after a step is finished.
   * @param result - The result of the step
   * @returns Whether to continue the step or to stop the agent. Returns true by default.
   *
   * @note The agent may still not continue with another step if there are still open approval requests, tool calls that need to be finished or the agent only returned text in the last step.
   */
  protected onStepFinished(
    _result: StepResult<StagewiseToolSet>,
  ): boolean | Promise<boolean> {
    return true;
  }

  /**
   * Configurable handler that is called when the agent goes into idle (ran step without no new step following).
   */
  protected onIdle(): void | Promise<void> {
    return Promise.resolve();
  }

  /**
   * =======================================================
   * INTERNAL METHODS (SHOULD ONLY BE USED BY AGENT IMPLEMENTATIONS)
   * =======================================================
   */

  /**
   * Returns a tool that the agent can insert into it's tool list to spawn a child agent.
   *
   * @param description - The description of the tool
   * @param inputSchema - The input schema of the tool
   * @param agentType - The type of the agent to spawn
   * @param configGetter - A function that returns the configuration for the child agent
   * @param mode - The mode in which the child agent should be spawned (synchronous agents will block the parent agent until the child agent is finished, asynchronous agents will not block the parent agent)
   *
   * @returns A tool that the agent can insert into it's tool list to spawn a child agent.
   */
  protected getSpawnChildAgentTool<
    AT extends AgentTypes,
    SpawnToolInputSchema extends z.ZodType,
  >(
    description: string,
    inputSchema: SpawnToolInputSchema,
    agentType: AT,
    configGetter: (
      input: z.infer<SpawnToolInputSchema>,
    ) => InstanceType<AgentTypeMap[AT]>['instanceConfig'],
    mode: 'synchronous' | 'asynchronous' = 'synchronous',
  ): Tool | null {
    if (AgentsMap[agentType].config.finishToolOutputSchema === null) {
      return null;
    }

    return {
      description: description,
      inputSchema: inputSchema,
      outputSchema: AgentsMap[agentType].config.finishToolOutputSchema,
      // Use any for input/output to avoid "Type instantiation is excessively deep" errors
      execute: async (input: any) => {
        const config = configGetter(input);
        // Use any for Promise type to avoid deep type instantiation
        if (mode === 'asynchronous') {
          this.spawnChildAgentHandler<AT>(
            agentType,
            config,
            (_finishOutput) => {},
            (error) => {
              this.report(error, 'spawnChildAgent');
              this.logger.error(
                `[${this.agentType}] Async child agent ${agentType} failed during execution`,
                { error },
              );
            },
          ).catch((error: unknown) => {
            this.report(error as Error, 'spawnChildAgent');
            this.logger.error(
              `[${this.agentType}] Failed to spawn async child agent ${agentType}`,
              { error },
            );
          });
          return { message: `Agent ${agentType} spawned asynchronously` };
        }

        const childAgentPromise = new Promise<any>((resolve, reject) => {
          try {
            this.spawnChildAgentHandler<AT>(
              agentType,
              // Use any cast to avoid deep type instantiation
              // @ts-ignore - TS can't keep up with the type definitions...
              config,
              (finishOutput) => {
                resolve(finishOutput);
              },
              (error) => {
                reject(error);
              },
            );
          } catch (error) {
            reject(error);
          }
        });
        return await childAgentPromise;
      },
    };
  }

  /**
   * =======================================================
   * PRIVATE METHODS (INTERNAL USE ONLY)
   * =======================================================
   */

  /**
   * Execute once there's a good reason to update the title.
   */
  private async updateTitle(): Promise<void> {
    try {
      // Check if a title update is needed
      if (!this.config.generateTitles) {
        return;
      }

      // We only update whenever the last message is a user message (prevent repeated title updates when the assistant is running in loops)
      const lastMessage =
        this.state.get().history[this.state.get().history.length - 1];
      if (lastMessage.role !== 'user') {
        return;
      }

      const modulo = Math.max(
        0,
        this.config.updateTitlesEveryNUserMessages ?? 0,
      );
      const userMsgCount = this.state
        .get()
        .history.filter((message) => message.role === 'user').length;
      if (userMsgCount !== 1 && userMsgCount % modulo !== 0) {
        return;
      }

      this.logger.debug(
        `[BaseAgent:${this.instanceId}] Updating title for agent.`,
      );

      const newTitle = await this.generateTitle(this.state.get().history);
      this.logger.debug(
        `[BaseAgent:${this.instanceId}] New title generated: ${newTitle}`,
      );
      this.state.set((draft) => {
        draft.title = newTitle;
      });
      // We don't do persistence here, since that happens after a step is finished
    } catch (e) {
      const error = e as Error;
      this.logger.error(
        `[BaseAgent:${this.instanceId}] Title update failed silently: ${error.message}`,
      );
      this.report(error, 'updateTitle');
    }
  }

  /**
   * Should be executed after a user or tool approval message was added to the agent
   */
  private async runStep(isApprovalContinuation = false): Promise<void> {
    // Check canRunStep BEFORE setting isWorking to avoid deadlock
    if (!this.canRunStep()) return;

    // Increment step generation so stale callbacks from previous steps are
    // ignored. Capture it in a local const for the closures below.
    const stepGen = ++this._stepGeneration;
    this._stepStartTime = Date.now();

    let queueFlushIndex = -1;
    this.state.set((draft) => {
      draft.isWorking = true;
      draft.error = undefined; // Reset error at the start of each step
      // Flush the queue into the history (single broadcast).
      // Skip flush on approval continuations — the approval step must
      // complete in isolation first. Queued messages will be picked up
      // by the follow-up runStep() triggered via shouldRunNewStep().
      if (!isApprovalContinuation && draft.queuedMessages.length > 0) {
        queueFlushIndex = draft.history.length;
        draft.history.push(...draft.queuedMessages);
        draft.queuedMessages = [];
      }
    });

    // Get the current model — wrapped in try-catch so a deleted custom model
    // or endpoint doesn't wedge the agent with isWorking=true and no error.
    let modelWithOptions: ReturnType<
      typeof this.modelProviderService.getModelWithOptions
    >;
    try {
      modelWithOptions = this.modelProviderService.getModelWithOptions(
        this.state.get().activeModelId,
        this.instanceId,
        {
          $ai_span_name: `${this.agentType}-history`,
          $ai_parent_id: this.instanceId,
        },
      );
      this._stepProviderMode = modelWithOptions.providerMode;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `[BaseAgent:${this.instanceId}] Failed to resolve model "${this.state.get().activeModelId}": ${err.message}`,
      );
      this.report(err, 'resolveModel');
      this.state.set((draft) => {
        draft.isWorking = false;
        draft.error = {
          message: `Model error: ${err.message}`,
          stack: err.stack,
        };
      });
      return;
    }

    let modelMessages: Awaited<
      ReturnType<typeof this.generateContextForNewStep>
    >;
    let tools: Awaited<ReturnType<typeof this.getToolsForStep>>;
    let resolvedConfig: BaseAgentConfig<TFinishToolOutputSchema>;
    try {
      modelMessages = await this.generateContextForNewStep(
        queueFlushIndex >= 0 ? queueFlushIndex : undefined,
      );
      tools = await this.getToolsForStep();
      this._toolCallDurations.clear();
      tools = this.wrapToolsWithTiming(tools);
      tools = this.wrapToolsWithOutputBudget(tools);
      resolvedConfig = {
        ...this.config,
        ...(await this.getModelSettings(this.messages)),
      };
    } catch (e) {
      const error = e as Error;
      this.logger.error(
        `[BaseAgent:${this.instanceId}] Failed to prepare step context: ${this.formatError(error)}`,
      );
      this.report(error, 'prepareStepContext');
      this.state.set((draft) => {
        draft.isWorking = false;
        draft.error = {
          message: `Internal error: ${error.message}`,
          stack: error.stack,
        };
      });
      return;
    }

    if (isApprovalContinuation)
      modelMessages = this.ensureToolApprovalResponseIsLast(modelMessages);

    // Debug: analyse cache stability of the final model messages before the LLM call.
    this._cacheAnalyzer.trackStep(modelMessages);

    this.logger.debug(`[BaseAgent:${this.instanceId}] Running step`);

    this.stepAbortController = new AbortController();

    const stream = streamText({
      model: modelWithOptions.model,
      providerOptions: modelWithOptions.providerOptions,
      headers: modelWithOptions.headers,
      messages: modelMessages,
      tools: tools as StagewiseToolSet,
      timeout: resolvedConfig.maxTime
        ? {
            totalMs: resolvedConfig.maxTime,
          }
        : undefined,
      maxRetries: resolvedConfig.maxRetries ?? 1,
      maxOutputTokens: resolvedConfig.maxOutputTokens,
      abortSignal: this.stepAbortController.signal,
      onAbort: () => {
        // Guard: ignore if a newer step has started (e.g. queue flush)
        if (this._stepGeneration !== stepGen) return;
        this.state.set((draft) => {
          draft.isWorking = false;
        });
      },
      onFinish: async (result) => {
        // Guard: ignore if a newer step has started (e.g. queue flush)
        if (this._stepGeneration !== stepGen) return;

        // Log step completion details
        this.logger.debug(
          `[BaseAgent:${this.instanceId}] Step finished | finishReason=${result.finishReason} | outputTokens=${result.usage.outputTokens} | inputTokens=${result.usage.inputTokens} | cacheRead=${result.usage.inputTokenDetails.cacheReadTokens} | cacheWrite=${result.usage.inputTokenDetails.cacheWriteTokens} | totalTokens=${result.usage.totalTokens} | toolCalls=${result.toolCalls.length}`,
        );

        if (result.finishReason === 'length') {
          this.logger.warn(
            `[BaseAgent:${this.instanceId}] Output truncated (finishReason=length). ` +
              `outputTokens=${result.usage.outputTokens}, toolCalls=${result.toolCalls.length}. ` +
              `The model hit maxOutputTokens and its response was cut off. ` +
              `Tool calls in this step may have been incomplete/dropped.`,
          );
        }

        try {
          const shouldContinue = await this.handlePostStep(result);
          // Re-check after async work — internalStop may have been called
          if (this._stepGeneration !== stepGen) return;
          this.stepAbortController = null;

          if (shouldContinue) {
            // We use setTimeout to ensure the step is executed with a clean call stack to support infinite recursion.
            setTimeout(() => void this.runStep(), 0);
          } else {
            this.state.set((draft) => {
              draft.isWorking = false;
              if (draft.history.some((m) => m.role === 'assistant')) {
                draft.unread = true;
              }
            });
            this.onIdle();
          }
        } catch (err) {
          const error = err as Error;
          this.logger.error(
            `[BaseAgent:${this.instanceId}] Error in onFinish: ${this.formatError(error)}`,
          );
          this.report(error, 'onFinish');
          this.stepAbortController = null;
          // Guard: only reset if this step is still current
          if (this._stepGeneration === stepGen) {
            this.state.set((draft) => {
              draft.isWorking = false;
              draft.unread = true;
              draft.error = {
                message: `Internal error: ${error.message ?? 'Unknown error'}`,
                stack: error.stack,
              };
            });
          }
        }
      },
      onError: (ev) => {
        // Guard: ignore if a newer step has started (e.g. queue flush)
        if (this._stepGeneration !== stepGen) return;
        // ev.error may not be a real Error instance (e.g. network abort
        // events, plain objects from the AI SDK). Normalize so every
        // downstream consumer (logger, PostHog, UI state) gets a proper Error.
        const raw = ev.error;
        const error =
          raw instanceof Error
            ? raw
            : new Error(
                typeof raw === 'string'
                  ? raw
                  : (raw as Record<string, unknown>)?.message
                    ? String((raw as Record<string, unknown>).message)
                    : 'Unknown error',
              );
        this.logger.error(
          `[BaseAgent:${this.instanceId}] Error in 'streamText': ${this.formatError(error)}`,
        );
        this.report(error, 'streamText');

        const parsedError = this.parsePlanLimitError(error);
        if (parsedError?.kind === 'plan-limit-exceeded') {
          const sortedWindows = [...parsedError.exceededWindows].sort(
            (a, b) =>
              new Date(a.resetsAt).getTime() - new Date(b.resetsAt).getTime(),
          );
          this.telemetryService.capture('usage-limit-reached', {
            agent_type: this.agentType,
            model_id: this.state.get().activeModelId,
            provider_mode: this._stepProviderMode,
            plan: parsedError.plan ?? 'unknown',
            window_types: sortedWindows.map((w) => w.type),
            first_window_resets_at: sortedWindows[0]?.resetsAt ?? '',
            exceeded_window_count: sortedWindows.length,
          });
        }
        this.state.set((draft) => {
          draft.isWorking = false;
          draft.unread = true;
          draft.error = parsedError ?? {
            message: `LLM provider error: ${error.message}`,
            stack: error.stack,
          };
        });
        this.logger.debug(
          `[BaseAgent:${this.instanceId}] Wrote error to public state`,
        );
        try {
          this.stepAbortController?.abort();
        } catch {}
        this.stepAbortController = null;
      },
      experimental_repairToolCall: async ({ toolCall, error }) => {
        // Model hallucinated a tool name — unrepairable.
        if (NoSuchToolError.isInstance(error)) return null;

        // InvalidToolInputError: check whether the input JSON is
        // truncated (output token limit) vs. a schema mismatch.
        const inputLen = toolCall.input?.length ?? 0;
        let jsonValid = false;
        try {
          JSON.parse(toolCall.input);
          jsonValid = true;
        } catch {
          // JSON is unparseable
        }

        if (!jsonValid) {
          // Distinguish empty/tiny input from genuinely truncated long input
          if (inputLen < 10) {
            throw new Error(
              `Tool call for "${toolCall.toolName}" had empty or near-empty input. The model failed to generate the required parameters.`,
            );
          }
          throw new Error(
            'Tool call inputs were too long and most likely exceeded maximum token output limits. Create more compact tool calls, i.e. by chunking edits into smaller pieces.',
          );
        }

        // JSON is valid but doesn't match the schema
        throw new Error(
          `Tool call inputs for "${toolCall.toolName}" did not match the expected schema. Check the tool's parameter requirements and try again.`,
        );
      },
      experimental_transform: smoothStream({
        delayInMs: 10,
        chunking: 'word',
      }),
      temperature: resolvedConfig.temperature,
      stopWhen: () => true, // We always stop immediately and handle the execution of the next step manually
      topP: resolvedConfig.topP,
      topK: resolvedConfig.topK,
      presencePenalty: resolvedConfig.presencePenalty,
      frequencyPenalty: resolvedConfig.frequencyPenalty,
      stopSequences: resolvedConfig.stopSequences,
      seed: resolvedConfig.seed,
    });

    // Trigger an title update asynchronously once the user started sending a message
    void this.updateTitle();

    try {
      const lastAssistantMessage = [...this.state.get().history]
        .reverse()
        .find((m) => m.role === 'assistant');

      // When resuming after a tool-approval response, pass originalMessages
      // so toUIMessageStream correlates the new stream's tool-result parts
      // with the existing assistant message (avoids duplicate tool parts).
      // On normal steps, omit it to prevent the SDK from appending parts
      // from prior turns into the new message.
      // Important: this decision is driven by the explicit `isApprovalContinuation`
      // flag from the call site — NOT by scanning history for part states.
      // Auto-denied approvals (e.g. from sendUserMessage) set parts to
      // output-denied but must use the normal (non-bridging) stream path.
      const uiStream = stream.toUIMessageStream<AgentMessage>({
        generateMessageId: randomUUID,
        originalMessages: isApprovalContinuation
          ? this.state.get().history
          : undefined,
      });

      // Both branches must drain concurrently: toUIMessageStream() and
      // consumeStream() read from the same teed stream and share
      // back-pressure — awaiting them sequentially would deadlock.
      await Promise.all([
        this.handleUiStream(
          uiStream,
          isApprovalContinuation ? lastAssistantMessage : undefined,
        ),
        stream.consumeStream(),
      ]);
    } catch (err) {
      const raw = err;
      const error =
        raw instanceof Error
          ? raw
          : new Error(
              typeof raw === 'string'
                ? raw
                : (raw as Record<string, unknown>)?.message
                  ? String((raw as Record<string, unknown>).message)
                  : 'Unknown error',
            );
      this.logger.error(
        `[BaseAgent:${this.instanceId}] Error in 'runStep': ${this.formatError(error)}`,
      );
      this.report(error, 'runStep');
      // Invalidate step generation so any pending onFinish callback won't
      // start a new step after this error.
      this._stepGeneration++;
      try {
        this.stepAbortController?.abort();
      } catch {}
      this.stepAbortController = null;
      this.state.set((draft) => {
        draft.isWorking = false;
        draft.unread = true;
        draft.error = {
          message: `Internal error: ${error.message}`,
          stack: error.stack,
        };
      });
    }
  }

  /**
   * Fraction of the model's context window that kept (uncompressed)
   * messages may occupy after compression. Kept intentionally low so
   * the agent restarts with ample headroom.
   */
  private static readonly KEPT_BUDGET_FRACTION = 0.2;

  private async compressHistoryInternal(): Promise<void> {
    // Prevent concurrent compression runs — a second trigger while
    // compression is in-flight would see stale history and produce
    // a redundant (or conflicting) summary.
    if (this._isCompressingHistory) {
      this.logger.debug(
        `[BaseAgent:${this.instanceId}] Skipping history compression — already in progress.`,
      );
      return;
    }
    this._isCompressingHistory = true;
    try {
      const state = this.state.get();
      const { history } = state;

      // ── Compute token budget for kept messages ────────────────────
      let contextWindowSize: number;
      try {
        contextWindowSize = this.modelProviderService.getModelWithOptions(
          state.activeModelId,
          '',
        ).contextWindowSize;
      } catch {
        // Model may have been deleted — fall back to a conservative size
        contextWindowSize = 100_000;
      }
      const keptBudget = Math.floor(
        contextWindowSize * BaseAgent.KEPT_BUDGET_FRACTION,
      );
      const preferredFloor = Math.max(
        5,
        this.config.minUncompressedMessages ?? 10,
      );

      // ── Adaptive boundary: walk backward, respect token budget ────
      let boundaryIndex = history.length; // start past the end
      let accumulatedTokens = 0;

      for (let i = history.length - 1; i >= 0; i--) {
        const msgTokens = estimateMessageTokens(history[i]);

        if (accumulatedTokens + msgTokens > keptBudget) {
          // This message would bust the budget — stop here
          boundaryIndex = i + 1;
          break;
        }

        accumulatedTokens += msgTokens;
        const keptCount = history.length - i;

        if (keptCount >= preferredFloor) {
          // Reached preferred floor and still within budget
          boundaryIndex = i;
          break;
        }

        // Scanned everything, it all fits — nothing to compress
        if (i === 0) return;
      }

      // Edge case: even the last message alone exceeds the budget
      if (boundaryIndex >= history.length) {
        boundaryIndex = history.length - 1;
        this.logger.warn(
          `[BaseAgent:${this.instanceId}] Single message exceeds kept-token budget (${keptBudget} tokens). Keeping 1 message.`,
        );
      }

      if (boundaryIndex < 1) return; // nothing meaningful to compress

      const actualKept = history.length - boundaryIndex;
      if (actualKept < preferredFloor) {
        this.logger.debug(
          `[BaseAgent:${this.instanceId}] Adaptive compression: keeping ${actualKept} messages (preferred ${preferredFloor}) to stay within token budget.`,
        );
      }

      const boundaryMessageId = history[boundaryIndex].id;

      // If the boundary message already has compressed history, the
      // previous summary is included in messagesToCompact and will be
      // folded into the new summary by the LLM.
      const messagesToCompact = history.slice(0, boundaryIndex);

      this.logger.debug(
        `[BaseAgent:${this.instanceId}] Compressing history (${messagesToCompact.length} messages, keeping ${actualKept})...`,
      );

      const compressedHistory = await this.compressHistory(messagesToCompact);

      this.state.set((draft) => {
        // Re-fetch the correct message — user could've undone/manipulated
        // messages while we were busy compressing.
        const boundaryMessage = draft.history.find(
          (m) => m.id === boundaryMessageId,
        );

        if (!boundaryMessage) {
          this.logger.warn(
            `[BaseAgent:${this.instanceId}] Boundary message not found in history after compression. The user may have undone or manipulated messages.`,
          );
          return;
        }

        boundaryMessage.metadata ??= {
          createdAt: new Date(),
          partsMetadata: [],
        };
        boundaryMessage.metadata.compressedHistory = compressedHistory;
        this.logger.debug(
          `[BaseAgent:${this.instanceId}] Stored compressed history in message ${boundaryMessageId}`,
        );
      });

      await this.saveState();
    } catch (e) {
      // Fail silently — compression is best-effort. The agent continues
      // without compression until the context window is exhausted, at which
      // point the normal model error handling will show an error in the chat.
      const error = e as Error;
      this.logger.error(
        `[BaseAgent:${this.instanceId}] History compression failed silently: ${error.message}`,
      );
      this.report(error, 'compressHistory');
    } finally {
      this._isCompressingHistory = false;
    }
  }

  /**
   * Updates the persisted state of the agent
   */
  private async saveState(): Promise<void> {
    if (!this.config.persistent) return;

    await this.state.persist();
  }

  /**
   * Checks, if the agent should immediately run a new step after last step execution.
   *
   * Conditions for running a new step are:
   *    - maxSteps is not set or the number of steps executed since last userMessage is less than maxSteps
   *    - maxTime is not set or the time since last userMessage is less than maxTime
   *    - onStepFinished returns true
   *    - there are no open tool approval requests
   *    - there are no unfinished tool calls
   *    - a tool call was included in the last step
   *    - there wasn't just one tool call to the "finish" tool
   *
   * @returns Whether the agent should run a new step based on the given conditions.
   */
  private shouldRunNewStep(
    r: StepResult<StagewiseToolSet>,
    userWantsToContinue: boolean,
  ): boolean {
    if (this.state.get().queuedMessages.length > 0) {
      // We should always continue if the user queued a message
      return true;
    }

    let stepsSinceLastMessage = 0;
    let lastUserMessageTime = 0;
    for (let i = this.state.get().history.length - 1; i >= 0; i--) {
      if (this.state.get().history[i].role === 'assistant') {
        stepsSinceLastMessage++;
        continue;
      } else if (this.state.get().history[i].role === 'user') {
        lastUserMessageTime =
          this.state
            .get()
            .history[i].metadata?.partsMetadata[0]?.startedAt?.getTime() ??
          Date.now();
        break;
      }
    }

    // Check if the maximum number of steps has been reached
    if (this.config.maxSteps && stepsSinceLastMessage >= this.config.maxSteps) {
      this.logger.debug(
        `[BaseAgent:${this.instanceId}] Maximum number of steps reached: ${stepsSinceLastMessage} >= ${this.config.maxSteps}`,
      );
      return false;
    }

    // Check if the maximum time has been reached
    if (
      this.config.maxTime &&
      Date.now() - lastUserMessageTime >= this.config.maxTime
    ) {
      this.logger.debug(
        `[BaseAgent:${this.instanceId}] Maximum time reached: ${Date.now() - lastUserMessageTime} >= ${this.config.maxTime}`,
      );
      return false;
    }

    //Also return a no-continue if one of the called tools is a "finish" tool and only the "finish" tool was called
    if (r.toolCalls.length === 1 && r.toolCalls[0]!.toolName === 'finish') {
      this.logger.debug(
        `[BaseAgent:${this.instanceId}] Only the "finish" tool was called`,
      );
      return false;
    }

    // Check if there are any open tool approval requests
    if (r.content.some((p) => p.type === 'tool-approval-request')) {
      this.logger.debug(
        `[BaseAgent:${this.instanceId}] There are open tool approval requests`,
      );
      return false;
    }

    // If the user does not want to continue, we don't run a new step
    if (!userWantsToContinue) return false;

    // We assume that approved tool calls are executed and results are attached,
    // because this is what AI-SDK with controlled tool execution promises us

    // When the model hits the output token limit, its response is truncated.
    // Tool calls with truncated JSON will have been caught by
    // experimental_repairToolCall, which throws a clear error. The SDK
    // surfaces that as a tool-result with errorText in history, so the
    // model can see exactly what went wrong on the next step.
    if (r.finishReason === 'length') {
      this.logger.warn(
        `[BaseAgent:${this.instanceId}] Output truncated (finishReason=length). Model will see error results and retry.`,
      );
      return true;
    }

    // Check if the finish reason is not tool-calls (which means user intervention is needed)
    if (r.finishReason !== 'tool-calls') {
      this.logger.debug(
        `[BaseAgent:${this.instanceId}] The finish reason is not "tool-calls", but "${r.finishReason}"`,
      );
      return false;
    }

    return true;
  }

  /**
   * Handles all the jobs that need to be done after a step is finished executing.
   *
   * @returns Whether the agent should run a new step based on the given conditions.
   */
  private async handlePostStep(
    result: StepResult<StagewiseToolSet>,
  ): Promise<boolean> {
    this.state.set((draft) => {
      draft.usedTokens = result.usage.totalTokens ?? 0;
    });

    this.updateUsageWarning(result);

    // Save the agent state for recovery
    await this.saveState();

    // Drain sandbox-produced attachments (from API.createAttachment() calls during
    // this step) into metadata.attachments on the current assistant message.
    // pendingSandboxAttachments is keyed by toolCallId; merge all into one array.
    const sandboxAtts = this.toolbox.drainSandboxAttachments(this.instanceId);
    if (sandboxAtts.length > 0) {
      this.state.set((draft) => {
        const last = draft.history[draft.history.length - 1];
        if (last?.role === 'assistant') {
          last.metadata ??= { createdAt: new Date(), partsMetadata: [] };
          last.metadata.attachments = [
            ...(last.metadata.attachments ?? []),
            ...sandboxAtts,
          ];
        }
      });
    }

    // ─── Populate pathReferences on the assistant message ───────────
    // Extract paths from completed readFile tool calls and hash them.
    await this.populatePathReferencesOnAssistantMessage();

    this.telemetryService.capture('agent-step-completed', {
      agent_type: this.agentType,
      model_id: this.state.get().activeModelId,
      provider_mode: this._stepProviderMode,
      input_tokens: result.usage.inputTokens ?? 0,
      output_tokens: result.usage.outputTokens ?? 0,
      tool_call_count: result.toolCalls.length,
      finish_reason: result.finishReason ?? 'unknown',
      duration_ms: Date.now() - this._stepStartTime,
    });

    this.emitToolCallEvents(result);

    // Check the current token usage. If necessary, summarize the chat history.
    // We always check the token usage in relation to the currently selected model.
    const compactionThreshold = this.config.historyCompressionThreshold ?? 0.65;
    try {
      if (
        compactionThreshold >= 0 &&
        this.state.get().usedTokens /
          this.modelProviderService.getModelWithOptions(
            this.state.get().activeModelId,
            '',
          ).contextWindowSize >
          compactionThreshold
      ) {
        void this.compressHistoryInternal();
      }
    } catch {
      // Model may have been deleted between step start and finish — skip compaction check
    }

    const userWantsToContinue = (await this.onStepFinished(result)) ?? true;
    const shouldRunNewStep = this.shouldRunNewStep(result, userWantsToContinue);

    if (!shouldRunNewStep) {
      this.logger.debug(
        `[BaseAgent:${this.instanceId}] Not running new step. Agent Type: ${this.agentType}`,
      );
      return false;
    }

    this.logger.debug(
      `[BaseAgent:${this.instanceId}] Running new step. Agent Type: ${this.agentType}`,
    );

    return true;
  }

  /**
   * Handles the generation of context for a new step.
   *
   * Before converting history to model messages, this method captures a
   * fresh environment snapshot and attaches it (sparsified) to the **last
   * message in history** — regardless of whether it is a user or assistant
   * message. This single capture point guarantees that:
   *
   * 1. Every step sees the most up-to-date environment state.
   * 2. The conversion pipeline can diff consecutive snapshots to produce
   *    accurate `<env-changes>` (or a full `<env-snapshot>` for the first
   *    message / first after compression).
   * 3. For a fresh chat where the first message has no prior snapshot,
   *    the full snapshot is stored, so the conversion emits `<env-snapshot>`.
   *
   * When multiple queued messages are flushed at once, `queueFlushStart`
   * points to the first flushed message so the snapshot is attached there
   * rather than at the end — env-changes appear before user content.
   */
  private async generateContextForNewStep(
    queueFlushStart?: number,
  ): Promise<ModelMessage[]> {
    // ─── Capture & attach snapshot to last message ────────────────────
    const fullSnapshot = (await this.toolbox.captureEnvironmentSnapshot(
      this.instanceId,
    )) as FullEnvironmentSnapshot;

    this.state.set((draft) => {
      // Attach snapshot to the first flushed message when a batch was
      // queued, otherwise to the last message in history.
      const targetIdx =
        queueFlushStart !== undefined && queueFlushStart < draft.history.length
          ? queueFlushStart
          : draft.history.length - 1;
      const target = draft.history[targetIdx];
      if (!target) return;

      const prevIdx = targetIdx - 1;
      const previousEffective =
        prevIdx >= 0 ? resolveEffectiveSnapshot(draft.history, prevIdx) : null;

      target.metadata ??= {
        createdAt: new Date(),
        partsMetadata: [],
      };
      const sparse = sparsifySnapshot(fullSnapshot, previousEffective);

      target.metadata.environmentSnapshot = sparse;
    });

    // ─── Populate pathReferences on the last user message ─────────────
    // Extracts path: links, attachment paths, and mention paths, then
    // hashes each file/directory so the conversion pipeline can track
    // content state and deduplicate injections.
    await this.populatePathReferencesOnUserMessages();

    // ─── Build model messages from history ────────────────────────────
    const messages = this.state.get().history;

    const filteredUIMsgs = await this.transformMessagesBeforeStep(messages);

    const systemPrompt = await this.getSystemPrompt();

    const modelMessages = await this.transformMessagesToModelMessages(
      filteredUIMsgs,
      systemPrompt,
    );

    // Then, we allow another step to modify the final model messages
    const finalModelMessages =
      await this.transformModelMessagesBeforeStep(modelMessages);

    return finalModelMessages;
  }

  /**
   * Populate `pathReferences` on all user messages in history that don't
   * already have them.
   *
   * The last user message is always (re-)populated so its hashes reflect
   * the current file state at step start. Earlier user messages that were
   * never populated (e.g. messages sent while a step was in-flight) are
   * also processed so their file content is injected during conversion.
   */
  private async populatePathReferencesOnUserMessages(): Promise<void> {
    const history = this.state.get().history;
    const mountPaths = this.toolbox.getMountedPathsForAgent(this.instanceId);

    // Collect indices of user messages that need (re-)population:
    // - All user messages without pathReferences (never populated)
    // - The last user message (always re-populate for fresh hashes)
    //
    // We iterate backward and stop as soon as we encounter a user message
    // that already has pathReferences (other than the last user message,
    // which is always re-populated). Reverted/re-sent messages are removed
    // from history before re-sending, so a populated message is a reliable
    // boundary — everything before it has been populated in a prior step.
    let lastUserIdx = -1;
    const indicesToPopulate: number[] = [];

    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i]!.role !== 'user') continue;
      if (lastUserIdx < 0) {
        lastUserIdx = i;
        // Always re-populate the last user message for fresh hashes.
        indicesToPopulate.push(i);
        continue;
      }
      if (history[i]!.metadata?.pathReferences) {
        // Already populated — all earlier messages must also be populated.
        break;
      }
      indicesToPopulate.push(i);
    }

    if (indicesToPopulate.length === 0) return;

    // Process all target messages concurrently
    const results = await Promise.all(
      indicesToPopulate.map(async (idx) => {
        const message = history[idx]!;
        const messageCopy = {
          ...message,
          metadata: message.metadata
            ? { ...message.metadata }
            : { createdAt: new Date(), partsMetadata: [] },
        };

        await populatePathReferences(
          messageCopy,
          this.instanceId,
          mountPaths,
          this.logger,
        );

        return { idx, pathReferences: messageCopy.metadata?.pathReferences };
      }),
    );

    // Write back all populated pathReferences in a single state update
    const populated = results.filter((r) => r.pathReferences);
    if (populated.length === 0) return;

    this.state.set((draft) => {
      for (const { idx, pathReferences } of populated) {
        const target = draft.history[idx];
        if (!target) continue;
        target.metadata ??= {
          createdAt: new Date(),
          partsMetadata: [],
        };
        target.metadata.pathReferences = pathReferences;
      }
    });
  }

  /**
   * Populate `pathReferences` on the last assistant message by extracting
   * paths from completed `readFile` tool-call parts, resolving them, and
   * hashing the files.
   *
   * Called in `handlePostStep` after each step completes.
   */
  private async populatePathReferencesOnAssistantMessage(): Promise<void> {
    const history = this.state.get().history;
    // Capture the index at read-time so the write targets the same message
    // even if history grows concurrently (e.g. a new message appended).
    const targetIdx = history.length - 1;
    const lastMsg = history[targetIdx];
    if (!lastMsg || lastMsg.role !== 'assistant') return;

    // Collect paths from readFile tool calls AND from attachments created
    // via API.createAttachment(). Both should be tracked so their contents
    // are automatically injected into model context on the next turn.
    const pathsFromToolCalls =
      extractReadFilePathsFromAssistantMessage(lastMsg);
    const pathsFromAttachments = (lastMsg.metadata?.attachments ?? [])
      .map((att) => att.path)
      .filter((p): p is string => typeof p === 'string' && p.length > 0);

    const mountedPaths = [
      ...new Set([...pathsFromToolCalls, ...pathsFromAttachments]),
    ];
    if (mountedPaths.length === 0) return;

    const mountPaths = this.toolbox.getMountedPathsForAgent(this.instanceId);
    const references: Record<string, string> = {};

    await Promise.all(
      mountedPaths.map(async (mountedPath) => {
        const absolutePath = resolveMountedPath(
          mountedPath,
          this.instanceId,
          mountPaths,
        );
        if (!absolutePath) return;

        try {
          const hash = await hashPath(absolutePath);
          references[mountedPath] = hash;
        } catch (err) {
          this.logger.debug(
            `[populatePathReferences:assistant] Failed to hash "${mountedPath}": ${err instanceof Error ? err.message : err}`,
          );
        }
      }),
    );

    if (Object.keys(references).length > 0) {
      this.state.set((draft) => {
        const target = draft.history[targetIdx];
        if (!target || target.role !== 'assistant') return;
        target.metadata ??= {
          createdAt: new Date(),
          partsMetadata: [],
        };
        // Merge with any existing pathReferences from prior steps
        // (multi-step continuations append to the same assistant message)
        target.metadata.pathReferences = {
          ...(target.metadata.pathReferences ?? {}),
          ...references,
        };
      });
    }
  }

  /**
   * Checks if the message history is ready to be processed by the model
   *
   * We check for the following conditions:
   *    - No step is currently running (stepAbortController exists and not aborted)
   *    - All non-provider tools with need for approval are executed and results are attached
   *    - All open tool approval requests are responded to (either deny or accept) in the last message of the history
   *
   * @returns Whether the agent can run a new step based on the given conditions.
   */
  private canRunStep(): boolean {
    // Only check stepAbortController for concurrency - isWorking is just a UI state indicator
    if (this.stepAbortController && !this.stepAbortController.signal.aborted) {
      return false;
    }

    // Because we use `stopWhen: () => true`, the stream ends after every step.
    // When the user approves/denies a tool, the stream for that step has already
    // terminated — tool execution only happens in the *next* runStep() call.
    // Therefore, `approval-responded` (both approved and denied) must be treated
    // as resolved here so the agent loop can proceed to that next step.
    const openToolCallRequests = this.state
      .get()
      .history.filter(
        (msg) =>
          msg.role === 'assistant' &&
          msg.parts.some(
            (p) =>
              (p.type.startsWith('tool-') || p.type === 'dynamic-tool') &&
              (p as AgentToolUIPart | DynamicToolUIPart).state !==
                'approval-responded' &&
              (p as AgentToolUIPart | DynamicToolUIPart).state !==
                'output-available' &&
              (p as AgentToolUIPart | DynamicToolUIPart).state !==
                'output-error' &&
              (p as AgentToolUIPart | DynamicToolUIPart).state !==
                'output-denied',
          ),
      );

    return openToolCallRequests.length === 0;
  }

  private async getToolsForStep(): Promise<Partial<StagewiseToolSet>> {
    const userTools = await this.getTools(this.messages);
    const finishTool =
      this.getFinishTool() !== null ? { finish: this.getFinishTool() } : {};
    return {
      ...userTools,
      ...finishTool,
    };
  }

  private getFinishTool(): Tool | null {
    if (!this.config.finishToolOutputSchema) return null;
    return tool({
      description:
        'Mark the conversation as done/finished. You must use this tool to mark the work/task as being done. Use it after all other tool calls are done.',
      inputSchema: this.config.finishToolOutputSchema,
      execute: async (input) => {
        // Type assertion needed because AI SDK infers `unknown` for generic schema types
        return await this.finishToolHandler?.(
          input as TFinishToolOutputSchema extends z.ZodType
            ? z.infer<TFinishToolOutputSchema>
            : never,
        );
      },
    });
  }

  /**
   * Drains the UI message stream and writes each chunk into history.
   *
   * This method only handles structural bookkeeping (adding the message,
   * updating parts, tracking part timing). It does NOT capture environment
   * snapshots — snapshots are attached to the last message in history by
   * `generateContextForNewStep` right before the conversion pipeline runs.
   *
   * When resuming after tool-approval, `lastAssistantMessage` is passed
   * so `readUIMessageStream` can append tool-result parts to the existing
   * message instead of creating a new one. It is cloned because the SDK
   * mutates it in-place, which would corrupt the stored history.
   */
  private async handleUiStream(
    uiStream: AsyncIterableStream<InferUIMessageChunk<AgentMessage>>,
    lastAssistantMessage?: AgentMessage,
  ): Promise<void> {
    for await (const uiMessage of readUIMessageStream<AgentMessage>({
      stream: uiStream,
      message: lastAssistantMessage
        ? structuredClone(lastAssistantMessage)
        : undefined,
    })) {
      this.state.set((draft) => {
        const existingMessage =
          draft.history.find((message) => message.id === uiMessage.id) ??
          (() => {
            draft.history.push(uiMessage);
            return draft.history[draft.history.length - 1];
          })();

        // Fine-grained merge: only touch parts that are still actively
        // changing so Immer produces small, targeted patches and settled
        // part references survive all the way to React (SinglePartRenderer
        // relies on reference equality for memoisation).
        //
        // Contract: once a part reaches a settled state, its content
        // (type, input, output) is considered final and will not be
        // re-emitted with different values by the AI SDK stream.  If
        // this assumption is violated, the stale part will persist until
        // a non-settled state change forces an update.
        const incoming = uiMessage.parts;
        const existing = existingMessage.parts;
        const settled = new Set([
          'output-available',
          'output-error',
          'output-denied',
          'done',
        ]);
        for (let i = 0; i < incoming.length; i++) {
          if (i >= existing.length) {
            existing.push(incoming[i]);
          } else {
            const ep = existing[i] as Record<string, unknown>;
            const ip = incoming[i] as Record<string, unknown>;
            if (
              ep.type === ip.type &&
              ep.state === ip.state &&
              settled.has(ep.state as string)
            )
              continue;

            existing[i] = incoming[i];
          }
        }
        if (existing.length > incoming.length)
          existing.length = incoming.length;

        existingMessage.metadata ??= {
          createdAt: new Date(),
          partsMetadata: [],
        };

        uiMessage.parts.forEach(
          (part: (typeof uiMessage.parts)[number], index: number) => {
            if (part.type === 'text' || part.type === 'reasoning') {
              existingMessage.metadata!.partsMetadata[index] ??= {
                startedAt: new Date(),
                endedAt: undefined,
              };
              if (part.state === 'done') {
                existingMessage.metadata!.partsMetadata[index].endedAt ??=
                  new Date();
              }
            }
          },
        );
      });
    }
  }

  private async internalStop(
    stopReason: 'user-stopped' | 'user-flushed-queue' = 'user-stopped',
  ): Promise<void> {
    // Invalidate pending callbacks BEFORE firing abort — onAbort fires
    // synchronously and must see the new generation to be ignored.
    this._stepGeneration++;
    try {
      this.stepAbortController?.abort();
    } catch {}
    this.stepAbortController = null;

    // Cancel any pending user questions so the form UI is dismissed
    this.toolbox.cancelPendingQuestions(this.instanceId);

    const toolCallAbortReason =
      stopReason === 'user-stopped'
        ? (this.config.stopToolCallAbortReason ??
          'User stopped agent before tool call finished.')
        : (this.config.flushQueueToolCallAbortReason ??
          'User sent new message before tool call finished.');

    const toolCallRequestApprovalAbortReason =
      stopReason === 'user-stopped'
        ? (this.config.stopToolCallRequestApprovalReason ??
          'User stopped agent before tool call approval was granted.')
        : (this.config.flushQueueToolCallRequestApprovalReason ??
          'User sent new message before tool call approval was granted.');

    this.state.set((draft) => {
      const lastMsg = draft.history[draft.history.length - 1];

      if (lastMsg?.role !== 'assistant') return;

      lastMsg.parts.forEach((p, index) => {
        if (p.type === 'dynamic-tool' || p.type.startsWith('tool-')) {
          const toolPart = p as AgentToolUIPart | DynamicToolUIPart;
          if (toolPart.state === 'approval-requested') {
            // All tool call approvals should be rejected with the configured reason for abort.
            const updatedToolPart: AgentToolUIPart | DynamicToolUIPart = {
              ...toolPart,
              state: 'output-denied',
              approval: {
                ...toolPart.approval,
                approved: false,
                reason: toolCallRequestApprovalAbortReason,
              },
            };
            lastMsg.parts[index] = updatedToolPart;
          } else if (
            toolPart.state !== 'output-available' &&
            toolPart.state !== 'output-error'
          ) {
            // @ts-expect-error - We know that the input is/maybe partial here, but we still keep the previous type because everything else doesn't make sense here
            const updatedToolPart: AgentToolUIPart | DynamicToolUIPart = {
              ...toolPart,
              state: 'output-error',
              input: toolPart.input ?? {},
              approval: undefined,
              errorText: toolCallAbortReason,
            };
            lastMsg.parts[index] = updatedToolPart;
          }
        }
      });

      // LLM providers don't support reasoning/thinking as the last part of a message.
      // Strip trailing reasoning parts from the last assistant message after abort.
      while (
        lastMsg.parts.length > 0 &&
        lastMsg.parts[lastMsg.parts.length - 1].type === 'reasoning'
      ) {
        lastMsg.parts.pop();
        lastMsg.metadata?.partsMetadata?.pop();
      }

      // If the message is now empty (only had reasoning parts), remove it entirely.
      if (lastMsg.parts.length === 0) {
        draft.history.pop();
      }
    });
  }

  /**
   * Ensures the last model message is the `tool`-role message containing
   * `tool-approval-response` parts. The AI SDK's `collectToolApprovals`
   * only inspects the **last** message; if synthetic user messages
   * (env-changes, sandbox attachments) follow the tool message, the SDK
   * silently skips tool execution and the provider rejects the request.
   *
   * When trailing messages exist after the last tool message that carries
   * an approval response, they are relocated to just before the
   * corresponding assistant message so the tool message becomes last
   * while all context is preserved.
   *
   * No-op when the tool message is already last or has no approval
   * response parts.
   */
  private ensureToolApprovalResponseIsLast(
    messages: ModelMessage[],
  ): ModelMessage[] {
    let lastToolIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'tool') {
        lastToolIdx = i;
        break;
      }
    }
    if (lastToolIdx === -1 || lastToolIdx === messages.length - 1)
      return messages;

    const toolMsg = messages[lastToolIdx];
    const hasApprovalResponse =
      Array.isArray(toolMsg.content) &&
      (toolMsg.content as Array<{ type: string }>).some(
        (p) => p.type === 'tool-approval-response',
      );
    if (!hasApprovalResponse) return messages;

    let assistantIdx = lastToolIdx - 1;
    while (assistantIdx >= 0 && messages[assistantIdx].role !== 'assistant')
      assistantIdx--;

    if (assistantIdx < 0) return messages;

    const trailing = messages.splice(lastToolIdx + 1);
    messages.splice(assistantIdx, 0, ...trailing);
    return messages;
  }

  private static extractApiErrorContext(error: Error): Record<string, unknown> {
    const errAny = error as unknown as Record<string, unknown>;
    const ctx: Record<string, unknown> = {};
    if (errAny.statusCode !== undefined) ctx.statusCode = errAny.statusCode;
    if (errAny.url !== undefined) ctx.url = errAny.url;
    if (errAny.isRetryable !== undefined) ctx.isRetryable = errAny.isRetryable;
    if (typeof errAny.responseBody === 'string')
      ctx.responseBody = errAny.responseBody.slice(0, 4000);
    if (errAny.cause instanceof Error) ctx.causeMessage = errAny.cause.message;
    return ctx;
  }

  private formatError(error: Error): string {
    const ctx = BaseAgent.extractApiErrorContext(error);
    const parts = [error.message];
    if (ctx.statusCode) parts.push(`status=${ctx.statusCode}`);
    if (ctx.url) parts.push(`url=${ctx.url}`);
    if (ctx.responseBody)
      parts.push(`response=${(ctx.responseBody as string).slice(0, 500)}`);
    if (ctx.causeMessage) parts.push(`cause=${ctx.causeMessage}`);
    return parts.join(', ');
  }

  private parsePlanLimitError(error: Error): AgentRuntimeError | null {
    const ctx = BaseAgent.extractApiErrorContext(error);
    if (typeof ctx.responseBody !== 'string') return null;
    try {
      const body = JSON.parse(ctx.responseBody);
      if (body?.error !== 'PLAN_LIMIT_EXCEEDED') return null;
      const exceededWindows =
        body.details?.exceededWindows
          ?.filter(
            (w: Record<string, unknown>) =>
              typeof w.type === 'string' && typeof w.resetsAt === 'string',
          )
          .map((w: { type: string; resetsAt: string }) => ({
            type: w.type,
            resetsAt: w.resetsAt,
          })) ?? [];
      const plan =
        typeof body.details?.plan === 'string' ? body.details.plan : undefined;
      return {
        kind: 'plan-limit-exceeded',
        message: body.message ?? 'Usage limit exceeded',
        plan,
        exceededWindows,
      };
    } catch {
      return null;
    }
  }

  private updateUsageWarning(result: StepResult<StagewiseToolSet>): void {
    const pm = result.providerMetadata as
      | Record<string, Record<string, unknown>>
      | undefined;
    const limits = pm?.stagewise?.limits as
      | Array<{
          type: string;
          usedPercent: number;
          resetsAt: string;
        }>
      | undefined;
    if (!Array.isArray(limits)) return;

    const warned = limits.find(
      (w) => typeof w.usedPercent === 'number' && w.usedPercent >= 80,
    );

    // Emit telemetry only when the warning is newly surfaced or changed
    const current = this.state.get().usageWarning;
    if (
      warned &&
      (current?.windowType !== warned.type ||
        current?.usedPercent !== warned.usedPercent)
    ) {
      this.telemetryService.capture('usage-warning-shown', {
        agent_type: this.agentType,
        model_id: this.state.get().activeModelId,
        provider_mode: this._stepProviderMode,
        window_type: warned.type,
        used_percent: warned.usedPercent,
        resets_at: warned.resetsAt,
      });
    }

    this.state.set((draft) => {
      draft.usageWarning = warned
        ? {
            windowType: warned.type,
            usedPercent: warned.usedPercent,
            resetsAt: warned.resetsAt,
          }
        : undefined;
    });
  }

  private report(
    error: Error,
    operation: string,
    extra?: Record<string, unknown>,
  ) {
    this.telemetryService.captureException(error, {
      service: 'base-agent',
      operation,
      modelId: this.state.get().activeModelId,
      agentType: this.agentType,
      instanceId: this.instanceId,
      ...BaseAgent.extractApiErrorContext(error),
      ...extra,
    });
  }

  private wrapToolsWithTiming(
    tools: Partial<StagewiseToolSet>,
  ): Partial<StagewiseToolSet> {
    const wrapped: Partial<StagewiseToolSet> = {};
    for (const [name, t] of Object.entries(tools)) {
      if (!t || typeof t !== 'object' || !('execute' in t) || !t.execute) {
        (wrapped as Record<string, unknown>)[name] = t;
        continue;
      }
      const originalExecute = t.execute;
      (wrapped as Record<string, unknown>)[name] = {
        ...t,
        execute: async (input: unknown, options: { toolCallId: string }) => {
          const start = Date.now();
          try {
            return await (
              originalExecute as (
                input: unknown,
                options: { toolCallId: string },
              ) => Promise<unknown>
            )(input, options);
          } finally {
            this._toolCallDurations.set(options.toolCallId, Date.now() - start);
          }
        },
      };
    }
    return wrapped;
  }

  /**
   * Wraps each tool's execute to enforce a shared per-step output budget.
   * All tool calls within a single step share one cumulative byte allowance.
   * When the budget is exhausted, later-finishing tools have their output
   * aggressively truncated, signalling the model to reduce parallelism.
   */
  private wrapToolsWithOutputBudget(
    tools: Partial<StagewiseToolSet>,
    maxBytes = 60 * 1024, // ~15k tokens
  ): Partial<StagewiseToolSet> {
    let used = 0;
    const wrapped: Partial<StagewiseToolSet> = {};

    for (const [name, t] of Object.entries(tools)) {
      if (!t || typeof t !== 'object' || !('execute' in t) || !t.execute) {
        (wrapped as Record<string, unknown>)[name] = t;
        continue;
      }
      const originalExecute = t.execute;
      (wrapped as Record<string, unknown>)[name] = {
        ...t,
        execute: async (input: unknown, options: { toolCallId: string }) => {
          const result = await (
            originalExecute as (
              input: unknown,
              options: { toolCallId: string },
            ) => Promise<unknown>
          )(input, options);

          try {
            const resultBytes = new TextEncoder().encode(
              JSON.stringify(result),
            ).length;
            const remaining = Math.max(0, maxBytes - used);

            if (resultBytes <= remaining) {
              used += resultBytes;
              return result;
            }

            // Budget exceeded — truncate this result to fit
            used += Math.min(resultBytes, remaining);
            if (remaining === 0) {
              return {
                message:
                  'Tool output omitted: combined tool output budget for this step was exceeded. ' +
                  'Reduce the number of parallel tool calls or request smaller outputs.',
              };
            }
            return capToolOutput(result, { maxBytes: remaining }).result;
          } catch (err) {
            // If size measurement fails (e.g. circular refs), let the
            // result through unmodified — over-budget is better than
            // crashing a successful tool call.
            this.report(err as Error, 'wrapToolsWithOutputBudget', {
              toolName: name,
              toolCallId: options.toolCallId,
            });
            return result;
          }
        },
      };
    }
    return wrapped;
  }

  private emitToolCallEvents(result: StepResult<StagewiseToolSet>): void {
    const modelId = this.state.get().activeModelId;
    const isFull = this.telemetryService.telemetryLevel === 'full';

    for (const part of result.content) {
      if (part.type !== 'tool-result' && part.type !== 'tool-error') continue;
      if (part.toolName === 'finish') continue;

      const inputObj =
        typeof part.input === 'object' && part.input !== null ? part.input : {};
      const inputKeys = Object.keys(inputObj as Record<string, unknown>);
      let inputSummary: string | undefined;
      if (isFull) {
        try {
          inputSummary = JSON.stringify(part.input).slice(0, 2048);
        } catch {}
      }

      const durationMs = this._toolCallDurations.get(part.toolCallId);

      if (part.type === 'tool-result') {
        this.telemetryService.capture('tool-call-executed', {
          tool_name: part.toolName,
          agent_type: this.agentType,
          model_id: modelId,
          success: true,
          input_keys: inputKeys,
          input_summary: inputSummary,
          duration_ms: durationMs,
        });
      } else {
        this.telemetryService.capture('tool-call-executed', {
          tool_name: part.toolName,
          agent_type: this.agentType,
          model_id: modelId,
          success: false,
          error_message: String(part.error).slice(0, 500),
          input_keys: inputKeys,
          input_summary: inputSummary,
          duration_ms: durationMs,
        });
      }
    }

    this._toolCallDurations.clear();
  }

  /**
   * Must be called when the agent is torn down (deleted or closed) to clean up/ free resources (e.g. sandbox memory, state, etc.).
   */
  public onTeardown(): Promise<void> | void {
    void this.toolbox.clearAgentTracking(this.instanceId);
    if (this.fileReadCacheService) {
      void this.fileReadCacheService.teardown();
    }
  }
}
