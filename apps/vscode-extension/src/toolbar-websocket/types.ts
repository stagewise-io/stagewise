import { LogEntry } from './handlers/console-logs';

// --- Define specific Payloads for Server -> Client Requests ---

// Example: getURL
interface GetUrlRequestPayload { /* No payload needed from server */ }
interface GetUrlResponsePayload { url: string; }

// Example: getElementText
interface GetElementTextRequestPayload { selector: string; }
interface GetElementTextResponsePayload { text: string | null; }

// Example: Prompt result
interface ProcessPromptResponsePayload { success: boolean; result?: any; }

// Example: Log batch acknowledgement
interface LogBatchAckPayload { success: boolean; receivedCount: number; }

// --- Central Mapping from Command Name to Payloads ---
export interface ServerRequestMap {
  'getURL': { request: GetUrlRequestPayload; response: GetUrlResponsePayload };
  'getElementText': { request: GetElementTextRequestPayload; response: GetElementTextResponsePayload };
  'processPrompt': { request: { prompt: string }; response: ProcessPromptResponsePayload };
  'logBatch': { request: { logs: LogEntry[] }; response: LogBatchAckPayload };
}

// --- Union Type for valid command names ---
export type ServerCommand = keyof ServerRequestMap;

// --- Define Client -> Server Message Payloads ---
interface ClientPromptPayload { prompt: string; }
interface ClientLogBatchPayload { logs: LogEntry[]; }

// --- Refined WebSocket Message Types ---

// Messages initiated by the Client
export type ClientToServerMessage =
  | { type: 'prompt', id: string, payload: ClientPromptPayload }
  | { type: 'logBatch', id: string, payload: ClientLogBatchPayload }
  | { type: 'response', id: string, payload: any }
  | { type: 'errorResponse', id: string, error: string };

// Messages initiated by the Server
export type ServerGetRequestMessage = {
  [K in ServerCommand]: {
    type: 'getRequest';
    id: string;
    command: K;
    payload: ServerRequestMap[K]['request'];
  }
}[ServerCommand];

export type ServerToClientMessage =
  | ServerGetRequestMessage
  | { type: 'ack', id: string, success: boolean, error?: string }
  | { type: 'info', message: string };

// Combined type for easier handling in generic message handlers
export type WebSocketMessage = ClientToServerMessage | ServerToClientMessage;

// Type for pending requests
export type PendingRequest<T = any> = {
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  timeout: NodeJS.Timeout;
}; 