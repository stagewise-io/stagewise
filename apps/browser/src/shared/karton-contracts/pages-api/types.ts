// Enum for how the user arrived at the page (matches Chrome's internal integers)
// Core transition types are stored in the lower 8 bits
export enum PageTransition {
  LINK = 0,
  TYPED = 1,
  AUTO_BOOKMARK = 2,
  AUTO_SUBFRAME = 3,
  MANUAL_SUBFRAME = 4,
  GENERATED = 5,
  START_PAGE = 6,
  FORM_SUBMIT = 7,
  RELOAD = 8,
}

// Chrome's PageTransition qualifier flags (stored in upper bits)
// These can be combined with core transitions using bitwise OR
export enum PageTransitionQualifier {
  FORWARD_BACK = 0x01000000,
  FROM_ADDRESS_BAR = 0x02000000,
  HOME_PAGE = 0x04000000,
  FROM_API = 0x08000000,
  CHAIN_START = 0x10000000,
  CHAIN_END = 0x20000000,
  CLIENT_REDIRECT = 0x40000000,
  SERVER_REDIRECT = 0x80000000,
}

/**
 * Extract the core transition type from a qualified transition value.
 * Chrome stores qualifiers in the upper bits, so we mask them out.
 */
export function getCoreTransition(transition: number): PageTransition {
  return (transition & 0xff) as PageTransition;
}

/**
 * Combine a core transition with qualifier flags.
 * @param core - The core PageTransition type
 * @param qualifiers - Zero or more PageTransitionQualifier flags to combine
 * @returns The combined transition value
 */
export function makeQualifiedTransition(
  core: PageTransition,
  ...qualifiers: PageTransitionQualifier[]
): number {
  return qualifiers.reduce((acc, q) => acc | q, core);
}

// Input for recording a visit
export interface VisitInput {
  url: string;
  title?: string;
  transition?: PageTransition;
  visitTime?: Date; // Service converts this to WebKit timestamp
  referrerVisitId?: number; // The visit ID that led to this one
  isLocal?: boolean; // false = synced from other device
  durationMs?: number; // Duration in milliseconds
}

// Input for starting a download
export interface DownloadStartInput {
  guid: string;
  url: string;
  targetPath: string;
  startTime?: Date;
  totalBytes: number;
  mimeType: string;
}

// Filter for querying history
export interface HistoryFilter {
  text?: string; // Search title/url
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// Rich return type for history view
export interface HistoryResult {
  visitId: number;
  urlId: number;
  url: string;
  title: string | null;
  visitTime: Date;
  visitCount: number;
  transition: PageTransition;
  faviconUrl: string | null; // URL of the favicon (not the image data)
}

// Favicon bitmap result with base64 encoded image data
export interface FaviconBitmapResult {
  faviconUrl: string;
  imageData: string | null; // base64 encoded PNG/ICO data
  width: number;
  height: number;
}

// Input for batch favicon requests
export interface FaviconBatchRequest {
  faviconUrls: string[];
}

// Options for clearing browsing data
export interface ClearBrowsingDataOptions {
  /** Clear browsing history (URLs, visits, search terms, etc.) */
  history?: boolean;
  /** Clear cached favicons */
  favicons?: boolean;
  /** Clear download history (not the files themselves) */
  downloads?: boolean;
  /** Optional time range - only clear data within this range (applies to history and session data) */
  timeRange?: {
    /** Start of range (inclusive). If omitted, clears from beginning of time */
    start?: Date;
    /** End of range (inclusive). If omitted, clears to present */
    end?: Date;
  };
  /** Run VACUUM after clearing to reclaim disk space (default: true) */
  vacuum?: boolean;
  /** Clear cookies from the browser session */
  cookies?: boolean;
  /** Clear HTTP cache */
  cache?: boolean;
  /** Clear localStorage and sessionStorage */
  storage?: boolean;
  /** Clear IndexedDB databases */
  indexedDB?: boolean;
  /** Clear Service Workers */
  serviceWorkers?: boolean;
  /** Clear Cache Storage (Cache API) */
  cacheStorage?: boolean;
  /** Clear all saved permission exceptions (site-specific Allow/Block settings) */
  permissionExceptions?: boolean;
}

// Result of clearing browsing data
export interface ClearBrowsingDataResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Number of history entries (URLs) cleared */
  historyEntriesCleared?: number;
  /** Number of favicons cleared */
  faviconsCleared?: number;
  /** Number of downloads cleared */
  downloadsCleared?: number;
  /** Whether cookies were cleared */
  cookiesCleared?: boolean;
  /** Whether HTTP cache was cleared */
  cacheCleared?: boolean;
  /** Whether storage data was cleared */
  storageCleared?: boolean;
  /** Whether permission exceptions were cleared */
  permissionExceptionsCleared?: boolean;
  /** Error message if operation failed */
  error?: string;
}

