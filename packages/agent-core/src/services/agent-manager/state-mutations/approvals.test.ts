import { describe, expect, it } from 'vitest';
import { AgentStore } from '../../../store/agent-store';
import type { AgentSystemState } from '../../../store/state';
import {
  AgentTypes,
  type AgentMessage,
  type AgentState,
  type AgentToolUIPart,
} from '../../../types/agent';
import {
  denyAllNonTerminalToolPartsInHistory,
  resolveApproval,
  terminateNonTerminalToolPartsInLastAssistant,
} from './approvals';
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

function makeBaseState(history: AgentMessage[]): AgentState {
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

function makeApprovalRequestedPart(args: {
  toolName: string;
  toolCallId: string;
  approvalId: string;
}): AgentToolUIPart {
  return {
    type: `tool-${args.toolName}`,
    toolCallId: args.toolCallId,
    state: 'approval-requested',
    input: { foo: 'bar' },
    approval: { id: args.approvalId, explanation: 'why' },
  } as unknown as AgentToolUIPart;
}

describe('state-mutations/approvals', () => {
  it('denyAllNonTerminalToolPartsInHistory flips approval-requested to output-denied', () => {
    const store = new AgentStore(emptySystemState());
    const history: AgentMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          makeApprovalRequestedPart({
            toolName: 'doThing',
            toolCallId: 'tc_1',
            approvalId: 'ap_1',
          }),
        ],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      },
    ];
    upsertAgentInstance(
      store,
      'a1',
      makeEnvelope({
        ...makeBaseState(history),
        pendingApprovals: { tc_1: { explanation: 'why' } },
      }),
    );

    denyAllNonTerminalToolPartsInHistory(store, 'a1', {
      approvalDenyReason: 'user-cancel',
      forceErrorText: 'cancelled',
    });

    const updated = store.get().agents.instances.a1!.state;
    const part = updated.history[0]!.parts[0] as AgentToolUIPart;
    expect(part.state).toBe('output-denied');
    expect(updated.pendingApprovals).toEqual({});
  });

  it('resolveApproval flips matching tool part to approval-responded', () => {
    const store = new AgentStore(emptySystemState());
    const history: AgentMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          makeApprovalRequestedPart({
            toolName: 'doThing',
            toolCallId: 'tc_1',
            approvalId: 'ap_1',
          }),
        ],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      },
    ];
    upsertAgentInstance(
      store,
      'a1',
      makeEnvelope({
        ...makeBaseState(history),
        pendingApprovals: { tc_1: { explanation: 'why' } },
      }),
    );

    resolveApproval(store, 'a1', {
      approvalId: 'ap_1',
      approved: true,
      reason: 'looks good',
    });

    const updated = store.get().agents.instances.a1!.state;
    const part = updated.history[0]!.parts[0] as AgentToolUIPart;
    expect(part.state).toBe('approval-responded');
    expect(updated.pendingApprovals).toEqual({});
  });

  it('terminateNonTerminalToolPartsInLastAssistant leaves already-terminal tool parts untouched', () => {
    const store = new AgentStore(emptySystemState());
    const deniedPart = {
      type: 'tool-doThing',
      toolCallId: 'tc_denied',
      state: 'output-denied',
      input: { foo: 'bar' },
      approval: {
        id: 'ap_denied',
        explanation: 'why',
        approved: false,
        reason: 'user-cancel',
      },
    } as unknown as AgentToolUIPart;
    const respondedPart = {
      type: 'tool-doThing',
      toolCallId: 'tc_responded',
      state: 'approval-responded',
      input: { foo: 'bar' },
      approval: {
        id: 'ap_responded',
        explanation: 'why',
        approved: true,
        reason: 'looks good',
      },
    } as unknown as AgentToolUIPart;
    const lastMsg: AgentMessage = {
      id: 'a-tail',
      role: 'assistant',
      parts: [deniedPart, respondedPart],
      metadata: { createdAt: new Date(), partsMetadata: [{}, {}] },
    };
    upsertAgentInstance(store, 'a1', makeEnvelope(makeBaseState([lastMsg])));

    terminateNonTerminalToolPartsInLastAssistant(store, 'a1', {
      approvalDenyReason: 'stop',
      outputErrorText: 'stop',
    });

    const after = store.get().agents.instances.a1!.state;
    const parts = after.history[0]!.parts as AgentToolUIPart[];
    expect(parts[0]!.state).toBe('output-denied');
    expect(parts[1]!.state).toBe('approval-responded');
  });

  it('terminateNonTerminalToolPartsInLastAssistant removes the empty assistant tail', () => {
    const store = new AgentStore(emptySystemState());
    const lastMsg: AgentMessage = {
      id: 'a-tail',
      role: 'assistant',
      parts: [
        makeApprovalRequestedPart({
          toolName: 'doThing',
          toolCallId: 'tc_1',
          approvalId: 'ap_1',
        }),
      ],
      metadata: { createdAt: new Date(), partsMetadata: [{}] },
    };
    upsertAgentInstance(
      store,
      'a1',
      makeEnvelope({
        ...makeBaseState([lastMsg]),
        pendingApprovals: { tc_1: { explanation: 'why' } },
      }),
    );

    // The approval-requested branch flips to output-denied; the message
    // keeps its tool part so the history length stays the same.
    terminateNonTerminalToolPartsInLastAssistant(store, 'a1', {
      approvalDenyReason: 'stop',
      outputErrorText: 'stop',
    });

    const after = store.get().agents.instances.a1!.state;
    expect(after.history.length).toBe(1);
    const part = after.history[0]!.parts[0] as AgentToolUIPart;
    expect(part.state).toBe('output-denied');
  });
});
