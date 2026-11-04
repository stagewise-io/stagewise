import { describe, expect, it, vi } from 'vitest';
import { ChatAgent } from './chat/chat';
import { AgentStore } from '../store/agent-store';
import { bindStateMutations } from '../services/agent-manager/state-mutations/bind';
import { upsertAgentInstance } from '../services/agent-manager/state-mutations/instances';
import { AgentTypes, type AgentMessage } from '../types/agent';

describe('BaseAgent retry', () => {
  function createAgent(history: AgentMessage[]) {
    const store = new AgentStore({ agents: { instances: {} }, toolbox: {} });
    upsertAgentInstance(store, 'agent-1', {
      type: AgentTypes.CHAT,
      canSelectModel: true,
      requiredModelCapabilities: {},
      allowUserInput: true,
      parentAgentInstanceId: null,
      sideChatParentId: null,
      state: {
        title: '',
        isWorking: false,
        history,
        queuedMessages: [{ id: 'queued', role: 'user', parts: [] }],
        activeModelId: 'model',
        toolApprovalMode: 'alwaysAsk',
        pendingApprovals: {},
        inputState: '',
        usedTokens: 10,
        error: { message: 'terminated' },
      },
    });
    const agent = Object.create(ChatAgent.prototype) as any;
    agent.instanceId = 'agent-1';
    agent._stepGeneration = 1;
    agent._flushQueueAfterRetry = false;
    agent.stepAbortController = new AbortController();
    agent.toolbox = { cancelPendingAgentDialogs: vi.fn() };
    agent.externalRuntime = { stop: vi.fn(), resetThread: vi.fn() };
    Object.defineProperty(agent, 'config', { value: { persistent: true } });
    agent.state = {
      persist: vi.fn().mockResolvedValue(undefined),
      get: () => store.get().agents.instances['agent-1']!.state,
      commands: bindStateMutations(store, 'agent-1'),
    };
    agent.host = { logger: { info: vi.fn(), debug: vi.fn() } };
    agent.scheduleMemorySnapshotWrite = vi.fn();
    agent.runStep = vi.fn();
    return agent;
  }

  it('preserves valid output, completed tools, user IDs and queue while sanitizing the interrupted tail', async () => {
    const history: AgentMessage[] = [
      { id: 'user', role: 'user', parts: [{ type: 'text', text: 'work' }] },
      {
        id: 'completed',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Progress' },
          {
            type: 'dynamic-tool',
            toolName: 'write',
            toolCallId: 'done',
            state: 'output-available',
            input: {},
            output: 'saved',
          },
        ],
      },
      {
        id: 'partial',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Partial answer' },
          {
            type: 'dynamic-tool',
            toolName: 'read',
            toolCallId: 'pending',
            state: 'input-streaming',
            input: undefined,
          },
          { type: 'reasoning', text: 'unfinished' },
        ],
      },
    ];
    const agent = createAgent(history);
    const controller = agent.stepAbortController;
    await agent.retryLastUserMessage();

    const state = agent.state.get();
    expect(state.history.map((m: AgentMessage) => m.id)).toEqual([
      'user',
      'completed',
      'partial',
    ]);
    expect(state.history[1]).toEqual(history[1]);
    expect(state.history[2].parts).toEqual([
      { type: 'text', text: 'Partial answer' },
      expect.objectContaining({
        toolCallId: 'pending',
        state: 'output-error',
        input: {},
      }),
    ]);
    expect(state.queuedMessages.map((m: AgentMessage) => m.id)).toEqual([
      'queued',
    ]);
    expect(controller.signal.aborted).toBe(true);
    expect(agent.externalRuntime.resetThread).not.toHaveBeenCalled();
    expect(agent._pendingSyntheticContinuation).toEqual({
      reason: 'error-retry',
    });
    expect(agent.runStep).toHaveBeenCalledWith(false, false);
    expect(agent.state.persist).toHaveBeenCalledWith([0, 1, 2]);
    expect(agent.state.persist.mock.invocationCallOrder[0]).toBeLessThan(
      agent.runStep.mock.invocationCallOrder[0],
    );
  });

  it('terminalizes uncertain approved tools so repeated retries cannot execute them again', async () => {
    const agent = createAgent([
      { id: 'user', role: 'user', parts: [] },
      {
        id: 'approved',
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolName: 'write',
            toolCallId: 'approved',
            state: 'approval-responded',
            input: {},
            approval: { id: 'approval', approved: true },
          },
        ],
      },
    ]);
    await agent.retryLastUserMessage();
    await agent.retryLastUserMessage();
    expect(agent.state.get().history[1].parts[0]).toMatchObject({
      state: 'output-error',
      approval: undefined,
      errorText: expect.stringContaining('completion is unknown'),
    });
  });

  it('builds a model-only continuation after retaining partial assistant output', async () => {
    const agent = createAgent([
      { id: 'user', role: 'user', parts: [] },
      {
        id: 'partial',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Progress' }],
      },
    ]);
    await agent.retryLastUserMessage();
    agent.host.getAgentProfile = () => undefined;
    agent.domainAdapterRegistry = {
      captureAll: async () => ({ entries: new Map() }),
      listSorted: () => [],
    };
    agent.populatePathReferencesOnUserMessages = vi.fn();
    agent.transformMessagesBeforeStep = async (messages: AgentMessage[]) =>
      messages;
    agent.getSystemPrompt = async () => '';
    agent.host.models = {
      getCapabilities: () => ({}),
      getWithOptions: async () => ({ contextWindowSize: 200_000 }),
    };
    agent.host.paths = {};
    agent.host.getFileReadTransformers = () => [];
    agent.toolbox.getSkillsList = async () => [];
    agent.toolbox.getMountedPathsForAgent = () => new Map();
    agent.getToolsForStep = async () => ({});
    agent.transformModelMessagesBeforeStep = async (messages: unknown) =>
      messages;
    const context = await agent.generateContextForNewStep();
    expect(JSON.stringify(context)).toContain('Progress');
    expect(context.at(-1)).toEqual({
      role: 'user',
      content: 'continue',
    });
    expect(agent.state.get().history).toHaveLength(2);
  });

  it('passes the original request to the external runtime on retry', async () => {
    const user: AgentMessage = {
      id: 'user',
      role: 'user',
      parts: [{ type: 'text', text: 'Original request' }],
    };
    const agent = createAgent([user]);
    agent.externalRuntime.runTurn = vi.fn();
    await agent.retryLastUserMessage();
    await agent.runExternalStep(
      { modelId: 'model' },
      agent._stepGeneration,
      undefined,
    );
    expect(agent.externalRuntime.runTurn.mock.calls[0][0].userMessages).toEqual(
      [
        user,
        expect.objectContaining({
          parts: [
            {
              type: 'text',
              text: 'Continue from where the interrupted turn stopped.',
            },
          ],
        }),
      ],
    );
  });

  it('rejects overlapping retries while persistence is pending', async () => {
    const agent = createAgent([{ id: 'user', role: 'user', parts: [] }]);
    let finish!: () => void;
    agent.state.persist.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const first = agent.retryLastUserMessage();
    await expect(agent.retryLastUserMessage()).rejects.toThrow('still running');
    await Promise.resolve();
    finish();
    await first;
    expect(agent.runStep).toHaveBeenCalledTimes(1);
  });

  it('defers an explicit queue flush until retry persistence finishes', async () => {
    const agent = createAgent([{ id: 'user', role: 'user', parts: [] }]);
    let finish!: () => void;
    agent.state.persist.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const retry = agent.retryLastUserMessage();
    await Promise.resolve();
    await agent.flushQueue();
    expect(agent.runStep).not.toHaveBeenCalled();
    finish();
    await retry;
    expect(agent.runStep).toHaveBeenCalledExactlyOnceWith(false, true);
  });

  it('retains queued input without executing after retry persistence fails', async () => {
    const agent = createAgent([{ id: 'user', role: 'user', parts: [] }]);
    let fail!: (error: Error) => void;
    agent.state.persist.mockReturnValue(
      new Promise<void>((_, reject) => {
        fail = reject;
      }),
    );
    const retry = agent.retryLastUserMessage();
    const rejected = expect(retry).rejects.toThrow('disk full');
    await Promise.resolve();
    const newMessageId = await agent.sendUserMessage({
      role: 'user',
      parts: [],
    });
    await agent.flushQueue();
    fail(new Error('disk full'));
    await rejected;
    expect(agent.runStep).not.toHaveBeenCalled();
    expect(
      agent.state
        .get()
        .queuedMessages.map((message: AgentMessage) => message.id),
    ).toEqual(['queued', newMessageId]);
    expect(agent._retryInProgress).toBe(false);
  });

  it('flushes a prioritized reply on retry', async () => {
    const agent = createAgent([{ id: 'user', role: 'user', parts: [] }]);
    agent._queuedMessageToFlushOnNextStepId = 'queued';
    await agent.retryLastUserMessage();
    expect(agent.runStep).toHaveBeenCalledWith(false, true);
    const user = agent.state.get().history[0];
    const reply = { id: 'queued', role: 'user', parts: [] };
    const state = agent.state.get();
    agent.state.get = () => ({ ...state, history: [...state.history, reply] });
    agent.externalRuntime.runTurn = vi.fn();
    await agent.runExternalStep({ modelId: 'model' }, agent._stepGeneration, 1);
    expect(agent.externalRuntime.runTurn.mock.calls[0][0].userMessages).toEqual(
      [user, expect.objectContaining({ role: 'user' }), reply],
    );
  });

  it('queues new messages without starting a step during retry cancellation', async () => {
    const agent = createAgent([{ id: 'user', role: 'user', parts: [] }]);
    let finish!: () => void;
    agent.externalRuntime.stop.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const retry = agent.retryLastUserMessage();
    await agent.sendUserMessage({ id: 'new', role: 'user', parts: [] });
    expect(agent.runStep).not.toHaveBeenCalled();
    expect(agent.state.get().queuedMessages).toHaveLength(2);
    finish();
    await retry;
    expect(agent.runStep).toHaveBeenCalledOnce();
  });

  it('preserves denied approvals and persists only surviving history indices', async () => {
    const denied = {
      type: 'dynamic-tool' as const,
      toolName: 'write',
      toolCallId: 'denied',
      state: 'approval-responded' as const,
      input: {},
      approval: {
        id: 'denial',
        approved: false as const,
        reason: 'Do not write',
      },
    };
    const agent = createAgent([
      { id: 'user', role: 'user', parts: [] },
      { id: 'denied', role: 'assistant', parts: [denied] },
      {
        id: 'reasoning',
        role: 'assistant',
        parts: [{ type: 'reasoning', text: 'unfinished' }],
      },
    ]);
    await agent.retryLastUserMessage();
    expect(agent.state.get().history[1].parts[0]).toEqual(denied);
    expect(agent.state.persist).toHaveBeenCalledWith([0, 1]);
  });

  it('retries an error before any assistant output without duplicating the user message', async () => {
    const agent = createAgent([
      { id: 'user', role: 'user', parts: [{ type: 'text', text: 'work' }] },
    ]);
    await agent.retryLastUserMessage();
    expect(agent.state.get().history).toHaveLength(1);
    expect(agent.runStep).toHaveBeenCalledWith(false, false);
  });

  it('rejects retry without an error or while running', async () => {
    const agent = createAgent([{ id: 'user', role: 'user', parts: [] }]);
    agent.state.get = () => ({ error: undefined });
    await expect(agent.retryLastUserMessage()).rejects.toThrow(
      'No error to retry',
    );
    agent.state.get = () => ({ error: { message: 'failed' }, isWorking: true });
    await expect(agent.retryLastUserMessage()).rejects.toThrow('still running');
    expect(agent.runStep).not.toHaveBeenCalled();
  });
});

describe('BaseAgent stop ordering', () => {
  it('terminalizes tool parts after an external runtime stop failure', async () => {
    const calls: string[] = [];
    const agent = Object.create(ChatAgent.prototype) as any;
    agent._stepGeneration = 0;
    agent._pendingContinue = null;
    agent._pendingSyntheticContinuation = null;
    agent._pendingFallbackRetry = false;
    agent.stepAbortController = null;
    agent.instanceId = 'agent-1';
    agent.toolbox = { cancelPendingAgentDialogs: vi.fn() };
    agent.externalRuntime = {
      stop: vi.fn(async () => {
        calls.push('external');
        throw new Error('stop failed');
      }),
    };
    agent.host = { logger: { error: vi.fn() } };
    agent.state = {
      commands: {
        terminateNonTerminalToolPartsInLastAssistant: vi.fn(() => {
          calls.push('terminalize');
        }),
        setIsWorkingFalse: vi.fn(),
      },
    };

    await agent.stop();

    expect(calls).toEqual(['external', 'terminalize']);
    expect(agent.externalRuntime.stop).toHaveBeenCalledWith(
      'User stopped agent before tool call approval was granted.',
    );
  });
});
