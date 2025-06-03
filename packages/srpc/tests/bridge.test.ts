import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketRpcBridge } from '../src/core';

// Create a concrete implementation of the abstract WebSocketRpcBridge for testing
class TestWebSocketRpcBridge extends WebSocketRpcBridge {
  protected reconnect(): void {
    // Simple implementation for testing
  }

  // Expose protected methods for testing
  public exposeHandleMessage(message: any): void {
    this.handleMessage(message);
  }

  public exposeHandleRequest(message: any): Promise<void> {
    return this.handleRequest(message);
  }

  public exposeHandleResponse(id: string, payload: any): void {
    this.handleResponse(id, payload);
  }

  public exposeHandleUpdate(id: string, payload: any): void {
    this.handleUpdate(id, payload);
  }

  public exposeHandleError(id: string, error: string): void {
    this.handleError(id, error);
  }

  public exposeSendResponse(id: string, method: string, payload: any): void {
    this.sendResponse(id, method, payload);
  }

  public exposeSendUpdate(id: string, method: string, payload: any): void {
    this.sendUpdate(id, method, payload);
  }

  public exposeSendError(id: string, errorMessage: string): void {
    this.sendError(id, errorMessage);
  }

  // Set websocket directly for testing
  public setWebSocket(ws: any): void {
    this.ws = ws;
  }

  // Expose pending requests for testing
  public getPendingRequests(): Map<string, any> {
    return this.pendingRequests;
  }

  // Expose methods for testing
  public getMethods(): Record<string, any> {
    return this.methods;
  }

  // Set methods for testing
  public setMethods(methods: any): void {
    this.methods = methods;
  }

  // Expose setupWebSocketHandlers for testing
  public exposeSetupWebSocketHandlers(ws: any): void {
    this.setupWebSocketHandlers(ws);
  }
}

