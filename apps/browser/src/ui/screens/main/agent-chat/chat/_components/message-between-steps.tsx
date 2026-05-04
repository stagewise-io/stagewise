import { cn } from '@ui/utils';
import { BrainIcon } from 'lucide-react';

export function MessageBetweenSteps() {
  return (
    <div className="flex flex-row items-center justify-start gap-1">
      <BrainIcon
        className={cn('size-3', 'animate-icon-pulse text-primary-foreground')}
      />
      <div className="shimmer-text-primary w-fit text-xs">Working...</div>
    </div>
  );
}
