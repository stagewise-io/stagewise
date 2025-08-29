import { randomUUID } from 'node:crypto';
import { cliTools } from '@stagewise/agent-tools';
import { AgentErrorType } from '@stagewise/karton-contract';
import { convertCreditsToSubscriptionCredits } from './utils/convert-credits-to-subscription-credits.js';
import type { KartonContract, History } from '@stagewise/karton-contract';
import {
  createKartonServer,
  type KartonServer,
} from '@stagewise/karton/server';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import type { PromptSnippet } from '@stagewise/agent-types';
import { createAuthenticatedClient } from './utils/create-authenticated-client.js';
import type {
  AppRouter,
  TRPCClient,
  RouterInputs,
  RouterOutputs,
} from '@stagewise/api-client';

import { TimeoutManager } from './utils/time-out-manager.js';
import { processParallelToolCalls } from './utils/tool-call-utils.js';
import {
  createEventEmitter,
  EventFactories,
  type AgentEventCallback,
} from './utils/event-utils.js';
import { mapZodToolsToJsonSchemaTools } from './utils/agent-api-utils.js';
import {
  ErrorDescriptions,
  formatErrorDescription,
} from './utils/error-utils.js';
import { getProjectInfo } from '@stagewise/agent-prompt-snippets';
import { getProjectPath } from '@stagewise/agent-prompt-snippets';
import {
  appendTextDeltaToMessage,
  attachToolOutputToMessage,
  createAndActivateNewChat,
  appendToolInputToMessage,
} from './utils/karton-helpers.js';
import { isAbortError } from './utils/is-abort-error.js';
import { isInsufficientCreditsError } from './utils/is-insufficient-credits-error.js';
import type { ToolUIPart } from 'ai';

type ToolCallType = 'dynamic-tool' | `tool-${string}`;

function isToolCallType(type: string): type is ToolCallType {
  return type === 'dynamic-tool' || type.startsWith('tool-');
}

type Tools = ReturnType<typeof cliTools>;
type AsyncIterableItem<T> = T extends AsyncIterable<infer U> ? U : never;
type ReturnValue<T> = T extends AsyncGenerator<infer _U, infer V, infer _W>
  ? V
  : never;

type LastResponse = ReturnValue<RouterOutputs['chat']['streamAgentCall']>;

type ChatId = string;

// Configuration constants
const DEFAULT_AGENT_TIMEOUT = 180000; // 3 minutes
const MAX_RECURSION_DEPTH = 20;

export class Agent {
  private static instance: Agent;
  private karton: KartonServer<KartonContract> | null = null;
  private clientRuntime: ClientRuntime;
  private tools: Tools;
  private client: TRPCClient<AppRouter>;
  private accessToken: string;
  private refreshToken: string;
  private eventEmitter: ReturnType<typeof createEventEmitter>;
  private isWorking = false;
  private timeoutManager: TimeoutManager;
  private recursionDepth = 0;
  private agentTimeout: number = DEFAULT_AGENT_TIMEOUT;
  private authRetryCount = 0;
  private maxAuthRetries = 2;
  private abortController: AbortController;
  private lastMessageId: string | null = null;
  // undo is only allowed for one chat at a time.
  // if the user switches to a new chat, the undo stack is cleared
  private undoToolCallStack: Map<
    ChatId,
    {
      toolName: string;
      toolCallId: string;
      undoExecute?: () => Promise<void>;
    }[]
  > = new Map();

  private constructor(config: {
    clientRuntime: ClientRuntime;
    tools: Tools;
    accessToken: string;
    refreshToken: string;
    onEvent?: AgentEventCallback;
    agentTimeout?: number;
  }) {
    this.clientRuntime = config.clientRuntime;
    this.tools = config.tools;
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;
    this.eventEmitter = createEventEmitter(config.onEvent);
    this.client = createAuthenticatedClient(this.accessToken);
    this.agentTimeout = config.agentTimeout || DEFAULT_AGENT_TIMEOUT;
    this.timeoutManager = new TimeoutManager();
    this.abortController = new AbortController();
  }

  public shutdown() {
    // Clean up all pending operations
    this.cleanupPendingOperations('Agent shutdown');
  }

