import { useMemo } from 'react';
import type {
  CommandCenterItem,
  CommandCenterMode,
} from '../command-center-model';
import { useAgentCommandItems } from './use-agent-command-items';
import { useSettingsCommandItems } from './use-settings-command-items';
import { useTabCommandItems } from './use-tab-command-items';
import { useFileSearchCommandItems } from './use-file-command-items';
import type { FileSearchFilterState as FileFilterState } from './use-file-command-items';

const GLOBAL_LIMIT = 30;

const EMPTY_FILE_FILTER: FileFilterState = {
  selectedWorkspaceKeys: new Set<string>(),
  includeGitignored: false,
};

export function useCommandCenterItems({
  query,
  mode,
  optimisticAgentTitles,
  optimisticPinnedAgentIds,
  pendingRemovalAgentIds,
  fileSearchFilter,
}: {
  query: string;
  mode: CommandCenterMode;
  optimisticAgentTitles?: Readonly<Record<string, string>>;
  optimisticPinnedAgentIds?: string[] | null;
  pendingRemovalAgentIds?: ReadonlySet<string>;
  fileSearchFilter?: FileFilterState;
}) {
  const agents = useAgentCommandItems(query, {
    optimisticAgentTitles,
    optimisticPinnedAgentIds,
    pendingRemovalAgentIds,
    enabled: mode === 'global' || mode === 'agents',
  });
  const tabs = useTabCommandItems(query);
  const settings = useSettingsCommandItems(query);
  const {
    items: fileItems,
    isLoading: fileIsLoading,
    workspaceOptions,
  } = useFileSearchCommandItems(
    mode === 'files' ? query : '',
    fileSearchFilter ?? EMPTY_FILE_FILTER,
  );

  const items = useMemo<CommandCenterItem[]>(() => {
    if (mode === 'agents') return agents.items;
    if (mode === 'browser') return tabs.items;
    if (mode === 'files') return fileItems;
    if (mode === 'settings') return settings.items;

    return [...agents.items, ...tabs.items, ...settings.items]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, GLOBAL_LIMIT);
  }, [agents.items, fileItems, mode, settings.items, tabs.items]);

  return {
    items,
    isLoading: mode === 'files' ? fileIsLoading : agents.isLoading,
    workspaceOptions,
    rawAgentTitles: agents.rawAgentTitles,
    refreshAgentHistory: agents.refreshHistoryList,
  };
}
