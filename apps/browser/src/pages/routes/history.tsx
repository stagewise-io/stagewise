import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { IconGlobe2Fill18, IconMagnifierFill18 } from 'nucleo-ui-fill-18';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Loader2Icon, LinkIcon } from 'lucide-react';
import { useKartonProcedure } from '@/hooks/use-karton';
import type {
  HistoryFilter,
  HistoryResult,
  FaviconBitmapResult,
} from '@shared/karton-contracts/pages-api/types';
import { List } from 'react-window';

export const Route = createFileRoute('/history')({
  component: Page,
  head: () => ({
    meta: [
      {
        title: 'History',
      },
    ],
  }),
});

const PAGE_SIZE = 50;
const DATE_HEADER_HEIGHT = 64;
const ENTRY_ROW_HEIGHT = 56;

type DateHeaderRow = {
  type: 'date-header';
  date: string;
};

type EntryRow = {
  type: 'entry';
  id: number;
  time: string;
  title: string;
  url: string;
  faviconUrl: string | null;
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

// Convert history results to flat row list with date headers
function historyToRows(history: HistoryResult[]): Row[] {
  const rows: Row[] = [];
  let currentDate: string | null = null;

  for (const entry of history) {
    const dateKey = formatDate(entry.visitTime);
    if (dateKey !== currentDate) {
      currentDate = dateKey;
      rows.push({ type: 'date-header', date: dateKey });
    }
    rows.push({
      type: 'entry',
      id: entry.visitId,
      time: formatTime(entry.visitTime),
      title: entry.title || 'Untitled',
      url: entry.url,
      faviconUrl: entry.faviconUrl,
    });
  }

  return rows;
}

// Favicon component with fallback
function Favicon({
  faviconUrl,
  bitmaps,
}: {
  faviconUrl: string | null;
  bitmaps: Record<string, FaviconBitmapResult>;
}) {
  if (!faviconUrl) {
    return (
      <IconGlobe2Fill18 className="size-4 shrink-0 text-muted-foreground" />
    );
  }

  const bitmap = bitmaps[faviconUrl];
  if (!bitmap?.imageData) {
    return (
      <IconGlobe2Fill18 className="size-4 shrink-0 text-muted-foreground" />
    );
  }

  const mimeType = faviconUrl.endsWith('.ico')
    ? 'image/x-icon'
    : faviconUrl.endsWith('.svg')
      ? 'image/svg+xml'
      : 'image/png';

  return (
    <img
      src={`data:${mimeType};base64,${bitmap.imageData}`}
      alt=""
      className="size-4 shrink-0 rounded-sm object-contain"
      onError={(e) => {
        e.currentTarget.style.display = 'none';
      }}
    />
  );
}

// Row props type for the List component
type RowProps = {
  rows: Row[];
  faviconBitmaps: Record<string, FaviconBitmapResult>;
  onOpenUrl: (url: string) => void;
};

// Row component for the virtualized list
function RowComponent({
  index,
  style,
  rows,
  faviconBitmaps,
  onOpenUrl,
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
  const [copyTooltipText, setCopyTooltipText] = useState('Copy link');

  if (row.type === 'date-header') {
    return (
      <div style={style} className="flex items-end pt-6 pb-3">
        <h2 className="font-medium text-foreground text-lg">{row.date}</h2>
      </div>
    );
  }

  const handleCopyUrl = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(row.url);
    setCopyTooltipText('Copied!');
    setTimeout(() => setCopyTooltipText('Copy link'), 1500);
  };

  return (
    <div style={style}>
      <div
        className="group flex h-full cursor-pointer select-none items-center gap-4 rounded-lg px-4 hover:bg-muted/50"
        onClick={() => onOpenUrl(row.url)}
      >
        <span className="min-w-[60px] text-muted-foreground text-sm">
          {row.time}
        </span>
        <Favicon faviconUrl={row.faviconUrl} bitmaps={faviconBitmaps} />
        <div className="flex-1 truncate">
          <div className="truncate text-foreground text-sm">{row.title}</div>
          <div className="truncate text-muted-foreground text-xs">
            {getUrlDomain(row.url)}
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100"
              onClick={handleCopyUrl}
            >
              <LinkIcon className="size-4 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copyTooltipText}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function Page() {
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [history, setHistory] = useState<HistoryResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [faviconBitmaps, setFaviconBitmaps] = useState<
    Record<string, FaviconBitmapResult>
  >({});

  const getHistory = useKartonProcedure((s) => s.getHistory);
  const getFaviconBitmaps = useKartonProcedure((s) => s.getFaviconBitmaps);
  const openTab = useKartonProcedure((s) => s.openTab);
  const getHistoryRef = useRef(getHistory);
  const getFaviconBitmapsRef = useRef(getFaviconBitmaps);
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
    getHistoryRef.current = getHistory;
  }, [getHistory]);

  useEffect(() => {
    getFaviconBitmapsRef.current = getFaviconBitmaps;
  }, [getFaviconBitmaps]);

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

  // Fetch favicon bitmaps for a batch of history results
  const fetchFavicons = useCallback(async (historyResults: HistoryResult[]) => {
    const faviconUrls = historyResults
      .map((r) => r.faviconUrl)
      .filter((url): url is string => url !== null);

    const uniqueUrls = Array.from(new Set(faviconUrls));
    if (uniqueUrls.length === 0) return;

    try {
      const bitmaps = await getFaviconBitmapsRef.current(uniqueUrls);
      setFaviconBitmaps((prev) => ({ ...prev, ...bitmaps }));
    } catch (err) {
      console.debug('Failed to fetch favicons:', err);
    }
  }, []);

  // Load initial history when search changes
  useEffect(() => {
    let cancelled = false;

    async function fetchInitialHistory() {
      setIsLoading(true);
      setError(null);
      setHistory([]);
      setHasMore(true);

      // Reset list scroll position
      if (listRef.current) {
        listRef.current.scrollToRow({ index: 0 });
      }

      try {
        const filter: HistoryFilter = {
          text: debouncedSearchText.trim() || undefined,
          limit: PAGE_SIZE,
          offset: 0,
        };

        const results = await getHistoryRef.current(filter);

        if (!cancelled) {
          setHistory(results);
          setHasMore(results.length === PAGE_SIZE);
          setIsLoading(false);
          fetchFavicons(results);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err : new Error('Failed to load history'),
          );
          setIsLoading(false);
        }
      }
    }

    fetchInitialHistory();

    return () => {
      cancelled = true;
    };
    // Note: fetchFavicons is stable (useCallback with []) and listRef is a ref,
    // so they don't need to be in the dependency array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchText]);

  // Load more history (for infinite scroll)
  const loadMoreHistory = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);

    try {
      const filter: HistoryFilter = {
        text: debouncedSearchText.trim() || undefined,
        limit: PAGE_SIZE,
        offset: history.length,
      };

      const results = await getHistoryRef.current(filter);

      setHistory((prev) => [...prev, ...results]);
      setHasMore(results.length === PAGE_SIZE);
      fetchFavicons(results);
    } catch (err) {
      console.error('Failed to load more history:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    isLoadingMore,
    hasMore,
    debouncedSearchText,
    history.length,
    fetchFavicons,
  ]);

  // Convert history to flat rows
  const rows = useMemo(() => historyToRows(history), [history]);

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
        loadMoreHistory();
      }
    },
    [hasMore, isLoadingMore, isLoading, rows.length, loadMoreHistory],
  );

  // Error cause message extraction
  const errorCauseMessage = useMemo((): string | null => {
    if (!error || !('cause' in error) || !error.cause) return null;
    return error.cause instanceof Error
      ? error.cause.message
      : String(error.cause);
  }, [error]);

  // Handle opening URL in new tab
  const handleOpenUrl = useCallback(
    (url: string) => {
      openTab(url, true);
    },
    [openTab],
  );

  // Row props for the list
  const rowProps = useMemo(
    () => ({
      rows,
      faviconBitmaps,
      onOpenUrl: handleOpenUrl,
    }),
    [rows, faviconBitmaps, handleOpenUrl],
  );

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex items-center border-zinc-500/50 border-b px-6 py-4">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-24">
          <h1 className="font-semibold text-foreground text-xl">History</h1>
          <div className="relative flex-1 rounded-full bg-zinc-500/5 focus-within:bg-zinc-500/10">
            <IconMagnifierFill18 className="-translate-y-1/2 absolute top-1/2 left-3.5 z-10 size-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search history"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full rounded-full pl-10 before:hidden"
              inputClassName="rounded-full pl-4 focus:outline-none focus:ring-0 bg-transparent"
            />
          </div>
        </div>
      </div>

      {/* History entries */}
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
                onClick={async () => {
                  setError(null);
                  setIsLoading(true);

                  try {
                    const filter: HistoryFilter = {
                      text: debouncedSearchText.trim() || undefined,
                      limit: PAGE_SIZE,
                      offset: 0,
                    };
                    const results = await getHistoryRef.current(filter);
                    setHistory(results);
                    setHasMore(results.length === PAGE_SIZE);
                    setIsLoading(false);
                    fetchFavicons(results);
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err
                        : new Error('Failed to load history'),
                    );
                    setIsLoading(false);
                  }
                }}
              >
                Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-muted-foreground text-sm">
                {searchText
                  ? 'No history found matching your search'
                  : 'No history yet'}
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
