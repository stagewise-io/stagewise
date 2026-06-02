import { createAnthropic } from '@ai-sdk/anthropic';
import type { streamText } from 'ai';
import type { HostModels } from '@stagewise/agent-core/host';
import type { ModelCapabilities } from '@stagewise/agent-core/types/models';
import { modelCapabilitiesSchema } from '@stagewise/agent-core/types/models';

const DEFAULT_CAPABILITIES: ModelCapabilities = modelCapabilitiesSchema.parse({
  toolCalling: true,
});

export function createCliHostModels(defaultModelId: string): HostModels {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is required');
  }

  const anthropic = createAnthropic({ apiKey });

  return {
    async getWithOptions(modelId: string, _traceId: string) {
      const id = modelId || defaultModelId;
      const model = anthropic(id);
      return {
        model,
        providerOptions: {} as Parameters<
          typeof streamText
        >[0]['providerOptions'],
        headers: {},
        contextWindowSize: 200_000,
        providerMode: 'official' as const,
        stripStrictFromTools: false,
      };
    },

    async get(modelId: string, traceId: string) {
      return (await this.getWithOptions(modelId, traceId)).model;
    },

    has() {
      return true;
    },

    getCapabilities(_modelId: string): ModelCapabilities {
      return DEFAULT_CAPABILITIES;
    },
  };
}
