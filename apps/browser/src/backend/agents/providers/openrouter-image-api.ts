import type { DiscoveredImageModel } from '@shared/karton-contracts/ui/shared-types';
import {
  MAX_GENERATED_IMAGE_BYTES,
  type ProviderImageGenerationRequest,
  type ProviderImageGenerationResult,
} from './types';
import { imageApiEndpoint, readImageJson } from './image-api';

type OpenRouterImageModel = {
  id: string;
  name?: string;
  description?: string;
  supported_parameters?: Record<string, { type?: string; values?: string[] }>;
};

const RASTER_FORMATS = new Set(['png', 'jpeg', 'jpg', 'webp']);

function headers(apiKey: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

export async function discoverOpenRouterImageModels(
  apiKey: string,
  baseURL: string,
): Promise<DiscoveredImageModel[]> {
  const response = await fetch(imageApiEndpoint(baseURL, 'images/models'), {
    headers: headers(apiKey),
  });
  if (!response.ok) {
    throw new Error(`Image model discovery failed (${response.status})`);
  }

  const body = await readImageJson<{ data?: OpenRouterImageModel[] }>(response);
  return (body.data ?? [])
    .filter((model) => {
      const formats = model.supported_parameters?.output_format?.values;
      return (
        model.id.length <= 256 &&
        (!formats || formats.some((format) => RASTER_FORMATS.has(format)))
      );
    })
    .map((model) => ({
      modelId: model.id,
      displayName: (model.name ?? model.id).slice(0, 200),
      description: model.description?.slice(0, 500),
      supportedParameters: Object.fromEntries(
        Object.entries(model.supported_parameters ?? {}).flatMap(
          ([key, descriptor]) => {
            if (descriptor.type !== 'enum' || !descriptor.values) return [];
            const values =
              key === 'output_format'
                ? descriptor.values.filter((value) => RASTER_FORMATS.has(value))
                : descriptor.values;
            const boundedValues = values
              .slice(0, 50)
              .map((value) => value.slice(0, 100));
            return boundedValues.length
              ? [[key.slice(0, 100), boundedValues] as const]
              : [];
          },
        ),
      ),
    }));
}

export async function generateOpenRouterImage(
  apiKey: string,
  baseURL: string,
  modelId: string,
  request: ProviderImageGenerationRequest,
): Promise<ProviderImageGenerationResult> {
  const response = await fetch(imageApiEndpoint(baseURL, 'images'), {
    method: 'POST',
    headers: headers(apiKey),
    signal: request.abortSignal,
    body: JSON.stringify({
      model: modelId,
      prompt: request.prompt,
      ...(request.aspectRatio ? { aspect_ratio: request.aspectRatio } : {}),
      ...(request.resolution ? { resolution: request.resolution } : {}),
      ...(request.quality ? { quality: request.quality } : {}),
      ...(request.outputFormat ? { output_format: request.outputFormat } : {}),
      ...(request.background ? { background: request.background } : {}),
      ...(request.seed !== undefined ? { seed: request.seed } : {}),
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Image generation failed (${response.status}): ${message.slice(0, 500)}`,
    );
  }

  const body = await readImageJson<{
    data?: Array<{ b64_json?: string; media_type?: string }>;
  }>(response, 4 * Math.ceil(MAX_GENERATED_IMAGE_BYTES / 3) + 65_536);
  const images = (body.data ?? []).flatMap((image) =>
    image.b64_json
      ? [
          {
            base64: image.b64_json,
            mediaType: image.media_type ?? 'image/png',
          },
        ]
      : [],
  );
  return { images };
}
