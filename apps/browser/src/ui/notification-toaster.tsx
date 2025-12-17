import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import { useState, useEffect } from 'react';
import {
  toast,
  dismiss,
  Toaster,
} from '@stagewise/stage-ui/components/toaster';

export function NotificationToaster() {
  const notifications = useKartonState((s) => s.notifications);
  const triggerAction = useKartonProcedure(
    (s) => s.notifications.triggerAction,
  );
  const dismissNotification = useKartonProcedure(
    (s) => s.notifications.dismiss,
  );

  const [renderedNotificationIds, setRenderedNotifications] = useState<
    string[]
  >([]);

  useEffect(() => {
    for (const notification of notifications) {
      if (renderedNotificationIds.includes(notification.id)) {
        continue;
      }
      toast(
        {
          ...notification,
          actions: notification.actions.map((action, index) => ({
            ...action,
            onClick: () => {
              triggerAction(notification.id, index);
              dismissNotification(notification.id);
            },
          })),
        },
        () => {
          dismissNotification(notification.id);
        },
      );
      setRenderedNotifications((prev) => [...prev, notification.id]);
    }

    for (const notificationId of renderedNotificationIds) {
      // Make sure that we dismiss all toasts that are already rendered.
      if (notifications.find((n) => n.id === notificationId)) {
        continue;
      }
      dismiss(notificationId);
    }
  }, [notifications, renderedNotificationIds, triggerAction]);

  return <Toaster position="bottom-right" swipeDirections={['bottom']} />;
}
