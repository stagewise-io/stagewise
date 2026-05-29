import type {
  AgentStore,
  AgentSystemState,
  CommandName,
  CommandRegistry,
} from '@stagewise/agent-core';
import type { KartonService } from '../karton';
import { MIGRATED_PROCEDURES } from './contract-map';
import { BridgeDriftError, serializeHandlerError } from './errors';

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

type AgentsMap = AgentSystemState['agents']['instances'];
type AgentEnvelope = AgentsMap[string];

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
 * Phase 6 extends the mirror with whole-envelope projection of
 * `agents.instances[agentId]`. The store is canonical; Karton is
 * downstream. Dedup is reference-identity on the envelope — writers
 * always allocate a fresh envelope per mutation via Immer, so identity
 * equality is both correct and O(1).
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
    this.lastMirrored = this.store.get();
    this.unsubscribeStore = this.store.subscribe((next) => {
      this.mirrorToKarton(this.lastMirrored, next);
      this.lastMirrored = next;
    });

    this.attached = true;
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
   * Per-field mirror from AgentStore → Karton. Only fields for which the
   * store is canonical (`activeApp`, `pendingAppMessage`, `pendingFileDiffs`,
   * `editSummary`, `workspace.mounts`) are written. Unchanged fields skip
   * `karton.setState` entirely so mirror traffic stays proportional to
   * real state changes.
   *
   * Diff strategy:
   *   - `activeApp` / `pendingAppMessage`: shallow structural compare
   *     (fields that matter for the UI).
   *   - `pendingFileDiffs` / `editSummary` / `workspace.mounts`: reference
   *     identity. Writers (`DiffHistoryService.updateDiffKartonState`,
   *     `MountManagerService.rebuildMountsFor`) produce fresh array
   *     references only when content changes, so identity-based dedup is
   *     both correct and O(1).
   *   - `agents.instances[id]`: reference identity on the whole
   *     envelope. `AgentInstancesStateController` always allocates a
   *     fresh envelope per mutation (Immer), so a preserved reference
   *     means "no change." Deletions (`id` in prev but not next) project
   *     as Karton `delete`.
   */
  private mirrorToKarton(
    prev: AgentSystemState | null,
    next: AgentSystemState,
  ): void {
    const agentInstanceChanges = this.computeAgentInstanceChanges(prev, next);

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

    if (changes.length === 0 && agentInstanceChanges === null) return;

    this.karton.setState((draft) => {
      if (agentInstanceChanges) {
        // The store's envelope uses core types (`UniversalTools`,
        // `RequiredModelCapabilities = Record<string, boolean|undefined>`).
        // Karton's `AppState.agents.instances[id]` specializes to
        // `UIAgentTools` + a structured `ModelSettings['capabilities']`.
        // Runtime shape is identical because writers always build the
        // envelope from the host-narrowed source of truth before
        // calling `controller.upsertInstance`. Cross the variance
        // boundary through `unknown` at this single dedicated site.
        const instances = draft.agents.instances as unknown as Record<
          string,
          unknown
        >;
        for (const id of agentInstanceChanges.deleted) {
          delete instances[id];
        }
        for (const [id, envelope] of agentInstanceChanges.upserts) {
          instances[id] = envelope;
        }
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
   * Computes the diff of the `agents.instances` map between two store
   * snapshots. Returns `null` when nothing changed so the caller can
   * skip the `karton.setState` round-trip entirely.
   *
   * Writers (`AgentInstancesStateController`) always allocate a fresh
   * envelope per mutation via Immer, so identity equality on the
   * envelope is both correct and O(1).
   */
  private computeAgentInstanceChanges(
    prev: AgentSystemState | null,
    next: AgentSystemState,
  ): {
    upserts: Array<[string, AgentEnvelope]>;
    deleted: string[];
  } | null {
    const prevMap = prev?.agents.instances ?? {};
    const nextMap = next.agents.instances;

    const upserts: Array<[string, AgentEnvelope]> = [];
    for (const [id, envelope] of Object.entries(nextMap)) {
      if (prevMap[id] !== envelope) {
        upserts.push([id, envelope]);
      }
    }

    const deleted: string[] = [];
    for (const id of Object.keys(prevMap)) {
      if (!(id in nextMap)) {
        deleted.push(id);
      }
    }

    if (upserts.length === 0 && deleted.length === 0) return null;
    return { upserts, deleted };
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
