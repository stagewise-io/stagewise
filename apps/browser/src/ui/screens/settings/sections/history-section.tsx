import { Button } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { IconGlobe2Fill18 } from 'nucleo-ui-fill-18';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2Icon, LinkIcon } from 'lucide-react';
import { IconChevronRightOutline18 } from 'nucleo-ui-outline-18';
import { useKartonProcedure } from '@ui/hooks/use-karton';
import type {
  HistoryFilter,
  HistoryResult,
  FaviconBitmapResult,
} from '@shared/karton-contracts/pages-api/types';
import { List } from 'react-window';

// =============================================================================
// Constants
// =============================================================================

const PAGE_SIZE = 50;
const PAGE_HEADER_HEIGHT = 64;
const DATE_HEADER_HEIGHT = 64;
const ENTRY_ROW_HEIGHT = 56;
const ORIGIN_GROUP_HEADER_HEIGHT = 48;

// =============================================================================
// Row Types
// =============================================================================

type DateHeaderRow = {
  type: 'date-header';
  date: string;
};

type OriginGroupHeaderRow = {
  type: 'origin-group-header';
  groupId: string;
  origin: string;
  faviconUrl: string | null;
  entryCount: number;
};

type EntryRow = {
  type: 'entry';
  id: number;
  time: string;
  title: string;
  url: string;
  faviconUrl: string | null;
  groupId: string | null;
};

type Row = DateHeaderRow | OriginGroupHeaderRow | EntryRow;

// =============================================================================
// Helpers
// =============================================================================

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

