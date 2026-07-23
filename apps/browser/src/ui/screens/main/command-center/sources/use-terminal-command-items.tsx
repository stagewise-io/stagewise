import { IconSquareTerminalOutline18 } from '@stagewise/icons';
import { useComparingSelector, useKartonState } from '@ui/hooks/use-karton';
import { normalizePath } from '@shared/path-utils';
import { getWorkspaceLocation } from '../../_lib/workspace-location';
import type { TerminalCommandItem } from '../command-center-model';
import { filterAndRankCommandCenterItems } from '../command-center-search';

const terminalIcon = <IconSquareTerminalOutline18 className="size-4" />;

function shellTitle(type?: string) {
  if (!type) return 'Shell';
  if (type === 'powershell') return 'PowerShell';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function terminalItemsEqual(
  a: TerminalCommandItem[],
  b: TerminalCommandItem[],
) {
  return (
    a.length === b.length &&
    a.every((item, index) => {
      const other = b[index];
      return (
        other &&
        item.id === other.id &&
        item.owner.agentInstanceId === other.owner.agentInstanceId &&
        item.title === other.title &&
        item.subtitle === other.subtitle &&
        item.isActive === other.isActive &&
        item.lastFocusedAt === other.lastFocusedAt &&
        item.keywords?.[2] === other.keywords?.[2]
      );
    })
  );
}

export function useTerminalCommandItems(query: string) {
  const terminals = useKartonState(
    useComparingSelector((state): TerminalCommandItem[] => {
      const mounts = Object.values(state.toolbox).flatMap(
        (toolbox) => toolbox.workspace.mounts,
      );
      const agentTitle = (agentId: string | null) =>
        agentId
          ? state.agents.instances[agentId]?.state.title || 'Agent chat'
          : 'Global';
      const description = (
        cwd: string,
        agentId: string | null,
        source: 'Agent' | 'Manual',
      ) => {
        const path = normalizePath(cwd);
        const appsPath = agentId && `/agents/${agentId}/apps`;
        const location =
          !appsPath ||
          (!path.endsWith(appsPath) && !path.includes(`${appsPath}/`))
            ? getWorkspaceLocation(cwd, mounts)
            : null;
        const workspace = location?.detail
          ? `${location.name} (${location.detail})`
          : location?.name;
        return [workspace, source].filter(Boolean).join(' · ');
      };

      const items: TerminalCommandItem[] = Object.values(state.contentTabs.tabs)
        .filter((tab) => tab.type === 'terminal')
        .map((tab) => ({
          id: `terminal-tab:${tab.id}`,
          kind: 'terminal',
          mode: 'terminals',
          title: `${tab.title.trim() || 'Terminal'} · ${agentTitle(tab.agentInstanceId)}`,
          subtitle: description(tab.cwd, tab.agentInstanceId, 'Manual'),
          keywords: ['terminal', 'manual', tab.cwd],
          icon: terminalIcon,
          owner: {
            type: 'terminal',
            terminalId: tab.id,
            agentInstanceId: tab.agentInstanceId,
          },
          isActive: tab.id === state.contentTabs.activeTabId,
          lastFocusedAt: tab.lastFocusedAt,
        }));

      for (const [agentInstanceId, toolbox] of Object.entries(state.toolbox)) {
        for (const session of toolbox.shells?.sessions ?? []) {
          if (session.exited) continue;
          items.push({
            id: `agent-shell:${session.id}`,
            kind: 'terminal',
            mode: 'terminals',
            title: `${shellTitle(toolbox.shells?.shellType)} · ${agentTitle(agentInstanceId)}`,
            subtitle: description(session.cwd, agentInstanceId, 'Agent'),
            keywords: ['terminal', 'agent', session.cwd],
            icon: terminalIcon,
            owner: {
              type: 'agent',
              agentInstanceId,
              sessionId: session.id,
            },
            isActive: false,
            lastFocusedAt: session.createdAt,
          });
        }
      }

      return items;
    }, terminalItemsEqual),
  );

  const items = filterAndRankCommandCenterItems(terminals, query).sort(
    (a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if (b.score !== a.score) return (b.score ?? 0) - (a.score ?? 0);
      return b.lastFocusedAt - a.lastFocusedAt;
    },
  );

  return { items };
}
