import { Popover as PopoverBase } from '@base-ui/react/popover';
import { cn } from '../lib/utils';
import { Button } from './button';
import { XIcon } from 'lucide-react';
import type { ComponentProps, ReactElement } from 'react';

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
      <PopoverBase.Backdrop className="fixed inset-0 z-40 size-full" />
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
            'flex max-w-80 flex-col gap-3 p-2',
            'rounded-lg border border-border-subtle bg-background',
            'text-foreground shadow-lg',
            'transition-[transform,scale,opacity] duration-150 ease-out',
            'origin-(--transform-origin)',
            'data-ending-style:scale-90 data-starting-style:scale-90',
            'data-ending-style:opacity-0 data-starting-style:opacity-0',
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
      className={cn(
        'mr-8 font-semibold text-foreground text-sm leading-none',
        className,
      )}
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
      className={cn('text-muted-foreground text-xs', className)}
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
          size="icon-2xs"
          {...props}
          className={cn('absolute top-1.5 right-1.5', className)}
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
        'mt-0.5 flex h-fit w-full flex-row-reverse items-center justify-start gap-2',
        'text-foreground',
        className,
      )}
      {...props}
    />
  );
};
