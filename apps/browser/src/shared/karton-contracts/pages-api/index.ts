import type {
  PendingEditsResult,
  ExternalFileContentResult,
  HistoryFilter,
  HistoryResult,
  FaviconBitmapResult,
} from './types';
import type { GlobalConfig } from '../ui/shared-types';
import type { PlanEntry } from '../ui';
import type { FileDiff } from '../ui/shared-types';

export type WorkspaceMountInfo = {
  prefix: string;
  path: string;
  git: import('../ui').MountedWorkspaceGitSummary | null;
  skills: Array<{ name: string; description: string }>;
  /** Full file content, or `null` when the file does not exist on disk. */
  workspaceMdContent: string | null;
  /** Full file content, or `null` when the file does not exist on disk. */
  agentsMdContent: string | null;
};

export type PagesApiState = {
  /** Pending file edits by chat ID, pushed in real-time */
  pendingEditsByAgentInstanceId: Record<string, FileDiff[]>;
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
    /** Get pending file edits for a specific chat */
    getPendingEdits: (agentInstanceId: string) => Promise<PendingEditsResult>;
    /** Accept all pending edits for a specific chat */
    acceptAllPendingEdits: (agentInstanceId: string) => Promise<void>;
    /** Reject all pending edits for a specific chat */
    rejectAllPendingEdits: (agentInstanceId: string) => Promise<void>;
    /** Accept a single pending edit by file path */
    acceptPendingEdit: (agentInstanceId: string, path: string) => Promise<void>;
    /** Reject a single pending edit by file path */
    rejectPendingEdit: (agentInstanceId: string, path: string) => Promise<void>;
    /**
     * Get content of an external (binary/large) file by its blob OID.
     * Returns base64-encoded content and inferred MIME type.
     * Returns null if the blob is not found.
     */
    getExternalFileContent: (
      oid: string,
    ) => Promise<ExternalFileContentResult | null>;
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
  pendingEditsByAgentInstanceId: {},
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
    blockAppSuspensionWhenAgentsActive: true,
  },
  workspaceMounts: [],
  plans: [],
};
