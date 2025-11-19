import { Popover as PopoverBase } from '@base-ui-components/react/popover';
import { cn } from '../lib/utils';
import { Button } from './button';
import { XIcon } from 'lucide-react';
import type { ComponentProps, ReactElement } from 'react';

<PopoverBase.Root>
  <PopoverBase.Trigger />
  <PopoverBase.Portal>
    <PopoverBase.Backdrop />
    <PopoverBase.Positioner>
      <PopoverBase.Popup>
        <PopoverBase.Arrow />
        <PopoverBase.Title />
        <PopoverBase.Description />
        <PopoverBase.Close />
      </PopoverBase.Popup>
    </PopoverBase.Positioner>
  </PopoverBase.Portal>
</PopoverBase.Root>;

export const Popover = PopoverBase.Root;

export type PopoverTriggerProps = Omit<
  React.ComponentProps<typeof PopoverBase.Trigger>,
  'render'
> & { children: ReactElement };
export const PopoverTrigger = ({ children, ...props }: PopoverTriggerProps) => {
  return (
    <PopoverBase.Trigger
      {...props}
      render={children as unknown as () => ReactElement}
    />
  );
};

export type PopoverContentProps = React.ComponentProps<
  typeof PopoverBase.Popup
> &
  React.ComponentProps<typeof PopoverBase.Positioner>;

export const PopoverContent = ({
  children,
  className,
  side,
  sideOffset,
  align,
  alignOffset,
  sticky,
  ...props
}: PopoverContentProps) => {
  return (
    <PopoverBase.Portal>
      <PopoverBase.Positioner
        sideOffset={sideOffset ?? 4}
        side={side}
        align={align}
        alignOffset={alignOffset}
        sticky={sticky}
        className="z-50"
      >
        <PopoverBase.Popup
          {...props}
          className={cn(
            'glass-body flex max-w-80 flex-col gap-4 rounded-3xl bg-background/80 p-3 text-foreground shadow-xl backdrop-blur-sm transition-all duration-150 ease-out data-[side=bottom]:origin-top data-[side=left]:origin-right data-[side=right]:origin-left data-[side=top]:origin-bottom data-[ending-style]:scale-75 data-[starting-style]:scale-75 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[ending-style]:blur-sm data-[starting-style]:blur-sm',
            className,
          )}
        >
          {children}
        </PopoverBase.Popup>
      </PopoverBase.Positioner>
    </PopoverBase.Portal>
  );
};

export type PopoverTitleProps = React.ComponentProps<typeof PopoverBase.Title>;
export const PopoverTitle = ({
  children,
  className,
  ...props
}: PopoverTitleProps) => {
  return (
    <PopoverBase.Title
      {...props}
      className={cn('mr-8 font-semibold text-base text-foreground', className)}
    >
      {children}
    </PopoverBase.Title>
  );
};
export type PopoverDescriptionProps = React.ComponentProps<
  typeof PopoverBase.Description
>;
export const PopoverDescription = ({
  children,
  className,
  ...props
}: PopoverDescriptionProps) => {
  return (
    <PopoverBase.Description
      {...props}
      className={cn(
        '-mt-3 text-muted-foreground text-sm first:mt-0',
        className,
      )}
    >
      {children}
    </PopoverBase.Description>
  );
};

export type PopoverCloseProps = Omit<
  React.ComponentProps<typeof PopoverBase.Close>,
  'render' | 'children'
>;
export const PopoverClose = ({ className, ...props }: PopoverCloseProps) => {
  return (
    <PopoverBase.Close
      render={
        <Button
          variant="ghost"
          size="icon-xs"
          {...props}
          className={cn(
            'absolute top-2.5 right-2.5 text-muted-foreground',
            className,
          )}
        >
          <XIcon className="size-4" />
        </Button>
      }
    />
  );
};

export const PopoverFooter = ({
  className,
  ...props
}: ComponentProps<'div'>) => {
  return (
    <div
      className={cn(
        'mt-1 flex h-fit w-full flex-row-reverse items-center justify-start gap-2 text-foreground',
        className,
      )}
      {...props}
    />
  );
};
