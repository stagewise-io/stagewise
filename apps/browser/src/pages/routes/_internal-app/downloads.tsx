import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { IconDownloadFill18, IconMagnifierFill18 } from 'nucleo-ui-fill-18';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Loader2Icon,
  PlayIcon,
  PauseIcon,
  XIcon,
  TrashIcon,
  FolderOpenIcon,
} from 'lucide-react';
import {
  useKartonProcedure,
  useKartonState,
  useKartonConnected,
} from '@/hooks/use-karton';
import {
  DownloadState,
  type DownloadsFilter,
  type DownloadResult,
  type DownloadSpeedDataPoint,
} from '@shared/karton-contracts/pages-api/types';
import { List } from 'react-window';
import { AreaChart, Area, ResponsiveContainer, XAxis } from 'recharts';

export const Route = createFileRoute('/_internal-app/downloads')({
  component: Page,
  head: () => ({
    meta: [
      {
        title: 'Downloads',
      },
    ],
  }),
});

const PAGE_SIZE = 50;
const DATE_HEADER_HEIGHT = 64;
const ENTRY_ROW_HEIGHT = 80;

type DateHeaderRow = {
  type: 'date-header';
  date: string;
};

type EntryRow = {
  type: 'entry';
  id: number;
  time: string;
  filename: string;
  url: string;
  state: DownloadState;
  receivedBytes: number;
  totalBytes: number;
  fileExists: boolean;
  currentPath: string;
  // Active download info (merged from backend)
  isActive: boolean;
  progress: number;
  isPaused: boolean;
  canResume: boolean;
  // Speed tracking (for active downloads)
  startTime: Date;
  currentSpeedKBps?: number;
  speedHistory?: DownloadSpeedDataPoint[];
};

type Row = DateHeaderRow | EntryRow;

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatSpeed(kbps: number): string {
  if (kbps < 1000) {
    return `${Math.round(kbps)} KB/s`;
  }
  return `${(kbps / 1024).toFixed(1)} MB/s`;
}

function getDownloadStateLabel(state: DownloadState): string {
  switch (state) {
    case DownloadState.IN_PROGRESS:
      return 'In Progress';
    case DownloadState.COMPLETE:
      return 'Complete';
    case DownloadState.CANCELLED:
      return 'Cancelled';
    case DownloadState.INTERRUPTED:
      return 'Interrupted';
    default:
      return 'Unknown';
  }
}

