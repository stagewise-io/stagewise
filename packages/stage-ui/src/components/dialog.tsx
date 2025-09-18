import { Dialog as BaseDialog } from '@base-ui-components/react/dialog';
import { cn } from '../lib/utils';
import type { ComponentProps } from 'react';
import { Button } from './button';
import { XIcon } from 'lucide-react';

export const Dialog = BaseDialog.Root;

export const DialogTrigger = ({ children }: { children: React.ReactNode }) => {
  return <BaseDialog.Trigger render={() => <>{children}</>} />;
};

export type DialogContentProps = ComponentProps<typeof BaseDialog.Popup>;
export const DialogContent = ({
  children,
  className,
  ...props
}: DialogContentProps) => {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="fixed inset-0 bg-white/30 opacity-20 backdrop-blur-sm transition-all duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[ending-style]:backdrop-blur-none data-[starting-style]:backdrop-blur-none dark:bg-black/30" />
      <BaseDialog.Popup
        {...props}
        className={cn(
          'glass-body h-full w-full rounded-2xl bg-white/60 shadow-xl backdrop-blur-lg sm:h-fit sm:w-fit sm:min-w-lg md:min-w-xl',
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
      className={cn('font-semibold text-lg leading-none', className)}
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
