import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2Icon } from 'lucide-react';
import type {
  InspirationWebsite,
  RecentlyOpenedWorkspace,
} from '@shared/karton-contracts/ui';
import { LogoWithText } from '@/components/ui/logo-with-text';
import { cn } from '@/utils';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import { useIsContainerScrollable } from '@/hooks/use-is-container-scrollable';
import { IconDocFolder, IconCircleQuestion } from 'nucleo-glass';
import { IconPlusFill18, IconChevronDownFill18 } from 'nucleo-ui-fill-18';
import { Button } from '@stagewise/stage-ui/components/button';
import { Skeleton } from '@stagewise/stage-ui/components/skeleton';
import { TextSlideshow } from '@/components/ui/text-slideshow';

import TimeAgo from 'react-timeago';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';

export function StartPage() {
  const workspaceStatus = useKartonState((s) => s.workspaceStatus);
  return (
    <div
      className="flex size-full flex-col items-center justify-center overflow-hidden bg-background"
      id="start-page-container"
    >
      {workspaceStatus === 'open' ? (
        <StartPageWithConnectedWorkspace />
      ) : (
        <StartPageWithoutConnectedWorkspace />
      )}
    </div>
  );
}

const StartPageWithConnectedWorkspace = () => {
  const inspirationWebsites = useKartonState(
    (s) => s.userExperience.inspirationWebsites,
  );
  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const goto = useKartonProcedure((p) => p.browser.goto);
  const createTab = useKartonProcedure((p) => p.browser.createTab);
  const loadMoreWebsites = useKartonProcedure(
    (p) => p.userExperience.inspiration.loadMore,
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { canScrollLeft, canScrollRight } =
    useIsContainerScrollable(scrollContainerRef);
  const [leftFadeDistance, setLeftFadeDistance] = useState(0);
  const [rightFadeDistance, setRightFadeDistance] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

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
      const isNearEnd = scrollLeft + clientWidth >= scrollWidth - 200;

      if (isNearEnd && !isLoadingMore && hasMoreWebsites) {
        setIsLoadingMore(true);
        loadMoreWebsites().finally(() => {
          setIsLoadingMore(false);
        });
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

      if (isModifierPressed) {
        // Open in new background tab
        createTab(url, false);
      } else {
        // Navigate current tab
        if (!activeTabId) return;
        goto(url, activeTabId);
      }
    },
    [activeTabId, goto, createTab],
  );
  return (
    <div className="flex w-full max-w-6xl flex-col items-start gap-4 px-20">
      <div className="flex items-center gap-2">
        <LogoWithText className="h-10 text-foreground" />
        <div className="glass-body ml-1 @[350px]:inline-flex hidden h-fit shrink-0 items-center rounded-full px-2 py-0.5 font-medium text-primary text-xs">
          Alpha
        </div>
      </div>
      <div className="group/design-inspiration mt-2 flex w-full flex-col items-center justify-start gap-4">
        <div className="flex w-full items-center justify-between">
          <h1 className="font-medium text-xl">
            <TextSlideshow
              texts={[
                'Grab components from',
                'Grab styles from',
                'Grab colors from',
                'Grab themes from',
                'Grab fonts from',
              ]}
            />
          </h1>
        </div>
        <div
          ref={scrollContainerRef}
          className="mask-alpha scrollbar-none -my-8 flex w-[calc(100%+4rem)] justify-start gap-4 overflow-x-auto px-8 py-8"
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
    </div>
  );
};

