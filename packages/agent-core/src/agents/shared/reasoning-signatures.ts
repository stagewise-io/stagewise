import type { ReasoningSignatureSource } from '../../types/metadata';

/**
 * Matches the route owner of signed reasoning details.
 *
 * `modelId` is intentionally not part of the match today. It is stored for
 * observability and future tightening, but current compatibility is scoped to
 * provider route shape: non-custom sources match by provider mode and semantic
 * provider, while custom sources additionally match `apiSpec` and `endpointId`
 * so signatures never cross user-defined backends.
 */
export function reasoningSourcesMatch(
  a: ReasoningSignatureSource,
  b: ReasoningSignatureSource,
): boolean {
  if (a.providerMode !== b.providerMode) return false;
  if (a.provider !== b.provider) return false;
  if (a.providerMode !== 'custom') return true;
  if (!a.apiSpec || !a.endpointId || !b.apiSpec || !b.endpointId) {
    return false;
  }
  return a.apiSpec === b.apiSpec && a.endpointId === b.endpointId;
}
