import type { LanguageModelV3 } from '@ai-sdk/provider';
import { createStagewise } from '../stagewise-provider';
import type { ModelProvider } from '@shared/karton-contracts/ui/shared-types';
import { PROVIDER_TYPE_DISPLAY_INFO } from '@shared/karton-contracts/ui/shared-types';
import type { ProviderType } from './types';
import {
  OPENROUTER_PROVIDER_MAP,
  stagewiseUrlPassthroughMiddleware,
} from './shared';

export type StagewiseConfig = Record<string, never>;

export const stagewiseProviderType: ProviderType<StagewiseConfig> = {
  id: 'stagewise',
  ...PROVIDER_TYPE_DISPLAY_INFO.stagewise,
  category: 'default',
  providerMode: 'stagewise',
  sensitiveFields: [],

  toWireModelId(modelId: string, vendor?: ModelProvider): string {
    if (!vendor) return modelId;
    const prefix = OPENROUTER_PROVIDER_MAP[vendor] ?? vendor;
    return `${prefix}/${modelId}`;
  },

  createLanguageModel({ modelId, apiKey, baseURL }): {
    model: LanguageModelV3;
    middleware?: import('ai').LanguageModelMiddleware[];
  } {
    const provider = createStagewise({ apiKey, baseURL: baseURL ?? '' });
    return {
      model: provider.chatModel(modelId),
      middleware: [stagewiseUrlPassthroughMiddleware],
    };
  },
};
