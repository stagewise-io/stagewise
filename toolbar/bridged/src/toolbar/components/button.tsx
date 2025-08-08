import { Button, type ButtonProps } from '@headlessui/react';
import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { ToolbarItem } from './item.js';
import { cn } from '@/utils';

export interface ToolbarButtonProps extends ButtonProps {
  badgeContent?: ReactNode;
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
          'flex cursor-pointer items-center justify-center rounded-full bg-radial from-transparent to-transparent p-1 text-current transition-all duration-150 hover:from-20% hover:from-zinc-100/40 hover:to-75% hover:to-zinc-100/0',
          variant === 'default' ? 'size-8' : 'h-8 rounded-full',
          active &&
            'from-30% from-zinc-100/60 to-75% to-zinc-100/0 fill-[var(--active)] stroke-[var(--active)] text-[var(--active)]',
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
