import { WebSocket } from 'ws';

// Polyfill WebSocket for Node.js environment
// This is needed because the ws package provides a WebSocket implementation
// that's compatible with the browser WebSocket API
if (typeof globalThis.WebSocket === 'undefined') {
  // @ts-expect-error - WebSocket from ws package is compatible with browser WebSocket
  globalThis.WebSocket = WebSocket;
}
