import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import {
  useKartonProcedure,
  useKartonConnected,
} from '@pages/hooks/use-karton';
import type {
  FaviconBitmapResult,
  HistoryResult,
} from '@shared/karton-contracts/pages-api/types';
import { Button } from '@stagewise/stage-ui/components/button';
import { IconEarthFillDuo18 } from 'nucleo-ui-fill-duo-18';
import { IconArrowRightOutline18 } from 'nucleo-ui-outline-18';

const RECENT_HISTORY_FETCH_LIMIT = 50;
const MAX_RECENT_ORIGINS = 6;

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

  return (
    <div className="flex size-full min-h-screen min-w-screen items-center justify-center bg-background px-6">
      {isConnected ? <StartPage /> : <LoadingState />}
    </div>
  );
}

function LoadingState() {
  return <span className="text-muted-foreground text-sm">Loading...</span>;
}

function getPageLabel(page: HistoryResult): string {
  if (page.title?.trim()) return page.title;

  try {
    return new URL(page.url).hostname;
  } catch {
    return page.url;
  }
}

function getPageOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function StartPage() {
  const openTab = useKartonProcedure((p) => p.openTab);
  const getHistory = useKartonProcedure((p) => p.getHistory);
  const getFaviconBitmaps = useKartonProcedure((p) => p.getFaviconBitmaps);
  const [recentPages, setRecentPages] = useState<HistoryResult[]>([]);
  const [favicons, setFavicons] = useState<Record<string, FaviconBitmapResult>>(
    {},
  );

  const getHistoryRef = useRef(getHistory);
  getHistoryRef.current = getHistory;

  const getFaviconBitmapsRef = useRef(getFaviconBitmaps);
  getFaviconBitmapsRef.current = getFaviconBitmaps;

  useEffect(() => {
    let cancelled = false;

    const loadRecentPages = async () => {
      const pages = await getHistoryRef.current({
        limit: RECENT_HISTORY_FETCH_LIMIT,
      });
      if (cancelled) return;

      const uniquePages = Array.from(
        new Map(pages.map((page) => [getPageOrigin(page.url), page])).values(),
      ).slice(0, MAX_RECENT_ORIGINS);

      setRecentPages(uniquePages);

      const faviconUrls = Array.from(
        new Set(
          uniquePages
            .map((page) => page.faviconUrl)
            .filter((url): url is string => url !== null),
        ),
      );

      if (faviconUrls.length === 0) {
        setFavicons({});
        return;
      }

      const bitmaps = await getFaviconBitmapsRef.current(faviconUrls);
      if (!cancelled) {
        setFavicons(bitmaps);
      }
    };

    void loadRecentPages();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadRecentPages();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const handleOpen = (url: string, inNewTab = false) => {
    if (inNewTab) {
      openTab(url, false);
      return;
    }

    window.location.href = url;
  };

  const hasRecentPages = recentPages.length > 0;

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      {!hasRecentPages && (
        <p className="text-center text-sm text-subtle-foreground">
          Enter a URL or a search term in the Omnibox to get started
        </p>
      )}

      {hasRecentPages && (
        <div className="flex w-full max-w-80 flex-col gap-1.5">
          <p className="px-2 text-subtle-foreground text-xs">
            Recently visited
          </p>
          <div className="flex w-full flex-col">
            {recentPages.map((page) => {
              const favicon = page.faviconUrl
                ? (favicons[page.faviconUrl] ?? null)
                : null;

              return (
                <div
                  key={getPageOrigin(page.url)}
                  className="w-full border-derived-subtle border-t first:border-t-0"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={(event) =>
                      handleOpen(page.url, event.metaKey || event.ctrlKey)
                    }
                    className="h-auto w-full bg-background not-disabled:hover:bg-hover-derived"
                    title={page.url}
                  >
                    <span className="flex w-full items-center gap-3">
                      <span className="flex size-4 shrink-0 items-center justify-center">
                        {favicon?.imageData ? (
                          <img
                            src={`data:image/png;base64,${favicon.imageData}`}
                            alt=""
                            className="size-4 rounded-sm"
                          />
                        ) : (
                          <IconEarthFillDuo18 className="size-4 text-subtle-foreground/70" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-foreground text-sm">
                          {getPageLabel(page)}
                        </span>
                        <span className="block truncate text-subtle-foreground text-xs">
                          {page.url}
                        </span>
                      </span>
                      <IconArrowRightOutline18 className="size-4 shrink-0 text-subtle-foreground/70" />
                    </span>
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
