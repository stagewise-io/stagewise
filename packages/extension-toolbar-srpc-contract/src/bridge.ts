import {
  createSRPCClientBridge,
  createSRPCServerBridge,
} from '@stagewise/srpc';
import type { Server } from 'node:http';
import type {
  ExtensionServesContract,
  ToolbarServesContract,
} from './contract';

export function getExtensionBridge(server: Server) {
  return createSRPCServerBridge<ExtensionServesContract, ToolbarServesContract>(
    server,
  );
}

export function getToolbarBridge(url: string) {
  return createSRPCClientBridge<ToolbarServesContract, ExtensionServesContract>(
    url,
  );
}
