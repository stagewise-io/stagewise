import { getAvailableModel } from '@shared/available-models';
import { availableModelAliases } from '@shared/available-models';
import type { ModelSelectorEntry } from '@shared/provider-instance-helpers';

/**
 * Resolve display info for a model ID from the selectable entries.
 * Falls back to the static catalog if no matching entry is found.
 */
export function resolveModelDisplay(
  entries: ModelSelectorEntry[],
  modelId: string,
  providerInstanceId?: string,
): { displayName: string; instanceName: string } | undefined {
  const entry = providerInstanceId
    ? entries.find(
        (e) => e.modelId === modelId && e.instanceId === providerInstanceId,
      )
    : entries.find((e) => e.modelId === modelId);
  if (entry) {
    return {
      displayName: entry.displayName,
      instanceName: entry.instanceName,
    };
  }
  // Fallback to catalog
  const catalogModel = getAvailableModel(modelId);
  if (catalogModel) {
    return {
      displayName: catalogModel.modelDisplayName,
      instanceName: providerInstanceId ?? 'Unknown',
    };
  }
  // Check aliases
  const alias = availableModelAliases.find((a) => a.modelId === modelId);
  if (alias) {
    return {
      displayName: alias.modelDisplayName,
      instanceName: providerInstanceId ?? 'Unknown',
    };
  }
  return undefined;
}
