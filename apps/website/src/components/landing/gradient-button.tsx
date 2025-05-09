'use client';

import { Button } from '@stagewise/ui/components/button';
import { cn } from '@stagewise/ui/lib/utils';
import type React from 'react';

import { useState, useEffect } from 'react';

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
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    setIsDarkMode(mediaQuery?.matches ?? false);

    const handler = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
    mediaQuery?.addEventListener('change', handler);
    return () => mediaQuery?.removeEventListener('change', handler);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <Button
      className={cn(
        'group relative overflow-hidden',
        variant === 'default'
          ? 'border-0 text-white'
          : 'border border-purple-500 bg-transparent text-slate-900 dark:text-white',
        className,
      )}
      size={size}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      style={{
        background:
          variant === 'default'
            ? isDarkMode
              ? 'black'
              : '#1A1A1A'
            : 'transparent',
      }}
    >
      <span className="relative z-10">{children}</span>
      <div
        className={cn(
          'absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100',
          variant === 'default'
            ? 'bg-gradient-to-r from-purple-600 to-pink-600'
            : 'bg-gradient-to-r from-purple-600/20 to-pink-600/20 dark:from-purple-600/20 dark:to-pink-600/20',
        )}
      />
      <div
        className={cn(
          '-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute h-32 w-32 rounded-full opacity-0 transition-transform duration-500 ease-out group-hover:opacity-30',
          variant === 'default'
            ? isDarkMode
              ? 'bg-white'
              : 'bg-neutral-700'
            : isDarkMode
              ? 'bg-purple-400'
              : 'bg-purple-500',
        )}
        style={{
          left: mousePosition.x,
          top: mousePosition.y,
          transform: `translate(-50%, -50%) scale(${mousePosition.x || mousePosition.y ? 2 : 0})`,
        }}
      />
    </Button>
  );
}
