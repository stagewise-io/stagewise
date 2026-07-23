import type { ComponentProps } from 'react';
import { cn } from '@ui/utils';
import {
  getSeverityDotClass,
  type AgentStateSeverity,
} from '../_lib/agent-list-model';

type AgentStatusDotProps = ComponentProps<'span'> & {
  severity: AgentStateSeverity | null;
};

export function AgentStatusDot({
  severity,
  className,
  ...props
}: AgentStatusDotProps) {
  const color = getSeverityDotClass(severity);
  if (!color) return null;

  return (
    <span
      {...props}
      className={cn('relative size-2 shrink-0 transition-opacity', className)}
    >
      <span className={cn('block size-full rounded-full', color)} />
      <span
        className={cn(
          'absolute inset-0 block size-full animate-ping rounded-full',
          color,
        )}
      />
    </span>
  );
}
