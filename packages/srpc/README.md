# sRPC 🚀

> Strongly-typed, bidirectional RPC over WebSockets with real-time streaming capabilities

## Why sRPC? 🤔

In modern web applications, real-time bidirectional communication is crucial for creating responsive, interactive experiences. Traditional REST APIs fall short when you need:

- 🔄 Real-time updates from server to client
- 📱 Live collaboration features
- 📊 Real-time data streaming

sRPC combines the simplicity of RPC with the power of WebSockets, all wrapped in a fully type-safe package. No more dealing with complex WebSocket event handling or manual type checking!

## Features ✨

- 🔒 **Fully Type-Safe**: End-to-end TypeScript types for requests, responses, and streaming updates
- 🔗 **Bidirectional Communication**: Both client and server can expose and call methods
- 📡 **Real-time Streaming**: Built-in support for progress updates and live data streams
- 🔄 **Auto-Reconnection**: Robust connection handling with configurable retry policies
- 🎯 **Simple API**: Intuitive method-based calling convention
- 📦 **Zero Dependencies**: Lightweight and fast

## Usage Example 🚀

### 1. Define Your Contract

```typescript
import { CreateBridgeContract, RpcMethodContract } from 'srpc';

// Define a single contract type for both server and client methods
type Contract = CreateBridgeContract<{
  server: {
    executePrompt: RpcMethodContract<
      { prompt: string },
      { result: { success: boolean; error?: string } },
      { updateText: string }
    >;
    getSelectedModel: RpcMethodContract<
      never,
      { model: string; provider: string },
      never
    >;
    changeAgentMode: RpcMethodContract<
      { mode: 'agent' | 'ask' },
      { result: { success: boolean; error?: string } },
      never
    >;
  };
  client: {
    getCurrentUrl: RpcMethodContract<never, { url: string }, never>;
    getConsoleLogs: RpcMethodContract<
      { amount: string },
      { logs: string[] },
      never
    >;
  };
}>;
```

### 2. Server Implementation

```typescript
import { createSRPCServerBridge } from 'srpc';
import http from 'node:http';

const httpServer = http.createServer();
const agentBridge = createSRPCServerBridge<Contract>(httpServer);

agentBridge.register({
  executePrompt: async (request, sendUpdate) => {
    sendUpdate({ updateText: 'Executing prompt...' });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { result: { success: true } };
  },
  getSelectedModel: async () => {
    return { model: 'gpt-4', provider: 'openai' };
  },
  changeAgentMode: async (request) => {
    return { result: { success: true } };
  },
});

httpServer.listen(3000);
```

### 3. Client Implementation

```typescript
const browserBridge = createSRPCClientBridge<Contract>('ws://localhost:3000');

// Register client methods
browserBridge.register({
  getCurrentUrl: async () => {
    return { url: 'https://www.google.com' };
  },
  getConsoleLogs: async (request) => {
    return { logs: ['log1', 'log2', 'log3'] };
  },
});

// Connect and make calls
await browserBridge.connect();

try {
  const response = await browserBridge.call.executePrompt(
    {
      prompt: 'Hello, world!',
    },
    (update) => {
      console.log('Agent updates:', update);
    },
  );

  console.log('Response:', response);
} catch (error) {
  console.error('Error:', error);
}
```

## Advanced Usage 🛠️

### Custom Configuration

```typescript
const client = createSRPCClientBridge<Contract>('ws://localhost:3000', {
  // Reconnection settings
  maxReconnectAttempts: 5,
  reconnectDelay: 1000,  // ms
  
  // Request timeout
  requestTimeout: 30000, // ms
  
  // Custom WebSocket options
  webSocketOptions: {
    headers: {
      'Authorization': 'Bearer token'
    }
  }
});
```