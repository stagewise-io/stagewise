import {
  createSRPCClientBridge,
  createSRPCServerBridge,
} from '@stagewise/srpc';
import type { Server } from 'node:http';
import { contract } from './contract';

export function getExtensionBridge(server: Server) {
  return createSRPCServerBridge(server, contract);
}

export function getToolbarBridge(url: string) {
  return createSRPCClientBridge(url, contract);
}
