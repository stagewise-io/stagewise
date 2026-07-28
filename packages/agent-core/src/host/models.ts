import type { LanguageModel, streamText } from 'ai';
import type { ModelCapabilities } from '../types/models';
import type { ReasoningSignatureSource } from '../types/metadata';

/**
 * The host-specific provider routing mode for a resolved model.
 *
 * - `stagewise` — routed through Stagewise Inference.
 * - `official` — routed through the vendor's official API using user-
 *   supplied credentials.
 * - `custom` — routed through a user-configured custom endpoint.
 */
export type ProviderMode = 'stagewise' | 'official' | 'custom';

/**
 * Purpose for a host model resolution request.
 *
 * Hosts may use this metadata to decide whether user-facing runtime
 * preferences should affect the returned provider options. Missing purpose
 * should be treated as `internal` for backward compatibility.
 */
export type ModelRequestPurpose = 'agent-step' | 'internal';

export const MODEL_REQUEST_PURPOSE_METADATA_KEY = '$model_request_purpose';

/**
 * Reserved metadata key for passing the active provider instance ID
 * through `HostModels.getWithOptions`. The host reads this to resolve
 * the correct provider instance for the model, enabling the
 * model × instance architecture where the same modelId can be served
 * by different provider instances.
 *
 * When absent, the host falls back to its legacy vendor-based routing.
 */
export const PROVIDER_INSTANCE_ID_METADATA_KEY = '$provider_instance_id';

/**
 * Reserved metadata key for passing a thinking override for a utility
 * model call (title generation, context compression). The host reads
 * this to apply per-model thinking configuration to internal calls
 * that would otherwise skip thinking resolution.
 *
 * The value must be a {@link UtilityModelThinkingOverride} or omitted.
 */
export const UTILITY_THINKING_OVERRIDE_METADATA_KEY =
  '$utility_thinking_override';

/**
 * Reserved metadata key for passing a preset's thinking override for
 * the main agent step. The host reads this to apply the active
 * preset's per-model thinking configuration, taking precedence over
 * the global `modelThinkingOverrides` stored in preferences.
 *
 * The value must be a {@link UtilityModelThinkingOverride} or omitted.
 */
export const PRESET_THINKING_OVERRIDE_METADATA_KEY =
  '$preset_thinking_override';

/**
 * Thinking override shape for utility model calls. Mirrors the host's
 * `ModelThinkingOverride` but kept as a structural type so agent-core
 * does not depend on host-side schema definitions.
 */
export interface UtilityModelThinkingOverride {
  enabled?: boolean;
  provider?: string;
  value?: string;
}

/**
 * A model entry in a utility model list, carrying optional thinking
 * override so the host can apply per-model thinking configuration.
 */
export interface UtilityModelEntry {
  modelId: string;
  providerInstanceId?: string;
  thinkingOverride?: UtilityModelThinkingOverride;
}

/**
 * Fully-resolved model with all the options `BaseAgent` needs to
 * invoke `streamText` / `generateText`.
 *
 * Produced by `HostModels.getWithOptions`. The concrete shape mirrors
 * the host's `ModelProviderService.getModelWithOptions` return value
 * so hosts do not have to repack the data.
 */
export interface ModelWithOptions {
  /** Ready-to-stream `ai-sdk` language model with any host middleware applied. */
  model: LanguageModel;
  /**
   * Provider-keyed options (e.g. `{ anthropic: {…}, stagewise: {…} }`),
   * passed through to `streamText` as-is. Callers may layer further
   * overrides via `deepMergeProviderOptions`.
   */
  providerOptions: Parameters<typeof streamText>[0]['providerOptions'];
  /** Request headers the host wants applied to every call. */
  headers: Record<string, string>;
  /** Total context window size in tokens for this model. */
  contextWindowSize: number;
  /** Host-specific routing mode that produced this model. */
  providerMode: ProviderMode;
  /**
   * Host-specific identifier for a connected coding/subscription plan
   * (e.g. `'glm-coding-plan'`). Only populated when `providerMode ===
   * 'official'` and the user connected via a coding plan rather than a
   * plain API key. Core stays agnostic — passes the string through to
   * telemetry.
   */
  connectedCodingPlanId?: string;
  /** Stable host-defined provider type used for aggregate telemetry. */
  providerType?: string;
  /**
   * Semantic owner of any signed `reasoning_details` this route produces.
   * Threaded through the step so capture tags the metadata and conversion
   * re-injects signatures only for matching future routes. Optional: hosts
   * that don't track reasoning signatures may omit it (capture/replay then
   * no-op). See {@link ReasoningSignatureSource}.
   */
  reasoningSignatureSource?: ReasoningSignatureSource;
  /**
   * When true, the agent must strip the `strict` field from every tool
   * definition before passing them to `streamText`. Required for
   * providers whose backend rejects unknown fields on the tool payload
   * — notably Bedrock-on-Anthropic, where `strict` surfaces as
   * `tools.0.custom.strict: Extra inputs are not permitted`.
   */
  stripStrictFromTools?: boolean;
}

