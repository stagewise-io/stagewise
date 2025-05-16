// SPDX-License-Identifier: AGPL-3.0-only
// WebSocket-based RPC client implementation for type-safe remote procedure calls
// Copyright (C) 2025 Goetze, Scharpff & Toews GbR

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

import { WebSocketRpcBridge, type WebSocketBridgeOptions } from './core';

// Use the appropriate WebSocket implementation based on the environment
const WebSocketImpl =
  typeof window !== 'undefined' ? window.WebSocket : require('ws').WebSocket;

/**
 * Client implementation of the WebSocket RPC Bridge
 */
export class WebSocketRpcClient extends WebSocketRpcBridge {
  private url: string;
  private reconnectTimer: NodeJS.Timeout | null = null;

  /**
   * Creates a new WebSocketRpcClient
   * @param url WebSocket server URL
   * @param options Connection options
   */
  constructor(url: string, options?: WebSocketBridgeOptions) {
    super(options);
    this.url = url;
  }

  /**
   * Connect to the WebSocket server
   * @returns Promise that resolves when connected
   */
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocketImpl(this.url);

        ws.onopen = () => {
          this.ws = ws;
          this.reconnectAttempts = 0;
          this.isIntentionalClose = false;
          this.setupWebSocketHandlers(ws);
          resolve();
        };

        ws.onerror = (_event: Event) => {
          reject(new Error('Failed to connect to WebSocket server'));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Method to call a remote procedure on the server
   * @param method Method name
   * @param payload Request payload
   * @param onUpdate Optional callback for updates
   * @returns Promise resolving with the response
   */
  public call<TRequest, TResponse, TUpdate>(
    method: string,
    payload: TRequest,
    onUpdate?: (update: TUpdate) => void,
  ): Promise<TResponse> {
    if (!this.ws) {
      throw new Error('WebSocket is not connected. Call connect() first.');
    }
    return this.callMethod<TRequest, TResponse, TUpdate>(
      method,
      payload,
      onUpdate,
    );
  }

  /**
   * Reconnect to the WebSocket server
   */
  protected reconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        this.handleDisconnect();
      }
    }, this.options.reconnectDelay);
  }
}
