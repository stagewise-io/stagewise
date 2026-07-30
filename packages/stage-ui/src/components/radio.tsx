import {
  Radio as RadioBase,
  RadioGroup as RadioGroupBase,
} from '@base-ui/react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

// ============================================================================
// RadioGroup
// ============================================================================

export type RadioGroupProps = React.ComponentProps<typeof RadioGroupBase>;
export const RadioGroup = ({ className, ...props }: RadioGroupProps) => {
  return (
    <RadioGroupBase
      className={(state) =>
        cn(
          'flex shrink-0 flex-col items-start justify-start gap-2 data-disabled:opacity-50',
          typeof className === 'function' ? className(state) : className,
        )
      }
      {...props}
    />
  );
};

// ============================================================================
// Radio
// ============================================================================

export const radioVariants = cva(
  [
    'flex shrink-0 items-center justify-center rounded-full',
    'border border-derived bg-surface-1',
    'transition-colors duration-100 ease-out',
    'not-data-checked:not-data-disabled:cursor-pointer',
    'not-data-disabled:hover:bg-hover-derived not-data-disabled:active:bg-active-derived',
    'data-disabled:cursor-not-allowed',
    'data-checked:bg-primary-foreground',
  ],
  {
    variants: {
      size: {
        xs: 'size-3.5 p-0.75',
        sm: 'size-4 p-1',
        md: 'size-5 p-1.5',
      },
    },
    defaultVariants: {
      size: 'sm',
    },
  },
);

export type RadioProps = React.ComponentProps<typeof RadioBase.Root> &
  VariantProps<typeof radioVariants>;

export const Radio = ({ className, size = 'sm', ...props }: RadioProps) => {
  return (
    <RadioBase.Root
      {...props}
      className={cn(radioVariants({ size }), className)}
    >
      <RadioBase.Indicator className="size-full rounded-full bg-solid-foreground transition-colors duration-100 ease-out" />
    </RadioBase.Root>
  );
};

// ============================================================================
// RadioLabel
// ============================================================================

const labelSizeClasses = {
  xs: 'gap-1.5 text-xs',
  sm: 'gap-2 text-sm',
  md: 'gap-2 text-sm',
} as const;

export type RadioLabelProps = {
  className?: string;
  size?: 'xs' | 'sm' | 'md';
  children?: React.ReactNode | React.ReactNode[];
};
export const RadioLabel = ({
  className,
  size = 'sm',
  children,
}: RadioLabelProps) => {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: This is a reusable component
    <label
      className={cn(
        'flex flex-row items-center text-foreground',
        labelSizeClasses[size],
        className,
      )}
    >
      {children}
    </label>
  );
};
