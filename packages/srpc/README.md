# sRPC

A strongly-typed, bidirectional RPC library for WebSocket connections with support for streaming updates.

## Features

- 🔒 **Strong typing** for requests, responses, and streaming updates
- 📡 **WebSocket transport** for bidirectional communication
- 📊 **Streaming updates** for progress reporting and real-time data
- 🔄 **Automatic reconnection** with configurable retry policies
- 📝 **Simple API** with method chaining for an intuitive developer experience

## Basic Usage

### 1. Define Your Contract

```typescript
import { BridgeContract, RpcMethodContract } from '@your-org/srpc';

// Define your API contract with typed methods
interface ServerContract extends BridgeContract {
  greet: RpcMethodContract<
    { name: string },            // Request type
    { message: string },         // Response type
    { status: string, progress: number }  // Update type (for streaming)
  >;
  
  getData: RpcMethodContract<
    { id: number },
    { data: string }
  >;
}

// If client doesn't expose methods, use an empty contract
interface ClientContract extends BridgeContract {}
```

### 2. Server Implementation

```typescript
import { createSRPCServer } from '@your-org/srpc';
import http from 'node:http';

// Create HTTP server
const httpServer = http.createServer();
const server = createSRPCServer<ServerContract, ClientContract>(httpServer);

// Implement and register methods
server.register({
  greet: async (request, sendUpdate) => {
    // Send progress updates
    sendUpdate({ status: 'Starting', progress: 0 });
    await new Promise(resolve => setTimeout(resolve, 500));
    
    sendUpdate({ status: 'Processing', progress: 50 });
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return { message: `Hello, ${request.name}!` };
  },
  
  getData: async (request) => {
    return { data: `Data for ID ${request.id}` };
  }
});

// Start the server
httpServer.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### 3. Client Usage

```typescript
import { createSRPCClient } from '@your-org/srpc';

async function main() {
  // Create and connect the client
  const client = createSRPCClient<ClientContract, ServerContract>('ws://localhost:3000');
  await client.connect();
  
  try {
    // Call method with property access syntax and handle streaming updates
    const response = await client.call.greet({ name: 'World' }, (update) => {
      console.log(`Progress: ${update.status} - ${update.progress}%`);
    });
    
    console.log(response.message); // "Hello, World!"
    
    // Call another method without streaming updates
    const data = await client.call.getData({ id: 123 });
    console.log(data.data); // "Data for ID 123"
  } finally {
    client.close();
  }
}

main().catch(console.error);
```

## Advanced Configuration

The library supports various configuration options for reconnection behavior and timeouts:

```typescript
const client = createSRPCClient<ClientContract, ServerContract>(
  'ws://localhost:3000',
  {
    maxReconnectAttempts: 5,    // Maximum reconnection attempts
    reconnectDelay: 1000,       // Delay between reconnections (ms)
    requestTimeout: 30000,      // Request timeout (ms)
  }
);
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 