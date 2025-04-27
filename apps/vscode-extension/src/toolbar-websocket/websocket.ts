import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';
import { 
    WebSocketMessage,
    WebSocketConnectionManager,
    ExtensionToToolbarMessage,
    ToolbarToExtensionMessage,
    ToolUsageRequest,
    ToolUsageResponse,
    PromptTriggerRequest,
    PromptTriggerResponse
} from '@stagewise/extension-websocket-contract';
import { randomUUID } from 'crypto';

export class WebSocketManager extends WebSocketConnectionManager {
    private wss: WebSocketServer;

    constructor(server: Server) {
        super();
        this.wss = new WebSocketServer({ server });

        this.wss.on('connection', (ws: WebSocket) => {
            if (this.ws) {
                console.warn('New WebSocket connection attempted while one is already active. Closing new connection.');
                ws.close();
                return;
            }

            this.ws = ws;
            this.setupWebSocketHandlers(ws);
        });
    }

    protected handleMessage(message: WebSocketMessage) {
        if (this.isToolbarToExtensionMessage(message)) {
            this.handleToolbarMessage(message);
        } else {
            this.handleExtensionMessage(message);
        }
    }

    private isToolbarToExtensionMessage(message: WebSocketMessage): message is ToolbarToExtensionMessage {
        return message.type === 'prompt_trigger_request' || message.type === 'tool_usage_response';
    }

    private async handleToolbarMessage(message: ToolbarToExtensionMessage) {
        switch (message.type) {
            case 'prompt_trigger_request':
                // Handle prompt trigger request from toolbar
                console.log(`Received prompt trigger request: ${message.payload.prompt}`);
                break;
            case 'tool_usage_response':
                // Handle tool usage response from toolbar
                console.log(`Received tool usage response for ${message.payload.toolName}`);
                this.handleResponse(message.id, message.payload.toolOutput);
                break;
        }
    }

    private handleExtensionMessage(message: ExtensionToToolbarMessage) {
        switch (message.type) {
            case 'tool_usage_request':
                // Handle tool usage request to toolbar
                console.log(`Sending tool usage request for ${message.payload.toolName}`);
                break;
            case 'prompt_trigger_response':
                // Handle prompt trigger response to toolbar
                console.log(`Sending prompt trigger response: ${message.payload.status}`);
                break;
        }
    }

    public sendToolUsageRequest<T>(toolName: string, toolInput: T): Promise<any> {
        const message: ToolUsageRequest<T> = {
            type: 'tool_usage_request',
            id: randomUUID(),
            payload: {
                toolName,
                toolInput
            }
        };
        return this.sendRequest(message);
    }

    public sendPromptTriggerResponse(status: 'pending' | 'success' | 'error', progressText?: string) {
        const message: PromptTriggerResponse = {
            type: 'prompt_trigger_response',
            id: randomUUID(),
            payload: {
                status,
                progressText
            }
        };
        if (this.ws) {
            this.ws.send(JSON.stringify(message));
        }
    }

    protected reconnect() {
        // Server doesn't need to reconnect
        throw new Error('Server WebSocket manager does not support reconnection');
    }

    public close() {
        super.close();
        this.wss.close();
    }
} 