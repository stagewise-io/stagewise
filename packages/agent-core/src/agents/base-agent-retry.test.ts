import type { AgentMessage } from '@stagewise/agent-interface-internal';
import { describe, expect, it, vi } from 'vitest';
import { ChatAgent } from './chat/chat';

function userMessage(id: string) {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', text: id }],
  } as AgentMessage & { role: 'user' };
}

function assistantMessage(id: string) {
  return {
    id,
    role: 'assistant',
    parts: [
      {
        type: 'tool-readFile',
        toolCallId: `${id}-call`,
        state: 'output-available',
        input: {},
        output: {},
      },
      { type: 'text', text: 'partial work' },
    ],
  } as unknown as AgentMessage;
}

function createErroredAgent(
  history: AgentMessage[],
  overrides: { error?: unknown; isWorking?: boolean } = {},
) {
  const stateValue = {
    isWorking: overrides.isWorking ?? false,
    error: 'error' in overrides ? overrides.error : { message: 'Upstream' },
    history,
    queuedMessages: [] as AgentMessage[],
  };
  const agent = Object.create(ChatAgent.prototype) as any;
  agent.instanceId = 'agent-1';
  agent.runStep = vi.fn();
  agent.internalStop = vi.fn().mockResolvedValue(undefined);
  agent.revertToUserMessage = vi.fn();
  agent.sendUserMessage = vi.fn();
  agent.state = {
    get: () => stateValue,
    commands: {
      denyAllNonTerminalToolPartsInHistory: vi.fn(),
      truncateHistoryAt: vi.fn(),
      enqueueUserMessage: vi.fn().mockReturnValue({
        queuedModelId: 'test-model',
        queueLengthAfter: 1,
      }),
      appendHistoryMessage: vi.fn(),
    },
  };
  agent.host = {
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
    telemetry: { capture: vi.fn() },
  };
  return { agent, stateValue };
}

