import type { ModelCapabilities } from '@stagewise/agent-core/types';
import type { DiscoveredModel } from '@shared/karton-contracts/ui/shared-types';
import { CodexAppServerClient } from './app-server-client';

function capabilities(inputModalities: string[] = []): ModelCapabilities {
  return {
    inputModalities: {
      text: true,
      audio: inputModalities.includes('audio'),
      image: inputModalities.includes('image'),
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
}

export async function discoverCodexModels(): Promise<DiscoveredModel[]> {
  const client = new CodexAppServerClient(console);
  try {
    const models = await client.discoverModels();
    return models.map((model) => {
      const thinkingEfforts = model.supportedReasoningEfforts
        ?.map((option) => option.reasoningEffort)
        .filter((effort): effort is string => typeof effort === 'string');
      return {
        modelId: model.model || model.id,
        displayName: model.displayName,
        description: model.description,
        contextWindow: 258_000,
        capabilities: capabilities(model.inputModalities),
        thinkingEnabled: !!thinkingEfforts?.length,
        thinkingEfforts,
        defaultThinkingEffort: model.defaultReasoningEffort,
        recommended: model.isDefault,
      };
    });
  } finally {
    client.close();
  }
}
