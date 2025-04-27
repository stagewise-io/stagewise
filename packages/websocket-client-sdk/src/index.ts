import { WebSocket } from 'ws';
import {
    WebSocketMessage,
    ExtensionCommand,
    ExtensionToToolbarMessage,
    ToolbarToExtensionMessage,
    WebSocketConnectionManager,
    ToolbarCommand,
    CommandToPayloadMap
} from '@stagewise/extension-websocket-contract';

export class WebSocketClient extends WebSocketConnectionManager {
    private url: string;

    constructor(url: string) {
        super();
        this.url = url;
    }

    public connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.url);

            this.ws.on('open', () => {
                console.log('WebSocket connected');
                this.reconnectAttempts = 0;
                resolve();
            });

            this.setupWebSocketHandlers(this.ws);
        });
    }

    protected handleMessage(message: WebSocketMessage) {
        if (this.isToolbarMessage(message)) {
            this.handleToolbarMessage(message);
        } else if (this.isExtensionMessage(message)) {
            this.handleExtensionMessage(message);
        }
    }

    private isToolbarMessage(message: WebSocketMessage): message is ToolbarToExtensionMessage {
        return message.type === 'prompt_trigger_request' || 
               message.type === 'tool_usage_response';
    }

    private isExtensionMessage(message: WebSocketMessage): message is ExtensionToToolbarMessage {
        return message.type === 'tool_usage_request' || 
               message.type === 'prompt_trigger_response';
    }

    private handleToolbarMessage(message: ToolbarToExtensionMessage) {
        // Handle toolbar messages if needed
        console.log('Received toolbar message:', message);
    }

    private handleExtensionMessage(message: ExtensionToToolbarMessage) {
        if (message.type === 'tool_usage_request') {
            // TODO: Handle tool usage request
        } else if (message.type === 'prompt_trigger_response') {
            // TODO: Handle prompt trigger response
        }
    }

    public async sendCommand<K extends ToolbarCommand>(
        command: K,
        payload: CommandToPayloadMap[K],
        timeoutMs: number = 5000
    ): Promise<void> {
        const message = {
            type: 'getRequest' as const,
            command,
            payload
        } as const;

        await this.sendRequest(message, timeoutMs);
    }

    protected reconnect() {
        return this.connect();
    }
} 