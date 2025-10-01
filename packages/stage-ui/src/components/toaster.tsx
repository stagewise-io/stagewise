'use client';

import { toast as sonnerToast } from 'sonner';
import { Button } from './button';
import { AlertCircleIcon, AlertTriangleIcon, XIcon } from 'lucide-react';
import { cn } from '../lib/utils';

export { Toaster } from 'sonner';

interface Notification {
  id: string;
  title: string | null;
  message: string | null;
  type: 'info' | 'warning' | 'error';
  duration?: number; // Duration in milliseconds. Will never auto-dismiss if not set.
  actions: {
    label: string;
    type: 'primary' | 'secondary' | 'destructive';
    onClick: () => void;
  }[]; // Allows up to three actions. Every action except for the first will be rendered as secondary. More than three actions will be ignored. Clicking on an action will also dismiss the notification.
}

export function toast(notification: Notification, onDismiss?: () => void) {
  return sonnerToast.custom(
    () => <Toast notification={notification} onDismiss={onDismiss} />,
    {
      id: notification.id,
      onDismiss: onDismiss,
      duration: notification.duration ?? 100000000,
    },
  );
}

export function dismiss(id: string | number) {
  sonnerToast.dismiss(id);
}

interface ToastProps {
  notification: Notification;
  onDismiss?: () => void;
}

/** A fully custom toast that still maintains the animations and interactions. */
function Toast({ notification, onDismiss }: ToastProps) {
  return (
    <div
      className={cn(
        'glass-body flex w-92 max-w-full flex-col items-stretch gap-1 rounded-xl bg-white/60 p-4 shadow-lg backdrop-blur-md dark:bg-black/60',
        notification.type === 'warning' &&
          'bg-yellow-100/60 dark:bg-yellow-800/60',
        notification.type === 'error' && 'bg-rose-100/60 dark:bg-rose-800/60',
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-2 right-2 z-10"
        onClick={onDismiss}
      >
        <XIcon className="size-4" />
      </Button>
      {(notification.type !== 'info' || notification.title) && (
        <div className="flex flex-row items-center gap-1.5">
          {notification.type === 'warning' && (
            <AlertTriangleIcon className="size-4" />
          )}
          {notification.type === 'error' && (
            <AlertCircleIcon className="size-4" />
          )}
          {notification.title && (
            <p className="font-semibold text-base text-foreground">
              {notification.title}
            </p>
          )}
        </div>
      )}
      <p className="text-muted-foreground text-sm">{notification.message}</p>
      {notification.actions.length > 0 && (
        <div className="flex w-full flex-row-reverse items-center justify-start gap-2">
          {notification.actions.map((action, index) => (
            <Button
              key={action.label}
              variant={index === 0 ? action.type : 'secondary'}
              size="sm"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
