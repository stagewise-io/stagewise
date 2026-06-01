import { describe, expect, it } from 'vitest';
import { AgentStore } from '../../../store/agent-store';
import type { AgentSystemState } from '../../../store/state';
import {
  AgentTypes,
  type AgentMessage,
  type AgentState,
} from '../../../types/agent';
import { bindStateMutations } from './bind';
import { upsertAgentInstance, type AgentInstanceEnvelope } from './instances';

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

describe('state-mutations/bind', () => {
  it('applies setTitle via the bound bundle', () => {
    const store = new AgentStore(emptySystemState());
    upsertAgentInstance(store, 'a1', makeEnvelope(minimalState()));

    bindStateMutations(store, 'a1').setTitle({ title: 'renamed' });

    expect(store.get().agents.instances.a1?.state.title).toBe('renamed');
  });

  it('attachEnvState writes envState entries onto the target user message', () => {
    const store = new AgentStore(emptySystemState());
    const userMsg: AgentMessage = {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'hi', state: 'done' }],
      metadata: {
        createdAt: new Date(),
        partsMetadata: [],
      },
    };
    upsertAgentInstance(
      store,
      'a1',
      makeEnvelope({
        ...minimalState(),
        history: [userMsg],
      }),
    );

    bindStateMutations(store, 'a1').attachEnvState({
      entries: new Map([
        [
          'workspace',
          {
            schemaVersion: 1,
            state: { mounts: [] },
            renderedState: '<ws/>',
            renderedStateChange: '<ws-delta/>',
          },
        ],
      ]),
    });

    const hist = store.get().agents.instances.a1!.state.history[0]!;
    expect(hist.metadata?.envState).toEqual({
      workspace: {
        schemaVersion: 1,
        state: { mounts: [] },
        renderedState: '<ws/>',
        renderedStateChange: '<ws-delta/>',
      },
    });
  });

  it('attachEnvState merges with prior envState rather than replacing it', () => {
    const store = new AgentStore(emptySystemState());
    const userMsg: AgentMessage = {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'hi', state: 'done' }],
      metadata: {
        createdAt: new Date(),
        partsMetadata: [],
        envState: {
          workspace: {
            schemaVersion: 1,
            state: { mounts: [] },
            renderedState: 'ws-old',
            renderedStateChange: 'ws-old',
          },
        },
      },
    };
    upsertAgentInstance(
      store,
      'a1',
      makeEnvelope({
        ...minimalState(),
        history: [userMsg],
      }),
    );

    bindStateMutations(store, 'a1').attachEnvState({
      entries: new Map([
        [
          'browser',
          {
            schemaVersion: 1,
            state: { tabs: [] },
            renderedState: 'br',
            renderedStateChange: 'br',
          },
        ],
      ]),
    });

    const hist = store.get().agents.instances.a1!.state.history[0]!;
    expect(Object.keys(hist.metadata!.envState!).sort()).toEqual([
      'browser',
      'workspace',
    ]);
  });

  it('attachEnvState with empty entries is a no-op', () => {
    const store = new AgentStore(emptySystemState());
    const userMsg: AgentMessage = {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'hi', state: 'done' }],
      metadata: { createdAt: new Date(), partsMetadata: [] },
    };
    upsertAgentInstance(
      store,
      'a1',
      makeEnvelope({ ...minimalState(), history: [userMsg] }),
    );

    bindStateMutations(store, 'a1').attachEnvState({ entries: new Map() });

    const hist = store.get().agents.instances.a1!.state.history[0]!;
    expect(hist.metadata?.envState).toBeUndefined();
  });
});
