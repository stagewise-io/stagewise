import { z } from 'zod';
import type { ModelId } from '@shared/available-models';
import type { PluginDefinition } from '@shared/plugins';
import type { SkillDefinitionUI } from '@shared/skills';
import type {
  UserMessageMetadata,
  MountPermission,
  MentionFileCandidate,
  AttachmentMetadata,
} from './agent/metadata';
import type { ReactSelectedElementInfo } from '../../selected-elements/react';
import type { ApiClient } from '@stagewise/api-client';
import type { SelectedElement } from '../../selected-elements';
import type { FileDiff } from './shared-types';
import type { QuestionField, QuestionAnswerValue } from './agent/tools/types';
import type {
  FilePickerRequest,
  GlobalConfig,
  ModelSettings,
  ModelProvider,
  UserPreferences,
  Patch,
  SearchEngine,
  ConfigurablePermissionType,
  PermissionsPreferences,
  HostPermissionException,
  DefaultPermissionSettings,
  HostPermissionOverrides,
  WidgetId,
  DevToolbarOriginSettings,
} from './shared-types';
import {
  defaultUserPreferences,
  PermissionSetting,
  configurablePermissionTypes,
} from './shared-types';
import type { PageTransition, DownloadState } from '../pages-api/types';
import type {
  AgentState,
  AgentTypes,
  AgentHistoryEntry,
  AgentMessage,
} from './agent';

/** Speed data point for download speed history */
export type DownloadSpeedDataPoint = {
  /** Unix timestamp in ms */
  timestamp: number;
  /** Speed in KB/s */
  speedKBps: number;
  /** Total bytes received at this point */
  totalBytes: number;
};

/** Summary download info for the control button display */
export type DownloadSummary = {
  /** Download ID */
  id: number;
  /** Filename */
  filename: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Whether this is an active/running download */
  isActive: boolean;
  /** Download state */
  state: DownloadState;
  /** Whether the download is paused (only for active) */
  isPaused?: boolean;
  /** Target path on disk */
  targetPath: string;
  /** Download start time */
  startTime: Date;
  /** Download end time (for completed) */
  endTime?: Date;
  /** Current download speed in KB/s (only for active downloads) */
  currentSpeedKBps?: number;
  /** Speed history for graphing (up to 100 data points covering 10 minutes) */
  speedHistory?: DownloadSpeedDataPoint[];
};
export type { UserMessageMetadata, ReactSelectedElementInfo };
export type { SelectedElement } from '../../selected-elements';

export type InspirationWebsite = NonNullable<
  Awaited<ReturnType<ApiClient['v1']['inspiration']['get']>>['data']
>;

export type {
  TextUIPart,
  FileUIPart,
  ReasoningUIPart,
  DynamicToolUIPart,
  ToolUIPart,
} from 'ai';

// Permission settings types (Chrome-style model)
export type {
  ConfigurablePermissionType,
  PermissionsPreferences,
  HostPermissionException,
  DefaultPermissionSettings,
  HostPermissionOverrides,
};
export { PermissionSetting, configurablePermissionTypes };

// Dev toolbar types
export type { WidgetId, DevToolbarOriginSettings };

// Provider configuration types
export type {
  ModelProvider,
  ProviderEndpointMode,
  ProviderConfig,
  ProviderConfigs,
} from './shared-types';
export {
  PROVIDER_OFFICIAL_URLS,
  PROVIDER_DISPLAY_INFO,
} from './shared-types';

// Custom endpoint & model types
export type {
  ApiSpec,
  CustomEndpoint,
  CustomModel,
  ModelCapabilities,
} from './shared-types';
export { apiSpecSchema } from './shared-types';

// Update channel types
export type { UpdateChannel } from './shared-types';

/**
 * Lightweight chat metadata for the chat history list.
 * Does not include messages - those are loaded on demand.
 */
export type ChatSummary = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

