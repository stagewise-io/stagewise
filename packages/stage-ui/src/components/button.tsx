import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

export const buttonVariants = cva(
  'app-no-drag relative box-border block flex not-disabled:cursor-pointer flex-row items-center justify-center disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'border border-derived-subtle bg-primary-solid font-normal text-solid-foreground not-disabled:hover:bg-hover-derived not-disabled:active:bg-active-derived',
        secondary:
          'border border-derived-subtle bg-surface-1 font-normal text-foreground not-disabled:hover:bg-hover-derived not-disabled:active:bg-active-derived',
        destructive:
          'border border-derived-subtle bg-error-solid font-normal text-solid-foreground not-disabled:hover:bg-hover-derived not-disabled:active:bg-active-derived',
        warning:
          'border border-derived-subtle bg-warning-solid font-normal text-solid-foreground not-disabled:hover:bg-hover-derived not-disabled:active:bg-active-derived',
        success:
          'border border-derived-subtle bg-success-solid font-normal text-solid-foreground not-disabled:hover:bg-hover-derived not-disabled:active:bg-active-derived',
        ghost:
          'bg-transparent font-normal text-muted-foreground not-disabled:hover:text-foreground not-disabled:active:text-foreground/l-4_c-3',
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
