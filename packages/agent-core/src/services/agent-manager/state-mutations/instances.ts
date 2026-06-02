import type { AgentStore } from '../../../store/agent-store';
import type {
  AgentInstanceState,
  AgentSystemState,
} from '../../../store/state';
import type { AgentState } from '../../../types/agent';

/**
 * Whole-envelope shape written by `upsertAgentInstance`.
 *
 * Hosts may use structured `requiredModelCapabilities` (e.g. browser
 * model settings) while the core store row uses
 * `AgentInstanceState`'s record shape; `unknown` keeps both assignable
 * at the call seam.
 */
export type AgentInstanceEnvelope = Omit<
  AgentInstanceState,
  'state' | 'requiredModelCapabilities'
> & {
  state: AgentState;
  requiredModelCapabilities: unknown;
};

/**
 * Create or replace an agent envelope. One `store.update()` per call.
 *
 * Callers MUST always allocate a fresh envelope object — the bridge
 * forward-mirror dedups on reference identity and would silently drop a
 * mutation that re-used the previous reference.
 */
export function upsertAgentInstance(
  store: AgentStore,
  agentInstanceId: string,
  envelope: AgentInstanceEnvelope,
): void {
  store.update((draft) => {
    const systemDraft = draft as AgentSystemState;
    (systemDraft.agents.instances as Record<string, unknown>)[agentInstanceId] =
      envelope;
  });
}

/**
 * Remove `agents.instances[id]` AND `toolbox[id]` atomically.
 * Idempotent: no-op if the agent id is not present. Mirrors the
 * existing paired-delete pattern in `AgentManager.archiveAgent`.
 */
export function deleteAgentInstance(
  store: AgentStore,
  agentInstanceId: string,
): void {
  store.update((draft) => {
    const systemDraft = draft as AgentSystemState;
    delete systemDraft.agents.instances[agentInstanceId];
    delete systemDraft.toolbox[agentInstanceId];
  });
}

/**
 * Read-only peek for services that want to observe their own writes
 * without going through the bridge's Karton projection. No store
 * mutation; safe to call from any context.
 */
export function getAgentInstance(
  store: AgentStore,
  agentInstanceId: string,
): AgentInstanceEnvelope | undefined {
  const entry = store.get().agents.instances[agentInstanceId];
  return entry as AgentInstanceEnvelope | undefined;
}

/**
 * Field-level write for `agents.setToolApprovalMode`. Defensive no-op
 * if the agent id is not present (matches the pre-refactor recipe).
 */
export function setToolApprovalMode(
  store: AgentStore,
  agentInstanceId: string,
  mode: AgentState['toolApprovalMode'],
): void {
  store.update((draft) => {
    const systemDraft = draft as AgentSystemState;
    const entry = systemDraft.agents.instances[agentInstanceId];
    if (!entry) return;
    entry.state.toolApprovalMode = mode as string;
  });
}
