import { Button } from '@stagewise/stage-ui/components/button';
import { cn } from '@/utils';
import { IconPlus } from 'nucleo-micro-bold';
import { useIsContainerScrollable } from '@/hooks/use-is-container-scrollable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
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
  type DragMoveEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  restrictToHorizontalAxis,
  restrictToFirstScrollableAncestor,
} from '@dnd-kit/modifiers';
import { SortableTab } from './sortable-tab';
import { Tab } from './tab';

const DEFAULT_BORDER_RADIUS = 8;

// Default dnd-kit drop animation duration in ms
// See: @dnd-kit/core defaultDropAnimationConfiguration
export const DND_DROP_ANIMATION_DURATION = 250;

export function TabsContainer({
  openSidebarChatPanel,
  isSidebarCollapsed,
  onAddTab,
  onCleanAllTabs,
  onDragBorderRadiusChange,
  onActiveTabDragAtPositionZero,
}: {
  openSidebarChatPanel: () => void;
  isSidebarCollapsed: boolean;
  onAddTab: () => void;
  onCleanAllTabs: () => void;
  onDragBorderRadiusChange?: (radius: number | null) => void;
  onActiveTabDragAtPositionZero?: (isAtPositionZero: boolean) => void;
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

  // Track the interpolated border radius during drag (8 to 0 as tab approaches left edge)
  const [dragBorderRadius, setDragBorderRadius] = useState<number | null>(null);

  // Track if we should disable the drop animation (when dropping at position 0)
  const [disableDropAnimation, setDisableDropAnimation] = useState(false);

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

  // Handle drag move to track position and calculate interpolated border radius
  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const { active, delta } = event;
      const container = scrollContainerRef.current;

      if (!container || !active.rect.current.initial) {
        return;
      }

      // Only interpolate when the dragged tab is the active tab
      // (we only care about smoothing the active tab's S-curve)
      const draggedTabId = active.id as string;
      if (draggedTabId !== activeTabId) {
        // Not dragging the active tab, reset to null
        setDragBorderRadius(null);
        onDragBorderRadiusChange?.(null);
        return;
      }

      // When sidebar is collapsed, we always show the S-curve at full radius
      // because there's space on the left for the agent preview badge
      if (isSidebarCollapsed) {
        setDragBorderRadius(DEFAULT_BORDER_RADIUS);
        onDragBorderRadiusChange?.(DEFAULT_BORDER_RADIUS);
        return;
      }

      // Get the container's left edge position
      const containerLeft = container.getBoundingClientRect().left;

      // Calculate the tab's current left position (initial + delta)
      const tabCurrentLeft = active.rect.current.initial.left + delta.x;

      // Calculate distance from container's left edge
      const distanceFromLeftEdge = tabCurrentLeft - containerLeft;

      // The S-curve consists of two 8px radius curves meeting (tab + container),
      // so they occupy 16px total horizontal space.
      // Interpolate: when distance >= 16, radius is 8; when distance <= 0, radius is 0
      const interpolatedRadius = Math.max(
        0,
        Math.min(DEFAULT_BORDER_RADIUS, distanceFromLeftEdge / 2),
      );

      setDragBorderRadius(interpolatedRadius);
      onDragBorderRadiusChange?.(interpolatedRadius);
    },
    [activeTabId, isSidebarCollapsed, onDragBorderRadiusChange],
  );

  // Handle drag over to track projected position
  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      const currentOverId = (over?.id as string) ?? null;

      // Check if the active tab is being dragged to position 0
      // This happens when:
      // 1. The dragged tab is the active tab
      // 2. It's hovering over the first tab in the list
      // 3. Or the dragged tab itself was already first (and still is)
      const isDraggingActiveTab = active.id === activeTabId;
      const firstTabId = optimisticTabIds[0];

      if (isDraggingActiveTab && !isSidebarCollapsed) {
        // Projected position is 0 if:
        // - We're over the first tab (and will swap with it)
        // - OR we're the first tab and not over anything else
        const projectedPositionIsZero =
          currentOverId === firstTabId ||
          (active.id === firstTabId && !currentOverId);
        onActiveTabDragAtPositionZero?.(projectedPositionIsZero);
      } else {
        onActiveTabDragAtPositionZero?.(false);
      }
    },
    [
      activeTabId,
      isSidebarCollapsed,
      optimisticTabIds,
      onActiveTabDragAtPositionZero,
    ],
  );

  // Handle drag end to reorder tabs with optimistic update
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      let newTabIds = optimisticTabIds;

      if (over && active.id !== over.id) {
        const oldIndex = optimisticTabIds.indexOf(active.id as string);
        const newIndex = optimisticTabIds.indexOf(over.id as string);
        newTabIds = arrayMove(optimisticTabIds, oldIndex, newIndex);

        // Optimistically update local state immediately
        setOptimisticTabIds(newTabIds);

        // Then sync with backend (fire and forget)
        reorderTabs(newTabIds);
      }

      // Check if the active tab will end up at position 0 after the drop
      const activeTabWillBeFirst =
        active.id === activeTabId && newTabIds[0] === activeTabId;

      if (activeTabWillBeFirst && !isSidebarCollapsed) {
        // Disable the drop animation when landing at position 0 to avoid
        // the S-curve being visible during the snap animation.
        // The dnd-kit DragOverlay doesn't re-render during its CSS animation,
        // so we need to skip the animation entirely.
        flushSync(() => {
          setDisableDropAnimation(true);
          setDragBorderRadius(0);
        });
        onDragBorderRadiusChange?.(0);

        // Reset after a short delay (no animation, so minimal delay needed)
        setTimeout(() => {
          setActiveId(null);
          setDragBorderRadius(null);
          setDisableDropAnimation(false);
          onDragBorderRadiusChange?.(null);
          onActiveTabDragAtPositionZero?.(false);
        }, 50);
      } else {
        // Reset immediately for other cases
        setActiveId(null);
        setDragBorderRadius(null);
        onDragBorderRadiusChange?.(null);
        onActiveTabDragAtPositionZero?.(false);
      }
    },
    [
      activeTabId,
      isSidebarCollapsed,
      optimisticTabIds,
      reorderTabs,
      onDragBorderRadiusChange,
      onActiveTabDragAtPositionZero,
    ],
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
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToHorizontalAxis, restrictToFirstScrollableAncestor]}
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
      <DragOverlay dropAnimation={disableDropAnimation ? null : undefined}>
        {activeTab ? (
          <div style={{ width: '13rem' }}>
            <Tab
              tabState={activeTab}
              activateBottomLeftCornerRadius={
                dragBorderRadius !== null
                  ? dragBorderRadius > 0 // During drag, show curve only if radius > 0
                  : activateBottomLeftCornerRadius
              }
              bottomLeftBorderRadius={
                dragBorderRadius !== null ? dragBorderRadius : undefined
              }
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
