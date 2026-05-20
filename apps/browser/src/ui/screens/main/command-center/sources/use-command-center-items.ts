import { useMemo } from 'react';
import type {
  CommandCenterItem,
  CommandCenterMode,
} from '../command-center-model';
import { useAgentCommandItems } from './use-agent-command-items';
import { useSettingsCommandItems } from './use-settings-command-items';
import { useTabCommandItems } from './use-tab-command-items';

const GLOBAL_LIMIT = 30;

export function useCommandCenterItems({
  query,
  mode,
}: {
  query: string;
  mode: CommandCenterMode;
}) {
  const agents = useAgentCommandItems(query);
  const tabs = useTabCommandItems(query);
  const settings = useSettingsCommandItems(query);

  const items = useMemo<CommandCenterItem[]>(() => {
    if (mode === 'agents') return agents.items;
    if (mode === 'browser') return tabs.items;
    if (mode === 'settings') return settings.items;

    return [...agents.items, ...tabs.items, ...settings.items]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, GLOBAL_LIMIT);
  }, [agents.items, mode, settings.items, tabs.items]);

  return {
    items,
    isLoading: agents.isLoading,
  };
}
