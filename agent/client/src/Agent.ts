import { tools as clientTools } from '@stagewise/agent-tools';
import type {
  CoreMessage,
  CoreAssistantMessage,
  CoreToolMessage,
  LanguageModelResponseMetadata,
} from 'ai';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import type { PromptSnippet } from '@stagewise/agent-types';
import type { Tools } from '@stagewise/agent-types';
import type {
  ChatUserMessage,
  AgentServer,
} from '@stagewise/agent-interface-internal/agent';
import {
  getProjectPath,
  getProjectInfo,
} from '@stagewise/agent-prompt-snippets';
import { createAuthenticatedClient } from './utils/create-authenticated-client.js';
import type {
  AppRouter,
  TRPCClient,
  RouterInputs,
  RouterOutputs,
} from '@stagewise/api-client';

// Import all the new utilities
import { countToolCalls } from './utils/message-utils.js';
import {
  TimeoutManager,
  consumeStreamWithTimeout,
} from './utils/stream-utils.js';
import {
  processParallelToolCalls,
  shouldRecurseAfterToolCall,
  type ToolCallProcessingResult,
} from './utils/tool-call-utils.js';
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
import { createAgentHook } from '@stagewise/agent-interface-internal/agent';

type ResponseMessage = (CoreAssistantMessage | CoreToolMessage) & {
  id: string;
};

// Type that represents what we actually get from tRPC (with serialized dates)
type Response = LanguageModelResponseMetadata & {
  messages: Array<ResponseMessage>;
};

type History = {
  messages: (CoreMessage | ChatUserMessage)[];
  chatId: string;
};

type Chats = Record<string, History>;

// Configuration constants
const DEFAULT_AGENT_TIMEOUT = 180000; // 3 minutes
const MAX_RECURSION_DEPTH = 20;
const STATE_RECOVERY_DELAY = 5000; // 5 seconds

export class Agent {
  private static instance: Agent;
  private server: AgentServer | null = null;
  private clientRuntime: ClientRuntime;
  private tools: Tools;
  private chats: Chats;
  private client: TRPCClient<AppRouter> | null = null;
  private accessToken: string | null = null;
  private eventEmitter: ReturnType<typeof createEventEmitter>;
  private isWorking = false;
  private agentDescription?: string;
  private timeoutManager: TimeoutManager;
  private recursionDepth = 0;
  private agentTimeout: number = DEFAULT_AGENT_TIMEOUT;
  private authRetryCount = 0;
  private maxAuthRetries = 2;
  private isExpressMode = false;
  private abortController: AbortController;
  private lastMessageId: string | null = null;
  // undo is only allowed for one chat at a time.
  // if the user switches to a new chat, the undo stack is cleared
  private undoToolCallStack: {
    chatId: string | null;
    stack: {
      toolName: string;
      toolCallId: string;
      undoExecute: () => Promise<void>;
    }[];
  } = {
    chatId: null,
    stack: [],
  };

  private constructor(config: {
    clientRuntime: ClientRuntime;
    tools: Tools;
    accessToken?: string;
    onEvent?: AgentEventCallback;
    agentDescription?: string;
    agentTimeout?: number;
  }) {
    this.clientRuntime = config.clientRuntime;
    this.tools = config.tools;
    this.accessToken = config.accessToken || null;
    this.eventEmitter = createEventEmitter(config.onEvent);
    this.chats = {}; // TODO: load chats from local storage
    this.client = createAuthenticatedClient(this.accessToken);
    this.agentDescription = config.agentDescription;
    this.agentTimeout = config.agentTimeout || DEFAULT_AGENT_TIMEOUT;
    this.timeoutManager = new TimeoutManager();
    this.abortController = new AbortController();
    this.lastMessageId = null;
  }

  public shutdown() {
    // Clean up all pending operations
    this.cleanupPendingOperations('Agent shutdown');

    // Close the server
    if (this.server?.standalone) {
      this.server.server.close();
    } else if (this.server && this.isExpressMode) {
      this.server.wss.close();
    }
  }

