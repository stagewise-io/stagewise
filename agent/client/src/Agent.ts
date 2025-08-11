import { tools as clientTools } from '@stagewise/agent-tools';
import type { KartonContract, History } from '@stagewise/karton-contract';
import {
  createKartonServer,
  type KartonServer,
} from '@stagewise/karton/server';
import {
  convertToModelMessages,
  type AssistantModelMessage,
  type ToolModelMessage,
  type LanguageModelResponseMetadata,
} from 'ai';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import type { PromptSnippet } from '@stagewise/agent-types';
import type { Tools } from '@stagewise/agent-types';
import { createAuthenticatedClient } from './utils/create-authenticated-client.js';
import type {
  AppRouter,
  TRPCClient,
  RouterInputs,
  RouterOutputs,
} from '@stagewise/api-client';

// Import all the new utilities
import { countToolCalls } from './utils/message-utils.js';
import { TimeoutManager } from './utils/stream-utils.js';
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
import type { createAgentHook } from '@stagewise/agent-interface-internal/agent';

type ResponseMessage = (AssistantModelMessage | ToolModelMessage) & {
  id: string;
};

// Type that represents what we actually get from tRPC (with serialized dates)
type Response = LanguageModelResponseMetadata & {
  messages: Array<ResponseMessage>;
};

// Configuration constants
const DEFAULT_AGENT_TIMEOUT = 180000; // 3 minutes
const MAX_RECURSION_DEPTH = 20;
const STATE_RECOVERY_DELAY = 5000; // 5 seconds

