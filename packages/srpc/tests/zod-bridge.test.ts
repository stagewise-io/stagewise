import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { createServer } from 'node:http';
import { createBridgeContract } from '../src/zod-contract';
import { createSRPCServerBridge, type ZodServer } from '../src/server';
import { createSRPCClientBridge, type ZodClient } from '../src/client';

// Define test contract schemas
const testContract = createBridgeContract({
  server: {
    echo: {
      request: z.object({ message: z.string() }),
      response: z.object({ message: z.string() }),
    },
    countdown: {
      request: z.object({ from: z.number() }),
      response: z.object({ done: z.boolean() }),
      update: z.object({ current: z.number() }),
    },
  },
  client: {
    notify: {
      request: z.object({ type: z.string(), data: z.any() }),
      response: z.object({ received: z.boolean() }),
    },
  },
});

type TestContract = typeof testContract;

describe('Zod Bridge Integration', () => {
  const PORT = 8999;
  const WS_URL = `ws://localhost:${PORT}`;

  let httpServer: ReturnType<typeof createServer>;
  let serverBridge: ZodServer<TestContract>;
  let clientBridge: ZodClient<TestContract>;

  beforeEach(async () => {
    // Setup HTTP server
    httpServer = createServer();
    httpServer.listen(PORT);

    // Create server bridge
    serverBridge = createSRPCServerBridge(httpServer, testContract);

    // Create and connect client bridge
    clientBridge = createSRPCClientBridge(WS_URL, testContract, {
      requestTimeout: 1000,
      maxReconnectAttempts: 3,
      reconnectDelay: 100,
    });

    await clientBridge.connect();
  });

  afterEach(async () => {
    await clientBridge.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  describe('Basic RPC Communication', () => {
    it('should handle simple request-response with validation', async () => {
      // Register server implementation
      serverBridge.register({
        echo: async (request) => {
          return { message: request.message };
        },
        countdown: async () => ({ done: true }), // Stub implementation
      });

      // Make client call
      const response = await clientBridge.call.echo({ message: 'hello' });
      expect(response).toEqual({ message: 'hello' });
    });

    it('should reject invalid request data', async () => {
      serverBridge.register({
        echo: async (request) => {
          return { message: request.message };
        },
        countdown: async () => ({ done: true }), // Stub implementation
      });

      // @ts-expect-error - Intentionally testing runtime validation
      await expect(clientBridge.call.echo({ message: 123 })).rejects.toThrow(
        'Validation failed',
      );
    });

    it('should reject invalid response data', async () => {
      serverBridge.register({
        // @ts-expect-error - Intentionally testing runtime validation
        echo: async () => {
          return { message: 123 };
        },
        countdown: async () => ({ done: true }), // Stub implementation
      });

      await expect(
        clientBridge.call.echo({ message: 'hello' }),
      ).rejects.toThrow('Validation failed');
    });
  });

  describe('Updates During Long Operations', () => {
    it('should handle progress updates with validation', async () => {
      const updates: number[] = [];

      serverBridge.register({
        echo: async (request) => ({ message: request.message }), // Stub implementation
        countdown: async (request, { sendUpdate }) => {
          let current = request.from;
          while (current > 0) {
            sendUpdate({ current });
            current--;
          }
          return { done: true };
        },
      });

      const response = await clientBridge.call.countdown(
        { from: 3 },
        {
          onUpdate: (update) => {
            updates.push(update.current);
          },
        },
      );

      expect(response).toEqual({ done: true });
      expect(updates).toEqual([3, 2, 1]);
    });

    it('should reject invalid update data', async () => {
      const updateError = vi.fn();

      serverBridge.register({
        echo: async (request) => ({ message: request.message }), // Stub implementation
        countdown: async (request, { sendUpdate }) => {
          // @ts-expect-error - Intentionally testing runtime validation
          sendUpdate({ current: 'not a number' });
          return { done: true };
        },
      });

      await clientBridge.call.countdown(
        { from: 3 },
        {
          onUpdate: () => {},
        },
      );

      // The invalid update should have been caught and logged
      expect(console.error).toHaveBeenCalled;
    });
  });

  describe('Bidirectional Communication', () => {
    it('should allow server to call client methods', async () => {
      // Setup client implementation
      clientBridge.register({
        notify: async (request) => {
          expect(request.type).toBe('test');
          expect(request.data).toBe('data');
          return { received: true };
        },
      });

      // Server makes call to client
      const response = await serverBridge.call.notify({
        type: 'test',
        data: 'data',
      });

      expect(response).toEqual({ received: true });
    });
  });

  describe('Error Handling', () => {
    it('should handle server-side errors gracefully', async () => {
      serverBridge.register({
        echo: async () => {
          throw new Error('Server error');
        },
        countdown: async () => ({ done: true }), // Stub implementation
      });

      await expect(
        clientBridge.call.echo({ message: 'hello' }),
      ).rejects.toThrow('Server error');
    });

    it('should handle client-side errors gracefully', async () => {
      clientBridge.register({
        notify: async () => {
          throw new Error('Client error');
        },
      });

      await expect(
        serverBridge.call.notify({ type: 'test', data: null }),
      ).rejects.toThrow('Client error');
    });
  });

  describe('Type Safety', () => {
    it('should provide type-safe method calls', async () => {
      serverBridge.register({
        echo: async (request) => {
          // TypeScript should know request.message is a string
          const uppercased: string = request.message.toUpperCase();
          return { message: uppercased };
        },
        countdown: async () => ({ done: true }), // Stub implementation
      });

      const response = await clientBridge.call.echo({ message: 'hello' });
      // TypeScript should know response.message is a string
      const lowercased: string = response.message.toLowerCase();
      expect(lowercased).toBe('hello');
    });
  });
});
