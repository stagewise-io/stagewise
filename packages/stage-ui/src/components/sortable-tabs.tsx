/**
 * SortableTabs — drag-to-reorder tabs with two visual variants.
 *
 * ## Variants
 *
 * ### `"pill"` (default)
 * Equal-width pill buttons in a rounded container. Standard UI switcher.
 * Icons and close buttons are ignored.
 *
 * ### `"bar"`
 * Browser-chrome–style horizontal tab bar. Supports per-tab icons, close
 * buttons, and an optional "add tab" action button at the end.
 *
 * For the `"bar"` variant, pass `activeValue` matching the `value` you
 * pass to `SortableTabs` so active-tab styling is applied correctly to
 * the outer wrapper (which covers both the trigger text area and the close
 * button).
 *
 * ## Persistence
 * Callers own persistence. `onReorder` fires with the new item array and
 * the caller decides how to save it (localStorage, backend, URL, etc).
 *
 * ## Usage
 *
 * ```tsx
 * // pill (simple - no activeValue needed)
 * <SortableTabs value={active} onValueChange={setActive}>
 *   <SortableTabsList items={items} onReorder={setItems} />
 *   <TabsContent value="a">…</TabsContent>
 * </SortableTabs>
 *
 * // bar (browser-chrome style)
 * <SortableTabs value={active} onValueChange={setActive}>
 *   <SortableTabsList
 *     variant="bar"
 *     items={items}
 *     onReorder={setItems}
 *     activeValue={active}
 *     onAddItem={handleAddTab}
 *   />
 *   <TabsContent value="a">…</TabsContent>
 * </SortableTabs>
 * ```
 */

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
  useSortable,
} from '@dnd-kit/sortable';
import {
  restrictToHorizontalAxis,
  restrictToFirstScrollableAncestor,
} from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { Tabs as TabsBase } from '@base-ui/react/tabs';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { PlusIcon, XIcon } from 'lucide-react';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SortableTabItem {
  /** Unique stable id — also used as the Tabs `value`. */
  id: string;
  /** Content rendered inside the trigger button. */
  label: ReactNode;
  /**
   * Icon rendered before the label. Only used in the `"bar"` variant.
   * Tip: pass a 16×16 icon element; it will be constrained to `size-4`.
   */
  icon?: ReactNode;
  /** Prevent this tab from being dragged (still clickable). */
  disabled?: boolean;
  /**
   * Whether a close button is shown. Defaults to `true` when `onClose` is
   * provided. Set to `false` to hide the close button on a specific tab.
   * Only relevant in the `"bar"` variant.
   */
  closeable?: boolean;
  /**
   * Called when the user clicks the close button.
   * Only rendered in the `"bar"` variant when provided.
   */
  onClose?: () => void;
  /**
   * Middle-click (auxclick) handler on the outer tab wrapper.
   * Bar variant only. Safe to combine with dnd-kit — the PointerSensor
   * ignores events where `event.button !== 0`.
   */
  onAuxClick?: (e: React.MouseEvent) => void;
  /**
   * Extra React content rendered as a flex sibling between the label
   * trigger area and the close button. Bar variant only. Renders outside
   * `Tabs.Tab` so nested interactive elements (buttons) are valid DOM.
   * Use case: audio mute toggle.
   */
  actions?: ReactNode;
  /**
   * Wraps the fully-composed outer trigger element. Called with the
   * composed JSX and must return a React element wrapping it.
   * Bar variant only.
   * Use case: `WithTabPreviewCard` hover-preview in the browser app.
   */
  wrapTrigger?: (inner: ReactElement) => ReactElement;
}

export type SortableTabVariant = 'pill' | 'bar';

// ---------------------------------------------------------------------------
// Root — thin wrapper so TabsContent still works as a sibling
// ---------------------------------------------------------------------------

export type SortableTabsProps = React.ComponentProps<typeof TabsBase.Root>;

export const SortableTabs = ({ className, ...props }: SortableTabsProps) => (
  <TabsBase.Root
    {...props}
    className={cn('flex w-full flex-col items-start gap-2', className)}
  />
);

// ---------------------------------------------------------------------------
// Pure-visual trigger content (no dnd hooks)
// These are used both in the actual list AND in the DragOverlay clone.
// Having them separate avoids registering a duplicate Tabs.Tab value in
// the TabsBase.Root context while a drag is in progress.
// ---------------------------------------------------------------------------