  /**
   * Sets the agent state and emits a state change event
   * @param isWorking - The new state to set
   */
  private setAgentWorking(isWorking: boolean): void {
    if (!this.karton) return;
    this.timeoutManager.clear('is-working');
    this.isWorking = isWorking;

    // Set automatic recovery for stuck states
    if (isWorking) {
      this.timeoutManager.set(
        'is-working',
        () => {
          this.setAgentWorking(false);
        },
        this.agentTimeout,
      );
    }

    this.karton.setState((draft) => {
      draft.isWorking = isWorking;
    });
    this.eventEmitter.emit(
      EventFactories.agentStateChanged(this.isWorking, !this.isWorking),
    );
  }

  /**
   * Calls the agent API with automatic retry on authentication failures
   * @param request - The request to call the agent API with
   * @returns The result of the agent API call
   */
  private async callAgentWithRetry(
    request: RouterInputs['chat']['streamAgentCall'],
  ): Promise<
    AsyncIterable<AsyncIterableItem<RouterOutputs['chat']['streamAgentCall']>>
  > {
    try {
      const result = await this.client.chat.streamAgentCall.mutate(
        {
          messages: request.messages,
          tools: mapZodToolsToJsonSchemaTools(this.tools),
          promptSnippets: request.promptSnippets,
        },
        {
          signal: this.abortController.signal,
        },
      );
      this.authRetryCount = 0;
      return result;
    } catch (error) {
      // Check if it's an authentication error
      if (this.isAuthenticationError(error)) {
        if (this.authRetryCount < this.maxAuthRetries) {
          this.authRetryCount++;
          const { accessToken, refreshToken } =
            await this.client.session.refreshToken.mutate({
              refreshToken: this.refreshToken!,
            });
          this.refreshToken = refreshToken;
          this.accessToken = accessToken;
          this.client = createAuthenticatedClient(this.accessToken);

          return this.callAgentWithRetry(request);
        } else if (error instanceof Error && error.name === 'AbortError') {
          // Abort error is not an auth error
          throw error;
        } else {
          // Max retries exceeded
          this.authRetryCount = 0;
          throw new Error('Authentication failed, please restart the cli.');
        }
      }

      // Not an auth error, rethrow
      throw error;
    }
  }

  /**
   * Checks if an error is an authentication error
   * @param error - The error to check
   * @returns True if the error is an authentication error, false otherwise
   */
  private isAuthenticationError(error: any): boolean {
    // Check for TRPC error with UNAUTHORIZED code
    if (error?.data?.code === 'UNAUTHORIZED') {
      return true;
    }

    // Check for HTTP 401 status
    if (error?.data?.httpStatus === 401) {
      return true;
    }

    // Check error message for auth-related keywords
    const errorMessage = error?.message || '';
    const authErrorPatterns = [
      'unauthorized',
      'authentication',
      'invalid token',
      'expired token',
      '401',
    ];

    return authErrorPatterns.some((pattern) =>
      errorMessage.toLowerCase().includes(pattern),
    );
  }

  /**
   * Cleans up any pending operations and resets the agent state
   * @param reason - Optional reason for the cleanup
   * @param resetRecursionDepth - Whether to reset recursion depth to 0 (default: true)
   */
  private cleanupPendingOperations(
    _reason?: string,
    resetRecursionDepth = true,
  ): void {
    // Clear all timeouts
    this.timeoutManager.clearAll();

    // Reset recursion depth if requested
    if (resetRecursionDepth) {
      this.recursionDepth = 0;
    }

    // Set state to IDLE
    this.setAgentWorking(false);
  }

  /**
   * Gets the singleton instance of the Agent class.
   * @param clientRuntime - The runtime environment that provides access to editor/IDE functionality
   * @param tools - Collection of tools available to the agent for performing operations
   * @param onEvent - Optional callback for tracking agent events
   * @returns The singleton Agent instance
   * @remarks The clientRuntime and tools parameters are only used when creating the first instance.
   * Subsequent calls will return the existing instance regardless of the parameters provided.
   */
  public static getInstance(config: {
    clientRuntime: ClientRuntime;
    tools?: Tools;
    accessToken: string;
    refreshToken: string;
    onEvent?: AgentEventCallback;
    agentTimeout?: number;
  }) {
    const {
      clientRuntime,
      tools = cliTools(clientRuntime),
      accessToken,
      refreshToken,
      onEvent,
      agentTimeout,
    } = config;
    if (!Agent.instance) {
      Agent.instance = new Agent({
        clientRuntime,
        tools,
        accessToken,
        refreshToken,
        onEvent,
        agentTimeout,
      });
    }
    return Agent.instance;
  }

