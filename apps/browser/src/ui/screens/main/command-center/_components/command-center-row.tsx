import { cn } from '@ui/utils';
import type { CommandCenterItem } from '../command-center-model';

function compactTimeAgo(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 5) return `${diffWeek}w`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo`;
  return `${Math.floor(diffDay / 365)}y`;
}

export function CommandCenterRow({
  item,
  selected,
  onSelect,
  onHover,
  onRef,
}: {
  item: CommandCenterItem;
  selected: boolean;
  onSelect: () => void;
  onHover: () => void;
  onRef: (node: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={onRef}
      type="button"
      onClick={onSelect}
      onMouseEnter={onHover}
      className={cn(
        'grid w-full grid-cols-[1rem_1fr] items-center gap-2 rounded-md bg-background px-2 py-1 text-left text-xs outline-none transition-colors duration-150 ease-out',
        selected ? 'bg-surface-1' : 'hover:bg-hover-derived',
      )}
    >
      <span className="flex size-4 items-center justify-center text-muted-foreground">
        {item.icon}
      </span>
      <span className="min-w-0">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate font-medium text-foreground">
            {item.title}
          </span>
          {item.kind === 'agent' && item.lastMessageAt > 0 && (
            <span className="shrink-0 text-subtle-foreground tabular-nums">
              {compactTimeAgo(item.lastMessageAt)}
            </span>
          )}
        </span>
        {item.subtitle && (
          <span className="block truncate font-normal text-subtle-foreground text-xs">
            {item.subtitle}
          </span>
        )}
      </span>
    </button>
  );
}
