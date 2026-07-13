import type { ModelSelectorEntry } from '@shared/provider-instance-helpers';
import type { ModelProvider } from '@shared/karton-contracts/ui/shared-types';
import { PROVIDER_TYPE_DISPLAY_INFO } from '@shared/karton-contracts/ui/shared-types';
import { PROVIDER_LOGOS } from '../components/provider-logos/index';
import { VendorMonogramLogo } from '../components/provider-logos/openrouter-vendor-logos';
import type { VendorGroup } from './vendor-grouping';

// ===========================================================================
// Stagewise Vendor Grouping
// ===========================================================================
//
// The stagewise instance serves all catalog models from all 10 ModelProvider
// vendors plus aliases. Every catalog entry has `officialProvider`, which is
// used as the vendor key. Entries without `catalogModel` (custom models)
// go into an "Other" group.

/**
 * Resolve the display name for a `ModelProvider` vendor.
 */
function getVendorDisplayName(provider: ModelProvider): string {
  const name = PROVIDER_TYPE_DISPLAY_INFO[`${provider}-api`].displayName;
  // Strip the " API" suffix — vendor group headers show just the vendor name.
  return name.endsWith(' API') ? name.slice(0, -4) : name;
}

/**
 * Group stagewise model-selector entries by `catalogModel.officialProvider`.
 *
 * Entries without a `catalogModel` (custom models) go into an "Other" group.
 * Sorted by entry count descending, then alphabetically by display name.
 * No display-name stripping — catalog display names are already clean.
 */
export function groupStagewiseEntriesByVendor(
  entries: ModelSelectorEntry[],
): VendorGroup[] {
  const map = new Map<string, ModelSelectorEntry[]>();

  for (const entry of entries) {
    const provider = entry.catalogModel?.officialProvider;
    const key = provider ?? '';
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      map.set(key, [entry]);
    }
  }

  const groups: VendorGroup[] = [];
  for (const [key, groupEntries] of Array.from(map)) {
    if (key === '') {
      groups.push({
        prefix: '',
        displayName: 'Other',
        logo: VendorMonogramLogo,
        entries: groupEntries,
      });
    } else {
      const provider = key as ModelProvider;
      groups.push({
        prefix: provider,
        displayName: getVendorDisplayName(provider),
        logo: PROVIDER_LOGOS[provider],
        entries: groupEntries,
      });
    }
  }

  // Sort: by entry count descending, then alphabetically by display name.
  groups.sort((a, b) => {
    if (b.entries.length !== a.entries.length) {
      return b.entries.length - a.entries.length;
    }
    return a.displayName.localeCompare(b.displayName);
  });

  return groups;
}