/**
 * Model-retrieval contract supplied by the host.
 *
 * agent-core consumes ready-to-stream `ai-sdk` language models; the
 * host is responsible for auth, provider routing, endpoint selection,
 * and any telemetry/tracing middleware wrapped around the model.
 *
 * `getWithOptions` is the primary entry point used by `BaseAgent`. The
 * lighter `get` variant exists as a convenience for call sites that
 * only need the model itself and is implemented in terms of
 * `getWithOptions` by default adapters.
 */
export interface HostModels {
  /**
   * Returns a fully-resolved {@link ModelWithOptions} for `modelId`,
   * with auth, provider routing, and telemetry middleware already
   * applied.
   *
   * Rejects with an `Error` whose `.message` names the missing model
   * when `modelId` is unknown, or whose `.message` describes the
   * upstream failure when provider resolution or auth fails.
   *
   * `traceId` is passed through so the host can attach it to any
   * telemetry/middleware it wraps around the returned model.
   * `metadata` carries optional host-specific trace properties
   * (currently used for PostHog). Hosts may also read the reserved
   * {@link MODEL_REQUEST_PURPOSE_METADATA_KEY} key to distinguish
   * user-facing agent steps from internal utility calls. Missing purpose
   * must be treated as `internal` for backward compatibility.
   */
  getWithOptions(
    modelId: string,
    traceId: string,
    metadata?: Record<string, unknown>,
  ): Promise<ModelWithOptions>;

  /**
   * Convenience shortcut for `getWithOptions(...).then(r => r.model)`.
   * Intended for sites that only need the `LanguageModel`.
   */
  get(modelId: string, traceId: string): Promise<LanguageModel>;

  /**
   * Synchronous existence check. Cheap; intended for UI-facing
   * fallbacks ("model unavailable, use default?"). Discovered models
   * require their owning provider instance ID.
   */
  has(modelId: string, providerInstanceId?: string): boolean;

  /**
   * Returns the user-configured ordered list of model IDs for a
   * background utility task (title generation, context compression).
   *
   * The first element is the primary; subsequent entries are
   * fallbacks tried in order. An empty array (or an unimplemented
   * method) signals the caller to use its built-in default list.
   *
   * Hosts that expose user-configurable utility models implement this;
   * other hosts can omit it.
   */
  getUtilityModelIds?(
    task: 'title-generation' | 'context-compression',
  ): string[] | undefined;

  /**
   * Returns the user-configured ordered list of model entries for a
   * background utility task, including per-model thinking overrides.
   *
   * When implemented, takes precedence over {@link getUtilityModelIds}.
   * Each entry carries a `modelId`, optional `providerInstanceId`, and
   * optional `thinkingOverride` so the host can apply per-model
   * thinking configuration to internal utility calls.
   */
  getUtilityModelEntries?(
    task: 'title-generation' | 'context-compression',
  ): UtilityModelEntry[] | undefined;

  /**
   * Returns the active preset's ID from user preferences, or
   * `undefined` when no preset is active.
   *
   * Used by the agent's fallback manager to detect preset changes
   * and reset the fallback pointer to the primary model (index 0).
   */
  getActivePresetId?(): string | undefined;

  /**
   * Returns the active preset's full ordered list of model entries
   * (main model first, then fallbacks), or `undefined` when no
   * preset is active.
   *
   * Each entry carries `modelId`, optional `providerInstanceId`, and
   * optional `thinkingOverride`. Used by the fallback manager to
   * cycle through models on upstream-overload errors.
   */
  getActivePresetModels?(): UtilityModelEntry[] | undefined;

  /**
   * Returns the {@link ModelCapabilities} for `modelId` (input/output
   * modalities, per-modality constraints, tool-calling support).
   *
   * Cheap, synchronous, and side-effect free: capabilities are static
   * metadata sourced from the host's model catalog (built-in plus any
   * user-defined custom models). Hosts that resolve capabilities over
   * a wire should cache aggressively or pre-load on boot so this method
   * remains synchronous from the core's perspective.
   *
   * Falls back to a text-only capability set when the model is unknown
   * (e.g. a deleted custom model) so callers never have to handle a
   * missing-model branch separately.
   */
  getCapabilities(modelId: string): ModelCapabilities;
}
