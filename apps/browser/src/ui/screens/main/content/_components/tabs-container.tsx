import { Button } from '@stagewise/stage-ui/components/button';
import { cn } from '@/utils';
import { IconPlus } from 'nucleo-micro-bold';
import { useIsContainerScrollable } from '@/hooks/use-is-container-scrollable';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Tab } from './tab';
import { AgentPreviewBadge } from './agent-preview-badge';
import { useKartonState } from '@/hooks/use-karton';
import { IconBrush2Fill18 } from 'nucleo-ui-fill-18';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';

export function TabsContainer({
  openSidebarChatPanel,
  isSidebarCollapsed,
  onAddTab,
  onCleanAllTabs,
}: {
  openSidebarChatPanel: () => void;
  isSidebarCollapsed: boolean;
  onAddTab: () => void;
  onCleanAllTabs: () => void;
}) {
  const tabs = useKartonState((s) => s.browser.tabs);
  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const platform = useKartonState((s) => s.appInfo.platform);
  const isFullScreen = useKartonState((s) => s.appInfo.isFullScreen);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { canScrollLeft, canScrollRight } =
    useIsContainerScrollable(scrollContainerRef);
  const [leftFadeDistance, setLeftFadeDistance] = useState(0);
  const [rightFadeDistance, setRightFadeDistance] = useState(0);

  const activateBottomLeftCornerRadius = useMemo(() => {
    return (
      Object.keys(tabs).findIndex((_id) => _id === activeTabId) !== 0 ||
      isSidebarCollapsed
    );
  }, [activeTabId, isSidebarCollapsed, tabs]);

  useEffect(() => {
    setLeftFadeDistance(canScrollLeft ? 16 : 0);
    setRightFadeDistance(canScrollRight ? 16 : 0);
  }, [canScrollLeft, canScrollRight]);

  // Generate inline style for mask with CSS custom properties
  const getMaskStyle = (): React.CSSProperties =>
    ({
      '--left-fade': `${leftFadeDistance}px`,
      '--right-fade': `${rightFadeDistance}px`,
    }) as React.CSSProperties;

  return (
    <div
      className={cn(
        'flex shrink-0 flex-row items-start',
        isSidebarCollapsed && platform === 'darwin' && !isFullScreen
          ? 'pl-18'
          : '',
      )}
    >
      {isSidebarCollapsed && (
        <div className="flex h-7 flex-row items-center gap-2 pr-2">
          <AgentPreviewBadge onClick={openSidebarChatPanel} unreadCount={0} />
        </div>
      )}
      <div
        ref={scrollContainerRef}
        className={cn(
          'mask-alpha scrollbar-none flex flex-row items-start gap-0.75 overflow-x-auto pr-2',
          isSidebarCollapsed ? '-ml-2 pl-2' : '',
        )}
        style={
          {
            ...getMaskStyle(),
            maskImage: `linear-gradient(to right, transparent 0px, black var(--left-fade), black calc(100% - var(--right-fade)), transparent 100%)`,
            WebkitMaskImage: `linear-gradient(to right, transparent 0px, black var(--left-fade), black calc(100% - var(--right-fade)), transparent 100%)`,
          } as React.CSSProperties
        }
      >
        {Object.values(tabs).map((tab) => {
          return (
            <Tab
              key={tab.id}
              tabState={tab}
              activateBottomLeftCornerRadius={activateBottomLeftCornerRadius}
            />
          );
        })}
      </div>
      <Button
        variant="ghost"
        size="xs"
        className="-ml-1.25 h-7.25 shrink-0 self-start rounded-[8.5px] rounded-bl-md text-zinc-200 opacity-80 transition-all duration-150 ease-out hover:bg-zinc-50/70! hover:text-muted-foreground hover:opacity-100"
        onClick={onAddTab}
      >
        <IconPlus className="size-3 text-muted-foreground" />
        <div className="pointer-events-none flex flex-row items-center gap-1">
          <span className="ml-1 text-xs">⌘ T</span>
        </div>
      </Button>
      <div className="app-drag h-full min-w-2! grow" />
      {Object.values(tabs).length > 1 && (
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="xs"
              className={cn(
                'h-7.25 shrink-0 self-start rounded-[8.5px] text-zinc-200 opacity-80 transition-all duration-150 ease-out hover:bg-zinc-50/70! hover:text-muted-foreground hover:opacity-100',
                platform !== 'darwin' ? 'mr-16' : 'mr-0',
              )}
              onClick={onCleanAllTabs}
            >
              <span className="mr-1 text-xs">⌘ ↑ W</span>
              <IconBrush2Fill18 className="size-3.5 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span>Close all other tabs</span>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
