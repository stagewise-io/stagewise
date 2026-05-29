import type { LanguageModel, streamText } from 'ai';
import type { ModelCapabilities } from '../types/models';
import type { ReasoningSignatureSource } from '../types/metadata';

/**
 * The host-specific provider routing mode for a resolved model.
 *
 * - `stagewise` — routed through the stagewise LLM gateway.
 * - `official` — routed through the vendor's official API using user-
 *   supplied credentials.
 * - `custom` — routed through a user-configured custom endpoint.
 */
export type ProviderMode = 'stagewise' | 'official' | 'custom';

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
   * (currently used for PostHog) and must not change the returned
   * model's semantics.
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
   * fallbacks ("model unavailable, use default?").
   */
  has(modelId: string): boolean;

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
