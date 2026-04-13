import {
  forwardRef,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ComponentType } from 'react';
import { cn } from '@ui/utils';
import { TerminalSquareIcon } from 'lucide-react';
import {
  IconClipboardOutline18,
  IconImageSparkle3Outline18,
  IconSideProfileSparkleOutline18,
} from 'nucleo-ui-outline-18';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import { SuggestionPopupContainer, SuggestionSidePanel } from '../shared';
import type { SlashItem } from './types';

/** Map of builtin command IDs to their icon components. */
const COMMAND_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  'command:plan': IconClipboardOutline18,
  'command:preview': IconImageSparkle3Outline18,
  'command:learn': IconSideProfileSparkleOutline18,
};

/** Group labels — `builtin` has no header. */
const GROUP_LABELS: Record<string, string | null> = {
  builtin: null,
  workspace: 'Skills',
  plugin: 'Plugins',
};

/** Render order for groups. */
const GROUP_ORDER: readonly string[] = ['builtin', 'workspace', 'plugin'];

interface SlashSuggestionPopupProps {
  items: SlashItem[];
  selectedIndex: number;
  selectionSource: 'keyboard' | 'mouse';
  panelIndex: number;
  isPanelFocused: boolean;
  onSelect: (item: SlashItem) => void;
  onHoverIndex: (index: number) => void;
  onHoverPanelIndex: (index: number) => void;
  onMouseMoved: () => void;
  clientRect: (() => DOMRect | null) | null;
}

const SlashSuggestionItem = memo(
  function SlashSuggestionItem({
    item,
    isSelected,
    onSelect,
    onMouseEnter,
    onRef,
  }: {
    item: SlashItem;
    isSelected: boolean;
    onSelect: () => void;
    onMouseEnter: () => void;
    onRef: (el: HTMLButtonElement | null) => void;
  }) {
    const isBuiltin = item.group === 'builtin';
    const isSynthetic = Boolean(item.expandGroup);
    const Icon =
      isBuiltin && !isSynthetic
        ? (COMMAND_ICONS[item.id] ?? TerminalSquareIcon)
        : null;

    return (
      <button
        ref={onRef}
        type="button"
        className={cn(
          'flex w-full cursor-default select-none items-center gap-2 rounded-md px-2 py-1 text-left text-xs outline-none transition-colors duration-150 ease-out',
          isSelected ? 'bg-surface-1 text-foreground' : 'text-foreground',
        )}
        onClick={onSelect}
        onMouseEnter={onMouseEnter}
        onMouseDown={(e) => e.preventDefault()}
      >
        {Icon && <Icon className="size-3 shrink-0 text-muted-foreground" />}
        {isSynthetic ? (
          <span
            className={cn(
              'min-w-0 shrink-0',
              isSelected ? 'text-muted-foreground' : 'text-subtle-foreground',
            )}
          >
            {item.label}
          </span>
        ) : (
          <>
            <span className="min-w-0 truncate font-medium">
              {`/${item.label}`}
            </span>
            {item.description && (
              <span className="min-w-0 flex-1 truncate font-normal text-subtle-foreground text-xs">
                {item.description}
              </span>
            )}
          </>
        )}
      </button>
    );
  },
  (prev, next) =>
    prev.item === next.item && prev.isSelected === next.isSelected,
);

/**
 * Side panel that previews the hidden items behind a "Show N more" row.
 * Scrollable with a fade mask when the list exceeds max height.
 */
const ShowMoreSidePanel = forwardRef<
  HTMLDivElement,
  {
    offset: number;
    hiddenItems: SlashItem[];
    panelIndex: number;
    isPanelFocused: boolean;
    selectionSource: 'keyboard' | 'mouse';
    onSelectPanelItem: (item: SlashItem) => void;
    onHoverPanelIndex: (index: number) => void;
  }
