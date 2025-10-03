import { v4 as uuidv4 } from 'uuid';
import type { WebSocketMessage } from './types.js';
import {
  KartonRPCException,
  KartonRPCErrorReason,
  KartonProcedureError,
} from './types.js';
import {
  createRPCCallMessage,
  createRPCReturnMessage,
  createRPCExceptionMessage,
  isRPCCallMessage,
  isRPCReturnMessage,
  isRPCExceptionMessage,
} from './websocket-messages.js';

export interface RPCCallOptions {
  timeout?: number;
  clientId?: string;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout | number;
  procedurePath: string[];
  clientId?: string;
}

type ProcedureHandler = (...args: any[]) => Promise<any>;

export class RPCManager {
  private pendingCalls: Map<string, PendingCall> = new Map();
  private procedures: Map<string, ProcedureHandler> = new Map();
  private sendMessage: (message: WebSocketMessage) => void;
  private defaultTimeout = 30000; // 30 seconds

  constructor(sendMessage: (message: WebSocketMessage) => void) {
    this.sendMessage = sendMessage;
  }

  public async call(
    procedurePath: string[],
    parameters: any[],
    options: RPCCallOptions = {},
  ): Promise<unknown> {
    const rpcCallId = uuidv4();
    const timeout = options.timeout ?? this.defaultTimeout;

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingCalls.delete(rpcCallId);
        reject(
          new KartonRPCException(
            KartonRPCErrorReason.CONNECTION_LOST,
            procedurePath,
            options.clientId,
          ),
        );
      }, timeout);

      this.pendingCalls.set(rpcCallId, {
        resolve,
        reject,
        timeout: timeoutHandle,
        procedurePath,
        clientId: options.clientId,
      });

      const message = createRPCCallMessage(
        rpcCallId,
        procedurePath,
        parameters,
      );
      this.sendMessage(message);
    });
  }

  public registerProcedure(path: string, handler: ProcedureHandler): void {
    this.procedures.set(path, handler);
  }

  public unregisterProcedure(path: string): void {
    this.procedures.delete(path);
  }

  public hasProcedure(path: string): boolean {
    return this.procedures.has(path);
  }

  public async handleMessage(message: WebSocketMessage): Promise<void> {
    if (isRPCCallMessage(message)) {
      await this.handleRPCCall(message);
    } else if (isRPCReturnMessage(message)) {
      this.handleRPCReturn(message);
    } else if (isRPCExceptionMessage(message)) {
      this.handleRPCException(message);
    }
  }

  private async handleRPCCall(
    message: WebSocketMessage & { data: any },
  ): Promise<void> {
    const { rpcCallId, procedurePath, parameters } = message.data;
    const handler = this.procedures.get(procedurePath);

    if (!handler) {
      const error = new KartonProcedureError(
        `Server procedure '${procedurePath}' is not registered`,
      );
      const exceptionMessage = createRPCExceptionMessage(rpcCallId, error);
      this.sendMessage(exceptionMessage);
      return;
    }

    try {
      const result = await handler(...parameters);
      const returnMessage = createRPCReturnMessage(rpcCallId, result);
      this.sendMessage(returnMessage);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const exceptionMessage = createRPCExceptionMessage(rpcCallId, err);
      this.sendMessage(exceptionMessage);
    }
  }

  private handleRPCReturn(message: WebSocketMessage & { data: any }): void {
    const { rpcCallId, value } = message.data;
    const pendingCall = this.pendingCalls.get(rpcCallId);

    if (pendingCall) {
      clearTimeout(pendingCall.timeout);
      this.pendingCalls.delete(rpcCallId);
      pendingCall.resolve(value);
    }
  }

  private handleRPCException(message: WebSocketMessage & { data: any }): void {
    const { rpcCallId, error } = message.data;
    const pendingCall = this.pendingCalls.get(rpcCallId);

    if (pendingCall) {
      clearTimeout(pendingCall.timeout);
      this.pendingCalls.delete(rpcCallId);

      // Reconstruct the error with proper prototype chain
      const reconstructedError = Object.assign(new Error(error.message), error);
      pendingCall.reject(reconstructedError);
    }
  }

  public cleanup(): void {
    // Cancel all pending calls
    for (const [_callId, pendingCall] of this.pendingCalls) {
      clearTimeout(pendingCall.timeout);
      pendingCall.reject(
        new KartonRPCException(
          KartonRPCErrorReason.CONNECTION_LOST,
          pendingCall.procedurePath,
          pendingCall.clientId,
        ),
      );
    }
    this.pendingCalls.clear();
    this.procedures.clear();
  }
}
