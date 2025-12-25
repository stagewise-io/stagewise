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
  type ActiveDownloadInfo,
} from '@shared/karton-contracts/pages-api/types';
import { List } from 'react-window';

export const Route = createFileRoute('/downloads')({
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

// Safely convert a value to a Date object
function toDate(value: Date | string | number | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Convert download results to flat row list with date headers
function downloadsToRows(downloads: DownloadResult[]): Row[] {
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
    <div style={style}>
      <div
        className={`group flex h-full cursor-pointer select-none flex-col justify-center gap-2 rounded-lg px-4 ${
          row.fileExists || row.isActive ? 'hover:bg-muted/50' : 'opacity-60'
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
                // During download: show received / total
                <>
                  <span>{formatBytes(row.receivedBytes)}</span>
                  {row.totalBytes > 0 && (
                    <>
                      <span>/</span>
                      <span>{formatBytes(row.totalBytes)}</span>
                    </>
                  )}
                  {row.isPaused && (
                    <>
                      <span>•</span>
                      <span>Paused</span>
                    </>
                  )}
                </>
              ) : (
                // After download: show total size and state
                <>
                  {row.totalBytes > 0 && (
                    <span>{formatBytes(row.totalBytes)}</span>
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
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              {row.totalBytes > 0 ? (
                // Determinate progress bar
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${Math.min(row.progress, 100)}%` }}
                />
              ) : (
                // Indeterminate progress bar (unknown total size)
                <div className="h-full w-1/3 animate-[indeterminate_1.5s_ease-in-out_infinite] bg-primary" />
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

  // Get active downloads from state (pushed in real-time)
  const activeDownloadsFromState = useKartonState((s) => s.activeDownloads);
  // Also track active downloads fetched via procedure (for initial load)
  const [fetchedActiveDownloads, setFetchedActiveDownloads] = useState<
    Record<number, ActiveDownloadInfo>
  >({});

  // Merge state-based and fetched active downloads (state takes priority as it's real-time)
  const activeDownloads = useMemo(() => {
    // State-based downloads take priority (real-time updates)
    // Fetched downloads fill in until state syncs
    return { ...fetchedActiveDownloads, ...activeDownloadsFromState };
  }, [activeDownloadsFromState, fetchedActiveDownloads]);

  const getDownloads = useKartonProcedure((s) => s.getDownloads);
  const getActiveDownloads = useKartonProcedure((s) => s.getActiveDownloads);
  const openDownloadFile = useKartonProcedure((s) => s.openDownloadFile);
  const showDownloadInFolder = useKartonProcedure(
    (s) => s.showDownloadInFolder,
  );
  const pauseDownload = useKartonProcedure((s) => s.pauseDownload);
  const resumeDownload = useKartonProcedure((s) => s.resumeDownload);
  const cancelDownload = useKartonProcedure((s) => s.cancelDownload);
  const deleteDownload = useKartonProcedure((s) => s.deleteDownload);

  const getDownloadsRef = useRef(getDownloads);
  const getActiveDownloadsRef = useRef(getActiveDownloads);
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

  // Update refs when procedures change
  useEffect(() => {
    getDownloadsRef.current = getDownloads;
  }, [getDownloads]);

  useEffect(() => {
    getActiveDownloadsRef.current = getActiveDownloads;
  }, [getActiveDownloads]);

  // Fetch active downloads when connection is established (for immediate visibility)
  useEffect(() => {
    if (!isConnected) return;

    let cancelled = false;

    async function fetchActiveDownloads() {
      try {
        const activeList = await getActiveDownloadsRef.current();
        if (!cancelled && activeList.length > 0) {
          // Convert array to record keyed by ID
          const activeRecord: Record<number, ActiveDownloadInfo> = {};
          for (const download of activeList) {
            activeRecord[download.id] = download;
          }
          setFetchedActiveDownloads(activeRecord);
        }
      } catch (err) {
        console.error('Failed to fetch active downloads:', err);
      }
    }

    fetchActiveDownloads();

    return () => {
      cancelled = true;
    };
  }, [isConnected]);

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

  // Merge active downloads (from state) with historical downloads (from procedure)
  const downloads = useMemo(() => {
    // Get active download IDs to exclude them from historical list
    const activeIds = new Set(Object.keys(activeDownloads).map(Number));

    // Convert active downloads to DownloadResult format for display
    const activeList: DownloadResult[] = Object.values(activeDownloads)
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
      <div className="flex items-center border-border/30 border-b px-6 py-4">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-24">
          <h1 className="font-semibold text-foreground text-xl">Downloads</h1>
          <div className="relative flex-1 rounded-full bg-zinc-500/5 focus-within:bg-zinc-500/10">
            <IconMagnifierFill18 className="-translate-y-1/2 absolute top-1/2 left-3.5 z-10 size-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search downloads"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full rounded-full pl-10 before:hidden"
              inputClassName="rounded-full pl-4 focus:outline-none focus:ring-0 bg-transparent"
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
                    <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 text-muted-foreground text-xs">
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
                className="scrollbar-thin scrollbar-thumb-zinc-300 hover:scrollbar-thumb-zinc-400 scrollbar-track-transparent dark:scrollbar-thumb-zinc-600 dark:hover:scrollbar-thumb-zinc-500"
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
