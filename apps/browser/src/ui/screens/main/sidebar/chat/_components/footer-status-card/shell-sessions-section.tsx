import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { ChevronDownIcon, TerminalIcon, XIcon } from 'lucide-react';
import { cn } from '@ui/utils';
import type { ShellSessionSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import type { StatusCardSection } from './shared';

export interface ShellSessionsSectionProps {
  sessions: ShellSessionSnapshot[];
  onKill: (sessionId: string) => void;
  onOpenTerminal: (sessionId: string) => void;
}

const PATH_SEP_RE = /[/\\]/;

function SessionRow({
  session,
  onKill,
  onOpenTerminal,
}: {
  session: ShellSessionSnapshot;
  onKill: (sessionId: string) => void;
  onOpenTerminal: (sessionId: string) => void;
}) {
  const cwdBasename = session.cwd
    ? session.cwd.split(PATH_SEP_RE).pop() || session.cwd
    : '';

  const lastLine = session.lastLine ?? '';

  return (
    <div
      className="flex w-full cursor-pointer flex-row items-center gap-1.5 rounded px-1 py-0.5 text-foreground text-xs hover:bg-surface-1"
      onClick={() => onOpenTerminal(session.id)}
    >
      {/* CWD */}
      {cwdBasename && (
        <span className="max-w-20 shrink-0 truncate font-mono text-muted-foreground">
          {cwdBasename}
        </span>
      )}

      {/* Last output line with right-edge fade */}
      {lastLine && (
        <span className="mask-[linear-gradient(to_left,transparent_0px,black_24px)] min-w-0 flex-1 overflow-x-hidden whitespace-nowrap text-subtle-foreground">
          {lastLine}
        </span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => {
                e.stopPropagation();
                onKill(session.id);
              }}
            >
              <XIcon className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Kill session</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function ShellSessionsContent(props: ShellSessionsSectionProps) {
  const { sessions, onKill } = props;
  return (
    <div className="pt-1">
      {sessions.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          onKill={onKill}
          onOpenTerminal={props.onOpenTerminal}
        />
      ))}
    </div>
  );
}

export function ShellSessionsSection(
  props: ShellSessionsSectionProps,
): StatusCardSection | null {
  const activeSessions = props.sessions.filter((s) => !s.exited);
  if (activeSessions.length === 0) return null;

  const triggerLabel =
    activeSessions.length === 1
      ? '1 shell session'
      : `${activeSessions.length} shell sessions`;

  return {
    key: 'shell-sessions',
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
    content: <ShellSessionsContent {...props} sessions={activeSessions} />,
  };
}
