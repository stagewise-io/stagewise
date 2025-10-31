import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { isContextLimitError } from '@stagewise/agent-utils';
import type { KartonService } from '../../../karton';
import type { Logger } from '../../../logger';
import type { TelemetryService } from '../../../telemetry';
import type { AuthService } from '../../../auth';
import {
  TimeoutManager,
  isAbortError,
  isAuthenticationError,
  ErrorDescriptions,
  formatErrorDescription,
  attachToolOutputToMessage,
  createAndActivateNewChat,
  findPendingToolCalls,
  uiMessagesToModelMessages,
  processToolCalls,
  type ToolCallProcessingResult,
  generateChatTitle,
  isPlanLimitsExceededError,
  type PlanLimitsExceededError,
  createAuthenticatedClient,
  type KartonStateProvider,
  getContextFileFromSelectedElement,
  extractDetailsFromError,
} from '@stagewise/agent-utils';
import { hasUndoMetadata, hasDiffMetadata } from '@stagewise/agent-types';
import {
  type KartonContract,
  type History,
  type ChatMessage,
  AgentErrorType,
  Layout,
  MainTab,
} from '@stagewise/karton-contract';
import {
  type AnthropicProviderOptions,
  createAnthropic,
} from '@ai-sdk/anthropic';
import {
  codingAgentTools,
  inspirationAgentTools,
  setupAgentTools,
  toolsWithoutExecute,
  type UITools,
  type AllTools,
  type InspirationComponent,
} from '@stagewise/agent-tools';
import { streamText, generateId, readUIMessageStream } from 'ai';
import { XMLPrompts } from '@stagewise/agent-prompts';
import type { PromptSnippet } from '@stagewise/agent-types';
import type { AppRouter, TRPCClient } from '@stagewise/api-client';
import {
  getProjectInfo,
  getProjectPath,
} from '@stagewise/agent-prompt-snippets';
import type { AsyncIterableStream, InferUIMessageChunk, ToolUIPart } from 'ai';
import type { WorkspaceSetupService } from '../setup';
import { compileInspirationComponent } from './utils/compile-inspiration-component';

type ToolCallType = 'dynamic-tool' | `tool-${string}`;

function isToolCallType(type: string): type is ToolCallType {
  return type === 'dynamic-tool' || type.startsWith('tool-');
}

type ChatId = string;

// Configuration constants
const DEFAULT_AGENT_TIMEOUT = 180000; // 3 minutes
const MAX_RECURSION_DEPTH = 20;

export class AgentService {
  private logger: Logger;
  private telemetryService: TelemetryService;
  private kartonService: KartonService;
  private authService: AuthService;
  private workspaceSetupService: WorkspaceSetupService;
  private workspaceDataPath: string;
  private clientRuntime: ClientRuntime;
  private apiKey: string | null = null;

  private client!: TRPCClient<AppRouter>;
  private isWorking = false;
  private timeoutManager: TimeoutManager;
  private recursionDepth = 0;
  private agentTimeout: number = DEFAULT_AGENT_TIMEOUT;
  private authRetryCount = 0;
  private maxAuthRetries = 2;
  private abortController: AbortController;
  private lastMessageId: string | null = null;
  private litellm!: ReturnType<typeof createAnthropic>;
  private undoToolCallStack: Map<
    ChatId,
    {
      toolCallId: string;
      undoExecute?: () => Promise<void>;
    }[]
  > = new Map();

  private constructor(
    logger: Logger,
    telemetryService: TelemetryService,
    kartonService: KartonService,
    authService: AuthService,
    clientRuntime: ClientRuntime,
    workspaceSetupService: WorkspaceSetupService,
    workspaceDataPath: string,
  ) {
    this.logger = logger;
    this.telemetryService = telemetryService;
    this.kartonService = kartonService;
    this.authService = authService;
    this.clientRuntime = clientRuntime;
    this.workspaceSetupService = workspaceSetupService;
    this.workspaceDataPath = workspaceDataPath;
    this.kartonService.setState((draft) => {
      if (!draft.workspace?.agentChat) {
        draft.workspace!.agentChat = {
          chats: {},
          activeChatId: null,
          toolCallApprovalRequests: [],
          isWorking: false,
        };
      }
    });

    // Initialize timeout manager
    this.timeoutManager = new TimeoutManager();

    // Initialize abort controller
    this.abortController = new AbortController();
    this.abortController.signal.addEventListener(
      'abort',
      () => {
        const activeChatId =
          this.kartonService.state.workspace?.agentChat?.activeChatId;
        if (!activeChatId) return;

        this.cleanupPendingOperations(
          'Agent call aborted',
          false,
          activeChatId,
        );
      },
      { once: true },
    );
  }

