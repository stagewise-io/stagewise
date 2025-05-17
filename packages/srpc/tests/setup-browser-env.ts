// Browser environment simulation for SRPC tests
import WS from 'ws';

// Create mocked WebSocket constructor that matches browser's WebSocket interface
const MockWebSocket = WS as unknown as typeof WebSocket;

// Create proper types for window
declare global {
  var window: Window & typeof globalThis;
  var WebSocket: typeof window.WebSocket;
}

// Initialize empty window object
global.window = global.window || ({} as any);

// Mount WebSocket implementation to window
global.window.WebSocket = MockWebSocket;

// Add global WebSocket
global.WebSocket = MockWebSocket;
