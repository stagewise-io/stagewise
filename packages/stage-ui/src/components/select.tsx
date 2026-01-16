import { Select as SelectBase } from '@base-ui/react/select';
import * as React from 'react';
import { cn } from '../lib/utils';
import {
  IconCheckFill18,
  IconChevronDownFill18,
  IconChevronUpFill18,
} from 'nucleo-ui-fill-18';

// ============================================================================
// Types
// ============================================================================

export type SelectSize = 'xs' | 'sm' | 'md';
export type SelectTriggerVariant = 'ghost' | 'secondary';

/**
 * Simple item with string value and label
 */
export interface SelectItem<T = string | null> {
  value: T;
  label: React.ReactNode;
  /**
   * Optional label shown in the trigger when this item is selected.
   * If omitted, `label` is used. Useful when dropdown items have icons
   * or extra content that shouldn't appear in the trigger.
   */
  triggerLabel?: React.ReactNode;
  /**
   * Optional description shown below the label in the dropdown
   */
  description?: React.ReactNode;
  /**
   * Optional icon shown in the item row
   */
  icon?: React.ReactNode;
  /**
   * Whether the item is disabled
   */
  disabled?: boolean;
  /**
   * Optional group/section this item belongs to. Items with the same group
   * will be rendered together under a section header.
   */
  group?: string;
}

/**
 * Separator between items
 */
export interface SelectSeparator {
  type: 'separator';
}

export type SelectItemOrSeparator<T = string | null> =
  | SelectItem<T>
  | SelectSeparator;

/**
 * Check if item is a separator
 */
function isSeparator<T>(
  item: SelectItemOrSeparator<T>,
): item is SelectSeparator {
  return 'type' in item && item.type === 'separator';
}

// ============================================================================
// Component Props
// ============================================================================

export interface SelectProps<
  Value = string | null,
  Multiple extends boolean = false,
> {
  /**
   * Items to render in the select dropdown
   */
  items: Array<SelectItemOrSeparator<Value>>;

  /**
   * Controlled value of the select
   */
  value?: Multiple extends true ? Value[] : Value;

  /**
   * Default value when uncontrolled
   */
  defaultValue?: Multiple extends true ? Value[] : Value;

  /**
   * Callback when the value changes
   */
  onValueChange?: (
    value: Multiple extends true ? Value[] : Value,
    event: { event: Event | React.SyntheticEvent | undefined; reason: string },
  ) => void;

  /**
   * Whether multiple items can be selected
   * @default false
   */
  multiple?: Multiple;

  /**
   * Placeholder text when no value is selected
   */
  placeholder?: React.ReactNode;

  /**
   * Size variant of the select
   * @default 'md'
   */
  size?: SelectSize;

  /**
   * Visual variant of the trigger
   * @default 'secondary'
   */
  triggerVariant?: SelectTriggerVariant;

  /**
   * Custom className for the trigger element
   */
  triggerClassName?: string;

  /**
   * Custom className for the popup element
   */
  popupClassName?: string;

  /**
   * Custom className for item elements
   */
  itemClassName?: string;

  /**
   * Custom render function for the selected value display
   * Receives the current value (or array for multiple) and returns a ReactNode
   */
  renderValue?: (
    value: Multiple extends true ? Value[] : Value,
  ) => React.ReactNode;

  /**
   * Custom render function for each item in the dropdown
   * If provided, overrides the default item rendering
   */
  renderItem?: (item: SelectItem<Value>) => React.ReactNode;

  /**
   * Whether to show the chevron icon in the trigger
   * @default true
   */
  showIcon?: boolean;

  /**
   * Custom icon component for the trigger
   */
  icon?: React.ReactNode;

  /**
   * Which side of the trigger the popup should appear on.
   * @default 'bottom'
   */
  side?: 'top' | 'bottom' | 'left' | 'right';

  /**
   * Offset from the trigger in pixels.
   * @default 4
   */
  sideOffset?: number;

  /**
   * How to align the popup relative to the trigger.
   * @default 'start'
   */
  align?: 'start' | 'center' | 'end';

  /**
   * Whether to align the popup to overlap the trigger (default base-ui behavior)
   * Set to false to position the popup beside the trigger
   * @default false
   */
  alignItemWithTrigger?: boolean;

  /**
   * Whether the select is disabled
   */
  disabled?: boolean;

  /**
   * Whether the select is required
   */
  required?: boolean;

  /**
   * Whether the select is read-only
   */
  readOnly?: boolean;

  /**
   * Name attribute for form submission
   */
  name?: string;

  /**
   * Custom trigger render function. If provided, replaces the default trigger.
   * Receives trigger props that must be spread onto the clickable element.
   */
  customTrigger?: (
    triggerProps: React.ComponentPropsWithoutRef<'button'>,
  ) => React.ReactElement;

  /**
   * Whether the popup is open (controlled)
   */
  open?: boolean;

  /**
   * Default open state (uncontrolled)
   */
  defaultOpen?: boolean;

  /**
   * Callback when open state changes
   */
  onOpenChange?: (
    open: boolean,
    event: { event: Event | React.SyntheticEvent | undefined; reason: string },
  ) => void;

  /**
   * Whether the select is modal (locks scroll and focuses)
   * @default true
   */
  modal?: boolean;
}

