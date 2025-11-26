export { createKartonServer } from './karton-server.js';
export { WebSocketServerTransport } from '../transports/websocket-server.js';
export {
  ElectronServerTransport,
  type ElectronServerTransportConfig,
  type MessagePortMain,
} from '../transports/electron-server.js';

export type {
  KartonServer,
  KartonServerConfig,
  KartonServerProcedures,
  KartonServerProcedureImplementations,
  CreateKartonServer,
} from '../shared/types.js';

export { KartonRPCException, KartonRPCErrorReason } from '../shared/types.js';
