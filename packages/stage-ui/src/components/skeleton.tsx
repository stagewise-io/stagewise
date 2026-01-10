import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

export const skeletonVariants = cva(
  'relative overflow-hidden border border-border bg-surface-1 dark:border-border',
  {
    variants: {
      variant: {
        rectangle: 'rounded-md',
        circle: 'rounded-full',
        text: 'rounded',
      },
      size: {
        xs: 'h-3',
        sm: 'h-4',
        md: 'h-6',
        lg: 'h-8',
        xl: 'h-12',
        full: 'h-full',
      },
      animate: {
        true: 'after:absolute after:inset-0 after:animate-skeleton-shimmer after:bg-gradient-to-r after:from-transparent after:via-base-50/50 after:to-transparent dark:after:via-base-650',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'rectangle',
      size: 'md',
      animate: true,
    },
  },
);

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof skeletonVariants>;

export function Skeleton({
  variant = 'rectangle',
  size = 'md',
  animate = true,
  className,
  ...props
}: SkeletonProps) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={cn(skeletonVariants({ variant, size, animate }), className)}
      {...props}
    />
  );
}
