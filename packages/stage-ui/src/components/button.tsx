import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

export const buttonVariants = cva(
  'relative flex flex-row items-center justify-center gap-2 font-normal disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'glass-body glass-body-interactive glass-body-motion glass-body-motion-interactive bg-primary text-primary-foreground',
        secondary:
          'glass-body glass-body-interactive glass-body-motion glass-body-motion-interactive text-foreground',
        ghost: 'bg-transparent font-medium text-foreground hover:bg-zinc-500/5',
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
  return (
    <button
      {...props}
      className={cn(buttonVariants({ variant, size }), props.className)}
    />
  );
}