// ============================================================================
// Style Configurations
// ============================================================================

const sizes = {
  trigger: {
    xs: 'gap-1 text-xs font-normal px-2 py-0.5',
    sm: 'gap-1 text-sm font-normal px-2.5 py-1',
    md: 'gap-1.5 text-sm font-normal px-3 py-2',
  } satisfies Record<SelectSize, string>,
  popup: {
    xs: 'text-xs',
    sm: 'text-sm',
    md: 'text-sm',
  } satisfies Record<SelectSize, string>,
  item: {
    xs: 'px-2 py-1',
    sm: 'px-2 py-1.5',
    md: 'px-2.5 py-2',
  } satisfies Record<SelectSize, string>,
  icon: {
    xs: 'size-3.5',
    sm: 'size-4',
    md: 'size-4',
  } satisfies Record<SelectSize, string>,
};

const triggerVariants = {
  ghost:
    'bg-transparent text-muted-foreground hover:text-foreground data-[popup-open]:text-foreground',
  secondary:
    'border border-derived bg-surface-1 text-foreground hover:bg-hover-derived active:bg-active-derived data-popup-open:bg-hover-derived',
} satisfies Record<SelectTriggerVariant, string>;

// ============================================================================
// Main Component
// ============================================================================

function SelectInner<Value = string | null, Multiple extends boolean = false>(
  {
    items,
    value,
    defaultValue,
    onValueChange,
    multiple = false as Multiple,
    placeholder = 'Select…',
    size = 'md',
    triggerVariant = 'secondary',
    triggerClassName,
    popupClassName,
    itemClassName,
    renderValue,
    renderItem,
    showIcon = true,
    icon,
    side = 'bottom',
    sideOffset = 4,
    align = 'start',
    alignItemWithTrigger = false,
    disabled,
    required,
    readOnly,
    name,
    customTrigger,
    open,
    defaultOpen,
    onOpenChange,
    modal,
  }: SelectProps<Value, Multiple>,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  // Filter out separators to get actual items
  const actualItems = React.useMemo(
    () => items.filter((item): item is SelectItem<Value> => !isSeparator(item)),
    [items],
  );

  // Convert items to base-ui format for value lookup
  const convertedItems = React.useMemo(() => {
    return actualItems.map((item) => ({
      value: item.value,
      label: typeof item.label === 'string' ? item.label : String(item.value),
    }));
  }, [actualItems]);

  // Create a map for quick label lookup
  const valueToItem = React.useMemo(() => {
    const map = new Map<Value, SelectItem<Value>>();
    for (const item of actualItems) {
      map.set(item.value, item);
    }
    return map;
  }, [actualItems]);

  // Group items by their `group` property
  const groupedItems = React.useMemo(() => {
    const result: Array<{
      group: string | undefined;
      items: Array<SelectItemOrSeparator<Value>>;
    }> = [];

    let currentGroup: string | undefined;
    let currentItems: Array<SelectItemOrSeparator<Value>> = [];

    for (const item of items) {
      if (isSeparator(item)) {
        // Separators get added to current group
        currentItems.push(item);
        continue;
      }

      if (item.group !== currentGroup) {
        if (currentItems.length > 0) {
          result.push({ group: currentGroup, items: currentItems });
        }
        currentGroup = item.group;
        currentItems = [item];
      } else {
        currentItems.push(item);
      }
    }

    if (currentItems.length > 0) {
      result.push({ group: currentGroup, items: currentItems });
    }

    return result;
  }, [items]);

  // Default value rendering
  const defaultRenderValue = React.useCallback(
    (val: Multiple extends true ? Value[] : Value) => {
      if (multiple && Array.isArray(val)) {
        if (val.length === 0) return placeholder;

        const firstItem = valueToItem.get(val[0]);
        const firstLabel =
          firstItem?.triggerLabel ?? firstItem?.label ?? String(val[0]);

        if (val.length === 1) return firstLabel;

        return (
          <span>
            {firstLabel}{' '}
            <span className="text-muted-foreground">(+{val.length - 1})</span>
          </span>
        );
      }

      const item = valueToItem.get(val as Value);
      if (!item) return placeholder;

      return item.triggerLabel ?? item.label;
    },
    [valueToItem, multiple, placeholder],
  );

  // Render a single item
  const renderItemContent = React.useCallback(
    (item: SelectItem<Value>) => {
      if (renderItem) {
        return renderItem(item);
      }

      const hasDescription = !!item.description;

      return (
        <div className="flex flex-col gap-0.5">
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
          {hasDescription && (
            <span className="truncate text-muted-foreground text-xs leading-normal">
              {item.description}
            </span>
          )}
        </div>
      );
    },
    [renderItem, size],
  );

  return (
    <SelectBase.Root
      value={value as any}
      defaultValue={defaultValue as any}
      onValueChange={onValueChange as any}
      multiple={multiple as any}
      disabled={disabled}
      required={required}
      readOnly={readOnly}
      name={name}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange as any}
      modal={modal}
      items={convertedItems as any}
    >
      {customTrigger ? (
        <SelectBase.Trigger
          ref={ref}
          render={(props) =>
            customTrigger(props as React.ComponentPropsWithoutRef<'button'>)
          }
        />
      ) : (
        <SelectBase.Trigger
          ref={ref}
          className={cn(
            'inline-flex max-w-full cursor-pointer items-center justify-between rounded-lg p-0',
            'shadow-none transition-colors',
            'focus-visible:-outline-offset-2 focus-visible:outline-1 focus-visible:outline-muted-foreground/35',
            'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
            triggerVariants[triggerVariant],
            sizes.trigger[size],
            triggerClassName,
          )}
        >
          <SelectBase.Value className="truncate data-[placeholder]:text-muted-foreground">
            {(val) => {
              if (
                val === null ||
                val === undefined ||
                (Array.isArray(val) && val.length === 0)
              ) {
                return (
                  <span className="text-muted-foreground">{placeholder}</span>
                );
              }

              if (renderValue) {
                return renderValue(
                  val as Multiple extends true ? Value[] : Value,
                );
              }

              return defaultRenderValue(
                val as Multiple extends true ? Value[] : Value,
              );
            }}
          </SelectBase.Value>

          {showIcon && (
            <SelectBase.Icon className="shrink-0">
              {icon ?? <IconChevronDownFill18 className={sizes.icon[size]} />}
            </SelectBase.Icon>
          )}
        </SelectBase.Trigger>
      )}

      <SelectBase.Portal>
        <SelectBase.Positioner
          side={side}
          sideOffset={sideOffset}
          align={align}
          alignItemWithTrigger={alignItemWithTrigger}
          className="z-50"
        >
          <SelectBase.Popup
            className={cn(
              'flex origin-(--transform-origin) flex-col items-stretch gap-0.5',
              'rounded-lg border border-derived bg-background p-1 shadow-lg',
              'transition-[transform,scale,opacity] duration-150 ease-out',
              'data-[ending-style]:scale-90 data-[ending-style]:opacity-0',
              'data-[starting-style]:scale-90 data-[starting-style]:opacity-0',
              sizes.popup[size],
              popupClassName,
            )}
          >
            <SelectBase.ScrollUpArrow className="-ml-1 top-0 z-1 flex h-5 w-full shrink-0 items-center justify-center rounded-t-md bg-background text-muted-foreground">
              <IconChevronUpFill18 className="size-3" />
            </SelectBase.ScrollUpArrow>

            <SelectBase.List className="scrollbar-hover-only flex max-h-48 flex-col gap-0.5 overflow-y-auto">
              {groupedItems.map(({ group, items: groupItems }, groupIndex) => (
                <React.Fragment key={group ?? `ungrouped-${groupIndex}`}>
                  {group && (
                    <div className="sticky top-0 shrink-0 bg-background px-2 py-1 font-normal text-muted-foreground/60 text-xs">
                      {group}
                    </div>
                  )}
                  {groupItems.map((item, itemIndex) => {
                    if (isSeparator(item)) {
                      return (
                        <SelectBase.Separator
                          // biome-ignore lint/suspicious/noArrayIndexKey: <we need to use the index to ensure the separator is unique>
                          key={`separator-${groupIndex}-${itemIndex}`}
                          className="my-1 h-px shrink-0 bg-border-subtle"
                        />
                      );
                    }

                    const hasDescription = !!item.description;

                    return (
                      <SelectBase.Item
                        key={String(item.value)}
                        value={item.value as any}
                        disabled={item.disabled}
                        className={cn(
                          'grid w-full min-w-24 shrink-0 cursor-default select-none gap-2 rounded-md outline-none',
                          'grid-cols-[0.75rem_1fr]',
                          'text-foreground transition-colors duration-150 ease-out',
                          'hover:bg-surface-1 data-[highlighted]:bg-surface-1',
                          'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                          hasDescription ? 'items-start' : 'items-center',
                          sizes.item[size],
                          itemClassName,
                        )}
                      >
                        <SelectBase.ItemIndicator
                          className={cn(
                            'col-start-1 shrink-0',
                            hasDescription && 'mt-0.5',
                          )}
                        >
                          <IconCheckFill18 className="size-full text-muted-foreground" />
                        </SelectBase.ItemIndicator>

                        <SelectBase.ItemText className="col-start-2">
                          {renderItemContent(item)}
                        </SelectBase.ItemText>
                      </SelectBase.Item>
                    );
                  })}
                </React.Fragment>
              ))}
            </SelectBase.List>

            <SelectBase.ScrollDownArrow className="-ml-1 bottom-0 z-1 flex h-5 w-full shrink-0 items-center justify-center rounded-b-md bg-background text-muted-foreground">
              <IconChevronDownFill18 className="size-3" />
            </SelectBase.ScrollDownArrow>
          </SelectBase.Popup>
        </SelectBase.Positioner>
      </SelectBase.Portal>
    </SelectBase.Root>
  );
}

// Forward ref with generic support
export const Select = React.forwardRef(SelectInner) as <
  Value = string | null,
  Multiple extends boolean = false,
>(
  props: SelectProps<Value, Multiple> & {
    ref?: React.ForwardedRef<HTMLButtonElement>;
  },
) => React.ReactElement;

// Display name for debugging
(Select as React.FC).displayName = 'Select';
