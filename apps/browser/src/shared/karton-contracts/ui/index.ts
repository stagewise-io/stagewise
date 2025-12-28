import { z } from 'zod';
import type {
  AskForAppPathOutput,
  AskForAgentAccessPathOutput,
  AskForIdeOutput,
} from '@stagewise/agent-tools';
import type { UserMessageMetadata, BrowserData } from './metadata';
import type { ReactSelectedElementInfo } from '../../selected-elements/react';
import type { AppRouter, TRPCClient } from '@stagewise/api-client';
import type { SelectedElement } from '../../selected-elements';
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
import type { PageTransition } from '../pages-api/types';

export type ChatMessage = UIMessage<UserMessageMetadata, UIDataTypes, UITools>;
export type { UserMessageMetadata, BrowserData, ReactSelectedElementInfo };
export type { SelectedElement } from '../../selected-elements';
export type UIMessagePart = AIMessagePart<UIDataTypes, UITools>;

export type InspirationWebsite = Awaited<
  ReturnType<TRPCClient<AppRouter>['inspiration']['list']['query']>
>;

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

export const recentlyOpenedWorkspaceSchema = z.object({
  path: z.string(),
  name: z.string(),
  openedAt: z.number(),
});

export const recentlyOpenedWorkspacesArraySchema = z.array(
  recentlyOpenedWorkspaceSchema,
);

export const storedExperienceDataSchema = z.object({
  recentlyOpenedWorkspaces: recentlyOpenedWorkspacesArraySchema,
  hasSeenOnboardingFlow: z.boolean(),
});

export type StoredExperienceData = z.infer<typeof storedExperienceDataSchema>;

export type RecentlyOpenedWorkspace = z.infer<
  typeof recentlyOpenedWorkspaceSchema
>;

export enum Layout {
  SIGNIN = 'signin',
  MAIN = 'main',
}