  private getTools(): AllTools {
    const currentTab = this.getCurrentTab();
    switch (currentTab) {
      case Layout.SETUP_WORKSPACE:
        return setupAgentTools(this.clientRuntime, {
          onSaveInformation: async (params) => {
            this.logger.debug(
              '[AgentService] Saving information for workspace setup',
            );
            this.workspaceSetupService.handleSetupSubmission({
              agentAccessPath: params.agentAccessPath,
              useAutoFoundAppPort: true,
              appPort: params.appPort,
              appPath: params.appPath,
            });
            // TODO: Call GlobalService
          },
        });
      case MainTab.DEV_APP_PREVIEW:
        return codingAgentTools(this.clientRuntime);
      case MainTab.IDEATION_CANVAS: {
        if (!this.apiKey) throw new Error('No API key available');
        return inspirationAgentTools(
          this.clientRuntime,
          this.telemetryService.withTracing(this.litellm('claude-haiku-4-5'), {
            posthogProperties: {
              $ai_span_name: 'inspiration-agent',
              developerTag: process.env.DEVELOPER_TAG || undefined,
            },
          }),
          {
            onGenerated: async (component) => {
              let componentWithCompiledCode: InspirationComponent;
              try {
                componentWithCompiledCode = await compileInspirationComponent(
                  component,
                  this.logger,
                );
              } catch (error) {
                componentWithCompiledCode = {
                  ...component,
                  compiledCode: `export default function ErrorComponent() {
                    return <div>
                      Error compiling component.
                      ${error instanceof Error ? error.message : 'Unknown error'}
                    </div>
                  }`,
                };
              }

              this.kartonService.setState((draft) => {
                if (draft.workspace?.inspirationComponents) {
                  draft.workspace.inspirationComponents.push(
                    componentWithCompiledCode,
                  );
                }
              });
              this.logger.debug(
                '[AgentService] Inspiration component generated',
              );
            },
          },
        );
      }
      default:
        return codingAgentTools(this.clientRuntime);
    }
  }

  private async initializeLitellm() {
    const LLM_PROXY_URL =
      process.env.LLM_PROXY_URL || 'https://llm.stagewise.io';

    const tokens = await this.authService.getToken();
    if (!tokens) {
      throw new Error('No authentication tokens available');
    }

    this.apiKey = tokens.accessToken;

    this.litellm = createAnthropic({
      baseURL: `${LLM_PROXY_URL}/v1`,
      apiKey: tokens.accessToken,
    });
  }

  private async initializeClient() {
    await this.authService.refreshAuthData();
    const tokens = await this.authService.getToken();
    if (!tokens) {
      throw new Error('No authentication tokens available');
    }

    this.client = createAuthenticatedClient(tokens.accessToken);
  }

  private setAgentWorking(isWorking: boolean): void {
    this.timeoutManager.clear('is-working');
    const wasWorking = this.isWorking;
    this.isWorking = isWorking;

    if (isWorking) {
      this.timeoutManager.set(
        'is-working',
        () => {
          this.setAgentWorking(false);
        },
        this.agentTimeout,
      );
    }

    this.kartonService.setState((draft) => {
      if (draft.workspace?.agentChat) {
        draft.workspace.agentChat.isWorking = isWorking;
      }
    });

    // Emit telemetry event
    this.telemetryService.capture('agent-state-changed', {
      isWorking,
      wasWorking,
    });
  }

  private cleanupPendingOperations(
    _reason?: string,
    resetRecursionDepth = true,
    chatId?: string,
  ): void {
    if (chatId && this.lastMessageId) {
      const pendingToolCalls = findPendingToolCalls(
        this.kartonService as KartonStateProvider<KartonContract['state']>,
        chatId,
      );
      if (pendingToolCalls.length > 0) {
        const abortedResults: ToolCallProcessingResult<any>[] =
          pendingToolCalls.map(({ toolCallId }) => ({
            success: false,
            toolCallId,
            duration: 0,
            error: {
              type: 'error' as const,
              message: 'Tool execution aborted by user',
            },
          }));

        attachToolOutputToMessage(
          this.kartonService as KartonStateProvider<KartonContract['state']>,
          abortedResults,
          this.lastMessageId,
        );
      }
    }

    this.timeoutManager.clearAll();

    if (resetRecursionDepth) {
      this.recursionDepth = 0;
    }

    this.setAgentWorking(false);
  }

