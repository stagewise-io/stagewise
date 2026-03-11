import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useKartonProcedure,
  useKartonState,
  useKartonConnected,
} from '@/hooks/use-karton';
import type {
  MostVisitedOriginEntry,
  OriginThumbnailResult,
} from '@shared/karton-contracts/pages-api/types';
import { Button } from '@stagewise/stage-ui/components/button';
import { Skeleton } from '@stagewise/stage-ui/components/skeleton';
import {
  IconArrowLeftOutline18,
  IconArrowRightOutline18,
  IconChevronDownOutline18,
} from 'nucleo-ui-outline-18';
import { IconEarthFillDuo18 } from 'nucleo-ui-fill-duo-18';
import { cn } from '@/utils';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import { LogoCombo } from '@stagewise/stage-ui/components/logo-combo';

const PAGE_SIZE = 24;
const SKELETON_KEYS = Array.from({ length: 6 }, (_, i) => `skeleton-${i}`);
const LOADING_MORE_KEYS = Array.from({ length: 4 }, (_, i) => `loading-${i}`);

export const Route = createFileRoute('/home')({
  component: HomePage,
  head: () => ({
    meta: [
      {
        title: 'Home',
      },
    ],
  }),
});

function HomePage() {
  const isConnected = useKartonConnected();

  if (!isConnected) {
    return (
      <div className="flex size-full min-h-screen min-w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center">
            <LogoCombo size={32} />
          </div>
          <span className="text-muted-foreground text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex size-full min-h-screen min-w-screen flex-col items-center justify-center overflow-hidden bg-background">
      <StartPage />
    </div>
  );
}

function StartPage() {
  const releaseChannel = useKartonState((s) => s.appInfo.releaseChannel);

  return (
    <div className="flex w-full max-w-7xl flex-col items-start gap-8 px-20">
      <div className="flex items-center">
        <LogoCombo size={32} />
        {releaseChannel === 'dev' && (
          <span className="ml-2 rounded-full border border-derived bg-warning-background px-2 py-px text-sm text-warning-foreground">
            Development Build
          </span>
        )}
        {releaseChannel === 'prerelease' && (
          <span className="ml-2 rounded-full border border-derived px-2 py-px text-primary-foreground text-sm">
            Pre-Release Build
          </span>
        )}
      </div>
      <MostVisitedSection />
    </div>
  );
}

function MostVisitedSection() {
  const openTab = useKartonProcedure((p) => p.openTab);
  const getMostVisitedOrigins = useKartonProcedure(
    (p) => p.getMostVisitedOrigins,
  );
  const getThumbnailsForOrigins = useKartonProcedure(
    (p) => p.getThumbnailsForOrigins,
  );
  const scanLocalPorts = useKartonProcedure((p) => p.scanLocalPorts);
  const localPorts = useKartonState((s) => s.homePage.localPorts);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { maskStyle } = useScrollFadeMask(scrollContainerRef, {
    axis: 'horizontal',
    fadeDistance: 32,
  });
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const [entries, setEntries] = useState<MostVisitedOriginEntry[]>([]);
  const [thumbnails, setThumbnails] = useState<
    Record<string, OriginThumbnailResult>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Synchronous refs for infinite scroll guards (React state is async/stale in scroll handlers)
  const offsetRef = useRef(0);
  const isLoadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);

  // Local ports as a Set for quick lookup
  const localPortOrigins = useMemo(() => {
    return new Set(
      localPorts.map((entry) => {
        try {
          return new URL(entry.url).origin;
        } catch {
          return entry.url;
        }
      }),
    );
  }, [localPorts]);

  // Karton procedure refs are unstable, so we store them in a ref
  // to avoid re-triggering effects on every render.
  const getMostVisitedOriginsRef = useRef(getMostVisitedOrigins);
  getMostVisitedOriginsRef.current = getMostVisitedOrigins;
  const getThumbnailsForOriginsRef = useRef(getThumbnailsForOrigins);
  getThumbnailsForOriginsRef.current = getThumbnailsForOrigins;
  const scanLocalPortsRef = useRef(scanLocalPorts);
  scanLocalPortsRef.current = scanLocalPorts;

  // Fetch initial batch
  const fetchData = useCallback(async () => {
    try {
      const result = await getMostVisitedOriginsRef.current({
        offset: 0,
        limit: PAGE_SIZE,
      });
      setEntries(result);
      offsetRef.current = result.length;
      hasMoreRef.current = result.length >= PAGE_SIZE;

      if (result.length > 0) {
        const origins = result.map((e) => e.origin);
        const thumbs = await getThumbnailsForOriginsRef.current(origins);
        setThumbnails(thumbs);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load more entries (infinite scroll)
  // Uses synchronous refs for the guard and offset so concurrent scroll
  // events can't slip through with the same stale values.
  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const result = await getMostVisitedOriginsRef.current({
        offset: offsetRef.current,
        limit: PAGE_SIZE,
      });
      if (result.length === 0) {
        hasMoreRef.current = false;
        return;
      }
      offsetRef.current += result.length;
      hasMoreRef.current = result.length >= PAGE_SIZE;
      setEntries((prev) => [...prev, ...result]);

      const origins = result.map((e) => e.origin);
      const thumbs = await getThumbnailsForOriginsRef.current(origins);
      setThumbnails((prev) => ({ ...prev, ...thumbs }));
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, []);

  // Ref to keep loadMore stable for the scroll handler
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh local port status on visibility change.
  // Most-visited data is historical and doesn't need a full refetch.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void scanLocalPortsRef.current();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // Update scroll button visibility
  const updateScrollButtons = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollLeft, scrollWidth, clientWidth } = container;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      updateScrollButtons();

      // Infinite scroll: load more when near the right edge
      const { scrollLeft, scrollWidth, clientWidth } = container;
      if (scrollLeft + clientWidth >= scrollWidth - 400) {
        loadMoreRef.current();
      }
    };

    container.addEventListener('scroll', handleScroll);
    updateScrollButtons();

    // Translate vertical-only wheel events (mouse wheel) into horizontal scroll.
    // When deltaX is non-zero the user is already scrolling horizontally
    // (trackpad two-finger swipe), so we let the browser handle it natively.
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaX !== 0 || e.deltaY === 0) return;
      e.preventDefault();
      container.scrollLeft += e.deltaY;
    };
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('wheel', handleWheel);
    };
  }, [updateScrollButtons]);

  // Scroll by 2 items (card width 256px + gap 16px = 272px per item)
  const scrollByItems = useCallback((direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const itemWidth = 272;
    const scrollAmount = itemWidth * 2;
    container.scrollBy({
      left: direction === 'right' ? scrollAmount : -scrollAmount,
      behavior: 'smooth',
    });
  }, []);

  const handleClick = useCallback(
    (url: string, event?: React.MouseEvent) => {
      const isModifierPressed = event?.metaKey || event?.ctrlKey;
      if (!isModifierPressed) window.location.href = url;
      else openTab(url, false);
    },
    [openTab],
  );

  const hasCards = entries.length > 0;

  return (
    <div className="group/most-visited mt-2 flex w-full flex-col items-center justify-start gap-4">
      <div className="relative z-10 flex w-full items-center justify-between">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex cursor-pointer items-center gap-2"
        >
          <h1 className="font-medium text-foreground text-xl">
            Pick up where you left off
          </h1>
          <IconChevronDownOutline18
            className={cn(
              'size-4 text-muted-foreground transition-transform duration-200',
              collapsed && '-rotate-90',
            )}
          />
        </button>
        {!collapsed && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => scrollByItems('left')}
              aria-label="Scroll left"
              className={cn(!canScrollLeft && 'invisible')}
            >
              <IconArrowLeftOutline18 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => scrollByItems('right')}
              aria-label="Scroll right"
              className={cn(!canScrollRight && 'invisible')}
            >
              <IconArrowRightOutline18 className="size-4" />
            </Button>
          </div>
        )}
      </div>
      {!collapsed &&
        (isLoading ? (
          <div
            ref={scrollContainerRef}
            className="mask-alpha scrollbar-none -my-12 flex w-[calc(100%+4rem)] gap-4 overflow-x-auto px-8 py-12"
            style={maskStyle}
          >
            {SKELETON_KEYS.map((key) => (
              <MostVisitedSkeletonCard key={key} />
            ))}
          </div>
        ) : hasCards ? (
          <div
            ref={scrollContainerRef}
            className="mask-alpha scrollbar-none -my-12 flex w-[calc(100%+4rem)] gap-4 overflow-x-auto px-8 py-12"
            style={maskStyle}
          >
            {entries.map((entry) => (
              <MostVisitedCard
                key={entry.origin}
                entry={entry}
                thumbnail={thumbnails[entry.origin] ?? null}
                localPortOrigins={localPortOrigins}
                onClick={(event) =>
                  handleClick(entry.lastUrl ?? entry.origin, event)
                }
              />
            ))}
            {isLoadingMore &&
              LOADING_MORE_KEYS.map((key) => (
                <MostVisitedSkeletonCard key={key} />
              ))}
          </div>
        ) : (
          <div className="flex w-full items-center justify-center rounded-lg border border-derived-strong bg-background p-8 text-muted-foreground text-sm dark:bg-surface-1">
            Your most visited pages will appear here as you browse.
          </div>
        ))}
    </div>
  );
}

