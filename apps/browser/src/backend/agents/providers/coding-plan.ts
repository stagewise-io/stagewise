import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { LanguageModelMiddleware } from 'ai';
import type { ModelProvider } from '@shared/karton-contracts/ui/shared-types';
import { PROVIDER_TYPE_DISPLAY_INFO } from '@shared/karton-contracts/ui/shared-types';
import { CODING_PLANS, type CodingPlanId } from '@shared/coding-plans';
import type { ProviderType } from './types';
import { OFFICIAL_API_TYPES } from './official-api';

export type CodingPlanConfig = {
  encryptedApiKey?: string;
  planId: string;
  baseUrl?: string;
};

/**
 * Resolve the vendor for a coding-plan instance from its `planId`.
 */
export function getCodingPlanVendor(config: CodingPlanConfig): ModelProvider {
  const plan = CODING_PLANS[config.planId as CodingPlanId];
  if (!plan) {
    throw new Error(`Unknown coding plan ID: ${config.planId}`);
  }
  return plan.provider;
}

export const codingPlanProviderType: ProviderType<CodingPlanConfig> = {
  id: 'coding-plan',
  ...PROVIDER_TYPE_DISPLAY_INFO['coding-plan'],
  category: 'official-api',
  providerMode: 'official',
  sensitiveFields: ['encryptedApiKey'],

  toWireModelId(modelId: string, vendor?: ModelProvider): string {
    if (!vendor) return modelId;
    const apiType = OFFICIAL_API_TYPES[vendor];
    return apiType.toWireModelId?.(modelId, vendor) ?? modelId;
  },

  // apiSpec is intentionally omitted — it is resolved dynamically by
  // the routing layer via the vendor's api type (see getCodingPlanVendor).

  createLanguageModel({
    modelId,
    apiKey,
    baseURL,
    config,
    decryptedConfig,
    vendor,
  }): {
    model: LanguageModelV3;
    middleware?: LanguageModelMiddleware[];
  } {
    const resolvedVendor = vendor ?? getCodingPlanVendor(config);
    const apiType = OFFICIAL_API_TYPES[resolvedVendor];
    return apiType.createLanguageModel({
      modelId,
      apiKey,
      baseURL,
      config: config as never,
      decryptedConfig,
      vendor: resolvedVendor,
    });
  },
};
