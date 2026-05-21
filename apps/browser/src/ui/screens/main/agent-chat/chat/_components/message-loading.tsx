import { cn } from '@ui/utils';
import {
  IconBranchOutOutline18,
  IconCodeBranchOutline18,
} from 'nucleo-ui-outline-18';
import { BrainIcon } from 'lucide-react';

type MessageLoadingVariant = 'working' | 'worktree' | 'branch';

export function MessageLoading({
  label = 'Working...',
  variant = 'working',
}: {
  label?: string;
  variant?: MessageLoadingVariant;
}) {
  const iconClassName = cn(
    'size-3',
    'animate-icon-pulse text-primary-foreground',
  );
  const Icon =
    variant === 'worktree'
      ? IconBranchOutOutline18
      : variant === 'branch'
        ? IconCodeBranchOutline18
        : BrainIcon;

  return (
    <div className="mt-2 flex flex-row items-center gap-2">
      <div className="flex flex-row items-center justify-start gap-1 py-1.5">
        <Icon className={iconClassName} />
        <div className="shimmer-text-primary w-fit text-xs">{label}</div>
      </div>
    </div>
  );
}
