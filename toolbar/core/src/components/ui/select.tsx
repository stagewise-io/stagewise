import { Select as SelectBase, type SelectProps } from '@headlessui/react';
import { cn } from '@/utils';

export function Select(props: SelectProps) {
  return (
    <SelectBase
      {...props}
      className={cn(
        'h-8 rounded-lg bg-zinc-500/10 backdrop-saturate-150',
        props.className,
      )}
    />
  );
}
