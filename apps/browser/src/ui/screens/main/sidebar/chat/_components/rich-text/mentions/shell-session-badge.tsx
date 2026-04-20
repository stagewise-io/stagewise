import { useMemo, useCallback } from 'react';
import { TerminalIcon } from 'lucide-react';
import { cn } from '@ui/utils';
import { InlineBadge, InlineBadgeWrapper } from '../shared';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { useKartonState } from '@ui/hooks/use-karton';
import type { ShellSessionSnapshot } from '@shared/karton-contracts/ui/agent/metadata';

interface ShellSessionBadgeProps {
  sessionId: string;
  viewOnly?: boolean;
}

export function ShellSessionBadge({
  sessionId,
  viewOnly = true,
}: ShellSessionBadgeProps) {
  const [openAgentId] = useOpenAgent();

  const session = useKartonState((s): ShellSessionSnapshot | null => {
    if (!openAgentId) return null;
    const sessions = s.toolbox[openAgentId]?.shells?.sessions ?? [];
    return sessions.find((sess) => sess.id === sessionId) ?? null;
  });

  const label = useMemo(() => {
    if (!session?.cwd) return sessionId;
    const cwd = session.cwd;
    const lastSep = Math.max(cwd.lastIndexOf('/'), cwd.lastIndexOf('\\'));
    return lastSep >= 0 ? cwd.slice(lastSep + 1) : cwd;
  }, [session, sessionId]);

  const isExited = session?.exited ?? false;

  const tooltipContent = useMemo(() => {
    if (!session) return 'Session not found';
    const statusLine = session.exited
      ? session.exitCode != null
        ? `Exited (code ${session.exitCode})`
        : 'Exited'
      : 'Running';
    return (
      <span>
        <span className="block font-medium">{session.cwd}</span>
        <span className="block text-muted-foreground">{statusLine}</span>
      </span>
    );
  }, [session]);

  const handleClick = useCallback(() => {
    // No-op for now — terminal UI not yet available in this release.
  }, []);

  return (
    <InlineBadgeWrapper viewOnly={viewOnly} tooltipContent={tooltipContent}>
      <InlineBadge
        icon={
          <TerminalIcon className="size-3 shrink-0 text-muted-foreground" />
        }
        label={label}
        selected={false}
        isEditable={false}
        onDelete={() => {}}
        className={cn('cursor-pointer', isExited && 'opacity-50')}
        onClick={handleClick}
      />
    </InlineBadgeWrapper>
  );
}
