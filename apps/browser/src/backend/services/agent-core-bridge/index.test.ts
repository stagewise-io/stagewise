import {
  AgentTypes,
  CommandRegistry,
  createInitialAgentSystemState,
  AgentStore,
  ensureToolboxEntry,
  setAgentMounts,
  upsertAgentInstance,
  deleteAgentInstance,
  type AgentInstanceEnvelope,
  type AgentSystemState,
  type FileDiff,
  type MountEntry,
} from '@stagewise/agent-core';
import { produce } from 'immer';
import type { Draft } from 'immer';
import { describe, it, expect, vi } from 'vitest';
import type { KartonService } from '../karton';
import { AgentCoreBridge } from './index';
import { BridgeDriftError } from './errors';
import { registerToolboxSeamHandlers } from './handlers/toolbox';
import {
  createActiveAppStateController,
  type ActiveAppStateController,
} from './state/toolbox-active-app';
import type { HostAgentInstanceEnvelope } from './state/agent-instances';
import type { AgentState } from '@shared/karton-contracts/ui/agent';

/**
 * Minimal `KartonService` stand-in. The bridge only touches
 * `registerServerProcedureHandler`; every other member is unused in
 * Phase 1c, so a partial mock cast keeps the test faithful without
 * dragging in the full Karton/Electron transport.
 */
/**
 * Minimal shape of the Karton state the bridge writes into. Declared
 * locally so the mock does not depend on the full `KartonContract`
 * generic — the bridge only ever touches `toolbox[agentId]`.
 */
type MockKartonToolboxEntry = {
  workspace: { mounts: unknown[] };
  pendingFileDiffs: unknown[];
  editSummary: unknown[];
  pendingUserQuestion: unknown;
  activeApp?: unknown;
  pendingAppMessage?: unknown;
  // Free-form extra fields that must survive mirror writes.
  [key: string]: unknown;
};
type MockKartonAgentEnvelope = {
  type: unknown;
  canSelectModel: boolean;
  requiredModelCapabilities: unknown;
  allowUserInput: boolean;
  parentAgentInstanceId: string | null;
  state: unknown;
  [key: string]: unknown;
};
type MockKartonState = {
  toolbox: Record<string, MockKartonToolboxEntry>;
  agents?: { instances: Record<string, MockKartonAgentEnvelope> };
};

function createKartonMock(initialState?: MockKartonState) {
  const handlers = new Map<
    string,
    (callingClientId: string, ...args: unknown[]) => Promise<unknown>
  >();
  const register = vi.fn((name: string, handler: unknown) => {
    handlers.set(
      name,
      handler as (
        callingClientId: string,
        ...args: unknown[]
      ) => Promise<unknown>,
    );
  });

  // Always materialize `agents.instances` so the bridge's `agents.instances`
  // mirror branch can read/write without guards. Tests that pass an
  // initial state with only `toolbox` get an empty instances map.
  const seedState: MockKartonState = initialState
    ? { ...initialState, agents: initialState.agents ?? { instances: {} } }
    : { toolbox: {}, agents: { instances: {} } };
  let state: MockKartonState = seedState;
  const setState = vi.fn((recipe: (draft: Draft<MockKartonState>) => void) => {
    state = produce(state, recipe);
    return state;
  });

  const karton = {
    registerServerProcedureHandler: register,
    setState,
  } as unknown as KartonService;

  return {
    karton,
    register,
    handlers,
    setState,
    getState: () => state,
  };
}

function createBridgeHarness() {
  const mock = createKartonMock();
  const store = new AgentStore(createInitialAgentSystemState());
  const registry = new CommandRegistry();
  return {
    karton: mock.karton,
    register: mock.register,
    handlers: mock.handlers,
    setState: mock.setState,
    getKartonState: mock.getState,
    store,
    registry,
  };
}

/**
 * Registers every migrated command with a no-op handler so the bridge's
 * drift guard passes. Individual tests override specific commands after
 * calling this (`registerCommand` rejects duplicates, so tests that want
 * a custom handler skip this helper and wire up each command manually).
 */
function registerAllMigratedNoOps(registry: CommandRegistry): void {
  registry.registerCommand<[agentInstanceId: string], void>(
    'toolbox.clearPendingAppMessage',
    async () => {},
  );
  registerAttachHandlerNoOps(registry);
}

/**
 * Registers no-op handlers for the attach-phase toolbox commands
 * (`toolbox.acceptHunks`, `toolbox.rejectHunks`) so the bridge's drift
 * guard passes in tests that only exercise seam-phase behaviour.
 */
function registerAttachHandlerNoOps(registry: CommandRegistry): void {
  registry.registerCommand<[hunkIds: string[]], void>(
    'toolbox.acceptHunks',
    async () => {},
  );
  registry.registerCommand<[hunkIds: string[]], void>(
    'toolbox.rejectHunks',
    async () => {},
  );
  registry.registerCommand<[agentInstanceId: string], void>(
    'agents.markAsRead',
    async () => {},
  );
}