export const recentlyOpenedWorkspaceSchema = z.object({
  path: z.string(),
  name: z.string(),
  openedAt: z.number(),
});

export const recentlyOpenedWorkspacesArraySchema = z.array(
  recentlyOpenedWorkspaceSchema,
);

/** Schema for onboarding state persisted data */
export const onboardingStateSchema = z.object({
  hasSeenOnboardingFlow: z.boolean(),
});

export type OnboardingState = z.infer<typeof onboardingStateSchema>;

/** Schema for downloads state persisted data */
export const downloadsStateSchema = z.object({
  /** ISO timestamp when downloads were last marked as seen */
  lastSeenAt: z.string().nullable(),
});

export type DownloadsState = z.infer<typeof downloadsStateSchema>;

export const lastViewedChatsSchema = z.record(z.string(), z.number());

export const storedExperienceDataSchema = z.object({
  recentlyOpenedWorkspaces: recentlyOpenedWorkspacesArraySchema,
  hasSeenOnboardingFlow: z.boolean().nullable(),
  lastViewedChats: lastViewedChatsSchema,
});

export type StoredExperienceData = z.infer<typeof storedExperienceDataSchema>;

export type RecentlyOpenedWorkspace = z.infer<
  typeof recentlyOpenedWorkspaceSchema
>;

export type ColorScheme = 'system' | 'light' | 'dark';

// ============================================================================
// Permission Request Types
// ============================================================================

/** Types of permissions that can be requested */
export type PermissionRequestType =
  | 'media'
  | 'geolocation'
  | 'notifications'
  | 'fullscreen'
  | 'bluetooth'
  | 'hid'
  | 'serial'
  | 'usb'
  | 'bluetooth-pairing'
  | 'clipboard-read'
  | 'display-capture'
  | 'midi'
  | 'idle-detection'
  | 'speaker-selection'
  | 'storage-access';

/** Media types for camera/microphone distinction */
export type MediaType = 'video' | 'audio'; // video = camera, audio = microphone

/** Base permission request with shared properties */
export interface BasePermissionRequest {
  /** Unique identifier for this request */
  id: string;
  /** Timestamp when request was created */
  timestamp: number;
  /** The type of permission being requested */
  type: PermissionRequestType;
  /** Origin of the requesting page */
  origin: string;
  /** Tab ID this request belongs to */
  tabId: string;
}

/** Media permission request (camera/microphone) */
export interface MediaPermissionRequest extends BasePermissionRequest {
  type: 'media';
  /** Which media types are being requested: 'video' (camera), 'audio' (microphone), or both */
  mediaTypes: MediaType[];
}

/** Simple yes/no permission request (geolocation, notifications, etc.) */
export interface SimplePermissionRequest extends BasePermissionRequest {
  type:
    | 'geolocation'
    | 'notifications'
    | 'fullscreen'
    | 'clipboard-read'
    | 'display-capture'
    | 'midi'
    | 'idle-detection'
    | 'speaker-selection'
    | 'storage-access';
}

/** Bluetooth device info for UI display */
export interface BluetoothDeviceInfo {
  deviceId: string;
  deviceName: string;
}

/** Bluetooth device selection request */
export interface BluetoothSelectionRequest extends BasePermissionRequest {
  type: 'bluetooth';
  /** Available Bluetooth devices (updated every 200ms during selection) */
  devices: BluetoothDeviceInfo[];
}

/** Bluetooth pairing request (Windows/Linux) */
export interface BluetoothPairingRequest extends BasePermissionRequest {
  type: 'bluetooth-pairing';
  deviceId: string;
  pairingKind: 'confirm' | 'confirmPin' | 'providePin';
  /** PIN to confirm (for confirmPin mode) */
  pin?: string;
}

/** HID device info */
export interface HIDDeviceInfo {
  deviceId: string;
  vendorId: number;
  productId: number;
  productName: string;
}