  public async initialize() {
    this.logger.debug('[AgentService] Initializing...');

    // Initialize client and litellm
    await this.initializeClient();
    await this.initializeLitellm();

    // Register all karton procedure handlers
    this.registerProcedureHandlers();

    // Fetch subscription
    await this.fetchSubscription();

    // Set initial state
    this.setAgentWorking(false);
    createAndActivateNewChat(
      this.kartonService as KartonStateProvider<KartonContract['state']>,
    );

    this.logger.debug('[AgentService] Initialized');
  }

  private registerProcedureHandlers() {
    // Agent Chat procedures
    try {
      this.kartonService.registerServerProcedureHandler(
        'agentChat.undoToolCallsUntilUserMessage',
        async (userMessageId: string, chatId: string) => {
          await this.undoToolCallsUntilUserMessage(userMessageId, chatId);
        },
      );

      this.kartonService.registerServerProcedureHandler(
        'agentChat.undoToolCallsUntilLatestUserMessage',
        async (chatId: string): Promise<ChatMessage | null> => {
          return await this.undoToolCallsUntilLatestUserMessage(chatId);
        },
      );

      this.kartonService.registerServerProcedureHandler(
        'agentChat.retrySendingUserMessage',
        async () => {
          this.setAgentWorking(true);
          const activeChatId =
            this.kartonService.state.workspace?.agentChat?.activeChatId;
          if (!activeChatId) return;

          this.kartonService.setState((draft) => {
            const chat = draft.workspace?.agentChat?.chats[activeChatId];
            if (chat) {
              chat.error = undefined;
            }
          });

          const promptSnippets: PromptSnippet[] = [];
          const projectInfoPromptSnippet = await getProjectInfo(
            this.clientRuntime,
          );
          if (projectInfoPromptSnippet) {
            promptSnippets.push(projectInfoPromptSnippet);
          }

          const messages =
            this.kartonService.state.workspace?.agentChat?.chats[activeChatId]
              ?.messages;
          await this.callAgent({
            chatId: activeChatId,
            history: messages,
            clientRuntime: this.clientRuntime,
            promptSnippets,
          });

          this.setAgentWorking(false);
        },
      );

      this.kartonService.registerServerProcedureHandler(
        'agentChat.abortAgentCall',
        async () => {
          const activeChatId =
            this.kartonService.state.workspace?.agentChat?.activeChatId;
          if (!activeChatId) return;

          this.abortController.abort();
          this.abortController = new AbortController();
          this.abortController.signal.addEventListener(
            'abort',
            () => {
              const chatId =
                this.kartonService.state.workspace?.agentChat?.activeChatId;
              if (chatId) {
                this.cleanupPendingOperations(
                  'Agent call aborted',
                  false,
                  chatId,
                );
              }
            },
            { once: true },
          );
        },
      );

      this.kartonService.registerServerProcedureHandler(
        'agentChat.approveToolCall',
        async (_toolCallId: string, _callingClientId: string) => {
          // Implementation TBD
        },
      );

      this.kartonService.registerServerProcedureHandler(
        'agentChat.rejectToolCall',
        async (_toolCallId: string, _callingClientId: string) => {
          // Implementation TBD
        },
      );

      this.kartonService.registerServerProcedureHandler(
        'agentChat.create',
        async () => {
          return createAndActivateNewChat(
            this.kartonService as KartonStateProvider<KartonContract['state']>,
          );
        },
      );

      this.kartonService.registerServerProcedureHandler(
        'agentChat.switch',
        async (chatId: string, _callingClientId: string) => {
          this.kartonService.setState((draft) => {
            if (draft.workspace?.agentChat) {
              draft.workspace.agentChat.activeChatId = chatId;
            }
          });

          const chats = this.kartonService.state.workspace?.agentChat?.chats;
          if (chats) {
            Object.entries(chats).forEach(([id, chat]) => {
              if (chat.messages.length === 0 && id !== chatId) {
                this.kartonService.setState((draft) => {
                  if (draft.workspace?.agentChat?.chats[id]) {
                    delete draft.workspace.agentChat?.chats[id];
                  }
                });
              }
            });
          }
        },
      );

      this.kartonService.registerServerProcedureHandler(
        'agentChat.delete',
        async (chatId: string, _callingClientId: string) => {
          const activeChatId =
            this.kartonService.state.workspace?.agentChat?.activeChatId;
          if (!activeChatId) return;

          if (activeChatId === chatId) {
            const chats = this.kartonService.state.workspace?.agentChat?.chats;
            const nextChatId = Object.keys(chats || {}).find(
              (id) => id !== chatId,
            );

            if (!nextChatId) {
              createAndActivateNewChat(
                this.kartonService as KartonStateProvider<
                  KartonContract['state']
                >,
              );
            } else {
              this.kartonService.setState((draft) => {
                if (draft.workspace?.agentChat) {
                  draft.workspace.agentChat.activeChatId = nextChatId;
                }
              });
            }
          }

          this.kartonService.setState((draft) => {
            if (draft.workspace?.agentChat?.chats[chatId]) {
              delete draft.workspace.agentChat?.chats[chatId];
            }
          });
        },
      );

      this.kartonService.registerServerProcedureHandler(
        'agentChat.sendUserMessage',
        async (message: ChatMessage, _callingClientId: string) => {
          this.logger.debug('[AgentService] Sending user message');
          const activeChatId =
            this.kartonService.state.workspace?.agentChat?.activeChatId;
          if (!activeChatId) return;
          const pendingToolCalls = findPendingToolCalls(
            this.kartonService as KartonStateProvider<KartonContract['state']>,
            activeChatId,
          );
          const codeMetadata = message.metadata?.selectedPreviewElements?.map(
            (element) => element.codeMetadata,
          );
          this.logger.debug(
            `[AgentService] Code metadata: ${JSON.stringify(codeMetadata)}`,
          );
          // User-Interaction tool calls could still have open inputs - cancel them
          if (pendingToolCalls.length > 0) {
            pendingToolCalls.forEach(({ toolCallId }) => {
              attachToolOutputToMessage(
                this.kartonService as KartonStateProvider<
                  KartonContract['state']
                >,
                [
                  {
                    success: false,
                    toolCallId,
                    duration: 0,
                    error: {
                      type: 'error' as const,
                      message: 'Tool execution skipped by user',
                    },
                  },
                ],
                this.lastMessageId!,
              );
            });
          }

          this.setAgentWorking(true);

          const newstate = this.kartonService.setState((draft) => {
            const chat = draft.workspace?.agentChat?.chats[activeChatId];
            if (chat) {
              chat.messages.push({
                ...message,
                metadata: {
                  ...message.metadata,
                  currentTab: this.getCurrentTab(),
                },
              } as any);
              chat.error = undefined;
            }
          });

          const messages =
            newstate?.workspace?.agentChat?.chats[activeChatId]?.messages;

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

          this.logger.debug('[AgentService] Calling agent');

          await this.callAgent({
            chatId: activeChatId,
            history: messages,
            clientRuntime: this.clientRuntime,
            promptSnippets,
          });
        },
      );

      this.kartonService.registerServerProcedureHandler(
        'agentChat.submitUserInteractionToolInput',
        async (toolCallId, input) => {
          const { type: _, ...cleanInput } = input;
          // Find tool call with state 'input-available' and the toolCallId and attach the output
          attachToolOutputToMessage(
            this.kartonService as KartonStateProvider<KartonContract['state']>,
            [
              {
                success: true,
                toolCallId,
                result: cleanInput,
                duration: 0,
              },
            ],
            this.lastMessageId!,
          );
          const pendingToolCalls = findPendingToolCalls(
            this.kartonService as KartonStateProvider<KartonContract['state']>,
            this.kartonService.state.workspace?.agentChat?.activeChatId!,
          );
          if (pendingToolCalls.length > 0) return { success: true }; // Other tool calls are still pending - only call agent on the last submission
          this.setAgentWorking(true);
          this.callAgent({
            chatId:
              this.kartonService.state.workspace?.agentChat?.activeChatId!,
            history:
              this.kartonService.state.workspace?.agentChat?.chats[
                this.kartonService.state.workspace?.agentChat?.activeChatId!
              ]?.messages,
            clientRuntime: this.clientRuntime,
            promptSnippets: [],
          });
          return { success: true };
        },
      );

      this.kartonService.registerServerProcedureHandler(
        'agentChat.cancelUserInteractionToolInput',
        async (toolCallId: string) => {
          attachToolOutputToMessage(
            this.kartonService as KartonStateProvider<KartonContract['state']>,
            [
              {
                success: false,
                toolCallId,
                duration: 0,
                error: {
                  type: 'error' as const,
                  message: 'Tool execution cancelled by user',
                },
              },
            ],
            this.lastMessageId!,
          );
          this.setAgentWorking(true);
          this.callAgent({
            chatId:
              this.kartonService.state.workspace?.agentChat?.activeChatId!,
            history:
              this.kartonService.state.workspace?.agentChat?.chats[
                this.kartonService.state.workspace?.agentChat?.activeChatId!
              ]?.messages,
            clientRuntime: this.clientRuntime,
            promptSnippets: [],
          });
        },
      );

      this.kartonService.registerServerProcedureHandler(
        'agentChat.assistantMadeCodeChangesUntilLatestUserMessage',
        async (chatId: string) => {
          return await this.assistantMadeCodeChangesUntilLatestUserMessage(
            chatId,
          );
        },
      );

      this.kartonService.registerServerProcedureHandler(
        'agentChat.getContextElementFile',
        async (element) => {
          const file = await getContextFileFromSelectedElement(
            element,
            this.apiKey!,
            this.workspaceDataPath,
            this.telemetryService.withTracing(
              this.litellm('gemini-2.5-flash-lite'),
              {
                posthogProperties: {
                  $ai_span_name: 'get-context-element-file',
                },
              },
            ),
            this.clientRuntime,
            (error) => {
              this.logger.error(
                `[AgentService] Failed to get context element file: ${error}`,
              );
            },
          );
          if ('error' in file) return file;
          this.logger.debug(
            `[AgentService] Get context element file: ${file.relativePath} - ${file.startLine} - ${file.endLine}`,
          );

          const fileContent = await this.clientRuntime.fileSystem.readFile(
            file.relativePath,
          );
          return {
            relativePath: file.relativePath,
            startLine: file.startLine,
            endLine: file.endLine,
            content: fileContent.content,
          };
        },
      );

      this.kartonService.registerServerProcedureHandler(
        'userAccount.refreshSubscription',
        async () => {
          await this.fetchSubscription();
        },
      );
    } catch (error) {
      this.logger.error(
        `[AgentService] Failed to register server procedure handlers ${error}`,
        {
          cause: error,
        },
      );
    }
  }

