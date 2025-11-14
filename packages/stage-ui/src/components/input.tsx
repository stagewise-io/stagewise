import * as React from 'react';
import { Input as InputBase } from '@base-ui-components/react/input';
import { cn } from '../lib/utils';

export function Input({
  className,
  inputClassName,
  onValueChange,
  value: controlledValue,
  debounce,
  ...props
}: React.ComponentProps<typeof InputBase> & {
  inputClassName?: string;
  debounce?: number;
}) {
  const valueChangeTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [optimisticLocalValue, setOptimisticLocalValue] =
    React.useState<typeof controlledValue>(controlledValue);
  React.useEffect(() => {
    setOptimisticLocalValue(controlledValue);
  }, [controlledValue]);

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
        onValueChange?.(...args);
      }
    },
    [onValueChange],
  );

  return (
    <div
      className={cn(
        'glass-inset w-full max-w-lg rounded-lg has-disabled:before:bg-transparent has-disabled:before:opacity-50',
        className,
      )}
    >
      <InputBase
        className={cn(
          'focus:-outline-offset-1 h-8 w-full rounded-lg pr-1.5 pl-3 text-base text-foreground focus:outline focus:outline-2 focus:outline-blue-800 disabled:text-muted-foreground',
          inputClassName,
        )}
        onValueChange={onValueChange ? valueChangeCallback : undefined}
        {...props}
        value={optimisticLocalValue}
      />
    </div>
  );
}
