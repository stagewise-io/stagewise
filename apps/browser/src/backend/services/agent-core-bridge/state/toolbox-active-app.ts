import {
  ensureToolboxEntry,
  type AgentStore,
  type AgentSystemState,
  type ToolboxAgentState,
} from '@stagewise/agent-core';

/**
 * Narrowed type for the `activeApp` slice managed by this controller.
 * Mirrors the Karton contract field shape via `ToolboxAgentState.activeApp`.
 */
export type ActiveAppState = NonNullable<ToolboxAgentState['activeApp']>;

/**
 * Narrowed type for the `pendingAppMessage` slice managed by this controller.
 */
export type PendingAppMessage = NonNullable<
  ToolboxAgentState['pendingAppMessage']
>;

/**
 * Host surface that owns the migrated active-app slice.
 *
 * Phase 1d moves canonical ownership of `activeApp` and `pendingAppMessage`
 * from Karton to `AgentStore`. Every writer (both command handlers in the
 * bridge and the out-of-band `SandboxService`) goes through this interface
 * so the store is the single source of truth. The `AgentCoreBridge` then
 * mirrors these two fields back into Karton for the UI.
 */
export interface ActiveAppStateController {
  getActiveApp(agentInstanceId: string): ActiveAppState | null | undefined;
  setActiveApp(agentInstanceId: string, value: ActiveAppState): void;
  clearActiveApp(agentInstanceId: string): void;
  setPendingAppMessage(agentInstanceId: string, value: PendingAppMessage): void;
  clearPendingAppMessage(agentInstanceId: string): void;
}

/**
 * Builds an `ActiveAppStateController` backed by the given `AgentStore`.
 *
 * All mutations go through `store.update()` so subscribers observe a single
 * post-recipe state per call (D18). Reads use `store.get()` directly.
 */
export function createActiveAppStateController(
  store: AgentStore,
): ActiveAppStateController {
  return {
    getActiveApp(agentInstanceId) {
      return store.get().toolbox[agentInstanceId]?.activeApp;
    },

    setActiveApp(agentInstanceId, value) {
      store.update((draft) => {
        const entry = ensureToolboxEntry(
          draft as AgentSystemState,
          agentInstanceId,
        );
        entry.activeApp = value;
      });
    },

    clearActiveApp(agentInstanceId) {
      store.update((draft) => {
        const entry = draft.toolbox[agentInstanceId];
        if (entry && entry.activeApp != null) {
          entry.activeApp = null;
        }
      });
    },

    setPendingAppMessage(agentInstanceId, value) {
      store.update((draft) => {
        const entry = ensureToolboxEntry(
          draft as AgentSystemState,
          agentInstanceId,
        );
        entry.pendingAppMessage = value;
      });
    },

    clearPendingAppMessage(agentInstanceId) {
      store.update((draft) => {
        const entry = draft.toolbox[agentInstanceId];
        if (entry && entry.pendingAppMessage != null) {
          entry.pendingAppMessage = null;
        }
      });
    },
  };
}
