import type { ModelCapabilities } from '@stagewise/agent-core/types';
import {
  PROVIDER_TYPE_DISPLAY_INFO,
  type ExternalAgentProviderTypeId,
  type DiscoveredModel,
} from '@shared/karton-contracts/ui/shared-types';
import type { ProviderType } from './types';

export const DEFAULT_ACP_MODEL_CAPABILITIES: ModelCapabilities = {
  inputModalities: {
    text: true,
    audio: false,
    image: true,
    video: false,
    file: true,
  },
  outputModalities: {
    text: true,
    audio: false,
    image: false,
    video: false,
    file: true,
  },
  toolCalling: true,
};

export function createAcpProviderType(
  id: ExternalAgentProviderTypeId,
  getInitialModels: () => Promise<DiscoveredModel[]>,
): ProviderType {
  const display = PROVIDER_TYPE_DISPLAY_INFO[id];
  return {
    id,
    ...display,
    category: 'self-hosted',
    providerMode: 'custom',
    sensitiveFields: [],
    getInitialModels,
    createLanguageModel() {
      throw new Error(`${display.displayName} runs through its ACP harness.`);
    },
  };
}
