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
 * button). Any "add tab" UI belongs outside `SortableTabsList` — render
 * it as a sibling after the component.
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
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { XIcon } from 'lucide-react';
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
    className={cn('flex w-full flex-row items-stretch', className)}
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
        'group relative flex h-7 flex-row items-stretch rounded-md transition-colors duration-150 ease-out',
        isActive ? 'bg-surface-1' : 'bg-transparent hover:bg-surface-1',
      )}
    >
      {/* Trigger — fills remaining width, handles tab activation */}
      <TabsBase.Tab
        value={item.id}
        disabled={item.disabled}
        className={cn(
          'flex min-w-0 flex-1 select-none flex-row items-center gap-1.5 bg-transparent py-0.5 pr-3 pl-2 text-xs',
          item.disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        {item.icon && (
          <span className="size-4 shrink-0 [&>*]:size-full">{item.icon}</span>
        )}
        <span
          data-active={isActive}
          className={cn(
            'mask-alpha mask-l-from-black mask-l-to-black group-hover:mask-l-from-transparent mask-l-from-3 mask-l-to-6 flex-1 truncate text-left font-regular text-muted-foreground data-[active=true]:text-foreground',
          )}
        >
          {item.label}
        </span>
      </TabsBase.Tab>

      {/* Extra actions (e.g. audio mute toggle) — sibling to Tabs.Tab */}
      {item.actions}

      {/* Close button — absolute overlay on the right, fades in on hover/active */}
      {showClose && (
        <button
          type="button"
          aria-label="Close tab"
          // Prevent dnd-kit's PointerSensor from activating on the close btn
          onPointerDown={(e) => e.stopPropagation()}
          onClick={item.onClose}
          className={cn(
            'absolute top-1/2 right-0.5 flex shrink-0 -translate-y-1/2 items-center justify-center p-1 text-muted-foreground opacity-0 transition-colors hover:text-foreground group-hover:opacity-100',
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
    <div className="relative flex h-7 flex-row items-stretch bg-surface-1 shadow-elevation-1">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-0.5 text-xs">
        {item.icon && (
          <span className="size-6 shrink-0 [&>*]:size-full">{item.icon}</span>
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
        <div className="absolute top-1/2 right-0.5 flex shrink-0 -translate-y-1/2 items-center justify-center p-1 text-muted-foreground">
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
        className="app-no-drag"
        style={{
          ...style,
          minWidth: '5rem',
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
  className?: string;
}

export const SortableTabsList = ({
  items,
  onReorder,
  variant = 'pill',
  activeValue,
  className,
}: SortableTabsListProps) => {
  const [activeId, setActiveId] = useState<string | null>(null);

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
          <TabsBase.List className="flex h-full w-fit flex-row items-stretch gap-1">
            {items.map((item) => (
              <SortableTrigger
                key={item.id}
                item={item}
                variant="bar"
                activeValue={activeValue}
              />
            ))}
          </TabsBase.List>
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
