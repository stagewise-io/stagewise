import * as React from 'react';
import {
  OTPInput,
  OTPInputContext,
  REGEXP_ONLY_DIGITS,
  type SlotProps,
} from 'input-otp';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/utils';

const inputOtpVariants = cva(
  'flex items-center gap-2 has-disabled:opacity-50',
  {
    variants: {
      size: {
        sm: 'gap-1.5',
        md: 'gap-2',
        lg: 'gap-3',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

const slotVariants = cva(
  [
    'relative flex items-center justify-center',
    'rounded-md',
    'bg-surface-1 text-foreground',
    'border border-surface-2',
    'transition-colors',
  ],
  {
    variants: {
      size: {
        sm: 'h-8 w-7 text-sm',
        md: 'h-10 w-9 text-base',
        lg: 'h-12 w-11 text-lg',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

type OtpSize = 'sm' | 'md' | 'lg';

export type InputOtpProps = Omit<
  React.ComponentProps<typeof OTPInput>,
  'render' | 'children' | 'maxLength' | 'containerClassName' | 'size'
> & {
  length?: number;
  size?: OtpSize;
  className?: string;
};

export const InputOtp = React.forwardRef<HTMLInputElement, InputOtpProps>(
  ({ className, length = 6, size = 'md', ...props }, ref) => {
    return (
      <OTPInput
        ref={ref}
        maxLength={length}
        pattern={REGEXP_ONLY_DIGITS}
        containerClassName={cn(inputOtpVariants({ size }), className)}
        {...props}
        render={({ slots }) => (
          <>
            {slots.map((slot, idx) => (
              <Slot key={`otp-slot-${idx}`} slot={slot} size={size} />
            ))}
          </>
        )}
      />
    );
  },
);

InputOtp.displayName = 'InputOtp';

function Slot({ slot, size }: { slot: SlotProps; size: OtpSize }) {
  return (
    <div
      className={cn(
        slotVariants({ size }),
        slot.isActive && 'border-surface-3 ring-1 ring-surface-3',
      )}
    >
      {slot.char !== null ? (
        <span>{slot.char}</span>
      ) : slot.placeholderChar !== null ? (
        <span className="text-subtle-foreground">{slot.placeholderChar}</span>
      ) : null}
      {slot.hasFakeCaret && <FakeCaret />}
    </div>
  );
}

function FakeCaret() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="h-4 w-px animate-caret-blink bg-foreground" />
    </div>
  );
}

export { OTPInputContext, REGEXP_ONLY_DIGITS };
