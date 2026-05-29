import { z } from 'zod';
import type { ModelId } from '@shared/available-models';
import type { PluginDefinition } from '@shared/plugins';
import type { SkillDefinitionUI } from '@shared/skills';
import type {
  UserMessageMetadata,
  MountPermission,
  MentionFileCandidate,
  AttachmentMetadata,
  ShellSessionSnapshot,
} from './agent/metadata';
import type {
  MountEntry,
  WorkspaceGitSummary,
} from '@stagewise/agent-core/types/metadata';
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
  ToolApprovalMode,
  SocialAuthProvider,
} from './shared-types';
import {
  defaultUserPreferences,
  PermissionSetting,
  configurablePermissionTypes,
} from './shared-types';
import type {
  PageTransition,
  DownloadState,
  HistoryFilter,
  HistoryResult,
  FaviconBitmapResult,
} from '../pages-api/types';
import type {
  AddSearchEngineInput,
  AddSearchEngineResult,
  RemoveSearchEngineResult,
  ClearBrowsingDataOptions,
  ClearBrowsingDataResult,
  ContextFilesResult,
  CurrentUsageResponse,
  UsageHistoryResponse,
} from '../pages-api/types';
import type { CodingPlanId } from '../../coding-plans';
import type { SettingsRoute } from '../../settings-route';
import type {
  AgentState,
  AgentTypes,
  AgentHistoryEntry,
  AgentMessage,
  StoredAgentPreview,
} from './agent';

export type { WorkspaceGitSummary } from '@stagewise/agent-core/types/metadata';

export type WorkspaceGitBranchInfo = {
  name: string;
  current: boolean;
  checkedOut: boolean;
  checkedOutPath?: string;
};

export type WorkspaceGitBranchesResult = {
  current: string | null;
  defaultBranch: string | null;
  branches: WorkspaceGitBranchInfo[];
};

export type WorkspaceGitWorktreeInfo = {
  worktreeId: string;
  path: string;
  branch: string | null;
  headSha: string | null;
  isDetached: boolean;
  isMainWorktree: boolean;
  current: boolean;
};

export type WorkspaceGitWorktreesResult = {
  currentPath: string | null;
  worktrees: WorkspaceGitWorktreeInfo[];
};

export type WorkspaceGitCleanupCandidate = {
  path: string;
  branch: string | null;
  headSha: string | null;
  repositoryId: string;
  repoRoot: string;
  lastUsedAt: number | null;
  mergedInto: string;
  status: {
    dirty: false;
    stagedCount: 0;
    unstagedCount: 0;
    untrackedCount: 0;
  };
};

export type WorkspaceGitCleanupResult = {
  removed: Array<{ path: string; branch: string | null }>;
  failed: Array<{ path: string; message: string }>;
};

export type WorkspaceGitCleanupState = {
  checkedAt: number | null;
  dismissed: boolean;
  cleaning: boolean;
  candidates: WorkspaceGitCleanupCandidate[];
  lastResult: WorkspaceGitCleanupResult | null;
};

export type WorkspaceGitSetupStatus = 'running' | 'succeeded' | 'failed';

export type WorkspaceGitSetupRun = {
  id: string;
  workspacePath: string;
  mainWorktreePath: string;
  repositoryId: string;
  sourceBranch: string;
  worktreeBranch: string;
  scriptPath: string;
  status: WorkspaceGitSetupStatus;
  startedAt: number;
  finishedAt: number | null;
  exitCode: number | null;
  message: string | null;
  stdoutTail: string;
  stderrTail: string;
};

export type WorkspaceGitSetupState = {
  runsByPath: Record<string, WorkspaceGitSetupRun>;
};

export type WorkspaceGitFailureReason =
  | 'not-git-repo'
  | 'branch-not-found'
  | 'branch-already-exists'
  | 'branch-checked-out'
  | 'worktree-already-exists'
  | 'invalid-name'
  | 'checkout-failed'
  | 'worktree-create-failed';

export type WorkspaceGitFailure = {
  ok: false;
  reason: WorkspaceGitFailureReason;
  message: string;
};

export type WorkspaceGitMutationResult =
  | { ok: true; git: WorkspaceGitSummary | null }
  | WorkspaceGitFailure;

