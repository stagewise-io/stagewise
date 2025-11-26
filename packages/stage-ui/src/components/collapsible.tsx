import * as React from 'react';
import { Collapsible as CollapsibleBase } from '@base-ui-components/react/collapsible';
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
  const paddingClass = size === 'default' ? 'p-3' : 'px-1.5 py-1';
  const gapClass = size === 'default' ? 'gap-2' : 'gap-1';

  return (
    <CollapsibleBase.Trigger
      {...props}
      className={cn(
        'group flex w-full flex-row items-center justify-between font-medium text-sm transition-all duration-150 ease-out hover:bg-foreground/5 active:bg-foreground/10',
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
        'flex h-[var(--collapsible-panel-height)] flex-col justify-end overflow-hidden px-2 text-foreground text-sm transition-all ease-out data-[ending-style]:h-0 data-[starting-style]:h-0',
        props.className,
      )}
    >
      {children}
    </CollapsibleBase.Panel>
  );
};
