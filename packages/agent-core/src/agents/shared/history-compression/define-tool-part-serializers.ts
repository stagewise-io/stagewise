import type { InferSchema } from 'ai';
import type { ZodType } from 'zod';
import type { ToolPartSerializer } from '../../../host/host';

/**
 * Shape of a tool-schema map keyed by bare tool name (no `tool-`
 * prefix). Each entry must expose the same `inputSchema`/`outputSchema`
 * pair the Zod-typed tool factories produce in the host packages.
 */
type SchemaMap = Record<
  string,
  {
    inputSchema: ZodType;
    outputSchema: ZodType;
  }
>;

/**
 * Strongly-typed registry shape produced by {@link defineToolPartSerializers}.
 * Each key maps to a {@link ToolPartSerializer} whose `input`/`output`
 * are inferred from the schema at the same key in `TSchemas`.
 */
export type TypedToolPartSerializers<TSchemas extends SchemaMap> = {
  [K in keyof TSchemas]?: ToolPartSerializer<
    InferSchema<TSchemas[K]['inputSchema']>,
    InferSchema<TSchemas[K]['outputSchema']>
  >;
};

/**
 * Type-safe builder for an `AgentHost.toolPartSerializers` registry.
 *
 * Hosts pass in their own schema map (e.g. `allToolSchemas`) and a
 * record of per-tool serializers. Inside each serializer, `input`
 * and `output` are inferred from the matching schema entry — no
 * `any`/`unknown` casts required.
 *
 * The `_schemas` arg exists purely to bind `TSchemas` at the call site
 * for inference; the returned object is a frozen copy of `serializers`.
 */
export function defineToolPartSerializers<TSchemas extends SchemaMap>(
  _schemas: TSchemas,
  serializers: TypedToolPartSerializers<TSchemas>,
): Readonly<Record<string, ToolPartSerializer>> {
  return Object.freeze({ ...serializers }) as Readonly<
    Record<string, ToolPartSerializer>
  >;
}
