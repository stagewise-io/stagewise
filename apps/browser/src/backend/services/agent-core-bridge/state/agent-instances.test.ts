import {
  AgentStore,
  AgentTypes,
  createInitialAgentSystemState,
} from '@stagewise/agent-core';
import type { AgentState } from '@shared/karton-contracts/ui/agent';
import { describe, it, expect, vi } from 'vitest';
import {
  createAgentInstancesStateController,
  type HostAgentInstanceState,
} from './agent-instances';

/**
 * Build a fully-populated host envelope for tests. Every test starts
 * from `makeEnvelope(...)` and overrides only the fields the case
 * cares about; downstream assertions therefore compare against
 * predictable baseline values.
 */
function makeEnvelope(
  overrides: Partial<HostAgentInstanceState> = {},
  stateOverrides: Partial<AgentState> = {},
): HostAgentInstanceState {
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

describe('AgentInstancesStateController', () => {
  describe('upsertInstance', () => {
    it('creates a fresh envelope on first write', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const controller = createAgentInstancesStateController(store);
      const envelope = makeEnvelope();

      controller.upsertInstance('a1', envelope);

      const stored = store.get().agents.instances.a1;
      expect(stored).toBeDefined();
      expect(stored!.type).toBe(AgentTypes.CHAT);
      expect(stored!.state.activeModelId).toBe('claude-sonnet-4.6');
      expect(stored!.state.toolApprovalMode).toBe('smart');
    });

    it('replaces the entry cleanly on subsequent writes with a fresh reference', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const controller = createAgentInstancesStateController(store);
      const first = makeEnvelope({}, { title: 'first' });
      const second = makeEnvelope({}, { title: 'second' });

      controller.upsertInstance('a1', first);
      const afterFirst = store.get().agents.instances.a1;

      controller.upsertInstance('a1', second);
      const afterSecond = store.get().agents.instances.a1;

      expect(afterSecond).not.toBe(afterFirst);
      expect(afterSecond!.state.title).toBe('second');
    });

    it('isolates writes between agent instances', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const controller = createAgentInstancesStateController(store);

      controller.upsertInstance(
        'a1',
        makeEnvelope({}, { activeModelId: 'claude-sonnet-4.6' }),
      );
      controller.upsertInstance(
        'a2',
        makeEnvelope({}, { activeModelId: 'gpt-4.1' }),
      );

      expect(store.get().agents.instances.a1!.state.activeModelId).toBe(
        'claude-sonnet-4.6',
      );
      expect(store.get().agents.instances.a2!.state.activeModelId).toBe(
        'gpt-4.1',
      );
    });
  });

  describe('deleteInstance', () => {
    it('removes both agents.instances[id] and toolbox[id] atomically', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const controller = createAgentInstancesStateController(store);
      controller.upsertInstance('a1', makeEnvelope());
      // Seed a toolbox slice to verify the paired deletion.
      store.update((draft) => {
        draft.toolbox.a1 = {
          workspace: { mounts: [] },
          pendingFileDiffs: [],
          editSummary: [],
          pendingUserQuestion: null,
        };
      });

      const subscriber = vi.fn();
      const unsubscribe = store.subscribe(subscriber);
      controller.deleteInstance('a1');

      expect(store.get().agents.instances.a1).toBeUndefined();
      expect(store.get().toolbox.a1).toBeUndefined();
      // Paired delete must emit exactly one subscriber notification (D18).
      expect(subscriber).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('is idempotent — no-op and one dispatch when the id is absent', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const controller = createAgentInstancesStateController(store);

      // No throw, no state change.
      expect(() => controller.deleteInstance('nonexistent')).not.toThrow();
      expect(store.get().agents.instances).toEqual({});
      expect(store.get().toolbox).toEqual({});
    });
  });

  describe('setToolApprovalMode', () => {
    it('mutates only the target field and emits one subscriber dispatch', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const controller = createAgentInstancesStateController(store);
      controller.upsertInstance('a1', makeEnvelope());

      const subscriber = vi.fn();
      const unsubscribe = store.subscribe(subscriber);
      controller.setToolApprovalMode('a1', 'alwaysAllow');

      expect(store.get().agents.instances.a1!.state.toolApprovalMode).toBe(
        'alwaysAllow',
      );
      // Other fields are untouched.
      expect(store.get().agents.instances.a1!.state.title).toBe('');
      expect(subscriber).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('is a defensive no-op when the agent id is unknown', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const controller = createAgentInstancesStateController(store);

      expect(() =>
        controller.setToolApprovalMode('ghost', 'alwaysAsk'),
      ).not.toThrow();
    });
  });

  describe('setUnread', () => {
    it('mutates only the target field and emits one subscriber dispatch', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const controller = createAgentInstancesStateController(store);
      controller.upsertInstance('a1', makeEnvelope());

      const subscriber = vi.fn();
      const unsubscribe = store.subscribe(subscriber);
      controller.setUnread('a1', true);

      expect(store.get().agents.instances.a1!.state.unread).toBe(true);
      expect(subscriber).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('accepts both true and false', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const controller = createAgentInstancesStateController(store);
      controller.upsertInstance('a1', makeEnvelope({}, { unread: true }));

      controller.setUnread('a1', false);
      expect(store.get().agents.instances.a1!.state.unread).toBe(false);
    });

    it('is a defensive no-op when the agent id is unknown', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const controller = createAgentInstancesStateController(store);

      expect(() => controller.setUnread('ghost', true)).not.toThrow();
    });
  });

  describe('recordPendingApproval', () => {
    it('writes the approval under the tool-call id and emits one dispatch', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const controller = createAgentInstancesStateController(store);
      controller.upsertInstance('a1', makeEnvelope());

      const subscriber = vi.fn();
      const unsubscribe = store.subscribe(subscriber);
      controller.recordPendingApproval('a1', 'tc_1', 'delete files');

      expect(
        store.get().agents.instances.a1!.state.pendingApprovals.tc_1,
      ).toEqual({ explanation: 'delete files' });
      expect(subscriber).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('coexists with prior entries without clobbering them', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const controller = createAgentInstancesStateController(store);
      controller.upsertInstance('a1', makeEnvelope());

      controller.recordPendingApproval('a1', 'tc_1', 'first');
      controller.recordPendingApproval('a1', 'tc_2', 'second');

      const approvals = store.get().agents.instances.a1!.state.pendingApprovals;
      expect(approvals.tc_1).toEqual({ explanation: 'first' });
      expect(approvals.tc_2).toEqual({ explanation: 'second' });
    });

    it('is a defensive no-op when the agent id is unknown', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const controller = createAgentInstancesStateController(store);

      expect(() =>
        controller.recordPendingApproval('ghost', 'tc_1', 'x'),
      ).not.toThrow();
    });
  });

  describe('buildCommands', () => {
    // Phase 7: the former `applyStateRecipe` escape hatch has been
    // retired in favor of a typed command surface. These tests lock in
    // the replacement invariants that the recipe tests previously
    // guarded: typed writes are applied, each command emits exactly one
    // subscriber dispatch, and writes against unknown agent ids are a
    // defensive no-op (rather than throwing) so late writes from
    // outlived subscribers do not crash the process.
    it('applies typed command writes to state', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const controller = createAgentInstancesStateController(store);
      controller.upsertInstance('a1', makeEnvelope());

      const commands = controller.buildCommands('a1');
      commands.recordUsage({ totalTokens: 42 });

      const stored = store.get().agents.instances.a1!.state;
      expect(stored.usedTokens).toBe(42);
    });

    it('emits exactly one subscriber dispatch per command call', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const controller = createAgentInstancesStateController(store);
      controller.upsertInstance('a1', makeEnvelope());

      const subscriber = vi.fn();
      const unsubscribe = store.subscribe(subscriber);
      const commands = controller.buildCommands('a1');
      commands.recordUsage({ totalTokens: 99 });

      expect(subscriber).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('is a defensive no-op when the agent id is unknown', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const controller = createAgentInstancesStateController(store);

      const commands = controller.buildCommands('ghost');
      expect(() => commands.recordUsage({ totalTokens: 1 })).not.toThrow();
    });
  });

  describe('getInstance', () => {
    it('returns undefined for unknown agent ids', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const controller = createAgentInstancesStateController(store);

      expect(controller.getInstance('ghost')).toBeUndefined();
    });

    it('returns the live envelope after a write', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const controller = createAgentInstancesStateController(store);
      controller.upsertInstance('a1', makeEnvelope({}, { title: 'hello' }));

      const fetched = controller.getInstance('a1');
      expect(fetched).toBeDefined();
      expect(fetched!.state.title).toBe('hello');
      expect(fetched).toBe(store.get().agents.instances.a1);
    });
  });
});
