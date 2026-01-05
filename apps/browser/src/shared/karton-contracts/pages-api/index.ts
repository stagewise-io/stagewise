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

export type PagesApiState = {
  /** Active downloads currently in progress, keyed by download ID */
  activeDownloads: Record<number, ActiveDownloadInfo>;
  /** Pending file edits by chat ID, pushed in real-time */
  pendingEditsByChat: Record<string, FileDiffResult[]>;
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
  };
};

export const defaultState: PagesApiState = {
  activeDownloads: {},
  pendingEditsByChat: {},
};
