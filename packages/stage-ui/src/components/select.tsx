import { Select as SelectBase } from '@base-ui/react/select';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { useMemo, type ComponentProps } from 'react';
import { cn } from '../lib/utils';

export type SelectSize = 'xs' | 'sm' | 'md';
export type SelectTriggerVariant = 'ghost' | 'secondary';

export type SelectProps = Omit<
  ComponentProps<typeof SelectBase.Root>,
  'children' | 'items'
> & {
  items: {
    value: string | null;
    label: string | React.ReactNode;
    icon?: React.ReactNode;
  }[];
  triggerClassName?: string;
  size?: SelectSize;
  triggerVariant?: SelectTriggerVariant;
};

const sizes = {
  trigger: {
    xs: 'h-6 gap-1 text-xs',
    sm: 'h-8 gap-1.5 text-sm',
    md: 'h-10 gap-2 text-sm',
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
    'bg-transparent text-muted-foreground hover:text-foreground data-popup-open:text-foreground',
  secondary:
    'border border-border bg-surface-1 text-foreground hover:bg-surface-2 active:bg-surface-3 data-popup-open:bg-surface-2',
} satisfies Record<SelectTriggerVariant, string>;

export const Select = ({
  items,
  triggerClassName,
  size = 'sm',
  triggerVariant = 'ghost',
  ...props
}: SelectProps) => {
  // convert items with icons to proper items that can be rendered everywhere
  const convertedItems = useMemo(() => {
    return items.map((item) => ({
      value: item.value as string,
      label: (
        <div
          className={cn(
            'flex flex-row items-center gap-2',
            size === 'xs' ? 'text-xs' : 'text-sm',
          )}
        >
          {item.icon && (
            <div className={cn('shrink-0', sizes.icon[size])}>{item.icon}</div>
          )}
          <span className="truncate">{item.label}</span>
        </div>
      ),
    })) as { value: string; label: React.ReactNode }[];
  }, [items, size]);

  return (
    <SelectBase.Root
      {...props}
      value={props.value as string | string[] | undefined}
      defaultValue={props.defaultValue as string | string[] | undefined}
      items={convertedItems}
    >
      <SelectBase.Trigger
        className={cn(
          'focus-visible:-outline-offset-2 inline-flex min-w-32 max-w-lg cursor-pointer items-center justify-between rounded-lg pr-1.5 pl-2 shadow-none transition-colors focus-visible:outline-1 focus-visible:outline-muted-foreground/35 has-disabled:pointer-events-none has-disabled:opacity-50',
          triggerVariants[triggerVariant],
          sizes.trigger[size],
          triggerClassName,
        )}
      >
        <SelectBase.Value className="truncate" />
        <SelectBase.Icon className="shrink-0">
          <ChevronDownIcon className={sizes.icon[size]} />
        </SelectBase.Icon>
      </SelectBase.Trigger>
      <SelectBase.Portal>
        <SelectBase.Positioner>
          <SelectBase.Popup
            className={cn(
              'flex origin-(--transform-origin) flex-col items-stretch gap-0.5',
              'rounded-lg border border-border-subtle bg-background p-1',
              'shadow-lg',
              'transition-[transform,scale,opacity] duration-150 ease-out',
              'data-ending-style:scale-90 data-starting-style:scale-90',
              'data-ending-style:opacity-0 data-starting-style:opacity-0',
              sizes.popup[size],
            )}
          >
            <SelectBase.ScrollUpArrow />
            {convertedItems.map((item) => (
              <SelectBase.Item
                key={item.value}
                value={item.value}
                className={cn(
                  'grid w-full min-w-(--anchor-width) cursor-default grid-cols-[0.75rem_1fr] items-center gap-2',
                  'rounded-md text-foreground outline-none',
                  'transition-colors duration-150 ease-out',
                  'hover:bg-surface-1 data-highlighted:bg-surface-1',
                  'group-data-[side=none]:min-w-[calc(var(--anchor-width)+1rem)] group-data-[side=none]:pr-12 group-data-[side=none]:text-base group-data-[side=none]:leading-4',
                  sizes.item[size],
                )}
              >
                <SelectBase.ItemIndicator className="col-start-1 shrink-0">
                  <CheckIcon className="size-full text-muted-foreground" />
                </SelectBase.ItemIndicator>

                <SelectBase.ItemText className="col-start-2 flex flex-row items-center gap-2">
                  {item.label}
                </SelectBase.ItemText>
              </SelectBase.Item>
            ))}
            <SelectBase.ScrollDownArrow />
          </SelectBase.Popup>
        </SelectBase.Positioner>
      </SelectBase.Portal>
    </SelectBase.Root>
  );
};
