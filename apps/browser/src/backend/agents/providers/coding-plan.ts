import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { LanguageModelMiddleware } from 'ai';
import type {
  DiscoveredModel,
  ModelProvider,
} from '@shared/karton-contracts/ui/shared-types';
import { PROVIDER_TYPE_DISPLAY_INFO } from '@shared/karton-contracts/ui/shared-types';
import {
  CODING_PLANS,
  isCodingPlanId,
  type CodingPlanId,
} from '@shared/coding-plans';
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

  async validateCredentials(
    config: CodingPlanConfig,
    decryptedConfig: Record<string, string>,
  ): Promise<{ success: true } | { success: false; error: string }> {
    const planId = config.planId as CodingPlanId;
    if (!isCodingPlanId(planId)) {
      return { success: false, error: `Unknown coding plan: ${planId}` };
    }
    const plan = CODING_PLANS[planId];
    const apiKey = decryptedConfig.encryptedApiKey ?? '';

    // Coding plans have specialized validation logic (MiniMax quota
    // endpoint, custom validation base URLs) that differs from the
    // standard vendor API validation. Delegating to the vendor's
    // validateCredentials would not cover these cases.
    const { validateCodingPlanApiKey } = await import(
      '../../utils/validate-api-keys'
    );
    const result = await validateCodingPlanApiKey(plan, apiKey);
    if (!result) {
      return { success: false, error: 'Validation was skipped' };
    }
    return result;
  },

  async getInitialModels(
    config: CodingPlanConfig,
    decryptedConfig: Record<string, string>,
  ): Promise<DiscoveredModel[]> {
    const vendor = getCodingPlanVendor(config);
    const apiType = OFFICIAL_API_TYPES[vendor];
    if (!apiType.getInitialModels) return [];
    // Use the plan's dedicated base URL if set, otherwise fall through
    // to the vendor type's defaultBaseUrl.
    const planConfig: CodingPlanConfig = {
      ...config,
      baseUrl:
        config.baseUrl ?? CODING_PLANS[config.planId as CodingPlanId]?.baseUrl,
    };
    return apiType.getInitialModels(planConfig as never, decryptedConfig);
  },

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
