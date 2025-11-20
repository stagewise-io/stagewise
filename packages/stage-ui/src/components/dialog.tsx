import { Dialog as BaseDialog } from '@base-ui-components/react/dialog';
import { cn } from '../lib/utils';
import type { ComponentProps, ReactElement } from 'react';
import { Button } from './button';
import { XIcon } from 'lucide-react';

export const Dialog = BaseDialog.Root;

export const DialogTrigger = ({ children }: { children: React.ReactNode }) => {
  return (
    <BaseDialog.Trigger render={children as unknown as () => ReactElement} />
  );
};

export type DialogContentProps = ComponentProps<typeof BaseDialog.Popup>;
export const DialogContent = ({
  children,
  className,
  ...props
}: DialogContentProps) => {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="fixed inset-0 z-40 size-full bg-black/10 backdrop-blur-xs transition-all duration-150 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[ending-style]:backdrop-blur-none data-[starting-style]:backdrop-blur-none dark:bg-black/50" />
      <BaseDialog.Popup
        {...props}
        className={cn(
          'app-no-drag -translate-x-1/2 -translate-y-1/2 glass-body glass-body-motion fixed top-1/2 left-1/2 z-40 flex h-full w-full flex-col items-stretch gap-6 bg-background/80 p-5 text-foreground backdrop-blur-lg duration-150 ease-out data-[ending-style]:origin-top data-[starting-style]:origin-bottom data-[ending-style]:scale-90 data-[starting-style]:scale-90 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[ending-style]:blur-sm data-[starting-style]:blur-sm sm:h-fit sm:w-fit sm:min-w-lg sm:rounded-3xl',
          className,
        )}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
};

export const DialogTitle = ({
  children,
  className,
  ...props
}: ComponentProps<typeof BaseDialog.Title>) => {
  return (
    <BaseDialog.Title
      className={cn(
        'font-semibold text-foreground text-lg leading-none',
        className,
      )}
      {...props}
    >
      {children}
    </BaseDialog.Title>
  );
};

export const DialogDescription = ({
  children,
  className,
  ...props
}: ComponentProps<typeof BaseDialog.Description>) => {
  return (
    <BaseDialog.Description
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    >
      {children}
    </BaseDialog.Description>
  );
};

export const DialogClose = ({
  className,
  ...props
}: Omit<
  React.ComponentProps<typeof BaseDialog.Close>,
  'render' | 'children'
>) => {
  return (
    <BaseDialog.Close
      render={
        <Button
          variant="ghost"
          size="icon-sm"
          {...props}
          className={cn('absolute top-2 right-2 z-10', className)}
        >
          <XIcon className="size-4" />
        </Button>
      }
    />
  );
};

export const DialogHeader = ({
  children,
  className,
  ...props
}: ComponentProps<'div'>) => {
  return (
    <div className={cn('mb-3 flex flex-col gap-2', className)} {...props}>
      {children}
    </div>
  );
};

export const DialogFooter = ({
  children,
  className,
  ...props
}: ComponentProps<'div'>) => {
  return (
    <div
      className={cn(
        'mt-3 flex flex-row-reverse items-center justify-start gap-2',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};
