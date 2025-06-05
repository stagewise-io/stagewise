'use client';

import { Button } from '@stagewise/ui/components/button';
import { cn } from '@stagewise/ui/lib/utils';
import type React from 'react';

interface GradientButtonProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm' | 'lg';
}

export function GradientButton({
  children,
  className,
  onClick,
  variant = 'default',
  size = 'default',
}: GradientButtonProps) {
  return (
    <Button
      className={cn(
        'relative cursor-pointer overflow-hidden',
        variant === 'default'
          ? 'border-0 bg-gradient-to-tr from-blue-700 via-violet-700 to-indigo-800 text-white hover:opacity-90'
          : 'border border-indigo-500 bg-transparent hover:bg-indigo-900/10',
        'transition-all duration-300',
        className,
      )}
      size={size}
      onClick={onClick}
    >
      <span className="relative z-10 flex items-center">{children}</span>
    </Button>
  );
}