/** HID device selection request */
export interface HIDSelectionRequest extends BasePermissionRequest {
  type: 'hid';
  devices: HIDDeviceInfo[];
}

/** Serial port info */
export interface SerialPortInfo {
  portId: string;
  portName: string;
  displayName: string;
}

/** Serial port selection request */
export interface SerialSelectionRequest extends BasePermissionRequest {
  type: 'serial';
  ports: SerialPortInfo[];
}

/** USB device info */
export interface USBDeviceInfo {
  deviceId: string;
  vendorId: number;
  productId: number;
  productName: string;
  manufacturerName?: string;
}

/** USB device selection request */
export interface USBSelectionRequest extends BasePermissionRequest {
  type: 'usb';
  devices: USBDeviceInfo[];
}

/** Union type for all permission requests */
export type PermissionRequest =
  | MediaPermissionRequest
  | SimplePermissionRequest
  | BluetoothSelectionRequest
  | BluetoothPairingRequest
  | HIDSelectionRequest
  | SerialSelectionRequest
  | USBSelectionRequest;

// ============================================================================
// Authentication Requests (HTTP Basic Auth)
// ============================================================================

/** Request for HTTP Basic Authentication credentials */
export interface AuthenticationRequest {
  /** Unique identifier for this request */
  id: string;
  /** Timestamp when request was created */
  timestamp: number;
  /** The URL that triggered the authentication request */
  url: string;
  /** Origin of the URL (protocol + host) */
  origin: string;
  /** The realm string from the WWW-Authenticate header */
  realm?: string;
  /** The host requesting authentication */
  host: string;
  /** Tab ID this request belongs to */
  tabId: string;
}

// ============================================================================
// Tab State
// ============================================================================

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
    /** The original URL that failed to load (for reload behavior) */
    originalFailedUrl?: string;
    /** Whether an error page is currently displayed */
    isErrorPageDisplayed?: boolean;
  } | null;
  navigationHistory: {
    canGoBack: boolean;
    canGoForward: boolean;
  };
  devTools: {
    open: boolean;
    chromeOpen: boolean;
  };
  screenshot: string | null; // Data URL of the tab screenshot
  search: {
    text: string;
    resultsCount: number;
    activeMatchIndex: number; // 1-indexed position of current match
  } | null;
  isSearchBarActive: boolean; // Whether the search bar UI is active for this tab
  zoomPercentage: number; // Page zoom level as percentage (100 = default)
  lastFocusedAt: number; // Timestamp (Date.now()) of when this tab was last focused
  consoleLogCount: number; // Total number of console logs captured since page load
  consoleErrorCount: number; // Number of error-level console logs
  /** Pending permission requests for this tab */
  permissionRequests: PermissionRequest[];
  /** Whether the tab's web content is in HTML5 fullscreen mode */
  isContentFullscreen: boolean;
  /** Pending HTTP Basic Auth request for this tab */
  authenticationRequest: AuthenticationRequest | null;
};

export type HistoryEntry = {
  url: string;
  title: string;
  faviconUrls: string[];
  lastVisitedAt: Date;
};

/** Suggestions returned by getOmniboxSuggestions */
export type OmniboxSuggestions = {
  /** History entries matching the input */
  historyEntries: {
    url: string;
    title: string;
    visitCount: number;
    lastVisitTime: Date;
    faviconUrl: string | null;
  }[];
  /** Most visited origins grouped by scheme://host[:port] (for empty-input defaults) */
  mostVisitedOrigins: {
    origin: string;
    visitCount: number;
    lastVisitTime: Date;
    faviconUrl: string | null;
  }[];
  /** Previous search terms matching the input */
  searchTerms: {
    term: string;
    /** The search engine keyword used (if available) */
    keyword?: string;
  }[];
  /** Locally running pages (dev servers) sorted by visit frequency then port */
  localPorts: {
    port: number;
    url: string;
    visitCount: number;
    lastVisitTime: Date | null;
    lastTitle: string | null;
    faviconUrl: string | null;
  }[];
};

