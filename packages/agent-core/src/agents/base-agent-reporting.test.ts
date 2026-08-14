import { describe, expect, it, vi } from 'vitest';
import { ChatAgent } from './chat/chat';

describe('BaseAgent error reporting', () => {
  it('does not surface state or telemetry failures', () => {
    const captureException = vi.fn();
    const agent = Object.create(ChatAgent.prototype) as any;
    agent.instanceId = 'archived-agent';
    agent.state = {
      get: () => {
        throw new Error('missing agent instance');
      },
    };
    agent.host = { telemetry: { captureException } };

    expect(() =>
      agent.report(new Error('late callback'), 'updateTitle'),
    ).not.toThrow();

    agent.state.get = () => ({ activeModelId: 'test-model' });
    captureException.mockImplementation(() => {
      throw new Error('telemetry unavailable');
    });
    expect(() =>
      agent.report(new Error('step failed'), 'runStep'),
    ).not.toThrow();
  });
});
