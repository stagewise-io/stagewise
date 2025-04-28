import {
  type BridgeContract,
  type RpcMethodContract,
  createSRPCClient,
  createSRPCServer,
} from '../src';
import http from 'node:http';

// Step 1: Define your method contracts
interface GreetingRequest {
  name: string;
}

interface GreetingResponse {
  message: string;
}

interface GreetingProgress {
  status: string;
  progress: number;
}

// Step 2: Define your complete API contract
interface ServerContract extends BridgeContract {
  greet: RpcMethodContract<GreetingRequest, GreetingResponse, GreetingProgress>;
  getData: RpcMethodContract<{ id: number }, { data: string }>;
}

// Empty client contract since client doesn't expose methods in this example
interface ClientContract extends BridgeContract {}

// Step 3: Set up a server
const httpServer = http.createServer();
const server = createSRPCServer<ServerContract, ClientContract>(httpServer);

// Step 4: Implement and register methods
server.register({
  greet: async (request, sendUpdate) => {
    // Simulate progress updates
    sendUpdate({ status: 'Starting', progress: 0 });

    await new Promise((resolve) => setTimeout(resolve, 500));
    sendUpdate({ status: 'Processing', progress: 50 });

    await new Promise((resolve) => setTimeout(resolve, 500));
    sendUpdate({ status: 'Finishing', progress: 90 });

    await new Promise((resolve) => setTimeout(resolve, 500));
    return { message: `Hello, ${request.name}!` };
  },

  getData: async (request) => {
    return { data: `Data for ID ${request.id}` };
  },
});

// Start listening
httpServer.listen(3000, () => {
  console.log('Server running on port 3000');
});

// Step 5: Create a client
async function runClient() {
  const client = createSRPCClient<ClientContract, ServerContract>(
    'ws://localhost:3000',
  );
  await client.connect();

  try {
    // OLD STYLE:
    // const response = await client.call('greet', { name: 'John' }, (update) => {
    //   console.log('Update received:', update);
    // });

    // NEW STYLE:
    // Using the new method calling syntax
    const response = await client.call.greet({ name: 'John' }, (update) => {
      console.log('Update received:', update);
    });

    console.log('Response:', response);

    // Another example with getData
    const dataResponse = await client.call.getData({ id: 123 });
    console.log('Data response:', dataResponse);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.close();
    httpServer.close();
  }
}

// Run the client after a short delay to ensure server is ready
setTimeout(runClient, 1000);