export type PlanEntry = {
  name: string;
  description: string | null;
  filename: string;
  totalTasks: number;
  completedTasks: number;
  taskGroups: Array<{
    label: string;
    tasks: Array<{ text: string; completed: boolean; depth: number }>;
  }>;
};

export type LogChannelEntry = {
  filename: string;
  byteSize: number;
  lineCount: number;
  tailLines: string[];
};

export type MountEntry = {
  prefix: string;
  path: string;
  isGitRepo: boolean;
  gitBranch: string | null;
  skills: Array<{ name: string; description: string }>;
  /** Full file content, or `null` when the file does not exist on disk. */
  workspaceMdContent: string | null;
  /** Full file content, or `null` when the file does not exist on disk. */
  agentsMdContent: string | null;
};

export const EMPTY_MOUNTS: MountEntry[] = [];

export type PendingUserQuestion = {
  id: string;
  title: string;
  description?: string;
  steps: Array<{
    title?: string;
    description?: string;
    fields: QuestionField[];
  }>;
  currentStep: number;
  answers: Record<string, QuestionAnswerValue>;
};

export type AppState = {
  internalData: {
    posthog?: {
      apiKey?: string;
      host?: string;
    };
  };
  agents: {
    instances: {
      [agentInstanceId: string]: {
        type: AgentTypes;
        canSelectModel: boolean;
        requiredModelCapabilities: ModelSettings['capabilities'];
        allowUserInput: boolean;
        parentAgentInstanceId: string | null;
        state: AgentState;
      };
    };
  };
  toolbox: {
    [agentInstanceId: string]: {
      workspace: {
        mounts: MountEntry[];
      };
      pendingFileDiffs: FileDiff[];
      editSummary: FileDiff[];
      pendingUserQuestion: PendingUserQuestion | null;
      pendingSandboxOutputs?: Record<string, string[]>;
      pendingSandboxAttachments?: Record<string, AttachmentMetadata[]>;
      pendingShellOutputs?: Record<string, string[]>;
      /** Maps toolCallId → sessionId for in-flight shell commands. */
      pendingShellSessionIds?: Record<string, string>;
      activeApp?: {
        appId: string;
        pluginId?: string;
        src: string;
        height?: number;
      } | null;
      pendingAppMessage?: {
        appId: string;
        pluginId?: string;
        data: unknown;
      } | null;
    };
  };
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
  };
  // Current stagewise app runtime information
  appInfo: {
    baseName: string; // Base name (e.g., 'stagewise-dev', 'stagewise-prerelease', 'stagewise').
    name: string; // Display name (e.g., 'stagewise (Dev-Build)', 'stagewise').
    bundleId: string; // Bundle ID (e.g., 'io.stagewise.dev').
    version: string; // The version of the app.
    platform: 'darwin' | 'linux' | 'win32'; // The platform on which the app is running.
    isFullScreen: boolean; // Whether the app window is in fullscreen mode.
    // Build-time constants
    releaseChannel: 'dev' | 'prerelease' | 'release'; // The release channel of the app.
    author: string; // Author name.
    copyright: string; // Copyright string.
    homepage: string; // Homepage URL.
    arch: string; // Architecture (e.g., 'x64', 'arm64').
    otherVersions: Record<string, string | undefined>; // Other versions of the app.
  };
  /** Auto-update status synced from the backend AutoUpdateService */
  autoUpdate: {
    status:
      | 'idle'
      | 'checking'
      | 'downloading'
      | 'ready'
      | 'not-available'
      | 'error'
      | 'unsupported';
    updateInfo: {
      releaseName?: string;
      releaseNotes?: string;
    } | null;
    errorMessage: string | null;
  };
  // The global configuration of the CLI.
  globalConfig: GlobalConfig;
  // State of the current user experience (getting started etc.)
  userExperience: {
    storedExperienceData: StoredExperienceData;
    pendingOnboardingSuggestion: {
      id: string;
      url: string;
      prompt: string;
    } | null;
    devAppPreview: {
      isFullScreen: boolean;
      inShowCodeMode: boolean;
      customScreenSize: {
        width: number;
        height: number;
        presetName: string; // Preset can be a name like "mobile" or "iPhone 13" or whatever
      } | null;
    };
  };
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
    /** Unique identifier for the current browser process lifetime. Changes on restart. */
    sessionId: string;
    history: HistoryEntry[];
    contextSelectionMode: boolean;
    // Selected elements
    selectedElements: SelectedElement[];
    hoveredElement: SelectedElement | null;
    viewportSize: {
      top: number;
      left: number;
      width: number;
      height: number;
      scale: number;
    } | null;
  };

  // Downloads state for the control button
  // Contains running downloads + recent finished downloads (up to 5 total)
  downloads: {
    /** List of downloads to display (running + recent finished) */
    items: DownloadSummary[];
    /** Number of currently active downloads */
    activeCount: number;
    /** Whether there are finished downloads the user hasn't seen yet */
    hasUnseenDownloads: boolean;
    /** Timestamp when downloads were last marked as seen (null if never) */
    lastSeenAt: Date | null;
  };

  // User preferences (synced from PreferencesService)
  preferences: UserPreferences;

  // Available search engines (synced from WebDataService via PreferencesService)
  searchEngines: SearchEngine[];

  // Current system theme (light or dark) based on OS preference
  systemTheme: 'light' | 'dark';

  /** Bundled plugin definitions (static, pushed once at startup) */
  plugins: PluginDefinition[];

  /** Skill definitions (builtins, workspace skills, plugin skills) */
  skills: SkillDefinitionUI[];

  /** Global plans (workspace-independent, from user-data/plans/) */
  plans: PlanEntry[];

  /** Global debug log channels (from user-data/logs/) */
  logChannels: LogChannelEntry[];
  /** Ingest server info — null when server not yet started */
  logIngest: { port: number; token: string } | null;
};

