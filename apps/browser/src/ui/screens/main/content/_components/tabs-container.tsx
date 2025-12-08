import { Button } from '@stagewise/stage-ui/components/button';
import { IconPlus } from 'nucleo-micro-bold';
import { IconCommand } from 'nucleo-micro-bold';
import { useIsContainerScrollable } from '@/hooks/use-is-container-scrollable';
import { useEffect, useRef, useState } from 'react';
import type { TabState } from '@shared/karton-contracts/ui';
import { ActiveTab } from './active-tab';
import { InactiveTab } from './inactive-tab';

export function TabsContainer({
  activeTabId,
  tabs,
  setActiveTabId,
  onAddTab,
  onCloseTab,
}: {
  activeTabId: string;
  tabs: Record<string, TabState>;
  setActiveTabId: (tabId: string) => void;
  onAddTab: () => void;
  onCloseTab: (tabId: string) => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { canScrollLeft, canScrollRight } =
    useIsContainerScrollable(scrollContainerRef);
  const [leftFadeDistance, setLeftFadeDistance] = useState(0);
  const [rightFadeDistance, setRightFadeDistance] = useState(0);

  const getIsLeftNextToActiveTab = (tabId: string) => {
    return (
      Object.keys(tabs).findIndex((_id) => _id === tabId) ===
      Object.keys(tabs).findIndex((tabId) => tabId === activeTabId) - 1
    );
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 't') onAddTab();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

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
    <div className="flex shrink-0 flex-row items-start">
      <div
        ref={scrollContainerRef}
        className="mask-alpha scrollbar-none flex flex-row items-start gap-0.75 overflow-x-auto pr-2"
        style={
          {
            ...getMaskStyle(),
            maskImage: `linear-gradient(to right, transparent 0px, black var(--left-fade), black calc(100% - var(--right-fade)), transparent 100%)`,
            WebkitMaskImage: `linear-gradient(to right, transparent 0px, black var(--left-fade), black calc(100% - var(--right-fade)), transparent 100%)`,
          } as React.CSSProperties
        }
      >
        {Object.values(tabs).map((tab, index) => {
          const isLeftNextToActiveTab = getIsLeftNextToActiveTab(tab.id);
          if (tab.id === activeTabId)
            return (
              <ActiveTab
                key={tab.id}
                tabState={tab}
                onClose={() => {
                  onCloseTab(tab.id);
                }}
                activateBottomLeftCornerRadius={index !== 0}
              />
            );
          return (
            <InactiveTab
              key={tab.id}
              tabState={tab}
              onClick={() => {
                setActiveTabId(tab.id);
              }}
              onClose={() => {
                onCloseTab(tab.id);
              }}
              showRightSeparator={!isLeftNextToActiveTab}
            />
          );
        })}
      </div>
      <Button
        variant="ghost"
        size="xs"
        className="-ml-1.25 h-7 shrink-0 self-start rounded-[5px] hover:bg-zinc-50/70!"
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