/** Pill variant — visual only, no dnd. */
function PillTriggerContent({ item }: { item: SortableTabItem }) {
  return (
    <TabsBase.Tab
      value={item.id}
      disabled={item.disabled}
      className={(state) =>
        cn(
          'h-full select-none rounded-full px-2 py-1 font-medium text-xs transition-colors',
          state.active
            ? 'bg-active-derived! text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
          item.disabled && 'cursor-not-allowed opacity-50',
        )
      }
    >
      {item.label}
    </TabsBase.Tab>
  );
}

/**
 * Bar variant — visual only, no dnd.
 *
 * NOTE: Close button is a flex sibling to `Tabs.Tab`, NOT a child.
 * This avoids the invalid nested `<button>` DOM pattern since `Tabs.Tab`
 * renders as `<button>`. The wrapper div carries the active background so
 * both the trigger area and the close button share the same surface.
 */
function BarTriggerContent({
  item,
  isActive = false,
}: {
  item: SortableTabItem;
  isActive?: boolean;
}) {
  const showClose = item.closeable !== false && !!item.onClose;

  const el = (
    <div
      onAuxClick={item.onAuxClick}
      className={cn(
        'group flex h-8 flex-row items-stretch ring-1 transition-colors duration-150 ease-out',
        isActive
          ? 'bg-surface-1 ring-derived-subtle'
          : 'bg-transparent ring-transparent hover:bg-surface-1',
      )}
    >
      {/* Trigger — fills remaining width, handles tab activation */}
      <TabsBase.Tab
        value={item.id}
        disabled={item.disabled}
        className={cn(
          'flex min-w-0 flex-1 select-none flex-row items-center gap-1.5 bg-transparent py-1 pr-1 pl-2.5 text-xs',
          item.disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        {item.icon && (
          <span className="size-4 shrink-0 [&>*]:size-full">{item.icon}</span>
        )}
        <span
          className={cn(
            'flex-1 truncate text-left font-regular',
            isActive ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {item.label}
        </span>
      </TabsBase.Tab>

      {/* Extra actions (e.g. audio mute toggle) — sibling to Tabs.Tab */}
      {item.actions}

      {/* Close button — sibling to Tabs.Tab, never causes nested <button> */}
      {showClose && (
        <button
          type="button"
          aria-label="Close tab"
          // Prevent dnd-kit's PointerSensor from activating on the close btn
          onPointerDown={(e) => e.stopPropagation()}
          onClick={item.onClose}
          className={cn(
            'flex shrink-0 items-center justify-center pr-2 pl-0.5 text-muted-foreground transition-colors hover:text-foreground',
            // Only show on hover for inactive tabs (matches browser behaviour)
            !isActive && 'opacity-0 group-hover:opacity-100',
          )}
        >
          <XIcon className="size-3" />
        </button>
      )}
    </div>
  );

  return item.wrapTrigger ? item.wrapTrigger(el) : el;
}

// ---------------------------------------------------------------------------
// Pure-visual overlay clones — rendered inside DragOverlay portal.
// Must NOT use Tabs.Tab (would register duplicate value in TabsBase.Root
// context while the real tab is still mounted).
// ---------------------------------------------------------------------------

function PillOverlayContent({ item }: { item: SortableTabItem }) {
  return (
    <div className="select-none rounded-full bg-surface-2 px-2 py-1 font-medium text-foreground text-xs shadow-elevation-1">
      {item.label}
    </div>
  );
}

function BarOverlayContent({
  item,
  isActive,
}: {
  item: SortableTabItem;
  isActive: boolean;
}) {
  const showClose = item.closeable !== false && !!item.onClose;

  return (
    <div
      className={cn(
        'flex h-8 flex-row items-stretch shadow-elevation-1 ring-1',
        isActive
          ? 'bg-surface-1 ring-derived-subtle'
          : 'bg-surface-1 ring-derived',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-1 text-xs">
        {item.icon && (
          <span className="size-4 shrink-0 [&>*]:size-full">{item.icon}</span>
        )}
        <span
          className={cn(
            'flex-1 truncate text-left font-regular',
            isActive ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {item.label}
        </span>
      </div>
      {showClose && (
        <div className="flex shrink-0 items-center justify-center px-1 text-muted-foreground">
          <XIcon className="size-3" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable trigger wrapper — adds dnd-kit around the visual content
// ---------------------------------------------------------------------------

function SortableTrigger({
  item,
  variant,
  activeValue,
}: {
  item: SortableTabItem;
  variant: SortableTabVariant;
  activeValue?: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: item.disabled,
    attributes: { tabIndex: -1 },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Ghost (invisible placeholder) where the item was picked up from
    opacity: isDragging ? 0 : 1,
  };

  if (variant === 'bar') {
    return (
      <div
        ref={setNodeRef}
        style={{
          ...style,
          minWidth: '6rem',
          maxWidth: '11rem',
        }}
        {...attributes}
        {...listeners}
      >
        <BarTriggerContent item={item} isActive={activeValue === item.id} />
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <PillTriggerContent item={item} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SortableTabsList — the main public component
// ---------------------------------------------------------------------------

export interface SortableTabsListProps {
  /**
   * Ordered tab items. The caller owns this array and its persistence.
   * Update it in `onReorder` to see the new order.
   */
  items: SortableTabItem[];
  /**
   * Called after a successful drag-drop with the reordered item array.
   * Persist the new order however makes sense for your use case.
   */
  onReorder: (newItems: SortableTabItem[]) => void;
  /**
   * Visual design of the tab list.
   * - `"pill"` (default): rounded pill container, equal-width tabs.
   * - `"bar"`: browser-chrome style, variable-width tabs, supports icons
   *   and close buttons.
   */
  variant?: SortableTabVariant;
  /**
   * The currently active tab id. **Required for the `"bar"` variant** —
   * the active background is applied to the outer wrapper div (which covers
   * both the trigger text area and the close button), so it cannot be
   * inferred from Base UI's internal tab state alone.
   *
   * Pass the same value you pass to `SortableTabs value={...}`.
   */
  activeValue?: string;
  /**
   * Rendered as an "add" button after the last tab in the `"bar"` variant.
   * Not shown in the `"pill"` variant.
   */
  onAddItem?: () => void;
  className?: string;
}

export const SortableTabsList = ({
  items,
  onReorder,
  variant = 'pill',
  activeValue,
  onAddItem,
  className,
}: SortableTabsListProps) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const barScrollRef = useRef<HTMLDivElement>(null);

  // Redirect vertical mouse-wheel to horizontal scroll on the tab bar.
  // Must be a non-passive listener so we can call preventDefault().
  useEffect(() => {
    if (variant !== 'bar') return;
    const el = barScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX !== 0) return; // already horizontal — leave it alone
      if (e.deltaY === 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [variant]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        // Small movement threshold prevents accidental drags on clicks
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (over && active.id !== over.id) {
        const oldIndex = items.findIndex((t) => t.id === active.id);
        const newIndex = items.findIndex((t) => t.id === over.id);
        onReorder(arrayMove(items, oldIndex, newIndex));
      }
    },
    [items, onReorder],
  );

  const activeItem = activeId ? items.find((t) => t.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToHorizontalAxis, restrictToFirstScrollableAncestor]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((t) => t.id)}
        strategy={horizontalListSortingStrategy}
      >
        {variant === 'bar' ? (
          // Scroll container uses w-max so it sizes to natural tab content.
          // It also shrinks (default flex-shrink:1) so when the outer wrapper
          // runs out of space the tabs compress proportionally. Once every tab
          // hits its minWidth floor the container overflows and scrolls.
          // min-w-full on the List keeps tabs filling the container width.
          <div
            className={cn(
              'flex w-full min-w-0 flex-row items-stretch',
              className,
            )}
          >
            <div
              ref={barScrollRef}
              className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <TabsBase.List className="flex h-full w-fit flex-row items-stretch divide-x divide-surface-2">
                {items.map((item) => (
                  <SortableTrigger
                    key={item.id}
                    item={item}
                    variant="bar"
                    activeValue={activeValue}
                  />
                ))}
              </TabsBase.List>
            </div>
            {onAddItem && (
              <button
                type="button"
                aria-label="Add tab"
                onClick={onAddItem}
                className="flex h-8 shrink-0 cursor-pointer items-center justify-center border-surface-2 border-l bg-background px-2 text-muted-foreground transition-colors hover:bg-surface-1 hover:text-foreground"
              >
                <PlusIcon className="size-3" />
              </button>
            )}
          </div>
        ) : (
          // Pill: equal-width grid in a rounded container
          <TabsBase.List
            className={cn(
              'grid w-full auto-cols-fr grid-flow-col justify-center rounded-full border border-derived bg-background p-0.5',
              className,
            )}
          >
            {items.map((item) => (
              <SortableTrigger key={item.id} item={item} variant="pill" />
            ))}
          </TabsBase.List>
        )}
      </SortableContext>

      {/* DragOverlay: pure visual clone — no Tabs.Tab inside to avoid
          registering a duplicate value in TabsBase.Root context */}
      <DragOverlay>
        {activeItem ? (
          variant === 'bar' ? (
            <div style={{ width: '8rem', minWidth: '5rem', maxWidth: '8rem' }}>
              <BarOverlayContent
                item={activeItem}
                isActive={activeValue === activeItem.id}
              />
            </div>
          ) : (
            <PillOverlayContent item={activeItem} />
          )
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