describe('BaseAgent.retryLastUserMessage', () => {
  it('keeps the work done after the last user message', async () => {
    const history = [
      userMessage('user-1'),
      assistantMessage('assistant-1'),
      assistantMessage('assistant-2'),
    ];
    const { agent } = createErroredAgent(history);

    await agent.retryLastUserMessage();

    expect(agent.state.commands.truncateHistoryAt).not.toHaveBeenCalled();
    expect(agent.revertToUserMessage).not.toHaveBeenCalled();
    expect(agent.sendUserMessage).not.toHaveBeenCalled();
    expect(
      agent.state.commands.denyAllNonTerminalToolPartsInHistory,
    ).toHaveBeenCalledOnce();
    expect(agent._pendingSyntheticContinuation).toEqual({
      reason: 'error-retry',
    });
    expect(agent.runStep).toHaveBeenCalledWith(false, false);
  });

  it('answers the user message directly when the failed step left no output', async () => {
    const { agent } = createErroredAgent([
      userMessage('user-1'),
      assistantMessage('assistant-1'),
      userMessage('user-2'),
    ]);

    await agent.retryLastUserMessage();

    expect(agent.state.commands.truncateHistoryAt).not.toHaveBeenCalled();
    expect(agent.revertToUserMessage).not.toHaveBeenCalled();
    expect(agent.sendUserMessage).not.toHaveBeenCalled();
    expect(agent._pendingSyntheticContinuation ?? null).toBeNull();
    expect(agent.runStep).toHaveBeenCalledWith(false, false);
  });

  it('stops the failed step before resuming', async () => {
    const { agent, stateValue } = createErroredAgent([
      userMessage('user-1'),
      {
        id: 'reasoning-only',
        role: 'assistant',
        parts: [{ type: 'reasoning', text: 'thinking' }],
      } as unknown as AgentMessage,
    ]);
    // internalStop drops a reasoning-only leftover assistant message.
    agent.internalStop.mockImplementation(async () => {
      stateValue.history = stateValue.history.slice(0, -1);
    });

    await agent.retryLastUserMessage();

    expect(agent.internalStop).toHaveBeenCalledWith('error-retry');
    expect(agent.internalStop.mock.invocationCallOrder[0]).toBeLessThan(
      agent.runStep.mock.invocationCallOrder[0],
    );
    expect(agent._pendingSyntheticContinuation ?? null).toBeNull();
    expect(agent.runStep).toHaveBeenCalledWith(false, false);
  });

  it('runs approved tool calls through the approval continuation', async () => {
    const { agent } = createErroredAgent([
      userMessage('user-1'),
      {
        id: 'assistant-approval',
        role: 'assistant',
        parts: [
          {
            type: 'tool-executeShellCommand',
            toolCallId: 'call-1',
            state: 'approval-responded',
            input: {},
            approval: { id: 'approval-1', approved: true },
          },
        ],
      } as unknown as AgentMessage,
    ]);

    await agent.retryLastUserMessage();

    expect(agent.runStep).toHaveBeenCalledWith(true);
    expect(
      agent.state.commands.denyAllNonTerminalToolPartsInHistory,
    ).not.toHaveBeenCalled();
    // Lets an external runtime resume the turn; the internal path skips it
    // because the model context ends with the approval response.
    expect(agent._pendingSyntheticContinuation).toEqual({
      reason: 'error-retry',
    });
  });

  it('rejects a second retry while the first is stopping the failed step', async () => {
    const { agent } = createErroredAgent([
      userMessage('user-1'),
      assistantMessage('assistant-1'),
    ]);
    let finishStop: () => void = () => {};
    agent.internalStop.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishStop = resolve;
        }),
    );

    const first = agent.retryLastUserMessage();
    await expect(agent.retryLastUserMessage()).rejects.toThrow(
      'A retry is already in progress',
    );
    finishStop();
    await first;

    expect(agent.internalStop).toHaveBeenCalledOnce();
    expect(agent.runStep).toHaveBeenCalledOnce();
  });

  it('queues a user message sent while the retry is stopping the failed step', async () => {
    const { agent } = createErroredAgent([
      userMessage('user-1'),
      assistantMessage('assistant-1'),
    ]);
    // Exercise the real sendUserMessage instead of the stub.
    agent.sendUserMessage = ChatAgent.prototype.sendUserMessage;
    let finishStop: () => void = () => {};
    agent.internalStop.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishStop = resolve;
        }),
    );

    const retry = agent.retryLastUserMessage();
    await agent.sendUserMessage(userMessage('user-2'));

    expect(agent.state.commands.enqueueUserMessage).toHaveBeenCalledOnce();
    expect(agent.state.commands.appendHistoryMessage).not.toHaveBeenCalled();
    expect(agent.runStep).not.toHaveBeenCalled();

    finishStop();
    await retry;

    expect(agent.runStep).toHaveBeenCalledOnce();
    expect(agent.runStep).toHaveBeenCalledWith(false, false);
  });

  it('refuses to retry without an error', async () => {
    const { agent } = createErroredAgent([userMessage('user-1')], {
      error: undefined,
    });

    await expect(agent.retryLastUserMessage()).rejects.toThrow(
      'No error to retry',
    );
    expect(agent.runStep).not.toHaveBeenCalled();
  });

  it('refuses to retry while the agent is working', async () => {
    const { agent } = createErroredAgent([userMessage('user-1')], {
      isWorking: true,
    });

    await expect(agent.retryLastUserMessage()).rejects.toThrow(
      'Cannot retry while agent is still running',
    );
    expect(agent.runStep).not.toHaveBeenCalled();
  });

  it('refuses to retry without any user message', async () => {
    const { agent } = createErroredAgent([assistantMessage('assistant-1')]);

    await expect(agent.retryLastUserMessage()).rejects.toThrow(
      'No user message found to retry',
    );
    expect(agent.runStep).not.toHaveBeenCalled();
  });
});