  private removeServerProcedureHandlers() {
    this.kartonService.removeServerProcedureHandler(
      'agentChat.undoToolCallsUntilUserMessage',
    );
    this.kartonService.removeServerProcedureHandler(
      'agentChat.submitUserInteractionToolInput',
    );
    this.kartonService.removeServerProcedureHandler(
      'agentChat.cancelUserInteractionToolInput',
    );
    this.kartonService.removeServerProcedureHandler(
      'agentChat.undoToolCallsUntilLatestUserMessage',
    );
    this.kartonService.removeServerProcedureHandler(
      'agentChat.retrySendingUserMessage',
    );
    this.kartonService.removeServerProcedureHandler('agentChat.abortAgentCall');
    this.kartonService.removeServerProcedureHandler(
      'agentChat.approveToolCall',
    );
    this.kartonService.removeServerProcedureHandler('agentChat.rejectToolCall');
    this.kartonService.removeServerProcedureHandler('agentChat.create');
    this.kartonService.removeServerProcedureHandler('agentChat.switch');
    this.kartonService.removeServerProcedureHandler('agentChat.delete');
    this.kartonService.removeServerProcedureHandler(
      'agentChat.sendUserMessage',
    );
    this.kartonService.removeServerProcedureHandler(
      'agentChat.assistantMadeCodeChangesUntilLatestUserMessage',
    );
    this.kartonService.removeServerProcedureHandler(
      'agentChat.contextElementsChanged',
    );
    this.kartonService.removeServerProcedureHandler(
      'userAccount.refreshSubscription',
    );
  }