  /**
   * Validates a description to ensure it meets length constraints (3-128 characters)
   * @param description - The description to validate
   * @returns Valid description, truncated if needed, or undefined if invalid
   */
  private validateDescription(description?: string): string | undefined {
    if (!description || description.trim().length === 0) {
      return undefined;
    }

    const trimmed = description.trim();

    // If too short, return undefined
    if (trimmed.length < 3) {
      return undefined;
    }

    // If too long, truncate with ellipsis
    if (trimmed.length > 128) {
      const truncated = `${trimmed.substring(0, 125)}...`;
      return truncated;
    }

    return trimmed;
  }

  /**
   * Sets the agent state and emits a state change event
   * @param newState - The new state to set
   * @param description - Optional description of the state change
   */
  private setAgentWorking(isWorking: boolean, description?: string): void {
    if (!this.server) return;
    this.timeoutManager.clear('is-working');
    this.isWorking = isWorking;

    // Set automatic recovery for stuck states
    if (isWorking) {
      this.timeoutManager.set(
        'is-working',
        () => {
          this.setAgentWorking(false, 'Automatic recovery from stuck state');
        },
        this.agentTimeout,
      );
    }

    const validatedDescription = this.validateDescription(description);
    this.server.interface.chat.setWorkingState(
      this.isWorking,
      validatedDescription,
    );
    this.eventEmitter.emit(
      EventFactories.agentStateChanged(
        this.isWorking,
        !this.isWorking,
        description,
      ),
    );
  }

  /**
   * Reinitialize the TRPC client with fresh credentials
   * Call this after authentication changes
   * @param accessToken - The new access token
   */
  public async reauthenticateTRPCClient(accessToken: string) {
    this.accessToken = accessToken;
    this.client = createAuthenticatedClient(this.accessToken);
    // Reset auth retry count on successful reauth
    this.authRetryCount = 0;
  }

  /**
   * Calls the agent API with automatic retry on authentication failures
   * @param request - The request to call the agent API with
   * @returns The result of the agent API call
   */
  private async callAgentWithRetry(
    request: RouterInputs['chat']['callAgent'],
  ): Promise<RouterOutputs['chat']['callAgent']> {
    try {
      if (!this.client) {
        throw new Error('TRPC API client not initialized');
      }
      const result = await this.client.chat.callAgent.mutate(request, {
        signal: this.abortController.signal,
      });
      // Reset auth retry count on successful call
      this.authRetryCount = 0;
      return result;
    } catch (error) {
      // Check if it's an authentication error
      if (this.isAuthenticationError(error)) {
        if (this.authRetryCount < this.maxAuthRetries) {
          this.authRetryCount++;

          // Emit event to request token refresh
          this.eventEmitter.emit(
            EventFactories.authTokenRefreshRequired(
              'expired',
              this.authRetryCount,
              error instanceof Error ? error.message : String(error),
            ),
          );

          // Exponential backoff: 2s, 4s, 8s...
          const backoffDelay = Math.min(
            2000 * Math.pow(2, this.authRetryCount - 1),
            10000,
          );
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));

          // Retry the request
          return this.callAgentWithRetry(request);
        } else {
          // Max retries exceeded
          this.authRetryCount = 0;
          const errorDesc = ErrorDescriptions.authenticationFailed(
            error,
            this.maxAuthRetries,
          );
          throw new Error(errorDesc);
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
    reason?: string,
    resetRecursionDepth = true,
  ): void {
    // Clear all timeouts
    this.timeoutManager.clearAll();

    // Reset recursion depth if requested
    if (resetRecursionDepth) {
      this.recursionDepth = 0;
    }

    // Set state to IDLE
    this.setAgentWorking(false, reason || 'Cleanup pending operations');
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
    accessToken?: string;
    onEvent?: AgentEventCallback;
    agentDescription?: string;
    agentTimeout?: number;
  }) {
    const {
      clientRuntime,
      tools = clientTools(clientRuntime),
      accessToken,
      onEvent,
      agentDescription,
      agentTimeout,
    } = config;
    if (!Agent.instance) {
      Agent.instance = new Agent({
        clientRuntime,
        tools,
        accessToken,
        onEvent,
        agentDescription,
        agentTimeout,
      });
    }
    return Agent.instance;
  }

