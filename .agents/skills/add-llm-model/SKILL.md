---
name: add-llm-model
description: Use when adding a new LLM/model to stagewise model catalogs, provider instances, routing, validation, docs, or showcase UI.
---

# Add LLM Model

Use this workflow when adding or updating model support in stagewise.

## Architecture First

Models are no longer a single global enabled/disabled list. Routing and model
availability are scoped to entries in `preferences.providerInstances`.

- `apps/browser/src/shared/available-models.ts` is the curated metadata catalog.
- `apps/browser/src/backend/agents/providers/` contains stateless provider-type
  implementations. `registry.ts` maps each `ProviderInstanceTypeId` to its type.
- `apps/browser/src/backend/agents/model-provider.ts` resolves a provider
  instance, then delegates ID conversion and model creation to its provider type.
- Each provider instance owns `enabledModelIds`, `disabledModelIds`, and
  `discoveredModels`.
- `apps/browser/src/shared/flagship-models.ts` curates newly discovered models
  per provider instance. Catalog models on official APIs are considered
  flagship. OpenRouter has its own prefixed-ID flagship set.

Read those files and the relevant provider implementation before deciding the
change surface. Do not apply guidance written for the old global model list.

## Required Checks

1. **Research authoritative metadata.**
   - Confirm the canonical ID, native provider ID, context window, modalities,
     tool support, reasoning support, and pricing.
   - Prefer provider documentation for native behavior and OpenRouter data for
     the Stagewise/OpenRouter route.
   - Keep still-supported sibling models unless removal was explicitly requested.

2. **Add or update catalog metadata.**
   - Edit `apps/browser/src/shared/available-models.ts`.
   - Match the field order and provider options of the nearest sibling.
   - Update `apps/browser/src/shared/model-thinking-capabilities.ts` when the
     model supports configurable thinking/reasoning.

3. **Audit provider-instance routing.**
   - Inspect `apps/browser/src/backend/agents/providers/registry.ts` and the
     relevant implementation in `apps/browser/src/backend/agents/providers/`.
   - Existing providers are normally model-agnostic; do not add a per-model
     branch unless the wire ID or API behavior genuinely differs.
   - Put canonical-to-wire ID conversion in the provider type's
     `toWireModelId`, not in new branches in the central model provider.
   - Stagewise routing prefixes canonical IDs for OpenRouter in
     `providers/stagewise.ts`.
   - Explicit custom endpoint `modelIdMapping` values must override defaults.

4. **Curate discovery intentionally.**
   - For OpenRouter, update `OPENROUTER_FLAGSHIP_MODELS` in
     `apps/browser/src/shared/flagship-models.ts` when the new model should be
     enabled on first discovery. IDs must include the OpenRouter vendor prefix.
   - Remove a superseded model from that set only if it should stop being a
     default for *new discovery*. Existing user choices are intentionally
     preserved by `computeDisabledModelIdsAfterDiscovery`.
   - Official-provider catalog entries are already treated as flagship; do not
     duplicate them in `VENDOR_FLAGSHIP_DISCOVERED_MODELS`.

5. **Do not seed model deprecations in the legacy provider migration.**
   - Never add a new model ID to the `stagewise-default.disabledModelIds`
     literal inside `PreferencesService.migrateToProviderInstances`.
   - That function runs only when `providerInstances` is empty. Such a change
     affects only users crossing the legacy migration and misses users whose
     instances already exist, creating inconsistent availability.
   - Do not patch the ID on every startup either; that would override a user's
     later decision to re-enable the model.
   - If product requirements call for changing existing users' model choices,
     ask first and implement an explicit, idempotent, versioned preference
     migration with tests. Define which provider-instance types are in scope
     and preserve choices after the migration has run once.
   - If the old model remains supported, keep it in the catalog and leave
     existing per-instance state untouched. Discovery flagship curation controls
     defaults for newly discovered provider models.

6. **Keep credential validation cheap and broadly available.**
   - Validation now belongs to the provider type's `validateCredentials`
     implementation, usually in `providers/official-api.ts`, rather than being
     hardcoded in central routing.
   - Do not switch validation to a new flagship/high-tier model by default.
     Prefer a cheap model broadly available to provider keys.
   - Legacy `validate-api-keys.ts` paths may still exist for compatibility;
     inspect callers before editing them.

7. **Audit other product surfaces rather than editing mechanically.**
   - Coding plans: `apps/browser/src/shared/coding-plans.ts`.
   - Homepage showcase:
     `apps/website/src/app/(home)/_components/model-provider-showcase.tsx`.
   - README files and localized variants.
   - Thinking tests, provider tests, and model-selector tests.
   - Historical benchmark/comparison copy must not be renamed without evidence.

8. **Always verify subscription-plan base URLs.**
   - Many providers use **different API endpoints** for subscription/token-plan keys vs. pay-as-you-go (BYOK) keys.
   - Example: GLM uses `https://api.z.ai/api/paas/v4` for BYOK but `https://api.z.ai/api/coding/paas/v4` for coding-plan subscriptions. Xiaomi MiMo uses `https://api.xiaomimimo.com/v1` for BYOK but `https://token-plan-cn.xiaomimimo.com/v1` for token-plan subscriptions.
   - The two key types are often **non-interchangeable** — a subscription key will be rejected by the BYOK endpoint and vice versa.
   - Before finalizing a coding-plan entry, **always** check the provider's official documentation to confirm:
     - Whether subscription tokens require a separate `baseUrl` / `validationBaseUrl`.
     - The correct cluster or region-specific URL (some providers offer multiple regional endpoints for subscriptions).
     - The API key format prefix (e.g. `tp-` for MiMo token plan vs `sk-` for BYOK).
   - Set `baseUrl`, `validationBaseUrl`, `validationModelId`, `apiKeyPattern`, and `endpointHelpText` on the coding-plan entry accordingly.
   - If the provider exposes documentation via `llms.txt`, fetch it — it links to raw markdown doc pages that contain the authoritative endpoint and auth details.
   - Update `apiKeyUrl` and `helpText` to point to the subscription management page (not the BYOK API keys page) when the two are separate.

## Validation

After changes:

- Run targeted tests for catalog metadata, thinking capabilities, flagship
  discovery, provider routing, and any preference migration touched.
- Run browser typecheck and Biome on all edited files.
- Search for the new and superseded model IDs across browser and website code.
- Confirm Stagewise/OpenRouter and official-provider wire IDs independently.
- Confirm docs, coding-plan `featuredModelIds`, and showcase entries are
  intentionally aligned.
- If preference migration changed, test both empty and already-populated
  `providerInstances`, idempotence, and preservation of user choices.
