import {
  type CreateBridgeContract,
  type RpcMethodContract,
  createSRPCClientBridge,
  createSRPCServerBridge,
} from '..';
import http from 'node:http';

// Step 2: Define your complete API contract
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

// Step 3: Set up a server
const httpServer = http.createServer();
const server = createSRPCServerBridge<Contract>(httpServer);

// Step 4: Implement and register methods
server.register({
  executePrompt: async (request, sendUpdate) => {
    sendUpdate({ updateText: 'Executing prompt...' });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { result: { success: true } };
  },
  getSelectedModel: async () => {
    // Return the current model and provider
    // const model = agent.getSelectedModel();
    return { model: 'gpt-4', provider: 'openai' };
  },
  changeAgentMode: async (request) => {
    // Change the agent mode to the requested mode
    // agent.changeMode(request.mode);
    return { result: { success: true } };
  },
});

// Start listening
httpServer.listen(3000, () => {
  console.log('Server running on port 3000');
});

// Step 5: Create a client
async function runClient() {
  const browserBridge = createSRPCClientBridge<Contract>('ws://localhost:3000');
  await browserBridge.connect();

  browserBridge.register({
    getCurrentUrl: async () => {
      return { url: 'https://www.google.com' };
    },
    getConsoleLogs: async (request) => {
      return { logs: ['log1', 'log2', 'log3'] };
    },
  });

  try {
    const response = await browserBridge.call.executePrompt(
      {
        prompt: 'Hello, world!',
      },
      (update) => {
        console.log('Update:', update);
      },
    );

    console.log('Response of the agent call:', response);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    browserBridge.close();
    httpServer.close();
  }
}

// Run the client after a short delay to ensure server is ready
setTimeout(runClient, 1000);
