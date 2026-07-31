import type {
  HistoryFilter,
  HistoryResult,
  FaviconBitmapResult,
} from './types';
import type { GlobalConfig } from '../ui/shared-types';
import type { PlanEntry } from '../ui';

type PendingAppMessage = {
  appId: string;
  pluginId?: string;
  data: unknown;
} | null;

export type WorkspaceMountInfo = {
  prefix: string;
  path: string;
  git: import('../ui').MountedWorkspaceGitSummary | null;
  skills: Array<{ name: string; description: string }>;
  /** Full file content, or `null` when the file does not exist on disk. */
  agentsMdContent: string | null;
};

export type PagesApiState = {
  /** Pending mini-app messages by chat ID, pushed in real-time */
  pendingAppMessagesByAgentInstanceId: Record<string, PendingAppMessage>;
  /** Global config (read-only sync, updated via backend state sync) */
  globalConfig: GlobalConfig;
  /** Currently mounted workspaces, deduplicated across all agents */
  workspaceMounts: WorkspaceMountInfo[];
  /** Global plans (workspace-independent, synced from AppState.plans) */
  plans: PlanEntry[];
};

export type PagesApiContract = {
  state: PagesApiState;
  serverProcedures: {
    openTab: (url: string, setActive?: boolean) => Promise<void>;
    /**
     * Open a URL in the user's system default browser. Only `http:` and
     * `https:` schemes are accepted — other schemes are silently rejected
     * to prevent arbitrary protocol handling via a renderer procedure.
     */
    openExternalUrl: (url: string) => Promise<void>;
    /** Get browser history entries for standalone internal pages. */
    getHistory: (filter: HistoryFilter) => Promise<HistoryResult[]>;
    /** Get favicon bitmap data for standalone internal pages. */
    getFaviconBitmaps: (
      faviconUrls: string[],
    ) => Promise<Record<string, FaviconBitmapResult>>;
    /** Forward a mini-app iframe message to the sandbox worker. */
    forwardAppMessage: (
      agentInstanceId: string,
      appId: string,
      pluginId: string | undefined,
      data: unknown,
    ) => Promise<void>;
    /** Clear the pending mini-app message for a specific chat. */
    clearPendingAppMessage: (agentInstanceId: string) => Promise<void>;
    /**
     * Trust a certificate for a specific origin in a tab and reload.
     * This adds the origin to a per-tab whitelist that allows certificate errors.
     * The whitelist is cleared when the tab is closed.
     */
    trustCertificateAndReload: (tabId: string, origin: string) => Promise<void>;
    /**
     * Forward a UI telemetry event to the backend TelemetryService. The
     * backend validates the event name against `UI_TELEMETRY_EVENT_NAMES`
     * and the payload against a per-event Zod schema — unknown names or
     * invalid shapes are silently dropped.
     */
    captureTelemetry: (
      eventName: string,
      properties?: Record<string, unknown>,
    ) => Promise<void>;
  };
};

export const defaultState: PagesApiState = {
  pendingAppMessagesByAgentInstanceId: {},
  globalConfig: {
    notificationSoundLoudness: 'subtle',
    notificationSoundPack: 'bubble-pops',
    dockBounceEnabled: true,
    blockAppSuspensionWhenAgentsActive: true,
    personalizationThemeId: 'default',
    appColorScheme: 'system',
  },
  workspaceMounts: [],
  plans: [],
};
