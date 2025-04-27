import { describe, test, expect, afterEach, beforeAll } from 'vitest';
import { WebSocketClient } from '../index';
import type { PromptTriggerRequest } from '@stagewise/extension-websocket-contract';

describe('WebSocketClient Integration Tests', () => {
  let client: WebSocketClient;
  const serverUrl = 'ws://localhost:5746';

  beforeAll(() => {
    client = new WebSocketClient(serverUrl);
  });

  afterEach(async () => {
    await client.close();
  });

  test('should connect to the WebSocket server', async () => {
    await expect(client.connect()).resolves.not.toThrow();
  });

  test('should handle connection and disconnection', async () => {
    // First connect
    await client.connect();

    // Then disconnect
    await client.close();

    // Should be able to connect again
    await expect(client.connect()).resolves.not.toThrow();
  });

  test('should send a prompt trigger request', async () => {
    await client.connect();
    const payload: PromptTriggerRequest = {
      type: 'prompt_trigger_request',
      messageType: 'request',
      id: 'test-id',
      payload: {
        prompt: 'test-prompt',
      },
    };
    await expect(
      client.sendCommand('prompt_trigger_request', payload),
    ).resolves.not.toThrow();
  });
});
