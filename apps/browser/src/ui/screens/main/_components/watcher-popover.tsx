import {
  IconArrowUpRightOutline18,
  IconCheck2Outline18,
  IconCopyOutline18,
  IconEyeOutline18,
  IconMsgWritingOutline18,
  IconPowerOffOutline18,
} from '@stagewise/icons';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@stagewise/stage-ui/components/popover';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import type { ShellSessionSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { formatDuration } from '@ui/utils/format-duration';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import { useEffect, useMemo, useRef, useState } from 'react';

type ActiveWatcherSession = ShellSessionSnapshot & {
  watcher: NonNullable<ShellSessionSnapshot['watcher']>;
};

type WatcherGroup = {
  agentId: string;
  title: string;
  sessions: ActiveWatcherSession[];
};

export function WatcherPopover() {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [copiedWatcherKey, setCopiedWatcherKey] = useState<string | null>(null);
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [openAgent, setOpenAgent] = useOpenAgent();
  const killShellSession = useKartonProcedure(
    (procedures) => procedures.toolbox.killShellSession,
  );
  const copyText = useKartonProcedure(
    (procedures) => procedures.browser.copyText,
  );
  const setLastOpenAgentId = useKartonProcedure(
    (procedures) => procedures.browser.setLastOpenAgentId,
  );
  const shellsByAgent = useKartonState(
    useComparingSelector((state) =>
      Object.fromEntries(
        Object.entries(state.toolbox).map(([agentId, toolbox]) => [
          agentId,
          toolbox.shells,
        ]),
      ),
    ),
  );
  const agentTitles = useKartonState(
    useComparingSelector((state) =>
      Object.fromEntries(
        Object.entries(state.agents.instances).map(([id, agent]) => [
          id,
          agent.state.title || 'Agent chat',
        ]),
      ),
    ),
  );
  const groups = useMemo(() => {
    const nextGroups: WatcherGroup[] = [];
    for (const [agentId, shells] of Object.entries(shellsByAgent)) {
      const sessions = (shells?.sessions ?? []).filter(
        (session): session is ActiveWatcherSession =>
          session.watcher !== undefined && !session.exited,
      );
      if (sessions.length === 0) continue;
      nextGroups.push({
        agentId,
        title: agentTitles[agentId] ?? 'Agent chat',
        sessions,
      });
    }
    return nextGroups;
  }, [agentTitles, shellsByAgent]);
  const watcherCount = groups.reduce(
    (count, group) => count + group.sessions.length,
    0,
  );

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [open]);

  useEffect(() => {
    if (watcherCount === 0) setOpen(false);
  }, [watcherCount]);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current)
        clearTimeout(copyResetTimeoutRef.current);
    };
  }, []);

  const selectChat = (agentId: string) => {
    setOpen(false);
    setOpenAgent(agentId);
    void setLastOpenAgentId(agentId);
  };

  const copyWatcherCommand = async (key: string, command: string) => {
    await copyText(command);
    setCopiedWatcherKey(key);
    if (copyResetTimeoutRef.current) clearTimeout(copyResetTimeoutRef.current);
    copyResetTimeoutRef.current = setTimeout(
      () => setCopiedWatcherKey(null),
      2_000,
    );
  };

  if (watcherCount === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button variant="ghost" size="sm" aria-label="Show active watchers">
          <IconEyeOutline18 className="size-4" />
          <span className="rounded-full bg-surface-2 px-1.5 font-mono text-[0.625rem] tabular-nums">
            {watcherCount}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-80 gap-2 p-2">
        <div className="flex h-6 items-center px-1">
          <PopoverTitle>Watchers</PopoverTitle>
        </div>
        <PopoverClose />
        <OverlayScrollbar
          className="max-h-80 min-h-0"
          viewportClassName="scroll-fade-y scroll-fade-4"
          contentClassName="flex flex-col gap-3"
        >
          {groups.map((group) => (
            <section
              key={group.agentId}
              className="flex shrink-0 flex-col gap-1"
            >
              <div className="flex min-w-0 items-center gap-1.5 px-1.5 py-0.5 text-muted-foreground text-xs">
                <button
                  type="button"
                  className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-sm hover:text-foreground focus-visible:outline-1 focus-visible:outline-muted-foreground/35"
                  onClick={() => selectChat(group.agentId)}
                >
                  <IconMsgWritingOutline18 className="size-3 shrink-0" />
                  <span className="truncate">{group.title}</span>
                  {group.agentId === openAgent && (
                    <span className="shrink-0 text-2xs text-subtle-foreground">
                      (Open)
                    </span>
                  )}
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                {group.sessions.map((session) => {
                  const watcher = session.watcher;
                  const remainingMs = watcher.expiresAt - now;
                  const watcherKey = `${group.agentId}:${session.id}`;
                  const hasCopied = copiedWatcherKey === watcherKey;
                  return (
                    <div
                      key={session.id}
                      className="flex flex-col gap-2 rounded-md bg-surface-1 p-2 pt-1.25 text-2xs shadow-elevation-1"
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex min-w-0 items-center gap-1">
                          <span className="min-w-0 flex-1 truncate font-medium text-foreground text-xs">
                            {watcher.title}
                          </span>
                          <div className="flex shrink-0">
                            <Tooltip>
                              <TooltipTrigger>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={`Show chat for ${watcher.title}`}
                                  onClick={() => selectChat(group.agentId)}
                                >
                                  <IconArrowUpRightOutline18 className="size-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Show chat</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={`Stop ${watcher.title}`}
                                  onClick={() =>
                                    void killShellSession(
                                      group.agentId,
                                      session.id,
                                    )
                                  }
                                >
                                  <IconPowerOffOutline18 className="size-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Stop watcher</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                        {watcher.description ? (
                          <div className="scroll-fade-y scroll-fade-3 scrollbar-subtle max-h-12 overflow-y-auto whitespace-pre-wrap text-muted-foreground leading-4">
                            {watcher.description}
                          </div>
                        ) : null}
                      </div>
                      <div
                        className="flex min-w-0 items-center rounded-sm bg-background pl-1.5"
                        title={watcher.command}
                      >
                        <span className="min-w-0 flex-1 truncate py-1 font-mono text-foreground">
                          {watcher.command || 'Command unavailable'}
                        </span>
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`${hasCopied ? 'Copied' : 'Copy'} script for ${watcher.title}`}
                              disabled={!watcher.command}
                              onClick={() =>
                                void copyWatcherCommand(
                                  watcherKey,
                                  watcher.command,
                                )
                              }
                            >
                              {hasCopied ? (
                                <IconCheck2Outline18 className="size-3 text-success-foreground" />
                              ) : (
                                <IconCopyOutline18 className="size-3" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {hasCopied ? 'Copied' : 'Copy script'}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex gap-1 text-muted-foreground tabular-nums">
                        <span>
                          running {formatDuration(now - watcher.startedAt)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {remainingMs > 0
                            ? `expires in ${formatDuration(remainingMs)}`
                            : 'expiring'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </OverlayScrollbar>
      </PopoverContent>
    </Popover>
  );
}