export class Agent {
  private static instance: Agent;
  private karton: KartonServer<KartonContract> | null = null;
  private clientRuntime: ClientRuntime;
  private tools: Tools;
  private client: TRPCClient<AppRouter> | null = null;
  private accessToken: string | null = null;
  private eventEmitter: ReturnType<typeof createEventEmitter>;
  private isWorking = false;
  private timeoutManager: TimeoutManager;
  private recursionDepth = 0;
  private agentTimeout: number = DEFAULT_AGENT_TIMEOUT;
  private authRetryCount = 0;
  private maxAuthRetries = 2;
  private abortController: AbortController;
  private lastUserMessageId: string | null = null;
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
    agentTimeout?: number;
  }) {
    this.clientRuntime = config.clientRuntime;
    this.tools = config.tools;
    this.accessToken = config.accessToken || null;
    this.eventEmitter = createEventEmitter(config.onEvent);
    this.client = createAuthenticatedClient(this.accessToken);
    this.agentTimeout = config.agentTimeout || DEFAULT_AGENT_TIMEOUT;
    this.timeoutManager = new TimeoutManager();
    this.abortController = new AbortController();
    this.lastUserMessageId = null;
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
    accessToken?: string;
    onEvent?: AgentEventCallback;
    agentTimeout?: number;
  }) {
    const {
      clientRuntime,
      tools = clientTools(clientRuntime),
      accessToken,
      onEvent,
      agentTimeout,
    } = config;
    if (!Agent.instance) {
      Agent.instance = new Agent({
        clientRuntime,
        tools,
        accessToken,
        onEvent,
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
  public async initialize(): Promise<{
    wss: Awaited<ReturnType<typeof createAgentHook>>['wss'];
  }> {
    this.karton = await createKartonServer<KartonContract>({
      procedures: {
        abortAgentCall: async () => {
          this.setAgentWorking(false);
          this.abortController.abort();
          this.abortController = new AbortController();
        },
        // TODO: fix the type here
      },
      initialState: {
        chats: {},
        isWorking: false,
        activeChatId: null,
        toolCallApprovalRequests: [],
      },
    });
    this.setAgentWorking(false);

    this.karton.setState((draft) => {
      const chatId = crypto.randomUUID();
      // Will look like this: "New Chat - Aug 10, 12:00 PM"
      const title = `New Chat - ${new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })}`;
      draft.chats[chatId] = {
        title,
        createdAt: new Date(),
        messages: [],
      };
      draft.activeChatId = chatId;
    });

    // this.server.interface.chat.addChatUpdateListener(async (update) => {
    //   switch (update.type) {
    //     case 'chat-created':
    //       this.chats[update.chat.id] = {
    //         messages: [],
    //         chatId: update.chat.id,
    //       };
    //       break;
    //     case 'message-added': {
    //       const chat = this.chats[update.chatId];
    //       if (!chat || update.message.role !== 'user') return;
    //       chat.messages.push(update.message);
    //       this.setAgentWorking(true);
    //       const promptSnippets: PromptSnippet[] = [];
    //       const projectPathPromptSnippet = await getProjectPath(
    //         this.clientRuntime,
    //       );
    //       if (projectPathPromptSnippet) {
    //         promptSnippets.push(projectPathPromptSnippet);
    //       }

    //       const projectInfoPromptSnippet = await getProjectInfo(
    //         this.clientRuntime,
    //       );
    //       if (projectInfoPromptSnippet) {
    //         promptSnippets.push(projectInfoPromptSnippet);
    //       }

    //       this.callAgent({
    //         chatId: chat.chatId,
    //         history: chat.messages,
    //         clientRuntime: this.clientRuntime,
    //         promptSnippets,
    //       });
    //       break;
    //     }
    //     case 'message-updated':
    //       break;
    //     case 'messages-deleted':
    //       break;
    //     case 'chat-full-sync':
    //       break;
    //     case 'chat-list':
    //       break;
    //     case 'chat-switched':
    //       break;
    //     case 'chat-title-updated':
    //       break;
    //   }
    // });

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
  }): Promise<{
    history: History;
  }> {
    // Validate prerequisites
    if (!this.client) throw new Error('TRPC API client not initialized');

    // Check recursion depth
    if (this.recursionDepth >= MAX_RECURSION_DEPTH) {
      const errorDesc = ErrorDescriptions.recursionDepthExceeded(
        this.recursionDepth,
        MAX_RECURSION_DEPTH,
      );
      // TODO: add an error message to the chat
      this.setAgentWorking(false);
      this.karton?.setState((draft) => {
        draft.chats[chatId]!.error = {
          type: 'agent-error',
          error: new Error(errorDesc),
        };
      });
      return {
        history: [],
      };
    }

    this.recursionDepth++;

    try {
      const lastMessage =
        'metadata' in (history?.at(-1) || {})
          ? {
              isUserMessage: true as const,
              message: history?.at(-1),
            }
          : {
              isUserMessage: false as const,
              message: history?.at(-1),
            };

      if (lastMessage.isUserMessage) {
        this.lastUserMessageId = lastMessage.message?.id ?? null;
      }

      // Prepare update to the chat title
      if (lastMessage.isUserMessage && lastMessage.message) {
        const content = convertToModelMessages([lastMessage.message])[0]!
          .content;
        this.client.chat.generateChatTitle
          .mutate({
            userMessage: {
              role: 'user',
              content:
                typeof content === 'string'
                  ? content
                  : content.map((c) =>
                      c.type === 'text'
                        ? { type: 'text', text: c.text }
                        : { type: 'text', text: '' },
                    ),
              metadata: lastMessage.message.metadata,
            },
          })
          .then((_result) => {
            // TODO: update the title
            // this.server?.interface.chat.updateChatTitle(chatId, result.title);
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

      // Call the agent API
      const startTime = Date.now();
      // TODO: fix this
      // const request = {
      //   messages: history ?? [],
      //   tools: mapZodToolsToJsonSchemaTools(this.tools),
      //   promptSnippets,
      // } as RouterInputs['chat']['callAgent'];
      const request = {
        messages: [],
        tools: mapZodToolsToJsonSchemaTools(this.tools),
        promptSnippets,
      };

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
      // const { messageId } = await consumeStreamWithTimeout(
      //   chatId,
      //   fullStream,
      //   this.karton!,
      //   this.agentTimeout,
      // );

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
      // await this.processResponseMessages(
      //   r.messages,
      //   history ?? [],
      //   chatId,
      //   messageId,
      // );

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
      this.karton?.setState((draft) => {
        if (draft.chats[chatId]) {
          // TODO: fix the type issue here
          // draft.chats[chatId]!.messages = history || [];
        }
      });

      return {
        // response: r,
        history: history ?? [],
      };
    } catch (error) {
      // If the user has aborted the agent, delete the last message
      if (error instanceof Error && error.name === 'AbortError') {
        // TODO: delete everything until the last user message
        this.setAgentWorking(false);

        return {
          // response: {} as Response,
          history: [],
        };
      }

      const errorDesc = formatErrorDescription('Agent task failed', error);
      this.setAgentWorking(false);
      this.karton?.setState((draft) => {
        draft.chats[chatId]!.error = {
          type: 'agent-error',
          error: new Error(errorDesc),
        };
      });

      // Reset to idle after delay
      setTimeout(() => {
        this.setAgentWorking(false);
      }, STATE_RECOVERY_DELAY);
      return {
        // response: {} as Response,
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
    history: History,
    chatId: string,
    messageId: string,
  ): Promise<void> {
    for (const message of messages) {
      const _assistantMessage = {
        role: 'assistant' as const,
        content: [] as Exclude<AssistantModelMessage['content'], string>,
      };
      if (Array.isArray(message.content)) {
        // Collect all tool calls from this message
        const toolCalls: Array<{
          toolName: string;
          toolCallId: string;
          args: any;
        }> = [];

        // Process text content immediately, collect tool calls
        // TODO: fix
        // for (const content of message.content) {
        //   if (content.type === 'text') {
        //     assistantMessage.content.push({
        //       type: 'text',
        //       text: content.text,
        //     });
        //   } else if (content.type === 'tool-call') {
        //     toolCalls.push({
        //       toolName: content.toolName,
        //       toolCallId: content.toolCallId,
        //       args: content.args,
        //     });
        //   }
        // }

        // Add assistant message to history
        // TODO: fix
        // history.push(assistantMessage);

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
        // history.push({
        //   role: 'assistant',
        //   content: [{ type: 'text', text: message.content }],
        // });
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
    history: History,
    options?: {
      syntheticCall?: boolean;
      chatId?: string;
      messageId?: string;
    },
  ): Promise<ToolCallProcessingResult[]> {
    const _explanations = toolCalls
      .map((tc) => ('explanation' in tc.args ? tc.args.explanation : null))
      .filter((explanation) => explanation !== null);

    if (!options?.syntheticCall) {
      this.setAgentWorking(true);
    } else {
      // Find a way to 'hide' synthetic tool calls
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
      this.karton!,
      history,
      (state) => this.setAgentWorking(state),
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
      // update the chat with the tool results
      this.karton?.setState((draft) => {
        draft.chats[options?.chatId!]!.messages.push(
          ...results.map((r) => ({
            role: 'tool' as const,
            content: [
              {
                type: 'tool-result' as const,
                toolCallId: r.toolCallId,
                toolName: r.toolName,
                result: r.result,
                isError: r.error === 'error',
              },
            ],
          })),
        );
      });
      // this.server?.interface.chat.addMessage(
      //   {
      //     id: crypto.randomUUID(),
      //     createdAt: new Date(),
      //     role: 'tool',
      //     content: results.map((r) => ({
      //       type: 'tool-result',
      //       toolCallId: r.toolCallId,
      //       toolName: r.toolName,
      //       output: r.result,
      //       isError: r.error === 'error',
      //     })),
      //   },
      //   options?.chatId,
      // );
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
    if (this.undoToolCallStack.chatId !== chatId) {
      // should never happen
      return;
    }
    const chat = this.karton?.state.chats[chatId];

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
