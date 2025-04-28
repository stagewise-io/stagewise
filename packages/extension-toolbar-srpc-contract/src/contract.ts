import type { CreateBridgeContract } from '@stagewise/srpc';

export type Contract = CreateBridgeContract<{
  server: {
    triggerAgentPrompt: {
      request: { prompt: string };
      response: { result: { success: boolean; error?: string } };
      update: { updateText: string };
    };
  };
}>;
