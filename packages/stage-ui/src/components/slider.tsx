import * as React from 'react';
import { Slider as BaseSlider } from '@base-ui/react/slider';
import { cn } from '../lib/utils';

export type SliderProps = Omit<
  React.ComponentProps<typeof BaseSlider.Root>,
  'value' | 'defaultValue' | 'onValueChange'
> & {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  ariaLabel?: string;
  controlClassName?: string;
  trackClassName?: string;
  indicatorClassName?: string;
  thumbClassName?: string;
};

export function Slider({
  value,
  defaultValue,
  onValueChange,
  ariaLabel,
  className,
  controlClassName,
  trackClassName,
  indicatorClassName,
  thumbClassName,
  ...props
}: SliderProps) {
  return (
    <BaseSlider.Root
      {...props}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(nextValue) => {
        onValueChange?.(
          Array.isArray(nextValue) ? (nextValue[0] ?? 0) : nextValue,
        );
      }}
      className={cn('w-full', className)}
    >
      <BaseSlider.Control
        className={cn(
          'flex w-full touch-none select-none items-center py-2',
          controlClassName,
        )}
      >
        <BaseSlider.Track
          className={cn(
            'relative h-1.5 w-full rounded-full bg-surface-2',
            'border border-derived-subtle',
            trackClassName,
          )}
        >
          <BaseSlider.Indicator
            className={cn(
              'rounded-full bg-primary-solid transition-colors',
              indicatorClassName,
            )}
          />
          <BaseSlider.Thumb
            aria-label={ariaLabel}
            className={cn(
              'size-4 rounded-full border border-border bg-background shadow-elevation-1',
              'transition-[box-shadow,background-color,border-color] duration-150',
              'hover:bg-hover-derived active:bg-active-derived',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary-solid has-[:focus-visible]:outline-offset-2',
              'disabled:opacity-50',
              thumbClassName,
            )}
          />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
