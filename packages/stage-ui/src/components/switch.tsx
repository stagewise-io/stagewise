import * as React from 'react';
import { Switch as BaseSwitch } from '@base-ui-components/react/switch';
import { cn } from '../lib/utils';

export function Switch(props: React.ComponentProps<typeof BaseSwitch.Root>) {
  return (
    <BaseSwitch.Root
      {...props}
      className={cn(
        'glass-inset relative flex h-6 w-10 rounded-full p-1 transition-[background-position,box-shadow,background-color] duration-[150ms] ease-[cubic-bezier(0.26,0.75,0.38,0.45)] disabled:pointer-events-none disabled:opacity-50 data-[checked]:bg-blue-600',
        props.className,
      )}
    >
      <BaseSwitch.Thumb className="glass-body glass-body-motion aspect-square h-full rounded-full bg-black/50 transition-transform duration-200 data-[checked]:translate-x-4 data-[checked]:bg-white/80" />
    </BaseSwitch.Root>
  );
}
