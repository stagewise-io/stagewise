import { describe, it, expect, vi, beforeEach } from 'vitest';
import { produce, enablePatches, Patch } from 'immer';
import {
  StateManager,
  ClientStateManager
} from '../../src/shared/state-sync.js';
import { createStateSyncMessage, createStatePatchMessage } from '../../src/shared/websocket-messages.js';
import type { WebSocketMessage } from '../../src/shared/types.js';

// Enable Immer patches
enablePatches();

describe('State Synchronization', () => {
  describe('StateManager (Server-side)', () => {
    let stateManager: StateManager<{ counter: number; users: string[] }>;
    let mockBroadcast: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockBroadcast = vi.fn();
      stateManager = new StateManager(
        { counter: 0, users: [] },
        mockBroadcast
      );
    });

    it('should initialize with provided state', () => {
      expect(stateManager.getState()).toEqual({ counter: 0, users: [] });
    });

    it('should update state and broadcast patches', () => {
      const newState = stateManager.setState((draft) => {
        draft.counter = 42;
        draft.users.push('Alice');
      });

      expect(newState).toEqual({ counter: 42, users: ['Alice'] });
      expect(stateManager.getState()).toEqual({ counter: 42, users: ['Alice'] });
      
      expect(mockBroadcast).toHaveBeenCalledTimes(1);
      const message = mockBroadcast.mock.calls[0][0] as WebSocketMessage;
      expect(message.type).toBe('state_patch');
      
      const patches = (message.data as any).patch as Patch[];
      expect(patches).toHaveLength(2);
    });

    it('should not broadcast when no changes are made', () => {
      const newState = stateManager.setState((draft) => {
        // No changes
      });

      expect(newState).toEqual({ counter: 0, users: [] });
      expect(mockBroadcast).not.toHaveBeenCalled();
    });

    it('should handle complex state mutations', () => {
      stateManager.setState((draft) => {
        draft.users = ['Alice', 'Bob', 'Charlie'];
      });

      const newState = stateManager.setState((draft) => {
        draft.users[1] = 'Robert';
        draft.users.splice(2, 1);
        draft.counter = draft.users.length;
      });

      expect(newState).toEqual({
        counter: 2,
        users: ['Alice', 'Robert']
      });

      expect(mockBroadcast).toHaveBeenCalledTimes(2);
    });

    it('should provide read-only state access', () => {
      const state = stateManager.getState();
      expect(() => {
        (state as any).counter = 100;
      }).toThrow();
    });

    it('should generate full state sync message', () => {
      stateManager.setState((draft) => {
        draft.counter = 10;
        draft.users = ['User1'];
      });

      const syncMessage = stateManager.getFullStateSyncMessage();
      expect(syncMessage.type).toBe('state_sync');
      expect((syncMessage.data as any).state).toEqual({
        counter: 10,
        users: ['User1']
      });
    });

    it('should handle nested state structures', () => {
      interface NestedState {
        level1: {
          level2: {
            value: number;
            items: string[];
          };
        };
      }

      const nestedManager = new StateManager<NestedState>(
        { level1: { level2: { value: 0, items: [] } } },
        mockBroadcast
      );

      nestedManager.setState((draft) => {
        draft.level1.level2.value = 42;
        draft.level1.level2.items.push('item1');
      });

      expect(nestedManager.getState()).toEqual({
        level1: {
          level2: {
            value: 42,
            items: ['item1']
          }
        }
      });
    });
  });

  describe('ClientStateManager', () => {
    let clientManager: ClientStateManager<{ counter: number; users: string[] }>;

    beforeEach(() => {
      clientManager = new ClientStateManager({ counter: 0, users: [] });
    });

    it('should initialize with fallback state', () => {
      expect(clientManager.getState()).toEqual({ counter: 0, users: [] });
    });

    it('should apply full state sync', () => {
      const syncMessage = createStateSyncMessage({
        counter: 42,
        users: ['Alice', 'Bob']
      });

      clientManager.handleMessage(syncMessage);

      expect(clientManager.getState()).toEqual({
        counter: 42,
        users: ['Alice', 'Bob']
      });
    });

    it('should apply state patches', () => {
      // First set initial state
      clientManager.handleMessage(createStateSyncMessage({
        counter: 10,
        users: ['Alice']
      }));

      // Apply patches
      const patches: Patch[] = [
        { op: 'replace', path: ['counter'], value: 20 },
        { op: 'add', path: ['users', 1], value: 'Bob' }
      ];

      clientManager.handleMessage(createStatePatchMessage(patches));

      expect(clientManager.getState()).toEqual({
        counter: 20,
        users: ['Alice', 'Bob']
      });
    });

    it('should handle multiple sequential patches', () => {
      clientManager.handleMessage(createStateSyncMessage({
        counter: 0,
        users: []
      }));

      const patches1: Patch[] = [
        { op: 'add', path: ['users', 0], value: 'User1' }
      ];
      clientManager.handleMessage(createStatePatchMessage(patches1));

      const patches2: Patch[] = [
        { op: 'add', path: ['users', 1], value: 'User2' },
        { op: 'replace', path: ['counter'], value: 2 }
      ];
      clientManager.handleMessage(createStatePatchMessage(patches2));

      expect(clientManager.getState()).toEqual({
        counter: 2,
        users: ['User1', 'User2']
      });
    });

    it('should provide read-only state access', () => {
      const state = clientManager.getState();
      expect(() => {
        (state as any).counter = 100;
      }).toThrow();
    });

    it('should ignore non-state messages', () => {
      const initialState = clientManager.getState();
      
      const rpcMessage = {
        type: 'rpc_call',
        data: { rpcCallId: '123', procedurePath: ['test'], parameters: [] }
      } as WebSocketMessage;
      
      clientManager.handleMessage(rpcMessage);
      
      expect(clientManager.getState()).toEqual(initialState);
    });

    it('should handle state reset via sync message', () => {
      // Set some initial state
      clientManager.handleMessage(createStateSyncMessage({
        counter: 100,
        users: ['Many', 'Users']
      }));

      // Reset with new sync
      clientManager.handleMessage(createStateSyncMessage({
        counter: 0,
        users: []
      }));

      expect(clientManager.getState()).toEqual({
        counter: 0,
        users: []
      });
    });

    it('should handle array operations in patches', () => {
      clientManager.handleMessage(createStateSyncMessage({
        counter: 0,
        users: ['Alice', 'Bob', 'Charlie']
      }));

      const patches: Patch[] = [
        { op: 'remove', path: ['users', 1] },
        { op: 'replace', path: ['users', 1], value: 'David' }
      ];

      clientManager.handleMessage(createStatePatchMessage(patches));

      expect(clientManager.getState()).toEqual({
        counter: 0,
        users: ['Alice', 'David']
      });
    });
  });
});