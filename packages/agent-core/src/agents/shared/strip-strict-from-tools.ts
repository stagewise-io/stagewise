/**
 * Removes the `strict` field from each tool definition.
 *
 * Rationale: tool factories pass `strict: false` (OpenAI-specific; ignored
 * by most other providers) so that Zod schemas with `z.any()` / unions are
 * not forced through OpenAI's strict JSON-Schema subset. However, the
 * Bedrock → Anthropic path serialises the field into the Anthropic tool
 * payload, which rejects unknown keys with
 * `tools.0.custom.strict: Extra inputs are not permitted`.
 *
 * For providers that flag `stripStrictFromTools` on their model options,
 * callers delete `strict` here as the very last step before `streamText`,
 * leaving the existing `strict: false` defaults untouched for every other
 * provider.
 *
 * Extracted to its own module so the unit test can import it without
 * transitively loading the entire `BaseAgent` dependency graph (which
 * would trigger circular-initialization errors in vitest).
 *
 * The signature intentionally operates on the structural shape
 * `Record<string, unknown>` so the helper is compatible with every tool
 * set variant used across the monorepo (the browser host's concrete
 * `StagewiseToolSet`, the core's generic `StagewiseToolSet<T>`, and any
 * future subset). The generic parameter `TToolSet` preserves the
 * caller's exact tool set identity through the return type.
 */
export function stripStrictFromToolSet<TToolSet extends Record<string, any>>(
  tools: Partial<TToolSet>,
): Partial<TToolSet> {
  const cleaned: Record<string, unknown> = {};
  for (const [name, t] of Object.entries(tools)) {
    if (!t || typeof t !== 'object') {
      cleaned[name] = t;
      continue;
    }
    const { strict: _strict, ...rest } = t as Record<string, unknown>;
    cleaned[name] = rest;
  }
  return cleaned as Partial<TToolSet>;
}
