import type { StagewiseToolSet } from '@shared/karton-contracts/ui/agent/tools/types';

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
 */
export function stripStrictFromToolSet(
  tools: Partial<StagewiseToolSet>,
): Partial<StagewiseToolSet> {
  const cleaned: Partial<StagewiseToolSet> = {};
  for (const [name, t] of Object.entries(tools)) {
    if (!t || typeof t !== 'object') {
      (cleaned as Record<string, unknown>)[name] = t;
      continue;
    }
    const { strict: _strict, ...rest } = t as Record<string, unknown>;
    (cleaned as Record<string, unknown>)[name] = rest;
  }
  return cleaned;
}
