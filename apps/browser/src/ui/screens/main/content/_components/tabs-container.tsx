import { Button } from '@stagewise/stage-ui/components/button';
import { cn } from '@/utils';
import { IconPlus } from 'nucleo-micro-bold';
import { IconCommand } from 'nucleo-micro-bold';
import { useIsContainerScrollable } from '@/hooks/use-is-container-scrollable';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TabState } from '@shared/karton-contracts/ui';
import { Tab } from './tab';
import { AgentPreviewBadge } from './agent-preview-badge';

export function TabsContainer({
  openSidebarChatPanel,
  isSidebarCollapsed,
  activeTabId,
  tabs,
  setActiveTabId,
  onAddTab,
  onCloseTab,
  onToggleAudioMuted,
}: {
  openSidebarChatPanel: () => void;
  isSidebarCollapsed: boolean;
  activeTabId: string;
  tabs: Record<string, TabState>;
  setActiveTabId: (tabId: string) => void;
  onAddTab: () => void;
  onCloseTab: (tabId: string) => void;
  onToggleAudioMuted: (tabId: string) => void;
}) {
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

  const getIsLeftNextToActiveTab = (tabId: string) => {
    return (
      Object.keys(tabs).findIndex((_id) => _id === tabId) ===
      Object.keys(tabs).findIndex((tabId) => tabId === activeTabId) - 1
    );
  };

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
        isSidebarCollapsed ? 'pl-18' : '',
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
          const isLeftNextToActiveTab = getIsLeftNextToActiveTab(tab.id);
          const isActive = tab.id === activeTabId;
          return (
            <Tab
              key={tab.id}
              isActive={isActive}
              tabState={tab}
              onClick={isActive ? undefined : () => setActiveTabId(tab.id)}
              onClose={() => {
                onCloseTab(tab.id);
              }}
              onToggleAudioMuted={() => {
                onToggleAudioMuted(tab.id);
              }}
              activateBottomLeftCornerRadius={activateBottomLeftCornerRadius}
              showRightSeparator={!isActive && !isLeftNextToActiveTab}
            />
          );
        })}
      </div>
      <Button
        variant="ghost"
        size="xs"
        className="-ml-1.25 h-7.25 shrink-0 self-start rounded-[8.5px] rounded-bl-md hover:bg-zinc-50/70!"
        onClick={onAddTab}
      >
        <IconPlus className="size-3 text-muted-foreground" />
        <div className="pointer-events-none flex flex-row items-center gap-1 opacity-40">
          <IconCommand className="size-3 text-muted-foreground" />
          <span className="font-mono text-muted-foreground text-xs">T</span>
        </div>
      </Button>
      <div className="app-drag h-full min-w-16! grow" />
    </div>
  );
}
