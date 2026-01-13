import {
  Radio as RadioBase,
  RadioGroup as RadioGroupBase,
} from '@base-ui/react';
import { cn } from '../lib/utils';

export type RadioGroupProps = React.ComponentProps<typeof RadioGroupBase>;
export const RadioGroup = ({ className, ...props }: RadioGroupProps) => {
  return (
    <RadioGroupBase
      className={(state) =>
        cn(
          'flex shrink-0 flex-col items-start justify-start gap-2 disabled:opacity-50',
          typeof className === 'function' ? className(state) : className,
        )
      }
      {...props}
    />
  );
};

export type RadioProps = React.ComponentProps<typeof RadioBase.Root>;
export const Radio = ({ className, ...props }: RadioProps) => {
  return (
    <RadioBase.Root
      {...props}
      className={cn(
        'flex size-5 shrink-0 not-data-checked:not-disabled:cursor-pointer items-center justify-center rounded-full border border-derived-subtle bg-surface-1 p-1.5 transition-colors duration-100 ease-out disabled:opacity-50 data-checked:bg-primary-foreground',
        className,
      )}
    >
      <RadioBase.Indicator className="size-full rounded-full bg-solid-foreground transition-colors duration-100 ease-out" />
    </RadioBase.Root>
  );
};

export type RadioLabelProps = {
  className?: string;
  children?: React.ReactNode | React.ReactNode[];
};
export const RadioLabel = ({ className, children }: RadioLabelProps) => {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: This is a reusable component
    <label
      className={cn(
        'flex flex-row items-center gap-2 text-foreground text-sm',
        className,
      )}
    >
      {children}
    </label>
  );
};
