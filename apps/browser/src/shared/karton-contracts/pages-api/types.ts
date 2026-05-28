import type { FileDiff } from '../ui/shared-types';
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

export type DownloadState =
  | 'in_progress'
  | 'complete'
  | 'cancelled'
  | 'interrupted';

export interface DownloadsFilter {
  search?: string;
  limit?: number;
  offset?: number;
  state?: DownloadState;
}

export interface DownloadResult {
  id: number;
  guid: string;
  url: string;
  targetPath: string;
  filename: string;
  fileExists: boolean;
  state: DownloadState;
  receivedBytes: number;
  totalBytes: number;
  startTime: Date;
  endTime?: Date | null;
  isActive: boolean;
  progress: number;
  isPaused?: boolean;
  canResume?: boolean;
}

export interface ActiveDownloadInfo {
  id: number;
  state: DownloadState;
  receivedBytes: number;
  totalBytes: number;
  isPaused: boolean;
  canResume: boolean;
  progress?: number;
  filename: string;
  url: string;
  targetPath: string;
  startTime: Date;
  currentSpeedKBps?: number;
  speedHistory?: Array<{
    timestamp: number;
    speedKBps: number;
    totalBytes: number;
  }>;
}

export interface DownloadControlResult {
  success: boolean;
  error?: string;
}

// Options for clearing browsing data
export interface ClearBrowsingDataOptions {
  /** Clear browsing history (URLs, visits, search terms, etc.) */
  history?: boolean;
  /** Clear cached favicons */
  favicons?: boolean;
  /** Clear download history (only applies to "all time" — not time-range scoped) */
  downloads?: boolean;
  /** Optional time range - only clear data within this range (applies to history and session data; downloads are skipped when a time range is set) */
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
  /** Whether downloads were cleared */
  downloadsCleared?: boolean;
  /** Number of favicons cleared */
  faviconsCleared?: number;
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

// Result of getting pending edits for a chat
export interface PendingEditsResult {
  /** Whether the chat was found */
  found: boolean;
  /** Pending file diffs */
  edits: FileDiff[];
}

// Re-export search engine types from shared-types
export type {
  SearchEngine,
  AddSearchEngineInput,
} from '../ui/shared-types';

/** Result of adding a search engine */
export type AddSearchEngineResult =
  | { success: true; id: number }
  | { success: false; error: string };

/** Result of removing a search engine */
export interface RemoveSearchEngineResult {
  success: boolean;
  error?: string;
}

/** Information about a single context file */
export interface ContextFileInfo {
  /** Whether the file exists */
  exists: boolean;
  /** Absolute path to the file (null if workspace not loaded) */
  path: string | null;
  /** File content (null if file doesn't exist or couldn't be read) */
  content: string | null;
}

/** Result of getContextFiles procedure */
export interface ContextFilesResult {
  [workspacePath: string]: {
    /**  file info (auto-generated project analysis at .stagewise/) */
    workspaceMd: ContextFileInfo;
    /** AGENTS.md file info (user-created coding guidelines) */
    agentsMd: ContextFileInfo;
  };
}

export interface LocalPortEntry {
  port: number;
  url: string;
}

/** Result of getExternalFileContent procedure */
export interface ExternalFileContentResult {
  /** Base64-encoded file content */
  content: string;
  /** MIME type inferred from file extension (null if unknown) */
  mimeType: string | null;
}

// ─── Usage Types ─────────────────────────────────────────────────────────────

export type UsageWindowType = 'daily' | 'weekly' | 'monthly';
export type UsagePlan = 'free' | 'pro' | 'ultra';

export interface UsageWindowStatus {
  type: UsageWindowType;
  /** Percentage of window used (0–100) */
  usedPercent: number;
  exceeded: boolean;
  /** ISO timestamp when the window resets */
  resetsAt: string;
}

export interface CurrentUsageResponse {
  plan: UsagePlan;
  windows: UsageWindowStatus[];
  /** Available prepaid credits (1/100 USD-cent) */
  prepaidBalance: number;
}

export interface UsageModelBreakdown {
  model: string;
  /** Model cost as percentage of that day total (0–100) */
  costPercent: number;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
}

export interface UsageDailyBreakdown {
  date: string;
  models: UsageModelBreakdown[];
}

export interface UsageHistoryResponse {
  days: UsageDailyBreakdown[];
}
