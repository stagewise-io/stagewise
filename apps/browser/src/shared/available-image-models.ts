import {
  PROVIDER_TYPE_DISPLAY_INFO,
  type DiscoveredImageModel,
  type ImageModelEntry,
  type ProviderInstance,
} from './karton-contracts/ui/shared-types';
import type { ImageGenerationSettings } from '@stagewise/agent-core/types/agent';

export const IMAGE_GENERATION_SETTINGS = [
  { parameter: 'aspect_ratio', field: 'aspectRatio', label: 'Aspect ratio' },
  { parameter: 'resolution', field: 'resolution', label: 'Resolution' },
  { parameter: 'quality', field: 'quality', label: 'Quality' },
  { parameter: 'output_format', field: 'outputFormat', label: 'Format' },
  { parameter: 'background', field: 'background', label: 'Background' },
] as const;

export type ImageGenerationSettingField =
  (typeof IMAGE_GENERATION_SETTINGS)[number]['field'];

export function pickImageGenerationSettings(
  source: ImageGenerationSettings,
): ImageGenerationSettings {
  const settings: ImageGenerationSettings = {};
  for (const { field } of IMAGE_GENERATION_SETTINGS) {
    if (source[field]) settings[field] = source[field];
  }
  return settings;
}

export type ImageModelSelectorEntry = DiscoveredImageModel & {
  instanceId: string;
  instanceName: string;
};

export function canUseImageModels(instance: ProviderInstance): boolean {
  const info = PROVIDER_TYPE_DISPLAY_INFO[instance.typeId];
  const config = instance.config as { encryptedApiKey?: string };
  return (
    !!info.supportsImageGeneration &&
    (info.credentialType !== 'api-key' || !!config.encryptedApiKey)
  );
}

export function getSelectableImageModelEntries(
  instances: readonly ProviderInstance[],
): ImageModelSelectorEntry[] {
  const entries: ImageModelSelectorEntry[] = [];

  for (const instance of instances) {
    if (!canUseImageModels(instance)) continue;
    const enabledModelIds = new Set(instance.enabledImageModelIds);
    for (const model of instance.imageModels ?? []) {
      if (!enabledModelIds.has(model.modelId)) continue;
      entries.push({
        ...model,
        instanceId: instance.id,
        instanceName: instance.name,
      });
    }
  }

  return entries;
}

export function findImageModelEntry(
  entries: readonly ImageModelSelectorEntry[],
  selection: Partial<ImageModelEntry> | undefined,
): ImageModelSelectorEntry | undefined {
  if (!selection?.providerInstanceId || !selection.modelId) return undefined;
  return entries.find(
    (entry) =>
      entry.instanceId === selection.providerInstanceId &&
      entry.modelId === selection.modelId,
  );
}
