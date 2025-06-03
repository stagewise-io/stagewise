import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import {
  createBridgeContract,
  createSRPCClientBridge,
  createSRPCServerBridge,
} from '../src/index';
import { z } from 'zod';

const contract = createBridgeContract({
  server: {
    ping: {
      request: z.void(),
      response: z.object({ pong: z.literal(true) }),
    },
  },
});

describe('WebSocketBridgeOptions', () => {
  const httpServer = http.createServer();
  const server = createSRPCServerBridge(httpServer, contract);
  const TEST_PORT = 3002;

  beforeAll(() => {
    return new Promise<void>((resolve) => {
      // Register a simple ping method
      server.register({
        ping: async () => {
          return { pong: true as const };
        },
      });

      // Start the server
      httpServer.listen(TEST_PORT, () => {
        resolve();
      });
    });
  });

  afterAll(() => {
    return new Promise<void>((resolve) => {
      httpServer.close(() => {
        resolve();
      });
    });
  });

  describe('Custom Timeout', () => {
    it('should respect custom request timeout', async () => {
      // Create client with very short timeout
      const shortTimeoutClient = createSRPCClientBridge(
        `ws://localhost:${TEST_PORT}`,
        contract,
        { requestTimeout: 50 }, // 50ms timeout
      );

      await shortTimeoutClient.connect();

      // Mock the server ping method to delay longer than the timeout
      const originalHandler = vi.fn().mockImplementation(async () => {
        return { pong: true as const };
      });

      // Store original handler
      const originalImplementation = server.register;

      // Create modified implementation
      const delayedHandler = async () => {
        await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay
        return { pong: true as const };
      };

      // Register the delayed handler
      server.register({
        ping: delayedHandler,
      });

      // The call should timeout
      await expect(shortTimeoutClient.call.ping()).rejects.toThrow(
        'Request timed out',
      );

      // Restore original implementation
      server.register({
        ping: async () => {
          return { pong: true as const };
        },
      });

      shortTimeoutClient.close();
    });

    it('should succeed with sufficient timeout', async () => {
      // Create client with normal timeout
      const normalTimeoutClient = createSRPCClientBridge(
        `ws://localhost:${TEST_PORT}`,
        contract,
        { requestTimeout: 500 }, // 500ms timeout
      );

      await normalTimeoutClient.connect();

      // Create delayed handler but within timeout
      const delayedHandler = async () => {
        await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay
        return { pong: true as const };
      };

      // Register the delayed handler
      server.register({
        ping: delayedHandler,
      });

      // The call should succeed
      const response = await normalTimeoutClient.call.ping();
      expect(response).toEqual({ pong: true });

      // Restore original implementation
      server.register({
        ping: async () => {
          return { pong: true as const };
        },
      });

      normalTimeoutClient.close();
    });
  });

  describe('Reconnection Options', () => {
    it('should respect maxReconnectAttempts', async () => {
      // Create client with custom reconnect settings
      const client = createSRPCClientBridge(
        `ws://localhost:${TEST_PORT}`,
        contract,
        {
          maxReconnectAttempts: 2,
          reconnectDelay: 100,
        },
      );

      await client.connect();

      // Access the WebSocketRpcClient instance
      const clientInstance = client as any;

      // Spy on reconnect method if accessible
      const reconnectSpy = vi.spyOn(clientInstance.bridge, 'reconnect');

      // Force disconnect by simulating closure
      if (clientInstance.bridge.ws) {
        clientInstance.bridge.ws.close();
      }

      // Wait for reconnection attempts to finish
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should have tried to reconnect at most maxReconnectAttempts times
      expect(reconnectSpy.mock.calls.length).toBeLessThanOrEqual(2);

      client.close();
    });
  });

  describe('Default Options', () => {
    it('should use default options when none provided', async () => {
      const client = createSRPCClientBridge(
        `ws://localhost:${TEST_PORT}`,
        contract,
      );

      await client.connect();

      // Get the underlying client instance
      const clientInstance = client as any;

      // Verify default options are used
      expect(clientInstance.bridge.options.requestTimeout).toBeGreaterThan(0);
      expect(
        clientInstance.bridge.options.maxReconnectAttempts,
      ).toBeGreaterThan(0);
      expect(clientInstance.bridge.options.reconnectDelay).toBeGreaterThan(0);

      client.close();
    });
  });
});
