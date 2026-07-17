import type {
  MountEntry,
  RunningServer,
  RunningServerOwner,
} from '@shared/karton-contracts/ui';
import type { FaviconBitmapResult } from '@shared/karton-contracts/pages-api/types';
import { getBaseName, normalizePath } from '@shared/path-utils';
import {
  IconArrowUpRightOutline18,
  IconCodeBranchOutline18,
  IconEarthOutline18,
  IconFolderOutline18,
  IconMsgWritingOutline18,
  IconPowerOffOutline18,
  IconServerOutline18,
  IconSideProfileSparkleOutline18,
} from '@stagewise/icons';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@stagewise/stage-ui/components/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import { useTabUIState } from '@ui/hooks/use-tab-ui-state';
import { Globe2 } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

const REFRESH_INTERVAL_MS = 5_000;

type ServerGroup = {
  id: string;
  title: string;
  agentId: string | null;
  servers: RunningServer[];
};

type ServerLocation = {
  isGit: boolean;
  name: string;
  detail: string | null;
};

function getServerLocation(cwd: string, mounts: MountEntry[]): ServerLocation {
  const normalizedCwd = normalizePath(cwd).replace(/\/$/, '');
  let closestMount: MountEntry | undefined;

  for (const mount of mounts) {
    const mountPath = normalizePath(mount.path).replace(/\/$/, '');
    if (
      (normalizedCwd === mountPath ||
        normalizedCwd.startsWith(`${mountPath}/`)) &&
      (!closestMount || mountPath.length > closestMount.path.length)
    ) {
      closestMount = mount;
    }
  }

  if (!closestMount?.git) {
    return { isGit: false, name: cwd, detail: null };
  }

  const repoPath =
    closestMount.git.mainWorktreePath ?? closestMount.git.repoRoot;
  return {
    isGit: true,
    name: getBaseName(repoPath) || repoPath,
    detail:
      closestMount.git.branch ?? closestMount.git.headSha?.slice(0, 7) ?? null,
  };
}

function getServerId(owner: RunningServerOwner): string {
  return owner.type === 'agent' ? owner.sessionId : owner.terminalId;
}

type ServerEndpoint = RunningServer['endpoints'][number];

function getEndpointHost(endpoint: ServerEndpoint): string {
  return endpoint.host.includes(':') ? `[${endpoint.host}]` : endpoint.host;
}

function getEndpointUrl(endpoint: ServerEndpoint): string {
  return `http://${getEndpointHost(endpoint)}:${endpoint.port}/`;
}

function getEndpointLabel(endpoint: ServerEndpoint): string {
  return `${getEndpointHost(endpoint)}:${endpoint.port}`;
}

function getBrowserTabKey(agentId: string | null, url: string): string {
  try {
    return JSON.stringify([agentId, new URL(url).href]);
  } catch {
    return JSON.stringify([agentId, url]);
  }
}

function PortFavicon({ bitmap }: { bitmap: FaviconBitmapResult | undefined }) {
  const [failedImageData, setFailedImageData] = useState<string | null>(null);

  if (!bitmap?.imageData || failedImageData === bitmap.imageData) {
    return (
      <IconEarthOutline18 className="size-3 shrink-0 text-muted-foreground" />
    );
  }

  const mimeType = bitmap.faviconUrl.endsWith('.ico')
    ? 'image/x-icon'
    : bitmap.faviconUrl.endsWith('.svg')
      ? 'image/svg+xml'
      : 'image/png';

  return (
    <img
      src={`data:${mimeType};base64,${bitmap.imageData}`}
      alt=""
      className="size-3 shrink-0 rounded-sm object-contain"
      onError={() => setFailedImageData(bitmap.imageData)}
    />
  );
}

