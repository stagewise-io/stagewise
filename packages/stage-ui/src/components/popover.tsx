import { Popover as PopoverBase } from '@base-ui-components/react/popover';
import { cn } from '../lib/utils';
import { Button } from './button';
import { XIcon } from 'lucide-react';
import type { ReactElement } from 'react';

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
>;

export const PopoverContent = ({ children, ...props }: PopoverContentProps) => {
  return (
    <PopoverBase.Portal>
      <PopoverBase.Positioner sideOffset={4}>
        <PopoverBase.Popup
          {...props}
          className="glass-body flex flex-col gap-2 rounded-2xl bg-white/40 p-3 shadow-lg backdrop-blur-sm transition-all duration-150 ease-out data-[side=bottom]:origin-top data-[side=left]:origin-right data-[side=right]:origin-left data-[side=top]:origin-bottom data-[ending-style]:scale-75 data-[starting-style]:scale-75 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[ending-style]:blur-sm data-[starting-style]:blur-sm dark:bg-black/60"
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
      className={cn('font-semibold text-base text-foreground', className)}
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
      className={cn('text-muted-foreground text-sm', className)}
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
      render={() => (
        <Button
          variant="ghost"
          size="icon-xs"
          {...props}
          className={cn('absolute top-2 right-2', className)}
        >
          <XIcon />
        </Button>
      )}
    />
  );
};