const StartPageWithoutConnectedWorkspace = () => {
  const [showAllWorkspaces, setShowAllWorkspaces] = useState(false);
  const recentlyOpenedWorkspaces = useKartonState(
    (s) => s.userExperience.recentlyOpenedWorkspaces,
  );

  const workspaceStatus = useKartonState((s) => s.workspaceStatus);

  const isSettingUpWorkspace = useMemo(() => {
    return workspaceStatus === 'setup';
  }, [workspaceStatus]);

  const sortedWorkspaces = useMemo(() => {
    return [...recentlyOpenedWorkspaces].sort(
      (a, b) => b.openedAt - a.openedAt,
    );
  }, [recentlyOpenedWorkspaces]);

  const openWorkspace = useKartonProcedure((s) => s.workspace.open);

  const selectAndOpenWorkspace = useCallback(async () => {
    await openWorkspace(undefined);
  }, [openWorkspace]);

  const topRecentlyOpenedWorkspaces = useMemo(() => {
    return sortedWorkspaces.slice(0, 3);
  }, [sortedWorkspaces]);

  return (
    <div className="flex w-full max-w-2xl flex-col items-start gap-4">
      <div className="flex items-center gap-2">
        <LogoWithText className="h-10 text-foreground" />
        <div className="glass-body ml-1 @[350px]:inline-flex hidden h-fit shrink-0 items-center rounded-full px-2 py-0.5 font-medium text-primary text-xs">
          Alpha
        </div>
      </div>
      <div
        className={cn(
          'group/start-page-workspaces mt-4 flex w-full flex-col items-center justify-start gap-2',
          isSettingUpWorkspace && 'pointer-events-none opacity-20',
        )}
      >
        <div className="flex w-full items-center justify-start">
          <h1 className="flex items-center justify-center gap-2 font-medium text-foreground text-xl">
            Connect a workspace{' '}
            <Tooltip>
              <TooltipTrigger>
                <IconCircleQuestion className="size-4 self-start text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <span>
                  Connecting to a workspace will allow the agent to access and
                  modify files and folders in the workspace.
                </span>
              </TooltipContent>
            </Tooltip>
          </h1>
          {isSettingUpWorkspace && (
            <Loader2Icon className="ml-auto size-4 animate-spin text-foreground opacity-100!" />
          )}
          <div
            className={cn(
              'ml-auto hidden cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground',
              topRecentlyOpenedWorkspaces.length > 3 &&
                'group-hover/start-page-workspaces:flex',
            )}
            onClick={() => setShowAllWorkspaces(!showAllWorkspaces)}
          >
            <span className="font-medium text-xs">
              Show all ({sortedWorkspaces.length})
            </span>
            <IconChevronDownFill18
              className={`-rotate-90 size-3 ${showAllWorkspaces ? 'rotate-0' : ''}`}
            />
          </div>
        </div>
        <div className="scrollbar-subtle flex max-h-70 w-full flex-col items-center justify-start gap-2 overflow-y-auto">
          {(showAllWorkspaces
            ? sortedWorkspaces
            : topRecentlyOpenedWorkspaces
          ).map((workspace) => (
            <RecentlyOpenedWorkspaceItem
              onClick={() => {
                openWorkspace(workspace.path);
              }}
              key={workspace.path}
              workspace={workspace}
            />
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto rounded-lg p-2"
          onClick={selectAndOpenWorkspace}
        >
          <IconPlusFill18 className="size-4 text-foreground" />
          Connect new workspace
        </Button>
      </div>
    </div>
  );
};

const RecentlyOpenedWorkspaceItem = ({
  workspace,
  onClick,
}: {
  workspace: RecentlyOpenedWorkspace;
  onClick?: () => void;
}) => {
  return (
    <div
      className="flex w-full shrink-0 cursor-pointer items-center gap-4 rounded-lg p-2 hover:bg-muted-foreground/5"
      onClick={onClick}
    >
      <IconDocFolder className="size-8 text-muted-foreground" />
      <div className="flex w-full flex-col items-center justify-center gap-1 ">
        <div className="flex w-full justify-between rounded-b-lg text-foreground text-sm">
          <span className="font-medium">{workspace.name}</span>
        </div>
        <div className="flex w-full items-center justify-between rounded-b-lg font-normal text-foreground text-sm">
          <span className="self-start font-normal text-muted-foreground/70 text-xs">
            {workspace.path}
          </span>
          <span className="font-normal text-muted-foreground/70 text-xs">
            <TimeAgo date={workspace.openedAt} live={false} />
          </span>
        </div>
      </div>
    </div>
  );
};

const DesignInspirationSkeletonCard = () => {
  return (
    <div className="flex w-64 shrink-0 flex-col items-center overflow-hidden rounded-lg border border-border bg-card shadow-[0_0_6px_0_rgba(0,0,0,0.08),0_-6px_48px_-24px_rgba(0,0,0,0.15)]">
      <Skeleton className="h-40 w-full rounded-none" />
      <div className="flex w-full items-center justify-between gap-2 p-2">
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
};

const DesignInspirationCard = ({
  website,
  onClick,
}: {
  website: InspirationWebsite['websites'][number];
  onClick: (event: React.MouseEvent) => void;
}) => {
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
        videoRef.current
          .play()
          .then(() => {
            setIsVideoPlaying(true);
          })
          .catch(() => {
            // Video failed to play, keep showing image
            setIsVideoPlaying(false);
          });
      } else {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
        setIsVideoPlaying(false);
      }
    }
  }, [isHovered]);

  return (
    <div
      onClick={(e) => onClick(e)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="flex w-64 shrink-0 cursor-pointer flex-col items-center overflow-hidden rounded-lg border border-border bg-card shadow-[0_0_6px_0_rgba(0,0,0,0.08),0_-6px_48px_-24px_rgba(0,0,0,0.15)] transition-shadow duration-300 hover:shadow-[0_0_12px_0_rgba(0,0,0,0.12),0_-8px_56px_-24px_rgba(0,0,0,0.2)]"
    >
      <div className="relative h-40 w-full">
        {!isImageLoaded && <Skeleton className="h-40 w-full rounded-none" />}
        <img
          src={website.screenshot_url}
          alt={websiteName}
          onLoad={() => setIsImageLoaded(true)}
          className={cn(
            'absolute inset-0 flex h-full w-full items-center justify-center object-cover transition-opacity duration-200',
            !isImageLoaded && 'opacity-0',
            isImageLoaded && (isVideoPlaying ? 'opacity-0' : 'opacity-100'),
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
              <span className="truncate rounded-md bg-primary/5 px-1.5 py-0.5 font-normal text-primary/70 text-xs">
                {websiteFirstRoute}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
};
