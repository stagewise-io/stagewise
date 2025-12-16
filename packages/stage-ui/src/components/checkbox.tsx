import * as React from 'react';
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { CheckIcon } from 'lucide-react';
import { cn } from '../lib/utils';

export function Checkbox(
  props: React.ComponentProps<typeof BaseCheckbox.Root>,
) {
  return (
    <BaseCheckbox.Root
      {...props}
      className={cn(
        'glass-inset relative flex size-5 rounded-md p-0.75 transition-[background-position,box-shadow,background-color] duration-[150ms] ease-[cubic-bezier(0.26,0.75,0.38,0.45)] disabled:pointer-events-none disabled:opacity-50 data-[checked]:bg-blue-600',
        props.className,
      )}
    >
      <BaseCheckbox.Indicator className="translate-y-1.5 scale-25 duration-150 ease-out data-[checked]:translate-y-0 data-[checked]:scale-100">
        <CheckIcon className="h-3.5 w-3.5 stroke-3 text-white" />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
