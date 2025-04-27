import { createServer } from 'node:http';
import {
  createTypedServer,
  createTypedClient,
  type BridgeContract,
} from './type-helpers';

// Define the contract between extension and toolbar
interface CodingAgentContract extends BridgeContract {
  // Define the triggerCodingAgent method
  triggerCodingAgent: {
    request: { prompt: string };
    response: { success: boolean; result?: string };
    update: { progress: number; message: string };
  };

  // Define the getConsoleLogs method
  getConsoleLogs: {
    request: { limit: number };
    response: { logs: string[] };
    update: never; // This method doesn't use updates
  };
}

// Server-side (Extension) setup
async function setupExtension() {
  const httpServer = createServer();
  const bridge = createTypedServer<CodingAgentContract>(httpServer);

  // Register method implementations
  bridge.register({
    triggerCodingAgent: async (request, sendUpdate) => {
      console.log(`Triggering agent with prompt: ${request.prompt}`);

      // Send progress updates
      sendUpdate({ progress: 20, message: 'Analyzing prompt...' });
      await new Promise((resolve) => setTimeout(resolve, 500));

      sendUpdate({ progress: 40, message: 'Finding relevant components...' });
      await new Promise((resolve) => setTimeout(resolve, 500));

      sendUpdate({ progress: 60, message: 'Implementing changes...' });
      await new Promise((resolve) => setTimeout(resolve, 1000));

      sendUpdate({ progress: 100, message: 'Done!' });

      // Return final result
      return {
        success: true,
        result: `Successfully processed: "${request.prompt}"`,
      };
    },

    getConsoleLogs: async (request) => {
      // Get last N console logs
      const fakeLogs = [
        'INFO: Application started',
        'DEBUG: Button component loaded',
        'INFO: User clicked button',
      ];

      return { logs: fakeLogs.slice(-request.limit) };
    },
  });

  // Start the server
  httpServer.listen(3000, () => {
    console.log('Extension server running on port 3000');
  });

  return bridge;
}

// Client-side (Toolbar) usage
async function setupToolbar() {
  const bridge = createTypedClient<CodingAgentContract>('ws://localhost:3000');

  // Connect to the extension
  await bridge.connect();
  console.log('Connected to extension');

  // Register handlers for methods the toolbar implements
  bridge.register({
    // Any methods that extension might call
  });

  // Example: Call the triggerCodingAgent method
  try {
    const result = await bridge.call(
      'triggerCodingAgent',
      { prompt: 'Make this button green!' },
      (update) => {
        console.log(`Progress: ${update.progress}% - ${update.message}`);
      },
    );

    console.log('Agent result:', result);
  } catch (error) {
    console.error('Error calling agent:', error);
  }

  // Example: Get console logs
  try {
    const logs = await bridge.call('getConsoleLogs', { limit: 5 });
    console.log('Console logs:', logs);
  } catch (error) {
    console.error('Error getting logs:', error);
  }
}

// In real implementation, only one of these would run depending on context
if (process.env.CONTEXT === 'extension') {
  setupExtension();
} else {
  setupToolbar();
}