describe('AgentCoreBridge', () => {
  describe('routing', () => {
    it('registers a Karton handler for every migrated procedure and dispatches through the registry', async () => {
      const { karton, register, handlers, store, registry } =
        createBridgeHarness();

      const toolboxHandler = vi.fn<
        (
          ctx: { callerId: string },
          args: [agentInstanceId: string],
        ) => Promise<void>
      >(async () => {});
      registry.registerCommand<[agentInstanceId: string], void>(
        'toolbox.dismissActiveApp',
        toolboxHandler,
      );
      registerAllMigratedNoOps(registry);

      const bridge = new AgentCoreBridge({ karton, store, registry });
      bridge.attach();

      expect(register).toHaveBeenCalledTimes(5);
      expect(register).toHaveBeenCalledWith(
        'toolbox.dismissActiveApp',
        expect.any(Function),
      );
      expect(register).toHaveBeenCalledWith(
        'toolbox.clearPendingAppMessage',
        expect.any(Function),
      );
      expect(register).toHaveBeenCalledWith(
        'toolbox.acceptHunks',
        expect.any(Function),
      );
      expect(register).toHaveBeenCalledWith(
        'toolbox.rejectHunks',
        expect.any(Function),
      );
      expect(register).toHaveBeenCalledWith(
        'agents.markAsRead',
        expect.any(Function),
      );

      const wrapped = handlers.get('toolbox.dismissActiveApp');
      expect(wrapped).toBeDefined();

      await wrapped!('client-xyz', 'agent-42');

      expect(toolboxHandler).toHaveBeenCalledTimes(1);
      const [ctx, args] = toolboxHandler.mock.calls[0]!;
      expect(ctx).toEqual({ callerId: 'ui:main' });
      expect(args).toEqual(['agent-42']);
    });

    it('uses a custom kartonCallerId when provided', async () => {
      const { karton, handlers, store, registry } = createBridgeHarness();

      const toolboxHandler = vi.fn<
        (
          ctx: { callerId: string },
          args: [agentInstanceId: string],
        ) => Promise<void>
      >(async () => {});
      registry.registerCommand<[agentInstanceId: string], void>(
        'toolbox.dismissActiveApp',
        toolboxHandler,
      );
      registerAllMigratedNoOps(registry);

      const bridge = new AgentCoreBridge({
        karton,
        store,
        registry,
        kartonCallerId: 'pages-api',
      });
      bridge.attach();

      await handlers.get('toolbox.dismissActiveApp')!('client', 'agent-1');

      expect(toolboxHandler.mock.calls[0]![0]).toEqual({
        callerId: 'pages-api',
      });
    });
  });

  describe('drift guard (D-KB-5)', () => {
    it('throws BridgeDriftError when a migrated procedure has no registered command', () => {
      const { karton, register, store, registry } = createBridgeHarness();
      // Registry intentionally empty — contract-map expects
      // `toolbox.dismissActiveApp`.

      const bridge = new AgentCoreBridge({ karton, store, registry });

      expect(() => bridge.attach()).toThrow(BridgeDriftError);
      expect(() => bridge.attach()).toThrow(/toolbox\.dismissActiveApp/);
      // Drift must fail fast — no Karton route should be registered.
      expect(register).not.toHaveBeenCalled();
    });

    it('exposes the missing procedure name on the thrown BridgeDriftError', () => {
      const { karton, store, registry } = createBridgeHarness();
      const bridge = new AgentCoreBridge({ karton, store, registry });

      try {
        bridge.attach();
        expect.unreachable('attach() should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(BridgeDriftError);
        expect((err as BridgeDriftError).procedure).toBe(
          'toolbox.dismissActiveApp',
        );
        expect((err as BridgeDriftError).name).toBe('BridgeDriftError');
      }
    });
  });

  describe('error passthrough (D-KB-4)', () => {
    it('preserves the original error name and message when a handler rejects', async () => {
      const { karton, handlers, store, registry } = createBridgeHarness();

      registry.registerCommand<[agentInstanceId: string], void>(
        'toolbox.dismissActiveApp',
        async () => {
          throw new RangeError('bad range');
        },
      );
      registerAllMigratedNoOps(registry);

      new AgentCoreBridge({ karton, store, registry }).attach();

      const wrapped = handlers.get('toolbox.dismissActiveApp')!;

      await expect(wrapped('client', 'agent-1')).rejects.toMatchObject({
        name: 'RangeError',
        message: 'bad range',
      });
    });

    it('wraps non-Error rejections in a plain Error with the stringified value', async () => {
      const { karton, handlers, store, registry } = createBridgeHarness();

      registry.registerCommand<[agentInstanceId: string], void>(
        'toolbox.dismissActiveApp',
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-throw-literal
          throw 'string-reject';
        },
      );
      registerAllMigratedNoOps(registry);

      new AgentCoreBridge({ karton, store, registry }).attach();

      const wrapped = handlers.get('toolbox.dismissActiveApp')!;

      await expect(wrapped('client', 'agent-1')).rejects.toMatchObject({
        name: 'Error',
        message: 'string-reject',
      });
    });
  });

  describe('attach() lifecycle', () => {
    it('throws on the second attach() call', () => {
      const { karton, store, registry } = createBridgeHarness();
      registry.registerCommand<[agentInstanceId: string], void>(
        'toolbox.dismissActiveApp',
        async () => {},
      );
      registerAllMigratedNoOps(registry);

      const bridge = new AgentCoreBridge({ karton, store, registry });
      bridge.attach();

      expect(() => bridge.attach()).toThrow(/already attached/);
    });
  });
});

