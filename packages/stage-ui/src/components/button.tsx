import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

export const buttonVariants = cva(
  'app-no-drag relative box-border block flex not-disabled:cursor-pointer flex-row items-center justify-center disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'border border-primary-accent bg-linear-to-tr bg-primary font-normal text-primary-foreground not-disabled:hover:bg-primary-hover not-disabled:active:bg-primary-active',
        secondary:
          'border border-border bg-surface-1 font-normal text-foreground not-disabled:hover:bg-surface-2 not-disabled:active:bg-surface-3 dark:not-disabled:active:bg-base-600 dark:not-disabled:hover:bg-base-650',
        destructive:
          'bg-error-solid font-normal text-primary-foreground dark:border-error-foreground-light',
        warning: 'bg-warning-solid font-normal text-primary-foreground',
        success: 'bg-success-solid font-normal text-primary-foreground',
        ghost:
          'bg-transparent font-normal text-foreground-subtle not-disabled:hover:text-foreground not-disabled:active:text-foreground-subtle',
      },
      size: {
        xs: 'h-6 gap-1 rounded-md px-2.5 py-1 text-xs',
        sm: 'h-8 gap-1.5 rounded-md px-3 py-1 text-sm',
        md: 'h-10 gap-2 rounded-md px-4 py-2 text-sm',
        lg: 'h-12 gap-2 rounded-md px-6 py-3 text-base',
        'icon-2xs': 'size-4 rounded-full text-2xs',
        'icon-xs': 'size-6 rounded-full text-xs',
        'icon-sm': 'size-8 rounded-full text-sm',
        'icon-md': 'size-10 rounded-full text-sm',
      },
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({
  variant = 'primary',
  size = 'sm',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(buttonVariants({ variant, size }), props.className)}
    />
  );
}
