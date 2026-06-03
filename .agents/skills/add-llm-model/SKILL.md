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

## Validation

After changes:

- Run targeted LSP/lint diagnostics on edited files.
- Search for the new model ID and display name across code/docs.
- Confirm request routing uses native provider IDs in official and built-in custom endpoint modes.
- Confirm docs, coding-plan `featuredModelIds`, and showcase entries are intentionally aligned.
