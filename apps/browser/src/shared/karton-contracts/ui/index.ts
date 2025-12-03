import type {
  AskForAppPathOutput,
  AskForDevScriptIntegrationOutput,
  AskForAgentAccessPathOutput,
  InspirationComponent,
  AskForIdeOutput,
} from '@stagewise/agent-tools';
import type {
  UserMessageMetadata,
  SelectedElement,
  BrowserData,
  ReactSelectedElementInfo,
} from './metadata';
import type {
  UIMessage,
  UIDataTypes,
  UIMessagePart as AIMessagePart,
} from 'ai';
import type { UITools, ToolPart } from '@stagewise/agent-tools';
import type { FileDiff } from '@stagewise/agent-types';
import type {
  WorkspaceConfig,
  FilePickerRequest,
  GlobalConfig,
} from './shared-types';

export type ChatMessage = UIMessage<UserMessageMetadata, UIDataTypes, UITools>;
export type {
  UserMessageMetadata,
  SelectedElement,
  BrowserData,
  ReactSelectedElementInfo,
};
export type UIMessagePart = AIMessagePart<UIDataTypes, UITools>;

export type { FileDiff };

export type {
  TextUIPart,
  FileUIPart,
  ReasoningUIPart,
  DynamicToolUIPart,
  ToolUIPart,
} from 'ai';

export type { ToolPart };

export type History = ChatMessage[];

type ChatId = string;

export type Chat = {
  title: string;
  createdAt: Date;
  messages: History;
  error?: AgentError;
  usage: { maxContextWindowSize: number; usedContextWindowSize: number };
};

export enum AgentErrorType {
  INSUFFICIENT_CREDITS = 'insufficient-credits-message',
  PLAN_LIMITS_EXCEEDED = 'plan-limits-exceeded',
  CONTEXT_LIMIT_EXCEEDED = 'context-limit-exceeded',
  AGENT_ERROR = 'agent-error',
  OTHER = 'other',
}

export type WorkspaceStatus =
  | 'open'
  | 'closed'
  | 'loading'
  | 'closing'
  | 'setup';

export enum Layout {
  SIGNIN = 'signin',
  OPEN_WORKSPACE = 'open-workspace',
  SETUP_WORKSPACE = 'setup-workspace',
  MAIN = 'main',
}

export enum MainTab {
  DEV_APP_PREVIEW = 'dev-app-preview',
  IDEATION_CANVAS = 'ideation-canvas',
  SETTINGS = 'settings',
}

export type AgentError =
  | {
      type: AgentErrorType.INSUFFICIENT_CREDITS;
      error: { name: string; message: string };
    }
  | {
      type: AgentErrorType.PLAN_LIMITS_EXCEEDED;
      error: {
        name: string;
        message: string;
        isPaidPlan: boolean;
        cooldownMinutes?: number;
      };
    }
  | {
      type: AgentErrorType.CONTEXT_LIMIT_EXCEEDED;
      error: { name: string; message: string };
    }
  | {
      type: AgentErrorType.AGENT_ERROR;
      error: { name: string; message: string };
    }
  | {
      type: AgentErrorType.OTHER;
      error: { name: string; message: string };
    };

export type TabState = {
  id: string;
  title: string;
  url: string;
  faviconUrls: string[];
  isLoading: boolean;
  isResponsive: boolean;
  error: {
    code: number;
    message?: string;
  } | null;
  navigationHistory: {
    canGoBack: boolean;
    canGoForward: boolean;
  };
  devToolsOpen: boolean;
};

export type HistoryEntry = {
  url: string;
  title: string;
  faviconUrls: string[];
  lastVisitedAt: Date;
};

