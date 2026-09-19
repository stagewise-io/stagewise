import { createOpenAI } from '@ai-sdk/openai';
import type { ImageModelV3 } from '@ai-sdk/provider';
import type { DiscoveredImageModel } from '@shared/karton-contracts/ui/shared-types';
import { generateImage } from 'ai';
import type {
  ProviderImageGenerationRequest,
  ProviderImageGenerationResult,
} from './types';

const COMMON_PARAMETERS = {
  aspect_ratio: ['1:1', '3:2', '2:3'],
  quality: ['auto', 'low', 'medium', 'high'],
  output_format: ['png', 'jpeg', 'webp'],
};

const IMAGE_SIZES: Record<string, `${number}x${number}`> = {
  '1:1': '1024x1024',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
};

export const OPENAI_IMAGE_MODELS: readonly DiscoveredImageModel[] = [
  {
    modelId: 'gpt-image-2',
    displayName: 'GPT Image 2',
    description: "OpenAI's latest high-quality image generation model.",
    supportedParameters: {
      ...COMMON_PARAMETERS,
      background: ['auto', 'opaque'],
    },
  },
  {
    modelId: 'gpt-image-1.5',
    displayName: 'GPT Image 1.5',
    description: "OpenAI's previous high-quality image generation model.",
    supportedParameters: {
      ...COMMON_PARAMETERS,
      background: ['auto', 'transparent', 'opaque'],
    },
  },
  {
    modelId: 'gpt-image-1',
    displayName: 'GPT Image 1',
    description: "OpenAI's general-purpose image generation model.",
    supportedParameters: {
      ...COMMON_PARAMETERS,
      background: ['auto', 'transparent', 'opaque'],
    },
  },
  {
    modelId: 'gpt-image-1-mini',
    displayName: 'GPT Image 1 Mini',
    description: 'A deprecated, lower-cost GPT Image 1 variant.',
    supportedParameters: {
      ...COMMON_PARAMETERS,
      background: ['auto', 'transparent', 'opaque'],
    },
  },
];

export async function generateOpenAIImage(
  apiKey: string,
  baseURL: string | undefined,
  modelId: string,
  request: ProviderImageGenerationRequest,
): Promise<ProviderImageGenerationResult> {
  const provider = createOpenAI({ apiKey, baseURL });
  return generateOpenAIImageWithModel(provider.image(modelId), request);
}

export async function generateOpenAIImageWithModel(
  model: ImageModelV3,
  request: ProviderImageGenerationRequest,
): Promise<ProviderImageGenerationResult> {
  const result = await generateImage({
    model,
    prompt: request.prompt,
    size: IMAGE_SIZES[request.aspectRatio ?? ''],
    seed: request.seed,
    abortSignal: request.abortSignal,
    providerOptions: {
      openai: {
        quality: request.quality,
        outputFormat: request.outputFormat,
        background: request.background,
      },
    },
  });

  return { image: result.image };
}
