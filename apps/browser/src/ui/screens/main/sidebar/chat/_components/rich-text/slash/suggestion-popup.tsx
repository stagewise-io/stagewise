import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { cn } from '@ui/utils';
import { TerminalSquareIcon } from 'lucide-react';
import { IconClipboardOutline18 } from 'nucleo-ui-outline-18';
import { SuggestionPopupContainer, SuggestionSidePanel } from '../shared';
import type { SlashItem } from './types';

/** Map of command IDs to their icon components. Falls back to TerminalSquareIcon. */
const COMMAND_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  plan: IconClipboardOutline18,
};

interface SlashSuggestionPopupProps {
  items: SlashItem[];
  selectedIndex: number;
  selectionSource: 'keyboard' | 'mouse';
  onSelect: (item: SlashItem) => void;
  onHoverIndex: (index: number) => void;
  onMouseMoved: () => void;
  clientRect: (() => DOMRect | null) | null;
}

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
  const Icon = COMMAND_ICONS[item.id] ?? TerminalSquareIcon;
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
      <Icon className="size-3 shrink-0 text-muted-foreground" />
      <span className="max-w-[60%] shrink-0 truncate font-medium">
        /{item.id}
      </span>
      {item.description && (
        <span className="min-w-0 truncate text-subtle-foreground text-xs">
          {item.description}
        </span>
      )}
    </button>
  );
}

export function SlashSuggestionPopup({
  items,
  selectedIndex,
  selectionSource,
  onSelect,
  onHoverIndex,
  onMouseMoved,
  clientRect,
}: SlashSuggestionPopupProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement | null>>(new Map());
  const sidePanelRef = useRef<HTMLDivElement>(null);
  const [sidePanelOffset, setSidePanelOffset] = useState(0);

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
        selectedItem?.description ? (
          <SuggestionSidePanel ref={sidePanelRef} offset={sidePanelOffset}>
            <span className="font-medium text-foreground text-xs">
              /{selectedItem.id}
            </span>
            <span className="text-subtle-foreground text-xs leading-relaxed">
              {selectedItem.description}
            </span>
          </SuggestionSidePanel>
        ) : null
      }
    >
      {items.map((item, idx) => (
        <SlashSuggestionItem
          key={item.id}
          item={item}
          isSelected={idx === selectedIndex}
          onSelect={() => onSelect(item)}
          onMouseEnter={() => onHoverIndex(idx)}
          onRef={(el) => {
            itemRefs.current.set(idx, el);
          }}
        />
      ))}
    </SuggestionPopupContainer>
  );
}
