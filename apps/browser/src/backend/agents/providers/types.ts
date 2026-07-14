import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { LanguageModelMiddleware } from 'ai';
import type {
  ApiSpec,
  DiscoveredModel,
  ModelProvider,
  ProviderEndpointMode,
} from '@shared/karton-contracts/ui/shared-types';
import type { ProviderInstanceTypeId } from '@shared/karton-contracts/ui/shared-types';

/**
 * Provider category — drives UI grouping and routing behavior.
 */
export type ProviderCategory =
  | 'default'
  | 'official-api'
  | 'cloud'
  | 'custom-compatible'
  | 'self-hosted';

/**
 * Stateless definition of a provider type. One folder = one provider.
 * The routing layer resolves a provider instance → its type → calls
 * `createLanguageModel` to get a concrete AI-SDK model.
 *
 * The routing layer decrypts `sensitiveFields` and passes the decrypted
 * values as a `decryptedConfig` map to `createLanguageModel`.
 */
export interface ProviderType<C = Record<string, unknown>> {
  // ── Identity ──────────────────────────────────────────────────────────

  /** Unique type ID matching a `ProviderInstanceTypeId` literal. */
  readonly id: ProviderInstanceTypeId;
  /** Human-readable name for UI display. */
  readonly displayName: string;
  /** Short description for UI display. */
  readonly description: string;
  /** Category for UI grouping and routing classification. */
  readonly category: ProviderCategory;

  // ── Vendor association ────────────────────────────────────────────────

  /**
   * The `ModelProvider` vendor this type serves, when applicable.
   * - `official-api` types: the vendor (e.g. `'anthropic'` for `anthropic-api`)
   * - `coding-plan` type: `undefined` — vendor is resolved per-instance from `planId`
   * - `custom-compatible` / `cloud` types: `undefined`
   * - `stagewise` type: `undefined`
   */
  readonly vendor?: ModelProvider;

  // ── UI metadata (consolidated from scattered registries) ──────────────

  /** URL to the provider's API key dashboard (for "Get API key" links). */
  readonly getApiKeyUrl?: string;
  /** Default base URL when the user doesn't provide one. */
  readonly defaultBaseUrl?: string;

  // ── Routing metadata ──────────────────────────────────────────────────

  /** The endpoint mode this type operates in. */
  readonly providerMode: ProviderEndpointMode;
  /**
   * The `ApiSpec` this type uses, for thinking-provider resolution and
   * reasoning signature computation. `undefined` for `stagewise` (no apiSpec).
   */
  readonly apiSpec?: ApiSpec;
  /** When true, the agent must strip `strict` from tool definitions. */
  readonly stripStrictFromTools?: boolean;

  // ── Config ────────────────────────────────────────────────────────────

  /** Config field names that should be decrypted before being passed to `createLanguageModel`. */
  readonly sensitiveFields: readonly string[];

  // ── Discovery ─────────────────────────────────────────────────────────

  /**
   * Validate the full config (not just an API key). Returns success/failure.
   * Optional — only discovery providers need this.
   */
  validateCredentials?(
    config: C,
    decryptedConfig: Record<string, string>,
  ): Promise<{ success: true } | { success: false; error: string }>;

  /**
   * Fetch the initial set of models available from this provider.
   * Called after instance creation to populate `discoveredModels`.
   * `decryptedConfig` contains decrypted values for every field in
   * `sensitiveFields`, keyed by field name.
   */
  getInitialModels?(
    config: C,
    decryptedConfig: Record<string, string>,
  ): Promise<DiscoveredModel[]>;

  /**
   * Re-fetch available models. Defaults to calling `getInitialModels`.
   * Called by the `refreshInstanceModels` Karton procedure.
   */
  refreshModels?(
    config: C,
    decryptedConfig: Record<string, string>,
  ): Promise<DiscoveredModel[]>;

  // ── Model ID transforms ───────────────────────────────────────────────

  /**
   * Convert a canonical model ID to the wire format expected by the
   * provider's API. Default: identity.
   *
   * For the stagewise type, `vendor` is the model's `officialProvider`
   * and the method produces the OpenRouter-prefixed ID.
   */
  toWireModelId?(modelId: string, vendor?: ModelProvider): string;

  // ── Model creation ────────────────────────────────────────────────────

  /**
   * Create a concrete AI-SDK language model.
   *
   * `config` is the raw instance config (non-sensitive fields readable
   * directly, sensitive fields still encrypted).
   * `decryptedConfig` contains the decrypted values for every field
   * listed in `sensitiveFields`, keyed by field name.
   * `apiKey` is the decrypted primary API key (convenience — equals
   * `decryptedConfig.encryptedApiKey` for most types).
   * `baseURL` is resolved from config `baseUrl` or `defaultBaseUrl`.
   * `vendor` is the model's `officialProvider`, passed to stagewise and
   * coding-plan types so they can prefix/delegate correctly.
   */
  createLanguageModel(args: {
    modelId: string;
    apiKey: string;
    baseURL?: string;
    config: C;
    decryptedConfig: Record<string, string>;
    vendor?: ModelProvider;
  }): {
    model: LanguageModelV3;
    middleware?: LanguageModelMiddleware[];
  };
}
