import { afterEach, describe, expect, it, vi } from 'vitest';
import { modelFetch } from './model-fetch';

const transport = vi.hoisted(() => ({
  interceptor: undefined as
    | import('undici').Dispatcher.DispatcherComposeInterceptor
    | undefined,
}));
vi.mock('undici', () => ({
  Agent: class {
    compose(interceptor: typeof transport.interceptor) {
      transport.interceptor = interceptor;
      return this;
    }
  },
}));

describe('modelFetch', () => {
  afterEach(() => vi.restoreAllMocks());

  it('overrides fetch-supplied inactivity limits at dispatch time', () => {
    const dispatch = vi.fn().mockReturnValue(true);
    const handler = {};
    const options = {
      origin: 'https://model.test',
      path: '/',
      method: 'POST' as const,
      headersTimeout: 300_000,
      bodyTimeout: 300_000,
    };
    transport.interceptor!(dispatch)(options, handler);
    expect(dispatch).toHaveBeenCalledWith(
      {
        ...options,
        headersTimeout: 0,
        bodyTimeout: 0,
      },
      handler,
    );
  });

  it('preserves request options, cancellation, and the streaming response', async () => {
    const response = new Response('data: [DONE]\n\n');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    const controller = new AbortController();
    const init = {
      method: 'POST',
      body: '{}',
      headers: { Authorization: 'Bearer test-key' },
      signal: controller.signal,
    };
    await expect(modelFetch('https://model.test', init)).resolves.toBe(
      response,
    );
    expect(fetchSpy).toHaveBeenCalledWith('https://model.test', {
      ...init,
      dispatcher: expect.any(Object),
    });
  });
});