  /**
   * Initialize the agent by hooking into a user-provided Express server
   * @param expressApp - The Express application to hook into
   * @param pathPrefix - Optional path prefix for agent endpoints (default: '/agent')
   * @param httpServer - Optional HTTP server instance for WebSocket support
   */
  public async initialize(
    expressApp: Parameters<typeof createAgentHook>[0]['app'],
    httpServer: Parameters<typeof createAgentHook>[0]['server'],
    pathPrefix = '/agent',
  ): Promise<{
    wss: Awaited<ReturnType<typeof createAgentHook>>['wss'];
  }> {
    this.isExpressMode = true;
    this.server = await createAgentHook({
      app: expressApp,
      server: httpServer,
      wsPath: `${pathPrefix}/ws`,
      infoPath: `${pathPrefix}/info`,
      startServer: false,
    });
    if (!this.server) {
      throw new Error('Failed to create agent server');
    }
    this.server.setAgentName('stagewise agent');
    this.server.setAgentDescription(
      this.agentDescription || 'Your frontend and design agent',
    );

    this.setAgentWorking(false);

    const activeChatId =
      await this.server.interface.chat.createChat('New Chat');
    this.chats[activeChatId] = {
      messages: [],
      chatId: activeChatId,
    };
    await this.server.interface.chat.switchChat(activeChatId);

    this.server.interface.chat.addStopListener(() => {
      this.setAgentWorking(false, 'Agent stopped');
      this.abortController.abort();
      this.abortController = new AbortController();
    });

    this.server.interface.chat.addChatUpdateListener(async (update) => {
      switch (update.type) {
        case 'chat-created':
          this.chats[update.chat.id] = {
            messages: [],
            chatId: update.chat.id,
          };
          break;
        case 'message-added': {
          const chat = this.chats[update.chatId];
          if (!chat || update.message.role !== 'user') return;
          chat.messages.push(update.message);
          this.setAgentWorking(true);
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
            chatId: chat.chatId,
            history: chat.messages,
            clientRuntime: this.clientRuntime,
            promptSnippets,
          });
          break;
        }
        case 'message-updated':
          break;
        case 'messages-deleted':
          break;
        case 'chat-full-sync':
          break;
        case 'chat-list':
          break;
        case 'chat-switched':
          break;
        case 'chat-title-updated':
          break;
      }
    });

    return {
      wss: this.server!.wss,
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
    history?: (CoreMessage | ChatUserMessage)[];
    clientRuntime: ClientRuntime;
    promptSnippets?: PromptSnippet[];
  }): Promise<{
    response: Response;
    history: (CoreMessage | ChatUserMessage)[];
  }> {
    // Validate prerequisites
    if (!this.server) throw new Error('Agent not initialized');
    if (!this.client) throw new Error('TRPC API client not initialized');

    // Check recursion depth
    if (this.recursionDepth >= MAX_RECURSION_DEPTH) {
      const errorDesc = ErrorDescriptions.recursionDepthExceeded(
        this.recursionDepth,
        MAX_RECURSION_DEPTH,
      );
      // TODO: add an error message to the chat
      this.setAgentWorking(false, errorDesc);
      return {
        response: {} as Response,
        history: [],
      };
    }

    this.recursionDepth++;

    try {
      const lastMessage =
        'metadata' in (history?.at(-1) || {})
          ? {
              isUserMessage: true as const,
              message: history?.at(-1) as ChatUserMessage,
            }
          : {
              isUserMessage: false as const,
              message: history?.at(-1) as CoreMessage,
            };

      // Prepare update to the chat title
      if (lastMessage.isUserMessage) {
        this.client.chat.generateChatTitle
          .mutate({
            userMessage: {
              ...lastMessage.message,
              content: lastMessage.message.content.filter(
                (c) => c.type !== 'tool-approval',
              ),
            },
          })
          .then((result) => {
            this.server?.interface.chat.updateChatTitle(chatId, result.title);
          });
      }

      // Emit prompt triggered event

      if (lastMessage.isUserMessage)
        this.eventEmitter.emit(
          EventFactories.agentPromptTriggered(
            lastMessage.message,
            promptSnippets?.length || 0,
          ),
        );

      // Keeping compatibility with the old agent API
      const messages = (history ?? []).map((m) => {
        if (m.role === 'user' && 'metadata' in m) {
          return {
            ...m,
            content: m.content.filter((c) => c.type !== 'tool-approval'),
          };
        }
        return m;
      });

      // Call the agent API
      const startTime = Date.now();
      const request = {
        messages,
        tools: mapZodToolsToJsonSchemaTools(this.tools),
        promptSnippets,
      } as RouterInputs['chat']['callAgent'];

      const agentResponse = await this.callAgentWithRetry(request);

      if (agentResponse.syntheticToolCalls) {
        await this.processParallelToolCallsContent(
          agentResponse.syntheticToolCalls,
          history ?? [],
          {
            syntheticCall: true,
          },
        );
        return this.callAgent({
          chatId,
          history: history ?? [],
          clientRuntime,
          promptSnippets,
        });
      }

      const { fullStream, response } = agentResponse;

      this.setAgentWorking(true);

      // Start stream consumption with timeout protection
      const { messageId } = await consumeStreamWithTimeout(
        chatId,
        fullStream,
        this.server,
        this.agentTimeout,
        (messageId) => {
          console.log('New message with id ', messageId);
          this.lastMessageId = messageId;
        },
      );

      const r = await response; // this will throw an error if the user has aborted, will be handled in the catch below

      const responseTime = Date.now() - startTime;

      // Count and emit response metrics
      const { hasToolCalls, toolCallCount } = countToolCalls(r.messages);
      this.eventEmitter.emit(
        EventFactories.agentResponseReceived({
          messageCount: r.messages.length,
          hasToolCalls,
          toolCallCount,
          responseTime,
          credits: r.credits,
        }),
      );

      // Process response messages
      await this.processResponseMessages(
        r.messages,
        history ?? [],
        chatId,
        messageId,
      );

      // Check if recursion is needed
      if (shouldRecurseAfterToolCall(history ?? [])) {
        return this.callAgent({
          chatId,
          history: history ?? [],
          clientRuntime,
          promptSnippets,
        });
      }

      // Clean up and finalize
      this.cleanupPendingOperations('Agent task completed successfully', false);
      if (this.chats[chatId]) this.chats[chatId].messages = history ?? [];

      return {
        response: r,
        history: history ?? [],
      };
    } catch (error) {
      // If the user has aborted the agent, delete the last message
      if (error instanceof Error && error.name === 'AbortError') {
        if (this.lastMessageId)
          this.server?.interface.chat.deleteMessage(this.lastMessageId, chatId);
        this.setAgentWorking(false, 'Agent aborted by user');

        return {
          response: {} as Response,
          history: [],
        };
      }

      const errorDesc = formatErrorDescription('Agent task failed', error);
      this.setAgentWorking(false, errorDesc);

      // Reset to idle after delay
      setTimeout(() => {
        this.setAgentWorking(false);
      }, STATE_RECOVERY_DELAY);
      return {
        response: {} as Response,
        history: [],
      };
    } finally {
      // Ensure recursion depth is decremented
      this.recursionDepth = Math.max(0, this.recursionDepth - 1);
    }
  }

  /**
   * Processes response messages from the agent, handling text and tool calls
   * @param messages - The messages to process
   * @param history - The history of messages so far (NOT including the current assistant message - past assistant messages are included)
   * @param chatId - The id of the chat
   * @param messageId - The id of the message
   */
  private async processResponseMessages(
    messages: Array<ResponseMessage>,
    history: (CoreMessage | ChatUserMessage)[],
    chatId: string,
    messageId: string,
  ): Promise<void> {
    for (const message of messages) {
      const assistantMessage = {
        role: 'assistant' as const,
        content: [] as Exclude<CoreAssistantMessage['content'], string>,
      };
      if (Array.isArray(message.content)) {
        // Collect all tool calls from this message
        const toolCalls: Array<{
          toolName: string;
          toolCallId: string;
          args: any;
        }> = [];

        // Process text content immediately, collect tool calls
        for (const content of message.content) {
          if (content.type === 'text') {
            assistantMessage.content.push({
              type: 'text',
              text: content.text,
            });
          } else if (content.type === 'tool-call') {
            toolCalls.push({
              toolName: content.toolName,
              toolCallId: content.toolCallId,
              args: content.args,
            });
          }
        }

        // Add assistant message to history
        history.push(assistantMessage);

        // Process all tool calls together if any
        if (toolCalls.length > 0) {
          const results = await this.processParallelToolCallsContent(
            toolCalls,
            history,
            { chatId, messageId },
          );

          for (const result of results) {
            if (result.success) {
              if (result.result?.undoExecute) {
                if (this.undoToolCallStack.chatId !== chatId) {
                  this.undoToolCallStack.stack = [];
                  this.undoToolCallStack.chatId = chatId;
                }
                this.undoToolCallStack.stack.push({
                  toolName: result.toolName,
                  toolCallId: result.toolCallId,
                  undoExecute: result.result.undoExecute,
                });
              }
            }
          }
        }
      } else if (typeof message.content === 'string') {
        history.push({
          role: 'assistant',
          content: [{ type: 'text', text: message.content }],
        });
      }
    }
  }

  /**
   * Processes parallel tool calls from the response
   */
  private async processParallelToolCallsContent(
    toolCalls: Array<{
      toolName: string;
      toolCallId: string;
      args: any;
    }>,
    history: (CoreMessage | ChatUserMessage)[],
    options?: {
      syntheticCall?: boolean;
      chatId?: string;
      messageId?: string;
    },
  ): Promise<ToolCallProcessingResult[]> {
    const explanations = toolCalls
      .map((tc) => ('explanation' in tc.args ? tc.args.explanation : null))
      .filter((explanation) => explanation !== null);

    if (!options?.syntheticCall) {
      if (explanations.length > 0) {
        // Create a combined description that fits within limits
        let combinedDescription = explanations.join(', ');

        // If we have multiple explanations and the combined length might be too long,
        // use a summary format instead
        if (explanations.length > 1 && combinedDescription.length > 100) {
          combinedDescription = `Running ${explanations.length} tool operations`;

          // If even that's within limits, try to add the first explanation
          const firstExplanation = explanations[0];
          const withFirst = `${combinedDescription}: ${firstExplanation}`;
          if (withFirst.length <= 120) {
            combinedDescription = withFirst;
          }
        }

        this.setAgentWorking(true, combinedDescription);
      } else {
        this.setAgentWorking(true);
      }
    }

    // Emit events for each tool call
    for (const tc of toolCalls) {
      const tool = this.tools[tc.toolName];
      if (!tool) continue;

      this.eventEmitter.emit(
        EventFactories.toolCallRequested(
          tc.toolName,
          tool.stagewiseMetadata?.runtime !== 'browser',
          tool.stagewiseMetadata?.runtime === 'browser',
        ),
      );
    }

    // Process all tool calls
    const results = await processParallelToolCalls(
      toolCalls,
      this.tools,
      this.server!,
      history,
      (state, desc) => this.setAgentWorking(state, desc),
      this.timeoutManager,
      (result) => {
        this.eventEmitter.emit(
          EventFactories.toolCallCompleted(
            result.toolName,
            result.success,
            result.duration,
            result.error,
          ),
        );
      },
    );
    if (results.length > 0) {
      this.server?.interface.chat.addMessage(
        {
          id: crypto.randomUUID(),
          createdAt: new Date(),
          role: 'tool',
          content: results.map((r) => ({
            type: 'tool-result',
            toolCallId: r.toolCallId,
            toolName: r.toolName,
            output: r.result,
            isError: r.error === 'error',
          })),
        },
        options?.chatId,
      );
    }

    return results;
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
    if (this.undoToolCallStack.chatId !== chatId) return;
    const chat = this.chats[chatId];

    const reversedHistory = [...(chat?.messages ?? [])].reverse();
    const messagesBeforeUserMessage = reversedHistory.slice(
      reversedHistory.findIndex(
        (m) => m.role === 'user' && 'id' in m && m.id === userMessageId,
      ),
    );

    const toolCallIdsBeforeUserMessage: string[] = [];
    for (const message of messagesBeforeUserMessage) {
      if (message.role !== 'tool') continue;
      for (const content of message.content)
        toolCallIdsBeforeUserMessage.push(content.toolCallId);
    }

    while (
      this.undoToolCallStack.stack.at(-1)?.toolCallId &&
      toolCallIdsBeforeUserMessage.includes(
        this.undoToolCallStack.stack.at(-1)!.toolCallId,
      )
    ) {
      const undo = this.undoToolCallStack.stack.pop();
      if (!undo) break;
      await undo.undoExecute();
    }
  }
}
