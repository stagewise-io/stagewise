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
        'glass-inset flex size-5 shrink-0 items-center justify-center rounded-full bg-white/20 p-1.5 transition-colors duration-100 ease-out ease-out disabled:opacity-50 data-[checked]:bg-primary',
        className,
      )}
    >
      <RadioBase.Indicator className="glass-body size-full rounded-full bg-white/90 transition-colors duration-100 ease-out" />
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
        'block flex flex-row items-center gap-2 text-foreground text-sm',
        className,
      )}
    >
      {children}
    </label>
  );
};
