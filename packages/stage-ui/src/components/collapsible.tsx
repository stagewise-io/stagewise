import * as React from 'react';
import { Collapsible as CollapsibleBase } from '@base-ui/react/collapsible';
import { cn } from '../lib/utils';

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
  const paddingClass = size === 'default' ? 'py-3 px-0' : 'px-0 py-1'; // TODO: Decide on a final style here
  const gapClass = size === 'default' ? 'gap-2' : 'gap-1';

  return (
    <CollapsibleBase.Trigger
      {...props}
      className={cn(
        'group flex w-full flex-row items-center justify-between rounded-lg font-medium text-muted-foreground text-sm hover:text-foreground active:text-foreground',
        paddingClass,
        gapClass,
        props.className,
      )}
    >
      {children}
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
        'flex h-(--collapsible-panel-height) flex-col overflow-hidden px-2 text-foreground text-sm transition-[height] duration-50 ease-in-out data-ending-style:h-0! data-starting-style:h-0!',
        props.className,
      )}
    >
      {children}
    </CollapsibleBase.Panel>
  );
};
