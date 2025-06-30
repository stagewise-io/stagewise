import { cn } from '@/utils';
import type { ReactNode } from 'react';
import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  asChild?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  asChild,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <button {...props} className="cursor-pointer">
        {children}
      </button>
    );
  }
  return (
    <button
      {...props}
      className={cn(
        'flex h-12 cursor-pointer items-center justify-center rounded-lg px-4 py-2 font-medium text-sm text-white',
        size === 'sm' && 'h-8',
        size === 'md' && 'h-12',
        size === 'lg' && 'h-16',
        variant === 'primary' && 'bg-blue-600',
        variant === 'secondary' && 'bg-zinc-500/40',
        variant === 'outline' &&
          'border border-zinc-500 bg-white text-blue-500',
        variant === 'ghost' && 'bg-transparent text-blue-500',
      )}
      type="submit"
    >
      {children}
    </button>
  );
}
