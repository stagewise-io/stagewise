import { cn } from '@ui/utils';
import { formatDiffCount } from '@ui/utils/format-diff-count';

export function DiffLineStats({
  added,
  removed,
  stacked = false,
  className,
}: {
  added: number;
  removed: number;
  stacked?: boolean;
  className?: string;
}) {
  if (added === 0 && removed === 0) return null;

  return (
    <span
      className={cn(
        'flex shrink-0 font-mono tabular-nums',
        stacked
          ? 'flex-col text-[0.5rem] leading-none'
          : 'items-center gap-1.5 text-xs',
        className,
      )}
    >
      {added > 0 && (
        <span className="text-success-foreground">
          +{formatDiffCount(added)}
        </span>
      )}
      {removed > 0 && (
        <span className="text-error-foreground">
          -{formatDiffCount(removed)}
        </span>
      )}
    </span>
  );
}
