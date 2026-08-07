import type { AgentMessage } from '@stagewise/agent-interface-internal';
import { describe, expect, it, vi } from 'vitest';
import { ChatAgent } from './chat/chat';

function createWorkingAgent() {
  const stateValue = {
    isWorking: true,
    history: [],
    queuedMessages: [] as AgentMessage[],
  };
  const enqueueUserMessage = vi.fn(
    ({
      message,
      position,
    }: {
      message: AgentMessage & { role: 'user' };
      position?: 'front' | 'back';
    }) => {
      if (position === 'front') stateValue.queuedMessages.unshift(message);
      else stateValue.queuedMessages.push(message);
      return {
        queuedModelId: 'test-model',
        queueLengthAfter: stateValue.queuedMessages.length,
      };
    },
  );
  const agent = Object.create(ChatAgent.prototype) as any;
  agent.instanceId = 'agent-1';
  agent.state = {
    get: () => stateValue,
    commands: {
      enqueueUserMessage,
      setIsWorkingFalse: vi.fn(),
    },
  };
  agent.host = {
    logger: { debug: vi.fn(), info: vi.fn() },
    telemetry: { capture: vi.fn() },
  };

  return { agent, enqueueUserMessage };
}

describe('BaseAgent.sendUserMessage', () => {
  it('queues a background message while a tool approval is pending', async () => {
    const approvalMessage = {
      id: 'assistant-message',
      role: 'assistant',
      parts: [
        {
          type: 'tool-createShellSession',
          state: 'approval-requested',
        },
      ],
    } as unknown as AgentMessage;
    const enqueueUserMessage = vi.fn().mockReturnValue({
      queuedModelId: 'test-model',
      queueLengthAfter: 1,
    });
    const denyAllNonTerminalToolPartsInHistory = vi.fn();
    const appendHistoryMessage = vi.fn();
    const runStep = vi.fn();
    const agent = Object.create(ChatAgent.prototype) as any;
    agent.instanceId = 'agent-1';
    agent.runStep = runStep;
    agent.scheduleMemorySnapshotWrite = vi.fn();
    agent.state = {
      get: () => ({ isWorking: false, history: [approvalMessage] }),
      commands: {
        enqueueUserMessage,
        denyAllNonTerminalToolPartsInHistory,
        appendHistoryMessage,
      },
    };
    agent.host = {
      logger: { debug: vi.fn() },
      telemetry: { capture: vi.fn() },
    };

    await agent.sendUserMessage(
      {
        id: 'watcher-message',
        role: 'user',
        parts: [{ type: 'text', text: 'Watcher triggered' }],
      } as AgentMessage & { role: 'user' },
      { queueIfBlocked: true },
    );

    expect(enqueueUserMessage).toHaveBeenCalledOnce();
    expect(denyAllNonTerminalToolPartsInHistory).not.toHaveBeenCalled();
    expect(appendHistoryMessage).not.toHaveBeenCalled();
    expect(runStep).not.toHaveBeenCalled();
  });

  it('flushes a prioritized blocked message on the next tool continuation', async () => {
    const { agent, enqueueUserMessage } = createWorkingAgent();

    await agent.sendUserMessage(
      {
        id: 'client-message',
        role: 'user',
        parts: [{ type: 'text', text: 'Use these partial answers instead' }],
      } as AgentMessage & { role: 'user' },
      { flushQueueOnNextStep: true },
    );

    expect(enqueueUserMessage).toHaveBeenCalledWith({
      message: expect.objectContaining({
        role: 'user',
        parts: [{ type: 'text', text: 'Use these partial answers instead' }],
      }),
      position: 'front',
    });
    expect(
      agent.shouldRunNewStep({
        finishReason: 'tool-calls',
        toolCalls: [{ toolName: 'askUserQuestions' }],
        content: [{ type: 'tool-approval-request' }],
      }),
    ).toEqual({ shouldRun: false, flushQueue: false });
    expect(
      agent.shouldRunNewStep({
        finishReason: 'tool-calls',
        toolCalls: [{ toolName: 'askUserQuestions' }],
        content: [],
      }),
    ).toEqual({ shouldRun: true, flushQueue: true });
  });

  it('does not flush an ordinary queued message during a tool chain', async () => {
    const { agent } = createWorkingAgent();

    await agent.sendUserMessage({
      id: 'client-message',
      role: 'user',
      parts: [{ type: 'text', text: 'Wait until the tool chain finishes' }],
    } as AgentMessage & { role: 'user' });

    expect(
      agent.shouldRunNewStep({
        finishReason: 'tool-calls',
        toolCalls: [{ toolName: 'executeShellCommand' }],
        content: [],
      }),
    ).toEqual({ shouldRun: true, flushQueue: false });
  });

  it('flushes a prioritized message during interrupted-run recovery', async () => {
    const { agent } = createWorkingAgent();
    agent.internalStop = vi.fn().mockResolvedValue(undefined);
    agent.runStep = vi.fn();

    await agent.sendUserMessage(
      {
        id: 'client-message',
        role: 'user',
        parts: [{ type: 'text', text: 'Use these partial answers instead' }],
      } as AgentMessage & { role: 'user' },
      { flushQueueOnNextStep: true },
    );
    await agent.recoverInterruptedRun('system-resumed');

    expect(agent.internalStop).toHaveBeenCalledWith('system-interrupted');
    expect(agent.runStep).toHaveBeenCalledWith(false, true);
  });
});
