import { createSRPCClientBridge } from '@stagewise/srpc/client';
import { contract } from './contract';

export function getToolbarBridge(url: string) {
  return createSRPCClientBridge(url, contract);
}
