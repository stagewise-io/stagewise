import type { ActiveAppSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import type { EnvironmentChangeEntry } from './types';

/**
 * Compares two active-app snapshots and produces a change description
 * when the app was opened, closed, or switched.
 * Returns an empty array when nothing changed.
 */
export function computeAppChanges(
  prev: ActiveAppSnapshot,
  curr: ActiveAppSnapshot,
): EnvironmentChangeEntry[] {
  const same = prev?.appId === curr?.appId && prev?.pluginId === curr?.pluginId;
  if (same) return [];

  if (!prev && curr) {
    const attrs: Record<string, string> = { appId: curr.appId };
    if (curr.pluginId) attrs.pluginId = curr.pluginId;
    return [{ type: 'app-opened', attributes: attrs }];
  }

  if (prev && !curr) {
    const attrs: Record<string, string> = { appId: prev.appId };
    if (prev.pluginId) attrs.pluginId = prev.pluginId;
    return [{ type: 'app-closed', attributes: attrs }];
  }

  if (prev && curr) {
    const from = prev.pluginId ? `${prev.appId}:${prev.pluginId}` : prev.appId;
    const to = curr.pluginId ? `${curr.appId}:${curr.pluginId}` : curr.appId;
    return [{ type: 'app-changed', attributes: { from, to } }];
  }

  return [];
}
