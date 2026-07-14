import type { ModelSelectorEntry } from '@shared/provider-instance-helpers';
import {
  PROVIDER_LOGOS,
  type ProviderLogoComponent,
} from '../components/provider-logos/index';
import {
  MetaLogo,
  MicrosoftLogo,
  CohereLogo,
  VendorMonogramLogo,
} from '../components/provider-logos/openrouter-vendor-logos';
import type { VendorGroup } from './vendor-grouping';

// ===========================================================================
// Ollama Vendor Grouping
// ===========================================================================
//
// Ollama discovered models have no vendor metadata from the API. Model names
// follow naming conventions (llama3.2:3b, qwen2.5:7b, deepseek-r1:8b, etc.)
// that can be matched to vendors via regex patterns.
//
// Vendors in the ModelProvider enum (deepseek, alibaba, mistral, google,
// openai) reuse PROVIDER_LOGOS. Vendors outside the enum (Meta, Microsoft,
// Cohere) use logo components from openrouter-vendor-logos. Unmatched models
// fall back to VendorMonogramLogo.

interface OllamaVendorPattern {
  pattern: RegExp;
  displayName: string;
  logo: ProviderLogoComponent;
}

/**
 * Name-pattern → vendor mapping for common Ollama models.
 * Patterns are tested against the model ID (e.g. "llama3.2:3b").
 */
const OLLAMA_VENDOR_PATTERNS: OllamaVendorPattern[] = [
  { pattern: /^llama/, displayName: 'Meta', logo: MetaLogo },
  { pattern: /^qwen/, displayName: 'Qwen', logo: PROVIDER_LOGOS.alibaba },
  {
    pattern: /^deepseek/,
    displayName: 'DeepSeek',
    logo: PROVIDER_LOGOS.deepseek,
  },
  {
    pattern: /^(mistral|mixtral)/,
    displayName: 'Mistral',
    logo: PROVIDER_LOGOS.mistral,
  },
  { pattern: /^gemma/, displayName: 'Google', logo: PROVIDER_LOGOS.google },
  {
    pattern: /^phi(?:[.:_-]|\d|$)/i,
    displayName: 'Microsoft',
    logo: MicrosoftLogo,
  },
  { pattern: /^gpt-oss/, displayName: 'OpenAI', logo: PROVIDER_LOGOS.openai },
  { pattern: /^command-r/, displayName: 'Cohere', logo: CohereLogo },
  { pattern: /^nomic/, displayName: 'Nomic', logo: VendorMonogramLogo },
];

/**
 * Match a model ID against the vendor pattern list.
 * Returns the matched pattern or `null` for unknown models.
 */
function matchOllamaVendor(modelId: string): OllamaVendorPattern | null {
  for (const entry of OLLAMA_VENDOR_PATTERNS) {
    if (entry.pattern.test(modelId)) return entry;
  }
  return null;
}

/**
 * Group Ollama model-selector entries by vendor via name-pattern matching.
 *
 * Unmatched entries go into an "Other" group with `VendorMonogramLogo`.
 * Sorted by entry count descending, then alphabetically by display name.
 * No display-name stripping — Ollama display names equal model IDs.
 */
export function groupOllamaEntriesByVendor(
  entries: ModelSelectorEntry[],
): VendorGroup[] {
  const map = new Map<
    string,
    {
      displayName: string;
      logo: ProviderLogoComponent;
      entries: ModelSelectorEntry[];
    }
  >();

  for (const entry of entries) {
    const match = matchOllamaVendor(entry.modelId);
    const key = match?.displayName ?? '';
    const bucket = map.get(key);
    if (bucket) {
      bucket.entries.push(entry);
    } else {
      map.set(key, {
        displayName: match?.displayName ?? 'Other',
        logo: match?.logo ?? VendorMonogramLogo,
        entries: [entry],
      });
    }
  }

  const groups: VendorGroup[] = [];
  for (const [key, { displayName, logo, entries: groupEntries }] of Array.from(
    map,
  )) {
    groups.push({
      prefix: key,
      displayName,
      logo,
      entries: groupEntries,
    });
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
