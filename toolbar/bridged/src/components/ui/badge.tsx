import { cn } from '@/utils';
import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva('rounded-md p-2', {
  variants: {
    color: {
      blue: '',
      green: '',
      red: '',
      yellow: '',
      purple: '',
      orange: '',
      pink: '',
    },
    style: {
      default: 'text-white',
      outline: 'border text-zinc-950',
    },
  },
  compoundVariants: [
    {
      style: 'default',
      color: 'blue',
      className: 'bg-blue-500',
    },
    {
      style: 'default',
      color: 'green',
      className: 'bg-green-500',
    },
    {
      style: 'default',
      color: 'red',
      className: 'bg-red-500',
    },
    {
      style: 'default',
      color: 'yellow',
      className: 'bg-yellow-500',
    },
    {
      style: 'default',
      color: 'purple',
      className: 'bg-purple-500',
    },
    {
      style: 'default',
      color: 'orange',
      className: 'bg-orange-500',
    },
    {
      style: 'default',
      color: 'pink',
      className: 'bg-pink-500',
    },
    {
      style: 'outline',
      color: 'blue',
      className: 'border-blue-500',
    },
    {
      style: 'outline',
      color: 'green',
      className: 'border-green-500',
    },
    {
      style: 'outline',
      color: 'red',
      className: 'border-red-500',
    },
    {
      style: 'outline',
      color: 'yellow',
      className: 'border-yellow-500',
    },
    {
      style: 'outline',
      color: 'purple',
      className: 'border-purple-500',
    },
    {
      style: 'outline',
      color: 'orange',
      className: 'border-orange-500',
    },
    {
      style: 'outline',
      color: 'pink',
      className: 'border-pink-500',
    },
  ],
  defaultVariants: {
    color: 'blue',
    style: 'default',
  },
});

interface BadgeProps extends VariantProps<typeof badgeVariants> {
  children: ReactNode;
  className?: string;
}

export function Badge({ children, color, style, className }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ color, style }), className)}>
      {children}
    </span>
  );
}