  /**
   * Initialize the agent
   * @returns The WebSocket server instance
   */
  public async initialize(): Promise<{
    wss: Awaited<ReturnType<typeof createKartonServer<KartonContract>>>['wss'];
  }> {
    this.karton = await createKartonServer<KartonContract>({
      procedures: {
        fuzzyFileSearch: async (searchString) => {
          return this.clientRuntime.fileSystem.fuzzySearch(searchString);
        },
        undoToolCallsUntilUserMessage: async (userMessageId, chatId) => {
          await this.undoToolCallsUntilUserMessage(userMessageId, chatId);
        },
        retrySendingUserMessage: async () => {
          this.setAgentWorking(true);
          this.karton?.setState((draft) => {
            // remove any errors
            draft.chats[draft.activeChatId!]!.error = undefined;
          });
          const promptSnippets: PromptSnippet[] = [];
          const projectPathPromptSnippet = await getProjectPath(
            this.clientRuntime,
          );
          if (projectPathPromptSnippet) {
            promptSnippets.push(projectPathPromptSnippet);
          }
          await this.callAgent({
            chatId: this.karton!.state.activeChatId!,
            history:
              this.karton!.state.chats[this.karton!.state.activeChatId!]!
                .messages,
            clientRuntime: this.clientRuntime,
            promptSnippets,
          });
          this.setAgentWorking(false);
        },
        refreshSubscription: async () => {
          this.client?.subscription.getSubscription
            .query()
            .then((subscription) => {
              this.karton?.setState((draft) => {
                draft.subscription = subscription;
              });
            })
            .catch((_) => {
              // ignore errors here, there's a default credit amount
            });
        },
        abortAgentCall: async () => {
          this.abortController.abort();
          this.abortController = new AbortController();
        },
        approveToolCall: async (_toolCallId, _callingClientId) => {},
        rejectToolCall: async (_toolCallId, _callingClientId) => {},
        createChat: async () => {
          return createAndActivateNewChat(this.karton!);
        },
        switchChat: async (chatId, _callingClientId) => {
          this.karton?.setState((draft) => {
            draft.activeChatId = chatId;
          });
          Object.entries(this.karton!.state.chats).forEach(([id, chat]) => {
            if (chat.messages.length === 0 && id !== chatId)
              this.karton?.setState((draft) => {
                delete draft.chats[id];
              });
          });
        },
        deleteChat: async (chatId, _callingClientId) => {
          // if the active chat is being deleted, figure out which chat to switch to
          if (this.karton!.state.activeChatId === chatId) {
            const nextChatId = Object.keys(this.karton!.state.chats).find(
              (id) => id !== chatId,
            );
            // if there are no other chats, create a new one
            if (!nextChatId) createAndActivateNewChat(this.karton!);
            // if there are other chats, switch to the next one
            else
              this.karton?.setState((draft) => {
                draft.activeChatId = nextChatId;
              });
          }
          // finally delete the chat
          this.karton?.setState((draft) => {
            delete draft.chats[chatId];
          });
        },
        sendUserMessage: async (message, _callingClientId) => {
          this.setAgentWorking(true);
          const newstate = this.karton?.setState((draft) => {
            const chatId = this.karton!.state.activeChatId!;
            draft.chats[chatId]!.messages.push(message as any); // TODO: fix the type issue here
            draft.chats[chatId]!.error = undefined;
          });
          const messages =
            newstate?.chats[this.karton!.state.activeChatId!]!.messages;
          const promptSnippets: PromptSnippet[] = [];
          const projectPathPromptSnippet = await getProjectPath(
            this.clientRuntime,
          );
          if (projectPathPromptSnippet) {
            promptSnippets.push(projectPathPromptSnippet);
          }
          const projectInfoPromptSnippet = await getProjectInfo(
            this.clientRuntime,
          );
          if (projectInfoPromptSnippet) {
            promptSnippets.push(projectInfoPromptSnippet);
          }
          this.callAgent({
            chatId: this.karton!.state.activeChatId!,
            history: messages,
            clientRuntime: this.clientRuntime,
            promptSnippets,
          }).then(() => {
            this.setAgentWorking(false);
          });
        },
      },
      initialState: {
        activeChatId: null,
        chats: {},
        isWorking: false,
        toolCallApprovalRequests: [],
        subscription: undefined,
      },
    });

    this.client?.subscription.getSubscription
      .query()
      .then((subscription) => {
        this.karton?.setState((draft) => {
          draft.subscription = subscription;
        });
      })
      .catch((_) => {
        // ignore errors here, there's a default credit amount
      });

    this.setAgentWorking(false);
    createAndActivateNewChat(this.karton);

    return {
      wss: this.karton.wss,
    };
  }

