import { useMemo, useCallback } from 'react';
import { TerminalIcon } from 'lucide-react';
import { cn } from '@ui/utils';
import { InlineBadge, InlineBadgeWrapper } from '../shared';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
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

  const tabs = useKartonState((s) => s.browser.tabs);
  const switchTab = useKartonProcedure((p) => p.browser.switchTab);
  const createTab = useKartonProcedure((p) => p.browser.createTab);
  const goToUrl = useKartonProcedure((p) => p.browser.goto);

  const label = useMemo(() => {
    if (!session) return sessionId;
    const cwd = session.cwd;
    const lastSlash = cwd.lastIndexOf('/');
    return lastSlash >= 0 ? cwd.slice(lastSlash + 1) : cwd;
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
    if (!openAgentId) return;
    const baseUrl = `stagewise://internal/shell-terminal/${encodeURIComponent(openAgentId)}`;
    const fullUrl = `${baseUrl}?sessionId=${encodeURIComponent(sessionId)}`;

    const existingTab = Object.values(tabs).find((tab) =>
      tab.url.startsWith(baseUrl),
    );

    if (existingTab) {
      void switchTab(existingTab.id);
      void goToUrl(fullUrl, existingTab.id);
    } else void createTab(fullUrl, true);
  }, [openAgentId, sessionId, tabs, switchTab, createTab, goToUrl]);

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
