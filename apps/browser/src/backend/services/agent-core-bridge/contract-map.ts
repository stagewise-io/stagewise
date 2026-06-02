import type { CommandName } from '@stagewise/agent-core';

/**
 * Karton procedures routed through the `AgentCoreBridge`.
 *
 * Adding a new entry requires registering a matching `CommandRegistry`
 * handler in the same commit — otherwise `bridge.attach()` throws
 * `BridgeDriftError` at startup (D-KB-5).
 *
 * Entries must also be removed from their legacy `registerServerProcedureHandler`
 * call-site (D-KB-6) — the bridge is the sole registrar for migrated names.
 */
export const MIGRATED_PROCEDURES: readonly CommandName[] = [
  'toolbox.dismissActiveApp',
  'toolbox.clearPendingAppMessage',
  'toolbox.acceptHunks',
  'toolbox.rejectHunks',
  'agents.markAsRead',
] as const;
