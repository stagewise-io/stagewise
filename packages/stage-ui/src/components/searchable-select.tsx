import { Select as SelectBase } from '@base-ui/react/select';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from '../lib/utils';

type SearchableSelectSize = 'xs' | 'sm' | 'md';

type SearchableSelectItem = {
  value: string | null;
  label: string | ReactNode;
  /**
   * Optional label shown in the trigger when this item is selected.
   * If omitted, `label` is used. Useful when dropdown items have icons
   * or extra content that shouldn't appear in the trigger.
   */
  triggerLabel?: string | ReactNode;
  icon?: ReactNode;
  /**
   * Content rendered in a side panel next to the select popup when this item
   * is hovered. Ignored if `tooltipComponent` is provided.
   */
  tooltipContent?: ReactNode;
  /**
   * Fully custom side panel wrapper. Receives the item row as `children`.
   * The component should handle its own hover state if needed.
   */
  tooltipComponent?: ComponentType<{
    children: ReactElement;
    item: SearchableSelectItem;
  }>;
  /**
   * Optional plain-text used for filtering. If omitted, `label` (when string)
   * is used; otherwise it falls back to `value`.
   */
  searchText?: string;
};

export type SearchableSelectProps = Omit<
  ComponentProps<typeof SelectBase.Root>,
  'children' | 'items'
> & {
  items: SearchableSelectItem[];
  triggerClassName?: string;
  size?: SearchableSelectSize;
  /**
   * Which side of the trigger the popup should appear on.
   * @default 'top'
   */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /**
   * Offset from the trigger in pixels.
   * @default 4
   */
  sideOffset?: number;
};

