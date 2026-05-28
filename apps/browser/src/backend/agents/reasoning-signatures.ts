import type {
  ApiSpec,
  ModelProvider,
} from '@shared/karton-contracts/ui/shared-types';
import type { ReasoningSignatureSource } from '@shared/karton-contracts/ui/agent/metadata';

export type ProviderMode = 'stagewise' | 'official' | 'custom';

export function getSemanticProviderForApiSpec(apiSpec: ApiSpec): ModelProvider {
  switch (apiSpec) {
    case 'anthropic':
    case 'amazon-bedrock':
      return 'anthropic';
    case 'google':
    case 'google-vertex':
      return 'google';
    case 'openai-chat-completions':
    case 'openai-responses':
    case 'azure':
      return 'openai';
  }
}

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

type NonCustomProviderMode = Exclude<ProviderMode, 'custom'>;
type CustomReasoningSignatureSourceOptions = {
  apiSpec: ApiSpec;
  endpointId: string;
};

export function createReasoningSignatureSource(
  providerMode: NonCustomProviderMode,
  provider: ModelProvider,
  modelId: string,
): ReasoningSignatureSource;
export function createReasoningSignatureSource(
  providerMode: 'custom',
  provider: ModelProvider,
  modelId: string,
  opts: CustomReasoningSignatureSourceOptions,
): ReasoningSignatureSource;
export function createReasoningSignatureSource(
  providerMode: ProviderMode,
  provider: ModelProvider,
  modelId: string,
  opts?: Partial<CustomReasoningSignatureSourceOptions>,
): ReasoningSignatureSource {
  if (providerMode === 'custom' && (!opts?.apiSpec || !opts.endpointId)) {
    throw new Error(
      'Custom reasoning signature sources require apiSpec and endpointId',
    );
  }
  if (providerMode === 'custom' && opts?.apiSpec) {
    const expectedProvider = getSemanticProviderForApiSpec(opts.apiSpec);
    if (expectedProvider !== provider) {
      throw new Error(
        `Custom reasoning signature source provider/apiSpec mismatch: provider "${provider}" does not match apiSpec "${opts.apiSpec}" (expected "${expectedProvider}")`,
      );
    }
  }

  return {
    providerMode,
    provider,
    modelId,
    ...(opts?.apiSpec ? { apiSpec: opts.apiSpec } : {}),
    ...(opts?.endpointId ? { endpointId: opts.endpointId } : {}),
  };
}
