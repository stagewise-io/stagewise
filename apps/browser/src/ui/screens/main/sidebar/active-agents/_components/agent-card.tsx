import { forwardRef, memo, useCallback, useState } from 'react';
import { cn } from '@ui/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { Button } from '@stagewise/stage-ui/components/button';
import { IconTrash2Outline24 } from 'nucleo-core-outline-24';
import { IconSleepingTimeOutline18 } from 'nucleo-ui-outline-18';
import { DeleteConfirmPopover } from '../../_components/delete-confirm-popover';
import { useInlineTitleEdit } from './use-inline-title-edit';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';

TimeAgo.addLocale(en);
const timeAgo = new TimeAgo('en-US');

export interface AgentCardProps {
  id: string;
  title: string;
  isActive: boolean;
  isWorking: boolean;
  isWaitingForUser: boolean;
  hasError: boolean;
  hasUnseen: boolean;
  activityText: string;
  activityIsUserInput: boolean;
  lastMessageAt: number;
  onClick: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  /** Optional hover/pointer callbacks — used by `AgentCardWithPreview` to
   *  drive the hover-preview without introducing a wrapping element that
   *  would disrupt the parent grid layout. */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onMouseDown?: () => void;
}

export function AgentCardSkeleton() {
  return (
    <div className="flex min-w-0 shrink-0 flex-col gap-0.5 rounded-md bg-surface-2 px-2 py-1.5 ring-2 ring-derived-subtle ring-inset">
      <div className="h-4 w-3/5 animate-pulse rounded bg-surface-3" />
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
      isWorking,
      isWaitingForUser,
      hasError,
      hasUnseen,
      activityText,
      activityIsUserInput,
      lastMessageAt,
      onClick,
      onArchive,
      onDelete,
      onRename,
      onMouseEnter,
      onMouseLeave,
      onMouseDown,
    },
    ref,
  ) {
    const subtitle = hasError ? 'Error' : activityText;
    const [deleteOpen, setDeleteOpen] = useState(false);

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
        ref={ref}
        role="button"
        tabIndex={0}
        data-agent-id={id}
        aria-keyshortcuts="F2"
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
          // Otherwise, nested buttons (archive/delete) would also trigger this.
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
          'group/card relative flex min-w-0 shrink-0 flex-col gap-0.5 rounded-md bg-surface-1 px-2 py-1.5 text-left transition-colors hover:bg-surface-2',
          isActive
            ? 'cursor-default bg-surface-2 ring-2 ring-derived-subtle ring-inset'
            : 'cursor-pointer',
          hasUnseen && 'animate-ring-pulse-primary',
        )}
      >
        {/* Title row */}
        <div className="flex min-w-0 items-center gap-1">
          {isEditing ? (
            <span
              ref={titleRef}
              role="textbox"
              contentEditable
              suppressContentEditableWarning
              className="block min-w-0 flex-1 cursor-text overflow-x-clip text-ellipsis whitespace-nowrap bg-transparent p-0 text-left font-medium text-foreground text-xs leading-normal outline-none"
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
              className="block min-w-0 max-w-full cursor-pointer overflow-x-clip text-ellipsis whitespace-nowrap bg-transparent p-0 text-left font-medium text-foreground text-xs leading-normal outline-none"
              onClick={(e) => {
                if (!isActive) return;
                e.stopPropagation();
                startEditing();
              }}
              onPointerDown={(e) => {
                if (!isActive) return;
                e.stopPropagation();
              }}
            >
              {displayTitle}
            </button>
          )}
        </div>

        <div className="flex w-full items-baseline gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 overflow-x-clip text-ellipsis whitespace-nowrap text-muted-foreground text-xs leading-normal',
              isWorking &&
                !isWaitingForUser &&
                'shimmer-text-primary font-medium',
              hasError && 'text-error-foreground',
              activityIsUserInput && 'italic',
            )}
          >
            {subtitle || '\u00A0'}
          </span>
          {lastMessageAt > 0 && (
            <span className="shrink-0 whitespace-nowrap text-subtle-foreground text-xs leading-normal">
              {timeAgo.format(lastMessageAt)}
            </span>
          )}
        </div>

        <div className="absolute inset-y-[2px] right-[2px] flex items-center gap-1 rounded-r-[calc(var(--radius-md)-2px)] bg-linear-to-r from-transparent to-[20px] to-surface-2 pr-2 pl-6 opacity-0 transition-opacity focus-within:opacity-100 group-hover/card:opacity-100">
          <Tooltip>
            <TooltipTrigger delay={500}>
              <Button
                variant="ghost"
                size="icon-xs"
                className="archive-btn text-muted-foreground hover:text-foreground"
                aria-label="Suspend agent"
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive(id);
                }}
              >
                <IconSleepingTimeOutline18 className="size-4 cursor-pointer" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <span>Suspend agent (can be recovered)</span>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger delay={500}>
              <Button
                variant="ghost"
                size="icon-xs"
                className="delete-btn text-muted-foreground hover:text-foreground"
                aria-label="Delete agent permanently"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteOpen(true);
                }}
              >
                <IconTrash2Outline24 className="size-4 cursor-pointer" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <span>Delete agent permanently</span>
            </TooltipContent>
          </Tooltip>
          <DeleteConfirmPopover
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            onConfirm={() => {
              setDeleteOpen(false);
              onDelete(id);
            }}
          />
        </div>
      </div>
    );
  }),
  // Skip `onClick` / `onArchive` / `onDelete` / `onRename` in comparison —
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
    prev.isWorking === next.isWorking &&
    prev.isWaitingForUser === next.isWaitingForUser &&
    prev.hasError === next.hasError &&
    prev.hasUnseen === next.hasUnseen &&
    prev.activityText === next.activityText &&
    prev.activityIsUserInput === next.activityIsUserInput &&
    prev.lastMessageAt === next.lastMessageAt &&
    prev.onMouseEnter === next.onMouseEnter &&
    prev.onMouseLeave === next.onMouseLeave &&
    prev.onMouseDown === next.onMouseDown,
);