export const SearchableSelect = ({
  items,
  triggerClassName,
  size = 'xs',
  side = 'top',
  sideOffset = 4,
  ...props
}: SearchableSelectProps) => {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sidePanelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hoveredItem, setHoveredItem] = useState<SearchableSelectItem | null>(
    null,
  );
  const [itemCenterY, setItemCenterY] = useState(0);
  const [sidePanelOffset, setSidePanelOffset] = useState(0);

  const itemSearchText = useCallback((item: SearchableSelectItem) => {
    if (item.searchText) return item.searchText;
    if (typeof item.label === 'string') return item.label;
    return String(item.value ?? '');
  }, []);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return items;

    const filtered = items.filter((item) =>
      itemSearchText(item).toLowerCase().includes(q),
    );

    // Always include the currently selected item to prevent Base UI from resetting value
    const selectedValue = props.value;
    if (
      selectedValue &&
      !filtered.some((item) => item.value === selectedValue)
    ) {
      const selectedItem = items.find((item) => item.value === selectedValue);
      if (selectedItem) {
        filtered.unshift(selectedItem);
      }
    }

    return filtered;
  }, [items, itemSearchText, query, props.value]);

  // All items for Base UI's value management (ensures selection isn't lost during search)
  const allConvertedItems = useMemo(() => {
    return items.map((item) => ({
      value: String(item.value),
      label: itemSearchText(item),
    })) as { value: string; label: string }[];
  }, [items, itemSearchText]);

  const selectedValueToTriggerLabel = useMemo(() => {
    const map = new Map<string, ReactNode>();
    for (const item of items) {
      // Use triggerLabel if provided, otherwise fall back to label
      map.set(String(item.value), item.triggerLabel ?? item.label);
    }
    return map;
  }, [items]);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);
    return () => clearTimeout(id);
  }, [open]);

  // Recalculate side panel offset after render when we know the panel height
  useLayoutEffect(() => {
    if (!hoveredItem || !sidePanelRef.current || !containerRef.current) {
      return;
    }
    const panelHeight = sidePanelRef.current.offsetHeight;
    const containerHeight = containerRef.current.offsetHeight;

    // Center the panel on the item's center Y position
    let offset = itemCenterY - panelHeight / 2;

    // Clamp to container bounds
    offset = Math.max(0, offset);
    offset = Math.min(offset, containerHeight - panelHeight);

    setSidePanelOffset(offset);
  }, [hoveredItem, itemCenterY]);

  const handleItemHover = useCallback(
    (item: SearchableSelectItem, event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.currentTarget;
      const container = containerRef.current;
      if (!container) {
        setHoveredItem(item);
        return;
      }

      // Calculate the center of the hovered item relative to the container
      const containerRect = container.getBoundingClientRect();
      const itemRect = target.getBoundingClientRect();
      const centerY = itemRect.top + itemRect.height / 2 - containerRect.top;

      setItemCenterY(centerY);
      setHoveredItem(item);
    },
    [],
  );

  const onOpenChange = useCallback<
    NonNullable<ComponentProps<typeof SelectBase.Root>['onOpenChange']>
  >(
    (nextOpen, ...rest) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        setQuery('');
        setHoveredItem(null);
      }
      props.onOpenChange?.(nextOpen, ...rest);
    },
    [props],
  );

  const sizes = {
    trigger: {
      xs: 'h-4 gap-1 text-xs font-normal',
      sm: 'h-5 gap-1 text-sm font-normal',
      md: 'h-6 gap-1.5 text-sm font-normal',
    } satisfies Record<SearchableSelectSize, string>,
    popup: {
      xs: 'text-xs',
      sm: 'text-sm',
      md: 'text-sm',
    } satisfies Record<SearchableSelectSize, string>,
    item: {
      xs: 'px-2 py-1',
      sm: 'px-2 py-1.5',
      md: 'px-2.5 py-2',
    } satisfies Record<SearchableSelectSize, string>,
    icon: {
      xs: 'size-3.5',
      sm: 'size-4',
      md: 'size-4',
    } satisfies Record<SearchableSelectSize, string>,
  };

  return (
    <SelectBase.Root
      {...props}
      onOpenChange={onOpenChange}
      value={props.value as string | string[] | undefined}
      defaultValue={props.defaultValue as string | string[] | undefined}
      items={allConvertedItems}
    >
      <SelectBase.Trigger
        className={cn(
          'focus-visible:-outline-offset-2 inline-flex max-w-full cursor-default items-center justify-between bg-transparent p-0 text-muted-foreground shadow-none transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-muted-foreground/35 has-[*:disabled]:pointer-events-none has-[*:disabled]:opacity-50 data-[popup-open]:text-foreground',
          sizes.trigger[size],
          triggerClassName,
        )}
      >
        <SelectBase.Value className="truncate">
          {(value: string) => selectedValueToTriggerLabel.get(String(value))}
        </SelectBase.Value>
        <SelectBase.Icon className="shrink-0">
          <ChevronDownIcon className={sizes.icon[size]} />
        </SelectBase.Icon>
      </SelectBase.Trigger>
      <SelectBase.Portal>
        <SelectBase.Positioner
          side={side}
          sideOffset={sideOffset}
          align="start"
          alignItemWithTrigger={false}
        >
          <div
            ref={containerRef}
            className="relative flex flex-row items-start gap-1"
            onMouseLeave={() => setHoveredItem(null)}
          >
            <SelectBase.Popup
              className={cn(
                'glass-body glass-body-motion flex origin-(--transform-origin) flex-col items-stretch gap-0.5 rounded-lg bg-background/80 p-1 backdrop-blur-sm transition-[transform,scale,opacity] duration-150 ease-out data-[ending-style]:scale-90 data-[starting-style]:scale-90 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
                sizes.popup[size],
              )}
            >
              <div className="mb-1 rounded-md">
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className={cn(
                    'w-full rounded-md bg-transparent text-foreground placeholder:text-muted-foreground/70 focus:outline-none',
                    sizes.item[size],
                    size === 'xs' ? 'text-xs' : 'text-sm',
                  )}
                  onKeyDown={(e) => {
                    // prevent select typeahead from consuming input keystrokes
                    e.stopPropagation();
                  }}
                />
              </div>
              <SelectBase.ScrollUpArrow />
              {filteredItems.length === 0 && (
                <div className="px-2 py-1.5 text-muted-foreground text-xs">
                  No results
                </div>
              )}
              {filteredItems.map((item) => {
                const hasTooltip = !!(
                  item.tooltipContent || item.tooltipComponent
                );
                const Row = (
                  <SelectBase.Item
                    key={String(item.value)}
                    value={String(item.value)}
                    className={cn(
                      'grid w-full min-w-24 cursor-default grid-cols-[0.75rem_1fr] items-center gap-2 rounded-md text-foreground outline-none transition-colors duration-150 ease-out',
                      'data-highlighted:bg-foreground/5',
                      'hover:bg-foreground/5',
                      sizes.item[size],
                    )}
                    onMouseEnter={
                      hasTooltip ? (e) => handleItemHover(item, e) : undefined
                    }
                    // Prevent Base UI from stealing focus from search input
                    onFocus={() => searchInputRef.current?.focus()}
                  >
                    <SelectBase.ItemIndicator className="col-start-1 shrink-0">
                      <CheckIcon className="size-full text-muted-foreground" />
                    </SelectBase.ItemIndicator>

                    <SelectBase.ItemText className="col-start-2 flex flex-row items-center justify-between gap-4">
                      <div
                        className={cn(
                          'flex min-w-0 flex-row items-center gap-2',
                          size === 'xs' ? 'text-xs' : 'text-sm',
                        )}
                      >
                        <span className="truncate">{item.label}</span>
                        {item.icon && (
                          <div className="flex size-4 shrink-0 items-center justify-center">
                            {item.icon}
                          </div>
                        )}
                      </div>
                    </SelectBase.ItemText>
                  </SelectBase.Item>
                );

                // For custom tooltip components, wrap with a div for hover tracking
                if (item.tooltipComponent) {
                  const TooltipComponent = item.tooltipComponent;
                  return (
                    <TooltipComponent key={String(item.value)} item={item}>
                      {Row}
                    </TooltipComponent>
                  );
                }

                return Row;
              })}
              <SelectBase.ScrollDownArrow />
            </SelectBase.Popup>

            {/* Side panel for tooltip content */}
            {hoveredItem?.tooltipContent && (
              <div
                ref={sidePanelRef}
                className={cn(
                  'glass-body absolute left-full ml-1 flex max-w-64 flex-col gap-1 rounded-lg bg-background/80 p-2.5 text-foreground shadow-lg backdrop-blur-sm transition-[top] duration-100 ease-out',
                  'fade-in-0 slide-in-from-left-1 animate-in duration-150',
                  sizes.popup[size],
                )}
                style={{ top: sidePanelOffset }}
              >
                {hoveredItem.tooltipContent}
              </div>
            )}
          </div>
        </SelectBase.Positioner>
      </SelectBase.Portal>
    </SelectBase.Root>
  );
};
