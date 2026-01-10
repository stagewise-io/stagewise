import * as React from 'react';
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

export const switchVariants = cva(
  [
    'relative flex cursor-pointer rounded-full',
    'border border-border bg-surface-1',
    'transition-[background-position,box-shadow,background-color] duration-150ms ease-[cubic-bezier(0.26,0.75,0.38,0.45)]',
    'disabled:pointer-events-none disabled:opacity-50',
    'data-checked:border-primary-accent data-checked:bg-primary',
  ],
  {
    variants: {
      size: {
        xs: 'h-4 w-7 p-0.5',
        sm: 'h-6 w-10 p-1',
        md: 'h-7 w-12 p-1',
      },
    },
    defaultVariants: {
      size: 'sm',
    },
  },
);

const thumbTranslateClasses = {
  xs: 'data-checked:translate-x-3',
  sm: 'data-checked:translate-x-4',
  md: 'data-checked:translate-x-5',
} as const;

export type SwitchProps = React.ComponentProps<typeof BaseSwitch.Root> &
  VariantProps<typeof switchVariants>;

export function Switch({ size = 'sm', ...props }: SwitchProps) {
  return (
    <BaseSwitch.Root
      {...props}
      className={cn(switchVariants({ size }), props.className)}
    >
      <BaseSwitch.Thumb
        className={cn(
          'aspect-square h-full rounded-full bg-foreground transition-transform duration-200 data-checked:bg-base-100',
          thumbTranslateClasses[size ?? 'sm'],
        )}
      />
    </BaseSwitch.Root>
  );
}
