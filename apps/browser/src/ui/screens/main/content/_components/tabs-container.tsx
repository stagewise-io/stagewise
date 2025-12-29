import { Button } from '@stagewise/stage-ui/components/button';
import { cn } from '@/utils';
import { IconPlus } from 'nucleo-micro-bold';
import { useIsContainerScrollable } from '@/hooks/use-is-container-scrollable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgentPreviewBadge } from './agent-preview-badge';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import { IconBrush2Fill18 } from 'nucleo-ui-fill-18';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { SortableTab } from './sortable-tab';
import { Tab } from './tab';

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

  const reorderTabs = useKartonProcedure((p) => p.browser.reorderTabs);

  // Server tab IDs order
  const serverTabIds = useMemo(() => Object.keys(tabs), [tabs]);

  // Optimistic local tab order - syncs with server but can be updated immediately on drag
  const [optimisticTabIds, setOptimisticTabIds] =
    useState<string[]>(serverTabIds);

  // Track which tab is currently being dragged (for DragOverlay)
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sync optimistic state with server state when server updates
  // (e.g., when tabs are added/removed, or after backend confirms reorder)
  useEffect(() => {
    setOptimisticTabIds(serverTabIds);
  }, [serverTabIds]);

  // Configure sensors for drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Minimum drag distance before activation
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Handle drag start to track active item for DragOverlay
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  // Handle drag end to reorder tabs with optimistic update
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = optimisticTabIds.indexOf(active.id as string);
        const newIndex = optimisticTabIds.indexOf(over.id as string);
        const newTabIds = arrayMove(optimisticTabIds, oldIndex, newIndex);

        // Optimistically update local state immediately
        setOptimisticTabIds(newTabIds);

        // Then sync with backend (fire and forget)
        reorderTabs(newTabIds);
      }

      setActiveId(null);
    },
    [optimisticTabIds, reorderTabs],
  );

  // Get the tab being dragged for the overlay
  const activeTab = activeId ? tabs[activeId] : null;

  // Use optimistic order for rendering
  const orderedTabs = useMemo(() => {
    return optimisticTabIds.map((id) => tabs[id]).filter(Boolean); // Filter out any tabs that might have been deleted
  }, [optimisticTabIds, tabs]);

  const activateBottomLeftCornerRadius = useMemo(() => {
    return (
      optimisticTabIds.findIndex((id) => id === activeTabId) !== 0 ||
      isSidebarCollapsed
    );
  }, [activeTabId, isSidebarCollapsed, optimisticTabIds]);

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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToHorizontalAxis]}
    >
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
          <SortableContext
            items={optimisticTabIds}
            strategy={horizontalListSortingStrategy}
          >
            {orderedTabs.map((tab) => {
              return (
                <SortableTab
                  key={tab.id}
                  tabState={tab}
                  activateBottomLeftCornerRadius={
                    activateBottomLeftCornerRadius
                  }
                />
              );
            })}
          </SortableContext>
        </div>
        <Button
          variant="ghost"
          size="xs"
          className="-ml-1.25 h-7.25 shrink-0 self-start rounded-[8.5px] rounded-bl-md text-muted opacity-80 transition-all duration-150 ease-out hover:text-muted-foreground hover:opacity-100"
          onClick={onAddTab}
        >
          <IconPlus className="size-3 text-muted-foreground" />
          <div className="pointer-events-none flex flex-row items-center gap-1">
            <span className="ml-1 text-xs">⌘ T</span>
          </div>
        </Button>
        <div className="app-drag h-full min-w-2! grow" />
        {orderedTabs.length > 1 && (
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="xs"
                className={cn(
                  'h-7.25 shrink-0 self-start rounded-[8.5px] text-muted opacity-80 transition-all duration-150 ease-out hover:text-muted-foreground hover:opacity-100',
                  platform !== 'darwin' ? 'mr-32' : 'mr-0',
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
      <DragOverlay>
        {activeTab ? (
          <div style={{ width: '13rem' }}>
            <Tab
              tabState={activeTab}
              activateBottomLeftCornerRadius={activateBottomLeftCornerRadius}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
