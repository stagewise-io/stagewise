import * as React from 'react';
import {
  Input as InputBase,
  type InputProps as InputBaseProps,
} from '@base-ui/react/input';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

export const inputVariants = cva(
  [
    'w-full max-w-lg rounded-md',
    'bg-surface-1 text-foreground',
    'placeholder:text-subtle-foreground',
    'disabled:text-muted-foreground disabled:opacity-50',
    'border border-surface-2 focus:border-surface-3 focus:outline-none',
  ],
  {
    variants: {
      size: {
        xs: 'h-6 px-2 text-xs',
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
      },
    },
    defaultVariants: {
      size: 'sm',
    },
  },
);

export type InputProps = Omit<React.ComponentProps<typeof InputBase>, 'size'> &
  VariantProps<typeof inputVariants> & {
    debounce?: number;
  };

export function Input({
  className,
  onValueChange,
  value: controlledValue,
  debounce,
  size = 'sm',
  ...props
}: InputProps) {
  const valueChangeTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isFocused = React.useRef(false);

  const [optimisticLocalValue, setOptimisticLocalValue] =
    React.useState<typeof controlledValue>(controlledValue);

  // Only sync external value changes into local state when the input is NOT
  // focused. While the user is actively typing we own the value — syncing
  // from the parent would reset the cursor position.
  React.useEffect(() => {
    if (!isFocused.current) {
      setOptimisticLocalValue(controlledValue);
    }
  }, [controlledValue]);

  const handleFocus = React.useCallback<NonNullable<InputBaseProps['onFocus']>>(
    (e) => {
      isFocused.current = true;
      props.onFocus?.(e);
    },
    [props.onFocus],
  );

  const handleBlur = React.useCallback<NonNullable<InputBaseProps['onBlur']>>(
    (e) => {
      isFocused.current = false;
      // Sync any external value that arrived while we were focused.
      setOptimisticLocalValue(controlledValue);
      props.onBlur?.(e);
    },
    [props.onBlur, controlledValue],
  );

  const valueChangeCallback = React.useCallback<
    NonNullable<typeof onValueChange>
  >(
    (...args) => {
      if (debounce && debounce >= 0) {
        setOptimisticLocalValue(args[0]);
        if (valueChangeTimeout.current)
          clearTimeout(valueChangeTimeout.current);
        valueChangeTimeout.current = setTimeout(
          () => onValueChange?.(...args),
          debounce,
        );
      } else {
        setOptimisticLocalValue(args[0]);
        onValueChange?.(...args);
      }
    },
    [onValueChange, debounce],
  );

  return (
    <InputBase
      className={cn(inputVariants({ size }), className)}
      onValueChange={onValueChange ? valueChangeCallback : undefined}
      {...props}
      onFocus={handleFocus}
      onBlur={handleBlur}
      value={optimisticLocalValue}
    />
  );
}
