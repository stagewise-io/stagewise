import { memo, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import type { WatcherEventMetadata } from '@shared/karton-contracts/ui/agent/metadata';
import { formatDuration } from '@ui/utils/format-duration';
import { cn } from '@ui/utils';
import { ToolPartUI } from './message-part-ui/tools/shared/tool-part-ui';

const OUTCOME_DISPLAY = {
  triggered: {
    label: 'Watcher triggered',
    color: 'text-success-foreground',
  },
  failed: {
    label: 'Watcher failed',
    color: 'text-error-foreground',
  },
  timed_out: {
    label: 'Watcher timed out',
    color: 'text-warning-foreground',
  },
} as const;

export const MessageUserWatcherEvent = memo(function MessageUserWatcherEvent({
  event,
}: {
  event: WatcherEventMetadata;
}) {
  const [expanded, setExpanded] = useState(true);
  const display = OUTCOME_DISPLAY[event.outcome];
  const outcomeLabel =
    event.outcome === 'failed' && event.exitCode !== null
      ? `${display.label} (exit ${event.exitCode})`
      : display.label;
  const elapsed = formatDuration(event.elapsedMs);

  return (
    <ToolPartUI
      className="mt-2 border-border-subtle bg-background shadow-elevation-1 dark:bg-surface-1"
      triggerClassName="h-auto items-stretch rounded-b-none border-b-0 bg-background p-0 text-left hover:bg-background active:bg-background dark:bg-surface-1 dark:hover:bg-surface-1 dark:active:bg-surface-1"
      hideChevron
      showBorder
      flushContent
      expanded={expanded}
      setExpanded={setExpanded}
      autoScroll={false}
      trigger={
        <div className="flex w-full px-3 py-2.5 text-left">
          <div className="flex min-w-0 flex-1 flex-col items-start">
            <div
              className={cn('flex items-center gap-1 text-xs', display.color)}
            >
              <span className="size-1.5 rounded-full bg-current" />
              <span>{outcomeLabel}</span>
              <ChevronDownIcon
                className={cn(
                  'size-3 text-subtle-foreground transition-transform duration-150',
                  expanded && 'rotate-180',
                )}
              />
            </div>
            <div className="mt-1 max-w-full truncate text-foreground text-sm">
              {event.title}
            </div>
            {event.description ? (
              <div className="mt-1 line-clamp-3 max-w-full whitespace-pre-wrap text-muted-foreground text-xs leading-4">
                {event.description}
              </div>
            ) : null}
            <span className="mt-1.5 text-subtle-foreground text-xs tabular-nums">
              after {elapsed}
            </span>
          </div>
        </div>
      }
      content={
        <pre className="whitespace-pre-wrap break-all bg-background px-3 py-2 font-mono text-muted-foreground text-xs dark:bg-surface-1">
          {event.output || 'No output'}
        </pre>
      }
      contentClassName="py-0!"
    />
  );
});
