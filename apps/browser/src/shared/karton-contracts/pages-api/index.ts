import type {
  HistoryFilter,
  HistoryResult,
  FaviconBitmapResult,
  ClearBrowsingDataOptions,
  ClearBrowsingDataResult,
  DownloadsFilter,
  DownloadResult,
  ActiveDownloadInfo,
  DownloadControlResult,
  PendingEditsResult,
  FileDiffResult,
} from './types';
import type { UserPreferences, Patch } from '../ui/shared-types';
import { defaultUserPreferences } from '../ui/shared-types';

export type PagesApiState = {
  /** Active downloads currently in progress, keyed by download ID */
  activeDownloads: Record<number, ActiveDownloadInfo>;
  /** Pending file edits by chat ID, pushed in real-time */
  pendingEditsByChat: Record<string, FileDiffResult[]>;
  /** User preferences (read-only sync) */
  preferences: UserPreferences;
  // Current stagewise app runtime information
  appInfo: {
    baseName: string; // Base name (e.g., 'stagewise-dev', 'stagewise-prerelease', 'stagewise').
    name: string; // Display name (e.g., 'stagewise (Dev-Build)', 'stagewise').
    bundleId: string; // Bundle ID (e.g., 'io.stagewise.dev').
    version: string; // The version of the app.
    platform: 'darwin' | 'linux' | 'win32'; // The platform on which the app is running.
    // Build-time constants
    releaseChannel: 'dev' | 'prerelease' | 'release'; // The release channel of the app.
    author: string; // Author name.
    copyright: string; // Copyright string.
    homepage: string; // Homepage URL.
    arch: string; // Architecture (e.g., 'x64', 'arm64').
    otherVersions: Record<string, string | undefined>; // Other versions of the app.
  };
};

export type PagesApiContract = {
  state: PagesApiState;
  serverProcedures: {
    getHistory: (filter: HistoryFilter) => Promise<HistoryResult[]>;
    getDownloads: (filter: DownloadsFilter) => Promise<DownloadResult[]>;
    getActiveDownloads: () => Promise<ActiveDownloadInfo[]>;
    deleteDownload: (downloadId: number) => Promise<DownloadControlResult>;
    pauseDownload: (downloadId: number) => Promise<DownloadControlResult>;
    resumeDownload: (downloadId: number) => Promise<DownloadControlResult>;
    cancelDownload: (downloadId: number) => Promise<DownloadControlResult>;
    /** Open a downloaded file using the system default application */
    openDownloadFile: (filePath: string) => Promise<DownloadControlResult>;
    /** Show a downloaded file in the system file manager (Finder/Explorer) */
    showDownloadInFolder: (filePath: string) => Promise<DownloadControlResult>;
    /** Mark all downloads as seen (updates lastSeenAt timestamp for UI) */
    markDownloadsSeen: () => Promise<void>;
    getFaviconBitmaps: (
      faviconUrls: string[],
    ) => Promise<Record<string, FaviconBitmapResult>>;
    openTab: (url: string, setActive?: boolean) => Promise<void>;
    clearBrowsingData: (
      options: ClearBrowsingDataOptions,
    ) => Promise<ClearBrowsingDataResult>;
    /** Get pending file edits for a specific chat */
    getPendingEdits: (chatId: string) => Promise<PendingEditsResult>;
    /** Accept all pending edits for a specific chat */
    acceptAllPendingEdits: (chatId: string) => Promise<void>;
    /** Reject all pending edits for a specific chat */
    rejectAllPendingEdits: (chatId: string) => Promise<void>;
    /** Accept a single pending edit by file path */
    acceptPendingEdit: (chatId: string, path: string) => Promise<void>;
    /** Reject a single pending edit by file path */
    rejectPendingEdit: (chatId: string, path: string) => Promise<void>;
    /** Get current user preferences */
    getPreferences: () => Promise<UserPreferences>;
    /** Update user preferences by applying Immer patches */
    updatePreferences: (patches: Patch[]) => Promise<void>;
  };
};

export const defaultState: PagesApiState = {
  activeDownloads: {},
  pendingEditsByChat: {},
  preferences: defaultUserPreferences,
  appInfo: {
    baseName: __APP_BASE_NAME__,
    name: __APP_NAME__,
    bundleId: __APP_BUNDLE_ID__,
    version: __APP_VERSION__,
    platform: __APP_PLATFORM__ as 'darwin' | 'linux' | 'win32',
    releaseChannel: __APP_RELEASE_CHANNEL__,
    author: __APP_AUTHOR__,
    copyright: __APP_COPYRIGHT__,
    homepage: __APP_HOMEPAGE__,
    arch: __APP_ARCH__,
    otherVersions: {},
  },
};
