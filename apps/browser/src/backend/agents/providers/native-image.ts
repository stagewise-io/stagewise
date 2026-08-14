import type { DiscoveredImageModel } from '@shared/karton-contracts/ui/shared-types';
import {
  downloadGeneratedImage,
  imageApiEndpoint,
  postImageJson,
} from './image-api';
import type {
  ProviderImageGenerationRequest,
  ProviderImageGenerationResult,
} from './types';

const COMMON_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];

function imageModel(
  modelId: string,
  displayName: string,
  description: string,
  supportedParameters: DiscoveredImageModel['supportedParameters'],
): DiscoveredImageModel {
  return { modelId, displayName, description, supportedParameters };
}

export const Z_AI_IMAGE_MODELS = [
  imageModel(
    'glm-image',
    'GLM-Image',
    "Z.ai's high-quality image generation model.",
    { aspect_ratio: COMMON_RATIOS, quality: ['hd', 'standard'] },
  ),
  imageModel(
    'cogview-4-250304',
    'CogView 4',
    'Fast image generation for everyday creative work.',
    { aspect_ratio: COMMON_RATIOS, quality: ['standard', 'hd'] },
  ),
] as const satisfies readonly DiscoveredImageModel[];

const Z_AI_SIZES: Record<string, Record<string, string>> = {
  'glm-image': {
    '1:1': '1280x1280',
    '16:9': '1728x960',
    '9:16': '960x1728',
    '4:3': '1472x1088',
    '3:4': '1088x1472',
    '3:2': '1568x1056',
    '2:3': '1056x1568',
  },
  'cogview-4-250304': {
    '1:1': '1024x1024',
    '16:9': '1344x768',
    '9:16': '768x1344',
    '4:3': '1152x864',
    '3:4': '864x1152',
    '3:2': '1216x816',
    '2:3': '816x1216',
  },
};

export async function generateZAiImage(
  apiKey: string,
  baseURL: string,
  modelId: string,
  request: ProviderImageGenerationRequest,
): Promise<ProviderImageGenerationResult> {
  const body = await postImageJson<{ data?: Array<{ url?: string }> }>(
    imageApiEndpoint(baseURL, 'images/generations'),
    apiKey,
    {
      model: modelId,
      prompt: request.prompt,
      ...(request.quality ? { quality: request.quality } : {}),
      ...(request.aspectRatio
        ? { size: Z_AI_SIZES[modelId]?.[request.aspectRatio] }
        : {}),
    },
    request.abortSignal,
  );
  return downloadGeneratedImage(
    (body.data ?? []).flatMap(({ url }) => (url ? [url] : [])),
    request.abortSignal,
  );
}

export const MINIMAX_IMAGE_MODELS = [
  imageModel(
    'image-01',
    'Image 01',
    "MiniMax's general-purpose image generation model.",
    { aspect_ratio: COMMON_RATIOS.concat('21:9') },
  ),
  imageModel(
    'image-01-live',
    'Image 01 Live',
    'MiniMax image generation optimized for stylized, lively output.',
    { aspect_ratio: COMMON_RATIOS.concat('21:9') },
  ),
] as const satisfies readonly DiscoveredImageModel[];

export async function generateMiniMaxImage(
  apiKey: string,
  baseURL: string,
  modelId: string,
  request: ProviderImageGenerationRequest,
): Promise<ProviderImageGenerationResult> {
  const body = await postImageJson<{
    data?: { image_urls?: string[] };
    base_resp?: { status_code?: number; status_msg?: string };
  }>(
    imageApiEndpoint(baseURL, 'image_generation'),
    apiKey,
    {
      model: modelId,
      prompt: request.prompt,
      response_format: 'url',
      n: 1,
      ...(request.aspectRatio ? { aspect_ratio: request.aspectRatio } : {}),
      ...(request.seed !== undefined ? { seed: request.seed } : {}),
    },
    request.abortSignal,
  );
  if (body.base_resp?.status_code) {
    throw new Error(
      body.base_resp.status_msg ?? 'MiniMax image generation failed',
    );
  }
  return downloadGeneratedImage(
    body.data?.image_urls ?? [],
    request.abortSignal,
  );
}

const ALIBABA_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'];
const ALIBABA_IMAGE_MODEL_DATA = [
  ['wan2.7-image-pro', 'Wan 2.7 Image Pro', 'Highest-quality Wan image model.'],
  ['wan2.7-image', 'Wan 2.7 Image', 'Fast, high-quality Wan image model.'],
  ['wan2.6-t2i', 'Wan 2.6 Text to Image', 'Wan text-to-image generation.'],
  ['wan2.6-image', 'Wan 2.6 Image', 'Wan image generation and editing model.'],
  [
    'qwen-image-3.0-pro',
    'Qwen Image 3.0 Pro',
    'Limited-preview professional Qwen image model.',
  ],
  [
    'qwen-image-2.0-pro',
    'Qwen Image 2.0 Pro',
    'High-quality Qwen image model.',
  ],
  ['qwen-image-2.0', 'Qwen Image 2.0', 'Fast Qwen image model.'],
  ['qwen-image-max', 'Qwen Image Max', 'Detailed Qwen text-to-image model.'],
  ['qwen-image-plus', 'Qwen Image Plus', 'Balanced Qwen text-to-image model.'],
  ['qwen-image', 'Qwen Image', 'General-purpose Qwen image model.'],
  ['z-image-turbo', 'Z-Image Turbo', 'Fast, low-cost photorealistic images.'],
] as const;

