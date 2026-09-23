import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { memo, useMemo } from 'react';
import { cn } from '@ui/utils';

interface ContextUsageRingProps {
  percentage: number;
  usedKb: number;
  maxKb: number;
  /**
   * When provided, the ring becomes a button that triggers history
   * compression on click.
   */
  onCompact?: () => void;
  /** Disables the trigger and shows a "compacting" hint while in flight. */
  compacting?: boolean;
  className?: string;
}

export const ContextUsageRing = memo(function ContextUsageRing({
  percentage,
  usedKb,
  maxKb,
  onCompact,
  compacting = false,
  className,
}: ContextUsageRingProps) {
  const ringColor = useMemo(() => {
    if (percentage >= 90) return 'text-error-foreground';
    if (percentage >= 70) return 'text-warning-foreground';
    return 'text-primary-foreground';
  }, [percentage]);

  const size = 16;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const ring = (
    <svg
      width={size}
      height={size}
      className={cn(
        'transition-all duration-300 ease-out',
        compacting && 'animate-pulse',
      )}
    >
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-surface-1 dark:text-surface-2"
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        className={`${ringColor} transition-all duration-300 ease-out`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );

  return (
    <Tooltip>
      <TooltipTrigger>
        {onCompact ? (
          <button
            type="button"
            onClick={onCompact}
            disabled={compacting}
            aria-label="Compact conversation history"
            className={cn(
              'relative flex shrink-0 cursor-pointer items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-foreground disabled:cursor-progress',
              className,
            )}
          >
            {ring}
          </button>
        ) : (
          <div
            className={cn(
              'relative flex shrink-0 items-center justify-center',
              className,
            )}
          >
            {ring}
          </div>
        )}
      </TooltipTrigger>
      <TooltipContent>
        <span className="flex flex-col gap-0.5">
          <span>
            {percentage}% - {usedKb}k / {maxKb}k used
          </span>
          {onCompact && (
            <span className="text-muted-foreground">
              {compacting ? 'Compacting history…' : 'Click to compact history'}
            </span>
          )}
        </span>
      </TooltipContent>
    </Tooltip>
  );
});
