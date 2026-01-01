import { Fragment, useState, useMemo, useCallback } from 'react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { Button } from '@stagewise/stage-ui/components/button';
import { IconCloudDownloadFill18 } from 'nucleo-ui-fill-18';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from '@stagewise/stage-ui/components/popover';
import { useKartonState, useKartonProcedure } from '@/hooks/use-karton';
import { DownloadState } from '@shared/karton-contracts/pages-api/types';
import type {
  DownloadSummary,
  DownloadSpeedDataPoint,
} from '@shared/karton-contracts/ui';
import { IconArrowRight } from 'nucleo-micro-bold';
import {
  PlayIcon,
  PauseIcon,
  XIcon,
  FolderOpenIcon,
  TrashIcon,
  DownloadIcon,
} from 'lucide-react';
import { useHotKeyListener } from '@/hooks/use-hotkey-listener';
import { HotkeyActions } from '@shared/hotkeys';
import { AreaChart, Area, ResponsiveContainer, XAxis } from 'recharts';

function getDownloadStateLabel(state: DownloadState): string {
  switch (state) {
    case DownloadState.IN_PROGRESS:
      return 'In Progress';
    case DownloadState.COMPLETE:
      return 'Complete';
    case DownloadState.CANCELLED:
      return 'Cancelled';
    case DownloadState.INTERRUPTED:
      return 'Failed';
    default:
      return 'Unknown';
  }
}

function formatSpeed(speedKBps: number): string {
  if (speedKBps >= 1024) {
    return `${(speedKBps / 1024).toFixed(1)} MB/s`;
  }
  return `${Math.round(speedKBps)} KB/s`;
}

