import {
  AgentStore,
  CommandRegistry,
  createInitialAgentSystemState,
  type AgentHost,
} from '@stagewise/agent-core';
import type { DiffHistoryService } from '@stagewise/agent-core/diff-history';
import type { KartonService } from '../karton';
import { AgentCoreBridge } from './index';
import {
  registerToolboxSeamHandlers,
  registerToolboxAttachHandlers,
} from './handlers/toolbox';
import { registerAgentsSeamHandlers } from './handlers/agents';
import {
  createActiveAppStateController,
  type ActiveAppStateController,
} from './state/toolbox-active-app';
import {
  createMountsStateController,
  type MountsStateController,
} from './state/toolbox-mounts';
import {
  createHostAgentStateMutations,
  type HostAgentStateMutations,
} from './state/agent-instances';

export interface AgentCoreBridgeContext {
  karton: KartonService;
  /**
   * The concrete `AgentHost` the bridge — and every command registered
   * through it — exposes to agent-core. Currently held on the returned
   * handles so future service moves (Phase 4+) can thread `host.paths`
   * / `host.models` / etc. through without re-wiring `main.ts`. No
   * migrated command consumes it yet.
   */
  host: AgentHost;
}

/**
 * Minimal seam that exposes the store + registry + controllers without
 * depending on the full `AgentHost`. Services that consume
 * store-canonical state (e.g. `MountManagerService` via
 * `mountsController`) construct long before the full `AgentHost` is
 * available in `main.ts`, so the seam is built early and the bridge is
 * attached later.
 */
export interface AgentCoreSeamHandles {
  store: AgentStore;
  registry: CommandRegistry;
  activeAppController: ActiveAppStateController;
  mountsController: MountsStateController;
  /**
   * Browser-only setters that extend the core `state-mutations`
   * surface (`setUnread`, `recordPendingApproval`, plus a typed
   * `getInstance` peek). Threaded into `AgentManagerService` and
   * `ToolboxService` via `main.ts`, plus the seam-phase
   * `agents.markAsRead` handler. CRUD and per-instance intents go
   * through `AgentManager` directly against the same `AgentStore`.
   */
  hostAgentStateMutations: HostAgentStateMutations;
}

export interface AgentCoreBridgeHandles extends AgentCoreSeamHandles {
  bridge: AgentCoreBridge;
  /**
   * The `AgentHost` that was passed into `attachAgentCoreBridge`. Kept
   * on the handles so later phases can reach paths / models / logger /
   * telemetry through a single object without re-constructing the host
   * or re-reading dependencies from `main.ts`.
   */
  host: AgentHost;
}

/**
 * Builds the agent-core seam — store, controllers, registry — without
 * attaching the bridge. Must be invoked exactly once, early in the boot
 * sequence (after `uiKarton` is available) so that services like
 * `DiffHistoryService` can receive the file-diffs controller as an
 * injected dependency.
 *
 * Registers every migrated `toolbox.*` command handler on the registry.
 * Does NOT register Karton procedures — that happens in
 * `attachAgentCoreBridge`, which must run after every legacy service
 * has finished registering its own Karton handlers so the bridge's
 * drift guard sees the final registry.
 *
 * The returned handles must outlive the host process.
 */
export function createAgentCoreSeam(ctx: {
  karton: KartonService;
}): AgentCoreSeamHandles & { karton: KartonService } {
  const { karton } = ctx;

  const store = new AgentStore(createInitialAgentSystemState());
  const activeAppController = createActiveAppStateController(store);
  const mountsController = createMountsStateController(store);
  const hostAgentStateMutations = createHostAgentStateMutations(store);
  const registry = new CommandRegistry();

  registerToolboxSeamHandlers(registry, { activeApp: activeAppController });
  registerAgentsSeamHandlers(registry, {
    hostAgentStateMutations,
  });

  return {
    store,
    registry,
    activeAppController,
    mountsController,
    hostAgentStateMutations,
    karton,
  };
}

/**
 * Attaches the `AgentCoreBridge` to a previously-built seam. This is
 * what actually registers Karton procedure routes AND starts mirroring
 * store → Karton for migrated fields.
 *
 * Must be invoked exactly once, AFTER every legacy service (in particular
 * `ToolboxService` and `DiffHistoryService`) has registered its Karton
 * procedures — the bridge's drift guard runs against the final registry,
 * and Karton rejects double-registrations.
 */
export function attachAgentCoreBridge(
  seam: AgentCoreSeamHandles & { karton: KartonService },
  ctx: { host: AgentHost; diffHistory: DiffHistoryService },
): AgentCoreBridgeHandles {
  const {
    karton,
    store,
    registry,
    activeAppController,
    mountsController,
    hostAgentStateMutations,
  } = seam;
  const { host, diffHistory } = ctx;

  // Phase 5: register the attach-phase toolbox handlers (`acceptHunks`,
  // `rejectHunks`) now that `DiffHistoryService` and the full host
  // (including `telemetry`) are available. Must happen before
  // `bridge.attach()` so the drift guard sees the final registry.
  registerToolboxAttachHandlers(registry, {
    diffHistory,
    telemetry: host.telemetry,
  });

  const bridge = new AgentCoreBridge({ karton, store, registry });
  bridge.attach();

  return {
    store,
    registry,
    bridge,
    activeAppController,
    mountsController,
    hostAgentStateMutations,
    host,
  };
}

/**
 * One-shot convenience wrapper that builds the seam AND attaches the
 * bridge in a single call. Callers that do not need to inject the
 * seam's controllers into services that construct before the
 * `AgentHost` is available may use this form.
 *
 * The production `main.ts` uses the two-phase form because
 * `MountManagerService` consumes `mountsController` before
 * `modelProviderService` (and therefore `agentCoreHost`) exists, and
 * `DiffHistoryService` (package-side since Phase 5) needs the full
 * `AgentHost` for paths + telemetry before it can be constructed.
 */
export function createAgentCoreBridge(
  ctx: AgentCoreBridgeContext & { diffHistory: DiffHistoryService },
): AgentCoreBridgeHandles {
  const seam = createAgentCoreSeam({ karton: ctx.karton });
  return attachAgentCoreBridge(seam, {
    host: ctx.host,
    diffHistory: ctx.diffHistory,
  });
}
