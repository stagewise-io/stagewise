import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';
import { processPrompt } from './handlers/prompt';
import { addLogEntry, LogEntry } from './handlers/console-logs';
import { 
    WebSocketMessage, 
    ServerCommand, 
    ServerRequestMap, 
    PendingRequest,
    ClientToServerMessage,
    ServerToClientMessage,
    ServerGetRequestMessage
} from './types';

// Type declarations for ws module
declare module 'ws' {
    interface WebSocket {
        send(data: string): void;
    }
}

export class WebSocketManager {
    private wss: WebSocketServer;
    private activeConnection: WebSocket | null = null;
    private pendingRequests: Map<string, PendingRequest> = new Map();

    constructor(server: Server) {
        this.wss = new WebSocketServer({ server });

        this.wss.on('connection', (ws: WebSocket) => {
            if (this.activeConnection) {
                console.warn('New WebSocket connection attempted while one is already active. Closing new connection.');
                ws.close();
                return;
            }

            this.activeConnection = ws;
            console.log('WebSocket client connected');

            ws.on('message', async (data: Buffer) => {
                try {
                    const message = JSON.parse(data.toString()) as WebSocketMessage;
                    await this.handleMessage(message);
                } catch (error) {
                    console.error('Error handling WebSocket message:', error);
                }
            });

            ws.on('close', () => {
                console.log('WebSocket client disconnected');
                this.activeConnection = null;
                // Clear all pending requests
                this.pendingRequests.forEach(({ reject, timeout }) => {
                    clearTimeout(timeout);
                    reject(new Error('Connection closed'));
                });
                this.pendingRequests.clear();
            });

            ws.on('error', (error: Error) => {
                console.error('WebSocket error:', error);
                this.activeConnection = null;
            });
        });
    }

    private async handleMessage(message: WebSocketMessage) {
        if (this.isClientToServerMessage(message)) {
            await this.handleClientMessage(message);
        } else {
            this.handleServerMessage(message);
        }
    }

    private isClientToServerMessage(message: WebSocketMessage): message is ClientToServerMessage {
        return message.type === 'prompt' || 
               message.type === 'logBatch' || 
               message.type === 'response' || 
               message.type === 'errorResponse';
    }

    private async handleClientMessage(message: ClientToServerMessage) {
        switch (message.type) {
            case 'prompt':
                try {
                    const result = await processPrompt(message.payload.prompt);
                    this.sendResponse(message.id, { success: true, result });
                } catch (error) {
                    this.sendError(message.id, error instanceof Error ? error.message : 'Unknown error occurred');
                }
                break;
            case 'logBatch':
                try {
                    // Process each log entry individually
                    const results = message.payload.logs.map(log => addLogEntry(log));
                    this.sendResponse(message.id, { success: true, receivedCount: results.length });
                } catch (error) {
                    this.sendError(message.id, error instanceof Error ? error.message : 'Unknown error occurred');
                }
                break;
            case 'response':
            case 'errorResponse':
                this.handleResponse(message);
                break;
        }
    }

    private handleServerMessage(message: ServerToClientMessage) {
        if (message.type === 'getRequest') {
            this.handleServerRequest(message);
        } else if (message.type === 'ack') {
            // Handle acknowledgments if needed
            console.log(`Received acknowledgment for message ${message.id}: ${message.success ? 'success' : 'failed'}`);
        } else if (message.type === 'info') {
            console.log(`Server info: ${message.message}`);
        }
    }

    private handleServerRequest(message: ServerGetRequestMessage) {
        // Handle server-initiated requests
        // This would be implemented based on the specific command
        console.log(`Received server request: ${message.command}`);
    }

    private sendResponse(id: string, payload: any) {
        if (!this.activeConnection) {return;}
        this.activeConnection.send(JSON.stringify({
            type: 'response',
            id,
            payload
        }));
    }

    private sendError(id: string, error: string) {
        if (!this.activeConnection) {return;}
        this.activeConnection.send(JSON.stringify({
            type: 'errorResponse',
            id,
            error
        }));
    }

    private handleResponse(message: { type: 'response' | 'errorResponse', id: string, payload?: any, error?: string }) {
        const pendingRequest = this.pendingRequests.get(message.id);
        if (!pendingRequest) {
            console.warn(`Received response for unknown request ID: ${message.id}`);
            return;
        }

        clearTimeout(pendingRequest.timeout);
        this.pendingRequests.delete(message.id);

        if (message.type === 'errorResponse') {
            pendingRequest.reject(new Error(message.error));
        } else {
            pendingRequest.resolve(message.payload);
        }
    }

    public async sendRequest<K extends ServerCommand>(
        command: K,
        payload: ServerRequestMap[K]['request'],
        timeoutMs: number = 5000
    ): Promise<ServerRequestMap[K]['response']> {
        if (!this.activeConnection) {
            throw new Error('No active WebSocket connection');
        }

        const id = crypto.randomUUID();
        const message = {
            type: 'getRequest' as const,
            id,
            command,
            payload
        } as const;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error('Request timed out'));
            }, timeoutMs);

            this.pendingRequests.set(id, { resolve, reject, timeout });
            this.activeConnection?.send(JSON.stringify(message));
        });
    }

    public close() {
        this.wss.close();
        this.activeConnection = null;
        this.pendingRequests.clear();
    }
} 