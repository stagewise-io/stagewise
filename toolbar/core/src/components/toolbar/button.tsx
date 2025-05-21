// SPDX-License-Identifier: AGPL-3.0-only
// Toolbar button component
// Copyright (C) 2025 Goetze, Scharpff & Toews GbR

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

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
