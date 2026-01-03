import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { resolve } from 'node:path';
import type { GlobalDataPathService } from '../../../global-data-path';
import { isContextLimitError } from './utils/is-context-limit-error';
import { generateStagewiseMd } from './generate-stagewise-md';
import type { KartonService } from '../../../karton';
import type { Logger } from '../../../logger';
import type { TelemetryService } from '../../../telemetry';
import type { GlobalConfigService } from '../../../global-config';
import type { AuthService, AuthState } from '../../../auth';
import { hasUndoMetadata, hasDiffMetadata } from '@stagewise/agent-types';
import type { WindowLayoutService } from '../../../window-layout';
import {
  type KartonContract,
  type History,
  type ChatMessage,
  AgentErrorType,
  Layout,
  type MainTab,
} from '@shared/karton-contracts/ui';
import {
  type AnthropicProviderOptions,
  createAnthropic,
} from '@ai-sdk/anthropic';
import {
  codingAgentTools,
  setupAgentTools,
  toolsWithoutExecute,
  noWorkspaceConfiguredAgentTools,
  type UITools,
  type AgentToolsContext,
  type BrowserRuntime,
  type LintingDiagnosticsResult,
  type LintingDiagnostic,
} from '@stagewise/agent-tools';
import {
  streamText,
  smoothStream,
  generateId,
  readUIMessageStream,
  NoSuchToolError,
  generateText,
} from 'ai';
import type { AppRouter, TRPCClient } from '@stagewise/api-client';
import type { AsyncIterableStream, InferUIMessageChunk, ToolUIPart } from 'ai';
import { getRepoRootForPath } from '@/utils/git-tools';
import {
  PromptBuilder,
  ORIGINAL_USER_MESSAGES_KEPT_WHEN_SUMMARIZING,
  findEndOfFirstNPairs,
} from './prompt-builder';
import { summarizeChatHistory } from './prompt-builder/utils/summarize-chat-history';
import { TimeoutManager } from './utils/time-out-manager';
import { createAuthenticatedClient } from './utils/create-authenticated-client';
import {
  findPendingToolCalls,
  type KartonStateProvider,
  attachToolOutputToMessage,
} from './utils/karton-helpers';
import type { GenericToolCallResult } from './utils/tool-call-utils';
import { createAndActivateNewChat } from './utils/karton-helpers';
import { extractStructuredError } from './utils/error-utils';
import { isAbortError } from './utils/is-abort-error';
import { isPlanLimitsExceededError } from './utils/is-plan-limit-error';
import type { PlanLimitsExceededError } from './utils/is-plan-limit-error';
import { processToolCalls } from './utils/tool-call-utils';
import { generateChatTitle } from './utils/generate-chat-title';
import { isAuthenticationError } from './utils/is-authentication-error';
import { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import { LspService } from '../lsp';
import type { DiagnosticsByFile } from './prompt-builder';

type ToolCallType = 'dynamic-tool' | `tool-${string}`;

const SCRIPT_EXECUTION_TIMEOUT_MS = 5000;

function getMinimalBrowserRuntime(
  windowLayoutService: WindowLayoutService,
): BrowserRuntime {
  return {
    executeScript: async (script, tabId) => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Script execution timed out after 5 seconds'));
        }, SCRIPT_EXECUTION_TIMEOUT_MS);
      });

      const result = await Promise.race([
        windowLayoutService.executeConsoleScript(script, tabId),
        timeoutPromise,
      ]);

      if (!result.success) throw new Error(result.error);
      // If the result is already a string (e.g., agent used JSON.stringify in script),
      // return it as-is to avoid double-stringification
      if (typeof result.result === 'string') return result.result;

      return JSON.stringify(result.result);
    },
    getConsoleLogs: (tabId, options) => {
      return windowLayoutService.getConsoleLogs(tabId, options);
    },
  };
}

function isToolCallType(type: string): type is ToolCallType {
  return type === 'dynamic-tool' || type.startsWith('tool-');
}

type ChatId = string;

// Configuration constants
const DEFAULT_AGENT_TIMEOUT = 180000; // 3 minutes
const MAX_RECURSION_DEPTH = 50;

export class AgentService {
  private logger: Logger;
  private telemetryService: TelemetryService;
  private uiKarton: KartonService;
  private globalConfigService: GlobalConfigService;
  private windowLayoutService: WindowLayoutService;
  private authService: AuthService;
  private clientRuntime: ClientRuntime | null = null;
  private apiKey: string | null = null;
  private promptBuilder: PromptBuilder;
  private globalDataPathService: GlobalDataPathService;
  private client!: TRPCClient<AppRouter>;
  private isWorking = false;
  private timeoutManager: TimeoutManager;
  private recursionDepth = 0;
  private agentTimeout: number = DEFAULT_AGENT_TIMEOUT;
  private authRetryCount = 0;
  private maxAuthRetries = 2;
  private abortController: AbortController;
  private lastMessageId: string | null = null;
  private litellm: ReturnType<typeof createAnthropic> | null = null;
  private isWarmedUp = false;
  private onSaveSetupInformation: (params: {
    agentAccessPath: string;
    ide: string | undefined;
    appPath: string;
  }) => Promise<void>;
  private undoToolCallStack: Map<
    ChatId,
    {
      toolCallId: string;
      toolName: string; // used for telemetry
      undoExecute?: () => Promise<void>;
    }[]
  > = new Map();
  private thinkingDurationsPerChat: Map<
    ChatId,
    { durations: number[]; currentStartTime: number | null }
  > = new Map();
  private thinkingEnabled = true;
  private isCompacting = false; // Guard to prevent concurrent compaction attempts
  private lspService: LspService | null = null;
  /** Files modified during this session - used to collect LSP diagnostics */
  private modifiedFilesThisSession: Set<string> = new Set();

