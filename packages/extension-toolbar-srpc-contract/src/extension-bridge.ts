import { createSRPCServerBridge } from '@stagewise/srpc/server';
import type { Server } from 'node:http';
import { contract } from './contract';

export function getExtensionBridge(server: Server) {
  return createSRPCServerBridge(server, contract);
}
