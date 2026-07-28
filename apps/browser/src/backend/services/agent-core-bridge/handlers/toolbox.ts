import type { CommandRegistry, TelemetrySink } from '@stagewise/agent-core';
import type { DiffHistoryService } from '@stagewise/agent-core/diff-history';
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
 * Host surface required by the attach-phase toolbox handlers (Phase 5+)
 * — registered right before `bridge.attach()` once every downstream
 * service has been constructed.
 */
export interface ToolboxAttachHandlerDeps {
  diffHistory: DiffHistoryService;
  telemetry?: TelemetrySink;
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

/**
 * Registers the `toolbox.*` command handlers whose dependencies only
 * become available right before `bridge.attach()`.
 *
 * Phase 5:
 *   - `toolbox.acceptHunks`
 *   - `toolbox.rejectHunks`
 *
 * Both handlers delegate to `DiffHistoryService.acceptAndRejectHunks`
 * and emit the existing browser telemetry events through the bridge's
 * `TelemetrySink`.
 */
export function registerToolboxAttachHandlers(
  registry: CommandRegistry,
  deps: ToolboxAttachHandlerDeps,
): void {
  registry.registerCommand<[hunkIds: string[]], void>(
    'toolbox.acceptHunks',
    async (_ctx, [hunkIds]) => {
      await deps.diffHistory.acceptAndRejectHunks(hunkIds, []);
      deps.telemetry?.capture('edits-accepted', {
        hunk_count: hunkIds.length,
      });
    },
  );

  registry.registerCommand<[hunkIds: string[]], void>(
    'toolbox.rejectHunks',
    async (_ctx, [hunkIds]) => {
      await deps.diffHistory.acceptAndRejectHunks([], hunkIds);
      deps.telemetry?.capture('edits-rejected', {
        hunk_count: hunkIds.length,
      });
    },
  );
}
