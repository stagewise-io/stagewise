import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createKartonClient } from '../../src/client/karton-client.js';
import type { KartonClient } from '../../src/shared/types.js';

// Mock WebSocket
global.WebSocket = vi.fn() as any;

interface TestAppType {
  state: {
    counter: number;
    users: string[];
  };
  serverProcedures: {
    increment: () => Promise<void>;
    getCounter: () => Promise<number>;
  };
  clientProcedures: {
    notify: (message: string) => Promise<void>;
  };
}

describe('Karton Client', () => {
  let mockWebSocket: any;
  let client: KartonClient<TestAppType>;

  beforeEach(() => {
    mockWebSocket = {
      readyState: 0, // CONNECTING
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    (global.WebSocket as any).mockImplementation(() => mockWebSocket);
  });

  describe('Client Creation', () => {
    it('should create client with fallback state', () => {
      client = createKartonClient<TestAppType>({
        webSocketPath: 'ws://localhost:3000/ws',
        procedures: {
          notify: async (message) => {
            console.log('Notified:', message);
          }
        },
        fallbackState: {
          counter: 0,
          users: []
        }
      });

      expect(client.state).toEqual({
        counter: 0,
        users: []
      });
      expect(client.isConnected).toBe(false);
    });

    it('should connect to WebSocket on creation', () => {
      client = createKartonClient<TestAppType>({
        webSocketPath: 'ws://localhost:3000/ws',
        procedures: {
          notify: async (message) => {}
        },
        fallbackState: {
          counter: 0,
          users: []
        }
      });

      expect(global.WebSocket).toHaveBeenCalledWith('ws://localhost:3000/ws');
    });

    it('should provide server procedures proxy', () => {
      client = createKartonClient<TestAppType>({
        webSocketPath: 'ws://localhost:3000/ws',
        procedures: {
          notify: async (message) => {}
        },
        fallbackState: {
          counter: 0,
          users: []
        }
      });

      expect(typeof client.serverProcedures.increment).toBe('function');
      expect(typeof client.serverProcedures.getCounter).toBe('function');
    });
  });

  describe('Connection State', () => {
    it('should update connection state on open', () => {
      client = createKartonClient<TestAppType>({
        webSocketPath: 'ws://localhost:3000/ws',
        procedures: {
          notify: async (message) => {}
        },
        fallbackState: {
          counter: 0,
          users: []
        }
      });

      expect(client.isConnected).toBe(false);

      // Simulate WebSocket open
      const openHandler = mockWebSocket.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'open'
      )?.[1];

      mockWebSocket.readyState = 1; // OPEN
      openHandler?.();

      expect(client.isConnected).toBe(true);
    });

    it('should update connection state on close', () => {
      client = createKartonClient<TestAppType>({
        webSocketPath: 'ws://localhost:3000/ws',
        procedures: {
          notify: async (message) => {}
        },
        fallbackState: {
          counter: 0,
          users: []
        }
      });

      // First open
      const openHandler = mockWebSocket.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'open'
      )?.[1];
      mockWebSocket.readyState = 1;
      openHandler?.();

      expect(client.isConnected).toBe(true);

      // Then close
      const closeHandler = mockWebSocket.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'close'
      )?.[1];
      mockWebSocket.readyState = 3;
      closeHandler?.({ code: 1000, reason: 'Normal closure' });

      expect(client.isConnected).toBe(false);
    });
  });

  describe('State Synchronization', () => {
    it('should handle state sync messages', () => {
      client = createKartonClient<TestAppType>({
        webSocketPath: 'ws://localhost:3000/ws',
        procedures: {
          notify: async (message) => {}
        },
        fallbackState: {
          counter: 0,
          users: []
        }
      });

      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'message'
      )?.[1];

      // Send state sync message
      const syncMessage = {
        json: {
          type: 'state_sync',
          data: {
            state: {
              counter: 42,
              users: ['Alice', 'Bob']
            }
          }
        }
      };

      messageHandler?.({ data: JSON.stringify(syncMessage) });

      expect(client.state).toEqual({
        counter: 42,
        users: ['Alice', 'Bob']
      });
    });

    it('should handle state patch messages', () => {
      client = createKartonClient<TestAppType>({
        webSocketPath: 'ws://localhost:3000/ws',
        procedures: {
          notify: async (message) => {}
        },
        fallbackState: {
          counter: 10,
          users: ['Alice']
        }
      });

      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'message'
      )?.[1];

      // First sync to set initial state
      const syncMessage = {
        json: {
          type: 'state_sync',
          data: {
            state: {
              counter: 10,
              users: ['Alice']
            }
          }
        }
      };
      messageHandler?.({ data: JSON.stringify(syncMessage) });

      // Then apply patch
      const patchMessage = {
        json: {
          type: 'state_patch',
          data: {
            patch: [
              { op: 'replace', path: ['counter'], value: 20 },
              { op: 'add', path: ['users', 1], value: 'Bob' }
            ]
          }
        }
      };
      messageHandler?.({ data: JSON.stringify(patchMessage) });

      expect(client.state).toEqual({
        counter: 20,
        users: ['Alice', 'Bob']
      });
    });
  });

  describe('Reconnection', () => {
    it('should attempt reconnection on disconnect', async () => {
      vi.useFakeTimers();

      client = createKartonClient<TestAppType>({
        webSocketPath: 'ws://localhost:3000/ws',
        procedures: {
          notify: async (message) => {}
        },
        fallbackState: {
          counter: 0,
          users: []
        }
      });

      const initialCallCount = (global.WebSocket as any).mock.calls.length;

      // Simulate disconnect
      const closeHandler = mockWebSocket.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'close'
      )?.[1];
      closeHandler?.({ code: 1000, reason: 'Normal closure' });

      // Advance timer to trigger reconnection
      vi.advanceTimersByTime(500);

      expect((global.WebSocket as any).mock.calls.length).toBe(initialCallCount + 1);

      vi.useRealTimers();
    });
  });
});