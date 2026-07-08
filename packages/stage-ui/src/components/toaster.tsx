'use client';

import { toast as sonnerToast } from 'sonner';
import { Button } from './button';
import {
  IconTriangleWarningOutline18,
  IconCircleInfoOutline18,
} from '@stagewise/icons';
import { IconXmark } from '@stagewise/icons';
import { cn } from '../lib/utils';
import { PopoverFooter } from './popover';

export { Toaster } from 'sonner';

export interface Notification {
  id: string;
  title: string | null;
  message: string | null;
  type?: 'info' | 'warning' | 'error';
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

export interface ToastProps {
  notification: Notification;
  onDismiss?: () => void;
}

/** A fully custom toast that still maintains the animations and interactions. */
export function Toast({ notification, onDismiss }: ToastProps) {
  return (
    <div
      className={cn(
        'flex max-w-80 flex-col gap-1.5 rounded-xl bg-background px-3 pt-1.5 pb-3 text-foreground shadow-sm ring-1 ring-derived-strong transition-all duration-150 ease-out data-[side=bottom]:origin-top data-[side=left]:origin-right data-[side=right]:origin-left data-[side=top]:origin-bottom data-[ending-style]:scale-75 data-[starting-style]:scale-75 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[ending-style]:blur-sm data-[starting-style]:blur-sm',
      )}
    >
      <div
        className={cn(
          'flex flex-row items-center gap-2',
          notification.type === 'info' && 'text-foreground',
          notification.type === 'warning' && 'text-warning-foreground',
          notification.type === 'error' && 'text-error-foreground',
        )}
      >
        {notification.title && (
          <>
            {notification.type === 'info' && (
              <IconCircleInfoOutline18 className="size-3.5 shrink-0" />
            )}
            {notification.type === undefined && (
              <IconCircleInfoOutline18 className="size-3.5 shrink-0" />
            )}
            {notification.type === 'warning' && (
              <IconTriangleWarningOutline18 className="size-3.5 shrink-0" />
            )}
            {notification.type === 'error' && (
              <IconTriangleWarningOutline18 className="size-3.5 shrink-0" />
            )}
            <div className="flex flex-col gap-1">
              {notification.title && (
                <p className="mr-8 font-normal text-xs">{notification.title}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              className="-mr-1 ml-auto"
              onClick={onDismiss}
            >
              <IconXmark className="size-3.5" />
            </Button>
          </>
        )}
      </div>
      {notification.message && (
        <p className="font-normal text-foreground text-xs">
          {notification.message}
        </p>
      )}
      {notification.actions.length > 0 && (
        <PopoverFooter>
          <div className="mt-1.5 flex w-full flex-row-reverse items-center justify-start gap-2">
            {notification.actions.map((action, index) => (
              <Button
                key={action.label}
                variant={index === 0 ? action.type : 'ghost'}
                size="xs"
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </PopoverFooter>
      )}
    </div>
  );
}