  private async fetchSubscription() {
    try {
      const subscription =
        await this.client.subscription.getSubscription.query();
      this.kartonService.setState((draft) => {
        if (draft.userAccount) {
          draft.userAccount.subscription = {
            ...subscription,
            active: subscription.hasSubscription,
          };
        }
      });
    } catch (error) {
      this.logger.debug('[AgentService] Failed to fetch subscription', error);
    }
  }

  private getCurrentTab(): MainTab | Layout.SETUP_WORKSPACE {
    if (this.kartonService.state.userExperience.activeLayout !== Layout.MAIN)
      return Layout.SETUP_WORKSPACE;

    if (!this.kartonService.state.userExperience.activeMainTab)
      return Layout.SETUP_WORKSPACE;

    return this.kartonService.state.userExperience.activeMainTab;
  }

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
    if (!this.undoToolCallStack.has(chatId)) {
      this.undoToolCallStack.set(chatId, []);
    }

    if (this.recursionDepth >= MAX_RECURSION_DEPTH) {
      const errorDesc = ErrorDescriptions.recursionDepthExceeded(
        this.recursionDepth,
        MAX_RECURSION_DEPTH,
      );
      this.setAgentWorking(false);
      this.kartonService.setState((draft) => {
        const chat = draft.workspace?.agentChat?.chats[chatId];
        if (chat) {
          chat.error = {
            type: AgentErrorType.AGENT_ERROR,
            error: new Error(errorDesc),
          };
        }
      });
      return;
    }

