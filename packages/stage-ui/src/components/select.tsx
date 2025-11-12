import { Select as SelectBase } from '@base-ui-components/react/select';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { useMemo, type ComponentProps } from 'react';
import { cn } from '../lib/utils';

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
};

export const Select = ({ items, triggerClassName, ...props }: SelectProps) => {
  // convert items with icons to proper items that can be rendered everywhere
  const convertedItems = useMemo(() => {
    return items.map((item) => ({
      value: item.value as string,
      label: (
        <div className="flex flex-row items-center justify-between gap-4 text-sm">
          <span className="truncate last:pr-4">{item.label}</span>
          {item.icon && <div className="size-4">{item.icon}</div>}
        </div>
      ),
    })) as { value: string; label: React.ReactNode }[];
  }, [items]);

  return (
    <SelectBase.Root
      {...props}
      value={props.value as string | string[] | undefined}
      defaultValue={props.defaultValue as string | string[] | undefined}
      items={convertedItems}
    >
      <SelectBase.Trigger
        className={cn(
          'glass-inset flex h-8 min-w-32 max-w-lg flex-row items-center justify-between gap-4 rounded-lg pr-1.5 pl-2 text-foreground has-disabled:before:bg-transparent has-disabled:before:opacity-50',
          triggerClassName,
        )}
      >
        <SelectBase.Value />
        <SelectBase.Icon className="shrink-0">
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </SelectBase.Icon>
      </SelectBase.Trigger>
      <SelectBase.Portal>
        <SelectBase.Positioner>
          <SelectBase.Popup className="glass-body glass-body-motion flex origin-[var(--transform-origin)] flex-col items-stretch gap-0.5 rounded-lg bg-white/60 p-1 shadow-lg backdrop-blur-xs transition-[transform,scale,opacity] duration-150 ease-out data-[ending-style]:scale-90 data-[starting-style]:scale-90 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 dark:bg-black/60">
            <SelectBase.ScrollUpArrow />
            {convertedItems.map((item) => (
              <SelectBase.Item
                key={item.value}
                value={item.value}
                className="grid w-full min-w-24 min-w-[var(--anchor-width)] cursor-default grid-cols-[0.75rem_1fr] flex-row items-center justify-start gap-2 rounded-md px-2 py-1.5 text-foreground text-sm transition-all duration-150 ease-out hover:bg-black/5 hover:pr-1.75 hover:pl-2.25 group-data-[side=none]:min-w-[calc(var(--anchor-width)+1rem)] group-data-[side=none]:pr-12 group-data-[side=none]:text-base group-data-[side=none]:leading-4 dark:hover:bg-white/5"
              >
                <SelectBase.ItemIndicator className="col-start-1 shrink-0">
                  <CheckIcon className="w-full text-muted-foreground" />
                </SelectBase.ItemIndicator>

                <SelectBase.ItemText className="col-start-2 flex flex-row items-center justify-between gap-4">
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