export type WorkspaceGitCreateWorktreeResult =
  | {
      ok: true;
      path: string;
      branchName: string;
      git: WorkspaceGitSummary | null;
    }
  | WorkspaceGitFailure;

export type WorkspaceGitCreateBranchOptions = {
  branchName: string;
  sourceBranch: string;
};

export type WorkspaceGitCreateWorktreeOptions = {
  worktreeName: string;
  sourceBranch: string;
};

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
export type { MountEntry } from '@stagewise/agent-core/types/metadata';
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
  /** Discriminator: 'browser' for web-content tabs, 'terminal' for PTY tabs. */
  type?: 'browser' | 'terminal';
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
  /** Discriminator: 'browser' for web-content tabs, 'terminal' for PTY tabs. */
  type?: 'browser' | 'terminal';
  title: string;
  url: string;
  faviconUrls: string[];
  /** Agent instance this tab is attached to, or null if globally visible */
  agentInstanceId: string | null;
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
  /** Terminal-specific fields (present when type === 'terminal') */
  cwd: string;
  terminalRunningProcess?: string | null;
  createdAt?: number;
  exited?: boolean;
  exitCode?: number | null;
};

export function getTerminalTabDefaults(): Omit<
  TabState,
  'id' | 'title' | 'createdAt' | 'lastFocusedAt'
> {
  return {
    type: 'terminal' as const,
    url: '',
    cwd: '',
    terminalRunningProcess: null,
    faviconUrls: [],
    agentInstanceId: null as string | null,
    isLoading: false,
    isResponsive: false,
    isPlayingAudio: false,
    isMuted: false,
    colorScheme: 'system' as TabState['colorScheme'],
    error: null,
    navigationHistory: { canGoBack: false, canGoForward: false },
    devTools: { open: false, chromeOpen: false },
    screenshot: null,
    search: null,
    isSearchBarActive: false,
    zoomPercentage: 100,
    consoleLogCount: 0,
    consoleErrorCount: 0,
    permissionRequests: [] as TabState['permissionRequests'],
    isContentFullscreen: false,
    authenticationRequest: null,
    exited: false,
    exitCode: null,
  };
}

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

/**
 * Convenience alias used by host UI code. Identical to {@link
 * WorkspaceGitSummary.status} — kept as a named type so call-sites
 * reading just the status block don't have to pierce the parent shape.
 */
export type MountedWorkspaceGitStatusSummary = NonNullable<
  WorkspaceGitSummary['status']
>;

/**
 * Host-side alias for the canonical {@link WorkspaceGitSummary} carried
 * on a mount. Re-exported for parity with the legacy naming used across
 * the karton contract and UI.
 */