    this.recursionDepth++;

    try {
      const lastMessage = history?.at(-1);
      const isUserMessage = lastMessage?.role === 'user';
      const isFirstUserMessage =
        history?.filter((m) => m.role === 'user').length === 1;
      const lastMessageMetadata = isUserMessage
        ? { isUserMessage: true as const, message: lastMessage }
        : { isUserMessage: false as const, message: lastMessage };

      if (isFirstUserMessage && lastMessageMetadata.isUserMessage) {
        const title = await generateChatTitle(
          history,
          this.telemetryService.withTracing(
            this.litellm('gemini-2.5-flash-lite'),
            {
              posthogTraceId: `chat-title-${chatId}`,
              posthogProperties: {
                $ai_span_name: 'chat-title',
              },
            },
          ),
        );

        this.kartonService.setState((draft) => {
          const chat = draft.workspace?.agentChat?.chats[chatId];
          if (chat) {
            chat.title = title;
          }
        });
      }

      if (lastMessageMetadata.isUserMessage) {
        this.telemetryService.capture('agent-prompt-triggered', {
          snippetCount: promptSnippets?.length || 0,
        });
      }

      const prompts = new XMLPrompts();
      const systemPrompt = prompts.getSystemPrompt({
        userMessageMetadata: lastMessageMetadata.message?.metadata,
        currentTab: this.getCurrentTab(),
        promptSnippets,
      });

      const model = this.telemetryService.withTracing(
        this.litellm('claude-sonnet-4-5'),
        {
          posthogTraceId: chatId,
          posthogProperties: {
            $ai_span_name: 'agent-chat',
            developerTag: process.env.DEVELOPER_TAG || undefined,
            currentTab: this.getCurrentTab(),
          },
        },
      );

      const stream = streamText({
        model,
        abortSignal: this.abortController.signal,
        temperature: 0.7,
        maxOutputTokens: 10000,
        maxRetries: 0,
        providerOptions: {
          anthropic: {
            thinking: { type: 'enabled', budgetTokens: 10000 },
          } satisfies AnthropicProviderOptions,
          openai: {},
        },
        messages: [systemPrompt, ...uiMessagesToModelMessages(history ?? [])],
        onError: async (error) => {
          await this.handleStreamingError(error, chatId, promptSnippets);
        },
        // Get the tools based on the agent mode
        tools: toolsWithoutExecute(this.getTools()),
        onAbort: () => {
          this.authRetryCount = 0;
          this.cleanupPendingOperations('Agent call aborted');
        },
        onFinish: async (r) => {
          this.authRetryCount = 0;
          const messages =
            this.kartonService.state.workspace?.agentChat?.chats[chatId]
              ?.messages ?? [];

          const toolResults = await processToolCalls(
            r.toolCalls,
            this.getTools(),
            messages,
            (result) => {
              if (result.result && hasUndoMetadata(result.result)) {
                this.undoToolCallStack.get(chatId)?.push({
                  toolCallId: result.toolCallId,
                  undoExecute: result.result.hiddenMetadata.undoExecute,
                });
              }
              attachToolOutputToMessage(
                this.kartonService as KartonStateProvider<
                  KartonContract['state']
                >,
                [result],
                this.lastMessageId!,
              );
            },
          );

          // Updating the used context window size of the chat.
          this.kartonService.setState((draft) => {
            const chat = draft.workspace?.agentChat?.chats[chatId];
            if (chat && r.totalUsage.inputTokens)
              chat.usage.usedContextWindowSize = r.totalUsage.inputTokens;
            return draft;
          });

          if (
            toolResults.length > 0 &&
            !toolResults.some(
              (r) =>
                'userInteractionrequired' in r && r.userInteractionrequired,
            )
          ) {
            const updatedMessages =
              this.kartonService.state.workspace?.agentChat?.chats[chatId]
                ?.messages;
            return this.callAgent({
              chatId,
              history: updatedMessages,
              clientRuntime,
              promptSnippets,
            });
          }

          this.cleanupPendingOperations(
            'Agent task completed successfully',
            false,
          );
        },
      });

      const uiMessages = stream.toUIMessageStream({
        generateMessageId: generateId,
      }) as AsyncIterableStream<InferUIMessageChunk<ChatMessage>>;

      await this.parseUiStream(uiMessages, (messageId) => {
        this.lastMessageId = messageId;
      });
    } catch (error) {
      this.logger.error('Agent failed', error);
      this.telemetryService.captureException(error as Error);
      const errorDesc = formatErrorDescription('Agent failed', error);
      this.setAgentWorking(false);
      this.kartonService.setState((draft) => {
        const chat = draft.workspace?.agentChat?.chats[chatId];
        if (chat) {
          chat.error = {
            type: AgentErrorType.AGENT_ERROR,
            error: new Error(errorDesc),
          };
        }
      });
      return;
    } finally {
      this.recursionDepth = Math.max(0, this.recursionDepth - 1);
    }
  }

  private async parseUiStream(
    uiStream: ReadableStream<InferUIMessageChunk<ChatMessage>>,
    onNewMessage?: (messageId: string) => void,
  ) {
    const activeChatId =
      this.kartonService.state.workspace?.agentChat?.activeChatId;
    if (!activeChatId) return;

    for await (const uiMessage of readUIMessageStream<ChatMessage>({
      stream: uiStream,
    })) {
      const chat =
        this.kartonService.state.workspace?.agentChat?.chats[activeChatId];
      const messageExists = chat?.messages.find((m) => m.id === uiMessage.id);

      const uiMessageWithMetadata: ChatMessage = {
        ...uiMessage,
        metadata: {
          ...(uiMessage.metadata ?? {}),
          createdAt: new Date(),
        },
      };

      if (messageExists) {
        this.kartonService.setState((draft) => {
          const chat = draft.workspace?.agentChat?.chats[activeChatId];
          if (chat) {
            chat.messages = chat.messages.map((m) =>
              m.id === uiMessage.id
                ? (uiMessageWithMetadata as ChatMessage)
                : (m as any),
            );
          }
        });
      } else {
        onNewMessage?.(uiMessage.id);
        this.kartonService.setState((draft) => {
          const chat = draft.workspace?.agentChat?.chats[activeChatId];
          if (chat) {
            chat.messages.push(uiMessageWithMetadata as any);
          }
        });
      }
    }
  }

  private async assistantMadeCodeChangesUntilLatestUserMessage(
    chatId: string,
  ): Promise<boolean> {
    const chat = this.kartonService.state.workspace?.agentChat?.chats[chatId];
    const history = chat?.messages ?? [];
    const reversedHistory = [...history].reverse();
    const userMessageIndex = reversedHistory.findIndex(
      (m) => m.role === 'user' && 'id' in m,
    );

    let hasMadeCodeChanges = false;
    for (let i = 0; i < userMessageIndex; i++) {
      const message = reversedHistory[i]!;
      for (const part of message.parts) {
        if (isToolCallType(part.type)) {
          const toolCall = part as ToolUIPart<UITools>;
          if (toolCall.output && hasDiffMetadata(toolCall.output)) {
            hasMadeCodeChanges = true;
            break;
          }
        }
      }
    }
    return hasMadeCodeChanges;
  }

  private async undoToolCallsUntilLatestUserMessage(
    chatId: string,
  ): Promise<ChatMessage | null> {
    if (!this.undoToolCallStack.has(chatId)) return null;

    const chat = this.kartonService.state.workspace?.agentChat?.chats[chatId];
    const history = chat?.messages ?? [];
    const reversedHistory = [...history].reverse();
    const userMessageIndex = reversedHistory.findIndex(
      (m) => m.role === 'user' && 'id' in m,
    );

    if (userMessageIndex === -1) return null;

    const latestUserMessage = reversedHistory[userMessageIndex]!;
    await this.undoToolCallsUntilUserMessage(
      reversedHistory[userMessageIndex]!.id,
      chatId,
    );
    return latestUserMessage;
  }

  private async undoToolCallsUntilUserMessage(
    userMessageId: string,
    chatId: string,
  ): Promise<void> {
    if (!this.undoToolCallStack.has(chatId)) return;

    const chat = this.kartonService.state.workspace?.agentChat?.chats[chatId];
    const history = chat?.messages ?? [];
    const userMessageIndex = history.findIndex(
      (m) => m.role === 'user' && 'id' in m && m.id === userMessageId,
    );

    const messagesAfterUserMessage =
      userMessageIndex !== -1 ? history.slice(userMessageIndex + 1) : [];

    const toolCallIdsAfterUserMessage: string[] = [];
    for (const message of messagesAfterUserMessage) {
      if (message.role !== 'assistant') continue;
      for (const content of message.parts) {
        if (isToolCallType(content.type)) {
          toolCallIdsAfterUserMessage.push((content as ToolUIPart).toolCallId);
        }
      }
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

    this.kartonService.setState((draft) => {
      if (userMessageIndex !== -1) {
        const chat = draft.workspace?.agentChat?.chats[chatId];
        if (chat) {
          chat.messages = history.slice(0, userMessageIndex) as any;
        }
      }
    });
  }

  public teardown() {
    this.removeServerProcedureHandlers();
    this.cleanupPendingOperations('Agent teardown');
    this.logger.debug('[AgentService] Shutdown complete');
  }

  public static async create(
    logger: Logger,
    telemetryService: TelemetryService,
    kartonService: KartonService,
    authService: AuthService,
    clientRuntime: ClientRuntime,
    workspaceSetupService: WorkspaceSetupService,
    workspaceDataPath: string,
  ) {
    const instance = new AgentService(
      logger,
      telemetryService,
      kartonService,
      authService,
      clientRuntime,
      workspaceSetupService,
      workspaceDataPath,
    );
    await instance.initialize();
    logger.debug('[AgentService] Created service');
    return instance;
  }

  public getInspirationComponents() {
    return this.kartonService.state.workspace?.inspirationComponents ?? [];
  }

  private async handleStreamingError(
    error: { error: unknown },
    chatId: string,
    promptSnippets?: PromptSnippet[],
  ) {
    if (isAbortError(error.error)) {
      this.authRetryCount = 0;
      this.cleanupPendingOperations('Agent call aborted');
    } else if (isPlanLimitsExceededError(error.error)) {
      const planLimitsExceededError = isPlanLimitsExceededError(
        error.error,
      ) as PlanLimitsExceededError;
      this.authRetryCount = 0;

      this.telemetryService.capture('agent-plan-limits-exceeded', {
        hasSubscription:
          this.kartonService.state.userAccount?.subscription?.active,
        isPaidPlan: planLimitsExceededError.data.isPaidPlan || false,
        cooldownMinutes: planLimitsExceededError.data.cooldownMinutes,
      });

      this.kartonService.setState((draft) => {
        const chat = draft.workspace?.agentChat?.chats[chatId];
        if (chat) {
          chat.error = {
            type: AgentErrorType.PLAN_LIMITS_EXCEEDED,
            error: {
              name: 'Plan limit exceeded',
              message: `Plan limit exceeded, please wait ${planLimitsExceededError.data.cooldownMinutes} minutes before your next request.`,
              isPaidPlan: planLimitsExceededError.data.isPaidPlan || false,
              cooldownMinutes: planLimitsExceededError.data.cooldownMinutes,
            },
          };
        }
      });

      this.cleanupPendingOperations('Plan limits exceeded');
      return;
    } else if (
      isAuthenticationError(error.error) &&
      this.authRetryCount < this.maxAuthRetries
    ) {
      this.logger.log(
        'error',
        `[Agent Service Authentication]: Error, ${error.error}`,
      );
      this.authRetryCount++;

      // Auth service will handle token refresh internally
      // We just need to reinitialize our client and litellm
      await this.initializeClient();
      await this.initializeLitellm();

      const messages =
        this.kartonService.state.workspace?.agentChat?.chats[chatId]?.messages;
      await this.callAgent({
        chatId,
        history: messages,
        clientRuntime: this.clientRuntime,
        promptSnippets,
      });
      return;
    } else if (
      isAuthenticationError(error.error) &&
      this.authRetryCount >= this.maxAuthRetries
    ) {
      this.authRetryCount = 0;
      this.setAgentWorking(false);
      this.kartonService.setState((draft) => {
        const chat = draft.workspace?.agentChat?.chats[chatId];
        if (chat) {
          chat.error = {
            type: AgentErrorType.AGENT_ERROR,
            error: new Error('Authentication failed, please restart the cli.'),
          };
        }
      });
      return;
    } else if (isContextLimitError(error.error)) {
      this.kartonService.setState((draft) => {
        const chat = draft.workspace?.agentChat?.chats[chatId];
        if (chat)
          chat.error = {
            type: AgentErrorType.CONTEXT_LIMIT_EXCEEDED,
            error: {
              name: 'Context limit exceeded',
              message:
                'This chat exceeds the context limit. Please start a new chat.',
            },
          };
      });
      this.cleanupPendingOperations('Context limit exceeded');
      return;
    } else {
      const errorDetails = extractDetailsFromError(error.error);
      this.logger.error(
        `[Agent Service] Agent failed with error ${errorDetails?.message}`,
      );
      this.telemetryService.captureException(error.error as Error);
      const errorDesc = formatErrorDescription('Agent failed', errorDetails);
      this.setAgentWorking(false);
      this.kartonService.setState((draft) => {
        const chat = draft.workspace?.agentChat?.chats[chatId];
        if (chat) {
          chat.error = {
            type: AgentErrorType.AGENT_ERROR,
            error: new Error(errorDesc),
          };
        }
      });
    }
  }
}
