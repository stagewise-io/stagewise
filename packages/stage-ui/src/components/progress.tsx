import { Progress as ProgressBase } from '@base-ui-components/react/progress';
import { cn } from '../lib/utils';
import type { ComponentProps, ReactNode } from 'react';

export type ProgressProps = ComponentProps<typeof ProgressBase.Root>;
export function Progress({ className, ...props }: ProgressProps) {
  return (
    <ProgressBase.Root
      className={cn('grid w-full grid-cols-2 gap-y-2', className)}
      {...props}
    />
  );
}

export type ProgressTrackProps = {
  variant?: 'normal' | 'warning';
  busy?: boolean; // Will be forced to true if value is undefined.
  slim?: boolean; // Will render a smaller progress bar that can be used in smaller ui components.
};
export function ProgressTrack({
  variant = 'normal',
  busy = false,
  slim = false,
}: ProgressTrackProps) {
  return (
    <ProgressBase.Track
      className={cn(
        'glass-body col-span-2 col-start-1 block overflow-hidden rounded-xl bg-background/50',
        slim ? 'h-1.5' : 'h-4',
      )}
    >
      <ProgressBase.Indicator
        className={cn(
          'glass-body relative h-full overflow-hidden rounded-md data-[indeterminate]:w-full',
          variant === 'warning' ? 'bg-yellow-500' : 'bg-primary',
        )}
      >
        <div
          className={cn(
            'top-0 right-0 h-full w-[calc(100%+100px)] bg-[repeating-linear-gradient(110deg,transparent,transparent_10px,white_30px,white_35px,transparent_50px)]',
            busy ? 'animate-progress-bar-indicator opacity-10' : 'opacity-0',
          )}
        />
      </ProgressBase.Indicator>
    </ProgressBase.Track>
  );
}

export type ProgressLabelProps = {
  className?: string;
};
export function ProgressLabel({ className }: ProgressLabelProps) {
  return (
    <ProgressBase.Label
      className={cn('font-medium text-foreground text-sm', className)}
    />
  );
}

export type ProgressValueProps = {
  children:
    | ((formattedValue: string | null, value: number | null) => ReactNode)
    | null
    | undefined;
  className?: string;
};
export function ProgressValue({ className, ...props }: ProgressValueProps) {
  return (
    <ProgressBase.Value
      className={cn(
        'col-start-2 text-right text-muted-foreground text-sm',
        className,
      )}
      {...props}
    />
  );
}
