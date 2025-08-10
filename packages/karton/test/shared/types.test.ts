import { describe, it, expect } from 'vitest';
import type {
  AppType,
  KartonState,
  KartonServerProcedures,
  KartonClientProcedures,
  KartonServerProcedureImplementations,
  KartonClientProcedureImplementations,
  WebSocketMessage,
  RPCCallData,
  RPCReturnData,
  RPCExceptionData,
  StateSyncData,
  StatePatchData,
  ExtractProcedures,
  AddClientIdToImplementations
} from '../../src/shared/types.js';
import { KartonRPCException, KartonRPCErrorReason } from '../../src/shared/types.js';

describe('Core Types', () => {
  describe('AppType', () => {
    it('should enforce required state property', () => {
      type ValidAppType = {
        state: {
          counter: number;
          users: string[];
        };
      };

      type TestAppType = AppType<ValidAppType>;
      
      const appType: TestAppType = {
        state: {
          counter: 0,
          users: []
        }
      };

      expect(appType.state).toBeDefined();
    });

    it('should allow optional serverProcedures', () => {
      type ValidAppType = {
        state: { value: number };
        serverProcedures: {
          increment: () => Promise<void>;
          getValue: () => Promise<number>;
        };
      };

      type TestAppType = AppType<ValidAppType>;
      
      const appType: TestAppType = {
        state: { value: 0 },
        serverProcedures: {
          increment: async () => {},
          getValue: async () => 42
        }
      };

      expect(appType.serverProcedures).toBeDefined();
    });

    it('should allow nested procedures', () => {
      type ValidAppType = {
        state: { value: number };
        serverProcedures: {
          math: {
            add: (a: number, b: number) => Promise<number>;
            subtract: (a: number, b: number) => Promise<number>;
          };
        };
      };

      type TestAppType = AppType<ValidAppType>;
      
      const appType: TestAppType = {
        state: { value: 0 },
        serverProcedures: {
          math: {
            add: async (a, b) => a + b,
            subtract: async (a, b) => a - b
          }
        }
      };

      expect(appType.serverProcedures?.math).toBeDefined();
    });
  });

  describe('KartonRPCException', () => {
    it('should create exception with CONNECTION_LOST reason', () => {
      const error = new KartonRPCException(
        KartonRPCErrorReason.CONNECTION_LOST,
        ['testProcedure']
      );

      expect(error.name).toBe('KartonRPCException');
      expect(error.reason).toBe(KartonRPCErrorReason.CONNECTION_LOST);
      expect(error.procedurePath).toEqual(['testProcedure']);
      expect(error.message).toContain('Connection lost');
    });

    it('should create exception with CLIENT_NOT_FOUND reason', () => {
      const error = new KartonRPCException(
        KartonRPCErrorReason.CLIENT_NOT_FOUND,
        ['clientProcedure'],
        'client-123'
      );

      expect(error.reason).toBe(KartonRPCErrorReason.CLIENT_NOT_FOUND);
      expect(error.clientId).toBe('client-123');
      expect(error.message).toContain('Client \'client-123\' not found');
    });

    it('should create exception with SERVER_UNAVAILABLE reason', () => {
      const error = new KartonRPCException(
        KartonRPCErrorReason.SERVER_UNAVAILABLE,
        ['serverProcedure', 'nested']
      );

      expect(error.reason).toBe(KartonRPCErrorReason.SERVER_UNAVAILABLE);
      expect(error.procedurePath).toEqual(['serverProcedure', 'nested']);
      expect(error.message).toContain('Server unavailable');
    });

    it('should properly format nested procedure paths', () => {
      const error = new KartonRPCException(
        KartonRPCErrorReason.CONNECTION_LOST,
        ['api', 'v1', 'users', 'create']
      );

      expect(error.message).toContain('api.v1.users.create');
    });
  });

  describe('WebSocket Messages', () => {
    it('should handle rpc_call message', () => {
      const message: WebSocketMessage = {
        type: 'rpc_call',
        data: {
          rpcCallId: 'uuid-123',
          procedurePath: ['math', 'add'],
          parameters: [1, 2]
        } as RPCCallData
      };

      expect(message.type).toBe('rpc_call');
      expect((message.data as RPCCallData).rpcCallId).toBe('uuid-123');
    });

    it('should handle rpc_return message', () => {
      const message: WebSocketMessage = {
        type: 'rpc_return',
        data: {
          rpcCallId: 'uuid-123',
          value: 42
        } as RPCReturnData
      };

      expect(message.type).toBe('rpc_return');
      expect((message.data as RPCReturnData).value).toBe(42);
    });

    it('should handle rpc_exception message', () => {
      const error = new Error('Test error');
      const message: WebSocketMessage = {
        type: 'rpc_exception',
        data: {
          rpcCallId: 'uuid-123',
          error: error
        } as RPCExceptionData
      };

      expect(message.type).toBe('rpc_exception');
      expect((message.data as RPCExceptionData).error).toBe(error);
    });

    it('should handle state_sync message', () => {
      const state = { counter: 42, users: ['alice', 'bob'] };
      const message: WebSocketMessage = {
        type: 'state_sync',
        data: {
          state
        } as StateSyncData
      };

      expect(message.type).toBe('state_sync');
      expect((message.data as StateSyncData).state).toEqual(state);
    });

    it('should handle state_patch message', () => {
      const patch = [{ op: 'replace', path: '/counter', value: 43 }];
      const message: WebSocketMessage = {
        type: 'state_patch',
        data: {
          patch
        } as StatePatchData
      };

      expect(message.type).toBe('state_patch');
      expect((message.data as StatePatchData).patch).toEqual(patch);
    });
  });

  describe('Helper Types', () => {
    it('should extract procedures correctly', () => {
      type TestApp = {
        state: { value: number };
        serverProcedures: {
          increment: () => Promise<void>;
          nested: {
            getValue: () => Promise<number>;
          };
        };
      };

      type ServerProcs = ExtractProcedures<TestApp['serverProcedures']>;
      
      const procs: ServerProcs = {
        increment: async () => {},
        nested: {
          getValue: async () => 42
        }
      };

      expect(procs).toBeDefined();
    });

    it('should add clientId to server procedure implementations', () => {
      type TestApp = {
        state: { value: number };
        serverProcedures: {
          test: (arg: string) => Promise<void>;
        };
      };

      type ServerImplementation = AddClientIdToImplementations<TestApp['serverProcedures']>;
      
      const impl: ServerImplementation = {
        test: async (arg: string, callingClientId: string) => {
          expect(typeof arg).toBe('string');
          expect(typeof callingClientId).toBe('string');
        }
      };

      expect(impl).toBeDefined();
    });
  });
});