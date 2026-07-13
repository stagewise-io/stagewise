import type { ModelSelectorEntry } from '@shared/provider-instance-helpers';
import type { ProviderInstance } from '@shared/karton-contracts/ui/shared-types';
import type { ProviderInstanceTypeId } from '@shared/karton-contracts/ui/shared-types';
import type { ProviderLogoComponent } from '../components/provider-logos/index';
import { groupOpenRouterEntriesByVendor } from './openrouter-vendor-helpers';
import { groupStagewiseEntriesByVendor } from './stagewise-vendor-helpers';
import { groupOllamaEntriesByVendor } from './ollama-vendor-helpers';

// ===========================================================================
// Vendor Grouping — generic per-provider-type strategy map
// ===========================================================================
//
// The settings model list groups entries by vendor for multi-vendor providers
// (OpenRouter, stagewise, Ollama). Each provider type has its own extraction
// strategy; the UI calls `groupEntriesByVendor` and doesn't need to know which
// provider it's dealing with.

/**
 * A group of model-selector entries belonging to the same vendor.
 */
export interface VendorGroup {
  prefix: string;
  displayName: string;
  logo: ProviderLogoComponent;
  entries: ModelSelectorEntry[];
}

/**
 * A per-provider-type strategy that groups model-selector entries by vendor.
 * Returns an array of `VendorGroup`s sorted by entry count desc, then
 * alphabetically. Entries with no detectable vendor go into an "Other" group.
 */
export type VendorGroupingStrategy = (
  entries: ModelSelectorEntry[],
) => VendorGroup[];

/**
 * Strategy map keyed by `ProviderInstanceTypeId`. Provider types not listed
 * here get no vendor grouping (flat list in the UI). Only multi-vendor types
 * are included.
 */
const VENDOR_GROUPING_STRATEGIES: Partial<
  Record<ProviderInstanceTypeId, VendorGroupingStrategy>
> = {
  openrouter: groupOpenRouterEntriesByVendor,
  stagewise: groupStagewiseEntriesByVendor,
  ollama: groupOllamaEntriesByVendor,
};

/**
 * Group model-selector entries by vendor for the given provider instance.
 *
 * Returns `null` when:
 * - No grouping strategy exists for the instance's `typeId` (single-vendor
 *   providers, custom/cloud types).
 * - The strategy produces ≤1 group (no visual benefit from grouping).
 *
 * The returned `VendorGroup[]` entries have already been cleaned of
 * provider-specific display-name prefixes (e.g. OpenRouter's `"Vendor: "`)
 * so the UI can render `entry.displayName` directly.
 */
export function groupEntriesByVendor(
  entries: ModelSelectorEntry[],
  instance: ProviderInstance,
): VendorGroup[] | null {
  const strategy = VENDOR_GROUPING_STRATEGIES[instance.typeId];
  if (!strategy) return null;
  const groups = strategy(entries);
  if (groups.length <= 1) return null;
  return groups;
}
