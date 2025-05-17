// SPDX-License-Identifier: AGPL-3.0-only
// Strongly-typed WebSocket RPC client/server implementation with Zod validation
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

// Core types and classes
export {
  WebSocketRpcBridge,
  type RpcMethodHandler,
  type RpcMethodDefinition,
  type RpcMethods,
  type WebSocketMessageType,
  type BaseWebSocketMessage,
  type RequestMessage,
  type ResponseMessage,
  type UpdateMessage,
  type ErrorMessage,
  type WebSocketMessage,
  type WebSocketBridgeOptions,
  type PendingRequest,
} from './core';

export { createBridgeContract } from './zod-contract';

export {
  ZodServer,
  createSRPCServerBridge,
} from './server';

export {
  ZodClient,
  createSRPCClientBridge,
} from './client';
