/**
 * `activeApp` host {@link DomainAdapter}.
 *
 * Owns the mini-app focus state for the agent. Reads
 * `AgentStore.toolbox[agentId].activeApp` and projects it to the
 * `{ appId, pluginId }` wire shape the model sees. The full-state
 * render is `<active_app id="..." plugin="..." />` (or empty when no
 * app is active); the delta render emits app-opened/closed/changed
 * events.
 */
import type { AgentStore } from '@stagewise/agent-core';
import type { DomainAdapter } from '@stagewise/agent-core/env';
import {
  type EnvironmentChangeEntry,
  escAttr,
  renderChangesXml,
} from '@stagewise/agent-core/env';
import type { ActiveAppSnapshot } from '@shared/env-domain-schemas';
import ActiveAppDomainPromptSection from './active-app-domain-adapter.prompt.md?raw';

export const ACTIVE_APP_DOMAIN_SCHEMA_VERSION = 1;

export type ActiveAppDomainState = ActiveAppSnapshot;

export interface ActiveAppDomainAdapterDeps {
  store: AgentStore;
}

function projectActiveApp(
  store: AgentStore,
  agentInstanceId: string,
): ActiveAppDomainState {
  const toolboxState = store.get().toolbox[agentInstanceId];
  const activeApp = toolboxState?.activeApp;
  if (!activeApp) return null;
  return { appId: activeApp.appId, pluginId: activeApp.pluginId };
}

function renderFullActiveApp(state: ActiveAppDomainState): string {
  if (!state) return '';
  const plugin = state.pluginId ? ` plugin="${escAttr(state.pluginId)}"` : '';
  return `<active_app id="${escAttr(state.appId)}"${plugin} />`;
}

function computeActiveAppChanges(
  prev: ActiveAppDomainState,
  curr: ActiveAppDomainState,
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

export function createActiveAppDomainAdapter(
  deps: ActiveAppDomainAdapterDeps,
): DomainAdapter<ActiveAppDomainState> {
  return {
    domainId: 'activeApp',
    renderOrder: 9,
    schemaVersion: ACTIVE_APP_DOMAIN_SCHEMA_VERSION,
    promptSection: ActiveAppDomainPromptSection,
    getState(agentInstanceId) {
      return projectActiveApp(deps.store, agentInstanceId);
    },
    renderState(prev, curr) {
      if (prev === null) return renderFullActiveApp(curr);
      return renderChangesXml(computeActiveAppChanges(prev, curr));
    },
  };
}
