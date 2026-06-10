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
  searchInContent: false,
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
  // File search runs in both "files" mode and the "all" (global) mode. In
  // global mode we always search across every connected workspace (empty
  // filter), ignoring the per-workspace selection that only applies to the
  // dedicated files mode.
  const fileSearchActive = mode === 'files' || mode === 'global';
  const {
    items: fileItems,
    isLoading: fileIsLoading,
    isRecent: fileIsRecent,
    workspaceOptions,
  } = useFileSearchCommandItems(
    fileSearchActive ? query : '',
    mode === 'files'
      ? (fileSearchFilter ?? EMPTY_FILE_FILTER)
      : EMPTY_FILE_FILTER,
    // Only the dedicated files mode shows recently-changed files on an empty
    // query; the global view stays empty until the user types.
    mode === 'files',
  );

  const items = useMemo<CommandCenterItem[]>(() => {
    if (mode === 'agents') return agents.items;
    if (mode === 'browser') return tabs.items;
    if (mode === 'files') return fileItems;
    if (mode === 'settings') return settings.items;

    const ranked = [...agents.items, ...tabs.items, ...settings.items]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, GLOBAL_LIMIT);
    // Append file results after the ranked list so they always surface in the
    // "all" view rather than being cut by the global limit.
    return [...ranked, ...fileItems];
  }, [agents.items, fileItems, mode, settings.items, tabs.items]);

  return {
    items,
    isLoading: fileSearchActive
      ? fileIsLoading || (mode === 'global' && agents.isLoading)
      : agents.isLoading,
    fileIsRecent,
    workspaceOptions,
    rawAgentTitles: agents.rawAgentTitles,
    refreshAgentHistory: agents.refreshHistoryList,
  };
}
