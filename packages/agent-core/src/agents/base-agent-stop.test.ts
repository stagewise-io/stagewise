import { describe, expect, it, vi } from 'vitest';
import { ChatAgent } from './chat/chat';

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
