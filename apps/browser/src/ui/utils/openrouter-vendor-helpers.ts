import type { ModelSelectorEntry } from '@shared/provider-instance-helpers';
import type { VendorGroup } from './vendor-grouping';
import { getOpenRouterVendorLogo } from '../components/provider-logos/openrouter-vendor-logos';

// ===========================================================================
// OpenRouter Vendor Helpers
// ===========================================================================
//
// OpenRouter model IDs embed the vendor prefix before the first `/`:
//   "anthropic/claude-opus-4.8"   → vendor "anthropic"
//   "openai/gpt-5.6-luna-pro"     → vendor "openai"
//   "~openai/gpt-mini-latest"     → vendor "openai" (tilde = free variant)
//
// These utilities extract the prefix, map it to a display name + logo, and
// group model-selector entries by vendor for the settings UI.

/**
 * Extract the vendor prefix from an OpenRouter model ID.
 *
 * Strips a leading `~` (used by OpenRouter for free/optional variants) before
 * splitting on `/`. Returns `""` for IDs with no separator (ungrouped).
 */
export function getOpenRouterVendorPrefix(modelId: string): string {
  const stripped = modelId.startsWith('~') ? modelId.slice(1) : modelId;
  const slashIdx = stripped.indexOf('/');
  if (slashIdx === -1) return '';
  return stripped.slice(0, slashIdx);
}

/** Hardcoded display names for known OpenRouter vendor prefixes. */
const VENDOR_DISPLAY_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  qwen: 'Qwen',
  google: 'Google',
  mistralai: 'Mistral',
  anthropic: 'Anthropic',
  'z-ai': 'Z.ai',
  nvidia: 'NVIDIA',
  deepseek: 'DeepSeek',
  'meta-llama': 'Meta',
  minimax: 'MiniMax',
  moonshotai: 'MoonshotAI',
  'x-ai': 'xAI',
  cohere: 'Cohere',
  openrouter: 'OpenRouter',
  amazon: 'Amazon',
  perplexity: 'Perplexity',
  nousresearch: 'Nous',
  'aion-labs': 'AionLabs',
  tencent: 'Tencent',
  poolside: 'Poolside',
  'bytedance-seed': 'ByteDance Seed',
  thedrummer: 'TheDrummer',
  sao10k: 'Sao10K',
  inclusionai: 'inclusionAI',
  'arcee-ai': 'Arcee AI',
  'nex-agi': 'Nex AGI',
  stepfun: 'StepFun',
  'ibm-granite': 'IBM',
  rekaai: 'Reka',
  liquid: 'LiquidAI',
  relace: 'Relace',
  cognitivecomputations: 'Venice',
  morph: 'Morph',
  microsoft: 'Microsoft',
  inflection: 'Inflection',
  sakana: 'Sakana',
  perceptron: 'Perceptron',
  kwaipilot: 'Kwaipilot',
  inception: 'Inception',
  upstage: 'Upstage',
  writer: 'Writer',
  allenai: 'AllenAI',
  deepcogito: 'Deep Cogito',
  ai21: 'AI21',
  bytedance: 'ByteDance',
  baidu: 'Baidu',
  'anthracite-org': 'Anthracite',
  mancer: 'Mancer',
  undi95: 'Undi95',
  gryphe: 'Gryphe',
};

/**
 * Resolve a human-readable display name for an OpenRouter vendor prefix.
 *
 * Uses a hardcoded map for known prefixes; falls back to title-casing the
 * prefix with hyphens replaced by spaces.
 */
export function getOpenRouterVendorDisplayName(prefix: string): string {
  const known = VENDOR_DISPLAY_NAMES[prefix];
  if (known) return known;

  // Fallback: capitalize first letter, replace hyphens with spaces.
  const spaced = prefix.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Strip the `"Vendor: "` prefix from an OpenRouter display name.
 *
 * OpenRouter discovery formats display names as `"Vendor: Model Name"`.
 * This removes everything up to and including the first `": "` so the
 * model card shows just the model name. If no `": "` separator is found
 * (e.g. tilde meta-models like `"OpenAI GPT Mini Latest"`), the name is
 * returned unchanged.
 */
export function stripOpenRouterVendorPrefix(displayName: string): string {
  const idx = displayName.indexOf(': ');
  if (idx === -1) return displayName;
  return displayName.slice(idx + 2);
}

/**
 * Group model-selector entries by their OpenRouter vendor prefix.
 *
 * Entries are sorted by model count descending, then alphabetically by
 * vendor display name. Entries with no vendor prefix (no `/` in the model
 * ID) go into a catch-all group with `displayName: "Other"`.
 *
 * Display names are cleaned of the `"Vendor: "` prefix so the UI can
 * render `entry.displayName` directly without per-provider logic.
 */
export function groupOpenRouterEntriesByVendor(
  entries: ModelSelectorEntry[],
): VendorGroup[] {
  const map = new Map<string, ModelSelectorEntry[]>();

  for (const entry of entries) {
    const prefix = getOpenRouterVendorPrefix(entry.modelId);
    const key = prefix || '';
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      map.set(key, [entry]);
    }
  }

  const groups: VendorGroup[] = [];
  for (const [prefix, groupEntries] of Array.from(map)) {
    const displayName =
      prefix === '' ? 'Other' : getOpenRouterVendorDisplayName(prefix);
    groups.push({
      prefix,
      displayName,
      logo: getOpenRouterVendorLogo(prefix),
      entries: groupEntries.map((entry) => ({
        ...entry,
        displayName: stripOpenRouterVendorPrefix(entry.displayName),
      })),
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
