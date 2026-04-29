import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { TerminalIcon } from 'lucide-react';
import { TerminalHeader } from './_components/terminal-header';
import { TerminalSurface } from './_components/terminal-surface';
import type { ShellOwnership } from './_components/ownership-capsule';
import type { ShellSessionInfo } from '@shared/karton-contracts/pages-api';

const PATH_SEP_RE = /[/\\]/;

export const Route = createFileRoute('/terminal/$agentInstanceId/$sessionId')({
  component: TerminalPage,
  head: () => ({ meta: [{ title: 'Terminal' }] }),
});

function TerminalPage() {
  const { agentInstanceId, sessionId } = Route.useParams();
  const [info, setInfo] = useState<ShellSessionInfo | null>(null);
  const [exited, setExited] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Use the cwd basename in the tab title so multiple terminals are
  // distinguishable. Falls back to the short session id pre-load.
  useEffect(() => {
    const basename = info?.cwd
      ? info.cwd.split(PATH_SEP_RE).filter(Boolean).pop()
      : null;
    document.title = basename
      ? `Terminal · ${basename}`
      : `Terminal · ${sessionId.slice(0, 8)}`;
  }, [info?.cwd, sessionId]);

  // Exit beats agent-busy beats user-control.
  const ownership: ShellOwnership = exited
    ? 'exited'
    : agentBusy
      ? 'agent'
      : 'user';

  const handleInfo = useCallback((next: ShellSessionInfo | null) => {
    setInfo(next);
  }, []);
  const handleExitState = useCallback(
    (nextExited: boolean, nextExitCode: number | null) => {
      setExited(nextExited);
      setExitCode(nextExitCode);
    },
    [],
  );
  const handleAgentBusy = useCallback((busy: boolean) => {
    setAgentBusy(busy);
  }, []);
  const handleNotFound = useCallback(() => setNotFound(true), []);

  if (notFound) {
    return (
      <main
        role="status"
        className="flex h-full flex-col items-center justify-center gap-3 bg-background px-6 text-center dark:bg-surface-1"
      >
        <TerminalIcon className="size-8 text-subtle-foreground" aria-hidden />
        <h1 className="font-medium text-foreground text-sm">
          Session not available
        </h1>
        <p className="max-w-prose text-muted-foreground text-xs">
          This shell session is no longer tracked by the agent. It may have
          exited and been cleared. Open a new shell from the sidebar to start a
          fresh session.
        </p>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-background dark:bg-surface-1">
      <TerminalHeader
        info={info && { ...info, exited, exitCode }}
        sessionId={sessionId}
        ownership={ownership}
      />
      <TerminalSurface
        agentInstanceId={agentInstanceId}
        sessionId={sessionId}
        ownership={ownership}
        onInfo={handleInfo}
        onExitState={handleExitState}
        onAgentBusy={handleAgentBusy}
        onNotFound={handleNotFound}
      />
    </main>
  );
}
