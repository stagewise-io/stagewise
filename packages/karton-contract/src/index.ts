import type {
  AskForAppPathOutput,
  AskForDevScriptIntegrationOutput,
  AskForPortOutput,
  AskForAgentAccessPathOutput,
  InspirationComponent,
  AskForIdeOutput,
} from '@stagewise/agent-tools';
import type {
  UserMessageMetadata,
  SelectedElement,
  BrowserData,
  ReactSelectedElementInfo,
} from './metadata.js';
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
} from './shared-types.js';

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
      cache: string;
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
    loginDialog: {
      startUrl: string;
    } | null;
  };
  // Current stagewise app runtime information
  appInfo: {
    bridgeMode: boolean; // Older deprecated flag
    envMode: 'development' | 'production'; // The mode in which the app is running.
    verbose: boolean; // Whether the app is running in verbose mode.
    version: string; // The version of the app.
    runningOnPort: number; // The port on which the UI of the stagewise app is running.
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
  filePicker: {
    title: string;
    description: string;
    mode: 'file' | 'directory';
    multiple: boolean;
    currentPath: string; // The current path of the selector dialog.
    parentSiblings: { path: string; type: 'directory' | 'file' }[][]; // Shows a list of sibling directories for each parent directory level.
    children: { path: string; type: 'directory' | 'file' }[]; // Shows a list of child entities for the current path.
  } | null;
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

  // Status of the web content view.
  webContent: {
    title: string; // The title of the web content view.
    faviconUrls: string[]; // A list of URLs that represent the favicon of the webview.
    url: string; // The current URL of the web content view.
    devToolsOpen: boolean; // If true, the developer tools are open.
    isLoading: boolean; // If true, the web content view is loading.
    isResponsive: boolean; // If false, the web content view is not responsive and the user probably won't be able interact with it.
    error: {
      code: number;
      message?: string;
    } | null; // The error code of the web content view. If null, there is no error. Error should replace the currently displayed content with an error page.
    navigationHistory: {
      canGoBack: boolean;
      canGoForward: boolean;
    }; // The navigation history of the web content view.
  } | null;
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
          | (AskForPortOutput & { type: 'askForPortTool' })
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
      abortLogin: () => Promise<void>;
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
      changeDirectory: (path: string) => Promise<void>;
      dismiss: () => Promise<void>; // Closes the picker dialog.
      createFolder: (path: string) => Promise<void>; // Creates a new folder in the specified path.
      select: (path: string[]) => Promise<void>; // Notifies about final selection of the specified paths.
    };
    notifications: {
      triggerAction: (id: string, actionIndex: number) => Promise<void>;
      dismiss: (id: string) => Promise<void>;
    };
    config: {
      set: (config: GlobalConfig) => Promise<void>;
    };
    webContent: {
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
      stop: () => Promise<void>;
      reload: () => Promise<void>;
      goto: (url: string) => Promise<void>;
      goBack: () => Promise<void>;
      goForward: () => Promise<void>;
      toggleDevTools: () => Promise<void>;
      openDevTools: () => Promise<void>;
      closeDevTools: () => Promise<void>;
    };
  };
};

export const defaultState: KartonContract['state'] = {
  internalData: {
    posthog: {
      apiKey: process.env.POSTHOG_API_KEY,
      host: process.env.POSTHOG_HOST || 'https://eu.i.posthog.com',
    },
  },
  workspace: null,
  workspaceStatus: 'closed',
  recentWorkspaces: [],
  userAccount: {
    status: 'unauthenticated',
    loginDialog: null,
  },
  appInfo: {
    bridgeMode: false,
    envMode: 'production',
    verbose: false,
    version: 'UNKNOWN',
    runningOnPort: 0,
    startedInPath: '',
  },
  globalConfig: {
    telemetryLevel: 'full',
    openFilesInIde: 'other',
  },
  userExperience: {
    activeLayout: Layout.SIGNIN,
  },
  filePicker: null,
  notifications: [],
  webContent: null,
};
