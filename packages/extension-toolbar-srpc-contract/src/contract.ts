import type { BridgeContract, RpcMethodContract } from '@stagewise/srpc';

export interface ToolbarServesContract extends BridgeContract {
  test: RpcMethodContract<
    { prompt: string },
    { result: { success: boolean; error?: string } },
    { updateText: string }
  >;
  getCurrentUrl: RpcMethodContract<undefined, { url: string }, never>;
}

export interface ExtensionServesContract extends BridgeContract {
  triggerAgentPrompt: RpcMethodContract<
    { prompt: string },
    { result: { success: boolean; error?: string } },
    { updateText: string }
  >;
}
