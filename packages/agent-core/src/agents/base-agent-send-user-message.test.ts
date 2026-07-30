import type { AgentMessage } from '@stagewise/agent-interface-internal';
import { describe, expect, it, vi } from 'vitest';
import { ChatAgent } from './chat/chat';

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
});
