import type { z } from 'zod';

/**
 * Type representing a Zod RPC method contract with request, response, and optional update schemas
 */
export interface ZodRpcMethodContract<
  TRequest extends z.ZodType = z.ZodType,
  TResponse extends z.ZodType = z.ZodType,
  TUpdate extends z.ZodType = z.ZodType,
> {
  request: TRequest;
  response: TResponse;
  update?: TUpdate;
}

/**
 * Type for a map of endpoint methods using Zod schemas
 */
export type ZodEndpointMethodMap = Record<string, ZodRpcMethodContract>;

/**
 * Type for the complete bridge contract with optional server and client method maps
 */
export interface ZodBridgeContract {
  server?: ZodEndpointMethodMap;
  client?: ZodEndpointMethodMap;
}

/**
 * Helper type to infer the TypeScript type from a Zod schema
 */
export type InferZodType<T extends z.ZodType> = z.infer<T>;

/**
 * Helper type to extract the request type from a Zod method contract
 */
export type InferRequestType<T extends ZodRpcMethodContract> = InferZodType<
  T['request']
>;

/**
 * Helper type to extract the response type from a Zod method contract
 */
export type InferResponseType<T extends ZodRpcMethodContract> = InferZodType<
  T['response']
>;

/**
 * Helper type to extract the update type from a Zod method contract
 */
export type InferUpdateType<T extends ZodRpcMethodContract> =
  T['update'] extends z.ZodType ? InferZodType<T['update']> : never;

/**
 * Creates a strongly-typed bridge contract with Zod schemas
 */
export function createBridgeContract<T extends ZodBridgeContract>(
  contract: T,
): T {
  return contract;
}

/**
 * Type for method implementations using inferred types from Zod schemas
 */
export type ZodMethodImplementations<T extends ZodEndpointMethodMap> = {
  [K in keyof T]: (
    request: InferRequestType<T[K]>,
    context: {
      sendUpdate: T[K]['update'] extends z.ZodType
        ? (update: InferUpdateType<T[K]>) => void
        : never;
    },
  ) => Promise<InferResponseType<T[K]>>;
};

/**
 * Type for method calls using inferred types from Zod schemas
 */
export type ZodMethodCalls<T extends ZodEndpointMethodMap> = {
  [K in keyof T]: T[K]['update'] extends z.ZodType
    ? (
        request: InferRequestType<T[K]>,
        options: { onUpdate: (update: InferUpdateType<T[K]>) => void },
      ) => Promise<InferResponseType<T[K]>>
    : (request: InferRequestType<T[K]>) => Promise<InferResponseType<T[K]>>;
};

/**
 * Validates data against a Zod schema and throws if validation fails
 */
export function validateWithZod<T extends z.ZodType>(
  schema: T,
  data: unknown,
  context: string,
  silent = false,
): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const error = new Error(
      `Validation failed for ${context}: ${result.error.message}`,
    );
    if (silent) {
      console.error(error);
      return data as z.infer<T>; // Return original data for silent validation
    }
    throw error;
  }
  return result.data;
}
