import { Button } from '@stagewise/stage-ui/components/button';
import { cn } from '@ui/utils';
import { IconPlus } from 'nucleo-micro-bold';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
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
import type { KartonContract, TabState } from '@shared/karton-contracts/ui';

const DEFAULT_BORDER_RADIUS = 8;

function DragOverlayContent({
  activeTab,
  dragBorderRadius,
  activateBottomLeftCornerRadius,
}: {
  activeTab: TabState;
  dragBorderRadius: number | null;
  activateBottomLeftCornerRadius: boolean;
}) {
  return (
    <div style={{ width: '13rem' }} tabIndex={-1}>
      <Tab
        tabState={activeTab}
        activateBottomLeftCornerRadius={
          dragBorderRadius !== null
            ? dragBorderRadius > 0
            : activateBottomLeftCornerRadius
        }
        bottomLeftBorderRadius={
          dragBorderRadius !== null ? dragBorderRadius : undefined
        }
        isDragging={true}
      />
    </div>
  );
}

// Default dnd-kit drop animation duration in ms
// See: @dnd-kit/core defaultDropAnimationConfiguration
export const DND_DROP_ANIMATION_DURATION = 250;

export function TabsContainer({
  onAddTab,
  onDragBorderRadiusChange,
  onActiveTabDragAtPositionZero,
}: {
  onAddTab: () => void;
  onDragBorderRadiusChange?: (radius: number | null) => void;
  onActiveTabDragAtPositionZero?: (isAtPositionZero: boolean) => void;
}) {
  const tabs = useKartonState((s) => s.browser.tabs);
  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { maskStyle } = useScrollFadeMask(scrollContainerRef, {
    axis: 'horizontal',
    fadeDistance: 16,
  });

  const reorderTabs = useKartonProcedure((p) => p.browser.reorderTabs);

  // Server tab IDs order — stable reference unless the actual set/order of IDs changes.
  // Without this, any tab property mutation (title, URL, loading state) would produce
  // a new array reference via Object.keys and reset the optimistic drag order.
  const tabIdsSelector = useComparingSelector<KartonContract, string[]>(
    (s) => Object.keys(s.browser.tabs),
    (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
  );
  const serverTabIds = useKartonState(tabIdsSelector);

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
    [activeTabId, onDragBorderRadiusChange],
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

      if (isDraggingActiveTab) {
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
    [activeTabId, optimisticTabIds, onActiveTabDragAtPositionZero],
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

      if (activeTabWillBeFirst) {
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
    return optimisticTabIds.findIndex((id) => id === activeTabId) !== 0;
  }, [activeTabId, optimisticTabIds]);

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
      <div className={cn('flex shrink-0 flex-row items-start bg-background')}>
        <div
          ref={scrollContainerRef}
          className={cn(
            'mask-alpha scrollbar-none flex flex-row items-start divide-x divide-surface-2 overflow-x-auto',
          )}
          style={maskStyle}
        >
          <SortableContext
            items={optimisticTabIds}
            strategy={horizontalListSortingStrategy}
          >
            {orderedTabs.map((tab) => {
              if (!tab) return null;
              return (
                <SortableTab
                  key={tab.id}
                  tabState={tab}
                  isActive={tab?.id === activeTabId}
                />
              );
            })}
          </SortableContext>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="group h-full shrink-0 self-start rounded-none text-muted-foreground ring-1 ring-transparent transition-all duration-150 ease-out hover:bg-surface-1 hover:ring-derived-subtle focus-visible:bg-surface-1"
          onClick={onAddTab}
        >
          <IconPlus className="size-3" />
          <div className="pointer-events-none flex flex-row items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
            <span className="ml-1 text-muted-foreground text-xs">⌘ T</span>
          </div>
        </Button>
        <div className="app-drag h-full min-w-2!" />
      </div>
      <DragOverlay dropAnimation={disableDropAnimation ? null : undefined}>
        {activeTab ? (
          <DragOverlayContent
            activeTab={activeTab}
            dragBorderRadius={dragBorderRadius}
            activateBottomLeftCornerRadius={activateBottomLeftCornerRadius}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
