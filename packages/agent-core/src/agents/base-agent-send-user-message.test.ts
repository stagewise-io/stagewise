import type { AgentMessage } from '@stagewise/agent-interface-internal';
import { describe, expect, it, vi } from 'vitest';
import { ChatAgent } from './chat/chat';

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

function createTestAgent(
  queuedMessages: AgentMessage[] = [],
  history: AgentMessage[] = [approvalMessage],
) {
  return Object.assign(Object.create(ChatAgent.prototype), {
    instanceId: 'agent-1',
    runStep: vi.fn(),
    scheduleMemorySnapshotWrite: vi.fn(),
    state: {
      get: () => ({
        isWorking: false,
        history,
        queuedMessages,
      }),
      commands: {
        enqueueUserMessage: vi.fn().mockReturnValue({
          queuedModelId: 'test-model',
          queueLengthAfter: queuedMessages.length + 1,
        }),
        denyAllNonTerminalToolPartsInHistory: vi.fn(),
        appendHistoryMessage: vi.fn(),
      },
    },
    host: {
      logger: { debug: vi.fn() },
      telemetry: { capture: vi.fn() },
    },
  });
}

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
      setIsWorkingFalse: vi.fn(() => {
        stateValue.isWorking = false;
      }),
    },
  };
  agent.host = {
    logger: { debug: vi.fn(), info: vi.fn() },
    telemetry: { capture: vi.fn() },
  };

  return { agent, enqueueUserMessage };
}

function userMessage(id: string) {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', text: id }],
  } as AgentMessage & { role: 'user' };
}

describe('BaseAgent.sendUserMessage', () => {
  it('queues a background message while a tool approval is pending', async () => {
    const agent = createTestAgent();
    const commands = agent.state.commands;

    await agent.sendUserMessage(userMessage('watcher-message'), {
      queueIfBlocked: true,
    });

    expect(commands.enqueueUserMessage).toHaveBeenCalledOnce();
    expect(
      commands.denyAllNonTerminalToolPartsInHistory,
    ).not.toHaveBeenCalled();
    expect(commands.appendHistoryMessage).not.toHaveBeenCalled();
    expect(agent.runStep).not.toHaveBeenCalled();
  });

  it('keeps a manual message queued when another message is waiting', async () => {
    const agent = createTestAgent([userMessage('queued-message')]);
    const commands = agent.state.commands;

    const messageId = await agent.sendUserMessage(
      userMessage('manual-message'),
    );

    expect(commands.enqueueUserMessage).toHaveBeenCalledOnce();
    expect(messageId).toBe(
      commands.enqueueUserMessage.mock.calls[0]?.[0].message.id,
    );
    expect(commands.appendHistoryMessage).not.toHaveBeenCalled();
    expect(agent.runStep).not.toHaveBeenCalled();
  });

  it('resumes an idle queue when a new manual message arrives', async () => {
    const agent = createTestAgent([userMessage('queued-message')], []);

    await agent.sendUserMessage(userMessage('manual-message'));

    expect(agent.state.commands.enqueueUserMessage).toHaveBeenCalledOnce();
    expect(agent.runStep).toHaveBeenCalledOnce();
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

  it('starts a message queued while stopping', async () => {
    const { agent, enqueueUserMessage } = createWorkingAgent();
    let finishStop = () => {};
    const pendingStop = new Promise<void>((resolve) => {
      finishStop = resolve;
    });
    agent.internalStop = vi.fn(() => pendingStop);
    agent.runStep = vi.fn();

    const stopping = agent.stop();
    await agent.sendUserMessage(userMessage('message-during-stop'));
    finishStop();
    await stopping;

    expect(enqueueUserMessage).toHaveBeenCalledOnce();
    expect(agent.runStep).toHaveBeenCalledOnce();
  });
});

describe('BaseAgent attachment lifecycle', () => {
  it('claims completed attachments before persisting the step', async () => {
    const attachment = { path: 'att/generated-image.png' };
    const agent = createTestAgent();
    agent.updateUsageWarning = vi.fn();
    agent.toolbox = { drainPendingAttachments: () => [attachment] };
    agent.saveState = vi.fn().mockRejectedValue(new Error('stop'));
    agent.state.commands.recordUsage = vi.fn();
    agent.state.commands.attachAttachmentsToLastAssistant = vi.fn();

    await expect(
      agent.handlePostStep({ usage: { totalTokens: 0 } }),
    ).rejects.toThrow('stop');
    expect(
      agent.state.commands.attachAttachmentsToLastAssistant,
    ).toHaveBeenCalledWith({ attachments: [attachment] });
  });
});
