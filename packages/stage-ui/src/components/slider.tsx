import * as React from 'react';
import { Slider as BaseSlider } from '@base-ui/react/slider';
import { cn } from '../lib/utils';

const sliderThicknessStyles = {
  default: {
    track: 'h-1.5',
    thumb: 'size-4',
  },
  thick: {
    track: 'h-2.5',
    thumb: 'size-5',
  },
} as const;

export type SliderThickness = keyof typeof sliderThicknessStyles;

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
  thickness?: SliderThickness;
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
  thickness = 'default',
  ...props
}: SliderProps) {
  const thicknessStyles = sliderThicknessStyles[thickness];

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
            'relative w-full rounded-full bg-surface-2',
            'border border-derived-subtle',
            thicknessStyles.track,
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
              'rounded-full border border-border bg-background shadow-elevation-1',
              thicknessStyles.thumb,
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
