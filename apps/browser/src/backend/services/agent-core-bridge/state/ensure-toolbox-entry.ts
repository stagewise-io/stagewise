import type {
  AgentSystemState,
  ToolboxAgentState,
} from '@stagewise/agent-core';

/**
 * Ensures a toolbox slice exists in the given draft, seeding it with the
 * Karton-compatible defaults used by `SandboxService.open-app` today. This
 * keeps the store's `toolbox[agentId]` shape aligned with `AgentStore`'s
 * `ToolboxAgentState` required fields without prematurely owning any of the
 * other slices (mounts, diffs, questions, …).
 *
 * Shared between the host-side `ActiveAppStateController` and
 * `MountsStateController` so every first writer agrees on the
 * scaffolding shape for a given agent instance. Package-side code
 * (e.g. `DiffHistoryService`) uses the identical helper exported from
 * `@stagewise/agent-core`.
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