export type AuthStatus =
  | 'authenticated'
  | 'unauthenticated'
  | 'authentication_invalid'
  | 'server_unreachable';

export type ApiKeyValidationResult =
  | null
  | { success: true }
  | { success: false; error: string };

export type KartonContract = {
  state: AppState;
  serverProcedures: {
    agents: {
      create: (
        initialInputState?: string,
        modelId?: ModelId,
        workspacePaths?: string[],
      ) => Promise<string>;
      resume: (agentId: string) => Promise<void>;
      archive: (agentId: string) => Promise<void>;
      delete: (agentId: string) => Promise<void>;
      getAgentsHistoryList: (
        offset: number,
        limit: number,
        searchString?: string,
      ) => Promise<AgentHistoryEntry[]>;
      updateInputState: (agentId: string, inputState: string) => Promise<void>;
      sendUserMessage: (
        agentId: string,
        message: AgentMessage & { role: 'user' },
      ) => Promise<void>;
      /** Queue a user message AND resolve a pending question in one atomic call. */
      interruptQuestionWithMessage: (
        agentId: string,
        questionId: string,
        message: AgentMessage & { role: 'user' },
        draftAnswers: Record<string, QuestionAnswerValue>,
      ) => Promise<void>;
      sendToolApprovalResponse: (
        instanceId: string,
        approvalId: string,
        approved: boolean,
        reason?: string,
      ) => Promise<void>;
      stop: (agentId: string) => Promise<void>;
      flushQueue: (agentId: string) => Promise<void>;
      clearQueue: (agentId: string) => Promise<void>;
      deleteQueuedMessage: (
        agentId: string,
        messageId: string,
      ) => Promise<void>;
      revertToUserMessage: (
        agentId: string,
        userMessageId: string,
        undoToolCalls: boolean,
      ) => Promise<void>;
      replaceUserMessage: (
        agentId: string,
        userMessageId: string,
        newMessage: AgentMessage & { role: 'user' },
        undoToolCalls: boolean,
      ) => Promise<string>;
      retryLastUserMessage: (agentId: string) => Promise<void>;
      markAsRead: (agentId: string) => Promise<void>;
      setActiveModelId: (agentId: string, modelId: ModelId) => Promise<void>;
      storeAttachment: (
        agentId: string,
        originalFileName: string,
        data: string,
      ) => Promise<string>;
      storeAttachmentByPath: (
        agentId: string,
        originalFileName: string,
        filePath: string,
      ) => Promise<string>;
    };
    toolbox: {
      acceptHunks: (hunkIds: string[]) => Promise<void>;
      rejectHunks: (hunkIds: string[]) => Promise<void>;
      mountWorkspace: (
        agentInstanceId: string,
        workspacePath?: string,
        permissions?: MountPermission[],
      ) => Promise<void>;
      unmountWorkspace: (
        agentInstanceId: string,
        mountPrefix: string,
      ) => Promise<void>;
      generateWorkspaceMd: (
        agentInstanceId: string,
        mountPrefix: string,
      ) => Promise<void>;
      submitUserQuestionStep: (
        agentInstanceId: string,
        questionId: string,
        stepAnswers: Record<string, QuestionAnswerValue>,
      ) => Promise<void>;
      cancelUserQuestion: (
        agentInstanceId: string,
        questionId: string,
        reason: 'user_cancelled' | 'user_sent_message',
      ) => Promise<void>;
      goBackUserQuestion: (
        agentInstanceId: string,
        questionId: string,
      ) => Promise<void>;
      killShellSession: (
        agentInstanceId: string,
        sessionId: string,
      ) => Promise<void>;
      searchMentionFiles: (
        agentInstanceId: string,
        query: string,
      ) => Promise<MentionFileCandidate[]>;
      dismissActiveApp: (agentInstanceId: string) => Promise<void>;
      forwardAppMessage: (
        agentInstanceId: string,
        appId: string,
        pluginId: string | undefined,
        data: unknown,
      ) => Promise<void>;
      clearPendingAppMessage: (agentInstanceId: string) => Promise<void>;
      clearLogChannel: (filename: string) => Promise<void>;
    };
    userAccount: {
      sendOtp: (email: string) => Promise<{ error?: string }>;
      verifyOtp: (email: string, code: string) => Promise<{ error?: string }>;
      refreshStatus: () => Promise<void>;
      logout: () => Promise<void>;
      validateApiKeys: (keys: {
        anthropic?: string;
        openai?: string;
        google?: string;
        moonshotai?: string;
        alibaba?: string;
      }) => Promise<{
        anthropic: ApiKeyValidationResult;
        openai: ApiKeyValidationResult;
        google: ApiKeyValidationResult;
        moonshotai: ApiKeyValidationResult;
        alibaba: ApiKeyValidationResult;
      }>;
    };
    userExperience: {
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
      setHasSeenOnboardingFlow: (
        value: boolean,
        suggestion?: { id: string; url: string; prompt: string },
      ) => Promise<void>;
      clearPendingOnboardingSuggestion: () => Promise<void>;
    };
    filePicker: {
      createRequest: (request: FilePickerRequest) => Promise<string[]>;
    };
    notifications: {
      triggerAction: (id: string, actionIndex: number) => Promise<void>;
      dismiss: (id: string) => Promise<void>;
    };
    autoUpdate: {
      /** Manually trigger an update check */
      checkForUpdates: () => Promise<void>;
      /** Quit the app and install the downloaded update */
      quitAndInstall: () => Promise<void>;
    };
    config: {
      set: (config: GlobalConfig) => Promise<void>;
    };
    telemetry: {
      capture: (
        eventName: string,
        properties?: Record<string, unknown>,
      ) => Promise<void>;
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
      /**
       * Trust a certificate for a specific origin in a tab and reload.
       * This adds the origin to a per-tab whitelist that allows certificate errors.
       * The whitelist is cleared when the tab is closed.
       */
      trustCertificateAndReload: (
        tabId: string,
        origin: string,
      ) => Promise<void>;
      goto: (
        url: string,
        tabId?: string,
        transition?: PageTransition,
      ) => Promise<void>;
      goBack: (tabId?: string) => Promise<void>;
      goForward: (tabId?: string) => Promise<void>;
      devTools: {
        toggle: (tabId?: string) => Promise<void>;
        open: (tabId?: string) => Promise<void>;
        close: (tabId?: string) => Promise<void>;
        chrome: {
          toggle: (tabId?: string) => Promise<void>;
          open: (tabId?: string) => Promise<void>;
          close: (tabId?: string) => Promise<void>;
        };
        /**
         * Capture a screenshot of a tab using the Chrome DevTools Protocol.
         * Returns base64-encoded image data (without data URL prefix).
         */
        getScreenshot: (options?: {
          /** The tab ID to capture. If not provided, uses the active tab. */
          tabId?: string;
          /** Image format (default: 'png') */
          format?: 'png' | 'jpeg' | 'webp';
          /** Image quality (0-100) for jpeg/webp formats (default: 80) */
          quality?: number;
          /** Capture the full page (scrollable area) instead of just the viewport */
          fullPage?: boolean;
          /** Clip area to capture (in CSS pixels) */
          clip?: {
            x: number;
            y: number;
            width: number;
            height: number;
          };
        }) => Promise<{
          success: boolean;
          /** Base64-encoded image data (without data URL prefix) */
          data?: string;
          error?: string;
        }>;
      };
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
        /** Restore selected elements directly (used when restoring aborted message to input) */
        restoreElements: (elements: SelectedElement[]) => Promise<void>;
        /**
         * Capture an element screenshot, convert to WebP, and store as an agent attachment.
         * Returns the blob key of the stored screenshot file, or null if capture fails.
         */
        captureAndStoreElementScreenshot: (
          agentId: string,
          tabId: string,
          boundingRect: {
            top: number;
            left: number;
            width: number;
            height: number;
          },
          isMainFrame: boolean,
          frameId: string | undefined,
          screenshotFileName: string,
        ) => Promise<string | null>;
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
      permissions: {
        /** Accept a simple permission request (yes/no permissions) - session only */
        accept: (requestId: string) => Promise<void>;
        /** Reject a permission request - session only */
        reject: (requestId: string) => Promise<void>;
        /** Select a device for device-selection permission requests (Bluetooth, HID, Serial, USB) */
        selectDevice: (requestId: string, deviceId: string) => Promise<void>;
        /** Respond to Bluetooth pairing request (with optional PIN for providePin mode) */
        respondToPairing: (
          requestId: string,
          confirmed: boolean,
          pin?: string,
        ) => Promise<void>;
        /** Always allow - grants permission AND saves to preferences for future requests from this origin */
        alwaysAllow: (requestId: string) => Promise<void>;
        /** Always block - denies permission AND saves to preferences for future requests from this origin */
        alwaysBlock: (requestId: string) => Promise<void>;
      };
      auth: {
        /** Submit credentials for an HTTP Basic Auth request */
        submit: (
          requestId: string,
          username: string,
          password: string,
        ) => Promise<void>;
        /** Cancel an HTTP Basic Auth request */
        cancel: (requestId: string) => Promise<void>;
      };
    };
    downloads: {
      /** Mark all current downloads as seen (updates lastSeenAt timestamp) */
      markSeen: () => Promise<void>;
      /** Pause an active download */
      pause: (
        downloadId: number,
      ) => Promise<{ success: boolean; error?: string }>;
      /** Resume a paused download */
      resume: (
        downloadId: number,
      ) => Promise<{ success: boolean; error?: string }>;
      /** Cancel an active download */
      cancel: (
        downloadId: number,
      ) => Promise<{ success: boolean; error?: string }>;
      /** Open a downloaded file using the system default application */
      openFile: (
        filePath: string,
      ) => Promise<{ success: boolean; error?: string }>;
      /** Show a downloaded file in the system file manager (Finder/Explorer) */
      showInFolder: (
        filePath: string,
      ) => Promise<{ success: boolean; error?: string }>;
      /** Delete a download record and its file */
      delete: (
        downloadId: number,
      ) => Promise<{ success: boolean; error?: string }>;
    };
    preferences: {
      /** Update user preferences by applying Immer patches */
      update: (patches: Patch[]) => Promise<void>;
      /** Set an encrypted API key for a provider */
      setProviderApiKey: (
        provider: ModelProvider,
        apiKey: string,
      ) => Promise<void>;
    };
    devToolbar: {
      /** Update the global widget order */
      updateWidgetOrder: (order: WidgetId[]) => Promise<void>;
      /** Update settings for a specific origin */
      updateOriginSettings: (
        origin: string,
        settings: Partial<Omit<DevToolbarOriginSettings, 'lastAccessedAt'>>,
      ) => Promise<void>;
      /** Get or create settings for an origin (creates from last used origin if new) */
      getOrCreateOriginSettings: (
        origin: string,
      ) => Promise<DevToolbarOriginSettings>;
    };
    /** Get omnibox suggestions based on input (history entries and search terms) */
    getOmniboxSuggestions: (input: string) => Promise<OmniboxSuggestions>;
  };
};

