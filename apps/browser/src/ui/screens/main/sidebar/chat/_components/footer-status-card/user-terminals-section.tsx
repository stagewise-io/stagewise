import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import {
  AlertCircleIcon,
  ChevronDownIcon,
  PlusIcon,
  TerminalIcon,
  XIcon,
} from 'lucide-react';
import { cn } from '@ui/utils';
import type { ShellSessionSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import type { StatusCardSection } from './shared';

export interface UserTerminalsSectionProps {
  sessions: ShellSessionSnapshot[];
  /** Stop a still-running session (PTY is killed, row stays visible). */
  onKill: (sessionId: string) => void;
  /** Drop an exited row. Separate from kill so the user can read the exit code first. */
  onRemove: (sessionId: string) => void;
  onOpenTerminal: (sessionId: string) => void;
  onCreateTerminal: () => void;
  /** Last action error (e.g. cap reached). Shown above the "+ New terminal" button until cleared. */
  error: string | null;
  onDismissError: () => void;
}

const PATH_SEP_RE = /[/\\]/;

function SessionRow({
  session,
  onKill,
  onRemove,
  onOpenTerminal,
}: {
  session: ShellSessionSnapshot;
  onKill: (sessionId: string) => void;
  onRemove: (sessionId: string) => void;
  onOpenTerminal: (sessionId: string) => void;
}) {
  const cwdBasename = session.cwd
    ? session.cwd.split(PATH_SEP_RE).pop() || session.cwd
    : '';

  const lastLine = session.lastLine ?? '';
  const isExited = session.exited;

  // Same X glyph for kill and remove — keeps the row from shifting
  // visually the moment a session exits.
  const handleAction = isExited ? onRemove : onKill;
  const tooltipLabel = isExited ? 'Remove from list' : 'Kill terminal';

  return (
    <div
      className={cn(
        'flex w-full flex-row items-center gap-1.5 rounded px-1 py-0.5 text-foreground text-xs',
        isExited && 'opacity-60',
      )}
      onClick={() => onOpenTerminal(session.id)}
    >
      {cwdBasename && (
        <span className="max-w-20 shrink-0 truncate font-mono text-muted-foreground">
          {cwdBasename}
        </span>
      )}
      {isExited ? (
        <span className="min-w-0 flex-1 truncate text-subtle-foreground">
          ended
          {typeof session.exitCode === 'number'
            ? ` · code ${session.exitCode}`
            : ''}
        </span>
      ) : (
        lastLine && (
          <span className="mask-[linear-gradient(to_left,transparent_0px,black_24px)] min-w-0 flex-1 overflow-x-hidden whitespace-nowrap text-subtle-foreground">
            {lastLine}
          </span>
        )
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => {
                e.stopPropagation();
                handleAction(session.id);
              }}
            >
              <XIcon className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{tooltipLabel}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function UserTerminalsContent(props: UserTerminalsSectionProps) {
  const {
    sessions,
    onKill,
    onRemove,
    onOpenTerminal,
    onCreateTerminal,
    error,
    onDismissError,
  } = props;
  return (
    <div className="pt-1">
      {sessions.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          onKill={onKill}
          onRemove={onRemove}
          onOpenTerminal={onOpenTerminal}
        />
      ))}
      {error && (
        <div
          role="alert"
          className="mx-1 mt-1 flex flex-row items-start gap-1.5 rounded border border-destructive/30 bg-destructive/5 px-1.5 py-1 text-destructive text-xs"
        >
          <AlertCircleIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              onDismissError();
            }}
          >
            <XIcon className="size-3" />
          </Button>
        </div>
      )}
      <div className="px-1 pt-1">
        <Button
          variant="ghost"
          size="xs"
          className="h-6 w-full justify-start gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onCreateTerminal();
          }}
        >
          <PlusIcon className="size-3" />
          <span className="text-xs">New terminal</span>
        </Button>
      </div>
    </div>
  );
}

/**
 * Always renders — the "+ New terminal" button is the entry point for
 * the first session. Header counts active sessions only, but the list
 * keeps exited rows visible so a crashed dev server can be inspected.
 */
export function UserTerminalsSection(
  props: UserTerminalsSectionProps,
): StatusCardSection {
  const activeCount = props.sessions.filter((s) => !s.exited).length;

  let triggerLabel: string;
  if (activeCount === 0) {
    triggerLabel = 'Your terminals';
  } else if (activeCount === 1) {
    triggerLabel = '1 terminal';
  } else {
    triggerLabel = `${activeCount} terminals`;
  }

  return {
    key: 'user-terminals',
    defaultOpen: false,
    scrollable: true,
    contentClassName: 'px-0',
    trigger: (isOpen: boolean) => (
      <div className="flex h-6 w-full flex-row items-center justify-between gap-2 pl-1.5 text-muted-foreground text-xs hover:text-foreground has-[button:hover]:text-muted-foreground">
        <div className="flex flex-row items-center gap-2">
          <ChevronDownIcon
            className={cn(
              'size-3 shrink-0 transition-transform duration-50',
              isOpen && 'rotate-180',
            )}
          />
          <TerminalIcon className="size-3 shrink-0" />
          <span>{triggerLabel}</span>
        </div>
      </div>
    ),
    content: <UserTerminalsContent {...props} />,
  };
}
