import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WebSocketConnection,
  ConnectionState
} from '../../src/shared/websocket-connection.js';
import { createStateSyncMessage, serializeMessage } from '../../src/shared/websocket-messages.js';

describe('WebSocket Connection', () => {
  let mockWebSocket: any;
  let connection: WebSocketConnection;

  beforeEach(() => {
    mockWebSocket = {
      readyState: 1, // OPEN
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
  });

  afterEach(() => {
    if (connection) {
      connection.close();
    }
  });

  describe('Connection State', () => {
    it('should initialize with CONNECTING state', () => {
      connection = new WebSocketConnection(mockWebSocket);
      expect(connection.getState()).toBe(ConnectionState.CONNECTING);
    });

    it('should transition to OPEN when WebSocket opens', () => {
      connection = new WebSocketConnection(mockWebSocket);
      
      const openHandler = mockWebSocket.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'open'
      )?.[1];
      
      openHandler?.();
      expect(connection.getState()).toBe(ConnectionState.OPEN);
    });

    it('should transition to CLOSED when WebSocket closes', () => {
      connection = new WebSocketConnection(mockWebSocket);
      
      const closeHandler = mockWebSocket.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'close'
      )?.[1];
      
      closeHandler?.();
      expect(connection.getState()).toBe(ConnectionState.CLOSED);
    });

    it('should check if connection is open', () => {
      connection = new WebSocketConnection(mockWebSocket);
      
      const openHandler = mockWebSocket.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'open'
      )?.[1];
      
      openHandler?.();
      expect(connection.isOpen()).toBe(true);
      
      const closeHandler = mockWebSocket.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'close'
      )?.[1];
      
      closeHandler?.();
      expect(connection.isOpen()).toBe(false);
    });
  });

  describe('Message Sending', () => {
    it('should serialize and send messages', async () => {
      connection = new WebSocketConnection(mockWebSocket);
      
      // Wait for initial state check
      await new Promise(resolve => setTimeout(resolve, 0));
      
      const message = createStateSyncMessage({ test: 'data' });
      connection.send(message);
      
      expect(mockWebSocket.send).toHaveBeenCalledTimes(1);
      expect(typeof mockWebSocket.send.mock.calls[0][0]).toBe('string');
    });

    it('should queue messages when connection is not open', () => {
      mockWebSocket.readyState = 0; // CONNECTING
      connection = new WebSocketConnection(mockWebSocket);
      
      const message1 = createStateSyncMessage({ test: 1 });
      const message2 = createStateSyncMessage({ test: 2 });
      
      connection.send(message1);
      connection.send(message2);
      
      expect(mockWebSocket.send).not.toHaveBeenCalled();
      
      const openHandler = mockWebSocket.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'open'
      )?.[1];
      
      mockWebSocket.readyState = 1; // OPEN
      openHandler?.();
      
      expect(mockWebSocket.send).toHaveBeenCalledTimes(2);
    });

    it('should throw error when sending on closed connection', () => {
      mockWebSocket.readyState = 3; // CLOSED
      connection = new WebSocketConnection(mockWebSocket);
      
      const closeHandler = mockWebSocket.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'close'
      )?.[1];
      closeHandler?.();
      
      const message = createStateSyncMessage({ test: 'data' });
      expect(() => connection.send(message)).toThrow('Connection is closed');
    });
  });

  describe('Message Receiving', () => {
    it('should deserialize and emit received messages', () => {
      connection = new WebSocketConnection(mockWebSocket);
      
      const messageHandler = vi.fn();
      connection.onMessage(messageHandler);
      
      const messageEventHandler = mockWebSocket.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'message'
      )?.[1];
      
      const testMessage = createStateSyncMessage({ test: 'data' });
      const serialized = serializeMessage(testMessage);
      
      messageEventHandler?.({ data: serialized });
      
      expect(messageHandler).toHaveBeenCalledTimes(1);
      expect(messageHandler).toHaveBeenCalledWith(testMessage);
    });

    it('should handle multiple message listeners', () => {
      connection = new WebSocketConnection(mockWebSocket);
      
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      connection.onMessage(handler1);
      connection.onMessage(handler2);
      
      const messageEventHandler = mockWebSocket.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'message'
      )?.[1];
      
      const testMessage = createStateSyncMessage({ test: 'data' });
      const serialized = serializeMessage(testMessage);
      
      messageEventHandler?.({ data: serialized });
      
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should allow removing message listeners', () => {
      connection = new WebSocketConnection(mockWebSocket);
      
      const handler = vi.fn();
      const removeListener = connection.onMessage(handler);
      
      const messageEventHandler = mockWebSocket.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'message'
      )?.[1];
      
      const testMessage = createStateSyncMessage({ test: 'data' });
      const serialized = serializeMessage(testMessage);
      
      messageEventHandler?.({ data: serialized });
      expect(handler).toHaveBeenCalledTimes(1);
      
      removeListener();
      
      messageEventHandler?.({ data: serialized });
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
    });
  });

  describe('Connection Events', () => {
    it('should emit open event', () => {
      connection = new WebSocketConnection(mockWebSocket);
      
      const openHandler = vi.fn();
      connection.onOpen(openHandler);
      
      const openEventHandler = mockWebSocket.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'open'
      )?.[1];
      
      openEventHandler?.();
      
      expect(openHandler).toHaveBeenCalledTimes(1);
    });

    it('should emit close event', () => {
      connection = new WebSocketConnection(mockWebSocket);
      
      const closeHandler = vi.fn();
      connection.onClose(closeHandler);
      
      const closeEventHandler = mockWebSocket.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'close'
      )?.[1];
      
      closeEventHandler?.({ code: 1000, reason: 'Normal closure' });
      
      expect(closeHandler).toHaveBeenCalledTimes(1);
      expect(closeHandler).toHaveBeenCalledWith({ code: 1000, reason: 'Normal closure' });
    });

    it('should emit error event', () => {
      connection = new WebSocketConnection(mockWebSocket);
      
      const errorHandler = vi.fn();
      connection.onError(errorHandler);
      
      const errorEventHandler = mockWebSocket.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'error'
      )?.[1];
      
      const error = new Error('Connection failed');
      errorEventHandler?.(error);
      
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenCalledWith(error);
    });
  });

  describe('Connection Cleanup', () => {
    it('should clean up event listeners on close', () => {
      connection = new WebSocketConnection(mockWebSocket);
      connection.close();
      
      expect(mockWebSocket.close).toHaveBeenCalledTimes(1);
      expect(mockWebSocket.removeEventListener).toHaveBeenCalled();
    });

    it('should clear message queue on close', () => {
      mockWebSocket.readyState = 0; // CONNECTING
      connection = new WebSocketConnection(mockWebSocket);
      
      const message = createStateSyncMessage({ test: 'data' });
      connection.send(message);
      
      connection.close();
      
      const openHandler = mockWebSocket.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'open'
      )?.[1];
      
      mockWebSocket.readyState = 1; // OPEN
      openHandler?.();
      
      expect(mockWebSocket.send).not.toHaveBeenCalled();
    });
  });
});