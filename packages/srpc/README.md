# SRPC: Schema-validated RPC over WebSocket

A TypeScript framework for type-safe, schema-validated Remote Procedure Calls (RPC) over WebSocket connections. Built with Zod for runtime validation and strong TypeScript type inference.

## Features

- 🔒 **Type Safety**: Full TypeScript support with type inference from Zod schemas
- ✅ **Runtime Validation**: Automatic request/response validation using Zod schemas
- 🔄 **Bi-directional Communication**: Both client and server can call methods on each other
- 📝 **Progress Updates**: Support for sending progress updates during long-running operations
- 🏃 **Auto-Reconnection**: Client automatically reconnects on connection loss
- 📚 **Developer-Friendly**: Clear error messages and type hints in your IDE

## Installation

```bash
npm install @stagewise/srpc zod
```

## Quick Start

1. Define your RPC contract using Zod schemas:

```typescript
import { z } from 'zod';
import { createBridgeContract } from '@stagewise/srpc';

const contract = createBridgeContract({
  server: {
    triggerAgentPrompt: {
      request: z.object({
        prompt: z.string(),
        options: z.object({
          temperature: z.number().min(0).max(1).optional(),
        }).optional(),
      }),
      response: z.object({
        result: z.object({
          success: z.boolean(),
          output: z.string().optional(),
        }),
      }),
      update: z.object({
        updateText: z.string(),
        progress: z.number().min(0).max(100).optional(),
      }),
    },
  },
  client: {
    getCurrentUrl: {
      request: z.object({}).optional(),
      response: z.object({
        url: z.string().url(),
        title: z.string().optional(),
      }),
    },
  },
});
```

2. Set up the server:

```typescript
import http from 'node:http';
import { createSRPCServerBridge } from '@stagewise/srpc';

const httpServer = http.createServer();
const server = createSRPCServerBridge(httpServer, contract);

server.register({
  triggerAgentPrompt: async (request, { sendUpdate }) => {
    console.log('Processing prompt:', request.prompt);

    // Send progress updates
    await sendUpdate({
      updateText: 'Processing...',
      progress: 50,
    });

    return {
      result: {
        success: true,
        output: 'Example response',
      },
    };
  },
});

httpServer.listen(3000);
```

3. Set up the client:

```typescript
import { createSRPCClientBridge } from '@stagewise/srpc';

const client = createSRPCClientBridge('ws://localhost:3000', contract);

// Implement client-side methods
client.register({
  getCurrentUrl: async () => ({
    url: 'https://example.com',
    title: 'Example Page',
  }),
});

// Connect and make calls
await client.connect();

const result = await client.call.triggerAgentPrompt(
  {
    prompt: 'Hello, agent!',
    options: { temperature: 0.7 },
  },
  {
    onUpdate: (update) => {
      console.log('Progress:', update.updateText, update.progress);
    },
  },
);

console.log('Result:', result);
```

## Features in Detail

### Type Safety

The framework provides full TypeScript type inference from your Zod schemas:

- Method names are type-checked
- Request/response payloads are type-checked
- Update messages are type-checked
- IDE autocompletion for all types

### Runtime Validation

All messages are validated at runtime using Zod:

- Incoming requests are validated before reaching your handler
- Outgoing responses are validated before being sent
- Update messages are validated before being sent
- Clear error messages when validation fails

### Progress Updates

Long-running operations can send progress updates:

```typescript
server.register({
  longOperation: async (request, { sendUpdate }) => {
    await sendUpdate({ progress: 0, status: 'Starting...' });
    // ... do work ...
    await sendUpdate({ progress: 50, status: 'Processing...' });
    // ... do more work ...
    return { success: true };
  },
});
```

### Auto-Reconnection

The client automatically handles reconnection:

```typescript
const client = createSRPCClientBridge('ws://localhost:3000', contract, {
  reconnectDelay: 1000, // milliseconds
  maxReconnectAttempts: 5,
});
```

## Error Handling

The framework provides clear error messages for various failure cases:

- Schema validation errors include the exact validation failure
- Connection errors include relevant network details
- Method not found errors include the attempted method name
- Implementation errors include the original error stack

## Examples

Check out the `examples/` directory for more detailed examples:

- Full application: `examples/zod-example.ts`