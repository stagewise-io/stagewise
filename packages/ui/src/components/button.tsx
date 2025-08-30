import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils.js';

const buttonVariants = cva(
  cn(
    'relative flex flex-row items-center justify-center gap-2 font-normal disabled:opacity-50',
  ),
  {
    variants: {
      variant: {
        primary:
          'glass-body glass-body-interactive glass-body-motion enabled:glass-body-motion-interactive bg-primary text-primary-foreground',
        secondary:
          'glass-body glass-body-interactive glass-body-motion enabled:glass-body-motion-interactive bg-muted text-foreground',
        ghost: 'bg-transparent text-foreground',
      },
      size: {
        sm: 'h-8 rounded-xl px-2 py-1 text-sm',
        md: 'h-10 rounded-xl px-4 py-2 text-sm',
        lg: 'h-12 rounded-xl px-6 py-3 text-base',
        xl: 'h-14 rounded-xl px-8 py-4 text-lg',
        'icon-sm': 'size-8 rounded-full',
        'icon-md': 'size-10 rounded-full',
      },
    },
  },
);

export type ButtonProps = React.HTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonProps) {
  return <button className={buttonVariants({ variant, size })} {...props} />;
}
