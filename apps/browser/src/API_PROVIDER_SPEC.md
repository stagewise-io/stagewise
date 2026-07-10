# API Provider Spec

## Current state

Routing is **per-provider, not per-model**. Every built-in model has a hard-coded `officialProvider` (e.g. `claude-opus-4.8` → `'anthropic'`). At request time, `model-provider.ts` looks up `providerConfigs[officialProvider]` — a single config with one `mode` (`stagewise` | `official` | `custom`) and one `customProviderId` slot.

**Consequences:**

- All Anthropic models share one route. Can't run Opus via Bedrock and Sonnet via stagewise at the same time.
- Same model via two custom endpoints? Impossible. One `customProviderId` per provider.
- Custom models (`customModelSchema`) do route per-endpoint, but the UI blocks any `modelId` that collides with a built-in — so you can't create a second `claude-opus-4.8` either.
- OpenRouter requires the "custom model" flow: manual one-by-one, no discovery, no model list fetch.
- Adding a provider touches 6 scattered places (`PROVIDER_DISPLAY_INFO`, `PROVIDER_OFFICIAL_URLS`, `PROVIDERS` array, `apiSpecMap`, `OPENROUTER_PROVIDER_MAP`, `API_SPEC_OPTIONS`).

## Where we're going

**Two layers:**

### Provider type (plug-in, one folder each)

`providers/<type-id>/index.ts` + `logo.svg`

Stateless definition. Implements the `ProviderType` interface:

```ts
interface ProviderType<C = ProviderInstanceConfig> {
  // Identity & UI
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly logo: string;
  readonly category: 'default' | 'official-api' | 'aggregator' | 'cloud' | 'self-hosted';
  readonly getApiKeyUrl?: string;

  // Instance constraints
  readonly allowMultiple: boolean;            // stagewise = false, everything else = true
  readonly defaultInstanceName: string;
  readonly configSchema: ZodSchema<C>;        // drives the add-provider form
  readonly sensitiveFields: readonly (keyof C)[];  // which fields get encrypted at rest

  // Credential validation (optional — Ollama doesn't need it)
  validateCredentials?(config: C): Promise<{ success: true } | { success: false; error: string }>;

  // Model discovery
  getInitialModels(config: C): Promise<DiscoveredModel[]>;
  refreshModels?(config: C): Promise<DiscoveredModel[]>;  // defaults to getInitialModels

  // Model instantiation — replaces apiSpec + apiSpecMap
  createLanguageModel(args: { modelId: string; config: C; contextWindowSize: number }): {
    model: LanguageModel;
    middleware?: LanguageModelMiddleware[];
  };

  // Canonical → wire format ID translation (Bedrock region prefix, etc.)
  toWireModelId?(modelId: string, config: C): string;  // default: identity

  // Provider-specific request headers (e.g. OpenRouter HTTP-Referer)
  getHeaders?(modelId: string): Record<string, string>;  // default: {}

  // Thinking / reasoning — replaces the resolveThinkingProviderOptions switch
  thinking?: {
    namespace: string;  // 'anthropic', 'openai', 'stagewise', 'google'
    buildOptions(model: ModelSettings, override?: ThinkingOverride): Record<string, unknown>;
  };

  // Capability inference for non-catalog discovered models
  inferCapabilities?(model: DiscoveredModel): ModelCapabilities;  // default: text + tools

  // Quirks
  readonly stripStrictFromTools?: boolean;
}
```

Official API types offer catalog models via a helper, not boilerplate:

```ts
getInitialModels: () => catalogByVendor('anthropic')  // filters availableModels by officialProvider
```

One folder = one provider. Adding a provider = adding a folder. No scattered registries.

### Provider instance (user data)

```ts
{
  id: string               // unique instance ID
  typeId: string           // provider type ("openrouter", "anthropic-api", "stagewise", ...)
  name: string             // user-chosen, defaults to type display name
  config: ProviderInstanceConfig   // type-specific, encrypted sensitiveFields
  enabledModelIds: string[]
  discoveredModels?: DiscoveredModel[]  // cache from discovery/refresh — selector fallback for non-catalog models
}
```

N instances per type. `stagewise` seeded as default on first run. Flat list in preferences.

### DiscoveredModel

Stored on the instance so the selector can render non-catalog models without re-fetching:

```ts
type DiscoveredModel = {
  modelId: string;          // canonical, used for storage + catalog matching
  displayName: string;
  description?: string;
  contextWindow?: number;
  pricing?: { inputPerMillion: number; outputPerMillion: number };
  capabilities?: ModelCapabilities;
  thinkingEnabled?: boolean;
  recommended?: boolean;    // pre-checked in the add flow
}
```

## Model offerings

- `availableModels.ts` stays the **canonical catalog** for metadata (pricing, context, capabilities, thinking config).
- Provider types **reference** the catalog, don't duplicate it. `getInitialModels` returns catalog refs where `officialProvider` matches, or matches by bare modelId after stripping vendor prefixes (OpenRouter: `anthropic/claude-opus-4.8` → `claude-opus-4.8`).
- Unmatched models get standalone text-only entries. No restriction to catalog-only models.
- Capabilities inferred per provider type. Matched → full metadata. Unmatched → conservative fallback (text + tool calling, nothing else).
- Selector lookup order: catalog → instance's `discoveredModels` cache → text-only fallback.

## Selector

`model × instance` entries. Keyed by `(instanceId, modelId)`. `disabledModelIds` and `modelThinkingOverrides` switch from modelId-keyed to instance-keyed.

## Routing

`createModelWithOptions` resolves by instance ID → calls `providerType.createLanguageModel()`. `providerConfigs` mode enum disappears. `apiSpec`, `apiSpecMap`, `OPENROUTER_PROVIDER_MAP`, `PROVIDER_OFFICIAL_URLS` all fold into their type files.

**Not on the interface** (stay in routing/services layer):
- Tracing (`withTracing` wraps every model regardless of type)
- Encryption (interface declares *what* via `sensitiveFields`; preferences service handles *how*)
- Stagewise auth token resolution (routing layer injects auth service's access token into the instance config)

## Migration

Existing `providerConfigs` (modes + keys), `customEndpoints`, and `connectedCodingPlanId` fold into the flat instance list. One-time JSON migration function, runs early, early-exits if already migrated. SQLite has proper migration infra (`packages/agent-core/src/services/diff-history/migrations/`); preferences JSON gets a rock-solid one-shot migrator.

## PR sequence

1. **Provider instance schema + migration** — flat instance list, migrate existing config, routing via instances. No UI changes.
2. **Provider type interface + registry** — define interface, migrate all existing types into it, wire routing through `createLanguageModel()`.
3. **Model offerings + selector** — `model × instance` entries, instance-keyed disable/thinking.
4. **OpenRouter / Ollama connect card** — discovery via `getInitialModels`, refresh button, bulk-enable.
