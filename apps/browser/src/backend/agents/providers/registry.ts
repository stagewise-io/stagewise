import type { ModelProvider } from '@shared/karton-contracts/ui/shared-types';
import type { ProviderInstanceTypeId } from '@shared/karton-contracts/ui/shared-types';
import type { ProviderType } from './types';
import { stagewiseProviderType } from './stagewise';
import {
  anthropicApiType,
  openaiApiType,
  googleApiType,
  moonshotaiApiType,
  alibabaApiType,
  deepseekApiType,
  zAiApiType,
  minimaxApiType,
  xiaomiMimoApiType,
  mistralApiType,
  OFFICIAL_API_TYPES,
} from './official-api';
import { codingPlanProviderType } from './coding-plan';
import {
  customAnthropicType,
  customOpenAIChatType,
  customOpenAIResponsesType,
  customGoogleType,
} from './custom-compatible';
import {
  azureProviderType,
  bedrockProviderType,
  vertexProviderType,
} from './cloud';
import { ollamaProviderType } from './ollama';
import { openrouterProviderType } from './openrouter';

// ============================================================================
// Registry — maps every ProviderInstanceTypeId to its ProviderType impl
// ============================================================================

export const PROVIDER_TYPE_REGISTRY: Record<
  ProviderInstanceTypeId,
  ProviderType
> = {
  stagewise: stagewiseProviderType,
  'anthropic-api': anthropicApiType,
  'openai-api': openaiApiType,
  'google-api': googleApiType,
  'moonshotai-api': moonshotaiApiType,
  'alibaba-api': alibabaApiType,
  'deepseek-api': deepseekApiType,
  'z-ai-api': zAiApiType,
  'minimax-api': minimaxApiType,
  'xiaomi-mimo-api': xiaomiMimoApiType,
  'mistral-api': mistralApiType,
  'coding-plan': codingPlanProviderType,
  'custom-anthropic': customAnthropicType,
  'custom-openai-chat': customOpenAIChatType,
  'custom-openai-responses': customOpenAIResponsesType,
  'custom-google': customGoogleType,
  azure: azureProviderType,
  bedrock: bedrockProviderType,
  vertex: vertexProviderType,
  ollama: ollamaProviderType,
  openrouter: openrouterProviderType,
};

/**
 * Look up a provider type by its typeId. Throws if unknown.
 */
export function getProviderType(typeId: string): ProviderType {
  const type = PROVIDER_TYPE_REGISTRY[typeId as ProviderInstanceTypeId];
  if (!type) {
    throw new Error(`Unknown provider type ID: ${typeId}`);
  }
  return type;
}

/**
 * Look up the official-api provider type for a vendor.
 * Returns the `${vendor}-api` type (e.g. `'anthropic'` → `anthropicApiType`).
 */
export function getProviderTypeByVendor(vendor: ModelProvider): ProviderType {
  return OFFICIAL_API_TYPES[vendor];
}
