import * as React from 'react';
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { CheckIcon } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

export const checkboxVariants = cva(
  [
    'relative flex not-disabled:cursor-pointer',
    'ring-1 ring-border',
    'transition-[background-position,box-shadow,background-color] duration-[20ms] ease-[cubic-bezier(0.26,0.75,0.38,0.45)]',
    'disabled:pointer-events-none disabled:opacity-50',
    'data-[checked]:bg-primary',
    'data-[checked]:ring-primary-accent',
    'bg-surface-1',
  ],
  {
    variants: {
      size: {
        xs: 'size-3.5 rounded-sm p-0.5',
        sm: 'size-4 rounded-sm p-0.5',
        md: 'size-5 rounded-sm p-0.75',
      },
    },
    defaultVariants: {
      size: 'sm',
    },
  },
);

const iconSizeClasses = {
  xs: 'h-2.5 w-2.5',
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
} as const;

export type CheckboxProps = React.ComponentProps<typeof BaseCheckbox.Root> &
  VariantProps<typeof checkboxVariants>;

export function Checkbox({ size = 'sm', ...props }: CheckboxProps) {
  return (
    <BaseCheckbox.Root
      {...props}
      className={cn(checkboxVariants({ size }), props.className)}
    >
      <BaseCheckbox.Indicator className="scale-25 duration-150 ease-out data-checked:scale-100">
        <CheckIcon
          className={cn(iconSizeClasses[size ?? 'sm'], 'stroke-3 text-white')}
        />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
