import {
  createSRPCClientBridge,
  createSRPCServerBridge,
} from '@stagewise/srpc';
import type { Server } from 'node:http';
import type { BridgeContract } from '@stagewise/srpc/dist/src/type-helpers';

export function getExtensionBridge(server: Server) {
  return createSRPCServerBridge<BridgeContract>(server);
}

export function getToolbarBridge(url: string) {
  return createSRPCClientBridge<BridgeContract>(url);
}
