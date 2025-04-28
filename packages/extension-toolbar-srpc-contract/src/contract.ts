import type { CreateBridgeContract } from '@stagewise/srpc';

export type ToolbarServesContract = CreateBridgeContract<null>;

export type ExtensionServesContract = CreateBridgeContract<{
  triggerAgentPrompt: {
    request: { prompt: string };
    response: { result: { success: boolean; error?: string } };
    update: { updateText: string };
  };
}>;