  private constructor(
    logger: Logger,
    telemetryService: TelemetryService,
    uiKarton: KartonService,
    globalConfigService: GlobalConfigService,
    authService: AuthService,
    windowLayoutService: WindowLayoutService,
    globalDataPathService: GlobalDataPathService,
    onSaveSetupInformation: (params: {
      agentAccessPath: string;
      ide: string | undefined;
      appPath: string;
    }) => Promise<void>,
  ) {
    this.logger = logger;
    this.telemetryService = telemetryService;
    this.uiKarton = uiKarton;
    this.globalConfigService = globalConfigService;
    this.windowLayoutService = windowLayoutService;
    this.authService = authService;
    this.globalDataPathService = globalDataPathService;
    this.onSaveSetupInformation = onSaveSetupInformation;

    // Initialize prompt builder with state getter to ensure fresh state on each conversion
    this.promptBuilder = new PromptBuilder(
      this.clientRuntime,
      () => this.uiKarton.state,
      this.uiKarton.state.workspace?.paths.data ?? null,
    );

    // Initialize timeout manager
    this.timeoutManager = new TimeoutManager();

    // Initialize abort controller
    this.abortController = new AbortController();
    this.abortController.signal.addEventListener(
      'abort',
      () => {
        const activeChatId = this.uiKarton.state.agentChat?.activeChatId;
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

  private getToolsContext(): AgentToolsContext | null {
    const captureToolsError = (scope: string) => {
      this.telemetryService.captureException(
        new Error(
          `Error getting tools. [${scope}] failed, please check if you are signed in and try again.`,
        ),
      );
      this.logger.debug(
        `[AgentService] Error getting tools. [${scope}] failed, please check if you are signed in and try again.`,
      );
      return null;
    };
    const workspaceStatus = this.uiKarton.state.workspaceStatus;
    if (workspaceStatus === 'setup') {
      if (!this.clientRuntime)
        return captureToolsError('Setup agent tools - no client runtime');
      return {
        mode: 'setup',
        tools: setupAgentTools(this.clientRuntime, {
          onSaveInformation: async (params) => {
            if (!this.clientRuntime) {
              // This should never happen - agent can only be in setup-mode when a client runtime is available
              captureToolsError(
                'Saving information for workspace setup - no client runtime',
              );
              return;
            }
            this.telemetryService.capture('workspace-setup-information-saved', {
              agent_access_path: params.agentAccessPath,
              ide: params.ide,
            });
            this.logger.debug(
              '[AgentService] Saving information for workspace setup',
            );

            if (params.ide) {
              void this.globalConfigService.set({
                ...this.globalConfigService.get(),
                openFilesInIde: params.ide,
              });
            }

            await this.onSaveSetupInformation({
              agentAccessPath: params.agentAccessPath,
              ide: params.ide,
              appPath: params.appPath,
            });

            void this.updateStagewiseMd();

            const absoluteAgentAccessPath =
              params.agentAccessPath === '{GIT_REPO_ROOT}'
                ? getRepoRootForPath(params.appPath)
                : resolve(params.appPath, params.agentAccessPath);

            this.clientRuntime.fileSystem.setCurrentWorkingDirectory(
              absoluteAgentAccessPath,
            );
          },
        }),
      };
    }
    if (!this.clientRuntime) {
      return {
        mode: 'no-workspace',
        tools: noWorkspaceConfiguredAgentTools(
          this.client,
          getMinimalBrowserRuntime(this.windowLayoutService),
        ),
      };
    }

    return {
      mode: 'coding',
      tools: codingAgentTools(
        this.clientRuntime,
        getMinimalBrowserRuntime(this.windowLayoutService),
        this.client,
        {
          onUpdateStagewiseMd: () => this.updateStagewiseMd(),
          getLintingDiagnostics: () => this.getStructuredLintingDiagnostics(),
        },
      ),
    };
  }

  /**
   * Get structured linting diagnostics for modified files.
   * Used by the getLintingDiagnosticsTool.
   */
  private async getStructuredLintingDiagnostics(): Promise<LintingDiagnosticsResult> {
    // Wait briefly for LSP servers to finish analyzing
    // TypeScript and ESLint can take a few hundred ms to report diagnostics
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Collect current diagnostics from LSP servers
    const diagnosticsByFile = await this.collectDiagnosticsForModifiedFiles();

    const agentAccessPath = this.clientRuntime
      ? this.clientRuntime.fileSystem.getCurrentWorkingDirectory()
      : '';

    // Build structured result
    const files: LintingDiagnosticsResult['files'] = [];

    let totalErrors = 0;
    let totalWarnings = 0;
    let totalInfos = 0;
    let totalHints = 0;

    for (const [filePath, aggregatedDiagnostics] of diagnosticsByFile) {
      const relativePath = filePath.startsWith(agentAccessPath)
        ? filePath.slice(agentAccessPath.length).replace(/^\//, '')
        : filePath;

      const fileDiagnostics: LintingDiagnostic[] = [];

      for (const { serverID, diagnostic } of aggregatedDiagnostics) {
        const severity = (diagnostic.severity ?? 1) as 1 | 2 | 3 | 4;
        fileDiagnostics.push({
          line: diagnostic.range.start.line + 1,
          column: diagnostic.range.start.character + 1,
          severity,
          source: diagnostic.source ?? serverID,
          message: diagnostic.message,
          code: diagnostic.code,
        });

        if (severity === 1) totalErrors++;
        else if (severity === 2) totalWarnings++;
        else if (severity === 3) totalInfos++;
        else if (severity === 4) totalHints++;
      }

      if (fileDiagnostics.length > 0)
        files.push({ path: relativePath, diagnostics: fileDiagnostics });
    }

    const totalIssues = totalErrors + totalWarnings + totalInfos + totalHints;

    return {
      files,
      summary: {
        totalFiles: files.length,
        totalIssues,
        errors: totalErrors,
        warnings: totalWarnings,
        infos: totalInfos,
        hints: totalHints,
      },
    };
  }

  private async initializeLitellm() {
    const LLM_PROXY_URL =
      process.env.LLM_PROXY_URL || 'https://llm.stagewise.io';

    const accessToken = this.authService.accessToken;
    if (!accessToken) {
      this.logger.debug(
        '[AgentService] No authentication tokens available. Initializing litellm failed, please sign in before using the agent.',
      );
      return;
    }

    this.apiKey = accessToken;

    this.litellm = createAnthropic({
      baseURL: `${LLM_PROXY_URL}/v1`,
      apiKey: accessToken,
    });
  }

  private async initializeClient() {
    // await this.authService.refreshAuthState();
    const accessToken = this.authService.accessToken;
    if (!accessToken) {
      this.logger.debug(
        '[AgentService] No authentication tokens available. Initializing client failed, please sign in before using the agent.',
      );
      return;
    }

    this.client = createAuthenticatedClient(accessToken);
  }

  private async updateStagewiseMd() {
    if (!this.clientRuntime) return;
    if (!this.uiKarton.state.workspace?.paths.data) return;
    await generateStagewiseMd(
      this.telemetryService.withTracing(this.litellm!('claude-haiku-4-5'), {
        posthogTraceId: 'update-stagewise-md',
        posthogProperties: {
          $ai_span_name: 'update-stagewise-md',
        },
      }),
      this.clientRuntime!,
      new ClientRuntimeNode({
        workingDirectory: this.uiKarton.state.workspace.paths.data,
        rgBinaryBasePath: this.globalDataPathService.globalDataPath,
      }),
      this.uiKarton.state.workspace?.path ??
        (this.clientRuntime?.fileSystem.getCurrentWorkingDirectory() || ''),
    );
  }

  public setClientRuntime(clientRuntime: ClientRuntime | null): void {
    this.clientRuntime = clientRuntime;
    this.promptBuilder = new PromptBuilder(
      this.clientRuntime,
      () => this.uiKarton.state,
      this.uiKarton.state.workspace?.paths.data ?? null,
    );

    // Clear modified files tracking when workspace changes
    this.modifiedFilesThisSession.clear();

    // Teardown old LspService and create new one with the new clientRuntime
    void this.lspService?.teardown();
    this.lspService = null;

    if (clientRuntime) {
      LspService.create(this.logger, clientRuntime)
        .then((lsp) => {
          this.lspService = lsp;
          this.logger.debug('[AgentService] LspService created');
        })
        .catch((error) => {
          this.logger.error(
            '[AgentService] Failed to create LspService',
            error,
          );
          this.telemetryService.captureException(error as Error);
        });
    }
  }

  public async sendUserMessage(message: ChatMessage): Promise<void> {
    this.logger.debug('[AgentService] Sending user message');
    const activeChatId = this.uiKarton.state.agentChat?.activeChatId;
    if (!activeChatId) return;

    // Reset thinking durations for this chat (new user message = new turn)
    this.thinkingDurationsPerChat.set(activeChatId, {
      durations: [],
      currentStartTime: null,
    });
    // Set thinking 'enabled' in main layout. IMPORTANT: Thinking mode must not be switched immediately after tool-responses!
    const layout = this.uiKarton.state.userExperience.activeLayout;
    if (
      layout === Layout.MAIN &&
      this.uiKarton.state.workspaceStatus === 'open' &&
      this.thinkingEnabled === false
    )
      this.thinkingEnabled = true;
    else if (
      layout === Layout.MAIN &&
      this.uiKarton.state.workspaceStatus === 'setup'
    )
      this.thinkingEnabled = false;

    const pendingToolCalls = findPendingToolCalls(
      this.uiKarton as KartonStateProvider<KartonContract['state']>,
      activeChatId,
    );
    // User-Interaction tool calls could still have open inputs - cancel them
    if (pendingToolCalls.length > 0) {
      pendingToolCalls.forEach(({ toolCallId }) => {
        attachToolOutputToMessage(
          this.uiKarton as KartonStateProvider<KartonContract['state']>,
          [
            {
              toolCallId,
              duration: 0,
              error: {
                message: 'Tool execution skipped by user',
              },
            },
          ],
          this.lastMessageId!,
        );
      });
    }

    this.setAgentWorking(true);

    const newstate = this.uiKarton.setState((draft) => {
      const chat = draft.agentChat?.chats[activeChatId];
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

    const messages = newstate?.agentChat?.chats[activeChatId]?.messages;

    this.logger.debug('[AgentService] Calling agent');

    await this.callAgent({
      chatId: activeChatId,
      history: messages,
    });
  }

  public setCurrentWorkingDirectory(
    absoluteCurrentWorkingDirectory: string,
  ): void {
    this.clientRuntime?.fileSystem.setCurrentWorkingDirectory(
      absoluteCurrentWorkingDirectory,
    );
    this.promptBuilder = new PromptBuilder(
      this.clientRuntime,
      () => this.uiKarton.state,
      this.uiKarton.state.workspace?.paths.data ?? null,
    );

    // Recreate LspService with the new working directory as root
    if (this.clientRuntime) {
      void this.lspService?.teardown();
      this.lspService = null;

      LspService.create(this.logger, this.clientRuntime)
        .then((lsp) => {
          this.lspService = lsp;
          this.logger.debug(
            '[AgentService] LspService recreated with new working directory',
          );
        })
        .catch((error) => {
          this.logger.error(
            '[AgentService] Failed to recreate LspService',
            error,
          );
          this.telemetryService.captureException(error as Error);
        });
    }
  }

  public createAndActivateNewChat() {
    return createAndActivateNewChat(
      this.uiKarton as KartonStateProvider<KartonContract['state']>,
    );
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

    this.uiKarton.setState((draft) => {
      if (draft.agentChat) {
        draft.agentChat.isWorking = isWorking;
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
        this.uiKarton as KartonStateProvider<KartonContract['state']>,
        chatId,
      );
      if (pendingToolCalls.length > 0) {
        const abortedResults: GenericToolCallResult[] = pendingToolCalls.map(
          ({ toolCallId }) => ({
            toolCallId,
            duration: 0,
            error: {
              message: 'Tool execution aborted by user',
            },
          }),
        );

        attachToolOutputToMessage(
          this.uiKarton as KartonStateProvider<KartonContract['state']>,
          abortedResults,
          this.lastMessageId,
        );
      }
    }

    this.timeoutManager.clearAll();

    if (resetRecursionDepth) this.recursionDepth = 0;

    this.setAgentWorking(false);
  }

  private onAuthStateChange = (async (newAuthState: AuthState) => {
    if (newAuthState.status === 'authenticated') {
      this.logger.debug(
        '[AgentService] Auth state changed to authenticated, initializing client and litellm...',
      );
      await this.initializeClient();
      await this.initializeLitellm();
      if (!this.isWarmedUp) {
        this.isWarmedUp = true;
        void this.warmUpLLMProxyCache();
      }
    }
  }).bind(this);

  public async initialize() {
    this.logger.debug('[AgentService] Initializing...');

    this.uiKarton.setState((draft) => {
      if (!draft.agentChat) {
        draft.agentChat = {
          chats: {},
          activeChatId: null,
          toolCallApprovalRequests: [],
          isWorking: false,
        };
      }
    });

    // Initialize client and litellm
    await this.initializeClient();
    await this.initializeLitellm();

    this.authService.registerAuthStateChangeCallback(this.onAuthStateChange);

    // Register all karton procedure handlers
    this.registerProcedureHandlers();

    // Fetch subscription
    await this.fetchSubscription();

    // Set initial state
    this.setAgentWorking(false);
    createAndActivateNewChat(
      this.uiKarton as KartonStateProvider<KartonContract['state']>,
    );

    this.logger.debug('[AgentService] Initialized');
  }

  private abortAgentCall() {
    const activeChatId = this.uiKarton.state.agentChat?.activeChatId;
    if (!activeChatId) return;

    this.abortController.abort();
    this.abortController = new AbortController();
    this.abortController.signal.addEventListener(
      'abort',
      () => {
        const chatId = this.uiKarton.state.agentChat?.activeChatId;
        if (chatId) {
          this.cleanupPendingOperations('Agent call aborted', false, chatId);
        }
      },
      { once: true },
    );
  }

  private registerProcedureHandlers() {
    // Agent Chat procedures
    try {
      this.uiKarton.registerServerProcedureHandler(
        'agentChat.undoToolCallsUntilUserMessage',
        async (userMessageId: string, chatId: string) => {
          await this.undoToolCallsUntilUserMessage(userMessageId, chatId);
        },
      );

      this.uiKarton.registerServerProcedureHandler(
        'agentChat.undoToolCallsUntilLatestUserMessage',
        async (chatId: string): Promise<ChatMessage | null> => {
          return await this.undoToolCallsUntilLatestUserMessage(chatId);
        },
      );

      this.uiKarton.registerServerProcedureHandler(
        'agentChat.retrySendingUserMessage',
        async () => {
          this.setAgentWorking(true);
          const activeChatId = this.uiKarton.state.agentChat?.activeChatId;
          if (!activeChatId) return;

          this.uiKarton.setState((draft) => {
            const chat = draft.agentChat?.chats[activeChatId];
            if (chat) {
              chat.error = undefined;
            }
          });

          const messages =
            this.uiKarton.state.agentChat?.chats[activeChatId]?.messages;
          await this.callAgent({
            chatId: activeChatId,
            history: messages,
          });

          this.setAgentWorking(false);
        },
      );

      this.uiKarton.registerServerProcedureHandler(
        'agentChat.abortAgentCall',
        async () => {
          this.abortAgentCall();
        },
      );

      this.uiKarton.registerServerProcedureHandler(
        'agentChat.approveToolCall',
        async (_toolCallId: string, _callingClientId: string) => {
          // Implementation TBD
        },
      );

      this.uiKarton.registerServerProcedureHandler(
        'agentChat.rejectToolCall',
        async (_toolCallId: string, _callingClientId: string) => {
          // Implementation TBD
        },
      );

      this.uiKarton.registerServerProcedureHandler(
        'agentChat.create',
        async () => {
          return createAndActivateNewChat(
            this.uiKarton as KartonStateProvider<KartonContract['state']>,
          );
        },
      );

      this.uiKarton.registerServerProcedureHandler(
        'agentChat.switch',
        async (chatId: string, _callingClientId: string) => {
          this.uiKarton.setState((draft) => {
            if (draft.agentChat) draft.agentChat.activeChatId = chatId;
          });

          const chats = this.uiKarton.state.agentChat?.chats;
          if (chats) {
            Object.entries(chats).forEach(([id, chat]) => {
              if (chat.messages.length === 0 && id !== chatId) {
                this.uiKarton.setState((draft) => {
                  if (draft.agentChat?.chats[id])
                    delete draft.agentChat?.chats[id];
                });
              }
            });
          }
        },
      );

      this.uiKarton.registerServerProcedureHandler(
        'agentChat.delete',
        async (chatId: string, _callingClientId: string) => {
          const activeChatId = this.uiKarton.state.agentChat?.activeChatId;
          if (!activeChatId) return;
          if (this.isWorking) this.abortAgentCall();

          if (activeChatId === chatId) {
            const chats = this.uiKarton.state.agentChat?.chats;
            const nextChatId = Object.keys(chats || {}).find(
              (id) => id !== chatId,
            );

            if (!nextChatId) {
              createAndActivateNewChat(
                this.uiKarton as KartonStateProvider<KartonContract['state']>,
              );
            } else {
              this.uiKarton.setState((draft) => {
                if (draft.agentChat) draft.agentChat.activeChatId = nextChatId;
              });
            }
          }

          this.uiKarton.setState((draft) => {
            if (draft.agentChat?.chats[chatId])
              delete draft.agentChat?.chats[chatId];
          });
        },
      );

      this.uiKarton.registerServerProcedureHandler(
        'agentChat.sendUserMessage',
        async (message: ChatMessage, _callingClientId: string) => {
          await this.sendUserMessage(message);
        },
      );

      this.uiKarton.registerServerProcedureHandler(
        'agentChat.submitUserInteractionToolInput',
        async (toolCallId, input) => {
          const { type: _, ...cleanInput } = input;
          // Find tool call with state 'input-available' and the toolCallId and attach the output
          attachToolOutputToMessage(
            this.uiKarton as KartonStateProvider<KartonContract['state']>,
            [
              {
                toolCallId,
                result: cleanInput,
                duration: 0,
              },
            ],
            this.lastMessageId!,
          );
          const pendingToolCalls = findPendingToolCalls(
            this.uiKarton as KartonStateProvider<KartonContract['state']>,
            this.uiKarton.state.agentChat?.activeChatId!,
          );
          if (pendingToolCalls.length > 0) return { success: true }; // Other tool calls are still pending - only call agent on the last submission
          this.setAgentWorking(true);
          this.callAgent({
            chatId: this.uiKarton.state.agentChat?.activeChatId!,
            history:
              this.uiKarton.state.agentChat?.chats[
                this.uiKarton.state.agentChat?.activeChatId!
              ]?.messages,
          });
          return { success: true };
        },
      );

      this.uiKarton.registerServerProcedureHandler(
        'agentChat.cancelUserInteractionToolInput',
        async (toolCallId: string) => {
          attachToolOutputToMessage(
            this.uiKarton as KartonStateProvider<KartonContract['state']>,
            [
              {
                toolCallId,
                duration: 0,
                error: {
                  message: 'Tool execution cancelled by user',
                },
              },
            ],
            this.lastMessageId!,
          );
          this.setAgentWorking(true);
          this.callAgent({
            chatId: this.uiKarton.state.agentChat?.activeChatId!,
            history:
              this.uiKarton.state.agentChat?.chats[
                this.uiKarton.state.agentChat?.activeChatId!
              ]?.messages,
          });
        },
      );

      this.uiKarton.registerServerProcedureHandler(
        'agentChat.assistantMadeCodeChangesUntilLatestUserMessage',
        async (chatId: string) => {
          return await this.assistantMadeCodeChangesUntilLatestUserMessage(
            chatId,
          );
        },
      );

      this.uiKarton.registerServerProcedureHandler(
        'userAccount.refreshSubscription',
        async () => {
          await this.fetchSubscription();
        },
      );
    } catch (error) {
      this.logger.debug(
        `[AgentService] Failed to register server procedure handlers ${error}`,
        {
          cause: error,
        },
      );
    }
  }

  private removeServerProcedureHandlers() {
    this.uiKarton.removeServerProcedureHandler(
      'agentChat.undoToolCallsUntilUserMessage',
    );
    this.uiKarton.removeServerProcedureHandler(
      'agentChat.submitUserInteractionToolInput',
    );
    this.uiKarton.removeServerProcedureHandler(
      'agentChat.cancelUserInteractionToolInput',
    );
    this.uiKarton.removeServerProcedureHandler(
      'agentChat.undoToolCallsUntilLatestUserMessage',
    );
    this.uiKarton.removeServerProcedureHandler(
      'agentChat.retrySendingUserMessage',
    );
    this.uiKarton.removeServerProcedureHandler('agentChat.abortAgentCall');
    this.uiKarton.removeServerProcedureHandler('agentChat.approveToolCall');
    this.uiKarton.removeServerProcedureHandler('agentChat.rejectToolCall');
    this.uiKarton.removeServerProcedureHandler('agentChat.create');
    this.uiKarton.removeServerProcedureHandler('agentChat.switch');
    this.uiKarton.removeServerProcedureHandler('agentChat.delete');
    this.uiKarton.removeServerProcedureHandler('agentChat.sendUserMessage');
    this.uiKarton.removeServerProcedureHandler(
      'agentChat.assistantMadeCodeChangesUntilLatestUserMessage',
    );
    this.uiKarton.removeServerProcedureHandler(
      'userAccount.refreshSubscription',
    );
  }

  private async fetchSubscription() {
    try {
      const subscription =
        await this.client.subscription.getSubscription.query();
      this.uiKarton.setState((draft) => {
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

  private getCurrentTab(): MainTab | null {
    if (this.uiKarton.state.userExperience.activeLayout !== Layout.MAIN)
      return null;

    if (!this.uiKarton.state.userExperience.activeMainTab) return null;

    return this.uiKarton.state.userExperience.activeMainTab;
  }

  private async callAgent({
    chatId,
    history,
  }: {
    chatId: string;
    history?: History;
  }): Promise<void> {
    const captureAgentError = (scope: string) => {
      this.telemetryService.captureException(
        new Error(
          `Agent call failed. [${scope}] failed, please check if you are signed in and try again.`,
        ),
      );
      this.logger.debug(
        `[AgentService] Agent call failed. [${scope}] failed, please check if you are signed in and try again.`,
      );
      return;
    };
    if (!this.apiKey) return captureAgentError('No API key available');

    if (!this.litellm) return captureAgentError('No litellm available');

    const toolsContext = this.getToolsContext();
    if (!toolsContext) {
      // agent without workspace configured won't use any tools
      this.logger.debug(
        "[AgentService] Tools are null, agent without workspace configured won't use any tools",
      );
    }

    if (!this.undoToolCallStack.has(chatId))
      this.undoToolCallStack.set(chatId, []);

    // If the LLM proxy cache is not warmed up yet, this agent request acts as a warm-up request
    if (!this.isWarmedUp) this.isWarmedUp = true;

    if (this.recursionDepth >= MAX_RECURSION_DEPTH) {
      this.setAgentWorking(false);
      this.uiKarton.setState((draft) => {
        const chat = draft.agentChat?.chats[chatId];
        if (chat) {
          chat.error = {
            type: AgentErrorType.AGENT_ERROR,
            error: {
              message: `Maximum recursion depth exceeded: Reached depth ${this.recursionDepth} of ${MAX_RECURSION_DEPTH}`,
              code: 'RECURSION_LIMIT',
              errorType: 'UnknownError',
            },
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

      // Capture the current abort signal before any async operations
      // This ensures we can detect if abort was called during async operations
      const signalBeforeAsyncOps = this.abortController.signal;

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

        this.uiKarton.setState((draft) => {
          const chat = draft.agentChat?.chats[chatId];
          if (chat) chat.title = title;
        });
      }

      // Check if abort was called during the async operations above
      // If the original signal was aborted, we should not proceed with streaming
      if (signalBeforeAsyncOps.aborted) {
        this.cleanupPendingOperations('Aborted during async operations');
        return;
      }

      if (lastMessageMetadata.isUserMessage) {
        this.telemetryService.capture('agent-prompt-triggered');
      }

      const isSetupMode = this.uiKarton.state.workspaceStatus === 'setup';

      const model = this.telemetryService.withTracing(
        isSetupMode
          ? this.litellm('claude-haiku-4-5')
          : this.litellm('claude-sonnet-4-5'),
        {
          posthogTraceId: chatId,
          posthogProperties: {
            $ai_span_name: isSetupMode ? 'agent-setup' : 'agent-chat',
            developerTag: process.env.DEVELOPER_TAG || undefined,
            currentTab: this.getCurrentTab(),
          },
        },
      );

      // Get the tools based on the agent mode
      const tools = toolsContext
        ? toolsWithoutExecute(toolsContext.tools)
        : null;

      // Collect LSP diagnostics for modified files
      const lspDiagnosticsByFile =
        await this.collectDiagnosticsForModifiedFiles();

      // Prepare messages before starting the stream
      // This is an async operation, so we do it before and check abort status after
      const messages = await this.promptBuilder.convertUIToModelMessages(
        history ?? [],
        lspDiagnosticsByFile,
      );

      // Check again if abort was called during message preparation
      if (signalBeforeAsyncOps.aborted) {
        this.cleanupPendingOperations('Aborted during message preparation');
        return;
      }

      const stream = streamText({
        model,
        // Use the captured signal instead of this.abortController.signal
        // This ensures abort is respected even if called during async operations above
        abortSignal: signalBeforeAsyncOps,
        temperature: 0.7,
        maxOutputTokens: 10000,
        maxRetries: 0,
        providerOptions: {
          anthropic: {
            thinking: this.thinkingEnabled
              ? { type: 'enabled', budgetTokens: 10000 }
              : { type: 'disabled' },
          } satisfies AnthropicProviderOptions,
          openai: {},
        },
        headers: {
          'anthropic-beta':
            'fine-grained-tool-streaming-2025-05-14, interleaved-thinking-2025-05-14',
        },
        messages,
        onError: async (error) => {
          await this.handleStreamingError(error, chatId);
        },
        tools: tools ?? {},
        onAbort: () => {
          this.authRetryCount = 0;
          this.cleanupPendingOperations('Agent call aborted');
        },
        experimental_transform: smoothStream({
          delayInMs: 10,
          chunking: 'word',
        }),
        experimental_repairToolCall: async (r) => {
          // Haiku often returns the tool input as string instead of object - we try to parse it as object
          // If the parsing fails, we simply return an invalid tool call
          this.logger.debug('[AgentService] Repairing tool call', r.error);
          this.telemetryService.captureException(r.error);
          if (NoSuchToolError.isInstance(r.error)) return null;

          const tool = toolsContext
            ? tools?.[r.toolCall.toolName as keyof typeof tools]
            : null;
          if (!tool) return null;

          try {
            const input = JSON.parse(r.toolCall.input);
            if (typeof input === 'string') {
              const objectInput = JSON.parse(input); // Try to parse the input as object
              if (typeof objectInput === 'object' && objectInput !== null)
                return { ...r.toolCall, input: JSON.stringify(objectInput) };
            } else return null; // If not a string, it already failed the initial parsing check, so we return null
          } catch {
            return null;
          }
          return null;
        },
        onFinish: async (r) => {
          this.authRetryCount = 0;
          const messages =
            this.uiKarton.state.agentChat?.chats[chatId]?.messages ?? [];

          // Get current tools context for processing tool calls
          const currentToolsContext = this.getToolsContext();
          if (!currentToolsContext) {
            this.logger.debug(
              '[AgentService] No tools context available for processing tool calls',
            );
            return;
          }

          const toolResults = await processToolCalls(
            r.toolCalls as any,
            currentToolsContext.tools as any,
            messages,
            (result) => {
              if (!this.isWorking) return;
              if ('result' in result && hasUndoMetadata(result.result)) {
                this.undoToolCallStack.get(chatId)?.push({
                  toolCallId: result.toolCallId,
                  toolName:
                    r.toolCalls.find(
                      (tc) => tc.toolCallId === result.toolCallId,
                    )?.toolName ?? '',
                  undoExecute:
                    result.result.nonSerializableMetadata?.undoExecute,
                });
              }

              // Strip 'nonSerializableMetadata' from result, attach the rest to the tool output
              const cleanResult =
                'result' in result
                  ? (() => {
                      const { nonSerializableMetadata: _, ...restResult } =
                        result.result;
                      return {
                        ...result,
                        result: restResult,
                      };
                    })()
                  : result;

              attachToolOutputToMessage(
                this.uiKarton as KartonStateProvider<KartonContract['state']>,
                [cleanResult],
                this.lastMessageId!,
              );
              this.telemetryService.capture('agent-tool-call-completed', {
                chat_id: chatId,
                message_id: this.lastMessageId!,
                tool_name:
                  r.toolCalls.find((tc) => tc.toolCallId === result.toolCallId)
                    ?.toolName ?? '',
                success: 'result' in result,
                duration: result.duration,
                tool_call_id: result.toolCallId,
                error_message:
                  'error' in result ? result.error.message : undefined,
              });
            },
            (error) => {
              this.logger.debug(
                `[AgentService] Agent failed:  ${error.message} ${error.stack}`,
              );
              this.telemetryService.captureException(error as Error);
            },
          );

          // Sync modified files with LSP server for diagnostics
          // Collect promises so we can wait for LSP updates before next agent call
          const lspUpdatePromises: Promise<void>[] = [];

          for (const result of toolResults) {
            if ('result' in result && hasDiffMetadata(result.result)) {
              const diff = result.result.hiddenFromLLM.diff;
              if (diff.after !== null) {
                // Track modified files for diagnostics collection
                this.modifiedFilesThisSession.add(diff.path);

                // Update LSP if available - first touch (spawns clients + opens doc), then update content
                if (this.lspService) {
                  const content = diff.after; // Capture for closure
                  const updatePromise = this.lspService
                    .touchFile(diff.path)
                    .then(() => this.lspService?.updateFile(diff.path, content))
                    .catch((err: unknown) => {
                      this.logger.debug(
                        '[AgentService] Failed to update LSP document',
                        { error: err, path: diff.path },
                      );
                    });
                  lspUpdatePromises.push(updatePromise);
                }
              }
            }
          }

          // If file edits occurred, wait for LSP updates and diagnostics to settle
          // This ensures diagnostics are available in the system prompt for the next agent call
          if (lspUpdatePromises.length > 0) {
            // Wait for LSP updates with a timeout to prevent hanging if LSP is unresponsive
            const LSP_UPDATE_TIMEOUT_MS = 2000;
            await Promise.race([
              Promise.all(lspUpdatePromises),
              new Promise<void>((resolve) =>
                setTimeout(resolve, LSP_UPDATE_TIMEOUT_MS),
              ),
            ]);
            // Wait briefly for diagnostics to arrive after file edits
            await new Promise((resolve) => setTimeout(resolve, 150));
          }

          // Update the used context window size of the chat
          this.uiKarton.setState((draft) => {
            const chat = draft.agentChat?.chats[chatId];
            if (chat && r.totalUsage.inputTokens) {
              chat.usage.usedContextWindowSize = r.totalUsage.inputTokens;
            }
          });

          // Check if we need to compact the chat history (separate from state update)
          this.triggerCompactionIfNeeded(chatId);

          const requiresUserInteraction = toolResults.some(
            (r) => 'userInteractionrequired' in r && r.userInteractionrequired,
          );

          if (
            !requiresUserInteraction &&
            toolResults.length > 0 &&
            this.isWorking
          ) {
            const updatedMessages =
              this.uiKarton.state.agentChat?.chats[chatId]?.messages;

            return this.callAgent({
              chatId,
              history: updatedMessages,
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
      this.logger.debug(
        `[AgentService] Agent failed: ${error instanceof Error ? error.message : JSON.stringify(error)} ${error instanceof Error ? error.stack : ''}`,
      );
      this.telemetryService.captureException(error as Error);
      const structuredError = extractStructuredError(error);
      this.setAgentWorking(false);
      this.uiKarton.setState((draft) => {
        const chat = draft.agentChat?.chats[chatId];
        if (chat) {
          chat.error = {
            type: AgentErrorType.AGENT_ERROR,
            error: structuredError,
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
    const activeChatId = this.uiKarton.state.agentChat?.activeChatId;
    if (!activeChatId) return;

    // Initialize or get thinking durations state for this chat (persists across agent recursions)
    if (!this.thinkingDurationsPerChat.has(activeChatId)) {
      this.thinkingDurationsPerChat.set(activeChatId, {
        durations: [],
        currentStartTime: null,
      });
    }
    const thinkingState = this.thinkingDurationsPerChat.get(activeChatId)!;

    for await (const uiMessage of readUIMessageStream<ChatMessage>({
      stream: uiStream,
    })) {
      // Count reasoning parts in the accumulated message (from stream parts)
      const reasoningParts = uiMessage.parts.filter(
        (p) => p.type === 'reasoning',
      );
      const lastReasoningPart = reasoningParts[reasoningParts.length - 1];

      // The current reasoning part index is based on durations already recorded
      const nextExpectedIndex = thinkingState.durations.length;

      if (lastReasoningPart) {
        // Check if this is a NEW reasoning part we haven't recorded a duration for yet
        if (
          lastReasoningPart.state === 'streaming' &&
          thinkingState.currentStartTime === null &&
          thinkingState.durations[nextExpectedIndex] === undefined
        ) {
          // A new reasoning part has started
          thinkingState.currentStartTime = Date.now();
        } else if (
          lastReasoningPart.state === 'done' &&
          thinkingState.currentStartTime !== null &&
          thinkingState.durations[nextExpectedIndex] === undefined
        ) {
          // The current reasoning part has finished
          thinkingState.durations[nextExpectedIndex] =
            Date.now() - thinkingState.currentStartTime;
          thinkingState.currentStartTime = null;
        }
      }

      const chat = this.uiKarton.state.agentChat?.chats[activeChatId];
      const existingMessage = chat?.messages.find((m) => m.id === uiMessage.id);
      const messageExists = !!existingMessage;

      // Use the accumulated durations from class-level state
      const thinkingDurations = [...thinkingState.durations];

      const uiMessageWithMetadata: ChatMessage = {
        ...uiMessage,
        metadata: {
          ...(uiMessage.metadata ?? {}),
          ...(thinkingDurations.length > 0 ? { thinkingDurations } : {}),
          createdAt: new Date(),
        },
      };

      if (messageExists) {
        this.uiKarton.setState((draft) => {
          const chat = draft.agentChat?.chats[activeChatId];
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
        this.uiKarton.setState((draft) => {
          const chat = draft.agentChat?.chats[activeChatId];
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
    const chat = this.uiKarton.state.agentChat?.chats[chatId];
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

  /** Triggers compaction if context window usage exceeds 80%. */
  private triggerCompactionIfNeeded(chatId: string): void {
    if (this.isCompacting) return;

    const chat = this.uiKarton.state.agentChat?.chats[chatId];
    if (!chat) return;

    const usedSize = chat.usage.usedContextWindowSize || 0;
    const maxSize = chat.usage.maxContextWindowSize;

    if (!maxSize || usedSize / maxSize <= 0.8) return;

    void this.compactChatHistory();
  }

  /**
   * Summarizes the middle portion of chat history and attaches it to the last user message.
   * Keeps first N pairs and last pair as raw messages; only the middle is summarized.
   * Supports indefinite compaction (can re-compact previously compacted content).
   */
  private async compactChatHistory() {
    if (this.isCompacting) {
      this.logger.debug(
        '[AgentService] Compaction already in progress, skipping',
      );
      return;
    }

    if (!this.litellm) {
      this.logger.debug(
        '[AgentService] Cannot compact chat history: litellm not initialized',
      );
      return;
    }

    const chatId = this.uiKarton.state.agentChat?.activeChatId;
    if (!chatId) return;

    // Set compacting flag before any async operations
    this.isCompacting = true;

    const chat = this.uiKarton.state.agentChat?.chats[chatId];
    const history = chat?.messages ?? [];

    // Find the last user message (where we'll attach the summary)
    let lastUserMessageIndex = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i]!.role === 'user') {
        lastUserMessageIndex = i;
        break;
      }
    }

    // Find where first N pairs end (these are kept raw, not summarized)
    const endOfFirstNPairs = findEndOfFirstNPairs(
      history,
      ORIGINAL_USER_MESSAGES_KEPT_WHEN_SUMMARIZING,
    );

    // Nothing to compact if no middle portion exists
    if (endOfFirstNPairs >= lastUserMessageIndex) {
      this.logger.debug(
        '[AgentService] Cannot compact: no messages between first N pairs and last user message',
      );
      this.isCompacting = false;
      return;
    }

    // Extract middle portion (between first N pairs and last user message)
    const messagesToCompact = history.slice(
      endOfFirstNPairs,
      lastUserMessageIndex,
    );

    // Convert to model messages and remove system prompt
    const allModelMessages =
      await this.promptBuilder.convertUIToModelMessages(messagesToCompact);
    const messagesForSummary = allModelMessages.slice(1);

    if (messagesForSummary.length === 0) {
      this.logger.debug(
        '[AgentService] Cannot compact: no messages to summarize in the middle portion',
      );
      this.isCompacting = false;
      return;
    }

    this.logger.debug(
      `[AgentService] Compacting ${messagesForSummary.length} model messages from middle portion`,
    );

    try {
      const summary = await summarizeChatHistory(
        messagesForSummary,
        this.telemetryService.withTracing(this.litellm('gemini-2.5-flash'), {
          // TODO: update to use 3-flash when the backend supports it
          posthogTraceId: `compact-chat-${chatId}`,
          posthogProperties: {
            $ai_span_name: 'compact-chat-history',
          },
        }),
      );

      // Attach summary to last user message's metadata
      this.uiKarton.setState((draft) => {
        const draftChat = draft.agentChat?.chats[chatId];
        if (draftChat) {
          const userMessage = draftChat.messages[lastUserMessageIndex];
          if (userMessage && userMessage.role === 'user') {
            const existingMetadata = userMessage.metadata ?? {
              createdAt: new Date(),
            };
            userMessage.metadata = {
              ...existingMetadata,
              autoCompactInformation: {
                isAutoCompacted: true,
                compactedAt: new Date(),
                chatSummary: summary,
              },
            };
          }
        }
      });

      this.logger.debug(
        `[AgentService] Chat history compacted successfully. Summary length: ${summary.length} chars`,
      );

      this.telemetryService.capture('chat-history-compacted', {
        chat_id: chatId,
        messages_compacted: messagesForSummary.length,
        summary_length: summary.length,
      });
    } catch (error) {
      this.logger.debug('[AgentService] Failed to compact chat history', {
        cause: error,
      });
      this.telemetryService.captureException(error as Error);
    } finally {
      // Always reset the compacting flag
      this.isCompacting = false;
    }
  }

  private async undoToolCallsUntilLatestUserMessage(
    chatId: string,
  ): Promise<ChatMessage | null> {
    if (!this.undoToolCallStack.has(chatId)) return null;

    const chat = this.uiKarton.state.agentChat?.chats[chatId];
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
      'undo-changes',
    );
    return latestUserMessage;
  }

  private async undoToolCallsUntilUserMessage(
    userMessageId: string,
    chatId: string,
    type: 'restore-checkpoint' | 'undo-changes' = 'restore-checkpoint',
  ): Promise<void> {
    if (!this.undoToolCallStack.has(chatId)) return;

    const chat = this.uiKarton.state.agentChat?.chats[chatId];
    const history = chat?.messages ?? [];
    const userMessageIndex = history.findIndex(
      (m) => m.role === 'user' && 'id' in m && m.id === userMessageId,
    );

    const messagesAfterUserMessage =
      userMessageIndex !== -1 ? history.slice(userMessageIndex + 1) : [];

    const assistantMessagesAfterUserMessage = messagesAfterUserMessage.filter(
      (m) => m.role === 'assistant',
    );

    const toolCallIdsAfterUserMessage: string[] = [];
    for (const message of assistantMessagesAfterUserMessage) {
      for (const content of message.parts) {
        if (isToolCallType(content.type)) {
          toolCallIdsAfterUserMessage.push((content as ToolUIPart).toolCallId);
        }
      }
    }

    const idsAfter = new Set(toolCallIdsAfterUserMessage);
    const toolCallsUndone: Map<string, number> = new Map();

    while (
      this.undoToolCallStack.get(chatId)?.at(-1)?.toolCallId &&
      idsAfter.has(this.undoToolCallStack.get(chatId)?.at(-1)?.toolCallId!)
    ) {
      const undo = this.undoToolCallStack.get(chatId)?.pop();
      if (!undo) break;
      toolCallsUndone.set(
        undo.toolName,
        (toolCallsUndone.get(undo.toolName) ?? 0) + 1,
      );
      await undo.undoExecute?.();
    }

    this.uiKarton.setState((draft) => {
      if (userMessageIndex !== -1) {
        const chat = draft.agentChat?.chats[chatId];
        if (chat) chat.messages = history.slice(0, userMessageIndex) as any;
      }
    });

    this.telemetryService.capture('agent-undo-tool-calls', {
      chat_id: chatId,
      message_id: userMessageId,
      messages_undone_amount: {
        assistant: assistantMessagesAfterUserMessage.length,
        total: messagesAfterUserMessage.length,
      },
      tool_calls_undone_amount: Object.fromEntries(toolCallsUndone),
      type,
    });
  }

  /**
   * Collect LSP diagnostics for all files modified during this session.
   * Returns a Map of file paths to their aggregated diagnostics.
   */
  private async collectDiagnosticsForModifiedFiles(): Promise<DiagnosticsByFile> {
    const result: DiagnosticsByFile = new Map();

    if (!this.lspService || this.modifiedFilesThisSession.size === 0) {
      return result;
    }

    for (const filePath of this.modifiedFilesThisSession) {
      try {
        const diagnostics =
          await this.lspService.getDiagnosticsForFile(filePath);
        if (diagnostics.length > 0) result.set(filePath, diagnostics);
      } catch (err) {
        this.logger.debug('[AgentService] Failed to get diagnostics for file', {
          error: err,
          path: filePath,
        });
      }
    }

    return result;
  }

  public teardown() {
    this.removeServerProcedureHandlers();
    this.authService.unregisterAuthStateChangeCallback(this.onAuthStateChange);
    this.cleanupPendingOperations('Agent teardown');

    // Teardown LspService
    void this.lspService?.teardown();
    this.lspService = null;

    // Clear modified files tracking
    this.modifiedFilesThisSession.clear();

    this.logger.debug('[AgentService] Shutdown complete');
  }

  public static async create(
    logger: Logger,
    telemetryService: TelemetryService,
    uiKarton: KartonService,
    globalConfigService: GlobalConfigService,
    authService: AuthService,
    windowLayoutService: WindowLayoutService,
    onSaveSetupInformation: (params: {
      agentAccessPath: string;
      ide: string | undefined;
      appPath: string;
    }) => Promise<void>,
    globalDataPathService: GlobalDataPathService,
  ) {
    const instance = new AgentService(
      logger,
      telemetryService,
      uiKarton,
      globalConfigService,
      authService,
      windowLayoutService,
      globalDataPathService,
      onSaveSetupInformation,
    );
    await instance.initialize();
    logger.debug('[AgentService] Created service');
    return instance;
  }

  /**
   * Performs a warm-up request to the LLM to ensure the cache is seeded and latency is minimized.
   * @returns The response from the warm-up request.
   */
  private async warmUpLLMProxyCache() {
    if (!this.litellm) {
      this.logger.debug(
        '[AgentService] No litellm available. Warm up request failed, please initialize litellm before using the agent.',
      );
      return;
    }
    return generateText({
      model: this.telemetryService.withTracing(
        this.litellm('claude-haiku-4-5'),
        {
          posthogTraceId: 'warm-up-request',
          posthogProperties: {
            $ai_span_name: 'warm-up-request',
          },
        },
      ),
      temperature: 0.1,
      maxOutputTokens: 100,
      providerOptions: {
        anthropic: {
          thinking: {
            type: 'disabled',
          },
        } satisfies AnthropicProviderOptions,
      },
      messages: [
        { role: 'system', content: 'Respond with "Hey there!"' },
        { role: 'user', content: 'Hey bud!' },
      ],
    }).catch((error) => {
      this.logger.debug('[AgentService] Failed to warm up LLM proxy cache', {
        cause: error,
      });
    });
  }

  private async handleStreamingError(
    error: { error: unknown },
    chatId: string,
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
        hasSubscription: this.uiKarton.state.userAccount?.subscription?.active,
        isPaidPlan: planLimitsExceededError.data.isPaidPlan || false,
        cooldownMinutes: planLimitsExceededError.data.cooldownMinutes,
      });

      this.uiKarton.setState((draft) => {
        const chat = draft.agentChat?.chats[chatId];
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
      this.logger.debug('[Agent Service]: Error', error.error);
      this.authRetryCount++;

      // Auth service will handle token refresh internally
      // We just need to reinitialize our client and litellm
      await this.initializeClient();
      await this.initializeLitellm();

      const messages = this.uiKarton.state.agentChat?.chats[chatId]?.messages;
      await this.callAgent({
        chatId,
        history: messages,
      });
      return;
    } else if (
      isAuthenticationError(error.error) &&
      this.authRetryCount >= this.maxAuthRetries
    ) {
      this.authRetryCount = 0;
      this.setAgentWorking(false);
      this.uiKarton.setState((draft) => {
        const chat = draft.agentChat?.chats[chatId];
        if (chat) {
          chat.error = {
            type: AgentErrorType.AGENT_ERROR,
            error: {
              message: 'Authentication failed, please restart the app.',
              code: '401',
              errorType: 'AI_APICallError',
            },
          };
        }
      });
      return;
    } else if (isContextLimitError(error.error)) {
      this.uiKarton.setState((draft) => {
        const chat = draft.agentChat?.chats[chatId];
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
      this.logger.debug(`[Agent Service] Agent failed: ${error.error}`);
      this.telemetryService.captureException(error.error as Error);
      const structuredError = extractStructuredError(error.error);
      this.setAgentWorking(false);
      this.uiKarton.setState((draft) => {
        const chat = draft.agentChat?.chats[chatId];
        if (chat) {
          chat.error = {
            type: AgentErrorType.AGENT_ERROR,
            error: structuredError,
          };
        }
      });
    }
  }
}
