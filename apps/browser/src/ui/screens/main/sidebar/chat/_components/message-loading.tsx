import { cn } from '@/utils';
import { BrainIcon } from 'lucide-react';

export function MessageLoading() {
  return (
    <div className="mt-2 flex flex-row items-center gap-2">
      <div className="flex flex-row items-center justify-start gap-1 py-1.5">
        <BrainIcon
          className={cn(
            'size-3',
            'animate-thinking-part-brain-pulse text-primary-foreground',
          )}
        />
        <div className="shimmer-text-primary w-fit text-xs">Working...</div>
      </div>
    </div>
  );
}