// Download state enum (matches Chrome's internal values)
export enum DownloadState {
  IN_PROGRESS = 0,
  COMPLETE = 1,
  CANCELLED = 2,
  INTERRUPTED = 3,
}

/** Speed data point for download speed history */
export interface DownloadSpeedDataPoint {
  /** Unix timestamp in ms */
  timestamp: number;
  /** Speed in KB/s */
  speedKBps: number;
  /** Total bytes received at this point */
  totalBytes: number;
}

// Filter for querying downloads
export interface DownloadsFilter {
  /** Search text (matches filename or URL) */
  text?: string;
  /** Filter by download state */
  state?: DownloadState;
  /** Start date filter */
  startDate?: Date;
  /** End date filter */
  endDate?: Date;
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

// Rich return type for downloads view
export interface DownloadResult {
  /** Unique download ID */
  id: number;
  /** Download GUID */
  guid: string;
  /** Current file path (may have .crdownload suffix if incomplete) */
  currentPath: string;
  /** Target file path */
  targetPath: string;
  /** Filename extracted from target path */
  filename: string;
  /** Download start time */
  startTime: Date;
  /** Download end time (if completed) */
  endTime: Date | null;
  /** Bytes received so far */
  receivedBytes: number;
  /** Total bytes to download */
  totalBytes: number;
  /** Download state */
  state: DownloadState;
  /** MIME type of the file */
  mimeType: string;
  /** URL the file was downloaded from */
  siteUrl: string;
  /** Whether the file still exists on disk */
  fileExists: boolean;
  /** Whether this is an active/in-progress download */
  isActive?: boolean;
  /** Progress percentage for active downloads (0-100) */
  progress?: number;
  /** Whether the download is paused (only for active downloads) */
  isPaused?: boolean;
  /** Whether the download can be resumed (only for active downloads) */
  canResume?: boolean;
}

// Active download info (for real-time tracking via state)
export interface ActiveDownloadInfo {
  /** Download ID */
  id: number;
  /** Current state */
  state: DownloadState;
  /** Bytes received so far */
  receivedBytes: number;
  /** Total bytes to download */
  totalBytes: number;
  /** Whether the download is paused */
  isPaused: boolean;
  /** Whether the download can be resumed */
  canResume: boolean;
  /** Progress percentage (0-100) */
  progress: number;
  /** Filename extracted from target path */
  filename: string;
  /** URL the file is being downloaded from */
  url: string;
  /** Target path on disk */
  targetPath: string;
  /** Download start time */
  startTime: Date;
  /** Current download speed in KB/s (most recent measurement) */
  currentSpeedKBps: number;
  /** Speed history for graphing (up to 100 data points covering 10 minutes) */
  speedHistory: DownloadSpeedDataPoint[];
}

// Result of a download control operation
export interface DownloadControlResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if operation failed */
  error?: string;
}

// File diff for pending edits
export interface FileDiffResult {
  path: string;
  before: string | null;
  after: string | null;
}

// Result of getting pending edits for a chat
export interface PendingEditsResult {
  /** Whether the chat was found */
  found: boolean;
  /** Pending file diffs */
  edits: FileDiffResult[];
}

// Re-export search engine types from shared-types
export type {
  SearchEngine,
  AddSearchEngineInput,
} from '../ui/shared-types';

// Re-export home page types from UI contract
export type {
  InspirationWebsite,
  RecentlyOpenedWorkspace,
  StoredExperienceData,
  WorkspaceStatus,
} from '../ui';

/** Result of adding a search engine */
export type AddSearchEngineResult =
  | { success: true; id: number }
  | { success: false; error: string };

/** Result of removing a search engine */
export interface RemoveSearchEngineResult {
  success: boolean;
  error?: string;
}