function getUrlDomain(url: string): string {
  try {
    if (url.startsWith('file://')) {
      return url;
    }
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}

// Constants for speed graph
const MIN_GRAPH_DURATION_MS = 60 * 1000; // 1 minute minimum
const MAX_GRAPH_DURATION_MS = 10 * 60 * 1000; // 10 minutes maximum

// Speed graph component for active downloads
function SpeedGraph({
  speedHistory,
  startTime,
}: {
  speedHistory?: DownloadSpeedDataPoint[];
  startTime: Date;
}) {
  const chartData = useMemo(() => {
    const now = Date.now();
    const downloadStartMs = startTime.getTime();
    const downloadDuration = now - downloadStartMs;

    // Determine the time window to display (1-10 minutes)
    const displayDuration = Math.max(
      MIN_GRAPH_DURATION_MS,
      Math.min(MAX_GRAPH_DURATION_MS, downloadDuration),
    );

    // Calculate start of the display window
    const windowStart = now - displayDuration;

    // Build data array using actual timestamps for proper variable spacing
    const data: { timestamp: number; speed: number }[] = [];

    // Add a zero point at window start (or download start if later)
    const effectiveStart = Math.max(windowStart, downloadStartMs);
    data.push({ timestamp: windowStart, speed: 0 });

    if (windowStart < downloadStartMs) {
      // Add a zero point right at download start for a flat line before download
      data.push({ timestamp: downloadStartMs, speed: 0 });
    }

    // Add actual speed data points within the window
    if (speedHistory && speedHistory.length > 0) {
      for (const point of speedHistory) {
        if (point.timestamp >= effectiveStart) {
          data.push({
            timestamp: point.timestamp,
            speed: point.speedKBps,
          });
        }
      }
    }

    // Add current time point with last known speed
    const lastSpeed =
      speedHistory && speedHistory.length > 0
        ? speedHistory[speedHistory.length - 1].speedKBps
        : 0;
    data.push({ timestamp: now, speed: lastSpeed });

    return data;
  }, [speedHistory, startTime]);

  // Don't render if no data
  if (chartData.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 bottom-0.5 opacity-15">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--color-primary)"
                stopOpacity={0.8}
              />
              <stop
                offset="195%"
                stopColor="var(--color-primary)"
                stopOpacity={0.0}
              />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={['dataMin', 'dataMax']}
            hide
          />
          <Area
            type="monotone"
            dataKey="speed"
            stroke="var(--color-primary)"
            strokeWidth={1.5}
            fill="url(#speedGradient)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Safely convert a value to a Date object
function toDate(value: Date | string | number | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Extended download result with speed data for active downloads
type ExtendedDownloadResult = DownloadResult & {
  currentSpeedKBps?: number;
  speedHistory?: DownloadSpeedDataPoint[];
};

// Convert download results to flat row list with date headers
function downloadsToRows(downloads: ExtendedDownloadResult[]): Row[] {
  const rows: Row[] = [];
  let currentDate: string | null = null;

  for (const entry of downloads) {
    // Safely convert startTime (may be string from serialization or undefined)
    const startTime = toDate(entry.startTime);
    if (!startTime) {
      // Skip entries with invalid/missing startTime
      continue;
    }

    const dateKey = formatDate(startTime);
    if (dateKey !== currentDate) {
      currentDate = dateKey;
      rows.push({ type: 'date-header', date: dateKey });
    }
    rows.push({
      type: 'entry',
      id: entry.id,
      time: formatTime(startTime),
      filename: entry.filename,
      url: entry.siteUrl,
      state: entry.state,
      receivedBytes: entry.receivedBytes,
      totalBytes: entry.totalBytes,
      fileExists: entry.fileExists,
      currentPath: entry.currentPath,
      isActive: entry.isActive ?? false,
      progress: entry.progress ?? 0,
      isPaused: entry.isPaused ?? false,
      canResume: entry.canResume ?? false,
      startTime,
      currentSpeedKBps: entry.currentSpeedKBps,
      speedHistory: entry.speedHistory,
    });
  }

  return rows;
}

// Row props type for the List component
type RowProps = {
  rows: Row[];
  onOpenFile: (path: string) => void;
  onShowInFolder: (path: string) => void;
  onPauseDownload: (id: number) => void;
  onResumeDownload: (id: number) => void;
  onCancelDownload: (id: number) => void;
  onDeleteDownload: (id: number) => void;
};

// Row component for the virtualized list
function RowComponent({
  index,
  style,
  rows,
  onOpenFile,
  onShowInFolder,
  onPauseDownload,
  onResumeDownload,
  onCancelDownload,
  onDeleteDownload,
}: {
  index: number;
  style: React.CSSProperties;
  ariaAttributes: {
    'aria-posinset': number;
    'aria-setsize': number;
    role: 'listitem';
  };
} & RowProps) {
  const row = rows[index];

  if (row.type === 'date-header') {
    return (
      <div style={style} className="flex items-end pt-6 pb-3">
        <h2 className="font-medium text-foreground text-lg">{row.date}</h2>
      </div>
    );
  }

  // Use merged progress info directly from the row
  const isComplete = row.state === DownloadState.COMPLETE;

  return (
    <div style={style} className="relative">
      {/* Speed graph background for active downloads */}
      {row.isActive && (
        <SpeedGraph speedHistory={row.speedHistory} startTime={row.startTime} />
      )}
      <div
        className={`group relative z-10 flex h-full cursor-pointer select-none flex-col justify-center gap-2 rounded-lg bg-background px-4 ${
          row.fileExists || row.isActive
            ? 'hover:bg-hover-derived'
            : 'opacity-60'
        }`}
        onClick={() => {
          if (row.fileExists && isComplete) {
            onOpenFile(row.currentPath);
          }
        }}
      >
        <div className="flex items-center gap-4">
          <IconDownloadFill18 className="size-4 shrink-0 text-muted-foreground" />
          <div className="flex-1 truncate">
            <div className="flex items-center gap-2">
              <span className="truncate text-foreground text-sm">
                {row.filename}
              </span>
              {!row.fileExists && !row.isActive && (
                <span className="text-destructive text-xs">(Deleted)</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <span>{getUrlDomain(row.url)}</span>
              <span>•</span>
              {row.isActive ? (
                // During download: show received / total and speed or paused status
                <>
                  <span>{formatBytes(row.receivedBytes)}</span>
                  {row.totalBytes > 0 && (
                    <>
                      <span>/</span>
                      <span>{formatBytes(row.totalBytes)}</span>
                    </>
                  )}
                  <span>•</span>
                  {row.isPaused ? (
                    <span>Paused</span>
                  ) : (
                    <span>
                      {row.currentSpeedKBps !== undefined &&
                      row.currentSpeedKBps > 0
                        ? formatSpeed(row.currentSpeedKBps)
                        : 'Starting...'}
                    </span>
                  )}
                </>
              ) : (
                // After download: show total size and state
                <>
                  {row.totalBytes > 0 && (
                    <span className="font-normal">
                      {formatBytes(row.totalBytes)}
                    </span>
                  )}
                  <span>•</span>
                  <span>{getDownloadStateLabel(row.state)}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
            {/* During download: show pause/resume and stop buttons */}
            {row.isActive && (
              <>
                {row.isPaused ? (
                  <Tooltip>
                    <TooltipTrigger>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onResumeDownload(row.id);
                        }}
                        disabled={!row.canResume}
                      >
                        <PlayIcon className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Resume</TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPauseDownload(row.id);
                        }}
                      >
                        <PauseIcon className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Pause</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCancelDownload(row.id);
                      }}
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Stop</TooltipContent>
                </Tooltip>
              </>
            )}
            {/* After download: show folder and trash buttons */}
            {!row.isActive && (
              <>
                {row.fileExists && isComplete && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowInFolder(row.currentPath);
                        }}
                      >
                        <FolderOpenIcon className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Show in folder</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteDownload(row.id);
                      }}
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {row.fileExists ? 'Delete file' : 'Remove from list'}
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </div>

        {/* Progress bar for active downloads */}
        {row.isActive && (
          <div className="ml-8 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
              {row.totalBytes > 0 ? (
                // Determinate progress bar
                <div
                  className="h-full bg-primary-accent transition-all duration-300"
                  style={{ width: `${Math.min(row.progress, 100)}%` }}
                />
              ) : (
                // Indeterminate progress bar (unknown total size)
                <div className="h-full w-1/3 animate-[indeterminate_1.5s_ease-in-out_infinite] bg-primary-accent" />
              )}
            </div>
            <span className="text-muted-foreground text-xs">
              {row.totalBytes > 0 ? `${row.progress}%` : '...'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Page() {
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [historicalDownloads, setHistoricalDownloads] = useState<
    DownloadResult[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Wait for Karton connection before fetching data
  const isConnected = useKartonConnected();

  // Get active downloads from state (pushed in real-time from backend)
  const activeDownloads = useKartonState((s) => s.activeDownloads);

  const getDownloads = useKartonProcedure((s) => s.getDownloads);
  const openDownloadFile = useKartonProcedure((s) => s.openDownloadFile);
  const showDownloadInFolder = useKartonProcedure(
    (s) => s.showDownloadInFolder,
  );
  const pauseDownload = useKartonProcedure((s) => s.pauseDownload);
  const resumeDownload = useKartonProcedure((s) => s.resumeDownload);
  const cancelDownload = useKartonProcedure((s) => s.cancelDownload);
  const deleteDownload = useKartonProcedure((s) => s.deleteDownload);
  const markDownloadsSeen = useKartonProcedure((s) => s.markDownloadsSeen);

  // Ref to avoid getDownloads in useCallback dependencies (it's not stable)
  const getDownloadsRef = useRef(getDownloads);
  useEffect(() => {
    getDownloadsRef.current = getDownloads;
  }, [getDownloads]);

  const listRef = useRef<{
    readonly element: HTMLDivElement | null;
    scrollToRow: (config: {
      align?: 'auto' | 'center' | 'end' | 'smart' | 'start';
      behavior?: 'auto' | 'instant' | 'smooth';
      index: number;
    }) => void;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Mark downloads as seen when the page is opened
  useEffect(() => {
    if (!isConnected) return;
    void markDownloadsSeen();
  }, [isConnected, markDownloadsSeen]);

  // Debounce search text
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchText]);

  // Measure container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    resizeObserver.observe(container);
    setContainerSize({
      width: container.clientWidth,
      height: container.clientHeight,
    });

    return () => resizeObserver.disconnect();
  }, []);

  // Refetch historical downloads list (finished/aborted downloads from database)
  const refetchHistoricalDownloads = useCallback(async () => {
    try {
      const filter: DownloadsFilter = {
        text: debouncedSearchText.trim() || undefined,
        limit: PAGE_SIZE,
        offset: 0,
      };
      const results = await getDownloadsRef.current(filter);
      setHistoricalDownloads(results);
      setHasMore(results.length === PAGE_SIZE);
      return results;
    } catch (err) {
      console.error('Failed to refetch historical downloads:', err);
      return [];
    }
  }, [debouncedSearchText]);

  // Create a stable string key from active download IDs to detect when downloads are added/removed
  // This avoids triggering the effect on every progress update
  const activeDownloadIds = useMemo(
    () => Object.keys(activeDownloads).sort().join(','),
    [activeDownloads],
  );

  // Track previous active download IDs to detect when downloads are removed
  const prevActiveIdsRef = useRef<string>('');

  // Refetch historical downloads when an active download disappears
  // (e.g., cancelled/completed from another UI like the popover)
  useEffect(() => {
    const prevIds = prevActiveIdsRef.current;
    const currentIds = activeDownloadIds;

    // Only compare if we have a previous state
    if (prevIds !== '') {
      const prevIdSet = new Set(prevIds.split(',').filter(Boolean));
      const currentIdSet = new Set(currentIds.split(',').filter(Boolean));

      // Check if any downloads were removed (present in prev but not in current)
      const hasRemovedDownloads = Array.from(prevIdSet).some(
        (id) => !currentIdSet.has(id),
      );

      if (hasRemovedDownloads && isConnected) {
        // A download was removed, refetch historical to show updated state
        // Small delay to ensure DB update has fully propagated
        const timeoutId = setTimeout(() => {
          void refetchHistoricalDownloads();
        }, 150);
        // Update ref before returning cleanup
        prevActiveIdsRef.current = currentIds;
        return () => clearTimeout(timeoutId);
      }
    }

    // Update ref for next comparison
    prevActiveIdsRef.current = currentIds;
  }, [activeDownloadIds, isConnected, refetchHistoricalDownloads]);

  // Merge active downloads (from state) with historical downloads (from procedure)
  const downloads = useMemo((): ExtendedDownloadResult[] => {
    // Get active download IDs to exclude them from historical list
    const activeIds = new Set(Object.keys(activeDownloads).map(Number));

    // Convert active downloads to ExtendedDownloadResult format for display
    const activeList: ExtendedDownloadResult[] = Object.values(activeDownloads)
      .filter((d) => {
        // Filter by search text if provided
        if (!debouncedSearchText.trim()) return true;
        const search = debouncedSearchText.toLowerCase();
        return (
          d.filename.toLowerCase().includes(search) ||
          d.url.toLowerCase().includes(search)
        );
      })
      .map((d) => {
        // Ensure startTime is a proper Date (may be string from serialization)
        const startTime = toDate(d.startTime) ?? new Date();
        return {
          id: d.id,
          guid: `${d.id}`,
          currentPath: d.targetPath,
          targetPath: d.targetPath,
          filename: d.filename,
          startTime,
          endTime: null,
          receivedBytes: d.receivedBytes,
          totalBytes: d.totalBytes,
          state: d.state,
          mimeType: '',
          siteUrl: d.url,
          fileExists: true,
          isActive: true,
          progress: d.progress,
          isPaused: d.isPaused,
          canResume: d.canResume,
          currentSpeedKBps: d.currentSpeedKBps,
          speedHistory: d.speedHistory,
        };
      })
      // Sort by start time descending (most recent first)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    // Filter out active downloads from historical list and combine
    const historicalList = historicalDownloads.filter(
      (d) => !activeIds.has(d.id),
    );

    return [...activeList, ...historicalList];
  }, [activeDownloads, historicalDownloads, debouncedSearchText]);

  // Poll for historical downloads (less frequently since active downloads come from state)
  // Note: Initial fetch is handled by the search effect below, this only sets up periodic refresh
  useEffect(() => {
    // Don't start polling until connection is established
    if (!isConnected) return;

    let isMounted = true;

    const poll = async () => {
      if (!isMounted) return;
      await refetchHistoricalDownloads();
    };

    // Set up polling interval (30 seconds for historical downloads)
    // Skip immediate fetch - the search effect handles initial load
    const intervalId = setInterval(poll, 30000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [refetchHistoricalDownloads, isConnected]);

  // Load initial historical downloads when search changes or connection is established
  useEffect(() => {
    // Don't fetch until connection is established
    if (!isConnected) return;

    let cancelled = false;

    async function fetchInitialDownloads() {
      setIsLoading(true);
      setError(null);
      setHistoricalDownloads([]);
      setHasMore(true);

      // Reset list scroll position
      if (listRef.current) {
        listRef.current.scrollToRow({ index: 0 });
      }

      try {
        const filter: DownloadsFilter = {
          text: debouncedSearchText.trim() || undefined,
          limit: PAGE_SIZE,
          offset: 0,
        };

        const results = await getDownloadsRef.current(filter);

        if (!cancelled) {
          setHistoricalDownloads(results);
          setHasMore(results.length === PAGE_SIZE);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err : new Error('Failed to load downloads'),
          );
          setIsLoading(false);
        }
      }
    }

    fetchInitialDownloads();

    return () => {
      cancelled = true;
    };
  }, [debouncedSearchText, isConnected]);

  // Load more historical downloads (for infinite scroll)
  const loadMoreDownloads = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);

    try {
      const filter: DownloadsFilter = {
        text: debouncedSearchText.trim() || undefined,
        limit: PAGE_SIZE,
        offset: historicalDownloads.length,
      };

      const results = await getDownloadsRef.current(filter);

      setHistoricalDownloads((prev) => [...prev, ...results]);
      setHasMore(results.length === PAGE_SIZE);
    } catch (err) {
      console.error('Failed to load more downloads:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, debouncedSearchText, historicalDownloads.length]);

  // Convert downloads to flat rows
  const rows = useMemo(() => downloadsToRows(downloads), [downloads]);

  // Get row height based on row type
  const getRowHeight = useCallback(
    (index: number): number => {
      if (index >= rows.length) {
        return ENTRY_ROW_HEIGHT;
      }
      const row = rows[index];
      return row.type === 'date-header' ? DATE_HEADER_HEIGHT : ENTRY_ROW_HEIGHT;
    },
    [rows],
  );

  // Handle rows rendered - trigger load more when near bottom
  const handleRowsRendered = useCallback(
    (
      visibleRows: { startIndex: number; stopIndex: number },
      _allRows: { startIndex: number; stopIndex: number },
    ) => {
      // Load more when we're within 10 items of the end
      if (
        hasMore &&
        !isLoadingMore &&
        !isLoading &&
        visibleRows.stopIndex >= rows.length - 10
      ) {
        loadMoreDownloads();
      }
    },
    [hasMore, isLoadingMore, isLoading, rows.length, loadMoreDownloads],
  );

  // Error cause message extraction
  const errorCauseMessage = useMemo((): string | null => {
    if (!error || !('cause' in error) || !error.cause) return null;
    return error.cause instanceof Error
      ? error.cause.message
      : String(error.cause);
  }, [error]);

  // Handle retry after error
  const handleRetry = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const filter: DownloadsFilter = {
        text: debouncedSearchText.trim() || undefined,
        limit: PAGE_SIZE,
        offset: 0,
      };
      const results = await getDownloadsRef.current(filter);
      setHistoricalDownloads(results);
      setHasMore(results.length === PAGE_SIZE);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error('Failed to load downloads'),
      );
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearchText]);

  // Handle opening file using system default application
  const handleOpenFile = useCallback(
    async (filePath: string) => {
      try {
        const result = await openDownloadFile(filePath);
        if (!result.success) {
          console.error('Failed to open file:', result.error);
        }
      } catch (err) {
        console.error('Failed to open file:', err);
      }
    },
    [openDownloadFile],
  );

  // Handle showing file in folder (Finder/Explorer)
  const handleShowInFolder = useCallback(
    async (filePath: string) => {
      try {
        const result = await showDownloadInFolder(filePath);
        if (!result.success) {
          console.error('Failed to show file in folder:', result.error);
        }
      } catch (err) {
        console.error('Failed to show file in folder:', err);
      }
    },
    [showDownloadInFolder],
  );

  // Handle pause download (state will update automatically via push)
  const handlePauseDownload = useCallback(
    async (id: number) => {
      try {
        await pauseDownload(id);
      } catch (err) {
        console.error('Failed to pause download:', err);
      }
    },
    [pauseDownload],
  );

  // Handle resume download (state will update automatically via push)
  const handleResumeDownload = useCallback(
    async (id: number) => {
      try {
        await resumeDownload(id);
      } catch (err) {
        console.error('Failed to resume download:', err);
      }
    },
    [resumeDownload],
  );

  // Handle cancel download (state will update automatically via push)
  const handleCancelDownload = useCallback(
    async (id: number) => {
      try {
        await cancelDownload(id);
        // Refetch historical downloads to show the cancelled entry
        await refetchHistoricalDownloads();
      } catch (err) {
        console.error('Failed to cancel download:', err);
      }
    },
    [cancelDownload, refetchHistoricalDownloads],
  );

  // Handle delete download
  const handleDeleteDownload = useCallback(
    async (id: number) => {
      try {
        await deleteDownload(id);
        // Remove from the historical list (active downloads are handled via state)
        setHistoricalDownloads((prev) => prev.filter((d) => d.id !== id));
      } catch (err) {
        console.error('Failed to delete download:', err);
      }
    },
    [deleteDownload],
  );

  // Row props for the list
  const rowProps = useMemo(
    () => ({
      rows,
      onOpenFile: handleOpenFile,
      onShowInFolder: handleShowInFolder,
      onPauseDownload: handlePauseDownload,
      onResumeDownload: handleResumeDownload,
      onCancelDownload: handleCancelDownload,
      onDeleteDownload: handleDeleteDownload,
    }),
    [
      rows,
      handleOpenFile,
      handleShowInFolder,
      handlePauseDownload,
      handleResumeDownload,
      handleCancelDownload,
      handleDeleteDownload,
    ],
  );

  return (
    <div className="flex h-full w-full flex-col">
      {/* Keyframes for indeterminate progress bar */}
      <style>{`
        @keyframes indeterminate {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(200%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
      {/* Header */}
      <div className="flex items-center border-border-subtle border-b px-6 py-4">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-24">
          <h1 className="font-semibold text-foreground text-xl">Downloads</h1>
          <div className="relative flex-1 rounded-full bg-surface-1 focus-within:bg-hover-derived">
            <IconMagnifierFill18 className="-translate-y-1/2 absolute top-1/2 left-3.5 z-10 size-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search downloads"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="rounded-full border-none bg-transparent pl-10 before:hidden focus:border-none focus:outline-none focus:ring-0"
            />
          </div>
        </div>
      </div>

      {/* Downloads entries */}
      <div className="flex-1 overflow-hidden p-6">
        <div
          ref={containerRef}
          className="mx-auto h-full max-w-3xl overflow-hidden"
        >
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center px-4">
              <div className="max-w-md space-y-2 text-center">
                <p className="font-medium text-destructive text-sm">
                  {error.message}
                </p>
                {import.meta.env.DEV && error.stack && (
                  <details className="mt-4 text-left">
                    <summary className="cursor-pointer text-muted-foreground text-xs">
                      Technical details (dev mode)
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded bg-surface-1 p-2 text-muted-foreground text-xs">
                      {error.stack}
                    </pre>
                  </details>
                )}
                {errorCauseMessage && (
                  <p className="text-muted-foreground text-xs">
                    Cause: {errorCauseMessage}
                  </p>
                )}
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={handleRetry}
              >
                Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-muted-foreground text-sm">
                {searchText
                  ? 'No downloads found matching your search'
                  : 'No downloads yet'}
              </p>
            </div>
          ) : containerSize.height > 0 ? (
            <>
              <List
                listRef={listRef}
                rowCount={rows.length}
                rowHeight={getRowHeight}
                rowComponent={RowComponent}
                rowProps={rowProps}
                onRowsRendered={handleRowsRendered}
                overscanCount={5}
                className="scrollbar-subtle"
                style={{
                  height: containerSize.height,
                  width: containerSize.width,
                }}
              />
              {isLoadingMore && (
                <div className="absolute inset-x-0 bottom-0 flex h-14 items-center justify-center bg-linear-to-t from-background to-transparent">
                  <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
