import type {
  AskForAppPathOutput,
  AskForPortOutput,
  AskForRootProjectPathOutput,
} from '@stagewise/agent-tools';
import type {
  UserMessageMetadata,
  SelectedElement,
  BrowserData,
} from './metadata.js';
import type { UIMessage, UIDataTypes } from 'ai';
import type { UITools, ToolPart } from '@stagewise/agent-tools';
import type { FileDiff, ToolResult } from '@stagewise/agent-types';
import type { WorkspaceConfig, FilePickerRequest } from './shared-types.js';

export type ChatMessage = UIMessage<UserMessageMetadata, UIDataTypes, UITools>;
export type { UserMessageMetadata, SelectedElement, BrowserData };

export type { FileDiff, ToolResult };

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
};

export enum AgentErrorType {
  INSUFFICIENT_CREDITS = 'insufficient-credits-message',
  PLAN_LIMITS_EXCEEDED = 'plan-limits-exceeded',
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
    devAppStatus: {
      status: 'running-as-wrapped-command' | 'not-running' | 'unknown';
      contentAvailableOnPort: boolean; // Is true, if the CLI detects that there is content available on the configured dev app port.
    } | null;
    agentChat: {
      activeChatId: ChatId | null;
      chats: Record<ChatId, Chat>;
      toolCallApprovalRequests: string[];
      isWorking: boolean;
    } | null;
    config: {
      appPort: number;
      eddyMode: 'flappy' | undefined;
      autoPlugins: boolean;
      plugins: (
        | string
        | {
            name: string;
            path?: string | undefined;
            url?: string | undefined;
          }
      )[]; // A list of plugins that the user defined in the config.
    } | null;
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
        | { isIndexing: false; error?: string };
    };
    loadedOnStart: boolean;
  } | null;
  workspaceStatus: WorkspaceStatus;
  userAccount: {
    status: AuthStatus;
    machineId?: string;
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
  globalConfig: {
    telemetryLevel: 'off' | 'anonymous' | 'full';
  };
  // State of the current user experience (getting started etc.)
  userExperience:
    | {
        activeLayout:
          | Layout.SIGNIN
          | Layout.OPEN_WORKSPACE
          | Layout.SETUP_WORKSPACE;
      }
    | {
        activeLayout: Layout.MAIN;
        activeMainTab: MainTab | null;
      };
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
      getPreviewInfo: () => Promise<{
        viewport: {
          width: number;
          height: number;
          dpr: number;
        };
        currentUrl: string;
        currentTitle: string;
        userAgent: string;
        locale: string;
        prefersDarkMode: boolean;
      }>;
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
          | (AskForRootProjectPathOutput & {
              type: 'askForRootProjectPathTool';
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
    };
    userAccount: {
      refreshStatus: () => Promise<void>;
      refreshSubscription: () => Promise<void>;
      logout: () => Promise<void>;
      startLogin: () => Promise<void>;
      abortLogin: () => Promise<void>;
    };
    workspace: {
      open: (path: string) => Promise<void>;
      close: () => Promise<void>;
      setup: {
        submit: (config: WorkspaceConfig) => Promise<void>;
        checkForActiveAppOnPort: (port: number) => Promise<boolean>;
      };
    };
    userExperience: {
      mainLayout: {
        changeTab: (tab: MainTab) => Promise<void>;
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
    telemetryLevel: 'off',
  },
  userExperience: {
    activeLayout: Layout.SIGNIN,
  },
  filePicker: null,
  notifications: [],
};
