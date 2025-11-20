import { describe, it, expect, vi } from 'vitest';
import { createKartonClient } from '../../src/client/karton-client.js';
import type { Transport, KartonMessage } from '../../src/shared/transport.js';

class MockTransport implements Transport {
  public sentMessages: KartonMessage[] = [];
  public onMessageHandlers: ((message: KartonMessage) => void)[] = [];
  public openHandlers: (() => void)[] = [];
  public _isOpen = false;

  send(message: KartonMessage) {
    this.sentMessages.push(message);
  }
  onMessage(handler: (message: KartonMessage) => void) {
    this.onMessageHandlers.push(handler);
    return () => {};
  }
  isOpen() { return this._isOpen; }
  onOpen(handler: () => void) {
    this.openHandlers.push(handler);
    return () => {};
  }
  onClose(handler: any) { return () => {}; }
  onError(handler: any) { return () => {}; }
  close() { this._isOpen = false; }

  // Test helper
  simulateOpen() {
    this._isOpen = true;
    this.openHandlers.forEach(h => h());
  }
}

describe('Karton Client with Custom Transport', () => {
  it('should use provided transport', () => {
    const transport = new MockTransport();
    const client = createKartonClient<any>({
      transport,
      procedures: {},
      fallbackState: { foo: 'bar' }
    });

    expect(client.isConnected).toBe(false);
    transport.simulateOpen();
    expect(client.isConnected).toBe(true);
  });
});

