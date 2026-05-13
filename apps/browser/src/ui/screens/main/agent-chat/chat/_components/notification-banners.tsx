import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { Button } from '@stagewise/stage-ui/components/button';
import { cn } from '@stagewise/stage-ui/lib/utils';
import {
  IconTriangleWarningOutline18,
  IconCircleInfoOutline18,
} from 'nucleo-ui-outline-18';
import { IconXmark } from 'nucleo-micro-bold';

export function NotificationBanners() {
  const notifications = useKartonState((s) => s.notifications);
  const triggerAction = useKartonProcedure(
    (s) => s.notifications.triggerAction,
  );
  const dismissNotification = useKartonProcedure(
    (s) => s.notifications.dismiss,
  );

  if (notifications.length === 0) return null;

  return (
    <div className="flex shrink-0 flex-col gap-2">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={cn(
            'relative flex shrink-0 flex-col gap-1.5 rounded-md bg-background/60 p-2.5 shadow-elevation-1 ring-1 ring-derived-strong backdrop-blur-xl dark:bg-surface-1/60',
          )}
        >
          <div className="flex flex-row items-start gap-2">
            <NotificationIcon type={notification.type} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {notification.title && (
                <p
                  className={cn(
                    'font-medium text-xs',
                    notification.type === 'warning' &&
                      'text-warning-foreground',
                    notification.type === 'error' && 'text-error-foreground',
                    notification.type === 'info' && 'text-foreground',
                  )}
                >
                  {notification.title}
                </p>
              )}
              {notification.message && (
                <p className="text-muted-foreground text-xs">
                  {notification.message}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon-2xs"
              className="ml-auto shrink-0"
              aria-label="Dismiss notification"
              onClick={() => dismissNotification(notification.id)}
            >
              <IconXmark className="size-3" />
            </Button>
          </div>
          {notification.actions.length > 0 && (
            <div className="flex flex-row-reverse items-center gap-2">
              {notification.actions.slice(0, 3).map((action, index) => (
                <Button
                  key={action.label}
                  variant={index === 0 ? action.type : 'ghost'}
                  size="xs"
                  onClick={() => {
                    triggerAction(notification.id, index);
                    dismissNotification(notification.id);
                  }}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function NotificationIcon({ type }: { type: string }) {
  switch (type) {
    case 'warning':
    case 'error':
      return (
        <IconTriangleWarningOutline18
          className={cn(
            'mt-0.5 size-3.5 shrink-0',
            type === 'warning'
              ? 'text-warning-foreground'
              : 'text-error-foreground',
          )}
        />
      );
    case 'info':
    default:
      return (
        <IconCircleInfoOutline18 className="mt-0.5 size-3.5 shrink-0 text-foreground" />
      );
  }
}
