import {
  createSRPCClientBridge,
  createSRPCServerBridge,
} from '@stagewise/srpc';
import type { Server } from 'node:http';
import type {
  ExtensionServesContract,
  ToolbarServesContract,
} from './contract';

export const getExtensionBridge = (server: Server) =>
  createSRPCServerBridge<ExtensionServesContract, ToolbarServesContract>(
    server,
  );

export const getToolbarBridge = (url: string) =>
  createSRPCClientBridge<ToolbarServesContract, ExtensionServesContract>(url);