>(function ShowMoreSidePanel(
  {
    offset,
    hiddenItems,
    panelIndex,
    isPanelFocused,
    selectionSource,
    onSelectPanelItem,
    onHoverPanelIndex,
  },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const nestedPanelRef = useRef<HTMLDivElement>(null);
  const [nestedPanelOffset, setNestedPanelOffset] = useState(0);

  const { maskStyle } = useScrollFadeMask(scrollRef, {
    axis: 'vertical',
    fadeDistance: 12,
  });

  // Scroll highlighted panel item into view (keyboard only).
  useEffect(() => {
    if (!isPanelFocused || selectionSource !== 'keyboard') return;
    const el = itemRefs.current.get(panelIndex);
    el?.scrollIntoView({ block: 'nearest' });
  }, [panelIndex, isPanelFocused, selectionSource]);

  // Position the nested (third-level) description panel.
  const activeItem = isPanelFocused ? hiddenItems[panelIndex] : undefined;

  useLayoutEffect(() => {
    if (!activeItem?.description) return;
    const itemEl = itemRefs.current.get(panelIndex);
    const container = scrollRef.current;
    const panel = nestedPanelRef.current;
    if (!itemEl || !container || !panel) return;

    const containerRect = container.getBoundingClientRect();
    const itemRect = itemEl.getBoundingClientRect();
    const centerY = itemRect.top + itemRect.height / 2 - containerRect.top;

    const panelHeight = panel.offsetHeight;
    const containerHeight = container.offsetHeight;

    let off = centerY - panelHeight / 2;
    off = Math.max(0, off);
    off = Math.min(off, containerHeight - panelHeight);

    setNestedPanelOffset(off);
  }, [panelIndex, activeItem]);

  return (
    <SuggestionSidePanel
      ref={ref}
      offset={offset}
      className="w-72 p-1"
      disableScroll
    >
      <div className="relative">
        <div
          ref={scrollRef}
          className="mask-alpha scrollbar-subtle max-h-52 overflow-y-auto"
          style={maskStyle}
        >
          <div className="flex flex-col gap-0.5">
            {hiddenItems.map((hi, idx) => (
              <div
                key={hi.id}
                ref={(el) => {
                  itemRefs.current.set(idx, el);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelectPanelItem(hi);
                }}
                onMouseEnter={() => onHoverPanelIndex(idx)}
                className={cn(
                  'flex cursor-pointer flex-col gap-0.5 rounded-md px-2 py-1 transition-colors duration-150 ease-out',
                  isPanelFocused && idx === panelIndex
                    ? 'bg-surface-1 text-foreground'
                    : 'text-foreground',
                )}
              >
                <span className="truncate font-medium text-foreground text-xs">
                  {hi.label}
                </span>
                {hi.description && (
                  <span className="truncate text-[11px] text-subtle-foreground">
                    {hi.description}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Third-level description panel — outside scroll container to avoid overflow clipping */}
        {activeItem?.description && (
          <SuggestionSidePanel
            ref={nestedPanelRef}
            offset={nestedPanelOffset}
            className="ml-[9px]"
          >
            <span className="font-medium text-foreground text-xs">
              {activeItem.label}
            </span>
            <span className="text-subtle-foreground text-xs leading-relaxed">
              {activeItem.description}
            </span>
          </SuggestionSidePanel>
        )}
      </div>
    </SuggestionSidePanel>
  );
});

/**
 * Groups items by their `group` field, preserving discovery order
 * within each group and rendering groups in a fixed order.
 */
function useGroupedItems(items: SlashItem[]) {
  return useMemo(() => {
    const buckets = new Map<string, SlashItem[]>();
    for (const item of items) {
      const group =
        item.group === 'global' ? 'workspace' : item.group || 'builtin';
      let bucket = buckets.get(group);
      if (!bucket) {
        bucket = [];
        buckets.set(group, bucket);
      }
      bucket.push(item);
    }

    // Build a flat list with group header markers interleaved.
    // Each entry is either { type: 'header', label } or
    // { type: 'item', item, flatIndex } where flatIndex is the
    // index into the original `items` array (for selectedIndex).
    const rows: GroupedRow[] = [];
    let flatIndex = 0;

    for (const group of GROUP_ORDER) {
      const bucket = buckets.get(group);
      if (!bucket || bucket.length === 0) continue;

      const label = GROUP_LABELS[group] ?? null;
      if (label) {
        rows.push({ type: 'header', label });
      }
      for (const item of bucket) {
        rows.push({ type: 'item', item, flatIndex });
        flatIndex++;
      }
    }

    // Include any groups not in GROUP_ORDER (future-proof).
    for (const [group, bucket] of Array.from(buckets)) {
      if (GROUP_ORDER.includes(group)) continue;
      rows.push({ type: 'header', label: group });
      for (const item of bucket) {
        rows.push({ type: 'item', item, flatIndex });
        flatIndex++;
      }
    }

    return rows;
  }, [items]);
}

type GroupedRow =
  | { type: 'header'; label: string }
  | { type: 'item'; item: SlashItem; flatIndex: number };

export function SlashSuggestionPopup({
  items,
  selectedIndex,
  selectionSource,
  panelIndex,
  isPanelFocused,
  onSelect,
  onHoverIndex,
  onHoverPanelIndex,
  onMouseMoved,
  clientRect,
}: SlashSuggestionPopupProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement | null>>(new Map());
  const sidePanelRef = useRef<HTMLDivElement>(null);
  const [sidePanelOffset, setSidePanelOffset] = useState(0);

  const rows = useGroupedItems(items);

  useEffect(() => {
    if (selectionSource !== 'keyboard') return;
    const el = itemRefs.current.get(selectedIndex);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, selectionSource]);

  const selectedItem = items[selectedIndex] as SlashItem | undefined;

  useLayoutEffect(() => {
    const itemEl = itemRefs.current.get(selectedIndex);
    const container = containerRef.current;
    const panel = sidePanelRef.current;
    if (!itemEl || !container || !panel) return;

    const containerRect = container.getBoundingClientRect();
    const itemRect = itemEl.getBoundingClientRect();
    const centerY = itemRect.top + itemRect.height / 2 - containerRect.top;

    const panelHeight = panel.offsetHeight;
    const containerHeight = container.offsetHeight;

    let offset = centerY - panelHeight / 2;
    offset = Math.max(0, offset);
    offset = Math.min(offset, containerHeight - panelHeight);

    setSidePanelOffset(offset);
  }, [selectedIndex, selectedItem]);

  if (items.length === 0) {
    return (
      <SuggestionPopupContainer clientRect={clientRect} ref={containerRef}>
        <div className="px-2 py-1 text-muted-foreground text-xs">
          No commands
        </div>
      </SuggestionPopupContainer>
    );
  }

  return (
    <SuggestionPopupContainer
      clientRect={clientRect}
      ref={containerRef}
      onMouseMove={onMouseMoved}
      sidePanel={
        selectedItem?.expandGroup && selectedItem.hiddenItems?.length ? (
          <ShowMoreSidePanel
            ref={sidePanelRef}
            offset={sidePanelOffset}
            hiddenItems={selectedItem.hiddenItems}
            panelIndex={panelIndex}
            isPanelFocused={isPanelFocused}
            selectionSource={selectionSource}
            onSelectPanelItem={onSelect}
            onHoverPanelIndex={onHoverPanelIndex}
          />
        ) : selectedItem?.description && !selectedItem.expandGroup ? (
          <SuggestionSidePanel ref={sidePanelRef} offset={sidePanelOffset}>
            <span className="font-medium text-foreground text-xs">
              /{selectedItem.label}
            </span>
            <span className="text-subtle-foreground text-xs leading-relaxed">
              {selectedItem.description}
            </span>
          </SuggestionSidePanel>
        ) : null
      }
    >
      {rows.map((row) => {
        if (row.type === 'header') {
          return (
            <div
              key={`hdr-${row.label}`}
              className="mt-1 px-2 pt-1 pb-0.5 font-normal text-subtle-foreground text-xs first:mt-0"
            >
              {row.label}
            </div>
          );
        }
        return (
          <SlashSuggestionItem
            key={row.item.id}
            item={row.item}
            isSelected={row.flatIndex === selectedIndex}
            onSelect={() => onSelect(row.item)}
            onMouseEnter={() => onHoverIndex(row.flatIndex)}
            onRef={(el) => {
              itemRefs.current.set(row.flatIndex, el);
            }}
          />
        );
      })}
    </SuggestionPopupContainer>
  );
}
