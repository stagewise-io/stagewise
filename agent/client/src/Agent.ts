import { tools as clientTools } from '@stagewise/agent-tools';
import type {
  CoreMessage,
  CoreAssistantMessage,
  CoreToolMessage,
  LanguageModelResponseMetadata,
} from 'ai';
import type {
  ChatUpdate,
  MessagePartUpdate,
  UserMessage as ChatUserMessage,
} from '@stagewise/agent-interface/agent';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import type { PromptSnippet } from '@stagewise/agent-types';
import type { Tools } from '@stagewise/agent-types';
import {
  AgentStateType,
  createAgentServer,
  createAgentHook,
  type UserMessage,
  type AgentServer,
  type Chat,
  type ChatMessage,
  type AssistantMessage,
  type ToolMessage,
  type TextPart,
  type ToolCallPart,
  type ToolResultPart,
} from '@stagewise/agent-interface-internal/agent';
import { getProjectPath } from '@stagewise/agent-prompt-snippets';
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
  withTimeout,
  TimeoutManager,
  consumeStreamWithTimeout,
} from './utils/stream-utils.js';
import {
  processParallelToolCalls,
  shouldRecurseAfterToolCall,
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

type ResponseMessage = (CoreAssistantMessage | CoreToolMessage) & {
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
  private server: AgentServer | null = null;
  private clientRuntime: ClientRuntime;
  private tools: Tools;
  private history: (CoreMessage | UserMessage)[];
  private client: TRPCClient<AppRouter> | null = null;
  private accessToken: string | null = null;
  private eventEmitter: ReturnType<typeof createEventEmitter>;
  private currentState?: AgentStateType;
  private agentDescription?: string;
  private timeoutManager: TimeoutManager;
  private recursionDepth = 0;
  private agentTimeout: number = DEFAULT_AGENT_TIMEOUT;
  private authRetryCount = 0;
  private maxAuthRetries = 2;
  private isExpressMode = false;
  private activeChatId: string | null = null;
  private currentAssistantMessageId: string | null = null;
  private currentMessagePartIndex = 0;

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
    this.history = [];
    this.client = createAuthenticatedClient(this.accessToken);
    this.agentDescription = config.agentDescription;
    this.agentTimeout = config.agentTimeout || DEFAULT_AGENT_TIMEOUT;
    this.timeoutManager = new TimeoutManager();
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
  private setAgentState(newState: AgentStateType, description?: string): void {
    if (!this.server) return;

    const previousState = this.currentState;
    this.currentState = newState;

    // Clear any existing state timeout
    this.timeoutManager.clear('current-state');

    // Set automatic recovery for stuck states
    if (
      newState === AgentStateType.WORKING ||
      newState === AgentStateType.CALLING_TOOL
    ) {
      this.timeoutManager.set(
        'current-state',
        () => {
          this.setAgentState(
            AgentStateType.IDLE,
            'Automatic recovery from stuck state',
          );
        },
        this.agentTimeout,
      );
    }

    const validatedDescription = this.validateDescription(description);
    if (validatedDescription) {
      this.server.interface.state.set(newState, validatedDescription);
    } else {
      this.server.interface.state.set(newState);
    }

    this.eventEmitter.emit(
      EventFactories.agentStateChanged(newState, previousState, description),
    );
  }

  /**
   * Reinitialize the TRPC client with fresh credentials
   * Call this after authentication changes
   */
  public async reauthenticateTRPCClient(accessToken: string) {
    this.accessToken = accessToken;
    this.client = createAuthenticatedClient(this.accessToken);
    // Reset auth retry count on successful reauth
    this.authRetryCount = 0;
  }

  /**
   * Calls the agent API with automatic retry on authentication failures
   */
  private async callAgentWithRetry(
    request: RouterInputs['agent']['callAgent'],
  ): Promise<RouterOutputs['agent']['callAgent']> {
    try {
      if (!this.client) {
        throw new Error('TRPC API client not initialized');
      }

      const result = await this.client.agent.callAgent.mutate(request);
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
    this.setAgentState(
      AgentStateType.IDLE,
      reason || 'Cleanup pending operations',
    );
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

  public async initialize() {
    this.server = await createAgentServer();
    this.server.setAgentName('stagewise agent');
    this.server.setAgentDescription(
      this.agentDescription || 'Your frontend and design agent',
    );

    this.server.interface.availability.set(true);
    this.setAgentState(AgentStateType.IDLE);

    // Initialize chat capability if available
    if (this.server.interface.chat) {
      // Create initial chat
      const chatId = await this.server.interface.chat.createChat();
      this.activeChatId = chatId;

      // Subscribe to chat updates would be done via subscriptions in real implementation
      // For now, we'll use messaging listener as a bridge
    } else {
      // Fallback to messaging for backward compatibility
      this.server.interface.messaging.addUserMessageListener(
        async (message) => {
          this.setAgentState(AgentStateType.WORKING);

          const promptSnippets: PromptSnippet[] = [];

          const projectPathPromptSnippet = await getProjectPath(
            this.clientRuntime,
          );
          if (projectPathPromptSnippet) {
            promptSnippets.push(projectPathPromptSnippet);
          }

          this.callAgent({
            history: this.history,
            clientRuntime: this.clientRuntime,
            userMessage: message,
            promptSnippets,
          });
        },
      );
    }
  }

  /**
   * Initialize the agent by hooking into a user-provided Express server
   * @param expressApp - The Express application to hook into
   * @param pathPrefix - Optional path prefix for agent endpoints (default: '/agent')
   * @param httpServer - Optional HTTP server instance for WebSocket support
   */
  public async initializeWithExpress(
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
    this.server.setAgentName('stagewise agent');
    this.server.setAgentDescription(
      this.agentDescription || 'Your frontend and design agent',
    );

    this.server.interface.availability.set(true);
    this.setAgentState(AgentStateType.IDLE);

    // Initialize chat capability if available
    if (this.server.interface.chat) {
      // Create initial chat
      const chatId = await this.server.interface.chat.createChat();
      this.activeChatId = chatId;

      // Subscribe to chat updates would be done via subscriptions in real implementation
      // For now, we'll use messaging listener as a bridge
    } else {
      // Fallback to messaging for backward compatibility
      this.server.interface.messaging.addUserMessageListener(
        async (message) => {
          this.setAgentState(AgentStateType.WORKING);

          const promptSnippets: PromptSnippet[] = [];

          const projectPathPromptSnippet = await getProjectPath(
            this.clientRuntime,
          );
          if (projectPathPromptSnippet) {
            promptSnippets.push(projectPathPromptSnippet);
          }
          this.callAgent({
            history: this.history,
            clientRuntime: this.clientRuntime,
            userMessage: message,
            promptSnippets,
          });
        },
      );
    }

    return {
      wss: this.server.wss,
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
    userMessage,
    history,
    clientRuntime,
    promptSnippets,
  }: {
    userMessage?: UserMessage;
    history?: (CoreMessage | UserMessage)[];
    clientRuntime: ClientRuntime;
    promptSnippets?: PromptSnippet[];
  }): Promise<{
    response: Promise<Response>;
    history: (CoreMessage | UserMessage)[];
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
      this.setAgentState(AgentStateType.FAILED, errorDesc);
      return {
        response: Promise.resolve({} as Response),
        history: [],
      };
    }

    this.recursionDepth++;

    try {
      // Initialize and prepare request
      if (this.server.interface.messaging) {
        this.server.interface.messaging.clear();
      }
      if (userMessage) history = [userMessage]; // For backward compatibility

      // Emit prompt triggered event
      this.eventEmitter.emit(
        EventFactories.agentPromptTriggered(
          userMessage,
          promptSnippets?.length || 0,
        ),
      );

      // Call the agent API
      const startTime = Date.now();
      const request = {
        messages: history ?? [],
        tools: mapZodToolsToJsonSchemaTools(this.tools),
        userMessageMetadata: userMessage?.metadata,
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
          history: history ?? [],
          clientRuntime,
          userMessage: undefined,
          promptSnippets,
        });
      }

      const { fullStream, response, finishReason } = agentResponse;

      this.setAgentState(AgentStateType.WORKING);

      // Start stream consumption with timeout protection
      const streamConsumptionPromise = this.consumeStreamWithChat(
        fullStream,
        this.server,
        this.agentTimeout,
        (state, desc) => this.setAgentState(state, desc),
      );

      streamConsumptionPromise.catch((_error) => {});

      // Wait for response with timeout
      const r = await withTimeout(
        response,
        this.agentTimeout,
        `Response timeout after ${this.agentTimeout}ms`,
      );

      const f = await finishReason;
      if (f === 'error') {
        throw new Error('Agent task failed');
      } else if (f === 'length') {
        throw new Error('Max tokens per request reached');
      } else if (f === 'content-filter') {
        throw new Error('Content needed to be filtered');
      }

      const responseTime = Date.now() - startTime;

      // Count and emit response metrics
      const { hasToolCalls, toolCallCount } = countToolCalls(r.messages);
      this.eventEmitter.emit(
        EventFactories.agentResponseReceived({
          messageCount: r.messages.length,
          hasToolCalls,
          toolCallCount,
          responseTime,
          reason: f,
          credits: r.credits,
        }),
      );

      // Process response messages
      await this.processResponseMessages(r.messages, history ?? []);

      // Check if recursion is needed
      if (shouldRecurseAfterToolCall(history ?? [])) {
        return this.callAgent({
          history: history ?? [],
          clientRuntime,
          userMessage: undefined,
          promptSnippets,
        });
      }

      // Clean up and finalize
      this.cleanupPendingOperations('Agent task completed successfully', false);
      this.history = history ?? [];

      return {
        response: response as Promise<Response>,
        history: history ?? [],
      };
    } catch (error) {
      const errorDesc = formatErrorDescription('Agent task failed', error);
      this.setAgentState(AgentStateType.FAILED, errorDesc);

      // Reset to idle after delay
      setTimeout(() => {
        if (
          this.server?.interface.state.get()?.state === AgentStateType.FAILED
        ) {
          this.setAgentState(AgentStateType.IDLE);
        }
      }, STATE_RECOVERY_DELAY);

      this.history = [];
      return {
        response: Promise.resolve({} as Response),
        history: [],
      };
    } finally {
      // Ensure recursion depth is decremented
      this.recursionDepth = Math.max(0, this.recursionDepth - 1);
    }
  }

  /**
   * Handles chat updates from the chat capability
   */
  private async handleChatUpdates(
    subscription: AsyncIterable<ChatUpdate>,
  ): Promise<void> {
    try {
      for await (const update of subscription) {
        switch (update.type) {
          case 'chat-created':
            this.activeChatId = update.chat.id;
            break;

          case 'chat-switched':
            this.activeChatId = update.chatId;
            break;

          case 'message-added':
            if (update.message.role === 'user') {
              // Handle new user message - convert from chat format to UserMessage
              const userMessage = update.message as any;
              await this.handleUserMessage(userMessage);
            }
            break;

          case 'message-updated':
            // Handle streaming updates
            this.handleMessageUpdate(update.update);
            break;
        }
      }
    } catch (error) {
      console.error('Error handling chat updates:', error);
    }
  }

  /**
   * Handles a new user message from chat
   */
  private async handleUserMessage(message: any): Promise<void> {
    if (!this.server || !this.activeChatId) return;

    this.setAgentState(AgentStateType.WORKING);

    const promptSnippets: PromptSnippet[] = [];
    const projectPathPromptSnippet = await getProjectPath(this.clientRuntime);
    if (projectPathPromptSnippet) {
      promptSnippets.push(projectPathPromptSnippet);
    }

    // Convert chat message to core message format for API
    const coreMessage: CoreMessage = {
      role: 'user',
      content: message.content.map((part: any) => {
        if (part.type === 'text') return { type: 'text', text: part.text };
        if (part.type === 'image') return { type: 'image', image: part.image };
        if (part.type === 'file')
          return { type: 'file', data: part.data, mimeType: part.mimeType };
        return part;
      }) as CoreMessage['content'],
    };

    // Get chat history from server
    const chatHistory = await this.getChatHistory();

    // Call the agent with the chat history
    await this.callAgent({
      history: chatHistory,
      clientRuntime: this.clientRuntime,
      userMessage: undefined, // Using history instead
      promptSnippets,
    });
  }

  /**
   * Gets the current chat history
   */
  private async getChatHistory(): Promise<CoreMessage[]> {
    if (!this.server?.interface.chat || !this.activeChatId) {
      return this.history;
    }

    // Get full chat from server - using getActiveChat since we don't have direct getChat method
    const activeChat = this.server.interface.chat.getActiveChat();
    if (activeChat) {
      // Convert chat messages to core messages
      return activeChat.messages.map((msg: any) => {
        if (msg.role === 'user') {
          const userMsg = msg;
          return {
            role: 'user' as const,
            content: userMsg.content.map((part: any) => {
              if (part.type === 'text')
                return { type: 'text' as const, text: part.text };
              if (part.type === 'image')
                return { type: 'image' as const, image: part.image };
              if (part.type === 'file')
                return {
                  type: 'file' as const,
                  data: part.data,
                  mimeType: part.mimeType,
                };
              return part;
            }) as CoreMessage['content'],
          };
        } else if (msg.role === 'assistant') {
          const assistantMsg = msg;
          return {
            role: 'assistant' as const,
            content: assistantMsg.content.map((part: any) => {
              if (part.type === 'text')
                return { type: 'text' as const, text: part.text };
              if (part.type === 'tool-call') {
                return {
                  type: 'tool-call' as const,
                  toolName: part.toolName,
                  toolCallId: part.toolCallId,
                  args: part.args,
                };
              }
              return part;
            }) as CoreMessage['content'],
          };
        } else if (msg.role === 'tool') {
          const toolMsg = msg;
          return {
            role: 'tool' as const,
            content: toolMsg.content.map((part: any) => ({
              type: 'tool-result' as const,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              result: part.result,
              isError: part.isError,
            })) as CoreMessage['content'],
          };
        }
        return msg as CoreMessage;
      });
    }

    return this.history;
  }

  /**
   * Handles streaming message updates
   */
  private handleMessageUpdate(update: MessagePartUpdate): void {
    if (!this.server?.interface.chat) return;

    // Track the current message being streamed
    if (update.messageId !== this.currentAssistantMessageId) {
      this.currentAssistantMessageId = update.messageId;
      this.currentMessagePartIndex = 0;
    }

    // Stream the update to the chat interface
    if (update.updateType === 'create' || update.updateType === 'replace') {
      this.currentMessagePartIndex = update.partIndex;
    }
  }

  /**
   * Consumes stream and sends updates to chat interface
   */
  private async consumeStreamWithChat(
    fullStream: AsyncIterable<any>,
    server: AgentServer,
    timeout: number,
    setAgentState: (state: AgentStateType, desc?: string) => void,
  ): Promise<void> {
    if (server.interface.chat && this.activeChatId) {
      // Create assistant message in chat
      const messageId = `msg-${Date.now()}`;
      this.currentAssistantMessageId = messageId;
      this.currentMessagePartIndex = 0;

      // Add initial assistant message
      const assistantMessage: AssistantMessage = {
        id: messageId,
        role: 'assistant',
        content: [],
        createdAt: new Date(),
      };
      server.interface.chat.addMessage(assistantMessage);

      // Stream updates
      for await (const chunk of fullStream) {
        if (chunk.type === 'text-delta') {
          // Stream text updates directly
          if (this.currentMessagePartIndex === 0) {
            server.interface.chat.updateMessage(messageId, [
              {
                type: 'text',
                text: chunk.textDelta,
              },
            ]);
          } else {
            // Append to existing text
            const currentMessage = server.interface.chat
              .getActiveChat()
              ?.messages.find((m: any) => m.id === messageId);
            if (
              currentMessage &&
              currentMessage.content[this.currentMessagePartIndex]
            ) {
              currentMessage.content[this.currentMessagePartIndex].text +=
                chunk.textDelta;
              server.interface.chat.updateMessage(
                messageId,
                currentMessage.content,
              );
            }
          }
        } else if (chunk.type === 'tool-call') {
          this.currentMessagePartIndex++;
          // Add tool call to message
          const currentMessage = server.interface.chat
            .getActiveChat()
            ?.messages.find((m: any) => m.id === messageId);
          if (currentMessage) {
            currentMessage.content.push({
              type: 'tool-call',
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              args: chunk.args,
              requiresApproval: false,
            });
            server.interface.chat.updateMessage(
              messageId,
              currentMessage.content,
            );
          }
        }
      }
    } else {
      // Fallback to original stream consumption
      await consumeStreamWithTimeout(
        fullStream,
        server,
        timeout,
        setAgentState,
      );
    }
  }

  /**
   * Processes response messages from the agent, handling text and tool calls
   */
  private async processResponseMessages(
    messages: Array<ResponseMessage>,
    history: (CoreMessage | UserMessage)[],
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

        // Add to chat if using chat capability
        if (this.server?.interface.chat && this.activeChatId) {
          // Create chat message
          const chatMessage: AssistantMessage = {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: assistantMessage.content.map((part) => {
              if (part.type === 'text') {
                return { type: 'text' as const, text: part.text };
              } else if (part.type === 'tool-call') {
                return {
                  type: 'tool-call' as const,
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  args: part.args,
                  requiresApproval: false,
                };
              }
              return part;
            }) as AssistantMessage['content'],
            createdAt: new Date(),
          };

          this.server.interface.chat.addMessage(chatMessage);
        }

        // Process all tool calls together if any
        if (toolCalls.length > 0) {
          await this.processParallelToolCallsContent(toolCalls, history);
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
    history: (CoreMessage | UserMessage)[],
    options?: {
      syntheticCall?: boolean;
    },
  ): Promise<void> {
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

        this.setAgentState(AgentStateType.CALLING_TOOL, combinedDescription);
      } else {
        this.setAgentState(AgentStateType.CALLING_TOOL);
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
    await processParallelToolCalls(
      toolCalls,
      this.tools,
      this.server!,
      history,
      (state, desc) => this.setAgentState(state, desc),
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

    // Add tool results to chat if using chat capability
    if (
      this.server?.interface.chat &&
      this.activeChatId &&
      !options?.syntheticCall
    ) {
      for (const tc of toolCalls) {
        const toolResult = history.find(
          (msg): msg is CoreToolMessage =>
            msg.role === 'tool' &&
            Array.isArray(msg.content) &&
            msg.content.some((r: any) => r.toolCallId === tc.toolCallId),
        );

        if (toolResult) {
          const toolMessage: ToolMessage = {
            id: `tool-${Date.now()}-${tc.toolCallId}`,
            role: 'tool',
            content: toolResult.content.map((r: any) => ({
              toolCallId: r.toolCallId,
              toolName: r.toolName,
              result: r.result,
              isError: r.isError || false,
            })),
            createdAt: new Date(),
          };

          this.server.interface.chat.addMessage(toolMessage);
        }
      }
    }

    // Update history for browser tools
    const hasBrowserTools = toolCalls.some(
      (tc) => this.tools[tc.toolName]?.stagewiseMetadata?.runtime === 'browser',
    );
    if (hasBrowserTools) {
      this.history = history;
    }
  }
}