export enum MainTab {
  BROWSING = 'browsing',
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

export type ColorScheme = 'system' | 'light' | 'dark';

export type TabState = {
  id: string;
  title: string;
  url: string;
  faviconUrls: string[];
  isLoading: boolean;
  isResponsive: boolean;
  isPlayingAudio: boolean;
  isMuted: boolean;
  colorScheme: ColorScheme;
  error: {
    code: number;
    message?: string;
  } | null;
  navigationHistory: {
    canGoBack: boolean;
    canGoForward: boolean;
  };
  devToolsOpen: boolean;
  screenshot: string | null; // Data URL of the tab screenshot
  search: {
    text: string;
    resultsCount: number;
    activeMatchIndex: number; // 1-indexed position of current match
  } | null;
  zoomPercentage: number; // Page zoom level as percentage (100 = default)
  lastFocusedAt: number; // Timestamp (Date.now()) of when this tab was last focused
  handle: string; // Human-readable handle for LLM addressing (e.g., t_1, t_2)
  consoleLogCount: number; // Total number of console logs captured since page load
  consoleErrorCount: number; // Number of error-level console logs
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
  agentChat: {
    activeChatId: ChatId | null;
    chats: Record<ChatId, Chat>;
    toolCallApprovalRequests: string[];
    isWorking: boolean;
  } | null;
  workspace: {
    path: string;
    paths: {
      data: string;
      temp: string;
    };
    agent: {
      accessPath: string;
    } | null;
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
    platform: 'darwin' | 'linux' | 'win32'; // The platform on which the app is running.
    isFullScreen: boolean; // Whether the app window is in fullscreen mode.
  };
  // The global configuration of the CLI.
  globalConfig: GlobalConfig;
  // State of the current user experience (getting started etc.)
  userExperience: {
    storedExperienceData: StoredExperienceData;
    inspirationWebsites: InspirationWebsite;
  } & (
    | {
        activeLayout: Layout.SIGNIN;
      }
    | {
        activeLayout: Layout.MAIN;
        activeMainTab: MainTab.BROWSING;
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
  );
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
    selectedElements: SelectedElement[];
    hoveredElement: SelectedElement | null;
    viewportSize: {
      top: number;
      left: number;
      width: number;
      height: number;
      scale: number;
    } | null;
    isSearchBarActive: boolean;
    // Screenshots of selected elements to be auto-attached to chat
    pendingElementScreenshots: {
      id: string; // Unique ID for this screenshot
      elementId: string; // stagewiseId of the element
      dataUrl: string; // Base64 data URL of the screenshot
    }[];
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
      open: (path?: string) => Promise<void>;
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
      inspiration: {
        loadMore: () => Promise<void>;
      };
      storedExperienceData: {
        setHasSeenOnboardingFlow: (value: boolean) => Promise<void>;
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
      createTab: (url?: string, setActive?: boolean) => Promise<void>;
      closeTab: (tabId: string) => Promise<void>;
      switchTab: (tabId: string) => Promise<void>;
      reorderTabs: (tabIds: string[]) => Promise<void>;
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
        togglePanelKeyboardFocus: (
          panel: 'stagewise-ui' | 'tab-content',
        ) => Promise<void>;
        movePanelToForeground: (
          panel: 'stagewise-ui' | 'tab-content',
        ) => Promise<void>;
      };
      stop: (tabId?: string) => Promise<void>;
      reload: (tabId?: string) => Promise<void>;
      goto: (
        url: string,
        tabId?: string,
        transition?: PageTransition,
      ) => Promise<void>;
      goBack: (tabId?: string) => Promise<void>;
      goForward: (tabId?: string) => Promise<void>;
      toggleDevTools: (tabId?: string) => Promise<void>;
      openDevTools: (tabId?: string) => Promise<void>;
      closeDevTools: (tabId?: string) => Promise<void>;
      setAudioMuted: (muted: boolean, tabId?: string) => Promise<void>;
      toggleAudioMuted: (tabId?: string) => Promise<void>;
      setColorScheme: (scheme: ColorScheme, tabId?: string) => Promise<void>;
      cycleColorScheme: (tabId?: string) => Promise<void>;
      setZoomPercentage: (percentage: number, tabId?: string) => Promise<void>;
      contextSelection: {
        setActive: (active: boolean) => Promise<void>;
        setMouseCoordinates: (x: number, y: number) => Promise<void>; // Used by the client to communicate where the mouse is currently located. Will be forwarded to the tab to check which element is at that point.
        clearMouseCoordinates: () => Promise<void>; // Clears the mouse position to stop hit testing when mouse leaves the selector bounds
        passthroughWheelEvent: (event: {
          type: 'wheel';
          x: number;
          y: number;
          deltaX: number;
          deltaY: number;
        }) => Promise<void>; // Used by the client to pass through wheel events to the tab.
        selectHoveredElement: () => Promise<void>; // If the user triggers the element to actually be selected as context, this will trigger a storage operation on the server side.
        removeElement: (elementId: string) => Promise<void>;
        clearElements: () => Promise<void>; // Removes all elements from selection
        clearPendingScreenshots: () => Promise<void>; // Clears pending element screenshots after UI has picked them up
      };
      scrollToElement: (
        tabId: string,
        backendNodeId: number,
        frameId: string,
      ) => Promise<void>; // Scrolls to an element in the specified tab
      checkFrameValidity: (
        tabId: string,
        frameId: string,
        expectedFrameLocation: string,
      ) => Promise<boolean>; // Checks if a frame exists and is at the expected location
      checkElementExists: (
        tabId: string,
        backendNodeId: number,
        frameId: string,
      ) => Promise<boolean>; // Checks if an element exists in the DOM
      searchInPage: {
        start: (searchText: string, tabId?: string) => Promise<void>;
        updateText: (searchText: string, tabId?: string) => Promise<void>;
        next: (tabId?: string) => Promise<void>;
        previous: (tabId?: string) => Promise<void>;
        stop: (tabId?: string) => Promise<void>;
      };
      searchBar: {
        activate: () => Promise<void>;
        deactivate: () => Promise<void>;
      };
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
  agentChat: null,
  workspace: null,
  workspaceStatus: 'closed',
  userAccount: {
    status: 'unauthenticated',
  },
  appInfo: {
    envMode: 'production',
    verbose: false,
    version: 'UNKNOWN',
    startedInPath: '',
    platform: 'darwin',
    isFullScreen: false,
  },
  globalConfig: {
    telemetryLevel: 'full',
    openFilesInIde: 'other',
  },
  userExperience: {
    storedExperienceData: {
      recentlyOpenedWorkspaces: [],
      hasSeenOnboardingFlow: false,
    },
    activeLayout: Layout.SIGNIN,
    inspirationWebsites: {
      websites: [],
      total: 0,
      seed: '',
    },
  },
  notifications: [],
  browser: {
    tabs: {},
    activeTabId: null,
    history: [],
    contextSelectionMode: false,
    selectedElements: [],
    hoveredElement: null,
    viewportSize: null,
    isSearchBarActive: false,
    pendingElementScreenshots: [],
  },
};
