import { forwardRef, memo, useCallback } from 'react';
import { cn } from '@ui/utils';
import { buttonVariants } from '@stagewise/stage-ui/components/button';
import {
  type SharedAgentContextMenuState,
  buildAgentContextMenuHandler,
} from '../../../_components/shared-agent-context-menu';
import {
  IconPinTackOutline18,
  IconPinTackSlashOutline18,
} from 'nucleo-ui-outline-18';
import { useInlineTitleEdit } from './use-inline-title-edit';

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

export interface AgentCardProps {
  id: string;
  title: string;
  isActive: boolean;
  isPreviewActive?: boolean;
  isWorking: boolean;
  isWaitingForUser: boolean;
  hasError: boolean;
  hasUnseen: boolean;
  activityText: string;
  activityIsUserInput: boolean;
  lastMessageAt: number;
  /** Shared context-menu controller owned by the enclosing grid. */
  contextMenuState: SharedAgentContextMenuState;
  onClick: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  isPinned?: boolean;
  onTogglePinned?: (id: string) => void;
  /** Optional hover/pointer callbacks — used by `AgentCardWithPreview` to
   *  drive the hover-preview without introducing a wrapping element that
   *  would disrupt the parent grid layout. */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onMouseDown?: () => void;
}

export function AgentCardSkeleton() {
  return (
    <div
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'sm' }),
        'justify-start pl-1.5 text-muted-foreground hover:bg-base-500/10',
      )}
    >
      <div className="h-4 w-2/5 animate-pulse rounded bg-surface-3" />
    </div>
  );
}

