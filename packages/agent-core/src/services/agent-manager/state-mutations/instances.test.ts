import { describe, expect, it } from 'vitest';
import { AgentStore } from '../../../store/agent-store';
import type { AgentSystemState } from '../../../store/state';
import { AgentTypes, type AgentState } from '../../../types/agent';
import {
  deleteAgentInstance,
  getAgentInstance,
  setToolApprovalMode,
  upsertAgentInstance,
  type AgentInstanceEnvelope,
} from './instances';

function emptySystemState(): AgentSystemState {
  return { agents: { instances: {} }, toolbox: {} };
}

function minimalState(): AgentState {
  return {
    title: 'seed',
    isWorking: false,
    history: [],
    queuedMessages: [],
    activeModelId: 'model-1',
    toolApprovalMode: 'alwaysAsk',
    pendingApprovals: {},
    inputState: '',
    usedTokens: 0,
  };
}

function makeEnvelope(state: AgentState): AgentInstanceEnvelope {
  return {
    type: AgentTypes.CHAT,
    canSelectModel: true,
    requiredModelCapabilities: { foo: true } as unknown,
    allowUserInput: true,
    parentAgentInstanceId: null,
    state,
  };
}

describe('state-mutations/instances', () => {
  it('round-trips upsertAgentInstance and getAgentInstance', () => {
    const store = new AgentStore(emptySystemState());
    const envelope = makeEnvelope(minimalState());

    upsertAgentInstance(store, 'a1', envelope);
    const read = getAgentInstance(store, 'a1');

    expect(read?.type).toBe(AgentTypes.CHAT);
    expect(read?.requiredModelCapabilities).toEqual({ foo: true });
    expect(read?.state.title).toBe('seed');
    expect(store.get().agents.instances.a1?.state.title).toBe('seed');
  });

  it('deleteAgentInstance removes both agents.instances[id] and toolbox[id]', () => {
    const store = new AgentStore(emptySystemState());
    upsertAgentInstance(store, 'a1', makeEnvelope(minimalState()));
    store.update((d) => {
      d.toolbox.a1 = {
        workspace: { mounts: [] },
        pendingFileDiffs: [],
        editSummary: [],
        pendingUserQuestion: null,
      };
    });

    deleteAgentInstance(store, 'a1');

    expect(store.get().agents.instances.a1).toBeUndefined();
    expect(store.get().toolbox.a1).toBeUndefined();
  });

  it('setToolApprovalMode updates state', () => {
    const store = new AgentStore(emptySystemState());
    upsertAgentInstance(store, 'a1', makeEnvelope(minimalState()));

    setToolApprovalMode(store, 'a1', 'smart');

    expect(getAgentInstance(store, 'a1')?.state.toolApprovalMode).toBe('smart');
  });

  it('setToolApprovalMode is a defensive no-op for unknown ids', () => {
    const store = new AgentStore(emptySystemState());
    expect(() =>
      setToolApprovalMode(store, 'ghost', 'alwaysAsk'),
    ).not.toThrow();
  });
});
