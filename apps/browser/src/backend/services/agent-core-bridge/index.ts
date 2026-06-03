import type {
  AgentStore,
  AgentSystemState,
  CommandName,
  CommandRegistry,
} from '@stagewise/agent-core';
import { applyPatches, enablePatches, type Patch } from 'immer';
import type { KartonService } from '../karton';
import { MIGRATED_PROCEDURES } from './contract-map';
import { BridgeDriftError, serializeHandlerError } from './errors';

// Immer's patches plugin must be enabled before any `applyPatches` call.
// `agent-store.ts` also calls this on load — both are idempotent. Calling
// it from the bridge module too keeps this file self-contained and removes
// the implicit "AgentStore module must have loaded first" coupling.
enablePatches();

/**
 * Construction options for `AgentCoreBridge`.
 */
export interface AgentCoreBridgeOptions {
  karton: KartonService;
  store: AgentStore;
  registry: CommandRegistry;
  /**
   * Caller id attached to every inbound Karton procedure. Defaults to
   * `'ui:main'` — the main UI Karton connection (D-KB-3). The Karton
   * client id supplied at call-time is intentionally ignored in Phase 1c
   * because the main UI is the only registered client; later phases may
   * map per-client ids when pages-api and other transports come online.
   */
  kartonCallerId?: string;
}

type ToolboxEntry = AgentSystemState['toolbox'][string];
type ActiveAppValue = ToolboxEntry['activeApp'];
type PendingAppMessageValue = ToolboxEntry['pendingAppMessage'];
type PendingFileDiffsValue = ToolboxEntry['pendingFileDiffs'];
type EditSummaryValue = ToolboxEntry['editSummary'];
type MountsValue = ToolboxEntry['workspace']['mounts'];

/**
 * Host-side adapter that routes Karton procedures through the
 * `CommandRegistry` in `@stagewise/agent-core` and mirrors AgentStore
 * ownership of migrated fields back into Karton.
 *
 * Phase 1c responsibilities (D-KB-1):
 *   1. Validate the migrated-procedure list against the registry at
 *      `attach()` time — fail fast on drift.
 *   2. Register one Karton procedure handler per migrated name that
 *      forwards the call tuple to `registry.dispatch` and rethrows
 *      sanitized errors back to Karton.
 *
 * Phase 1d adds:
 *   3. Subscribe to `AgentStore` and mirror the migrated per-field slice
 *      (`toolbox[agentId].activeApp`, `toolbox[agentId].pendingAppMessage`)
 *      into Karton. Non-migrated Karton toolbox fields are never touched
 *      by the mirror.
 *
 * Phase 6 extends the mirror with projection of
 * `agents.instances[agentId]`. The store is canonical; Karton is
 * downstream. Projection is patch-forwarding: every `store.update()`
 * yields the Immer patches that describe the mutation, and the
 * bridge re-applies only the `agents.*` patches inside a single
 * `karton.setState` call. Because `AgentSystemState.agents` is a
 * path-equivalent subset of Karton `AppState.agents`, the patches
 * apply verbatim with no re-rooting. Per-chunk streaming updates
 * therefore broadcast `O(changed-path)` payloads instead of the
 * full envelope, restoring origin/main's per-tick payload size.
 */
export class AgentCoreBridge {
  private readonly karton: KartonService;
  readonly store: AgentStore;
  private readonly registry: CommandRegistry;
  private readonly kartonCallerId: string;
  private attached = false;
  private unsubscribeStore: (() => void) | null = null;
  /**
   * Snapshot of the store state used to diff migrated fields on each
   * emission. Initialized from `store.get()` at `attach()` time so the
   * very first emission can be compared against the seed state.
   */
  private lastMirrored: AgentSystemState | null = null;

  constructor(opts: AgentCoreBridgeOptions) {
    this.karton = opts.karton;
    this.store = opts.store;
    this.registry = opts.registry;
    this.kartonCallerId = opts.kartonCallerId ?? 'ui:main';
  }

