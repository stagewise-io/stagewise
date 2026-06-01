import { describe, expect, it, vi } from 'vitest';
import { AgentStore } from '../../../store/agent-store';
import type { AgentSystemState } from '../../../store/state';
import {
  AgentTypes,
  type AgentMessage,
  type AgentState,
  type AgentToolUIPart,
} from '../../../types/agent';
import { upsertAgentInstance, type AgentInstanceEnvelope } from './instances';
import {
  mergeUIMessageStream,
  setAssistantOwnedReasoningDetails,
  storeCompressedHistory,
} from './streaming';

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

function baseState(history: AgentMessage[] = []): AgentState {
  return {
    title: '',
    isWorking: false,
    history,
    queuedMessages: [],
    activeModelId: 'model-1',
    toolApprovalMode: 'alwaysAsk',
    pendingApprovals: {},
    inputState: '',
    usedTokens: 0,
  };
}

describe('state-mutations/streaming', () => {
  it('mergeUIMessageStream pushes a new assistant message when not yet in history', () => {
    const store = new AgentStore(emptySystemState());
    upsertAgentInstance(store, 'a1', makeEnvelope(baseState([])));

    const incoming: AgentMessage = {
      id: 'asst-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'hello', state: 'streaming' }],
      metadata: { createdAt: new Date(), partsMetadata: [] },
    };

    mergeUIMessageStream(store, 'a1', { uiMessage: incoming });

    const merged = store.get().agents.instances.a1!.state.history[0]!;
    expect(merged.id).toBe('asst-1');
    expect(merged.parts[0]).toMatchObject({ type: 'text', text: 'hello' });
    expect(merged.metadata!.partsMetadata[0]?.startedAt).toBeInstanceOf(Date);
  });

  it('mergeUIMessageStream stamps endedAt when a streaming part reaches `done`', () => {
    const store = new AgentStore(emptySystemState());
    const initial: AgentMessage = {
      id: 'asst-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'hi', state: 'streaming' }],
      metadata: {
        createdAt: new Date(),
        partsMetadata: [{ startedAt: new Date(), endedAt: undefined }],
      },
    };
    upsertAgentInstance(store, 'a1', makeEnvelope(baseState([initial])));

    const completed: AgentMessage = {
      id: 'asst-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'hi', state: 'done' }],
      metadata: { createdAt: new Date(), partsMetadata: [] },
    };
    mergeUIMessageStream(store, 'a1', { uiMessage: completed });

    const merged = store.get().agents.instances.a1!.state.history[0]!;
    expect(merged.metadata!.partsMetadata[0]?.endedAt).toBeInstanceOf(Date);
  });

  it('mergeUIMessageStream fires onApprovalRequested when a tool part enters approval-requested', () => {
    const store = new AgentStore(emptySystemState());
    upsertAgentInstance(store, 'a1', makeEnvelope(baseState([])));

    const onApprovalRequested = vi.fn();
    const incoming: AgentMessage = {
      id: 'asst-1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-runShell',
          toolCallId: 'tc_1',
          state: 'approval-requested',
          input: {},
          approval: { id: 'ap_1', explanation: 'because' },
        } as unknown as AgentToolUIPart,
      ],
      metadata: { createdAt: new Date(), partsMetadata: [] },
    };

    mergeUIMessageStream(store, 'a1', {
      uiMessage: incoming,
      onApprovalRequested,
    });

    expect(onApprovalRequested).toHaveBeenCalledWith(
      expect.objectContaining({ approvalId: 'ap_1' }),
    );
  });

  it('storeCompressedHistory reports `missing` for absent boundaries', () => {
    const store = new AgentStore(emptySystemState());
    upsertAgentInstance(store, 'a1', makeEnvelope(baseState([])));

    const result = storeCompressedHistory(store, 'a1', {
      boundaryMessageId: 'never-existed',
      compressedHistory: 'blob',
    });

    expect(result).toBe('missing');
  });

  it('storeCompressedHistory writes the blob and returns `written` when boundary is present', () => {
    const store = new AgentStore(emptySystemState());
    const boundary: AgentMessage = {
      id: 'b-1',
      role: 'assistant',
      parts: [{ type: 'text', text: '', state: 'done' }],
      metadata: { createdAt: new Date(), partsMetadata: [{}] },
    };
    upsertAgentInstance(store, 'a1', makeEnvelope(baseState([boundary])));

    const result = storeCompressedHistory(store, 'a1', {
      boundaryMessageId: 'b-1',
      compressedHistory: 'blob',
    });

    expect(result).toBe('written');
    const after = store.get().agents.instances.a1!.state.history[0]!;
    expect(after.metadata?.compressedHistory).toBe('blob');
  });

  it('setAssistantOwnedReasoningDetails replaces the array on the target message', () => {
    const store = new AgentStore(emptySystemState());
    const target: AgentMessage = {
      id: 'asst-1',
      role: 'assistant',
      parts: [{ type: 'text', text: '', state: 'done' }],
      metadata: { createdAt: new Date(), partsMetadata: [{}] },
    };
    upsertAgentInstance(store, 'a1', makeEnvelope(baseState([target])));

    setAssistantOwnedReasoningDetails(store, 'a1', {
      targetIdx: 0,
      ownedReasoningDetails: [
        { type: 'reasoning.encrypted', signedReasoning: 'x' },
      ] as never,
    });

    const after = store.get().agents.instances.a1!.state.history[0]!;
    expect(after.metadata?.ownedReasoningDetails).toEqual([
      { type: 'reasoning.encrypted', signedReasoning: 'x' },
    ]);
  });
});
