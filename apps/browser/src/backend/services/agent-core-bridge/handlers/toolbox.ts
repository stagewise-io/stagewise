import type { CommandRegistry } from '@stagewise/agent-core';
import type { ActiveAppStateController } from '../state/toolbox-active-app';

/**
 * Host surface required by the seam-phase toolbox handlers (Phases
 * 1c + 1d) — registered on the `CommandRegistry` before any service
 * that depends on store state is constructed.
 */
export interface ToolboxSeamHandlerDeps {
  activeApp: ActiveAppStateController;
}

/**
 * Registers the `toolbox.*` command handlers whose dependencies exist
 * at seam-build time.
 *
 * Phase 1c:
 *   - `toolbox.dismissActiveApp`
 *
 * Phase 1d:
 *   - `toolbox.clearPendingAppMessage` (paired with `activeApp` to honour
 *     single-ownership per migrated field).
 */
export function registerToolboxSeamHandlers(
  registry: CommandRegistry,
  deps: ToolboxSeamHandlerDeps,
): void {
  registry.registerCommand<[agentInstanceId: string], void>(
    'toolbox.dismissActiveApp',
    async (_ctx, [agentInstanceId]) => {
      deps.activeApp.clearActiveApp(agentInstanceId);
    },
  );

  registry.registerCommand<[agentInstanceId: string], void>(
    'toolbox.clearPendingAppMessage',
    async (_ctx, [agentInstanceId]) => {
      deps.activeApp.clearPendingAppMessage(agentInstanceId);
    },
  );
}
