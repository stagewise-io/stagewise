---
name: add-llm-model
description: Use when adding a new LLM/model to stagewise model catalogs, provider routing, validation, docs, or showcase UI.
---

# Add LLM Model

Use this workflow when adding or updating model support in stagewise.

## Required Checks

1. Inspect existing provider entries before editing.
   - Read `apps/browser/src/shared/available-models.ts` around the provider.
   - Keep still-supported sibling models. Do not replace old models with the new one unless explicitly requested.

2. Wire the model through all relevant product surfaces.
   - Model catalog: `apps/browser/src/shared/available-models.ts`.
   - Provider routing: `apps/browser/src/backend/agents/model-provider.ts`.
   - API-key validation: `apps/browser/src/backend/utils/validate-api-keys.ts`.
   - Coding plans: `apps/browser/src/shared/coding-plans.ts`.
   - Website showcase: `apps/website/src/app/(home)/_components/model-provider-showcase.tsx`.
   - README files and localized README variants.

3. Keep plan docs aligned with plan config.
   - If `featuredModelIds` lists multiple models, README subscription tables must list the same featured lineup in readable display names.
   - The later full model lists may include more models, but must not contradict the plan table.

4. Preserve showcase truthfulness.
   - If the homepage showcase is curated, make that intentional.
   - Otherwise include still-supported sibling models so marketing does not understate provider support.

5. Handle provider-native IDs everywhere requests can route.
   - Internal model IDs may differ from native provider IDs.
   - Apply native ID mapping in official provider mode.
   - Apply the same default native ID mapping for built-in models routed through custom endpoints.
   - Explicit `customEndpoint.modelIdMapping` must always override default mapping.

6. Validate API keys with broadly accessible probes.
   - Do not validate a provider exclusively against the newest or highest-tier model if older supported models remain available.
   - Prefer a cheap broadly available model, or fallback probes that accept success from any supported entitlement.
   - Keep validation errors compatible with existing `{ success: false; error: string }` callers.

7. **Always verify subscription-plan base URLs.**
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

- Run targeted LSP/lint diagnostics on edited files.
- Search for the new model ID and display name across code/docs.
- Confirm request routing uses native provider IDs in official and built-in custom endpoint modes.
- Confirm docs, coding-plan `featuredModelIds`, and showcase entries are intentionally aligned.
