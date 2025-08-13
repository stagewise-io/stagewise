# Karton

State synchronization and RPC library for JavaScript applications using WebSockets.

## Features

- **State Synchronization**: Real-time state synchronization between server and clients
- **RPC Support**: Type-safe remote procedure calls in both directions
- **Multi-Client**: Support for multiple concurrent client connections
- **React Integration**: Built-in React hooks and components
- **TypeScript**: Full TypeScript support with type inference
- **Auto-Reconnection**: Automatic reconnection on connection loss

## Installation

```bash
npm install @stagewise/karton
# or
pnpm add @stagewise/karton
```

## Quick Start

### Define Shared Types

```typescript
// types.ts
interface MyApp {
  state: {
    counter: number;
    users: string[];
  };
  serverProcedures: {
    increment: () => Promise<void>;
    addUser: (name: string) => Promise<void>;
  };
  clientProcedures: {
    notify: (message: string) => Promise<void>;
  };
}
```

### Server Setup

```typescript
import { createKartonServer } from '@stagewise/karton/server';
import express from 'express';
import { createServer } from 'http';

const app = express();
const httpServer = createServer(app);

const server = await createKartonServer<MyApp>({
  procedures: {
    increment: async (callingClientId) => {
      server.setState(draft => {
        draft.counter++;
      });
    },
    addUser: async (name, callingClientId) => {
      server.setState(draft => {
        draft.users.push(name);
      });
    }
  },
  initialState: {
    counter: 0,
    users: []
  }
});

// Hook the upgrade handler of the karton created websockert server into your local webserver
httpServer.on('upgrade', (req, socket, head) => {
  if(req.url === '/path-for-karton-ws-connection') {
    server.wss.handleUpgrade(request, socket, head, (ws: any) => {
      server.wss.emit('connection', ws, request);
    })
  }
})

httpServer.listen(3000);
```

### Client Setup (Vanilla JS)

```typescript
import { createKartonClient } from '@stagewise/karton/client';

const client = createKartonClient<MyApp>({
  webSocketPath: 'ws://localhost:3000/path-for-karton-ws-connection',
  procedures: {
    notify: async (message) => {
      console.log('Server notification:', message);
    }
  },
  fallbackState: {
    counter: 0,
    users: []
  }
});

// Read state
console.log(client.state.counter);

// Call server procedures
await client.serverProcedures.increment();
await client.serverProcedures.addUser('Alice');
```

### React Client Setup

```typescript
import { createKartonReactClient } from '@stagewise/karton/react/client';

const [KartonProvider, useKarton] = createKartonReactClient<MyApp>({
  webSocketPath: 'ws://localhost:3000/path-for-karton-ws-connection',
  procedures: {
    notify: async (message) => {
      console.log('Server notification:', message);
    }
  },
  fallbackState: {
    counter: 0,
    users: []
  }
});

// In your app
function App() {
  return (
    <KartonProvider>
      <Counter />
    </KartonProvider>
  );
}

// In your components
function Counter() {
  const counter = useKartonState(s => s.counter);
  const increment = useKartonProcedure(p => p.increment);
  
  return (
    <div>
      <p>Counter: {counter}</p>
      <button onClick={() => increment()}>Increment</button>
    </div>
  );
}
```

## License

MIT
