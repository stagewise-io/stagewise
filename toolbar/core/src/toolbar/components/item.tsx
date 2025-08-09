import { cn } from '@/utils';
import type { ReactNode } from 'react';

export interface ToolbarItemProps {
  badgeContent?: ReactNode;
  badgeClassName?: string;
  statusDot?: boolean;
  statusDotClassName?: string;
  children?: ReactNode;
  className?: string;
}

export function ToolbarItem(props: ToolbarItemProps) {
  return (
    <div
      className={cn(
        'relative flex h-8 w-8 shrink-0 items-center justify-center',
        props.className,
      )}
    >
      {props.children}
      {props.badgeContent && (
        <div
          className={cn(
            'bg-blue-600 text-white',
            props.badgeClassName,
            'pointer-events-none absolute right-0 bottom-0 flex h-3 w-max min-w-3 max-w-8 select-none items-center justify-center truncate rounded-full px-0.5 font-semibold text-[0.5em]',
          )}
        >
          {props.badgeContent}
        </div>
      )}
      {props.statusDot && (
        <div
          className={cn(
            'bg-rose-600 text-white',
            props.statusDotClassName,
            'pointer-events-none absolute top-0 right-0 size-1.5 rounded-full',
          )}
        />
      )}
    </div>
  );
}
