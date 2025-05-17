// SPDX-License-Identifier: AGPL-3.0-only
// Zod-enabled RPC bridge for schema validation in WebSocket communication
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

import type { WebSocketRpcBridge } from './core';

import type {
  ZodEndpointMethodMap,
  ZodMethodCalls,
  ZodMethodImplementations,
  InferRequestType,
  InferResponseType,
  InferUpdateType,
} from './zod-contract';
import { validateWithZod } from './zod-contract';

/**
 * Base class for Zod-enabled bridges that adds schema validation
 */
export class ZodTypedBridge<
  Serves extends ZodEndpointMethodMap,
  Consumes extends ZodEndpointMethodMap,
  B extends WebSocketRpcBridge,
> {
  protected bridge: B;
  protected contract: {
    serves: Serves;
    consumes: Consumes;
  };
  public call: ZodMethodCalls<Consumes>;

  constructor(bridge: B, contract: { serves: Serves; consumes: Consumes }) {
    this.bridge = bridge;
    this.contract = contract;

    // Create a proxy for method calling with validation
    this.call = new Proxy({} as ZodMethodCalls<Consumes>, {
      get: (target, prop) => {
        return (request: any, options?: any) => {
          return this.callMethod(prop as keyof Consumes, request, options);
        };
      },
    });
  }

  private async callMethod<K extends keyof Consumes>(
    method: K,
    request: InferRequestType<Consumes[K]>,
    options?: { onUpdate?: (update: InferUpdateType<Consumes[K]>) => void },
  ): Promise<InferResponseType<Consumes[K]>> {
    const methodContract = this.contract.consumes[method];
    if (!methodContract) {
      throw new Error(`Method ${String(method)} not found in contract`);
    }

    // Validate request
    const validatedRequest = validateWithZod(
      methodContract.request,
      request,
      `request for method ${String(method)}`,
    );

    // Create update handler with validation if needed
    const onUpdate =
      options?.onUpdate && methodContract.update
        ? (update: unknown) => {
            if (!methodContract.update) return; // TypeScript check
            try {
              const validatedUpdate = validateWithZod(
                methodContract.update,
                update,
                `update for method ${String(method)}`,
                true, // silently log validation errors
              );
              options.onUpdate?.(validatedUpdate);
            } catch (error) {
              // Log validation error but don't throw
              console.error('Update validation failed:', error);
            }
          }
        : undefined;

    // Call method and validate response
    const response = await (this.bridge as any).callMethod(
      method as string,
      validatedRequest,
      onUpdate,
    );

    return validateWithZod(
      methodContract.response,
      response,
      `response for method ${String(method)}`,
    );
  }

  public register(implementations: ZodMethodImplementations<Serves>): void {
    const wrappedImplementations: Record<string, any> = {};

    for (const [method, implementation] of Object.entries(implementations)) {
      const methodContract = this.contract.serves[method as keyof Serves];
      if (!methodContract) {
        throw new Error(`Method ${method} not found in contract`);
      }

      wrappedImplementations[method] = async (
        request: unknown,
        sendUpdate?: (update: unknown) => void,
      ) => {
        // Validate incoming request
        const validatedRequest = validateWithZod(
          methodContract.request,
          request,
          `request for method ${method}`,
        );

        // Create update handler with validation if needed
        const wrappedSendUpdate =
          methodContract.update && sendUpdate
            ? (update: unknown) => {
                if (!methodContract.update) return; // TypeScript check
                try {
                  const validatedUpdate = validateWithZod(
                    methodContract.update,
                    update,
                    `update for method ${method}`,
                    true, // silently log validation errors
                  );
                  sendUpdate(validatedUpdate);
                } catch (error) {
                  // Log validation error but don't throw
                  console.error('Update validation failed:', error);
                }
              }
            : undefined;

        // Call implementation and validate response
        const response = await implementation(validatedRequest, {
          sendUpdate: wrappedSendUpdate as any,
        });

        return validateWithZod(
          methodContract.response,
          response,
          `response for method ${method}`,
        );
      };
    }

    this.bridge.register(wrappedImplementations);
  }

  public async close(): Promise<void> {
    await this.bridge.close();
  }
}