  /**
   * Calls the agent API
   * @param userMessage - The user message to send to the agent
   * @param history - The history of messages so far (NOT including the current user message - past user messages are included)
   * @param clientRuntime - The file-system client runtime to use (e.g. VSCode, CLI)
   * @param promptSnippets - Prompt snippets to append
   */
  private async callAgent({
    chatId,
    history,
    clientRuntime,
    promptSnippets,
  }: {
    chatId: string;
    history?: History;
    clientRuntime: ClientRuntime;
    promptSnippets?: PromptSnippet[];
  }): Promise<void> {
    // Validate prerequisites
    if (!this.client) throw new Error('TRPC API client not initialized');

    if (!this.undoToolCallStack.has(chatId))
      this.undoToolCallStack.set(chatId, []);

    // Check recursion depth
    if (this.recursionDepth >= MAX_RECURSION_DEPTH) {
      const errorDesc = ErrorDescriptions.recursionDepthExceeded(
        this.recursionDepth,
        MAX_RECURSION_DEPTH,
      );
      this.setAgentWorking(false);
      this.karton?.setState((draft) => {
        draft.chats[chatId]!.error = {
          type: AgentErrorType.AGENT_ERROR,
          error: new Error(errorDesc),
        };
      });
      return;
    }

    this.recursionDepth++;

    try {
      const lastMessage = history?.at(-1);
      const isUserMessage = lastMessage?.metadata?.browserData !== undefined;
      const isFirstUserMessage =
        history?.filter((m) => m.metadata?.browserData !== undefined).length ===
        1;
      const lastMessageMetadata = isUserMessage
        ? {
            isUserMessage: true as const,
            message: lastMessage,
          }
        : {
            isUserMessage: false as const,
            message: lastMessage,
          };

      // Prepare update to the chat title
      if (isFirstUserMessage && lastMessageMetadata.isUserMessage) {
        this.client.chat.generateChatTitle
          .mutate({
            messages: history ?? [],
          })
          .then((result) => {
            this.karton?.setState((draft) => {
              // chat could've been deleted in the meantime
              const chatExists = draft.chats[chatId] !== undefined;
              if (chatExists) draft.chats[chatId]!.title = result.title;
            });
          })
          // ignore errors here, there's a default chat title
          .catch((_) => {});
      }

      // Emit prompt triggered event

      if (lastMessageMetadata.isUserMessage)
        this.eventEmitter.emit(
          EventFactories.agentPromptTriggered(
            lastMessageMetadata.message,
            promptSnippets?.length || 0,
          ),
        );

      const request = {
        messages: history ?? [],
        tools: mapZodToolsToJsonSchemaTools(this.tools),
        promptSnippets,
      };

      const agentResponse = await this.callAgentWithRetry(request);

      let lastResponse: LastResponse | undefined;

      try {
        await this.parseUiStream(
          agentResponse,
          (message) => {
            lastResponse = message;
          },
          (messageId) => {
            this.lastMessageId = messageId;
          },
        );
      } catch (error) {
        if (isAbortError(error)) return;
        throw error;
      }

      if (!lastResponse) throw new Error('Unknown error, please try again');

      const { toolCalls, credits } = lastResponse;

      this.karton?.setState((draft) => {
        if (draft.subscription)
          draft.subscription = {
            ...draft.subscription,
            credits: convertCreditsToSubscriptionCredits(credits),
          };
      });

      const toolResults = await processParallelToolCalls(
        toolCalls,
        this.tools,
        this.karton?.state.chats[chatId]!.messages ?? [],
        this.timeoutManager,
        (result) => {
          if (result.result?.undoExecute) {
            this.undoToolCallStack.get(chatId)?.push({
              toolName: result.toolName,
              toolCallId: result.toolCallId,
              undoExecute: result.result?.undoExecute,
            });
          }
          attachToolOutputToMessage(
            this.karton!,
            [result],
            this.lastMessageId!,
          );
        },
      );

      // Check if recursion is needed
      if (toolResults.length > 0) {
        return this.callAgent({
          chatId,
          history: this.karton?.state.chats[chatId]!.messages,
          clientRuntime,
          promptSnippets,
        });
      }

      // Clean up and finalize
      this.cleanupPendingOperations('Agent task completed successfully', false);
      return;
    } catch (error) {
      // If the user has aborted the agent, set the agent to idle
      if (isAbortError(error)) {
        this.setAgentWorking(false);
        return;
      }

      if (isInsufficientCreditsError(error)) {
        this.eventEmitter.emit(
          EventFactories.creditsInsufficient(this.karton?.state.subscription),
        );
        this.setAgentWorking(false);
        this.karton?.setState((draft) => {
          draft.chats[chatId]!.error = {
            type: AgentErrorType.INSUFFICIENT_CREDITS,
            error: new Error('Insufficient credits'),
          };
        });
        return;
      }

      const errorDesc = formatErrorDescription('Agent failed', error);
      this.setAgentWorking(false);
      this.karton?.setState((draft) => {
        draft.chats[chatId]!.error = {
          type: AgentErrorType.AGENT_ERROR,
          error: new Error(errorDesc),
        };
      });

      return;
    } finally {
      // Ensure recursion depth is decremented
      this.recursionDepth = Math.max(0, this.recursionDepth - 1);
    }
  }