export function LocalServersPopover({
  trailingContent,
}: {
  trailingContent?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [skipCloseTransition, setSkipCloseTransition] = useState(false);
  const [servers, setServers] = useState<RunningServer[]>([]);
  const [faviconsByPageUrl, setFaviconsByPageUrl] = useState<
    Record<string, FaviconBitmapResult>
  >({});
  const suppressedServerIdsRef = useRef(new Set<string>());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { maskStyle } = useScrollFadeMask(scrollContainerRef, {
    axis: 'vertical',
  });

  const getRunningServers = useKartonProcedure(
    (procedures) => procedures.browser.getRunningServers,
  );
  const stopRunningServer = useKartonProcedure(
    (procedures) => procedures.browser.stopRunningServer,
  );
  const getFaviconBitmapsForPageUrls = useKartonProcedure(
    (procedures) => procedures.browser.getFaviconBitmapsForPageUrls,
  );
  const createTab = useKartonProcedure(
    (procedures) => procedures.browser.createTab,
  );
  const switchTab = useKartonProcedure(
    (procedures) => procedures.browser.switchTab,
  );
  const setLastOpenAgentId = useKartonProcedure(
    (procedures) => procedures.browser.setLastOpenAgentId,
  );
  const [openAgent, setOpenAgent] = useOpenAgent();
  const { requestTerminalFocus } = useTabUIState();
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
  const workspaceMounts = useKartonState(
    useComparingSelector((state) =>
      Object.values(state.toolbox).flatMap(
        (toolbox) => toolbox.workspace.mounts,
      ),
    ),
  );
  const browserTabIdsByTarget = useKartonState(
    useComparingSelector((state) =>
      Object.fromEntries(
        Object.values(state.contentTabs.tabs)
          .filter((tab) => tab.type === undefined || tab.type === 'browser')
          .map((tab) => [
            getBrowserTabKey(tab.agentInstanceId, tab.url),
            tab.id,
          ]),
      ),
    ),
  );

  useEffect(() => {
    let cancelled = false;
    let timeout: number | undefined;

    const refresh = async () => {
      try {
        const nextServers = await getRunningServers();
        if (!cancelled) {
          setServers(
            nextServers.filter(
              (server) =>
                !suppressedServerIdsRef.current.has(getServerId(server.owner)),
            ),
          );
          suppressedServerIdsRef.current.clear();
        }
      } catch {
        // Keep the last known list during transient backend reconnects.
      } finally {
        if (!cancelled) {
          timeout = window.setTimeout(
            () => void refresh(),
            REFRESH_INTERVAL_MS,
          );
        }
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [getRunningServers]);

  useEffect(() => {
    if (servers.length === 0) setOpen(false);
  }, [servers.length]);

  const faviconPageUrlsKey = Array.from(
    new Set(servers.flatMap((server) => server.endpoints.map(getEndpointUrl))),
  )
    .sort()
    .join('\n');

  useEffect(() => {
    if (!open || !faviconPageUrlsKey) return;

    let cancelled = false;
    void getFaviconBitmapsForPageUrls(faviconPageUrlsKey.split('\n'))
      .then((bitmaps) => {
        if (!cancelled) setFaviconsByPageUrl(bitmaps);
      })
      .catch(() => {
        // Keep the last cached icons during transient backend reconnects.
      });

    return () => {
      cancelled = true;
    };
  }, [faviconPageUrlsKey, getFaviconBitmapsForPageUrls, open]);

  const selectChat = (agentId: string) => {
    setSkipCloseTransition(agentId !== openAgent);
    setOpen(false);
    setOpenAgent(agentId);
    void setLastOpenAgentId(agentId);
  };

  const selectServer = async (server: RunningServer) => {
    const agentId = server.owner.agentInstanceId;
    setSkipCloseTransition(agentId !== null && agentId !== openAgent);
    setOpen(false);

    if (server.owner.type === 'agent') {
      setOpenAgent(server.owner.agentInstanceId);
      void setLastOpenAgentId(server.owner.agentInstanceId);
      return;
    }

    if (agentId) {
      setOpenAgent(agentId);
      void setLastOpenAgentId(agentId);
    }
    await switchTab(server.owner.terminalId);
    requestTerminalFocus(server.owner.terminalId);
  };

  const openEndpoint = async (
    server: RunningServer,
    endpoint: ServerEndpoint,
  ) => {
    setSkipCloseTransition(true);
    setOpen(false);
    const agentId = server.owner.agentInstanceId;
    const pageUrl = getEndpointUrl(endpoint);
    if (agentId && agentId !== openAgent) {
      setOpenAgent(agentId);
      void setLastOpenAgentId(agentId);
    }
    const existingTabId =
      browserTabIdsByTarget[getBrowserTabKey(agentId, pageUrl)] ??
      (agentId
        ? browserTabIdsByTarget[getBrowserTabKey(null, pageUrl)]
        : undefined);
    if (existingTabId) {
      await switchTab(existingTabId);
      return;
    }
    await createTab(pageUrl, true, agentId);
  };

  const stopServer = async (server: RunningServer) => {
    if (!(await stopRunningServer(server.owner))) return;
    const serverId = getServerId(server.owner);
    suppressedServerIdsRef.current.add(serverId);
    setServers((current) =>
      current.filter((entry) => getServerId(entry.owner) !== serverId),
    );
  };

  if (servers.length === 0) return null;
  const portCount = servers.reduce(
    (count, server) => count + server.endpoints.length,
    0,
  );
  const groupsByAgent = new Map<string, ServerGroup>();
  for (const server of servers) {
    const agentId = server.owner.agentInstanceId;
    const id = agentId ?? 'global';
    const group = groupsByAgent.get(id) ?? {
      id,
      title: agentId ? (agentTitles[agentId] ?? 'Agent chat') : 'Global',
      agentId,
      servers: [],
    };
    group.servers.push(server);
    groupsByAgent.set(id, group);
  }
  const groups = Array.from(groupsByAgent.values());

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) setSkipCloseTransition(false);
          setOpen(nextOpen);
        }}
      >
        <PopoverTrigger>
          <Button variant="ghost" size="sm" aria-label="Show local servers">
            <IconServerOutline18 className="size-4" />
            <span className="rounded-full bg-surface-2 px-1.5 font-mono text-[0.625rem] tabular-nums">
              {portCount}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="end"
          className={cn('w-72 gap-2 p-2', skipCloseTransition && 'duration-0')}
        >
          <div className="flex h-6 items-center px-1">
            <PopoverTitle className="mr-auto">Local servers</PopoverTitle>
          </div>
          <PopoverClose />

          <div
            ref={scrollContainerRef}
            className="mask-alpha flex max-h-80 min-h-0 flex-col gap-3 overflow-y-auto"
            style={maskStyle}
          >
            {groups.map((group) => {
              const ChatIcon = group.agentId ? IconMsgWritingOutline18 : Globe2;
              return (
                <section
                  key={group.id}
                  className="flex shrink-0 flex-col gap-1"
                >
                  <div className="flex min-w-0 items-center gap-1.5 px-1.5 py-0.5 text-muted-foreground text-xs">
                    {group.agentId ? (
                      <button
                        type="button"
                        className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-sm hover:text-foreground focus-visible:outline-1 focus-visible:outline-muted-foreground/35"
                        onClick={() => selectChat(group.agentId!)}
                      >
                        <ChatIcon className="size-3 shrink-0" />
                        <span className="truncate">{group.title}</span>
                        {group.agentId === openAgent && (
                          <span className="shrink-0 text-2xs text-subtle-foreground">
                            (Open)
                          </span>
                        )}
                      </button>
                    ) : (
                      <>
                        <ChatIcon className="size-3 shrink-0" />
                        <span className="truncate">{group.title}</span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {group.servers.map((server) => {
                      const isAgent = server.owner.type === 'agent';
                      const location = getServerLocation(
                        server.cwd,
                        workspaceMounts,
                      );
                      const LocationIcon = location.isGit
                        ? IconCodeBranchOutline18
                        : IconFolderOutline18;
                      const targetLabel = isAgent ? 'chat' : 'terminal';

                      return (
                        <div
                          key={getServerId(server.owner)}
                          className="flex flex-col gap-2 rounded-md bg-surface-1 p-2 pt-1.25 text-2xs shadow-elevation-1"
                        >
                          <div className="flex min-w-0 items-center gap-1 font-mono">
                            <div className="flex min-w-0 flex-1 items-center gap-1">
                              {isAgent && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <IconSideProfileSparkleOutline18 className="mr-0.5 size-3 shrink-0 cursor-help text-muted-foreground" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Started by an agent shell
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              <LocationIcon className="size-3 shrink-0 text-muted-foreground" />
                              <span
                                className="truncate text-muted-foreground"
                                title={location.name}
                              >
                                {location.name}
                              </span>
                              {location.detail && (
                                <span className="min-w-0 truncate text-base-450">
                                  {location.detail}
                                </span>
                              )}
                            </div>
                            <div className="flex shrink-0">
                              <Tooltip>
                                <TooltipTrigger>
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-label={`Show ${targetLabel}`}
                                    onClick={() => void selectServer(server)}
                                  >
                                    <IconArrowUpRightOutline18 className="size-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{`Show ${targetLabel}`}</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-label="Stop process"
                                    onClick={() => void stopServer(server)}
                                  >
                                    <IconPowerOffOutline18 className="size-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Stop process (Ctrl+C)
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                          <div
                            className="flex w-full items-center rounded-sm bg-background px-1.5 py-1"
                            title={server.command}
                          >
                            <span className="truncate font-mono text-foreground">
                              {server.command}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {server.endpoints.map((endpoint) => {
                              const pageUrl = getEndpointUrl(endpoint);
                              const endpointLabel = getEndpointLabel(endpoint);
                              return (
                                <Tooltip key={pageUrl}>
                                  <TooltipTrigger>
                                    <Button
                                      variant="secondary"
                                      size="xs"
                                      className="pl-1.25 font-mono text-2xs"
                                      aria-label={`Open ${endpointLabel} in browser`}
                                      onClick={() =>
                                        void openEndpoint(server, endpoint)
                                      }
                                    >
                                      <PortFavicon
                                        bitmap={faviconsByPageUrl[pageUrl]}
                                      />
                                      {endpointLabel}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {`Open ${endpointLabel} in browser`}
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {trailingContent}
    </>
  );
}
