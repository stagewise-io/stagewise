import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { useMemo } from 'react';

interface ContextUsageRingProps {
  percentage: number;
  usedKb: number;
  maxKb: number;
}

export function ContextUsageRing({
  percentage,
  usedKb,
  maxKb,
}: ContextUsageRingProps) {
  const ringColor = useMemo(() => {
    if (percentage >= 90) return 'text-error';
    if (percentage >= 70) return 'text-warning';
    return 'text-primary';
  }, [percentage]);

  const size = 16;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <Tooltip>
      <TooltipTrigger>
        <div className="relative flex shrink-0 items-center justify-center">
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
              className="text-muted-foreground/20"
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
