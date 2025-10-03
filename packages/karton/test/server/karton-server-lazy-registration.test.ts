import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { createKartonServer } from '../../src/server/karton-server.js';
import type { KartonServer } from '../../src/shared/types.js';
import { KartonProcedureError } from '../../src/shared/types.js';
import { createKartonClient } from '../../src/client/karton-client.js';
import type { KartonClient } from '../../src/shared/types.js';
import type { Server } from 'http';

type TestAppType = {
  state: {
    counter: number;
    message: string;
  };
  serverProcedures: {
    increment: (amount: number) => Promise<number>;
    nested: {
      getData: () => Promise<string>;
      process: (input: string) => Promise<{ result: string }>;
    };
  };
  clientProcedures: {
    notify: (message: string) => Promise<void>;
  };
};

describe('KartonServer Lazy Registration', () => {
  let server: KartonServer<TestAppType>;
  let client: KartonClient<TestAppType>;
  let httpServer: Server;
  let port: number;

  beforeEach(async () => {
    port = 8080 + Math.floor(Math.random() * 1000);
  });

  afterEach(async () => {
    if (client) {
      // @ts-ignore - accessing private property for cleanup
      client.cleanup?.();
    }
    if (server) {
      await server.wss.close();
    }
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });

  describe('registerServerProcedureHandler', () => {
    it('should allow registering a procedure handler after server creation', async () => {
      // Create server without procedures
      server = await createKartonServer<TestAppType>({
        initialState: {
          counter: 0,
          message: 'initial',
        },
      });

      // Register handler lazily
      const handler = vi.fn(async (amount: number, clientId: string) => {
        return server.state.counter + amount;
      });

      server.registerServerProcedureHandler('increment', handler);

      // Create HTTP server and attach WebSocket server
      httpServer = createServer();
      const wss = server.wss as WebSocketServer;
      httpServer.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      });
      httpServer.listen(port);

      client = createKartonClient<TestAppType>({
        webSocketPath: `ws://localhost:${port}`,
        procedures: {
          notify: async (message: string) => {
            console.log('Client notified:', message);
          },
        },
        fallbackState: { counter: 0, message: '' },
      });

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Call the procedure
      const result = await client.serverProcedures.increment(5);
      
      expect(handler).toHaveBeenCalledWith(5, expect.any(String));
      expect(result).toBe(5);
    });

    it('should allow registering nested procedure handlers', async () => {
      server = await createKartonServer<TestAppType>({
        initialState: {
          counter: 0,
          message: 'initial',
        },
      });

      const getDataHandler = vi.fn(async (clientId: string) => 'test data');
      const processHandler = vi.fn(async (input: string, clientId: string) => ({
        result: `processed: ${input}`,
      }));

      server.registerServerProcedureHandler('nested.getData', getDataHandler);
      server.registerServerProcedureHandler('nested.process', processHandler);

      // Create HTTP server and attach WebSocket server
      httpServer = createServer();
      const wss = server.wss as WebSocketServer;
      httpServer.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      });
      httpServer.listen(port);

      client = createKartonClient<TestAppType>({
        webSocketPath: `ws://localhost:${port}`,
        procedures: {
          notify: async () => {},
        },
        fallbackState: { counter: 0, message: '' },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const data = await client.serverProcedures.nested.getData();
      expect(data).toBe('test data');
      expect(getDataHandler).toHaveBeenCalledWith(expect.any(String));

      const result = await client.serverProcedures.nested.process('test');
      expect(result).toEqual({ result: 'processed: test' });
      expect(processHandler).toHaveBeenCalledWith('test', expect.any(String));
    });

    it('should apply handler to all existing connections', async () => {
      server = await createKartonServer<TestAppType>({
        initialState: {
          counter: 0,
          message: 'initial',
        },
      });

      // Create HTTP server and attach WebSocket server
      httpServer = createServer();
      const wss = server.wss as WebSocketServer;
      httpServer.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      });
      httpServer.listen(port);

      // Create multiple clients
      const client1 = createKartonClient<TestAppType>({
        webSocketPath: `ws://localhost:${port}`,
        procedures: { notify: async () => {} },
        fallbackState: { counter: 0, message: '' },
      });

      const client2 = createKartonClient<TestAppType>({
        webSocketPath: `ws://localhost:${port}`,
        procedures: { notify: async () => {} },
        fallbackState: { counter: 0, message: '' },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Register handler after clients are connected
      const handler = vi.fn(async (amount: number, clientId: string) => amount * 2);
      server.registerServerProcedureHandler('increment', handler);

      // Both clients should be able to call the procedure
      const result1 = await client1.serverProcedures.increment(5);
      const result2 = await client2.serverProcedures.increment(10);

      expect(result1).toBe(10);
      expect(result2).toBe(20);
      expect(handler).toHaveBeenCalledTimes(2);

      // Cleanup
      // @ts-ignore
      client1.cleanup?.();
      // @ts-ignore
      client2.cleanup?.();
    });

    it('should throw error when registering duplicate handler', async () => {
      server = await createKartonServer<TestAppType>({
        initialState: {
          counter: 0,
          message: 'initial',
        },
      });

      const handler1 = async (amount: number, clientId: string) => amount;
      const handler2 = async (amount: number, clientId: string) => amount * 2;

      server.registerServerProcedureHandler('increment', handler1);

      // Should throw when trying to register duplicate
      expect(() => {
        server.registerServerProcedureHandler('increment', handler2);
      }).toThrow(KartonProcedureError);

      expect(() => {
        server.registerServerProcedureHandler('increment', handler2);
      }).toThrow(/already registered/i);
    });
  });

  describe('removeServerProcedureHandler', () => {
    it('should remove a registered handler', async () => {
      server = await createKartonServer<TestAppType>({
        initialState: {
          counter: 0,
          message: 'initial',
        },
      });

      const handler = vi.fn(async (amount: number, clientId: string) => amount);
      server.registerServerProcedureHandler('increment', handler);

      // Remove the handler
      server.removeServerProcedureHandler('increment');

      // Should be able to register new handler now
      const newHandler = vi.fn(async (amount: number, clientId: string) => amount * 3);
      server.registerServerProcedureHandler('increment', newHandler);

      // Create HTTP server and attach WebSocket server
      httpServer = createServer();
      const wss = server.wss as WebSocketServer;
      httpServer.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      });
      httpServer.listen(port);

      client = createKartonClient<TestAppType>({
        webSocketPath: `ws://localhost:${port}`,
        procedures: { notify: async () => {} },
        fallbackState: { counter: 0, message: '' },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await client.serverProcedures.increment(4);
      
      expect(result).toBe(12);
      expect(handler).not.toHaveBeenCalled();
      expect(newHandler).toHaveBeenCalledWith(4, expect.any(String));
    });

    it('should remove handler from all connections', async () => {
      server = await createKartonServer<TestAppType>({
        initialState: {
          counter: 0,
          message: 'initial',
        },
      });

      // Create HTTP server and attach WebSocket server
      httpServer = createServer();
      const wss = server.wss as WebSocketServer;
      httpServer.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      });
      httpServer.listen(port);

      client = createKartonClient<TestAppType>({
        webSocketPath: `ws://localhost:${port}`,
        procedures: { notify: async () => {} },
        fallbackState: { counter: 0, message: '' },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const handler = async (amount: number, clientId: string) => amount * 2;
      server.registerServerProcedureHandler('increment', handler);

      // Verify handler works
      const result1 = await client.serverProcedures.increment(5);
      expect(result1).toBe(10);

      // Remove handler
      server.removeServerProcedureHandler('increment');

      // Should throw error when calling removed procedure
      await expect(client.serverProcedures.increment(5)).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should throw KartonProcedureError when calling procedure without handler', async () => {
      server = await createKartonServer<TestAppType>({
        initialState: {
          counter: 0,
          message: 'initial',
        },
      });

      // Create HTTP server and attach WebSocket server
      httpServer = createServer();
      const wss = server.wss as WebSocketServer;
      httpServer.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      });
      httpServer.listen(port);

      client = createKartonClient<TestAppType>({
        webSocketPath: `ws://localhost:${port}`,
        procedures: { notify: async () => {} },
        fallbackState: { counter: 0, message: '' },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Try to call procedure without handler
      await expect(client.serverProcedures.increment(5)).rejects.toThrow(
        /procedure.*not.*registered/i
      );
    });

    it('should provide clear error message with procedure path', async () => {
      server = await createKartonServer<TestAppType>({
        initialState: {
          counter: 0,
          message: 'initial',
        },
      });

      // Create HTTP server and attach WebSocket server
      httpServer = createServer();
      const wss = server.wss as WebSocketServer;
      httpServer.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      });
      httpServer.listen(port);

      client = createKartonClient<TestAppType>({
        webSocketPath: `ws://localhost:${port}`,
        procedures: { notify: async () => {} },
        fallbackState: { counter: 0, message: '' },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      try {
        await client.serverProcedures.nested.getData();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('nested.getData');
        expect((error as Error).message).toContain('not registered');
      }
    });
  });

  describe('Mixed registration scenarios', () => {
    it('should support both initial and lazy registration', async () => {
      const initialHandler = vi.fn(async (clientId: string) => 'initial data');

      // Create server with some initial procedures
      server = await createKartonServer<TestAppType>({
        initialState: {
          counter: 0,
          message: 'initial',
        },
        procedures: {
          nested: {
            getData: initialHandler,
          },
        } as any,
      });

      // Register additional handler lazily
      const lazyHandler = vi.fn(async (amount: number, clientId: string) => amount * 2);
      server.registerServerProcedureHandler('increment', lazyHandler);

      // Create HTTP server and attach WebSocket server
      httpServer = createServer();
      const wss = server.wss as WebSocketServer;
      httpServer.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      });
      httpServer.listen(port);

      client = createKartonClient<TestAppType>({
        webSocketPath: `ws://localhost:${port}`,
        procedures: { notify: async () => {} },
        fallbackState: { counter: 0, message: '' },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Both procedures should work
      const dataResult = await client.serverProcedures.nested.getData();
      expect(dataResult).toBe('initial data');
      expect(initialHandler).toHaveBeenCalled();

      const incrementResult = await client.serverProcedures.increment(7);
      expect(incrementResult).toBe(14);
      expect(lazyHandler).toHaveBeenCalled();
    });

    it('should allow overriding initial procedures after removal', async () => {
      const initialHandler = vi.fn(async (amount: number, clientId: string) => amount);

      server = await createKartonServer<TestAppType>({
        initialState: {
          counter: 0,
          message: 'initial',
        },
        procedures: {
          increment: initialHandler,
        } as any,
      });

      // Create HTTP server and attach WebSocket server
      httpServer = createServer();
      const wss = server.wss as WebSocketServer;
      httpServer.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      });
      httpServer.listen(port);

      client = createKartonClient<TestAppType>({
        webSocketPath: `ws://localhost:${port}`,
        procedures: { notify: async () => {} },
        fallbackState: { counter: 0, message: '' },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Initial handler works
      const result1 = await client.serverProcedures.increment(5);
      expect(result1).toBe(5);

      // Remove and replace
      server.removeServerProcedureHandler('increment');
      const newHandler = vi.fn(async (amount: number, clientId: string) => amount * 10);
      server.registerServerProcedureHandler('increment', newHandler);

      // New handler should be used
      const result2 = await client.serverProcedures.increment(5);
      expect(result2).toBe(50);
      expect(initialHandler).toHaveBeenCalledTimes(1);
      expect(newHandler).toHaveBeenCalledTimes(1);
    });
  });
});