  /**
   * Validates the contract map against the registry, registers a Karton
   * procedure handler for every migrated name, then subscribes to the
   * store and mirrors migrated fields into Karton. Must be called exactly
   * once.
   */
  attach(): void {
    if (this.attached) {
      throw new Error('AgentCoreBridge already attached');
    }

    // Drift guard (D-KB-5) — run first so a missing handler fails before
    // we register any Karton route.
    for (const name of MIGRATED_PROCEDURES) {
      if (!this.registry.has(name)) {
        throw new BridgeDriftError(name);
      }
    }

    for (const name of MIGRATED_PROCEDURES) {
      this.registerProcedure(name);
    }

    // Phase 1d mirror: store is canonical for `activeApp` and
    // `pendingAppMessage`; Karton is a per-field projection.
    //
    // Phase 6 + perf: `agents.instances` is forwarded as granular
    // Immer patches (one patch per mutated path), so per-chunk
    // streaming updates broadcast O(part_size) payloads instead of
    // the full envelope.
    this.lastMirrored = this.store.get();
    this.seedAgentInstancesIfAny();
    this.unsubscribeStore = this.store.subscribe((next, _prev, patches) => {
      this.mirrorToKarton(this.lastMirrored, next, patches);
      this.lastMirrored = next;
    });

    this.attached = true;
  }

  /**
   * Defensive one-time seed: if the store already has agent instances
   * at attach time, project them into Karton with a single
   * `karton.setState`. Patch forwarding only kicks in on subsequent
   * `store.update()` calls, so without this seed any pre-attach
   * upsert would never reach Karton.
   *
   * In production and tests the store is empty at attach (the runtime
   * order is `createAgentCoreSeam` → bridge construction → attach →
   * `AgentManagerService` starts inserting agents), so this is a
   * no-op in the happy path.
   */
  private seedAgentInstancesIfAny(): void {
    const instances = this.store.get().agents.instances;
    const ids = Object.keys(instances);
    if (ids.length === 0) return;
    this.karton.setState((draft) => {
      const kInstances = draft.agents.instances as unknown as Record<
        string,
        unknown
      >;
      for (const id of ids) {
        kInstances[id] = instances[id];
      }
    });
  }

  private registerProcedure(name: CommandName): void {
    // `KartonContract['serverProcedures']` is deeply typed; the bridge
    // intentionally erases per-procedure argument shapes at the boundary
    // (`...args: unknown[]`) and relies on the per-handler registration
    // in `handlers/*.ts` for type safety. This is the "accept drift,
    // check at boot" compromise from SPEC §KartonBridge.
    this.karton.registerServerProcedureHandler(
      name as Parameters<KartonService['registerServerProcedureHandler']>[0],
      (async (_callingClientId: string, ...args: unknown[]) => {
        try {
          return await this.registry.dispatch(
            name,
            { callerId: this.kartonCallerId },
            args,
          );
        } catch (err) {
          throw serializeHandlerError(err);
        }
      }) as Parameters<KartonService['registerServerProcedureHandler']>[1],
    );
  }

