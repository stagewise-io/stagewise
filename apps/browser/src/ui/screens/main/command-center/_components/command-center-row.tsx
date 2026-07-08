import { useCallback, useEffect, type ReactNode } from 'react';
import { IconPinTackFill18 } from '@stagewise/icons';
import { useInlineTitleEdit } from '../../_lib/use-inline-title-edit';
import { cn } from '@ui/utils';
import type {
  AgentCommandItem,
  CommandCenterItem,
  FileContentMatch,
} from '../command-center-model';

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
  if (diffDay < 365) return `${diffMonth}mo`;
  return `${Math.floor(diffDay / 365)}y`;
}

export function CommandCenterRow({
  item,
  selected,
  isRenaming,
  onSelect,
  onHover,
  onRef,
  onCancelRename,
  onCommitRename,
}: {
  item: CommandCenterItem;
  selected: boolean;
  isRenaming: boolean;
  onSelect: () => void;
  onHover: () => void;
  onRef: (node: HTMLDivElement | null) => void;
  onCancelRename: () => void;
  onCommitRename: (agentId: string, newTitle: string) => void;
}) {
  const agentStatusColor = (() => {
    if (item.kind !== 'agent') return null;
    if (item.hasError) return 'bg-error-solid';
    if (item.isWaitingForUser) return 'bg-warning-solid';
    if (item.isWorking) return 'bg-primary-solid';
    if (item.unread) return 'bg-success-solid';
    return null;
  })();

  return (
    <div
      ref={onRef}
      role="button"
      tabIndex={-1}
      aria-disabled={isRenaming || item.disabled || undefined}
      onClick={() => {
        if (isRenaming || item.disabled) return;
        onSelect();
      }}
      onMouseEnter={onHover}
      className={cn(
        'grid w-full grid-cols-[1rem_1fr_auto] items-center gap-2 rounded-md bg-background px-2 py-1 text-left text-xs outline-none transition-colors duration-150 ease-out',
        selected ? 'bg-surface-1' : 'hover:bg-hover-derived',
      )}
    >
      <span className="flex size-4 items-center justify-center text-muted-foreground dark:brightness-125">
        {agentStatusColor ? (
          <span className="relative size-2 shrink-0">
            <span
              className={cn('block size-full rounded-full', agentStatusColor)}
            />
            <span
              className={cn(
                'absolute inset-0 block size-full animate-ping rounded-full',
                agentStatusColor,
              )}
            />
          </span>
        ) : (
          item.icon
        )}
      </span>
      <span className="min-w-0">
        <span className="flex min-w-0 items-baseline gap-1.5">
          {item.kind === 'agent' ? (
            <CommandCenterAgentTitle
              isRenaming={isRenaming}
              item={item}
              onCancelRename={onCancelRename}
              onCommitRename={onCommitRename}
            />
          ) : (
            <span className="truncate font-medium text-foreground">
              {item.title}
            </span>
          )}
          {item.kind === 'agent' && item.lastMessageAt > 0 && (
            <span className="shrink-0 text-subtle-foreground tabular-nums">
              {compactTimeAgo(item.lastMessageAt)}
            </span>
          )}
        </span>
        {item.kind === 'file' && item.contentMatches?.length ? (
          <CommandCenterFileContentMatches
            matches={item.contentMatches}
            query={item.contentMatchQuery ?? ''}
          />
        ) : (
          item.subtitle && (
            <span className="block truncate font-normal text-subtle-foreground text-xs">
              {item.subtitle}
            </span>
          )
        )}
      </span>
      {((item.kind === 'agent' && item.isPinned) ||
        (item.kind === 'tab' && item.isPinned)) && (
        <span
          aria-hidden="true"
          className="flex size-4 items-center justify-center text-subtle-foreground"
        >
          <IconPinTackFill18 className="size-3.5" />
        </span>
      )}
    </div>
  );
}

function CommandCenterFileContentMatches({
  matches,
  query,
}: {
  matches: FileContentMatch[];
  query: string;
}) {
  return (
    <span className="block space-y-0.5 font-normal text-subtle-foreground text-xs">
      {matches.map((match) => (
        <span key={match.lineNumber} className="block truncate">
          <span className="text-muted-foreground tabular-nums">
            {match.lineNumber}:
          </span>{' '}
          <HighlightedContentLine line={match.line} query={query} />
        </span>
      ))}
    </span>
  );
}

function HighlightedContentLine({
  line,
  query,
}: {
  line: string;
  query: string;
}) {
  const normalizedQuery = query.toLowerCase();
  if (!normalizedQuery) return <>{line.trim()}</>;

  const normalizedLine = line.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = normalizedLine.indexOf(normalizedQuery);

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      parts.push(line.slice(cursor, matchIndex));
    }
    const end = matchIndex + query.length;
    parts.push(
      <mark
        key={`${matchIndex}-${end}`}
        className="rounded-sm bg-primary-solid/20 px-0.5 text-primary-foreground"
      >
        {line.slice(matchIndex, end)}
      </mark>,
    );
    cursor = end;
    matchIndex = normalizedLine.indexOf(normalizedQuery, cursor);
  }

  if (cursor < line.length) parts.push(line.slice(cursor));

  return <>{parts.length > 0 ? parts : line.trim()}</>;
}

function CommandCenterAgentTitle({
  item,
  isRenaming,
  onCancelRename,
  onCommitRename,
}: {
  item: AgentCommandItem;
  isRenaming: boolean;
  onCancelRename: () => void;
  onCommitRename: (agentId: string, newTitle: string) => void;
}) {
  const handleCommitRename = useCallback(
    (newTitle: string) => onCommitRename(item.agentId, newTitle),
    [item.agentId, onCommitRename],
  );
  const {
    isEditing,
    titleRef,
    displayTitle,
    startEditing,
    commitEdit,
    cancelEdit,
  } = useInlineTitleEdit({ title: item.title, onCommit: handleCommitRename });

  useEffect(() => {
    if (isRenaming && !isEditing) startEditing();
  }, [isEditing, isRenaming, startEditing]);

  useEffect(() => {
    if (!isRenaming && isEditing) cancelEdit();
  }, [cancelEdit, isEditing, isRenaming]);

  if (!isEditing) {
    return (
      <span className="truncate font-medium text-foreground">
        {displayTitle}
      </span>
    );
  }

  return (
    <span
      ref={titleRef}
      role="textbox"
      contentEditable
      suppressContentEditableWarning
      className="truncate bg-transparent p-0 text-left font-medium text-foreground outline-none"
      onBlur={() => {
        commitEdit();
        onCancelRename();
      }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          commitEdit();
          onCancelRename();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancelEdit();
          onCancelRename();
        }
      }}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        const selection = window.getSelection();
        if (!selection?.rangeCount) return;
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        selection.removeAllRanges();
        selection.addRange(range);
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {displayTitle}
    </span>
  );
}
