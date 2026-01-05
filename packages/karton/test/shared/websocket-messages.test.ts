import { describe, it, expect } from 'vitest';
import {
  createRPCCallMessage,
  createRPCReturnMessage,
  createRPCExceptionMessage,
  createStateSyncMessage,
  createStatePatchMessage,
  isRPCCallMessage,
  isRPCReturnMessage,
  isRPCExceptionMessage,
  isStateSyncMessage,
  isStatePatchMessage
} from '../../src/shared/messages.js';
import type { WebSocketMessage } from '../../src/shared/types.js';

describe('WebSocket Messages', () => {
  describe('Message Creation', () => {
    it('should create RPC call message', () => {
      const message = createRPCCallMessage(
        'call-123',
        'math.add',
        [1, 2]
      );

      expect(message.type).toBe('rpc_call');
      expect(message.data).toEqual({
        rpcCallId: 'call-123',
        procedurePath: 'math.add',
        parameters: [1, 2]
      });
    });

    it('should create RPC return message', () => {
      const message = createRPCReturnMessage('call-123', 42);

      expect(message.type).toBe('rpc_return');
      expect(message.data).toEqual({
        rpcCallId: 'call-123',
        value: 42
      });
    });

    it('should create RPC exception message', () => {
      const error = new Error('Test error');
      const message = createRPCExceptionMessage('call-123', error);

      expect(message.type).toBe('rpc_exception');
      const data = message.data as any;
      expect(data.rpcCallId).toBe('call-123');
      expect(data.error.message).toBe('Test error');
      expect(data.error.name).toBe('Error');
    });

    it('should create state sync message', () => {
      const state = { counter: 0, users: [] };
      const message = createStateSyncMessage(state);

      expect(message.type).toBe('state_sync');
      expect(message.data).toEqual({ state });
    });

    it('should create state patch message', () => {
      const patch = [
        { op: 'replace', path: ['counter'], value: 1 }
      ];
      const message = createStatePatchMessage(patch as any);

      expect(message.type).toBe('state_patch');
      expect(message.data).toEqual({ patch });
    });
  });

  describe('Message Type Guards', () => {
    it('should identify RPC call messages', () => {
      const callMessage = createRPCCallMessage('id', 'test', []);
      const otherMessage = createRPCReturnMessage('id', null);

      expect(isRPCCallMessage(callMessage)).toBe(true);
      expect(isRPCCallMessage(otherMessage)).toBe(false);
    });

    it('should identify RPC return messages', () => {
      const returnMessage = createRPCReturnMessage('id', 42);
      const otherMessage = createRPCCallMessage('id', 'test', []);

      expect(isRPCReturnMessage(returnMessage)).toBe(true);
      expect(isRPCReturnMessage(otherMessage)).toBe(false);
    });

    it('should identify RPC exception messages', () => {
      const exceptionMessage = createRPCExceptionMessage('id', new Error());
      const otherMessage = createRPCReturnMessage('id', null);

      expect(isRPCExceptionMessage(exceptionMessage)).toBe(true);
      expect(isRPCExceptionMessage(otherMessage)).toBe(false);
    });

    it('should identify state sync messages', () => {
      const syncMessage = createStateSyncMessage({});
      const otherMessage = createRPCReturnMessage('id', null);

      expect(isStateSyncMessage(syncMessage)).toBe(true);
      expect(isStateSyncMessage(otherMessage)).toBe(false);
    });

    it('should identify state patch messages', () => {
      const patchMessage = createStatePatchMessage([]);
      const otherMessage = createStateSyncMessage({});

      expect(isStatePatchMessage(patchMessage)).toBe(true);
      expect(isStatePatchMessage(otherMessage)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should preserve error properties in exception messages', () => {
      const error = new Error('Custom error');
      (error as any).code = 'CUSTOM_CODE';
      (error as any).statusCode = 500;

      const message = createRPCExceptionMessage('id', error);
      const errorData = (message.data as any).error;

      expect(errorData.message).toBe('Custom error');
      expect(errorData.code).toBe('CUSTOM_CODE');
      expect(errorData.statusCode).toBe(500);
    });
  });
});
