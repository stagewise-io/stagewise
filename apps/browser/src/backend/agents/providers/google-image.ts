import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { DiscoveredImageModel } from '@shared/karton-contracts/ui/shared-types';
import { generateImage } from 'ai';
import type {
  ProviderImageGenerationRequest,
  ProviderImageGenerationResult,
} from './types';

const COMMON_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
];

export const GOOGLE_IMAGE_MODELS: readonly DiscoveredImageModel[] = [
  {
    modelId: 'gemini-3.1-flash-image',
    displayName: 'Gemini 3.1 Flash Image',
    description: "Google's recommended general-purpose image model.",
    supportedParameters: {
      aspect_ratio: [...COMMON_ASPECT_RATIOS, '1:4', '4:1', '1:8', '8:1'],
      resolution: ['512', '1K', '2K', '4K'],
    },
  },
  {
    modelId: 'gemini-3.1-flash-lite-image',
    displayName: 'Gemini 3.1 Flash Lite Image',
    description: 'Low-latency image generation for high-volume workloads.',
    supportedParameters: {
      aspect_ratio: COMMON_ASPECT_RATIOS,
      resolution: ['1K'],
    },
  },
  {
    modelId: 'gemini-3-pro-image',
    displayName: 'Gemini 3 Pro Image',
    description: 'Professional image generation for complex instructions.',
    supportedParameters: {
      aspect_ratio: COMMON_ASPECT_RATIOS,
      resolution: ['1K', '2K', '4K'],
    },
  },
  {
    modelId: 'gemini-2.5-flash-image',
    displayName: 'Gemini 2.5 Flash Image',
    description: 'Fast image generation optimized for high-volume use.',
    supportedParameters: { aspect_ratio: COMMON_ASPECT_RATIOS },
  },
];

export async function generateGoogleImage(
  apiKey: string,
  baseURL: string | undefined,
  modelId: string,
  request: ProviderImageGenerationRequest,
): Promise<ProviderImageGenerationResult> {
  const provider = createGoogleGenerativeAI({ apiKey, baseURL });
  const aspectRatio = request.aspectRatio as `${number}:${number}` | undefined;
  const imageSize = request.resolution as '512' | `${1 | 2 | 4}K` | undefined;
  const result = await generateImage({
    model: provider.image(modelId),
    prompt: request.prompt,
    aspectRatio,
    seed: request.seed,
    abortSignal: request.abortSignal,
    providerOptions: imageSize
      ? { google: { imageConfig: { aspectRatio, imageSize } } }
      : undefined,
  });

  return { image: result.image };
}
