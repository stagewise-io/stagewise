import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { useMemo } from 'react';
import { cn } from '@/utils';

interface ContextUsageRingProps {
  percentage: number;
  usedKb: number;
  maxKb: number;
  className?: string;
}

export function ContextUsageRing({
  percentage,
  usedKb,
  maxKb,
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

  return (
    <Tooltip>
      <TooltipTrigger>
        <div
          className={cn(
            'relative flex shrink-0 items-center justify-center',
            className,
          )}
        >
          <svg
            width={size}
            height={size}
            className="transition-all duration-300 ease-out"
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
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {percentage}% - {usedKb}k / {maxKb}k used
      </TooltipContent>
    </Tooltip>
  );
}
