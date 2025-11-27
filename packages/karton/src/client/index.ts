export { createKartonClient } from './karton-client.js';
export { WebSocketTransport } from '../transports/websocket/client.js';
export {
  ElectronClientTransport,
  type MessagePortProxy,
} from '../transports/electron/client.js';

export type {
  KartonClient,
  KartonClientConfig,
  KartonClientProcedures,
  KartonClientProcedureImplementations,
  CreateKartonClient,
} from '../shared/types.js';

export { KartonRPCException, KartonRPCErrorReason } from '../shared/types.js';
