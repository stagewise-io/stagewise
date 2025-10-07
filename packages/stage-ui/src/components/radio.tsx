import {
  Radio as RadioBase,
  RadioGroup as RadioGroupBase,
} from '@base-ui-components/react';
import { cn } from '../lib/utils';

export type RadioGroupProps = React.ComponentProps<typeof RadioGroupBase>;
export const RadioGroup = ({ className, ...props }: RadioGroupProps) => {
  return (
    <RadioGroupBase
      className={(state) =>
        cn(
          'flex flex-col items-start justify-start gap-2',
          cn(
            'flex flex-col items-start justify-start gap-2',
            typeof className === 'function' ? className(state) : className,
          ),
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
        'glass-inset size-6 shrink-0 rounded-full bg-white/20 disabled:opacity-50 data-[checked]:bg-primary',
        className,
      )}
    >
      <RadioBase.Indicator className="glass-body m-0.5 size-full rounded-full bg-white/80" />
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
