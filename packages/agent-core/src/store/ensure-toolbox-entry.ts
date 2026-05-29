import type { AgentSystemState, ToolboxAgentState } from './state';

/**
 * Ensures a toolbox slice exists in the given draft, seeding it with the
 * host-compatible defaults consumed by today's host services. This keeps
 * the store's `toolbox[agentId]` shape aligned with `ToolboxAgentState`
 * required fields without prematurely owning any of the other slices.
 *
 * Shared between package-side services and host-side state controllers
 * so every first writer agrees on the scaffolding shape for a given
 * agent instance.
 */
export function ensureToolboxEntry(
  draft: AgentSystemState,
  agentInstanceId: string,
): ToolboxAgentState {
  let entry = draft.toolbox[agentInstanceId];
  if (!entry) {
    entry = {
      workspace: { mounts: [] },
      pendingFileDiffs: [],
      editSummary: [],
      pendingUserQuestion: null,
    };
    draft.toolbox[agentInstanceId] = entry;
  }
  return entry;
}