export type AppState = {
  internalData: {
    posthog?: {
      apiKey?: string;
      host?: string;
    };
  };
  workspace: {
    path: string;
    paths: {
      data: string;
      temp: string;
    };
    devAppStatus: {
      contentAvailableOnPort: boolean; // Is true, if the CLI detected that there is content available on the configured dev app port.
      childProcessRunning: boolean;
      childProcessPid: number | null;
      childProcessOwnedPorts: number[];
      lastChildProcessError: { message: string; code: number } | null;
      wrappedCommand: string | null; // Will only be true on the initially loaded workspace if stagewise directly wraps a command.
    } | null;
    agent: {
      accessPath: string;
    } | null;
    agentChat: {
      activeChatId: ChatId | null;
      chats: Record<ChatId, Chat>;
      toolCallApprovalRequests: string[];
      isWorking: boolean;
    } | null;
    inspirationComponents: InspirationComponent[];
    config: WorkspaceConfig | null;
    plugins:
      | ({
          name: string;
          bundled: boolean;
          available: boolean;
          error?: string;
        } & ({ url: string } | { path: string }))[]
      | null; // The list of plugins that were loaded in the workspace
    setupActive: boolean;
    rag: {
      lastIndexedAt: Date | null;
      indexedFiles: number;
      statusInfo:
        | {
            isIndexing: true;
            indexProgress: number;
            indexTotal: number;
          }
        | { isIndexing: false }
        | { isIndexing: false; hasError: true; error: string };
    };
    loadedOnStart: boolean;
    childWorkspacePaths: string[]; // List of paths that are child paths of the currently opened workspace.
  } | null;
  workspaceStatus: WorkspaceStatus;
  recentWorkspaces: string[]; // List of paths to recent workspaces.
  userAccount: {
    status: AuthStatus;
    machineId?: string;
    pendingAuthenticationConfirmation?: boolean;
    user?: {
      id: string;
      email: string;
    };
    subscription?: {
      active: boolean;
      plan?: string;
      expiresAt?: string;
    };
    tokenExpiresAt?: string;
    refreshTokenExpiresAt?: string;
  };
  // Current stagewise app runtime information
  appInfo: {
    envMode: 'development' | 'production'; // The mode in which the app is running.
    verbose: boolean; // Whether the app is running in verbose mode.
    version: string; // The version of the app.
    startedInPath: string; // Working directory in which the app was started.
  };
  // The global configuration of the CLI.
  globalConfig: GlobalConfig;
  // State of the current user experience (getting started etc.)
  userExperience:
    | {
        activeLayout:
          | Layout.SIGNIN
          | Layout.OPEN_WORKSPACE
          | Layout.SETUP_WORKSPACE;
      }
    | ({
        activeLayout: Layout.MAIN;
      } & (
        | {
            activeMainTab: MainTab.IDEATION_CANVAS | MainTab.SETTINGS | null;
          }
        | {
            activeMainTab: MainTab.DEV_APP_PREVIEW;
            devAppPreview: {
              isFullScreen: boolean;
              inShowCodeMode: boolean;
              customScreenSize: {
                width: number;
                height: number;
                presetName: string; // Preset can be a name like "mobile" or "iPhone 13" or whatever
              } | null;
            };
          }
      ));
  // State of the notification service.
  notifications: {
    id: string;
    title: string | null;
    message: string | null;
    type: 'info' | 'warning' | 'error';
    duration?: number; // Duration in milliseconds. Will never auto-dismiss if not set.
    actions: {
      label: string;
      type: 'primary' | 'secondary' | 'destructive';
    }[]; // Allows up to three actions. Every action except for the first will be rendered as secondary. More than three actions will be ignored. Clicking on an action will also dismiss the notification.
  }[];

  // Browser state
  browser: {
    tabs: Record<string, TabState>;
    activeTabId: string | null;
    history: HistoryEntry[];
    contextSelectionMode: boolean;
  };
};

export type AuthStatus =
  | 'authenticated'
  | 'unauthenticated'
  | 'authentication_invalid'
  | 'server_unreachable';

