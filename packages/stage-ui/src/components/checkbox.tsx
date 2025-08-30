import * as React from 'react';
import { Checkbox as BaseCheckbox } from '@base-ui-components/react/checkbox';
import { CheckIcon } from 'lucide-react';
import { cn } from '../lib/utils';

export function Checkbox(
  props: React.ComponentProps<typeof BaseCheckbox.Root>,
) {
  return (
    <BaseCheckbox.Root
      {...props}
      className={cn(
        'glass-inset relative flex size-6 rounded-md p-1 transition-[background-position,box-shadow,background-color] duration-[150ms] ease-[cubic-bezier(0.26,0.75,0.38,0.45)] disabled:pointer-events-none disabled:opacity-50 data-[checked]:bg-blue-600',
        props.className,
      )}
    >
      <BaseCheckbox.Indicator>
        <CheckIcon className="h-4 w-4 stroke-3 text-white" />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
