import type { CommandRegistry, TelemetrySink } from '@stagewise/agent-core';
import type { AgentStore } from '@stagewise/agent-core';
import type { KartonService } from '../../karton';
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

/**
 * Phase 9: `toolbox.generateWorkspaceMd` — registered on both the
 * command registry and Karton (same handler body as the former
 * `AgentManagerService` path).
 */
export function registerToolboxGenerateWorkspaceMd(
  registry: CommandRegistry,
  karton: KartonService,
  deps: {
    store: AgentStore;
    generateWorkspaceMdForPath: (workspacePath: string) => Promise<void>;
  },
): void {
  registry.registerCommand<[string, string], void>(
    'toolbox.generateWorkspaceMd',
    async (_ctx, [agentInstanceId, mountPrefix]) => {
      const mounts =
        deps.store.get().toolbox[agentInstanceId]?.workspace?.mounts;
      const mount = mounts?.find((m) => m.prefix === mountPrefix);
      if (!mount) throw new Error(`Mount ${mountPrefix} not found`);
      await deps.generateWorkspaceMdForPath(mount.path);
    },
  );
  karton.registerServerProcedureHandler(
    'toolbox.generateWorkspaceMd',
    async (
      _callingClientId: string,
      agentInstanceId: string,
      mountPrefix: string,
    ) => {
      await registry.dispatch(
        'toolbox.generateWorkspaceMd',
        { callerId: _callingClientId },
        [agentInstanceId, mountPrefix],
      );
    },
  );
}
