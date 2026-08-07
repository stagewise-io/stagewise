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
});