export const AgentCard = memo(
  forwardRef<HTMLDivElement, AgentCardProps>(function AgentCard(
    {
      id,
      title,
      isActive,
      isPreviewActive = false,
      isWorking,
      isWaitingForUser,
      hasError,
      hasUnseen,
      lastMessageAt,
      contextMenuState,
      onClick,
      onRename,
      isPinned = false,
      onTogglePinned,
      onMouseEnter,
      onMouseLeave,
      onMouseDown,
    },
    ref,
  ) {
    const handleCommitRename = useCallback(
      (newTitle: string) => onRename(id, newTitle),
      [id, onRename],
    );
    const {
      isEditing,
      titleRef,
      displayTitle,
      startEditing,
      commitEdit,
      cancelEdit,
    } = useInlineTitleEdit({ title, onCommit: handleCommitRename });

    return (
      <div
        role="button"
        ref={ref}
        tabIndex={0}
        data-agent-id={id}
        aria-keyshortcuts="F2"
        onContextMenu={buildAgentContextMenuHandler(
          contextMenuState,
          id,
          startEditing,
          isPinned,
          onTogglePinned,
        )}
        onClick={() => onClick(id)}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onMouseDown={onMouseDown}
        onDoubleClick={(e) => {
          if (!isActive) return;
          e.stopPropagation();
          if (!isEditing) startEditing();
        }}
        onKeyDown={(e) => {
          // Only handle keyboard interaction when the card itself is focused.
          // Otherwise, nested interactive elements would also trigger this.
          if (e.currentTarget !== e.target) return;

          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(id);
          } else if (e.key === 'F2' && !isEditing && isActive) {
            // F2 is the standard rename shortcut across Finder/Explorer/VS Code.
            // Only allow rename on the active agent — consistent with click/double-click.
            e.preventDefault();
            startEditing();
          }
        }}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          'group/card relative justify-start pl-1.5 text-start text-muted-foreground hover:bg-foreground/8',
          isPreviewActive && !isActive && 'bg-foreground/8 text-foreground',
          isActive && 'bg-foreground/5 text-foreground',
        )}
      >
        {(() => {
          // Priority: error > waitingForUser > working > unseen > idle
          const dotColor = hasError
            ? 'bg-error-solid'
            : isWaitingForUser
              ? 'bg-warning-solid'
              : isWorking
                ? 'bg-primary-solid'
                : hasUnseen
                  ? 'bg-success-solid'
                  : null;
          return (
            <div className="relative flex size-4 shrink-0 items-center justify-center dark:brightness-125">
              {dotColor ? (
                <div
                  className={cn(
                    'relative size-2 shrink-0 transition-opacity',
                    onTogglePinned && 'group-hover/card:opacity-0',
                  )}
                >
                  <div className={cn('size-full rounded-full', dotColor)} />
                  <div
                    className={cn(
                      'absolute inset-0 size-full animate-ping rounded-full',
                      dotColor,
                    )}
                  />
                </div>
              ) : null}
              {onTogglePinned ? (
                <button
                  type="button"
                  data-no-dnd="true"
                  aria-label={isPinned ? 'Unpin agent' : 'Pin agent'}
                  title={isPinned ? 'Unpin agent' : 'Pin agent'}
                  className={cn(
                    'absolute inset-0 flex cursor-pointer items-center justify-center rounded-sm',
                    'text-muted-foreground/60 opacity-0 outline-none transition-[color,opacity]',
                    'hover:text-foreground focus-visible:text-foreground focus-visible:opacity-100 group-hover/card:opacity-100',
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onTogglePinned(id);
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                  }}
                >
                  {isPinned ? (
                    <IconPinTackSlashOutline18 className="size-3.5" />
                  ) : (
                    <IconPinTackOutline18 className="size-3.5" />
                  )}
                </button>
              ) : null}
            </div>
          );
        })()}
        <div className="mask-alpha mask-l-from-black mask-l-to-black group-hover/card:mask-l-from-transparent mask-l-from-12 mask-l-to-18 min-w-0 flex-1">
          {isEditing ? (
            <span
              ref={titleRef}
              role="textbox"
              contentEditable
              data-no-dnd="true"
              suppressContentEditableWarning
              className="block min-w-0 flex-1 cursor-text overflow-x-clip truncate text-ellipsis whitespace-nowrap bg-transparent p-0 text-left text-sm leading-normal outline-none"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  // Commit directly rather than via blur() for parity with
                  // AgentsSelector — keeps both surfaces exiting edit mode
                  // synchronously regardless of any surrounding focus trap.
                  commitEdit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              onBlur={commitEdit}
              onPaste={(e) => {
                e.preventDefault();
                const text = e.clipboardData.getData('text/plain');
                document.execCommand('insertText', false, text);
              }}
            >
              {displayTitle}
            </span>
          ) : (
            <button
              type="button"
              tabIndex={-1}
              className="block min-w-0 max-w-full shrink cursor-pointer overflow-x-clip truncate text-ellipsis whitespace-nowrap bg-transparent p-0 text-left text-sm leading-normal outline-none"
              onClick={(e) => {
                if (!isActive) return;
                e.stopPropagation();
                startEditing();
              }}
            >
              {displayTitle}
            </button>
          )}
        </div>

        {lastMessageAt > 0 && (
          <div className="absolute inset-y-[2px] right-[2px] flex items-center pr-1.5 opacity-0 transition-opacity group-hover/card:opacity-100">
            <span className="text-muted-foreground/60 text-xs tabular-nums">
              {compactTimeAgo(lastMessageAt)}
            </span>
          </div>
        )}
      </div>
    );
  }),
  // Skip `onClick` / `onRename` in comparison —
  // their behavior is stable (always call the same RPC with the card's
  // `id`) but identity changes every render due to upstream
  // `useKartonProcedure` selectors.
  //
  // Hover handlers (`onMouseEnter` / `onMouseLeave` / `onMouseDown`) ARE
  // compared strictly: `AgentCardWithPreview` wraps them in `useCallback`
  // with stable deps and mirrors any closed-over state through a ref, so
  // their identity is stable across renders in the common case. Including
  // them here gives us a correctness safety net — if a future change makes
  // a handler legitimately change identity (e.g. a new dep is added), the
  // DOM binding updates instead of silently using a stale reference.
  (prev, next) =>
    prev.id === next.id &&
    prev.title === next.title &&
    prev.isActive === next.isActive &&
    prev.isPreviewActive === next.isPreviewActive &&
    prev.isWorking === next.isWorking &&
    prev.isWaitingForUser === next.isWaitingForUser &&
    prev.hasError === next.hasError &&
    prev.hasUnseen === next.hasUnseen &&
    prev.activityText === next.activityText &&
    prev.activityIsUserInput === next.activityIsUserInput &&
    prev.lastMessageAt === next.lastMessageAt &&
    prev.isPinned === next.isPinned &&
    prev.onTogglePinned === next.onTogglePinned &&
    prev.onMouseEnter === next.onMouseEnter &&
    prev.onMouseLeave === next.onMouseLeave &&
    prev.onMouseDown === next.onMouseDown,
);