export const ALIBABA_IMAGE_MODELS = ALIBABA_IMAGE_MODEL_DATA.map(
  ([modelId, displayName, description]) =>
    imageModel(modelId, displayName, description, {
      aspect_ratio: ALIBABA_RATIOS,
      ...(/^(wan2\.7|qwen-image-[23]\.0)/.test(modelId)
        ? {
            resolution: [
              '1K',
              '2K',
              ...(modelId === 'wan2.7-image-pro' ? ['4K'] : []),
            ],
          }
        : {}),
    }),
);

const ALIBABA_SIZES: Record<string, Record<string, string>> = {
  '1K': {
    '1:1': '1024*1024',
    '16:9': '1344*768',
    '9:16': '768*1344',
    '4:3': '1152*864',
    '3:4': '864*1152',
  },
  '2K': {
    '1:1': '2048*2048',
    '16:9': '2688*1536',
    '9:16': '1536*2688',
    '4:3': '2368*1728',
    '3:4': '1728*2368',
  },
  '4K': {
    '1:1': '4096*4096',
    '16:9': '4096*2304',
    '9:16': '2304*4096',
    '4:3': '4096*3072',
    '3:4': '3072*4096',
  },
};

const ALIBABA_FIXED_SIZES: Record<string, Record<string, string>> = {
  'qwen-image': {
    '1:1': '1328*1328',
    '16:9': '1664*928',
    '9:16': '928*1664',
    '4:3': '1472*1104',
    '3:4': '1104*1472',
  },
  'wan2.6-t2i': {
    '1:1': '1280*1280',
    '16:9': '1696*960',
    '9:16': '960*1696',
    '4:3': '1472*1104',
    '3:4': '1104*1472',
  },
  'wan2.6-image': {
    '1:1': '1280*1280',
    '16:9': '1440*810',
    '9:16': '810*1440',
    '4:3': '1408*1056',
    '3:4': '1056*1408',
  },
  'z-image-turbo': {
    '1:1': '1024*1024',
    '16:9': '1280*720',
    '9:16': '720*1280',
    '4:3': '1152*864',
    '3:4': '864*1152',
  },
};

export function supportsAlibabaImageGeneration(baseURL?: string): boolean {
  if (!baseURL) return false;
  try {
    const { hostname, protocol } = new URL(baseURL);
    return (
      protocol === 'https:' &&
      (hostname === 'dashscope-intl.aliyuncs.com' ||
        hostname === 'dashscope-us.aliyuncs.com' ||
        hostname.endsWith('.maas.aliyuncs.com'))
    );
  } catch {
    return false;
  }
}

export function getAlibabaImageModels(
  baseURL?: string,
): DiscoveredImageModel[] {
  if (!baseURL || !supportsAlibabaImageGeneration(baseURL)) return [];
  const supportsQwenImage3 = new URL(baseURL).hostname.endsWith(
    '.ap-southeast-1.maas.aliyuncs.com',
  );
  return ALIBABA_IMAGE_MODELS.filter(
    ({ modelId }) => modelId !== 'qwen-image-3.0-pro' || supportsQwenImage3,
  );
}

function alibabaApiBase(baseURL: string): string {
  if (!supportsAlibabaImageGeneration(baseURL)) {
    throw new Error('Alibaba image generation requires a supported API URL');
  }
  const trimmed = baseURL.replace(/\/$/, '');
  if (trimmed.endsWith('/compatible-mode/v1')) {
    return trimmed.replace('/compatible-mode/v1', '/api/v1');
  }
  return trimmed.endsWith('/api/v1')
    ? trimmed
    : imageApiEndpoint(trimmed, 'api/v1');
}

export async function generateAlibabaImage(
  apiKey: string,
  baseURL: string,
  modelId: string,
  request: ProviderImageGenerationRequest,
): Promise<ProviderImageGenerationResult> {
  const resolution = request.resolution ?? '2K';
  const fixedSizeGroup = /^qwen-image-(?:2\.0|3\.0)/.test(modelId)
    ? modelId
    : modelId.startsWith('qwen-image')
      ? 'qwen-image'
      : modelId;
  const size = request.aspectRatio
    ? (ALIBABA_FIXED_SIZES[fixedSizeGroup]?.[request.aspectRatio] ??
      ALIBABA_SIZES[resolution]?.[request.aspectRatio])
    : undefined;
  const body = await postImageJson<{
    output?: {
      choices?: Array<{ message?: { content?: Array<{ image?: string }> } }>;
    };
  }>(
    imageApiEndpoint(
      alibabaApiBase(baseURL),
      'services/aigc/multimodal-generation/generation',
    ),
    apiKey,
    {
      model: modelId,
      input: {
        messages: [{ role: 'user', content: [{ text: request.prompt }] }],
      },
      parameters: {
        n: 1,
        watermark: false,
        ...(size ? { size } : {}),
        ...(request.seed !== undefined ? { seed: request.seed } : {}),
      },
    },
    request.abortSignal,
  );
  const urls = (body.output?.choices ?? []).flatMap(
    ({ message }) =>
      message?.content?.flatMap(({ image }) => (image ? [image] : [])) ?? [],
  );
  return downloadGeneratedImage(urls, request.abortSignal);
}