describe('registerToolboxSeamHandlers', () => {
  function createActiveAppMock(): ActiveAppStateController {
    return {
      getActiveApp: vi.fn(),
      setActiveApp: vi.fn(),
      clearActiveApp: vi.fn(),
      setPendingAppMessage: vi.fn(),
      clearPendingAppMessage: vi.fn(),
    };
  }

  it('routes toolbox.dismissActiveApp to ActiveAppStateController.clearActiveApp', async () => {
    const registry = new CommandRegistry();
    const activeApp = createActiveAppMock();

    registerToolboxSeamHandlers(registry, { activeApp });

    await registry.dispatch<[agentInstanceId: string], void>(
      'toolbox.dismissActiveApp',
      { callerId: 'ui:main' },
      ['agent-99'],
    );

    expect(activeApp.clearActiveApp).toHaveBeenCalledTimes(1);
    expect(activeApp.clearActiveApp).toHaveBeenCalledWith('agent-99');
    expect(activeApp.clearPendingAppMessage).not.toHaveBeenCalled();
  });

  it('routes toolbox.clearPendingAppMessage to ActiveAppStateController.clearPendingAppMessage', async () => {
    const registry = new CommandRegistry();
    const activeApp = createActiveAppMock();

    registerToolboxSeamHandlers(registry, { activeApp });

    await registry.dispatch<[agentInstanceId: string], void>(
      'toolbox.clearPendingAppMessage',
      { callerId: 'ui:main' },
      ['agent-123'],
    );

    expect(activeApp.clearPendingAppMessage).toHaveBeenCalledTimes(1);
    expect(activeApp.clearPendingAppMessage).toHaveBeenCalledWith('agent-123');
    expect(activeApp.clearActiveApp).not.toHaveBeenCalled();
  });
});

/**
 * End-to-end coverage for Phase 1d: the bridge owns the store-to-Karton
 * mirror for the two migrated slices, and dispatched commands must mutate
 * `AgentStore` — never Karton — as the canonical write path.
 */
