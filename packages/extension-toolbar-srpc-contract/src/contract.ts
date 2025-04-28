import type { BridgeContract, RpcMethodContract } from '@stagewise/srpc';

export interface ToolbarServesContract extends BridgeContract {}

export interface ExtensionServesContract extends BridgeContract {
  triggerAgentPrompt: RpcMethodContract<
    { prompt: string },
    { result: { success: boolean; error?: string } },
    { updateText: string }
  >;
}
