import { Button, type ButtonProps } from '@headlessui/react';
import { forwardRef } from 'preact/compat';
import type { VNode } from 'preact';
import { ToolbarItem } from './item';
import { cn } from '@/utils';

export interface ToolbarButtonProps extends ButtonProps {
  badgeContent?: VNode;
  badgeClassName?: string;
  statusDot?: boolean;
  statusDotClassName?: string;
  tooltipHint?: string;
  variant?: 'default' | 'promoted';
  active?: boolean;
}

export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  (
    {
      badgeContent,
      badgeClassName,
      statusDot,
      statusDotClassName,
      tooltipHint,
      variant = 'default',
      active,
      ...props
    },
    ref,
  ) => {
    const button = (
      <Button
        ref={ref}
        {...props}
        className={cn(
          'flex items-center justify-center rounded-full p-1 text-zinc-950 ring ring-transparent transition-all duration-150 hover:bg-zinc-950/5',
          variant === 'default' ? 'size-8' : 'h-8 rounded-full',
          active && 'bg-white/40 ring-zinc-950/20',
          props.className,
        )}
      />
    );
    return (
      <ToolbarItem
        badgeContent={badgeContent}
        badgeClassName={badgeClassName}
        statusDot={statusDot}
        statusDotClassName={statusDotClassName}
      >
        {button}
      </ToolbarItem>
    );
  },
);
ToolbarButton.displayName = 'ToolbarButton';
