import {
  AgentStore,
  AgentTypes,
  createInitialAgentSystemState,
  upsertAgentInstance,
  type AgentInstanceEnvelope,
} from '@stagewise/agent-core';
import type { AgentState } from '@shared/karton-contracts/ui/agent';
import { describe, it, expect, vi } from 'vitest';
import {
  createHostAgentStateMutations,
  type HostAgentInstanceEnvelope,
} from './agent-instances';

/**
 * Build a fully-populated host envelope for tests. Every test starts
 * from `makeEnvelope(...)` and overrides only the fields the case
 * cares about; downstream assertions therefore compare against
 * predictable baseline values.
 */
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

function seedAgent(
  store: AgentStore,
  id: string,
  envelope: HostAgentInstanceEnvelope,
): void {
  upsertAgentInstance(store, id, envelope as unknown as AgentInstanceEnvelope);
}

describe('createHostAgentStateMutations', () => {
  describe('setUnread', () => {
    it('mutates only the target field and emits one subscriber dispatch', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const mutations = createHostAgentStateMutations(store);
      seedAgent(store, 'a1', makeEnvelope());

      const subscriber = vi.fn();
      const unsubscribe = store.subscribe(subscriber);
      mutations.setUnread('a1', true);

      expect(store.get().agents.instances.a1!.state.unread).toBe(true);
      expect(subscriber).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('accepts both true and false', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const mutations = createHostAgentStateMutations(store);
      seedAgent(store, 'a1', makeEnvelope({}, { unread: true }));

      mutations.setUnread('a1', false);
      expect(store.get().agents.instances.a1!.state.unread).toBe(false);
    });

    it('is a defensive no-op when the agent id is unknown', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const mutations = createHostAgentStateMutations(store);

      expect(() => mutations.setUnread('ghost', true)).not.toThrow();
    });
  });

  describe('recordPendingApproval', () => {
    it('writes the approval under the tool-call id and emits one dispatch', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const mutations = createHostAgentStateMutations(store);
      seedAgent(store, 'a1', makeEnvelope());

      const subscriber = vi.fn();
      const unsubscribe = store.subscribe(subscriber);
      mutations.recordPendingApproval('a1', 'tc_1', 'delete files');

      expect(
        store.get().agents.instances.a1!.state.pendingApprovals.tc_1,
      ).toEqual({ explanation: 'delete files' });
      expect(subscriber).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('coexists with prior entries without clobbering them', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const mutations = createHostAgentStateMutations(store);
      seedAgent(store, 'a1', makeEnvelope());

      mutations.recordPendingApproval('a1', 'tc_1', 'first');
      mutations.recordPendingApproval('a1', 'tc_2', 'second');

      const approvals = store.get().agents.instances.a1!.state.pendingApprovals;
      expect(approvals.tc_1).toEqual({ explanation: 'first' });
      expect(approvals.tc_2).toEqual({ explanation: 'second' });
    });

    it('is a defensive no-op when the agent id is unknown', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const mutations = createHostAgentStateMutations(store);

      expect(() =>
        mutations.recordPendingApproval('ghost', 'tc_1', 'x'),
      ).not.toThrow();
    });
  });

  describe('getInstance', () => {
    it('returns undefined for unknown agent ids', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const mutations = createHostAgentStateMutations(store);

      expect(mutations.getInstance('ghost')).toBeUndefined();
    });

    it('returns the live envelope after a write', () => {
      const store = new AgentStore(createInitialAgentSystemState());
      const mutations = createHostAgentStateMutations(store);
      seedAgent(store, 'a1', makeEnvelope({}, { title: 'hello' }));

      const fetched = mutations.getInstance('a1');
      expect(fetched).toBeDefined();
      expect(fetched!.state.title).toBe('hello');
      expect(fetched).toBe(store.get().agents.instances.a1);
    });
  });
});