export const defaultState: KartonContract['state'] = {
  internalData: {
    posthog: {
      apiKey: import.meta.env.VITE_POSTHOG_API_KEY,
      host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
    },
  },
  agents: { instances: {} },
  toolbox: {},
  userAccount: {
    status: 'unauthenticated',
  },
  appInfo: {
    baseName: __APP_BASE_NAME__,
    name: __APP_NAME__,
    bundleId: __APP_BUNDLE_ID__,
    version: __APP_VERSION__,
    isFullScreen: false,
    platform: __APP_PLATFORM__ as 'darwin' | 'linux' | 'win32',
    releaseChannel: __APP_RELEASE_CHANNEL__,
    author: __APP_AUTHOR__,
    copyright: __APP_COPYRIGHT__,
    homepage: __APP_HOMEPAGE__,
    arch: __APP_ARCH__,
    otherVersions: {},
  },
  autoUpdate: {
    status: 'idle',
    updateInfo: null,
    errorMessage: null,
  },
  globalConfig: {
    telemetryLevel: 'full',
    openFilesInIde: 'other',
    hasSetIde: false,
  },
  userExperience: {
    storedExperienceData: {
      recentlyOpenedWorkspaces: [],
      hasSeenOnboardingFlow: null,
      lastViewedChats: {},
    },
    pendingOnboardingSuggestion: null,
    devAppPreview: {
      isFullScreen: false,
      inShowCodeMode: false,
      customScreenSize: null,
    },
  },
  notifications: [],
  browser: {
    tabs: {},
    activeTabId: null,
    sessionId: '',
    history: [],
    contextSelectionMode: false,
    selectedElements: [],
    hoveredElement: null,
    viewportSize: null,
  },
  downloads: {
    items: [],
    activeCount: 0,
    hasUnseenDownloads: false,
    lastSeenAt: null,
  },
  preferences: defaultUserPreferences,
  searchEngines: [],
  systemTheme: 'light', // Will be set correctly by backend on init
  plugins: [],
  skills: [],
  plans: [],
  logChannels: [],
  logIngest: null,
};
