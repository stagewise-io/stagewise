import { describe, expect, it } from 'vitest';
import { AgentStore } from '../../../store/agent-store';
import type { AgentSystemState } from '../../../store/state';
import {
  AgentTypes,
  type AgentMessage,
  type AgentState,
} from '../../../types/agent';
import { recordStepError } from './lifecycle';
import { upsertAgentInstance, type AgentInstanceEnvelope } from './instances';

function emptySystemState(): AgentSystemState {
  return { agents: { instances: {} }, toolbox: {} };
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

function makeBaseState(history: AgentMessage[] = []): AgentState {
  return {
    title: '',
    isWorking: true,
    history,
    queuedMessages: [],
    activeModelId: 'model-1',
    toolApprovalMode: 'alwaysAsk',
    pendingApprovals: {},
    inputState: '',
    usedTokens: 0,
  };
}

describe('state-mutations/lifecycle.recordStepError', () => {
  it("markUnread: 'always' marks the agent unread even without assistant history", () => {
    const store = new AgentStore(emptySystemState());
    upsertAgentInstance(store, 'a1', makeEnvelope(makeBaseState([])));

    recordStepError(store, 'a1', {
      error: { message: 'boom', stack: undefined },
      markUnread: 'always',
    });

    const after = store.get().agents.instances.a1!.state;
    expect(after.isWorking).toBe(false);
    expect(after.unread).toBe(true);
    expect(after.error?.message).toBe('boom');
  });

  it("markUnread: 'mark-unread' marks the agent unread", () => {
    const store = new AgentStore(emptySystemState());
    upsertAgentInstance(store, 'a1', makeEnvelope(makeBaseState([])));

    recordStepError(store, 'a1', {
      error: undefined,
      markUnread: 'mark-unread',
    });

    const after = store.get().agents.instances.a1!.state;
    expect(after.unread).toBe(true);
  });

  it("markUnread: 'if-assistant-history' only marks unread when assistant history exists", () => {
    const store = new AgentStore(emptySystemState());
    upsertAgentInstance(store, 'a1', makeEnvelope(makeBaseState([])));

    recordStepError(store, 'a1', {
      error: undefined,
      markUnread: 'if-assistant-history',
    });
    expect(store.get().agents.instances.a1!.state.unread).toBeFalsy();

    upsertAgentInstance(
      store,
      'a1',
      makeEnvelope(
        makeBaseState([
          {
            id: 'm1',
            role: 'assistant',
            parts: [],
            metadata: { createdAt: new Date(), partsMetadata: [] },
          } as AgentMessage,
        ]),
      ),
    );

    recordStepError(store, 'a1', {
      error: undefined,
      markUnread: 'if-assistant-history',
    });
    expect(store.get().agents.instances.a1!.state.unread).toBe(true);
  });
});
