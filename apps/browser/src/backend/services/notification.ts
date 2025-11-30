/**
 * This file hosts the Notification service.
 * The notification service is responsible for sending notifications to the user through toasts.
 * The user can dismiss notifications or notifications are automatically dismissed after a certain time.
 */

import type { Logger } from './logger';
import type { KartonService } from './karton';
import { randomUUID } from 'node:crypto';

export interface Notification {
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error';
  duration?: number; // Duration in milliseconds. Will never auto-dismiss if not set.
  actions: {
    label: string;
    onClick: () => void;
    type: 'primary' | 'secondary' | 'destructive';
  }[]; // Allows up to three actions. Every action except for the first will be rendered as secondary. More than three actions will be ignored. Clicking on an action will also dismiss the notification.
}

export type NotificationId = string;

export class NotificationService {
  logger: Logger;
  uiKarton: KartonService;
  storedNotifications: { [key: string]: Notification } = {};

  private constructor(logger: Logger, uiKarton: KartonService) {
    this.logger = logger;
    this.uiKarton = uiKarton;
  }

  private initialize() {
    this.uiKarton.registerServerProcedureHandler(
      'notifications.dismiss',
      async (id) => {
        this.dismissNotification(id);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'notifications.triggerAction',
      async (id, actionIndex) => {
        this.handleActionTrigger(id, actionIndex);
      },
    );
  }

  public static async create(logger: Logger, uiKarton: KartonService) {
    const instance = new NotificationService(logger, uiKarton);
    instance.initialize();
    return instance;
  }

  // TODO Implement this service and it's connection to the UI via Karton.
  public showNotification(notification: Notification): NotificationId {
    this.logger.debug(
      `NotificationService] Showing notification with title "${notification.title}"`,
    );
    const id = randomUUID();

    this.storedNotifications[id] = notification;

    this.uiKarton.setState((draft) => {
      draft.notifications.push({
        id,
        ...notification,
      });
    });

    if (notification.duration) {
      setTimeout(() => {
        this.dismissNotification(id);
      }, notification.duration);
    }

    return id;
  }

  public dismissNotification(id: NotificationId) {
    if (!this.storedNotifications[id]) {
      this.logger.debug(
        `[NotificationService] Notification with ID "${id}" not found`,
      );
      return;
    }

    this.logger.debug(
      `NotificationService] Dismissing notification with title "${this.storedNotifications[id].title}"`,
    );

    this.uiKarton.setState((draft) => {
      const index = draft.notifications.findIndex((n) => n.id === id);
      if (index !== -1) {
        draft.notifications.splice(index, 1);
      }
    });
    delete this.storedNotifications[id];
  }

  handleActionTrigger(id: NotificationId, actionIndex: number) {
    const notification = this.storedNotifications[id];

    if (!notification) {
      this.logger.debug(
        `NotificationService] Notification with ID "${id}" not found`,
      );
      return;
    }

    this.logger.debug(
      `NotificationService] Triggering action with index "${actionIndex}" for notification with title "${notification.title}"`,
    );
    notification.actions[actionIndex]?.onClick();
  }
}