describe('AgentCoreBridge (Phase 1d mirror + ownership)', () => {
  function createMirrorHarness() {
    const mock = createKartonMock();
    const store = new AgentStore(createInitialAgentSystemState());
    const controller = createActiveAppStateController(store);
    const registry = new CommandRegistry();
    registerToolboxSeamHandlers(registry, { activeApp: controller });
    registerAttachHandlerNoOps(registry);

    const bridge = new AgentCoreBridge({
      karton: mock.karton,
      store,
      registry,
    });
    bridge.attach();

    return {
      karton: mock.karton,
      register: mock.register,
      handlers: mock.handlers,
      setState: mock.setState,
      getKartonState: mock.getState,
      store,
      registry,
      controller,
      bridge,
    };
  }

  describe('command dispatch mutates AgentStore, not Karton', () => {
    it('toolbox.dismissActiveApp clears activeApp in the store, then mirrors null to Karton', async () => {
      const { handlers, store, setState, getKartonState } =
        createMirrorHarness();

      // Seed an active app directly on the store so there is something
      // to clear. Use `createActiveAppStateController`-style mutation to
      // stay on the canonical write path.
      store.update((draft) => {
        draft.toolbox['agent-1'] = {
          workspace: { mounts: [] },
          pendingFileDiffs: [],
          editSummary: [],
          pendingUserQuestion: null,
          activeApp: {
            appId: 'my-app',
            src: 'blob:x',
            pluginId: 'p',
            height: 100,
          },
        };
      });

      // The mirror runs synchronously on every store emission; Karton
      // should already have the seeded app.
      expect(getKartonState().toolbox['agent-1']?.activeApp).toEqual({
        appId: 'my-app',
        src: 'blob:x',
        pluginId: 'p',
        height: 100,
      });
      const setStateCallsBeforeDispatch = setState.mock.calls.length;

      await handlers.get('toolbox.dismissActiveApp')!('client', 'agent-1');

      // Store is canonical — the command should have cleared the slice
      // there.
      expect(store.get().toolbox['agent-1']?.activeApp).toBeNull();
      // And the mirror should have projected that into Karton on the
      // resulting emission.
      expect(getKartonState().toolbox['agent-1']?.activeApp).toBeNull();
      expect(setState.mock.calls.length).toBeGreaterThan(
        setStateCallsBeforeDispatch,
      );
    });

    it('toolbox.clearPendingAppMessage clears pendingAppMessage in the store and mirrors null to Karton', async () => {
      const { handlers, store, getKartonState } = createMirrorHarness();

      store.update((draft) => {
        draft.toolbox['agent-2'] = {
          workspace: { mounts: [] },
          pendingFileDiffs: [],
          editSummary: [],
          pendingUserQuestion: null,
          pendingAppMessage: {
            appId: 'my-app',
            pluginId: 'p',
            data: { hello: 'world' },
          },
        };
      });
      expect(getKartonState().toolbox['agent-2']?.pendingAppMessage).toEqual({
        appId: 'my-app',
        pluginId: 'p',
        data: { hello: 'world' },
      });

      await handlers.get('toolbox.clearPendingAppMessage')!(
        'client',
        'agent-2',
      );

      expect(store.get().toolbox['agent-2']?.pendingAppMessage).toBeNull();
      expect(getKartonState().toolbox['agent-2']?.pendingAppMessage).toBeNull();
    });
  });

  describe('store→Karton mirror', () => {
    it('mirrors activeApp into Karton when the store sets it', () => {
      const { controller, getKartonState } = createMirrorHarness();

      controller.setActiveApp('agent-a', {
        appId: 'app-1',
        pluginId: 'plugin-x',
        src: 'blob:abc',
        height: 240,
      });

      expect(getKartonState().toolbox['agent-a']?.activeApp).toEqual({
        appId: 'app-1',
        pluginId: 'plugin-x',
        src: 'blob:abc',
        height: 240,
      });
    });

    it('mirrors pendingAppMessage into Karton when the store sets it', () => {
      const { controller, getKartonState } = createMirrorHarness();

      const payload = { data: { key: 'v' } };
      controller.setPendingAppMessage('agent-a', {
        appId: 'app-1',
        pluginId: 'plugin-x',
        data: payload,
      });

      expect(getKartonState().toolbox['agent-a']?.pendingAppMessage).toEqual({
        appId: 'app-1',
        pluginId: 'plugin-x',
        data: payload,
      });
    });

    it('preserves non-migrated Karton toolbox fields across mirror writes', () => {
      // Seed Karton with rich non-migrated state, then attach a bridge.
      const mock = createKartonMock({
        toolbox: {
          'agent-a': {
            workspace: { mounts: ['w:/workspaces/a'] },
            pendingFileDiffs: [{ id: 'diff-1' }],
            editSummary: [{ id: 'edit-1' }],
            pendingUserQuestion: { id: 'q-1' },
            mountsVersion: 7,
          },
        },
      });
      const store = new AgentStore(createInitialAgentSystemState());
      const controller = createActiveAppStateController(store);
      const registry = new CommandRegistry();
      registerToolboxSeamHandlers(registry, { activeApp: controller });
      registerAttachHandlerNoOps(registry);
      new AgentCoreBridge({
        karton: mock.karton,
        store,
        registry,
      }).attach();

      controller.setActiveApp('agent-a', {
        appId: 'app-1',
        src: 'blob:abc',
        pluginId: 'plugin-x',
        height: 120,
      });

      const entry = mock.getState().toolbox['agent-a']!;
      expect(entry.workspace).toEqual({ mounts: ['w:/workspaces/a'] });
      expect(entry.pendingFileDiffs).toEqual([{ id: 'diff-1' }]);
      expect(entry.editSummary).toEqual([{ id: 'edit-1' }]);
      expect(entry.pendingUserQuestion).toEqual({ id: 'q-1' });
      expect(entry.mountsVersion).toBe(7);
      expect(entry.activeApp).toEqual({
        appId: 'app-1',
        src: 'blob:abc',
        pluginId: 'plugin-x',
        height: 120,
      });
    });

    it('does not call karton.setState when migrated fields are unchanged', () => {
      const { store, controller, setState } = createMirrorHarness();

      // Seed an active app once via the controller.
      controller.setActiveApp('agent-a', {
        appId: 'app-1',
        pluginId: 'p',
        src: 'blob:1',
        height: 100,
      });
      const setStateCallsAfterSeed = setState.mock.calls.length;

      // Now touch an unrelated (non-migrated) toolbox field directly on
      // the store. The mirror should notice that none of the migrated
      // fields changed and skip the Karton write entirely.
      store.update((draft) => {
        const entry = draft.toolbox['agent-a']!;
        entry.pendingUserQuestion = {
          id: 'q-new',
        } as unknown as typeof entry.pendingUserQuestion;
      });

      expect(setState.mock.calls.length).toBe(setStateCallsAfterSeed);
    });

    it('mirrors across multiple agents independently on a single emission', () => {
      const { controller, getKartonState } = createMirrorHarness();

      controller.setActiveApp('agent-a', {
        appId: 'app-a',
        src: 'blob:a',
        pluginId: 'p',
        height: 100,
      });
      controller.setPendingAppMessage('agent-b', {
        appId: 'app-b',
        pluginId: 'p',
        data: { n: 1 },
      });

      const mirroredA = getKartonState().toolbox['agent-a']?.activeApp as
        | { appId: string }
        | null
        | undefined;
      const mirroredB = getKartonState().toolbox['agent-b']
        ?.pendingAppMessage as { appId: string } | null | undefined;
      expect(mirroredA?.appId).toBe('app-a');
      expect(mirroredB?.appId).toBe('app-b');
    });
  });
});

/**
 * Phase 3a mirror coverage: `pendingFileDiffs` and `editSummary` ownership
 * moved into `AgentStore`, and the bridge projects both slices back into
 * Karton per-agent with reference-identity dedup.
 */
