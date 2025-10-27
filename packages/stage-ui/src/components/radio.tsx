import {
  Radio as RadioBase,
  RadioGroup as RadioGroupBase,
} from '@base-ui-components/react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

export const radioVariants = cva(
  'glass-inset shrink-0 rounded-full bg-white/20 disabled:opacity-50 data-[checked]:bg-primary',
  {
    variants: {
      size: {
        xs: 'size-4',
        sm: 'size-5',
        md: 'size-6',
        lg: 'size-7',
        xl: 'size-8',
      },
    },
  },
);

export const radioIndicatorVariants = cva(
  'glass-body rounded-full bg-white/80',
  {
    variants: {
      size: {
        xs: 'm-0.5 size-full',
        sm: 'm-0.5 size-full',
        md: 'm-0.5 size-full',
        lg: 'm-1 size-full',
        xl: 'm-1 size-full',
      },
    },
  },
);

export const radioLabelVariants = cva(
  'block flex flex-row items-center gap-2 text-foreground',
  {
    variants: {
      size: {
        xs: 'text-xs',
        sm: 'text-sm',
        md: 'text-sm',
        lg: 'text-base',
        xl: 'text-lg',
      },
    },
  },
);

export type RadioGroupProps = React.ComponentProps<typeof RadioGroupBase>;
export const RadioGroup = ({ className, ...props }: RadioGroupProps) => {
  return (
    <RadioGroupBase
      className={(state) =>
        cn(
          'flex flex-col items-start justify-start gap-2',
          cn(
            'flex flex-col items-start justify-start gap-2',
            typeof className === 'function' ? className(state) : className,
          ),
        )
      }
      {...props}
    />
  );
};

export type RadioProps = React.ComponentProps<typeof RadioBase.Root> &
  VariantProps<typeof radioVariants>;
export const Radio = ({ className, size = 'md', ...props }: RadioProps) => {
  return (
    <RadioBase.Root
      {...props}
      className={cn(radioVariants({ size }), className)}
    >
      <RadioBase.Indicator className={radioIndicatorVariants({ size })} />
    </RadioBase.Root>
  );
};

export type RadioLabelProps = {
  className?: string;
  children?: React.ReactNode | React.ReactNode[];
} & VariantProps<typeof radioLabelVariants>;
export const RadioLabel = ({
  className,
  size = 'md',
  children,
}: RadioLabelProps) => {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: This is a reusable component
    <label className={cn(radioLabelVariants({ size }), className)}>
      {children}
    </label>
  );
};
