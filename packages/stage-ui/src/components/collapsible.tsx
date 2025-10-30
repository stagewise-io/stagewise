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
      className={cn(
        'group w-full font-medium text-sm transition-all duration-150 ease-out hover:bg-black/5 active:bg-black/10 dark:active:bg-white/10 dark:hover:bg-white/5',
        paddingClass,
        props.className,
      )}
      {...props}
    >
      <div className={cn('flex flex-1 flex-row items-center', gapClass)}>
        {children}
      </div>
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
