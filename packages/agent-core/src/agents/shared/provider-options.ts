import type { streamText } from 'ai';

/**
 * Shape of `providerOptions` accepted by the `ai` SDK's `streamText`
 * / `generateText`. Kept as a structural alias so agent-core does not
 * depend on the SDK's internal type names.
 */
export type ProviderOptions = Parameters<
  typeof streamText
>[0]['providerOptions'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively deep-merges multiple plain objects. Later sources win on
 * primitive conflicts; nested objects are merged recursively.
 *
 * Typical use-case: layering request-specific provider overrides on top
 * of the options returned by `HostModels.getWithOptions`:
 *
 * ```ts
 * streamText({
 *   providerOptions: deepMergeProviderOptions(
 *     modelWithOptions.providerOptions,
 *     { anthropic: { thinking: { type: 'disabled' } } },
 *   ),
 * });
 * ```
 */
export function deepMergeProviderOptions(
  ...sources: (Record<string, unknown> | undefined | null)[]
): ProviderOptions {
  const result: Record<string, unknown> = {};
  for (const source of sources) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) {
      if (isPlainObject(value) && isPlainObject(result[key])) {
        result[key] = deepMergeProviderOptions(
          result[key] as Record<string, unknown>,
          value,
        );
      } else {
        result[key] = value;
      }
    }
  }
  return result as ProviderOptions;
}
