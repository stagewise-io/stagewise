import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useKartonProcedure,
  useKartonState,
  useKartonConnected,
} from '@/hooks/use-karton';
import type {
  InspirationWebsite,
  RecentlyOpenedWorkspace,
} from '@shared/karton-contracts/pages-api/types';
import { Button } from '@stagewise/stage-ui/components/button';
import { Skeleton } from '@stagewise/stage-ui/components/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { IconChevronDown } from 'nucleo-micro-bold';
import { IconDocFolder, IconCircleQuestion } from 'nucleo-glass';
import { IconPlusFill18 } from 'nucleo-ui-fill-18';
import TimeAgo from 'react-timeago';
import { cn } from '@/utils';
import { LogoWithText } from '@ui/components/ui/logo-with-text';

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

// Text slideshow component for the inspiration section
function TextSlideshow({
  texts,
  className,
}: {
  texts: string[];
  className?: string;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % texts.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [texts.length]);

  return <span className={className}>{texts[currentIndex]}</span>;
}

function HomePage() {
  const isConnected = useKartonConnected();
  const hasSeenOnboardingFlow = useKartonState(
    (s) => s.homePage.storedExperienceData.hasSeenOnboardingFlow,
  );

  if (!isConnected) {
    return (
      <div className="flex size-full min-h-screen min-w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <LogoWithText />
          <span className="text-muted-foreground text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex size-full min-h-screen min-w-screen flex-col items-center justify-center overflow-hidden bg-background">
      {!hasSeenOnboardingFlow ? (
        <OnboardingStartPage />
      ) : (
        <StartPageWithConnectedWorkspace />
      )}
    </div>
  );
}

function StartPageWithConnectedWorkspace() {
  const openTab = useKartonProcedure((p) => p.openTab);
  const workspaceStatus = useKartonState((s) => s.homePage.workspaceStatus);
  const getInspirationWebsites = useKartonProcedure(
    (p) => p.getInspirationWebsites,
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [leftFadeDistance, setLeftFadeDistance] = useState(0);
  const [rightFadeDistance, setRightFadeDistance] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Local state for inspiration websites (fetched on demand)
  const [inspirationWebsites, setInspirationWebsites] =
    useState<InspirationWebsite>({
      websites: [],
      total: 0,
      seed: '',
    });

  // Initial fetch of inspiration websites
  useEffect(() => {
    let cancelled = false;
    getInspirationWebsites({ offset: 0, limit: 10 }).then((result) => {
      if (!cancelled) setInspirationWebsites(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load more websites
  const loadMoreWebsites = useCallback(async () => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const result = await getInspirationWebsites({
        offset: inspirationWebsites.websites.length,
        limit: 10,
      });
      setInspirationWebsites((prev) => ({
        websites: [...prev.websites, ...result.websites],
        total: result.total,
        seed: result.seed,
      }));
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    getInspirationWebsites,
    inspirationWebsites.websites.length,
    isLoadingMore,
  ]);

  // Check scroll state
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateScrollState = () => {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
    };

    updateScrollState();
    container.addEventListener('scroll', updateScrollState);
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', updateScrollState);
      resizeObserver.disconnect();
    };
  }, [inspirationWebsites.websites.length]);

  useEffect(() => {
    setLeftFadeDistance(canScrollLeft ? 32 : 0);
    setRightFadeDistance(canScrollRight ? 32 : 0);
  }, [canScrollLeft, canScrollRight]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      const hasMoreWebsites =
        inspirationWebsites.websites.length < inspirationWebsites.total;
      const isNearEnd = scrollLeft + clientWidth >= scrollWidth - 400;

      if (isNearEnd && !isLoadingMore && hasMoreWebsites) {
        loadMoreWebsites();
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [
    inspirationWebsites.websites.length,
    inspirationWebsites.total,
    isLoadingMore,
    loadMoreWebsites,
  ]);

  const inspirationWebsitesWithScreenshot = useMemo(() => {
    return {
      websites: inspirationWebsites.websites.filter(
        (website) => website.screenshot_url !== null,
      ),
      total: inspirationWebsites.total,
      seed: inspirationWebsites.seed,
    };
  }, [inspirationWebsites]);

  const getMaskStyle = (): React.CSSProperties =>
    ({
      '--left-fade': `${leftFadeDistance}px`,
      '--right-fade': `${rightFadeDistance}px`,
    }) as React.CSSProperties;

  const handleWebsiteClick = useCallback(
    (url: string, event?: React.MouseEvent) => {
      // Check if CMD (Mac) or CTRL (Windows/Linux) is pressed
      const isModifierPressed = event?.metaKey || event?.ctrlKey;
      if (!isModifierPressed) window.location.href = url;
      else openTab(url, false);
    },
    [openTab],
  );

  return (
    <div className="flex w-full max-w-7xl flex-col items-start gap-8 px-20">
      <div className="flex items-center gap-2">
        <LogoWithText className="h-10 text-foreground" />
        <div className="ml-1 inline-flex shrink-0 items-center font-normal text-primary-foreground text-xs">
          Alpha
        </div>
      </div>
      {workspaceStatus !== 'open' && <ConnectWorkspaceBanner />}
      {inspirationWebsitesWithScreenshot.websites.length > 0 && (
        <div className="group/design-inspiration mt-2 flex w-full flex-col items-center justify-start gap-4">
          <div className="flex w-full items-center justify-between">
            <h1 className="font-medium text-xl">
              <TextSlideshow
                className="text-foreground"
                texts={[
                  'Grab components from',
                  'Grab styles from',
                  'Understand the layout of',
                  'Grab colors from',
                  'Grab themes from',
                  'Grab fonts from',
                ]}
              />
            </h1>
          </div>
          <div
            ref={scrollContainerRef}
            className="mask-alpha scrollbar-none -my-12 flex w-[calc(100%+4rem)] justify-start gap-4 overflow-x-auto px-8 py-12"
            style={
              {
                ...getMaskStyle(),
                maskImage: `linear-gradient(to right, transparent 0px, black var(--left-fade), black calc(100% - var(--right-fade)), transparent 100%)`,
                WebkitMaskImage: `linear-gradient(to right, transparent 0px, black var(--left-fade), black calc(100% - var(--right-fade)), transparent 100%)`,
              } as React.CSSProperties
            }
          >
            {inspirationWebsitesWithScreenshot.websites.map((website) => (
              <DesignInspirationCard
                key={website.url}
                website={website}
                onClick={(event) => handleWebsiteClick(website.url, event)}
              />
            ))}
            {isLoadingMore &&
              inspirationWebsitesWithScreenshot.websites.length <
                inspirationWebsitesWithScreenshot.total &&
              Array.from({ length: 5 }, (_, index) => (
                <DesignInspirationSkeletonCard
                  key={`skeleton-${inspirationWebsitesWithScreenshot.websites.length}-${index}`}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OnboardingStartPage() {
  const openWorkspace = useKartonProcedure((p) => p.openWorkspace);
  const setHasSeenOnboardingFlow = useKartonProcedure(
    (p) => p.setHasSeenOnboardingFlow,
  );

  const selectAndOpenWorkspace = useCallback(async () => {
    await openWorkspace(undefined);
  }, [openWorkspace]);

  return (
    <div className="flex w-full max-w-2xl flex-col items-start gap-4 px-10">
      <div className="flex items-center gap-2">
        <LogoWithText className="h-10 text-foreground" />
        <div className="ml-1 inline-flex shrink-0 items-center font-normal text-primary-foreground text-xs">
          Alpha
        </div>
      </div>
      <div
        className={cn(
          'group/start-page-workspaces mt-2 flex w-full flex-col items-start justify-start gap-4 rounded-lg border border-derived bg-linear-to-tr from-surface-1/70 to-surface-1/50 p-4 dark:bg-surface-1',
        )}
      >
        <div className="flex justify-between gap-20 ">
          <div className="flex flex-col items-start justify-center gap-1">
            <h1 className="flex items-center justify-center gap-2 font-medium text-foreground text-xl">
              Connect a workspace
            </h1>

            <div className="flex w-full max-w-md flex-col items-start justify-center gap-2 text-muted-foreground text-sm">
              Connecting a workspace will give the stagewise agent access to
              your project.
            </div>
          </div>
          <IconDocFolder className="size-18" />
        </div>
        <div className="flex w-full items-center justify-end gap-4">
          <Button
            variant={'ghost'}
            size="sm"
            className="mt-2 rounded-lg p-2"
            onClick={() => setHasSeenOnboardingFlow(true)}
          >
            Connect later
          </Button>
          <Button
            variant={'primary'}
            size="sm"
            className="mt-2 rounded-lg p-2"
            onClick={async () => {
              setHasSeenOnboardingFlow(true);
              await selectAndOpenWorkspace();
            }}
          >
            <IconPlusFill18 className="size-4" />
            Connect a workspace
          </Button>
        </div>
      </div>
    </div>
  );
}

function RecentlyOpenedWorkspaceItem({
  workspace,
  onClick,
}: {
  workspace: RecentlyOpenedWorkspace;
  onClick?: () => void;
}) {
  return (
    <div
      className="flex w-full shrink-0 cursor-pointer items-center gap-4 rounded-lg bg-background p-2 pt-1 hover:bg-hover-derived dark:bg-surface-1"
      onClick={onClick}
    >
      <IconDocFolder className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex w-full flex-col items-start justify-start gap-0">
        <div className="flex w-full items-baseline justify-start gap-3 text-foreground text-sm">
          <span className="truncate font-normal">{workspace.name}</span>
          <span className="hidden shrink-0 font-normal text-muted-foreground/40 text-xs sm:inline">
            <TimeAgo date={workspace.openedAt} live={false} />
          </span>
        </div>
        <div className="flex w-full items-center justify-between gap-8 rounded-b-lg font-normal text-foreground text-sm">
          <span
            className="min-w-0 self-start truncate font-normal text-muted-foreground/70 text-xs"
            dir="rtl"
          >
            <span dir="ltr">{workspace.path}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function DesignInspirationSkeletonCard() {
  return (
    <div className="flex w-64 shrink-0 flex-col items-center overflow-hidden rounded-lg border border-derived-strong bg-background shadow-[0_0_6px_0_rgba(0,0,0,0.08),0_-6px_48px_-24px_rgba(0,0,0,0.15)] dark:bg-surface-1">
      <Skeleton className="h-40 w-full rounded-none border-none" />
      <div className="flex w-full items-center justify-between gap-2 p-2 dark:border-derived-strong dark:border-t">
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}

function DesignInspirationCard({
  website,
  onClick,
}: {
  website: InspirationWebsite['websites'][number];
  onClick: (event: React.MouseEvent) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const websiteName = useMemo(() => {
    return new URL(website.url).hostname;
  }, [website.url]);

  const websiteFirstRoute: string | null = useMemo(() => {
    return new URL(website.url).pathname.split('/')[1] ?? null;
  }, [website.url]);

  useEffect(() => {
    if (videoRef.current) {
      if (isHovered) {
        videoRef.current.play().catch(() => {
          // Video failed to play, keep showing image
        });
      } else {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
        setIsVideoPlaying(false);
      }
    }
  }, [isHovered]);

  const handleVideoPlaying = useCallback(() => {
    // Double RAF: first RAF queues for next frame, second RAF runs after paint
    // This ensures the video frame is actually rendered before we fade it in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsVideoPlaying(true);
      });
    });
  }, []);

  return (
    <div
      onClick={(e) => onClick(e)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="flex w-64 shrink-0 cursor-pointer flex-col items-center overflow-hidden rounded-lg border border-derived-strong bg-background text-foreground shadow-elevation-1 transition-shadow duration-300 hover:bg-hover-derived hover:text-hover-derived dark:bg-surface-1"
    >
      <div className="relative h-40 w-full">
        {!isImageLoaded && <Skeleton className="h-40 w-full rounded-none" />}
        <img
          src={website.screenshot_url ?? undefined}
          alt={websiteName}
          onLoad={() => setIsImageLoaded(true)}
          className={cn(
            'absolute inset-0 flex h-full w-full items-center justify-center object-cover transition-opacity duration-200',
            isImageLoaded ? 'opacity-100' : 'opacity-0',
          )}
        />
        {website.screen_video_url && (
          <video
            ref={videoRef}
            src={website.screen_video_url}
            loop
            muted
            playsInline
            preload="auto"
            onPlaying={handleVideoPlaying}
            className={cn(
              'absolute inset-0 flex h-full w-full items-center justify-center object-cover transition-opacity duration-200',
              isVideoPlaying ? 'opacity-100' : 'opacity-0',
            )}
          />
        )}
      </div>
      <div className="flex w-full items-baseline justify-between gap-2 p-2">
        {!isImageLoaded ? (
          <Skeleton className="h-4 w-32" />
        ) : (
          <>
            <span className="truncate font-normal text-foreground text-sm">
              {websiteName}
            </span>
            {websiteFirstRoute && (
              <span className="truncate rounded-md bg-primary-solid/10 px-1.5 py-0.5 font-normal text-primary-foreground text-xs dark:bg-primary-200/10 dark:text-primary-400">
                {websiteFirstRoute}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ConnectWorkspaceBanner() {
  const openWorkspace = useKartonProcedure((p) => p.openWorkspace);
  const selectAndOpenWorkspace = useCallback(async () => {
    await openWorkspace(undefined);
  }, [openWorkspace]);
  const recentlyOpenedWorkspaces = useKartonState(
    (s) => s.homePage.storedExperienceData.recentlyOpenedWorkspaces,
  );

  const [showAllRecentlyOpenedWorkspaces, setShowAllRecentlyOpenedWorkspaces] =
    useState(false);

  const sortedRecentlyOpenedWorkspaces = useMemo(() => {
    const allSorted = [...recentlyOpenedWorkspaces].sort(
      (a, b) => b.openedAt - a.openedAt,
    );
    if (showAllRecentlyOpenedWorkspaces) return allSorted;
    else return allSorted.slice(0, 3);
  }, [recentlyOpenedWorkspaces, showAllRecentlyOpenedWorkspaces]);

  if (sortedRecentlyOpenedWorkspaces.length > 0) {
    return (
      <div className="flex w-full flex-col items-start justify-between gap-2">
        <h1 className="flex items-center justify-center gap-2 font-medium text-foreground text-xl">
          Connect a workspace
          <Tooltip>
            <TooltipTrigger>
              <IconCircleQuestion className="size-4 shrink-0 self-start text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
              <span>
                Connecting a workspace will give the stagewise agent access to
                your project.
              </span>
            </TooltipContent>
          </Tooltip>
        </h1>
        <div className="group/recent-workspaces flex w-full flex-col items-start justify-start gap-1 rounded-lg border border-derived-strong bg-background p-3 shadow-[0_0_6px_0_rgba(0,0,0,0.05),0_-6px_48px_-24px_rgba(0,0,0,0.08)] dark:bg-surface-1">
          <div className="flex w-full flex-row items-start justify-between gap-14">
            <div className="flex w-full flex-col items-start gap-2">
              <div className="flex w-full flex-row items-start justify-between gap-1">
                <div className="shrink-0 font-medium text-muted-foreground text-xs">
                  Recent workspaces
                </div>
                {recentlyOpenedWorkspaces.length > 3 && (
                  <Button
                    variant={'ghost'}
                    size="sm"
                    className="hidden h-fit shrink-0 cursor-pointer items-center gap-1 p-0 text-xs group-hover/recent-workspaces:flex"
                    onClick={() =>
                      setShowAllRecentlyOpenedWorkspaces(
                        !showAllRecentlyOpenedWorkspaces,
                      )
                    }
                  >
                    Show all ({recentlyOpenedWorkspaces.length})
                    <IconChevronDown
                      className={cn(
                        'size-3 shrink-0',
                        showAllRecentlyOpenedWorkspaces
                          ? 'rotate-0'
                          : '-rotate-90',
                      )}
                    />
                  </Button>
                )}
              </div>
              <div className="scrollbar-subtle flex max-h-60 w-full flex-col items-start gap-2 overflow-y-auto">
                {sortedRecentlyOpenedWorkspaces.map((workspace) => (
                  <RecentlyOpenedWorkspaceItem
                    key={workspace.path}
                    workspace={workspace}
                    onClick={() => {
                      openWorkspace(workspace.path);
                    }}
                  />
                ))}
              </div>
              <Button
                variant={'ghost'}
                size="sm"
                className="shrink-0 self-end rounded-lg p-2 text-xs"
                onClick={selectAndOpenWorkspace}
              >
                <IconPlusFill18 className="size-4 shrink-0" />
                Connect a new workspace
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full items-center justify-between gap-4 rounded-lg border border-derived bg-linear-to-tr from-surface-1/70 to-surface-1/50 p-4 dark:from-base-750 dark:to-surface-1">
      <div className="flex items-center gap-3">
        <IconDocFolder className="size-6 shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground text-sm">
          Connect a workspace to give the agent access to your project.
        </span>
      </div>
      <Button
        variant={'primary'}
        size="sm"
        className="shrink-0 rounded-lg"
        onClick={selectAndOpenWorkspace}
      >
        <IconPlusFill18 className="size-4" />
        Connect workspace
      </Button>
    </div>
  );
}
