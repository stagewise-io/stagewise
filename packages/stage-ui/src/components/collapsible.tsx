import * as React from 'react';
import { Collapsible as CollapsibleBase } from '@base-ui-components/react/collapsible';
import { cn } from '../lib/utils';
import { ChevronDown } from 'lucide-react';

export const Collapsible = CollapsibleBase.Root;

type CollapsibleTriggerProps = Omit<
  React.ComponentProps<typeof CollapsibleBase.Trigger>,
  'render'
> & {
  children: React.ReactNode;
  size: 'default' | 'condensed';
};

export const CollapsibleTrigger = ({
  children,
  size,
  ...props
}: CollapsibleTriggerProps) => {
  return (
    <CollapsibleBase.Trigger
      className={cn(
        'group flex flex-row items-center justify-between font-medium text-sm transition-all duration-150 ease-out hover:bg-black/5 active:bg-black/10 dark:active:bg-white/10 dark:hover:bg-white/5',
        size === 'default' ? 'gap-2 p-3' : 'gap-1 px-1.5 py-1',
        props.className,
      )}
      {...props}
    >
      <div className="flex flex-1 flex-row items-center gap-2">{children}</div>
      <ChevronDown
        className={cn(
          size === 'default' ? 'size-4' : 'size-3',
          'shrink-0 text-zinc-500 opacity-50 transition-transform duration-150 ease-out group-hover:opacity-100 group-data-[panel-open]:rotate-180',
        )}
      />
    </CollapsibleBase.Trigger>
  );
};

type CollapsibleContentProps = Omit<
  React.ComponentProps<typeof CollapsibleBase.Panel>,
  'render'
> & {
  children: React.ReactNode;
};
export const CollapsibleContent = ({
  children,
  ...props
}: CollapsibleContentProps) => {
  return (
    <CollapsibleBase.Panel
      {...props}
      className={cn(
        'flex h-[var(--collapsible-panel-height)] flex-col justify-end overflow-hidden p-2 text-foreground text-sm transition-all ease-out data-[ending-style]:h-0 data-[starting-style]:h-0',
        props.className,
      )}
    >
      {children}
    </CollapsibleBase.Panel>
  );
};
