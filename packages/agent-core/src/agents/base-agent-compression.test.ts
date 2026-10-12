import { describe, expect, it, vi } from 'vitest';
import { ChatAgent } from './chat/chat';

describe('BaseAgent manual history compression', () => {
  function makeAgent() {
    const agent = Object.create(ChatAgent.prototype) as any;
    agent.instanceId = 'agent-1';
    Object.defineProperty(agent, 'config', {
      value: {},
      configurable: true,
      writable: true,
    });
    agent._isCompressingHistory = false;
    agent.host = {
      logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
      models: {
        getWithOptions: vi.fn(async () => ({ contextWindowSize: 100_000 })),
      },
    };
    agent.state = { get: () => ({ history: [] }) };
    return agent;
  }

  it('returns "busy" without touching models while a run is in flight', async () => {
    const agent = makeAgent();
    agent._isCompressingHistory = true;

    const result = await agent.requestHistoryCompression();

    expect(result).toEqual({ status: 'busy' });
    expect(agent.host.models.getWithOptions).not.toHaveBeenCalled();
  });

  it('returns "noop" when there is nothing worth compressing', async () => {
    const agent = makeAgent();

    const result = await agent.requestHistoryCompression();

    expect(result).toEqual({ status: 'noop' });
  });
});
