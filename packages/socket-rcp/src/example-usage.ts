import { createServer } from 'node:http';
import {
  createTypedServer,
  createTypedClient,
  type BridgeContract,
} from './type-helpers';

// Define the contract for what the Extension serves
interface ExtensionServerContract extends BridgeContract {
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

// Define the contract for what the Extension consumes
interface ExtensionClientContract extends BridgeContract {
  // Define the testReadibility method that the Extension can call
  testReadibility: {
    request: { text: string };
    response: { score: number; feedback: string };
    update: never;
  };
}

// Server-side (Extension) setup
async function setupExtension() {
  const httpServer = createServer();
  // The Extension serves ExtensionServerContract and consumes ExtensionClientContract
  const bridge = createTypedServer<
    ExtensionServerContract,
    ExtensionClientContract
  >(httpServer);

  // Register method implementations for what the Extension serves
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

// Client-side (Toolbar) setup
async function setupToolbar() {
  // The Toolbar serves ExtensionClientContract and consumes ExtensionServerContract
  const bridge = createTypedClient<
    ExtensionClientContract,
    ExtensionServerContract
  >('ws://localhost:3000');

  // Connect to the extension
  await bridge.connect();
  console.log('Connected to extension');

  // Register method implementations for what the Toolbar serves
  bridge.register({
    testReadibility: async (request) => {
      // Simple readability test implementation
      const score = Math.random() * 100;
      return {
        score,
        feedback: `Text readability score: ${score.toFixed(2)}`,
      };
    },
  });

  // Example: Call the triggerCodingAgent method (which the Toolbar consumes)
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

  // Example: Get console logs (which the Toolbar consumes)
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
