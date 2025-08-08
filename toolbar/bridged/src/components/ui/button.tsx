import { cn } from '@/utils';
import type { ReactNode } from 'react';
import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  asChild?: boolean;
  glassy?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  glassy = true,
  asChild,
  className,
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
        variant === 'secondary' && 'bg-black/5 text-zinc-950/70',
        variant === 'outline' &&
          'border border-zinc-500 bg-white text-blue-500',
        variant === 'ghost' && 'bg-transparent text-blue-500',
        glassy &&
          'origin-center rounded-xl border border-black/10 ring-1 ring-white/20 transition-all duration-150 ease-out after:absolute after:inset-0 after:size-full after:content-normal after:rounded-[inherit] after:bg-gradient-to-b after:from-white/5 after:to-white/0 after:transition-colors after:duration-150 after:ease-out hover:border-black/5 hover:shadow-xs hover:after:from-blue-50/20 hover:after:to-blue-50/15 active:scale-[98%] active:border-black/15 active:shadow-inset active:after:from-transparent active:after:to-transparent disabled:pointer-events-none disabled:bg-black/5 disabled:text-foreground/60 disabled:opacity-30',
        className,
      )}
      type="submit"
    >
      {children}
    </button>
  );
}