function MostVisitedSkeletonCard() {
  return (
    <div className="flex w-64 shrink-0 flex-col items-center overflow-hidden rounded-lg border border-derived-strong bg-background shadow-[0_0_6px_0_rgba(0,0,0,0.08),0_-6px_48px_-24px_rgba(0,0,0,0.15)] dark:bg-surface-1">
      <Skeleton className="h-40 w-full rounded-none border-none" />
      <div className="flex w-full items-center justify-between gap-2 p-2 dark:border-derived-strong dark:border-t">
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}

function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

function MostVisitedCard({
  entry,
  thumbnail,
  localPortOrigins,
  onClick,
}: {
  entry: MostVisitedOriginEntry;
  thumbnail: OriginThumbnailResult | null;
  localPortOrigins: Set<string>;
  onClick: (event: React.MouseEvent) => void;
}) {
  const hostname = useMemo(() => {
    try {
      return new URL(entry.origin).host;
    } catch {
      return entry.origin;
    }
  }, [entry.origin]);

  const isLocal = isLocalOrigin(entry.origin);
  const isRunning = isLocal && localPortOrigins.has(entry.origin);
  const isOffline = isLocal && !isRunning;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent);
        }
      }}
      className={`flex w-64 shrink-0 cursor-pointer flex-col items-center overflow-hidden rounded-lg border border-derived-strong bg-background text-foreground shadow-elevation-1 transition-shadow duration-300 hover:bg-hover-derived hover:text-hover-derived focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-solid dark:bg-surface-1${isOffline ? ' opacity-50' : ''}`}
    >
      <div className="relative h-40 w-full">
        {thumbnail ? (
          <img
            src={`data:image/jpeg;base64,${thumbnail.imageData}`}
            alt={hostname}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-base-200 to-base-300 dark:from-base-700 dark:to-base-800">
            <IconEarthFillDuo18 className="size-6 text-muted-foreground/50" />
          </div>
        )}
      </div>
      <div className="flex w-full items-center justify-between gap-2 p-2 dark:border-derived-strong dark:border-t">
        <span className="truncate font-normal text-foreground text-sm">
          {hostname}
        </span>
        {isRunning && (
          <div className="flex shrink-0 items-center gap-1 text-success-foreground text-xs">
            <div className="size-1.5 rounded-full bg-success-foreground" />
            Running
          </div>
        )}
        {isOffline && (
          <div className="flex shrink-0 items-center gap-1 text-muted text-xs">
            <div className="size-1.5 rounded-full bg-muted" />
            Offline
          </div>
        )}
      </div>
    </div>
  );
}
