import type { ReactNode } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { IconXmarkOutline18 } from 'nucleo-ui-outline-18';

/**
 * Shared container for sidebar toast/badge components.
 *
 * Provides the standardized visual wrapper (subtle background, ring,
 * elevation) and an optional dismiss button rendered
 * top-right. Content is passed as children.
 *
 * Pass `dismissable={false}` to hide the close button (e.g. when the
 * toast has action buttons that handle dismissal instead).
 */
type SidebarToastProps = {
  /** Accessible label for the dismiss button. */
  dismissLabel?: string;
  /** Called when the dismiss button is clicked. Omit to hide the button. */
  onDismiss?: () => void;
  /** Extra classes merged onto the container. */
  className?: string;
  children: ReactNode;
};

export function SidebarToast({
  dismissLabel = 'Dismiss',
  onDismiss,
  className,
  children,
}: SidebarToastProps) {
  return (
    <div
      className={cn(
        'relative flex shrink-0 flex-col gap-2 rounded-md bg-background/60 p-2.5 shadow-elevation-1 ring-1 ring-derived-subtle dark:bg-surface-1/60',
        className,
      )}
    >
      {onDismiss && (
        <Button
          variant="ghost"
          size="icon-2xs"
          className="absolute top-1.5 right-1.5 z-10 shrink-0"
          aria-label={dismissLabel}
          onClick={onDismiss}
        >
          <IconXmarkOutline18 className="size-3" />
        </Button>
      )}
      {children}
    </div>
  );
}