  /**
   * Two-pronged mirror from AgentStore → Karton. Both prongs share a
   * single `karton.setState` so each store emission produces at most
   * one Karton broadcast, and emissions with no mirrorable change
   * skip `karton.setState` entirely so mirror traffic stays
   * proportional to real state changes.
   *
   * Toolbox (per-field diff): only fields for which the store is
   * canonical (`activeApp`, `pendingAppMessage`, `pendingFileDiffs`,
   * `editSummary`, `workspace.mounts`) are written.
   *   - `activeApp` / `pendingAppMessage`: shallow structural compare
   *     (fields that matter for the UI).
   *   - `pendingFileDiffs` / `editSummary` / `workspace.mounts`:
   *     reference identity. Writers (`DiffHistoryService.updateDiffKartonState`,
   *     `MountManagerService.rebuildMountsFor`) produce fresh array
   *     references only when content changes, so identity-based dedup is
   *     both correct and O(1).
   *
   * `agents.instances` (patch forwarding): the Immer patches generated
   * by `store.update()` are filtered to the `agents.*` subtree and
   * re-applied to the Karton draft. `AgentSystemState.agents` mirrors
   * `AppState.agents` path-for-path, so patches transfer verbatim —
   * including granular paths like
   * `['agents','instances',id,'state','history',i,'parts',j]` — and
   * the Karton broadcast payload matches origin/main's per-chunk
   * size instead of the whole envelope. Deletions arrive as `remove`
   * patches and project as Karton `delete` automatically.
   */
  private mirrorToKarton(
    prev: AgentSystemState | null,
    next: AgentSystemState,
    patches: Patch[],
  ): void {
    // Granular projection for `agents.instances` — forward the exact
    // Immer patches the store produced. `AgentSystemState.agents` is
    // a path-equivalent subset of Karton `AppState.agents`, so the
    // patches apply verbatim with no re-rooting.
    const agentPatches = patches.filter((p) => p.path[0] === 'agents');

    const agentIds = new Set<string>();
    if (prev) for (const id of Object.keys(prev.toolbox)) agentIds.add(id);
    for (const id of Object.keys(next.toolbox)) agentIds.add(id);

    const changes: Array<{
      agentId: string;
      activeApp?: ActiveAppValue;
      pendingAppMessage?: PendingAppMessageValue;
      pendingFileDiffs?: PendingFileDiffsValue;
      editSummary?: EditSummaryValue;
      mounts?: MountsValue;
    }> = [];

    for (const agentId of agentIds) {
      const prevEntry = prev?.toolbox[agentId];
      const nextEntry = next.toolbox[agentId];

      const prevActive = prevEntry?.activeApp;
      const nextActive = nextEntry?.activeApp;
      const prevPending = prevEntry?.pendingAppMessage;
      const nextPending = nextEntry?.pendingAppMessage;
      const prevDiffs = prevEntry?.pendingFileDiffs;
      const nextDiffs = nextEntry?.pendingFileDiffs;
      const prevSummary = prevEntry?.editSummary;
      const nextSummary = nextEntry?.editSummary;
      const prevMounts = prevEntry?.workspace.mounts;
      const nextMounts = nextEntry?.workspace.mounts;

      const activeChanged = !shallowEqualActiveApp(prevActive, nextActive);
      const pendingChanged = !shallowEqualPendingMessage(
        prevPending,
        nextPending,
      );
      // Reference identity: writers allocate fresh arrays on content
      // change. Treat `undefined` (missing entry) and an existing empty
      // array as equivalent — a mirror write for an agent that is
      // gaining its toolbox entry solely because the store picked up an
      // empty diff set would be a wasted round-trip.
      const diffsChanged =
        prevDiffs !== nextDiffs &&
        !(prevDiffs === undefined && nextDiffs?.length === 0) &&
        !(nextDiffs === undefined && prevDiffs?.length === 0);
      const summaryChanged =
        prevSummary !== nextSummary &&
        !(prevSummary === undefined && nextSummary?.length === 0) &&
        !(nextSummary === undefined && prevSummary?.length === 0);
      const mountsChanged =
        prevMounts !== nextMounts &&
        !(prevMounts === undefined && nextMounts?.length === 0) &&
        !(nextMounts === undefined && prevMounts?.length === 0);

      if (
        !activeChanged &&
        !pendingChanged &&
        !diffsChanged &&
        !summaryChanged &&
        !mountsChanged
      )
        continue;

      const entry: {
        agentId: string;
        activeApp?: ActiveAppValue;
        pendingAppMessage?: PendingAppMessageValue;
        pendingFileDiffs?: PendingFileDiffsValue;
        editSummary?: EditSummaryValue;
        mounts?: MountsValue;
      } = { agentId };
      if (activeChanged) entry.activeApp = nextActive ?? null;
      if (pendingChanged) entry.pendingAppMessage = nextPending ?? null;
      if (diffsChanged) entry.pendingFileDiffs = nextDiffs ?? [];
      if (summaryChanged) entry.editSummary = nextSummary ?? [];
      if (mountsChanged) entry.mounts = nextMounts ?? [];
      changes.push(entry);
    }

    if (changes.length === 0 && agentPatches.length === 0) return;

    this.karton.setState((draft) => {
      if (agentPatches.length > 0) {
        // The store's envelope uses core types (`UniversalTools`,
        // `RequiredModelCapabilities = Record<string, boolean|undefined>`).
        // Karton's `AppState.agents.instances[id]` specializes to
        // `UIAgentTools` + a structured `ModelSettings['capabilities']`.
        // Runtime shape is identical because writers always build the
        // envelope from the host-narrowed source of truth before
        // calling `upsertAgentInstance`. Cross the variance boundary
        // through `unknown` at this single dedicated site.
        //
        // Structural drift between `AgentSystemState.agents` and
        // `AppState.agents` is caught at typecheck by
        // `apps/browser/src/shared/karton-contracts/ui/agent-core-parity.ts`
        // (`_AgentsSliceParity`) — adding/renaming a field on either side
        // without the other will fail compilation, so the cast here and
        // the patch paths are safe.
        //
        // `applyPatches` mutates the draft in place — the surrounding
        // `produce` records the same path-level patches against
        // Karton's state, so the broadcast payload matches origin/main
        // (one patch per mutated path, NOT the whole envelope).
        applyPatches(draft as unknown as AgentSystemState, agentPatches);
      }
      for (const change of changes) {
        let kartonEntry = draft.toolbox[change.agentId];
        if (!kartonEntry) {
          // Create a Karton toolbox entry with the defaults that
          // SandboxService.open-app used to seed. Other migrations will
          // populate the rest.
          kartonEntry = {
            workspace: { mounts: [] },
            pendingFileDiffs: [],
            editSummary: [],
            pendingUserQuestion: null,
          } as typeof kartonEntry;
          draft.toolbox[change.agentId] = kartonEntry;
        }
        if ('activeApp' in change) {
          kartonEntry.activeApp = change.activeApp ?? null;
        }
        if ('pendingAppMessage' in change) {
          kartonEntry.pendingAppMessage = change.pendingAppMessage ?? null;
        }
        if ('pendingFileDiffs' in change) {
          kartonEntry.pendingFileDiffs = (change.pendingFileDiffs ??
            []) as typeof kartonEntry.pendingFileDiffs;
        }
        if ('editSummary' in change) {
          kartonEntry.editSummary = (change.editSummary ??
            []) as typeof kartonEntry.editSummary;
        }
        if ('mounts' in change) {
          // Replace the whole `workspace` object so Karton subscribers
          // observe a clean reference change on the `workspace` slice
          // itself, not just on `workspace.mounts`.
          kartonEntry.workspace = {
            mounts: (change.mounts ??
              []) as typeof kartonEntry.workspace.mounts,
          };
        }
      }
    });
  }

  /**
   * Test hook — tears down the store subscription and marks the bridge
   * detached. Not used in production (the bridge lives for the host
   * lifetime).
   */
  detachForTest(): void {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
    this.attached = false;
    this.lastMirrored = null;
  }
}

function shallowEqualActiveApp(
  a: ActiveAppValue | undefined,
  b: ActiveAppValue | undefined,
): boolean {
  const aNil = a == null;
  const bNil = b == null;
  if (aNil && bNil) return true;
  if (aNil !== bNil) return false;
  return (
    a!.appId === b!.appId &&
    a!.pluginId === b!.pluginId &&
    a!.src === b!.src &&
    a!.height === b!.height
  );
}

function shallowEqualPendingMessage(
  a: PendingAppMessageValue | undefined,
  b: PendingAppMessageValue | undefined,
): boolean {
  const aNil = a == null;
  const bNil = b == null;
  if (aNil && bNil) return true;
  if (aNil !== bNil) return false;
  // `data` is an opaque payload; identity comparison is sufficient
  // because writers always allocate a fresh object per message.
  return (
    a!.appId === b!.appId && a!.pluginId === b!.pluginId && a!.data === b!.data
  );
}