describe('WebSocketRpcBridge', () => {
  let bridge: TestWebSocketRpcBridge;
  let mockWs: any;

  beforeEach(() => {
    bridge = new TestWebSocketRpcBridge({
      requestTimeout: 100,
      maxReconnectAttempts: 3,
      reconnectDelay: 50,
    });

    // Create a mock WebSocket
    mockWs = {
      send: vi.fn(),
      close: vi.fn(),
      onmessage: null,
      onclose: null,
      onerror: null,
    };

    bridge.setWebSocket(mockWs);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Method Registration', () => {
    it('should register methods correctly', () => {
      const handler = async () => ({ success: true });

      bridge.register({
        testMethod: handler,
      });

      const methods = bridge.getMethods();
      expect(methods.testMethod).toBeDefined();
      expect(methods.testMethod.handler).toBe(handler);
    });
  });

  describe('Message Handling', () => {
    it('should handle request messages correctly', async () => {
      // Register a test method
      const handler = vi.fn().mockResolvedValue({ result: 'success' });
      bridge.register({
        testMethod: handler,
      });

      // Create a request message
      const requestMessage = {
        id: '123',
        messageType: 'request',
        method: 'testMethod',
        payload: { foo: 'bar' },
      };

      // Process the request
      await bridge.exposeHandleRequest(requestMessage);

      // Check that the handler was called with the payload and a sendUpdate function
      expect(handler).toHaveBeenCalledWith(
        { foo: 'bar' },
        expect.any(Function),
      );

      // Check that WebSocket.send was called with appropriate message
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"messageType":"response"'),
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"id":"123"'),
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"method":"testMethod"'),
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"result":"success"'),
      );
    });

    it('should handle error for non-existent methods', async () => {
      // Create a request for non-existent method
      const requestMessage = {
        id: '456',
        messageType: 'request',
        method: 'nonExistentMethod',
        payload: {},
      };

      // Process the request
      await bridge.exposeHandleRequest(requestMessage);

      // Check the WebSocket.send was called with an error message
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"messageType":"error"'),
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"id":"456"'),
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('not found'),
      );
    });

    it('should handle errors thrown by method handlers', async () => {
      // Register a test method that throws an error
      bridge.register({
        errorMethod: async () => {
          throw new Error('Test error');
        },
      });

      // Create a request message
      const requestMessage = {
        id: '789',
        messageType: 'request',
        method: 'errorMethod',
        payload: {},
      };

      // Process the request
      await bridge.exposeHandleRequest(requestMessage);

      // Check the WebSocket.send was called with an error message
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"messageType":"error"'),
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"id":"789"'),
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('Test error'),
      );
    });
  });

  describe('Update Handling', () => {
    it('should handle updates correctly', () => {
      // Set up a pending request with an update handler
      const updateHandler = vi.fn();
      const pendingRequest = {
        resolve: vi.fn(),
        reject: vi.fn(),
        timeout: setTimeout(() => {}, 1000),
        onUpdate: updateHandler,
      };

      bridge.getPendingRequests().set('update-id', pendingRequest);

      // Process an update
      bridge.exposeHandleUpdate('update-id', { progress: 50 });

      // Check that the update handler was called
      expect(updateHandler).toHaveBeenCalledWith({ progress: 50 });

      // Clean up timeout
      clearTimeout(pendingRequest.timeout);
    });

    it('should warn but not crash if update received for unknown request', () => {
      // Mock console.warn
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      // Process an update for non-existent request
      bridge.exposeHandleUpdate('unknown-id', { progress: 75 });

      // Check that a warning was logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('unknown request ID'),
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Response Handling', () => {
    it('should resolve pending requests on response', () => {
      // Set up a pending request
      const resolve = vi.fn();
      const pendingRequest = {
        resolve,
        reject: vi.fn(),
        timeout: setTimeout(() => {}, 1000),
      };

      bridge.getPendingRequests().set('response-id', pendingRequest);

      // Process a response
      bridge.exposeHandleResponse('response-id', { data: 'test' });

      // Check that the promise was resolved with the payload
      expect(resolve).toHaveBeenCalledWith({ data: 'test' });

      // Check that the request was removed from pending
      expect(bridge.getPendingRequests().has('response-id')).toBe(false);

      // Clean up timeout
      clearTimeout(pendingRequest.timeout);
    });

    it('should warn but not crash if response received for unknown request', () => {
      // Mock console.warn
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      // Process a response for non-existent request
      bridge.exposeHandleResponse('unknown-id', { data: 'test' });

      // Check that a warning was logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('unknown request ID'),
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should reject pending requests on error', () => {
      // Set up a pending request
      const reject = vi.fn();
      const pendingRequest = {
        resolve: vi.fn(),
        reject,
        timeout: setTimeout(() => {}, 1000),
      };

      bridge.getPendingRequests().set('error-id', pendingRequest);

      // Process an error
      bridge.exposeHandleError('error-id', 'Test error message');

      // Check that the promise was rejected with the error
      expect(reject).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Test error message',
        }),
      );

      // Check that the request was removed from pending
      expect(bridge.getPendingRequests().has('error-id')).toBe(false);

      // Clean up timeout
      clearTimeout(pendingRequest.timeout);
    });
  });

  describe('Message Dispatch', () => {
    it('should dispatch messages to the correct handlers', async () => {
      // Create direct spies on the handle methods
      const handleRequest = vi
        .spyOn(bridge as any, 'handleRequest')
        .mockImplementation(async () => {});
      const handleResponse = vi
        .spyOn(bridge as any, 'handleResponse')
        .mockImplementation(() => {});
      const handleUpdate = vi
        .spyOn(bridge as any, 'handleUpdate')
        .mockImplementation(() => {});
      const handleError = vi
        .spyOn(bridge as any, 'handleError')
        .mockImplementation(() => {});

      // Test request message directly
      const requestMessage = {
        id: '1',
        messageType: 'request',
        method: 'test',
        payload: {},
      };
      await bridge.exposeHandleMessage(requestMessage);
      expect(handleRequest).toHaveBeenCalledWith(requestMessage);

      // Test response message directly
      const responseMessage = {
        id: '2',
        messageType: 'response',
        method: 'test',
        payload: {},
      };
      bridge.exposeHandleMessage(responseMessage);
      expect(handleResponse).toHaveBeenCalledWith('2', {});

      // Test update message directly
      const updateMessage = {
        id: '3',
        messageType: 'update',
        method: 'test',
        payload: {},
      };
      bridge.exposeHandleMessage(updateMessage);
      expect(handleUpdate).toHaveBeenCalledWith('3', {});

      // Test error message directly
      const errorMessage = {
        id: '4',
        messageType: 'error',
        error: { message: 'Test error' },
      };
      bridge.exposeHandleMessage(errorMessage);
      expect(handleError).toHaveBeenCalledWith('4', 'Test error');
    });

    it('should warn on unknown message type', () => {
      // Mock console.warn
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      // Process a message with unknown type
      bridge.exposeHandleMessage({
        id: '5',
        messageType: 'unknown',
      });

      // Check that a warning was logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown message type'),
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Send Methods', () => {
    it('should send responses correctly', () => {
      bridge.exposeSendResponse('resp-id', 'testMethod', { result: 'success' });

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"messageType":"response"'),
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"id":"resp-id"'),
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"method":"testMethod"'),
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"result":"success"'),
      );
    });

    it('should send updates correctly', () => {
      bridge.exposeSendUpdate('update-id', 'testMethod', { progress: 50 });

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"messageType":"update"'),
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"id":"update-id"'),
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"method":"testMethod"'),
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"progress":50'),
      );
    });

    it('should send errors correctly', () => {
      bridge.exposeSendError('err-id', 'Test error message');

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"messageType":"error"'),
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"id":"err-id"'),
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Test error message"'),
      );
    });

    it('should throw error if WebSocket is not connected', () => {
      // Set WebSocket to null
      bridge.setWebSocket(null);

      expect(() => {
        bridge.exposeSendResponse('test-id', 'method', {});
      }).toThrow('WebSocket is not connected');

      expect(() => {
        bridge.exposeSendUpdate('test-id', 'method', {});
      }).toThrow('WebSocket is not connected');

      expect(() => {
        bridge.exposeSendError('test-id', 'Error');
      }).toThrow('WebSocket is not connected');
    });
  });

  describe('WebSocket Event Handlers', () => {
    it('should set up WebSocket handlers correctly', () => {
      // Create a new mock WebSocket
      const newMockWs = {
        onmessage: null,
        onclose: null,
        onerror: null,
        send: vi.fn(),
        close: vi.fn(),
      };

      // Set up handlers
      bridge.setWebSocket(newMockWs);
      bridge.exposeSetupWebSocketHandlers(newMockWs);

      // Check that handlers were set
      expect(newMockWs.onmessage).toBeTypeOf('function');
      expect(newMockWs.onclose).toBeTypeOf('function');
      expect(newMockWs.onerror).toBeTypeOf('function');
    });
  });
});