export type KartonContract = {
  state: AppState;
  clientProcedures: {
    devAppPreview: {
      getPreviewInfo: () => Promise<BrowserData>;
    };
  };
  serverProcedures: {
    agentChat: {
      create: () => Promise<string>;
      switch: (chatId: string) => Promise<void>;
      delete: (chatId: string) => Promise<void>;
      sendUserMessage: (message: ChatMessage) => Promise<void>;
      retrySendingUserMessage: () => Promise<void>;
      abortAgentCall: () => Promise<void>;
      approveToolCall: (toolCallId: string) => Promise<void>;
      rejectToolCall: (toolCallId: string) => Promise<void>;
      submitUserInteractionToolInput: (
        toolCallId: string,
        input:
          | (AskForAppPathOutput & { type: 'askForAppPathTool' })
          | (AskForAgentAccessPathOutput & {
              type: 'askForAgentAccessPathTool';
            })
          | (AskForDevScriptIntegrationOutput & {
              type: 'askForDevScriptIntegrationTool';
            })
          | (AskForIdeOutput & {
              type: 'askForIdeTool';
              ide: AskForIdeOutput['ide'];
            }),
      ) => Promise<{ success: true } | { success: false; error: string }>; // Returns zod validation success or failure
      cancelUserInteractionToolInput: (toolCallId: string) => Promise<void>; // Cancels the user interaction tool input.
      undoToolCallsUntilUserMessage: (
        userMessageId: string,
        chatId: string,
        shouldUndoUserMessage?: boolean,
      ) => Promise<void>;
      undoToolCallsUntilLatestUserMessage: (
        chatId: string,
      ) => Promise<ChatMessage | null>;
      assistantMadeCodeChangesUntilLatestUserMessage: (
        chatId: string,
      ) => Promise<boolean>;
      enrichSelectedElement: (
        element: SelectedElement,
      ) => Promise<SelectedElement>; // Returns the same selected element but with additional context information (related source files etc.).
    };
    userAccount: {
      refreshStatus: () => Promise<void>;
      refreshSubscription: () => Promise<void>;
      logout: () => Promise<void>;
      startLogin: () => Promise<void>;
      confirmAuthenticationConfirmation: () => Promise<void>;
      cancelAuthenticationConfirmation: () => Promise<void>;
    };
    workspace: {
      open: (path: string) => Promise<void>;
      close: () => Promise<void>;
      getGitRepoRoot: () => Promise<string>;
      setup: {
        submit: (config: WorkspaceConfig) => Promise<void>;
        checkForActiveAppOnPort: (port: number) => Promise<boolean>;
        resolveRelativePathToAbsolutePath: (
          relativePath: string,
          basePath?: string,
        ) => Promise<string | null>;
      };
      config: {
        set: (config: WorkspaceConfig) => Promise<void>;
      };
      devAppState: {
        start: () => Promise<void>;
        stop: () => Promise<void>;
        restart: () => Promise<void>;
      };
    };
    userExperience: {
      mainLayout: {
        changeTab: (tab: MainTab) => Promise<void>;
        mainLayout: {
          devAppPreview: {
            toggleFullScreen: () => Promise<void>;
            toggleShowCodeMode: () => Promise<void>;
            changeScreenSize: (
              size: {
                width: number;
                height: number;
                presetName: string;
              } | null,
            ) => Promise<void>;
          };
        };
      };
    };
    filePicker: {
      createRequest: (request: FilePickerRequest) => Promise<string[]>;
    };
    notifications: {
      triggerAction: (id: string, actionIndex: number) => Promise<void>;
      dismiss: (id: string) => Promise<void>;
    };
    config: {
      set: (config: GlobalConfig) => Promise<void>;
    };
    browser: {
      createTab: (url?: string) => Promise<void>;
      closeTab: (tabId: string) => Promise<void>;
      switchTab: (tabId: string) => Promise<void>;
      layout: {
        // This is called when the webcontents view is resized or moved or whatever. It's used to notify the main window about the new bounds that the webcontents view should have.
        update: (
          bounds: {
            x: number;
            y: number;
            width: number;
            height: number;
          } | null,
        ) => Promise<void>;
        // When the webcontents view is hovered over, the UI will be called to notify so that the backend will manage the interactvity of UI and the web contents view accordingly.
        changeInteractivity: (interactive: boolean) => Promise<void>;
      };
      stop: (tabId?: string) => Promise<void>;
      reload: (tabId?: string) => Promise<void>;
      goto: (url: string, tabId?: string) => Promise<void>;
      goBack: (tabId?: string) => Promise<void>;
      goForward: (tabId?: string) => Promise<void>;
      toggleDevTools: (tabId?: string) => Promise<void>;
      openDevTools: (tabId?: string) => Promise<void>;
      closeDevTools: (tabId?: string) => Promise<void>;
      setContextSelectionMode: (active: boolean) => Promise<void>;
    };
  };
};

export const defaultState: KartonContract['state'] = {
  internalData: {
    posthog: {
      apiKey: import.meta.env.VITE_POSTHOG_API_KEY,
      host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
    },
  },
  workspace: null,
  workspaceStatus: 'closed',
  recentWorkspaces: [],
  userAccount: {
    status: 'unauthenticated',
  },
  appInfo: {
    envMode: 'production',
    verbose: false,
    version: 'UNKNOWN',
    startedInPath: '',
  },
  globalConfig: {
    telemetryLevel: 'full',
    openFilesInIde: 'other',
  },
  userExperience: {
    activeLayout: Layout.SIGNIN,
  },
  notifications: [],
  browser: {
    tabs: {},
    activeTabId: null,
    history: [],
    contextSelectionMode: false,
  },
};
