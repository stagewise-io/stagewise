import { createBridgeContract } from '@stagewise/srpc';
import { z } from 'zod';

// The toolbar needs to implement a discovery-mechanism to check if the extension is running and find the correct port
// The extension also needs to implement a discovery-mechanism to find the correct toolbar.
export const DEFAULT_PORT = 5746; // This is the default port for the extension's RPC and MCP servers; if occupied, the extension will take the next available port (5747, 5748, etc., up to 5756
export const PING_ENDPOINT = '/ping/stagewise'; // Will be used by the toolbar to check if the extension is running and find the correct port
export const PING_RESPONSE = 'stagewise'; // The response to the ping request

export const contract = createBridgeContract({
  server: {
    triggerAgentPrompt: {
      request: z.object({
        prompt: z.string(),
      }),
      response: z.object({
        result: z.object({
          success: z.boolean(),
          error: z.string().optional(),
          output: z.string().optional(),
        }),
      }),
      update: z.object({
        updateText: z.string(),
      }),
    },
  },
});