function getUrlOrigin(url: string): string {
  try {
    if (url.startsWith('file://')) return 'file://';
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function getUrlDisplayPath(url: string): string {
  try {
    if (url.startsWith('file://')) return url;
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  } catch {
    return url;
  }
}

function historyToRows(history: HistoryResult[]): Row[] {
  const rows: Row[] = [];
  let currentDate: string | null = null;

  const dateGroups: { date: string; entries: HistoryResult[] }[] = [];
  for (const entry of history) {
    const dateKey = formatDate(entry.visitTime);
    if (dateKey !== currentDate) {
      currentDate = dateKey;
      dateGroups.push({ date: dateKey, entries: [] });
    }
    dateGroups[dateGroups.length - 1]!.entries.push(entry);
  }

  for (const dateGroup of dateGroups) {
    rows.push({ type: 'date-header', date: dateGroup.date });

    let i = 0;
    while (i < dateGroup.entries.length) {
      const origin = getUrlOrigin(dateGroup.entries[i]!.url);
      let j = i + 1;
      while (
        j < dateGroup.entries.length &&
        getUrlOrigin(dateGroup.entries[j]!.url) === origin
      ) {
        j++;
      }
      const runLength = j - i;

      if (runLength >= 2) {
        const groupId = `group-${dateGroup.entries[i]!.visitId}`;
        rows.push({
          type: 'origin-group-header',
          groupId,
          origin,
          faviconUrl: dateGroup.entries[i]!.faviconUrl,
          entryCount: runLength,
        });
        for (let k = i; k < j; k++) {
          const e = dateGroup.entries[k]!;
          rows.push({
            type: 'entry',
            id: e.visitId,
            time: formatTime(e.visitTime),
            title: e.title || 'Untitled',
            url: e.url,
            faviconUrl: e.faviconUrl,
            groupId,
          });
        }
      } else {
        const e = dateGroup.entries[i]!;
        rows.push({
          type: 'entry',
          id: e.visitId,
          time: formatTime(e.visitTime),
          title: e.title || 'Untitled',
          url: e.url,
          faviconUrl: e.faviconUrl,
          groupId: null,
        });
      }

      i = j;
    }
  }

  return rows;
}

function filterCollapsedRows(rows: Row[], collapsedGroups: Set<string>): Row[] {
  if (collapsedGroups.size === 0) return rows;
  return rows.filter((row) => {
    if (
      row.type === 'entry' &&
      row.groupId &&
      collapsedGroups.has(row.groupId)
    ) {
      return false;
    }
    return true;
  });
}

// =============================================================================
// Favicon Component
// =============================================================================

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

// =============================================================================
// Row Component
// =============================================================================

type RowProps = {
  rows: Row[];
  faviconBitmaps: Record<string, FaviconBitmapResult>;
  collapsedGroups: Set<string>;
  searchText: string;
  onSearchTextChange: (value: string) => void;
  onOpenUrl: (url: string) => void;
  onToggleGroup: (groupId: string) => void;
};

function RowComponent({
  index,
  style,
  rows,
  faviconBitmaps,
  collapsedGroups,
  searchText,
  onSearchTextChange,
  onOpenUrl,
  onToggleGroup,
}: {
  index: number;
  style: React.CSSProperties;
  ariaAttributes: {
    'aria-posinset': number;
    'aria-setsize': number;
    role: 'listitem';
  };
} & RowProps) {
  const [copyTooltipText, setCopyTooltipText] = useState('Copy link');

  if (index === 0) {
    return (
      <div style={style} className="flex items-start pb-8">
        <div className="flex w-full items-center gap-24">
          <h1 className="font-semibold text-foreground text-xl">History</h1>
          <Input
            type="text"
            placeholder="Search history"
            value={searchText}
            onValueChange={onSearchTextChange}
          />
        </div>
      </div>
    );
  }

  const row = rows[index - 1]!;

  if (row.type === 'date-header') {
    return (
      <div style={style} className="flex items-end pt-6 pb-3">
        <h2 className="font-medium text-foreground text-lg">{row.date}</h2>
      </div>
    );
  }

  if (row.type === 'origin-group-header') {
    const isCollapsed = collapsedGroups.has(row.groupId);
    return (
      <div style={style} className="flex items-center pt-3">
        <div
          className="flex h-full w-full cursor-pointer select-none items-center gap-4 rounded-lg px-4 hover:bg-hover-derived"
          onClick={() => onToggleGroup(row.groupId)}
        >
          <span className="flex min-w-[60px] items-center justify-end">
            <IconChevronRightOutline18
              className={`size-3.5 text-muted-foreground transition-transform ${
                isCollapsed ? '' : 'rotate-90'
              }`}
            />
          </span>
          <Favicon faviconUrl={row.faviconUrl} bitmaps={faviconBitmaps} />
          <span className="font-medium text-foreground text-sm">
            {row.origin}
          </span>
          <span className="text-muted-foreground text-xs">
            {row.entryCount} {row.entryCount === 1 ? 'page' : 'pages'}
          </span>
        </div>
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
        className="group flex h-full cursor-pointer select-none items-center gap-4 rounded-lg bg-background px-4 hover:bg-hover-derived"
        onClick={() => onOpenUrl(row.url)}
      >
        <span className="min-w-[60px] text-muted-foreground text-sm">
          {row.time}
        </span>
        <Favicon faviconUrl={row.faviconUrl} bitmaps={faviconBitmaps} />
        <div className="flex-1 truncate">
          <div className="truncate text-foreground text-sm">{row.title}</div>
          <div className="truncate text-muted-foreground text-xs">
            {getUrlDisplayPath(row.url)}
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
              <LinkIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copyTooltipText}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function HistorySection() {
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

  const getHistory = useKartonProcedure((p) => p.browser.getHistory);
  const getFaviconBitmaps = useKartonProcedure(
    (p) => p.browser.getFaviconBitmaps,
  );
  const createTab = useKartonProcedure((p) => p.browser.createTab);
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
  }, [debouncedSearchText, fetchFavicons]);

  // Load more history (infinite scroll)
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

  // Collapsed origin groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // Convert history to rows + filter collapsed
  const allRows = useMemo(() => historyToRows(history), [history]);
  const rows = useMemo(
    () => filterCollapsedRows(allRows, collapsedGroups),
    [allRows, collapsedGroups],
  );

  const getRowHeight = useCallback(
    (index: number): number => {
      if (index === 0) return PAGE_HEADER_HEIGHT;
      if (index > rows.length) return ENTRY_ROW_HEIGHT;
      const row = rows[index - 1]!;
      if (row.type === 'date-header') return DATE_HEADER_HEIGHT;
      if (row.type === 'origin-group-header') return ORIGIN_GROUP_HEADER_HEIGHT;
      return ENTRY_ROW_HEIGHT;
    },
    [rows],
  );

  // Trigger load more when near bottom
  const handleRowsRendered = useCallback(
    (
      visibleRows: { startIndex: number; stopIndex: number },
      _allRows: { startIndex: number; stopIndex: number },
    ) => {
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

  // Handle opening URL in new tab
  const handleOpenUrl = useCallback(
    (url: string) => {
      void createTab(url, true);
    },
    [createTab],
  );

  // Row props
  const rowProps = useMemo(
    () => ({
      rows,
      faviconBitmaps,
      collapsedGroups,
      searchText,
      onSearchTextChange: setSearchText,
      onOpenUrl: handleOpenUrl,
      onToggleGroup: toggleGroup,
    }),
    [
      rows,
      faviconBitmaps,
      collapsedGroups,
      searchText,
      handleOpenUrl,
      toggleGroup,
    ],
  );

  return (
    <div className="h-full w-full overflow-hidden px-6 pt-24 pb-24">
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
              <p className="font-medium text-error-foreground text-sm">
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
              rowCount={rows.length + 1}
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
  );
}