function SpeedGraph({
  speedHistory,
}: {
  speedHistory: DownloadSpeedDataPoint[];
}) {
  const chartData = useMemo(() => {
    if (speedHistory.length === 0) return [];
    return speedHistory.map((point) => ({
      timestamp: point.timestamp,
      speed: point.speedKBps,
    }));
  }, [speedHistory]);

  if (chartData.length < 2) return null;

  return (
    <div className="pointer-events-none absolute inset-0 opacity-15">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient
              id="speedGradientPopover"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="var(--color-primary)"
                stopOpacity={0.8}
              />
              <stop
                offset="195%"
                stopColor="var(--color-primary)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <XAxis dataKey="timestamp" hide />
          <Area
            type="monotone"
            dataKey="speed"
            stroke="var(--color-primary)"
            strokeWidth={1.5}
            fill="url(#speedGradientPopover)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function DownloadItemRow({
  download,
  onPause,
  onResume,
  onCancel,
  onOpenFile,
  onShowInFolder,
  onDelete,
}: {
  download: DownloadSummary;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
  onCancel: (id: number) => void;
  onOpenFile: (path: string) => void;
  onShowInFolder: (path: string) => void;
  onDelete: (id: number) => void;
}) {
  const isComplete = download.state === DownloadState.COMPLETE;
  const isPaused = download.isPaused;
  // For finished downloads, check if we can still interact (complete downloads are clickable)
  const isClickable = !download.isActive && isComplete && download.targetPath;

  const handleRowClick = () => {
    if (isClickable) {
      onOpenFile(download.targetPath);
    }
  };

  return (
    <div
      className={`group -mx-1.5 relative flex cursor-pointer select-none flex-col gap-1 overflow-hidden rounded-lg px-1.5 py-1.5 ${
        download.isActive || isComplete ? 'hover:bg-muted/50' : 'opacity-60'
      }`}
      onClick={handleRowClick}
    >
      {/* Speed graph background for active downloads */}
      {download.isActive &&
        download.speedHistory &&
        download.speedHistory.length >= 2 && (
          <SpeedGraph speedHistory={download.speedHistory} />
        )}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <span className="block truncate text-foreground text-sm">
            {download.filename}
          </span>
          <div className="flex items-center gap-1 text-muted-foreground text-xs">
            {download.isActive ? (
              <>
                <span>{download.progress}%</span>
                {isPaused ? (
                  <>
                    <span>•</span>
                    <span>Paused</span>
                  </>
                ) : (
                  download.currentSpeedKBps !== undefined &&
                  download.currentSpeedKBps > 0 && (
                    <>
                      <span>•</span>
                      <span>{formatSpeed(download.currentSpeedKBps)}</span>
                    </>
                  )
                )}
              </>
            ) : (
              <span>{getDownloadStateLabel(download.state)}</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
          {download.isActive ? (
            <>
              {isPaused ? (
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onResume(download.id);
                      }}
                    >
                      <PlayIcon className="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Resume</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPause(download.id);
                      }}
                    >
                      <PauseIcon className="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Pause</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCancel(download.id);
                    }}
                  >
                    <XIcon className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Stop</TooltipContent>
              </Tooltip>
            </>
          ) : (
            <>
              {isComplete && download.targetPath && (
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowInFolder(download.targetPath);
                      }}
                    >
                      <FolderOpenIcon className="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Show in folder</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(download.id);
                    }}
                  >
                    <TrashIcon className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Remove</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      {/* Progress bar for active downloads */}
      {download.isActive && (
        <div className="flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${download.progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function DownloadsControlButton() {
  const downloads = useKartonState((state) => state.downloads);
  const markSeen = useKartonProcedure((p) => p.downloads.markSeen);
  const pauseDownload = useKartonProcedure((p) => p.downloads.pause);
  const resumeDownload = useKartonProcedure((p) => p.downloads.resume);
  const cancelDownload = useKartonProcedure((p) => p.downloads.cancel);
  const openFile = useKartonProcedure((p) => p.downloads.openFile);
  const showInFolder = useKartonProcedure((p) => p.downloads.showInFolder);
  const deleteDownload = useKartonProcedure((p) => p.downloads.delete);

  const [isOpen, setIsOpen] = useState(false);
  const { items, activeCount, hasUnseenDownloads, lastSeenAt } = downloads;

  // CMD/CTRL+J hotkey to show downloads
  const handleShowDownloads = useCallback(() => {
    setIsOpen(true);
    void markSeen();
  }, [markSeen]);

  useHotKeyListener(handleShowDownloads, HotkeyActions.CTRL_J);

  // Memoize unseen finished count calculation
  const unseenFinishedCount = useMemo(() => {
    if (!hasUnseenDownloads) return 0;
    const lastSeenDate = lastSeenAt ? new Date(lastSeenAt) : null;
    return items.filter((d) => {
      if (d.isActive) return false;
      if (!d.endTime) return false;
      if (!lastSeenDate) return true;
      return new Date(d.endTime) > lastSeenDate;
    }).length;
  }, [items, hasUnseenDownloads, lastSeenAt]);

  // Show button if there are active downloads OR unseen finished downloads
  // Also keep button visible while popover is open (don't close abruptly)
  const shouldShowButton = activeCount > 0 || hasUnseenDownloads || isOpen;

  // Memoize lowest progress calculation (only compute when we have active downloads)
  const lowestProgress = useMemo(() => {
    if (activeCount === 0) return 1;
    const activeDownloads = items.filter((d) => d.isActive);
    return activeDownloads.length > 0
      ? Math.min(...activeDownloads.map((d) => d.progress)) / 100
      : 1;
  }, [items, activeCount]);

  // Memoize progress ring style
  const progressRingStyle = useMemo(
    () => ({
      backgroundImage: `conic-gradient(from 0deg, var(--color-blue-500) 0deg, var(--color-blue-500) ${lowestProgress * 360}deg, var(--color-muted) ${lowestProgress * 360}deg)`,
    }),
    [lowestProgress],
  );

  // Don't render button if there's nothing to show (and popover not open)
  if (!shouldShowButton) {
    return null;
  }

  const hasActiveDownloads = activeCount > 0;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Mark downloads as seen when popover opens
      void markSeen();
    }
  };

  const handlePause = (id: number) => void pauseDownload(id);
  const handleResume = (id: number) => void resumeDownload(id);
  const handleCancel = (id: number) => void cancelDownload(id);
  const handleOpenFile = (path: string) => void openFile(path);
  const handleShowInFolder = (path: string) => void showInFolder(path);
  const handleDelete = (id: number) => void deleteDownload(id);

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger>
          <PopoverTrigger>
            <Button variant="ghost" size="icon-sm" onClick={() => {}}>
              {hasActiveDownloads && (
                <div
                  className="mask-alpha mask-[radial-gradient(closest-side,transparent_calc(100%-3px),white_calc(100%-2.5px))] absolute inset-0.5 rounded-full bg-blue-500"
                  style={progressRingStyle}
                />
              )}
              {unseenFinishedCount > 0 && (
                <div className="absolute top-0 right-0 flex size-3 items-center justify-center rounded-full bg-blue-500 font-bold text-2xs text-white">
                  {unseenFinishedCount}
                </div>
              )}
              <IconCloudDownloadFill18 className="size-4.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {hasActiveDownloads
            ? `${activeCount} download${activeCount > 1 ? 's' : ''} in progress`
            : hasUnseenDownloads
              ? 'New downloads available'
              : 'Recent downloads'}
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-84 rounded-xl p-3">
        <div className="flex flex-row items-start justify-between">
          <PopoverTitle>
            {hasActiveDownloads ? 'Downloads' : 'Recent Downloads'}
          </PopoverTitle>
          <a
            href="stagewise://internal/downloads"
            target="_blank"
            className="flex flex-row items-center gap-0.5 p-0.5 font-medium text-primary text-sm hover:opacity-80"
            onClick={() => setIsOpen(false)}
          >
            Show all <IconArrowRight className="size-3" />
          </a>
        </div>
        <div className="-mx-1 mt-2 max-h-60 overflow-y-auto px-1">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <DownloadIcon className="mb-2 size-8 opacity-40" />
              <span className="text-sm">No downloads</span>
            </div>
          ) : (
            items.map((download, index) => (
              <Fragment key={download.id}>
                <DownloadItemRow
                  download={download}
                  onPause={handlePause}
                  onResume={handleResume}
                  onCancel={handleCancel}
                  onOpenFile={handleOpenFile}
                  onShowInFolder={handleShowInFolder}
                  onDelete={handleDelete}
                />
                {index < items.length - 1 && (
                  <hr className="w-full border-border/30 border-b" />
                )}
              </Fragment>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
