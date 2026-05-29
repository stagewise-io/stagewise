import { describe, expect, it } from 'vitest';
import type { AgentMessage } from '../../types/agent';
import { AgentStore } from '../../store/agent-store';
import type { AgentSystemState } from '../../store/state';
import type { AgentInstanceWriterEnvelope } from './agent-instances-writer-port';
import { createInMemoryAgentInstancesWriter } from './in-memory-agent-instances-writer';
import { AgentTypes } from '../../types/agent';
import type { AgentState } from '../../types/agent';

function emptySystemState(): AgentSystemState {
  return {
    agents: { instances: {} },
    toolbox: {},
  };
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

function makeEnvelope(state: AgentState): AgentInstanceWriterEnvelope {
  return {
    type: AgentTypes.CHAT,
    canSelectModel: true,
    requiredModelCapabilities: { foo: true } as unknown,
    allowUserInput: true,
    parentAgentInstanceId: null,
    state,
  };
}

describe('createInMemoryAgentInstancesWriter', () => {
  it('round-trips upsert and getInstance', () => {
    const store = new AgentStore(emptySystemState());
    const writer = createInMemoryAgentInstancesWriter({ store });
    const envelope = makeEnvelope(minimalState());

    writer.upsertInstance('a1', envelope);
    const read = writer.getInstance('a1');

    expect(read?.type).toBe(AgentTypes.CHAT);
    expect(read?.requiredModelCapabilities).toEqual({ foo: true });
    expect(read?.state.title).toBe('seed');
    expect(store.get().agents.instances.a1?.state.title).toBe('seed');
  });

  it('applies setTitle via buildCommands', () => {
    const store = new AgentStore(emptySystemState());
    const writer = createInMemoryAgentInstancesWriter({ store });
    writer.upsertInstance('a1', makeEnvelope(minimalState()));

    writer.buildCommands('a1').setTitle({ title: 'renamed' });

    expect(writer.getInstance('a1')?.state.title).toBe('renamed');
  });

  it('deleteInstance removes the instance', () => {
    const store = new AgentStore(emptySystemState());
    const writer = createInMemoryAgentInstancesWriter({ store });
    writer.upsertInstance('a1', makeEnvelope(minimalState()));
    store.update((d) => {
      d.toolbox.a1 = {
        workspace: { mounts: [] },
        pendingFileDiffs: [],
        editSummary: [],
        pendingUserQuestion: null,
      };
    });

    writer.deleteInstance('a1');

    expect(store.get().agents.instances.a1).toBeUndefined();
    expect(store.get().toolbox.a1).toBeUndefined();
  });

  it('setToolApprovalMode updates state', () => {
    const store = new AgentStore(emptySystemState());
    const writer = createInMemoryAgentInstancesWriter({ store });
    writer.upsertInstance('a1', makeEnvelope(minimalState()));

    writer.setToolApprovalMode('a1', 'smart');

    expect(writer.getInstance('a1')?.state.toolApprovalMode).toBe('smart');
  });

  it('attachEnvState writes envState entries onto the target user message', () => {
    const store = new AgentStore(emptySystemState());
    const writer = createInMemoryAgentInstancesWriter({ store });
    const userMsg = {
      id: 'u1',
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: 'hi', state: 'done' as const }],
      metadata: {
        createdAt: new Date(),
        partsMetadata: [],
      },
    } satisfies AgentMessage;
    writer.upsertInstance(
      'a1',
      makeEnvelope({
        ...minimalState(),
        history: [userMsg],
      }),
    );

    writer.buildCommands('a1').attachEnvState({
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

    const hist = writer.getInstance('a1')!.state.history[0]!;
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
    const writer = createInMemoryAgentInstancesWriter({ store });
    const userMsg = {
      id: 'u1',
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: 'hi', state: 'done' as const }],
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
    } satisfies AgentMessage;
    writer.upsertInstance(
      'a1',
      makeEnvelope({
        ...minimalState(),
        history: [userMsg],
      }),
    );

    writer.buildCommands('a1').attachEnvState({
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

    const hist = writer.getInstance('a1')!.state.history[0]!;
    expect(Object.keys(hist.metadata!.envState!).sort()).toEqual([
      'browser',
      'workspace',
    ]);
  });

  it('attachEnvState with empty entries is a no-op', () => {
    const store = new AgentStore(emptySystemState());
    const writer = createInMemoryAgentInstancesWriter({ store });
    const userMsg = {
      id: 'u1',
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: 'hi', state: 'done' as const }],
      metadata: { createdAt: new Date(), partsMetadata: [] },
    } satisfies AgentMessage;
    writer.upsertInstance(
      'a1',
      makeEnvelope({ ...minimalState(), history: [userMsg] }),
    );

    writer.buildCommands('a1').attachEnvState({ entries: new Map() });

    const hist = writer.getInstance('a1')!.state.history[0]!;
    expect(hist.metadata?.envState).toBeUndefined();
  });
});