export type MountedWorkspaceGitSummary = WorkspaceGitSummary;

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
  appScreen: {
    mode: 'main' | 'settings';
    settingsRoute: SettingsRoute;
  };
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
  workspaceGitCleanup: WorkspaceGitCleanupState;
  workspaceGitSetup: WorkspaceGitSetupState;
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
      /** Live shell session manifest — pushed eagerly on lifecycle events. */
      shells?: { sessions: ShellSessionSnapshot[] };

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
    releaseChannel: 'dev' | 'prerelease' | 'nightly' | 'release'; // The release channel of the app.
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

  // Terminal output buffers — active, keyed by terminalId.
  terminals: {
    outputBuffers: Record<string, string>;
    outputBufferOffsets: Record<
      string,
      { baseOffset: number; endOffset: number }
    >;
  };

  // Unified content tabs (browser + terminal + future tab types)
  contentTabs: {
    tabs: Record<string, TabState>;
    globalOrder: string[];
    agentOrders: Record<string, string[]>;
    activeTabId: string | null;
  };

  // Browsing runtime state (global, not per-tab)
  browsing: {
    sessionId: string;
    history: HistoryEntry[];
    contextSelectionMode: boolean;
    selectedElements: SelectedElement[];
    hoveredElement: SelectedElement | null;
  };

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
    /** Last active tab ID per agent instance. Key is agentInstanceId, value is tab ID. */
    lastActiveTabPerAgent: Record<string, string>;
    /** Agent instance ID that was open last, persisted across restarts. */
    lastOpenAgentId: string | null;
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

  /** Deduplicated workspace mounts from all agent instances */
  workspaceMounts: MountEntry[];
  /** Workspace paths where a WORKSPACE.md agent is currently running */
  workspaceMdGenerating: Record<string, boolean>;
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
        toolApprovalMode?: ToolApprovalMode,
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
      getAgentHistoryEntriesByIds: (
        ids: string[],
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
      setToolApprovalMode: (
        instanceId: string,
        mode: ToolApprovalMode,
        /**
         * Optional UI surface that triggered the change. Forwarded to the
         * `tool-approval-mode-changed` telemetry event so analytics can
         * distinguish deliberate panel-combobox changes from inline
         * "Always allow" clicks made during an approval request.
         */
        source?: 'panel-combobox' | 'inline-approval-button',
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
      setTitle: (agentId: string, title: string) => Promise<void>;
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
      /** Fetch the full persisted row for a suspended/history agent (on-demand preview). */
      getStoredInstance: (
        agentId: string,
      ) => Promise<StoredAgentPreview | null>;
      /** Return distinct filepaths edited by an agent (from diff-history). */
      getTouchedFiles: (agentId: string) => Promise<string[]>;
      /**
       * Reveal the agent's per-instance data directory inside user-data
       * (e.g. `<userData>/stagewise/agents/<id>/`) in the system file
       * manager. Used by the dev context-menu option — not the user's
       * mounted project workspace.
       */
      revealWorkingDirectory: (
        agentId: string,
      ) => Promise<{ success: boolean; error?: string }>;
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
      listGitBranchesByPath: (
        workspacePath: string,
      ) => Promise<WorkspaceGitBranchesResult | null>;
      listGitWorktreesByPath: (
        workspacePath: string,
      ) => Promise<WorkspaceGitWorktreesResult | null>;
      switchGitBranchByPath: (
        workspacePath: string,
        branchName: string,
      ) => Promise<WorkspaceGitMutationResult>;
      createGitBranchByPath: (
        workspacePath: string,
        options: WorkspaceGitCreateBranchOptions,
      ) => Promise<WorkspaceGitMutationResult>;
      createGitWorktreeByPath: (
        workspacePath: string,
        options: WorkspaceGitCreateWorktreeOptions,
      ) => Promise<WorkspaceGitCreateWorktreeResult>;
      dismissWorkspaceGitCleanupPrompt: () => Promise<void>;
      cleanWorkspaceGitWorktrees: (
        paths: string[],
      ) => Promise<WorkspaceGitCleanupResult>;
      listWorkspaceGitBranches: (
        agentInstanceId: string,
        mountPrefix: string,
      ) => Promise<WorkspaceGitBranchesResult | null>;
      listWorkspaceGitWorktrees: (
        agentInstanceId: string,
        mountPrefix: string,
      ) => Promise<WorkspaceGitWorktreesResult | null>;
      switchWorkspaceGitBranch: (
        agentInstanceId: string,
        mountPrefix: string,
        branchName: string,
      ) => Promise<WorkspaceGitMutationResult>;
      createWorkspaceGitBranch: (
        agentInstanceId: string,
        mountPrefix: string,
        options: WorkspaceGitCreateBranchOptions,
      ) => Promise<WorkspaceGitMutationResult>;
      createWorkspaceGitWorktree: (
        agentInstanceId: string,
        mountPrefix: string,
        options: WorkspaceGitCreateWorktreeOptions,
      ) => Promise<WorkspaceGitCreateWorktreeResult>;
      generateWorkspaceMd: (
        agentInstanceId: string,
        mountPrefix: string,
      ) => Promise<void>;
      /** Get context files for all workspaces */
      getContextFiles: () => Promise<ContextFilesResult>;
      /** Generate WORKSPACE.md for a workspace path (does not require agent instance) */
      generateWorkspaceMdForPath: (workspacePath: string) => Promise<void>;
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
      sendOtp: (
        email: string,
        turnstileToken: string,
      ) => Promise<{ error?: string }>;
      verifyOtp: (email: string, code: string) => Promise<{ error?: string }>;
      signInSocial: (
        provider: SocialAuthProvider,
      ) => Promise<{ error?: string }>;
      refreshStatus: () => Promise<void>;
      logout: () => Promise<void>;
      /** Get current usage stats */
      getUsageCurrent: () => Promise<CurrentUsageResponse>;
      /** Get daily usage history breakdown */
      getUsageHistory: (params: {
        days?: number;
      }) => Promise<UsageHistoryResponse>;
      validateApiKeys: (keys: {
        anthropic?: string;
        openai?: string;
        google?: string;
        moonshotai?: string;
        alibaba?: string;
        deepseek?: string;
        'z-ai'?: string;
        minimax?: string;
      }) => Promise<{
        anthropic: ApiKeyValidationResult;
        openai: ApiKeyValidationResult;
        google: ApiKeyValidationResult;
        moonshotai: ApiKeyValidationResult;
        alibaba: ApiKeyValidationResult;
        deepseek: ApiKeyValidationResult;
        'z-ai': ApiKeyValidationResult;
        minimax: ApiKeyValidationResult;
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
        input:
          | boolean
          | {
              value: boolean;
              auth?: {
                auth_method:
                  | 'stagewise'
                  | 'api-keys'
                  | 'coding-plan'
                  | 'unknown';
                provider?: ModelProvider;
                plan_id?:
                  | 'glm-coding-plan'
                  | 'kimi-plan'
                  | 'qwen-plan'
                  | 'minimax-plan';
              };
              suggestion?: { id: string; url: string; prompt: string };
            },
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
      previewSoundPack: (
        packId: string,
        loudness: 'off' | 'subtle' | 'default',
      ) => Promise<{ ok: boolean }>;
      importSoundPack: () => Promise<
        | { id: string; name: string; error?: never }
        | { id?: never; name?: never; error: string }
      >;
    };
    telemetry: {
      capture: (
        eventName: string,
        properties?: Record<string, unknown>,
      ) => Promise<void>;
    };
    browser: {
      createTab: (
        url?: string,
        setActive?: boolean,
        agentInstanceId?: string | null,
      ) => Promise<string | undefined>;
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
      /** Set the agent instance ID this tab is attached to (null = globally visible) */
      setTabAgentInstance: (
        tabId: string,
        agentInstanceId: string | null,
      ) => Promise<void>;
      /** Persist the last-opened agent instance ID for restoration on restart. */
      setLastOpenAgentId: (agentId: string | null) => Promise<void>;
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
      /** Create a new user-controlled terminal tab. */
      createTerminal: (
        cwd?: string,
        agentInstanceId?: string | null,
      ) => Promise<string | null>;
      /** Write keystroke data to a terminal's PTY. */
      terminalInput: (terminalId: string, data: string) => Promise<void>;
      /** Resize a terminal's PTY dimensions. */
      terminalResize: (
        terminalId: string,
        cols: number,
        rows: number,
      ) => Promise<void>;
      /** Snapshot the backend-owned terminal presentation state. */
      getTerminalSnapshot: (terminalId: string) => Promise<{
        state: string | null;
        baseOffset: number;
        endOffset: number;
        cols: number;
        rows: number;
      }>;
      /** Add a custom search engine */
      addSearchEngine: (
        input: AddSearchEngineInput,
      ) => Promise<AddSearchEngineResult>;
      /** Remove a custom search engine */
      removeSearchEngine: (id: number) => Promise<RemoveSearchEngineResult>;
      /** Clear browsing data */
      clearBrowsingData: (
        options: ClearBrowsingDataOptions,
      ) => Promise<ClearBrowsingDataResult>;
      /** Query browsing history with optional text search and pagination */
      getHistory: (filter: HistoryFilter) => Promise<HistoryResult[]>;
      /** Get base64-encoded favicon bitmaps for a list of favicon URLs */
      getFaviconBitmaps: (
        faviconUrls: string[],
      ) => Promise<Record<string, FaviconBitmapResult>>;
    };
    credentials: {
      /** Store credential data for a registered type */
      set: (typeId: string, data: Record<string, string>) => Promise<void>;
      /** Remove stored credential data */
      delete: (typeId: string) => Promise<void>;
      /** Return the list of credential type IDs that have stored data */
      getConfiguredIds: () => Promise<string[]>;
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
      /** Clear the API key for a provider */
      clearProviderApiKey: (provider: ModelProvider) => Promise<void>;
      /** Set an encrypted API key for a custom endpoint */
      setCustomEndpointApiKey: (
        endpointId: string,
        apiKey: string,
      ) => Promise<void>;
      /** Clear the API key for a custom endpoint */
      clearCustomEndpointApiKey: (endpointId: string) => Promise<void>;
      /** Set an encrypted secret key for a custom endpoint */
      setCustomEndpointSecretKey: (
        endpointId: string,
        secretKey: string,
      ) => Promise<void>;
      /** Set encrypted Google credentials JSON for a custom endpoint */
      setCustomEndpointGoogleCredentials: (
        endpointId: string,
        credentials: string,
      ) => Promise<void>;
      /** Enumerate AWS profiles */
      listAwsProfiles: () => Promise<{
        profiles: Array<{
          name: string;
          region?: string;
          ssoRegion?: string;
        }>;
        envRegion?: string;
        error?: string;
      }>;
      /** Validate a provider API key */
      validateProviderApiKey: (
        provider: ModelProvider,
        apiKey: string,
        baseUrl?: string,
      ) => Promise<ApiKeyValidationResult>;
      /**
       * Atomically disconnect a provider: clear the encrypted API key and
       * flip the provider's endpoint mode back to `'stagewise'` in a single
       * patch update.
       */
      disconnectProvider: (provider: ModelProvider) => Promise<void>;
      /**
       * Atomically connect a Tier-A coding plan.
       */
      connectCodingPlan: (
        planId: CodingPlanId,
        apiKey: string,
      ) => Promise<{ success: true } | { success: false; error: string }>;
      /**
       * Atomically connect a provider's own API key.
       */
      connectProvider: (
        provider: ModelProvider,
        apiKey: string,
      ) => Promise<{ success: true } | { success: false; error: string }>;
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
    /**
     * Open an http(s) URL with the OS default handler (shell.openExternal).
     * Used by the onboarding flow's "Get API key" buttons to bypass the UI
     * window's setWindowOpenHandler, which would otherwise route the URL to
     * a new tab behind the onboarding overlay.
     */
    openExternalUrl: (url: string) => Promise<void>;
    appScreen: {
      openSettings: (route?: SettingsRoute) => Promise<void>;
      closeSettings: () => Promise<void>;
      setSettingsRoute: (route: SettingsRoute) => Promise<void>;
    };
  };
};

export const defaultState: KartonContract['state'] = {
  appScreen: {
    mode: 'main',
    settingsRoute: { section: 'models-providers' },
  },
  internalData: {
    posthog: {
      apiKey: import.meta.env.VITE_POSTHOG_API_KEY,
      host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
    },
  },
  agents: { instances: {} },
  workspaceGitCleanup: {
    checkedAt: null,
    dismissed: false,
    cleaning: false,
    candidates: [],
    lastResult: null,
  },
  workspaceGitSetup: {
    runsByPath: {},
  },
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
    notificationSoundsEnabled: true,
    notificationSoundLoudness: 'subtle',
    notificationSoundPack: 'bubble-pops',
    availableSoundPacks: ['bubble-pops'],
    packDisplayNames: {},
    dockBounceEnabled: true,
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
  terminals: {
    outputBuffers: {},
    outputBufferOffsets: {},
  },
  contentTabs: {
    tabs: {},
    globalOrder: [],
    agentOrders: {},
    activeTabId: null,
  },
  browsing: {
    sessionId: '',
    history: [],
    contextSelectionMode: false,
    selectedElements: [],
    hoveredElement: null,
  },
  browser: {
    tabs: {},
    activeTabId: null,
    sessionId: '',
    history: [],
    contextSelectionMode: false,
    selectedElements: [],
    hoveredElement: null,
    viewportSize: null,
    lastActiveTabPerAgent: {},
    lastOpenAgentId: null,
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
  workspaceMounts: [],
  workspaceMdGenerating: {},
  plugins: [],
  skills: [],
  plans: [],
  logChannels: [],
  logIngest: null,
};
