import * as React from 'react';
import { Input as InputBase } from '@base-ui-components/react/input';
import { cn } from '../lib/utils';

export function Input({
  className,
  inputClassName,
  ...props
}: React.ComponentProps<typeof InputBase> & {
  inputClassName?: string;
}) {
  return (
    <div className={cn('glass-inset w-full max-w-lg rounded-lg', className)}>
      <InputBase
        className={cn(
          'focus:-outline-offset-1 h-8 w-full rounded-lg pr-1.5 pl-3 text-base text-foreground focus:outline focus:outline-2 focus:outline-blue-800 disabled:text-muted-foreground',
          inputClassName,
        )}
        {...props}
      />
    </div>
  );
}
