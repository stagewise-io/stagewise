import {
  type CreateBridgeContract,
  createBridgeContract,
} from '@stagewise/srpc';
import { z } from 'zod';
export type Contract = CreateBridgeContract<{
  server: {
    triggerAgentPrompt: {
      request: { prompt: string };
      response: { result: { success: boolean; error?: string } };
      update: { updateText: string };
    };
  };
}>;

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