describe('AgentCoreBridge (Phase 3a file-diffs mirror)', () => {
  function makeDiff(id: string, path = `/w/${id}.ts`): FileDiff {
    return {
      isExternal: false,
      fileId: id,
      path,
      baseline: '',
      current: 'x',
      baselineOid: null,
      currentOid: 'oid',
      lineChanges: [],
      hunks: [],
    };
  }

  /**
   * Phase 5 migrated ownership of the file-diff slices to the package-side
   * `DiffHistoryService`, which writes the store directly through a
   * transactional `store.update(...)`. The mirror coverage below
   * exercises that same write path — a tiny local helper that mirrors
   * how `DiffHistoryService` mutates `pendingFileDiffs`/`editSummary`.
   */
  function setFileDiffs(
    store: AgentStore,
    agentInstanceId: string,
    value: { pendingFileDiffs: FileDiff[]; editSummary: FileDiff[] },
  ): void {
    store.update((draft) => {
      const entry = ensureToolboxEntry(
        draft as AgentSystemState,
        agentInstanceId,
      );
      entry.pendingFileDiffs = value.pendingFileDiffs;
      entry.editSummary = value.editSummary;
    });
  }

  function createFileDiffsMirrorHarness(initialState?: MockKartonState) {
    const mock = createKartonMock(initialState);
    const store = new AgentStore(createInitialAgentSystemState());
    const activeApp = createActiveAppStateController(store);
    const registry = new CommandRegistry();
    registerToolboxSeamHandlers(registry, { activeApp });
    registerAttachHandlerNoOps(registry);

    const bridge = new AgentCoreBridge({
      karton: mock.karton,
      store,
      registry,
    });
    bridge.attach();

    return {
      store,
      activeApp,
      setState: mock.setState,
      getKartonState: mock.getState,
      bridge,
    };
  }

  it('seeds Karton toolbox entry on first write and mirrors both arrays', () => {
    const { store, getKartonState } = createFileDiffsMirrorHarness();

    const d1 = makeDiff('d1');
    const s1 = makeDiff('s1');
    setFileDiffs(store, 'a1', {
      pendingFileDiffs: [d1],
      editSummary: [s1],
    });

    const entry = getKartonState().toolbox.a1;
    expect(entry).toBeDefined();
    // Karton scaffolding defaults are present.
    expect(entry!.workspace).toEqual({ mounts: [] });
    expect(entry!.pendingUserQuestion).toBeNull();
    // Mirrored slices.
    expect(entry!.pendingFileDiffs).toEqual([d1]);
    expect(entry!.editSummary).toEqual([s1]);
  });

  it('skips karton.setState when both arrays keep the same reference', () => {
    const { store, setState } = createFileDiffsMirrorHarness();

    const pending = [makeDiff('d1')];
    const summary = [makeDiff('s1')];
    setFileDiffs(store, 'a1', {
      pendingFileDiffs: pending,
      editSummary: summary,
    });
    const callsAfterFirst = setState.mock.calls.length;

    // Same references — fast-path replay.
    setFileDiffs(store, 'a1', {
      pendingFileDiffs: pending,
      editSummary: summary,
    });

    expect(setState.mock.calls.length).toBe(callsAfterFirst);
  });

  it('mirrors on new array reference even when content is equivalent', () => {
    const { store, setState, getKartonState } = createFileDiffsMirrorHarness();

    setFileDiffs(store, 'a1', {
      pendingFileDiffs: [makeDiff('d1')],
      editSummary: [makeDiff('s1')],
    });
    const callsAfterFirst = setState.mock.calls.length;

    // Fresh reference; identity-based diff must trigger a mirror write.
    setFileDiffs(store, 'a1', {
      pendingFileDiffs: [makeDiff('d1')],
      editSummary: [makeDiff('s1')],
    });

    expect(setState.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    expect(
      (getKartonState().toolbox.a1!.pendingFileDiffs as FileDiff[]).length,
    ).toBe(1);
  });

  it('mirrors a clear (empty arrays) through to Karton', () => {
    const { store, getKartonState } = createFileDiffsMirrorHarness();

    setFileDiffs(store, 'a1', {
      pendingFileDiffs: [makeDiff('d1')],
      editSummary: [makeDiff('s1')],
    });
    setFileDiffs(store, 'a1', {
      pendingFileDiffs: [],
      editSummary: [],
    });

    const entry = getKartonState().toolbox.a1!;
    expect(entry.pendingFileDiffs).toEqual([]);
    expect(entry.editSummary).toEqual([]);
  });

  it('does not touch file-diff fields when only activeApp changes', () => {
    const { store, activeApp, setState, getKartonState } =
      createFileDiffsMirrorHarness();

    const pending = [makeDiff('d1')];
    const summary = [makeDiff('s1')];
    setFileDiffs(store, 'a1', {
      pendingFileDiffs: pending,
      editSummary: summary,
    });
    const callsAfterSeed = setState.mock.calls.length;

    activeApp.setActiveApp('a1', {
      appId: 'app-1',
      pluginId: 'p',
      src: 'blob:1',
      height: 100,
    });

    // A Karton write happened for `activeApp`, but the arrays on the
    // Karton entry must still be the exact references we seeded — the
    // mirror must not have replayed them.
    expect(setState.mock.calls.length).toBeGreaterThan(callsAfterSeed);
    const entry = getKartonState().toolbox.a1!;
    expect(entry.pendingFileDiffs).toBe(pending);
    expect(entry.editSummary).toBe(summary);
  });

  it('preserves non-migrated Karton toolbox fields across file-diff mirror writes', () => {
    const { store, getKartonState } = createFileDiffsMirrorHarness({
      toolbox: {
        a1: {
          workspace: { mounts: ['w:/mount/a'] },
          pendingFileDiffs: [],
          editSummary: [],
          pendingUserQuestion: { id: 'q-1' },
          mountsVersion: 9,
        },
      },
    });

    setFileDiffs(store, 'a1', {
      pendingFileDiffs: [makeDiff('d1')],
      editSummary: [makeDiff('s1')],
    });

    const entry = getKartonState().toolbox.a1!;
    expect(entry.workspace).toEqual({ mounts: ['w:/mount/a'] });
    expect(entry.pendingUserQuestion).toEqual({ id: 'q-1' });
    expect(entry.mountsVersion).toBe(9);
    expect(entry.pendingFileDiffs).toHaveLength(1);
    expect(entry.editSummary).toHaveLength(1);
  });
});

/**
 * Phase 3b mirror coverage: `workspace.mounts` ownership moved into
 * `AgentStore`, and the bridge projects the slice back into Karton
 * per-agent with reference-identity dedup.
 */
describe('AgentCoreBridge (Phase 3b workspace mounts mirror)', () => {
  function makeMount(overrides: Partial<MountEntry> = {}): MountEntry {
    return {
      prefix: 'w1',
      path: '/repos/alpha',
      git: null,
      skills: [],
      workspaceMdContent: null,
      agentsMdContent: null,
      ...overrides,
    };
  }

  function createMountsMirrorHarness(initialState?: MockKartonState) {
    const mock = createKartonMock(initialState);
    const store = new AgentStore(createInitialAgentSystemState());
    const activeApp = createActiveAppStateController(store);
    const mounts = {
      setMounts: (agentInstanceId: string, entries: MountEntry[]) =>
        setAgentMounts(store, agentInstanceId, entries),
    };
    const registry = new CommandRegistry();
    registerToolboxSeamHandlers(registry, { activeApp });
    registerAttachHandlerNoOps(registry);

    const bridge = new AgentCoreBridge({
      karton: mock.karton,
      store,
      registry,
    });
    bridge.attach();

    return {
      store,
      activeApp,
      mounts,
      setState: mock.setState,
      getKartonState: mock.getState,
      bridge,
    };
  }

  it('seeds Karton toolbox entry on first write and mirrors the mounts array', () => {
    const { mounts, getKartonState } = createMountsMirrorHarness();

    const m1 = makeMount({ prefix: 'w1' });
    mounts.setMounts('a1', [m1]);

    const entry = getKartonState().toolbox.a1;
    expect(entry).toBeDefined();
    // Karton scaffolding defaults are present.
    expect(entry!.pendingFileDiffs).toEqual([]);
    expect(entry!.editSummary).toEqual([]);
    expect(entry!.pendingUserQuestion).toBeNull();
    // Mirrored mounts slice.
    expect(entry!.workspace).toEqual({ mounts: [m1] });
  });

  it('skips karton.setState when the mounts array keeps the same reference', () => {
    const { mounts, setState } = createMountsMirrorHarness();

    const arr = [makeMount({ prefix: 'w1' })];
    mounts.setMounts('a1', arr);
    const callsAfterFirst = setState.mock.calls.length;

    // Same reference — fast-path replay must not trigger a mirror write.
    mounts.setMounts('a1', arr);

    expect(setState.mock.calls.length).toBe(callsAfterFirst);
  });

  it('mirrors on new array reference even when content is equivalent', () => {
    const { mounts, setState, getKartonState } = createMountsMirrorHarness();

    mounts.setMounts('a1', [makeMount({ prefix: 'w1' })]);
    const callsAfterFirst = setState.mock.calls.length;

    // Fresh reference; identity-based diff must trigger a mirror write.
    mounts.setMounts('a1', [makeMount({ prefix: 'w1' })]);

    expect(setState.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    expect(
      (getKartonState().toolbox.a1!.workspace as { mounts: MountEntry[] })
        .mounts,
    ).toHaveLength(1);
  });

  it('mirrors per-entry field updates when the service allocates a fresh entry object', () => {
    const { mounts, getKartonState } = createMountsMirrorHarness();

    const initial = makeMount({ prefix: 'w1', workspaceMdContent: null });
    mounts.setMounts('a1', [initial]);

    const updated = { ...initial, workspaceMdContent: 'new content' };
    mounts.setMounts('a1', [updated]);

    const mirrored = getKartonState().toolbox.a1!.workspace as {
      mounts: MountEntry[];
    };
    expect(mirrored.mounts).toHaveLength(1);
    expect(mirrored.mounts[0]!.workspaceMdContent).toBe('new content');
  });

  it('mirrors a clear (empty mounts array) through to Karton', () => {
    const { mounts, getKartonState } = createMountsMirrorHarness();

    mounts.setMounts('a1', [makeMount({ prefix: 'w1' })]);
    mounts.setMounts('a1', []);

    const entry = getKartonState().toolbox.a1!;
    expect(entry.workspace).toEqual({ mounts: [] });
  });

  it('does not touch mounts when only activeApp changes', () => {
    const { activeApp, mounts, setState, getKartonState } =
      createMountsMirrorHarness();

    const seeded = [makeMount({ prefix: 'w1' })];
    mounts.setMounts('a1', seeded);
    const callsAfterSeed = setState.mock.calls.length;

    activeApp.setActiveApp('a1', {
      appId: 'app-1',
      pluginId: 'p',
      src: 'blob:1',
      height: 100,
    });

    // A Karton write happened for `activeApp`, but the mounts on the
    // Karton entry must remain the exact `workspace` object shape we
    // seeded — the mirror must not have replayed the mounts slice.
    expect(setState.mock.calls.length).toBeGreaterThan(callsAfterSeed);
    const entry = getKartonState().toolbox.a1!;
    expect((entry.workspace as { mounts: MountEntry[] }).mounts).toBe(seeded);
  });

  it('preserves non-migrated Karton toolbox fields across mounts mirror writes', () => {
    const { mounts, getKartonState } = createMountsMirrorHarness({
      toolbox: {
        a1: {
          workspace: { mounts: [] },
          pendingFileDiffs: [],
          editSummary: [],
          pendingUserQuestion: { id: 'q-1' },
          mountsVersion: 11,
        },
      },
    });

    mounts.setMounts('a1', [makeMount({ prefix: 'w1' })]);

    const entry = getKartonState().toolbox.a1!;
    expect(entry.pendingUserQuestion).toEqual({ id: 'q-1' });
    expect(entry.mountsVersion).toBe(11);
    expect((entry.workspace as { mounts: MountEntry[] }).mounts).toHaveLength(
      1,
    );
  });
});

/**
 * Phase 6 mirror coverage: `agents.instances[agentId]` ownership moved
 * into `AgentStore`, and the bridge projects whole envelopes back into
 * Karton with reference-identity dedup. Deletions propagate as Karton
 * `delete`.
 */
describe('AgentCoreBridge (Phase 6 agent instances mirror)', () => {
  function makeEnvelope(
    overrides: Partial<HostAgentInstanceEnvelope> = {},
    stateOverrides: Partial<AgentState> = {},
  ): HostAgentInstanceEnvelope {
    const baseState: AgentState = {
      title: '',
      titleLockedByUser: false,
      isWorking: false,
      history: [],
      queuedMessages: [],
      activeModelId: 'claude-sonnet-4.6',
      toolApprovalMode: 'smart',
      pendingApprovals: {},
      inputState: '',
      usedTokens: 0,
      ...stateOverrides,
    };
    return {
      type: AgentTypes.CHAT,
      canSelectModel: true,
      requiredModelCapabilities: {
        inputModalities: {
          text: true,
          audio: false,
          image: false,
          video: false,
          file: false,
        },
        outputModalities: {
          text: true,
          audio: false,
          image: false,
          video: false,
          file: false,
        },
        toolCalling: false,
      },
      allowUserInput: true,
      parentAgentInstanceId: null,
      state: baseState,
      ...overrides,
    };
  }

  function createAgentInstancesMirrorHarness(initialState?: MockKartonState) {
    const mock = createKartonMock(initialState);
    const store = new AgentStore(createInitialAgentSystemState());
    const activeApp = createActiveAppStateController(store);
    const registry = new CommandRegistry();
    registerToolboxSeamHandlers(registry, { activeApp });
    registerAttachHandlerNoOps(registry);

    const bridge = new AgentCoreBridge({
      karton: mock.karton,
      store,
      registry,
    });
    bridge.attach();

    const upsert = (id: string, envelope: HostAgentInstanceEnvelope) =>
      upsertAgentInstance(
        store,
        id,
        envelope as unknown as AgentInstanceEnvelope,
      );
    const remove = (id: string) => deleteAgentInstance(store, id);

    return {
      store,
      activeApp,
      // Direct shims onto the core state-mutation utilities so the
      // mirror tests exercise the same write paths the production
      // runloop uses.
      agentInstances: { upsertInstance: upsert, deleteInstance: remove },
      setState: mock.setState,
      getKartonState: mock.getState,
      bridge,
    };
  }

  it('mirrors a new agent envelope into Karton on upsert', () => {
    const { agentInstances, getKartonState } =
      createAgentInstancesMirrorHarness();

    agentInstances.upsertInstance(
      'a1',
      makeEnvelope({}, { title: 'session-1' }),
    );

    const mirrored = getKartonState().agents?.instances.a1;
    expect(mirrored).toBeDefined();
    expect(mirrored!.type).toBe(AgentTypes.CHAT);
    expect((mirrored!.state as AgentState).title).toBe('session-1');
    expect((mirrored!.state as AgentState).toolApprovalMode).toBe('smart');
  });

  it('does not re-upsert agents.instances when the envelope reference is unchanged', () => {
    const { agentInstances, activeApp, getKartonState } =
      createAgentInstancesMirrorHarness();

    agentInstances.upsertInstance('a1', makeEnvelope());
    const envelopeBefore = getKartonState().agents?.instances.a1;
    expect(envelopeBefore).toBeDefined();

    // An unrelated store mutation on the same agent — setting
    // `activeApp` — triggers a Karton write for the toolbox slice but
    // must NOT touch `agents.instances[a1]`, because the envelope
    // reference is unchanged. Asserted via reference identity on the
    // mirrored envelope (the mirror only rewrites the slot when
    // `computeAgentInstanceChanges` detects a reference change).
    activeApp.setActiveApp('a1', { appId: 'app-x', src: 'blob:x' });

    const envelopeAfter = getKartonState().agents?.instances.a1;
    expect(envelopeAfter).toBe(envelopeBefore);
  });

  it('mirrors on new envelope reference allocation', () => {
    const { agentInstances, setState, getKartonState } =
      createAgentInstancesMirrorHarness();

    agentInstances.upsertInstance('a1', makeEnvelope({}, { title: 'v1' }));
    const callsAfterFirst = setState.mock.calls.length;

    agentInstances.upsertInstance('a1', makeEnvelope({}, { title: 'v2' }));

    expect(setState.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    const a1State = getKartonState().agents?.instances.a1?.state as AgentState;
    expect(a1State.title).toBe('v2');
  });

  it('projects deletions as Karton `delete` on agents.instances', () => {
    const { agentInstances, getKartonState } =
      createAgentInstancesMirrorHarness();

    agentInstances.upsertInstance('a1', makeEnvelope());
    expect(getKartonState().agents?.instances.a1).toBeDefined();

    agentInstances.deleteInstance('a1');
    expect(getKartonState().agents?.instances.a1).toBeUndefined();
  });

  it('mirrors multiple agents independently on a single emission', () => {
    const { store, agentInstances, getKartonState } =
      createAgentInstancesMirrorHarness();

    // Two `upsertInstance` calls produce two store emissions. Verify
    // both envelopes land in Karton.
    agentInstances.upsertInstance('agent-a', makeEnvelope({}, { title: 'a' }));
    agentInstances.upsertInstance('agent-b', makeEnvelope({}, { title: 'b' }));

    const agentAState = getKartonState().agents?.instances['agent-a']
      ?.state as AgentState;
    const agentBState = getKartonState().agents?.instances['agent-b']
      ?.state as AgentState;
    expect(agentAState.title).toBe('a');
    expect(agentBState.title).toBe('b');

    // Silence unused-var linter — `store` is intentionally unused in
    // this assertion but kept for symmetry with the other harness
    // call sites.
    void store;
  });

  it('upserts and deletes emitted in separate store updates land in Karton', () => {
    const { agentInstances, getKartonState } =
      createAgentInstancesMirrorHarness();

    agentInstances.upsertInstance('a1', makeEnvelope());
    agentInstances.upsertInstance('a2', makeEnvelope());
    expect(Object.keys(getKartonState().agents?.instances ?? {})).toEqual([
      'a1',
      'a2',
    ]);

    agentInstances.deleteInstance('a1');
    expect(Object.keys(getKartonState().agents?.instances ?? {})).toEqual([
      'a2',
    ]);
  });

  it('does not touch agents.instances when only toolbox fields change', () => {
    const { activeApp, agentInstances, getKartonState } =
      createAgentInstancesMirrorHarness();

    agentInstances.upsertInstance(
      'a1',
      makeEnvelope({}, { title: 'original' }),
    );
    const envelopeAfterSeed = getKartonState().agents?.instances.a1;

    activeApp.setActiveApp('a1', { appId: 'app-z', src: 'blob:z' });

    // The Karton `agents.instances[a1]` reference must be preserved —
    // the mirror writes the `activeApp` toolbox slice only.
    expect(getKartonState().agents?.instances.a1).toBe(envelopeAfterSeed);
  });

  it('co-emits with a toolbox mirror write in the same karton.setState call', () => {
    const { store, setState, getKartonState } =
      createAgentInstancesMirrorHarness();

    // Drive a single store.update that mutates both `agents.instances`
    // and `toolbox` — the bridge subscriber fires once for this
    // emission and must issue exactly one karton.setState call that
    // contains both projections.
    const callsBefore = setState.mock.calls.length;
    store.update((draft) => {
      const systemDraft = draft as AgentSystemState;
      systemDraft.agents.instances.a1 = makeEnvelope(
        {},
        { title: 'combined' },
      ) as unknown as (typeof systemDraft.agents.instances)[string];
      const entry = ensureToolboxEntry(systemDraft, 'a1');
      entry.activeApp = { appId: 'app-c', src: 'blob:c' };
    });
    const callsAfter = setState.mock.calls.length;

    // Exactly one karton.setState invocation for the combined emission.
    expect(callsAfter - callsBefore).toBe(1);
    // Both projections landed.
    const combinedState = getKartonState().agents?.instances.a1
      ?.state as AgentState;
    expect(combinedState.title).toBe('combined');
    expect(
      (getKartonState().toolbox.a1?.activeApp as { appId: string }).appId,
    ).toBe('app-c');
  });
});