  private async parseUiStream(
    uiStream: AsyncIterable<
      AsyncIterableItem<RouterOutputs['chat']['streamAgentCall']>
    >,
    onLastMessage: (message: LastResponse) => void,
    onNewMessage?: (messageId: string) => void,
  ) {
    let messageId = '';
    let partIndex = -1;
    const iterator = uiStream[Symbol.asyncIterator]();

    while (true) {
      const { done, value } = await iterator.next();
      if (done) {
        onLastMessage(value);
        break;
      } else {
        switch (value.type) {
          case 'start':
            messageId = value.messageId ?? randomUUID();
            partIndex++;
            onNewMessage?.(messageId);
            continue;
          case 'text-start':
            continue;
          case 'text-delta':
            appendTextDeltaToMessage(
              this.karton!,
              messageId,
              value.delta,
              partIndex,
            );
            continue;
          case 'tool-input-start':
            partIndex++;
            continue;
          case 'tool-input-delta':
          case 'tool-input-error':
            break; // Skipped for now
          case 'tool-input-available':
            appendToolInputToMessage(this.karton!, messageId, value, partIndex);
            continue;
          case 'tool-output-available':
            // Should not happen - we append the output and this message
            continue;
        }
      }
    }
  }

  /**
   * Undoes all tool calls until the user message is reached
   * @param userMessageId - The id of the user message
   * @param chatId - The id of the chat
   */
  private async undoToolCallsUntilUserMessage(
    userMessageId: string,
    chatId: string,
  ): Promise<void> {
    if (!this.undoToolCallStack.has(chatId)) return;
    const chat = this.karton?.state.chats[chatId];

    const history = chat?.messages ?? [];
    const userMessageIndex = history.findIndex(
      (m) => m.role === 'user' && 'id' in m && m.id === userMessageId,
    );

    // Get all messages that come after the user message
    const messagesAfterUserMessage =
      userMessageIndex !== -1 ? history.slice(userMessageIndex + 1) : [];

    const toolCallIdsAfterUserMessage: string[] = [];
    for (const message of messagesAfterUserMessage) {
      if (message.role !== 'assistant') continue;
      for (const content of message.parts)
        if (isToolCallType(content.type))
          toolCallIdsAfterUserMessage.push((content as ToolUIPart).toolCallId);
    }

    const idsAfter = new Set(toolCallIdsAfterUserMessage);

    while (
      this.undoToolCallStack.get(chatId)?.at(-1)?.toolCallId &&
      idsAfter.has(this.undoToolCallStack.get(chatId)?.at(-1)?.toolCallId!)
    ) {
      const undo = this.undoToolCallStack.get(chatId)?.pop();
      if (!undo) break;
      await undo.undoExecute?.();
    }

    // Keep messages up to user message
    this.karton?.setState((draft) => {
      if (userMessageIndex !== -1) {
        draft.chats[chatId]!.messages = history.slice(
          0,
          userMessageIndex,
        ) as any;
      }
    });
  }
}
