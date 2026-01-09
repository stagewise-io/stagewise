import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

export const buttonVariants = cva(
  'app-no-drag relative block flex flex-row items-center justify-center disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-primary font-normal text-primary-foreground transition-colors duration-100 ease-out hover:bg-primary/90',
        secondary:
          'bg-muted/50 font-normal text-foreground transition-colors duration-100 ease-out hover:bg-muted/40',
        destructive:
          'bg-rose-600 font-normal text-rose-50 dark:bg-rose-800 dark:text-rose-400',
        warning:
          'bg-yellow-200 font-normal text-yellow-900 dark:bg-yellow-800 dark:text-yellow-400',
        ghost:
          'bg-transparent font-medium text-foreground not-disabled:hover:bg-muted-foreground/5',
      },
      size: {
        xs: 'h-6 gap-1 rounded-xl px-2.5 py-1 text-xs',
        sm: 'h-8 gap-1.5 rounded-xl px-3 py-1 text-sm',
        md: 'h-10 gap-2 rounded-xl px-4 py-2 text-sm',
        lg: 'h-12 gap-2 rounded-xl px-6 py-3 text-base',
        xl: 'h-14 gap-3 rounded-xl px-8 py-4 text-lg',
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
  size = 'md',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(buttonVariants({ variant, size }), props.className)}
    />
  );
}
