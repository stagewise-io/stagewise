import { describe, it, expect, vi } from 'vitest';
import { createKartonServer } from '../../src/server/karton-server.js';
import type { KartonServer } from '../../src/shared/types.js';
import type { Transport, ServerTransport, KartonMessage } from '../../src/shared/transport.js';

// Mock Transport Implementation
class MockTransport implements Transport {
  public onMessageCallback: ((message: KartonMessage) => void) | undefined;
  public onCloseCallback: ((event?: { code: number; reason: string }) => void) | undefined;
  public connectionId: string;
  public _isOpen = true;

  constructor(id: string) {
    this.connectionId = id;
  }

  getConnectionId() { return this.connectionId; }
  send(message: KartonMessage) {}
  onMessage(handler: (message: KartonMessage) => void) {
    this.onMessageCallback = handler;
    return () => {};
  }
  close() {
    this._isOpen = false;
    this.onCloseCallback?.({ code: 1000, reason: 'Mock close' });
  }
  isOpen() { return this._isOpen; }
  onOpen(handler: () => void) { return () => {}; }
  onClose(handler: (event?: { code: number; reason: string }) => void) {
    this.onCloseCallback = handler;
    return () => {};
  }
  onError(handler: (error: Error) => void) { return () => {}; }
  startTransport() {}
}

// Mock Server Transport Implementation
class MockServerTransport implements ServerTransport {
  public onConnectionCallback: ((clientTransport: Transport) => void) | undefined;
  
  onConnection(handler: (clientTransport: Transport) => void) {
    this.onConnectionCallback = handler;
  }
  async close() {}
}

type TestAppType = {
  state: {
    counter: number;
  };
  serverProcedures: {};
  clientProcedures: {};
};

describe('KartonServer Disconnect Handler', () => {
  it('should invoke registered onClose handlers when a client disconnects', async () => {
    const mockServerTransport = new MockServerTransport();
    
    const server = await createKartonServer<TestAppType>({
      initialState: { counter: 0 },
      transport: mockServerTransport,
    });

    const closeHandler = vi.fn();
    server.onClose(closeHandler);

    // Simulate client connection
    const clientTransport = new MockTransport('client-1');
    mockServerTransport.onConnectionCallback?.(clientTransport);

    // Simulate disconnect
    clientTransport.close();

    expect(closeHandler).toHaveBeenCalledTimes(1);
    expect(closeHandler).toHaveBeenCalledWith('client-1');
  });

  it('should allow unregistering onClose handlers', async () => {
    const mockServerTransport = new MockServerTransport();
    
    const server = await createKartonServer<TestAppType>({
      initialState: { counter: 0 },
      transport: mockServerTransport,
    });

    const closeHandler = vi.fn();
    const unregister = server.onClose(closeHandler);
    unregister();

    // Simulate client connection
    const clientTransport = new MockTransport('client-1');
    mockServerTransport.onConnectionCallback?.(clientTransport);

    // Simulate disconnect
    clientTransport.close();

    expect(closeHandler).not.toHaveBeenCalled();
  });

  it('should handle multiple handlers', async () => {
    const mockServerTransport = new MockServerTransport();
    
    const server = await createKartonServer<TestAppType>({
      initialState: { counter: 0 },
      transport: mockServerTransport,
    });

    const handler1 = vi.fn();
    const handler2 = vi.fn();
    
    server.onClose(handler1);
    server.onClose(handler2);

    // Simulate client connection
    const clientTransport = new MockTransport('client-1');
    mockServerTransport.onConnectionCallback?.(clientTransport);

    // Simulate disconnect
    clientTransport.close();

    expect(handler1).toHaveBeenCalledWith('client-1');
    expect(handler2).toHaveBeenCalledWith('client-1');
  });
  
  it('should not invoke handler if client not found (double close protection)', async () => {
      const mockServerTransport = new MockServerTransport();
      
      const server = await createKartonServer<TestAppType>({
        initialState: { counter: 0 },
        transport: mockServerTransport,
      });
  
      const closeHandler = vi.fn();
      server.onClose(closeHandler);
  
      // Simulate client connection
      const clientTransport = new MockTransport('client-1');
      mockServerTransport.onConnectionCallback?.(clientTransport);
  
      // Simulate disconnect
      clientTransport.close();
      
      // Simulate second disconnect event (e.g. duplicate event)
      clientTransport.onCloseCallback?.({ code: 1000, reason: 'Duplicate' });
  
      expect(closeHandler).toHaveBeenCalledTimes(1);
    });
});
