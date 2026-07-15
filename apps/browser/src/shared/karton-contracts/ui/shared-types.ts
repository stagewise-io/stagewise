import { modelCapabilitiesSchema } from '@stagewise/agent-core/types';
import { z } from 'zod';
import { codingPlanIds } from '../../coding-plan-ids';

export {
  environmentDiffSnapshotSchema,
  fileDiffSnapshotSchema,
  MAX_DIFF_TEXT_FILE_SIZE,
  modelCapabilitiesSchema,
  modalityConstraintSchema,
} from '@stagewise/agent-core/types';
export type {
  BlamedHunk,
  BlamedLineChange,
  EnvironmentDiffSnapshot,
  ExternalFileDiff,
  ExternalFileResult,
  FileDiff,
  FileDiffSnapshot,
  FileResult,
  ModelCapabilities,
  ModelSettings,
  ModalityConstraint,
  StagewiseProviderOptions,
  TextFileDiff,
  TextFileResult,
} from '@stagewise/agent-core/types';

// ============================================================================
// Model Provider Configuration
// ============================================================================

/** Supported LLM provider identifiers */
export const modelProviderSchema = z.enum([
  'anthropic',
  'openai',
  'google',
  'moonshotai',
  'alibaba',
  'deepseek',
  'z-ai',
  'minimax',
  'xiaomi-mimo',
  'mistral',
]);
export type ModelProvider = z.infer<typeof modelProviderSchema>;

export const socialAuthProviderSchema = z.enum(['google', 'github']);
export type SocialAuthProvider = z.infer<typeof socialAuthProviderSchema>;

/** Endpoint mode for a provider */
export const providerEndpointModeSchema = z.enum([
  'stagewise',
  'official',
  'custom',
]);
export type ProviderEndpointMode = z.infer<typeof providerEndpointModeSchema>;

export const connectedCodingPlanIdSchema = z
  .enum(codingPlanIds)
  .optional()
  .catch(undefined);
export type ConnectedCodingPlanId = z.infer<typeof connectedCodingPlanIdSchema>;

/** Configuration for a single provider endpoint */
export const providerConfigSchema = z.object({
  /** Which endpoint to route requests to */
  mode: providerEndpointModeSchema.default('stagewise'),
  /** Base64-encoded safeStorage-encrypted API key (encrypted on backend, opaque to UI) */
  encryptedApiKey: z.string().optional(),
  /** ID of a custom endpoint to use (only when mode is 'custom') */
  customProviderId: z.string().optional(),
  /** Coding plan currently connected through this provider, when applicable. */
  connectedCodingPlanId: connectedCodingPlanIdSchema,
  /** @deprecated Migrated to customProviderId — kept for backwards compat parsing */
  customBaseUrl: z.string().optional(),
});
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

/** Provider configurations for all supported providers */
export const providerConfigsSchema = z.object({
  anthropic: providerConfigSchema.default({ mode: 'stagewise' }),
  openai: providerConfigSchema.default({ mode: 'stagewise' }),
  google: providerConfigSchema.default({ mode: 'stagewise' }),
  moonshotai: providerConfigSchema.default({ mode: 'stagewise' }),
  alibaba: providerConfigSchema.default({ mode: 'stagewise' }),
  deepseek: providerConfigSchema.default({ mode: 'stagewise' }),
  'z-ai': providerConfigSchema.default({ mode: 'stagewise' }),
  minimax: providerConfigSchema.default({ mode: 'stagewise' }),
  'xiaomi-mimo': providerConfigSchema.default({ mode: 'stagewise' }),
  mistral: providerConfigSchema.default({ mode: 'stagewise' }),
});
export type ProviderConfigs = z.infer<typeof providerConfigsSchema>;

// ============================================================================
// Custom Endpoints & Custom Models
// ============================================================================

/** API spec that a custom endpoint implements */
const apiSpecValues = [
  'anthropic',
  'openai-chat-completions',
  'openai-responses',
  'google',
  'azure',
  'amazon-bedrock',
  'google-vertex',
] as const;
export const apiSpecSchema = z
  .string()
  .transform((val) => {
    // Migration: remap old 'openai' value to 'openai-chat-completions'
    if (val === 'openai') return 'openai-chat-completions' as const;
    return val as (typeof apiSpecValues)[number];
  })
  .pipe(z.enum(apiSpecValues));
export type ApiSpec = z.infer<typeof apiSpecSchema>;

/** A user-defined API endpoint */
export const customEndpointSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  apiSpec: apiSpecSchema,
  baseUrl: z.string(),
  encryptedApiKey: z.string().optional(),
  /** Maps built-in model IDs to the IDs expected by this endpoint */
  modelIdMapping: z.record(z.string(), z.string()).optional(),
  // Azure-specific fields
  resourceName: z.string().optional(),
  apiVersion: z.string().optional(),
  // Amazon Bedrock-specific fields
  region: z.string().optional(),
  encryptedSecretKey: z.string().optional(),
  /**
   * Amazon Bedrock auth mode. Defaults to 'access-keys' for backward
   * compatibility with endpoints created before this field existed
   * (they all used static access keys).
   */
  awsAuthMode: z
    .enum(['access-keys', 'profile', 'default-chain'])
    .default('access-keys'),
  /** Named AWS profile to use when awsAuthMode === 'profile'. */
  awsProfileName: z.string().optional(),
  // Google Vertex-specific fields
  projectId: z.string().optional(),
  location: z.string().optional(),
  encryptedGoogleCredentials: z.string().optional(),
});
export type CustomEndpoint = z.infer<typeof customEndpointSchema>;

/** A user-defined model that routes to a built-in provider or custom endpoint */
export const customModelSchema = z
  .object({
    modelId: z.string().min(1),
    displayName: z.string().min(1),
    description: z.string().default(''),
    contextWindowSize: z.number().int().positive().default(128000),
    /** @deprecated Use `providerInstanceId`. Kept for migration parsing only. */
    endpointId: z.string().optional(),
    /**
     * ID of the provider instance this model routes to.
     * Optional in the schema so legacy data (which only has `endpointId`)
     * parses; the migration backfill makes it required at runtime.
     */
    providerInstanceId: z.string().optional(),
    thinkingEnabled: z.boolean().default(false),
    capabilities: modelCapabilitiesSchema.default({
      inputModalities: {
        text: true,
        audio: false,
        image: false,
        video: false,
        file: false,
      },
      outputModalities: {
        text: true,
        audio: false,
        image: false,
        video: false,
        file: false,
      },
      toolCalling: true,
    }),
    providerOptions: z.record(z.string(), z.unknown()).default({}),
    headers: z.record(z.string(), z.string()).default({}),
  })
  .superRefine((model, ctx) => {
    if (!model.providerInstanceId && !model.endpointId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'A custom model requires a provider instance or legacy endpoint',
        path: ['providerInstanceId'],
      });
    }
  });
export type CustomModel = z.infer<typeof customModelSchema>;

// ============================================================================
// Provider Instances
// ============================================================================

/**
 * The set of provider type IDs. Each ID determines the config shape and
 * routing behavior of a provider instance. See `API_PROVIDER_SPEC.md` for
 * the full architecture.
 */
export const providerInstanceTypeIds = [
  'stagewise',
  'anthropic-api',
  'openai-api',
  'google-api',
  'moonshotai-api',
  'alibaba-api',
  'deepseek-api',
  'z-ai-api',
  'minimax-api',
  'xiaomi-mimo-api',
  'mistral-api',
  'coding-plan',
  'custom-anthropic',
  'custom-openai-chat',
  'custom-openai-responses',
  'custom-google',
  'azure',
  'bedrock',
  'vertex',
  'ollama',
  'openrouter',
] as const;
export type ProviderInstanceTypeId = (typeof providerInstanceTypeIds)[number];

/** Stagewise — no stored credentials (auth service token injected at request time) */
const stagewiseConfigSchema = z.object({}).strict();

/** Official vendor API — encrypted key + optional base URL override */
const officialApiConfigSchema = z.object({
  encryptedApiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

/** Coding plan — encrypted key + plan ID + optional base URL */
const codingPlanConfigSchema = z.object({
  encryptedApiKey: z.string().optional(),
  planId: z.string(),
  baseUrl: z.string().optional(),
});

/** Generic custom-compatible endpoint (anthropic / openai-chat / openai-responses / google) */
const customCompatibleConfigSchema = z.object({
  encryptedApiKey: z.string().optional(),
  baseUrl: z.string(),
  modelIdMapping: z.record(z.string(), z.string()).optional(),
});

/** Azure OpenAI */
const azureConfigSchema = z.object({
  encryptedApiKey: z.string().optional(),
  baseUrl: z.string(),
  resourceName: z.string().optional(),
  apiVersion: z.string().optional(),
  modelIdMapping: z.record(z.string(), z.string()).optional(),
});

/** Amazon Bedrock */
const bedrockConfigSchema = z.object({
  encryptedApiKey: z.string().optional(),
  encryptedSecretKey: z.string().optional(),
  region: z.string().optional(),
  awsAuthMode: z
    .enum(['access-keys', 'profile', 'default-chain'])
    .default('access-keys'),
  awsProfileName: z.string().optional(),
  modelIdMapping: z.record(z.string(), z.string()).optional(),
});

/** Google Vertex AI */
const vertexConfigSchema = z.object({
  encryptedGoogleCredentials: z.string().optional(),
  projectId: z.string().optional(),
  location: z.string().optional(),
  modelIdMapping: z.record(z.string(), z.string()).optional(),
});

/** Ollama self-hosted — baseUrl only, no auth */
const ollamaConfigSchema = z.object({
  baseUrl: z.string(),
});

/** OpenRouter — encrypted key + optional base URL override */
const openrouterConfigSchema = z.object({
  encryptedApiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

// ============================================================================
// Discovered Model
// ============================================================================

/** A model discovered from a provider's API (not in the static catalog). */
export const discoveredModelSchema = z.object({
  modelId: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  contextWindow: z.number().int().positive().optional(),
  pricing: z
    .object({
      inputPerMillion: z.number(),
      outputPerMillion: z.number(),
    })
    .optional(),
  capabilities: modelCapabilitiesSchema.optional(),
  thinkingEnabled: z.boolean().optional(),
  recommended: z.boolean().optional(),
});
export type DiscoveredModel = z.infer<typeof discoveredModelSchema>;

/** Common fields shared by every provider instance variant. */
const providerInstanceBaseSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  enabledModelIds: z.array(z.string()).default([]),
  /** Per-instance blacklist of catalog modelIds. Empty = all catalog models visible. */
  disabledModelIds: z.array(z.string()).default([]),
  /** Cached model list from discovery providers. Empty for catalog-only types. */
  discoveredModels: z.array(discoveredModelSchema).default([]),
});

/**
 * A provider instance: a stateful, user-configured provider connection.
 * Discriminated on `typeId` so that narrowing the type narrows the `config`
 * shape available in routing/UI code.
 */
export const providerInstanceSchema = z.discriminatedUnion('typeId', [
  providerInstanceBaseSchema.extend({
    typeId: z.literal('stagewise'),
    config: stagewiseConfigSchema,
  }),
  providerInstanceBaseSchema.extend({
    typeId: z.literal('anthropic-api'),
    config: officialApiConfigSchema,
  }),
  providerInstanceBaseSchema.extend({
    typeId: z.literal('openai-api'),
    config: officialApiConfigSchema,
  }),
  providerInstanceBaseSchema.extend({
    typeId: z.literal('google-api'),
    config: officialApiConfigSchema,
  }),
  providerInstanceBaseSchema.extend({
    typeId: z.literal('moonshotai-api'),
    config: officialApiConfigSchema,
  }),
  providerInstanceBaseSchema.extend({
    typeId: z.literal('alibaba-api'),
    config: officialApiConfigSchema,
  }),
  providerInstanceBaseSchema.extend({
    typeId: z.literal('deepseek-api'),
    config: officialApiConfigSchema,
  }),
  providerInstanceBaseSchema.extend({
    typeId: z.literal('z-ai-api'),
    config: officialApiConfigSchema,
  }),
  providerInstanceBaseSchema.extend({
    typeId: z.literal('minimax-api'),
    config: officialApiConfigSchema,
  }),
  providerInstanceBaseSchema.extend({
    typeId: z.literal('xiaomi-mimo-api'),
    config: officialApiConfigSchema,
  }),
  providerInstanceBaseSchema.extend({
    typeId: z.literal('mistral-api'),
    config: officialApiConfigSchema,
  }),
  providerInstanceBaseSchema.extend({
    typeId: z.literal('coding-plan'),
    config: codingPlanConfigSchema,
  }),
  providerInstanceBaseSchema.extend({
    typeId: z.literal('custom-anthropic'),
    config: customCompatibleConfigSchema,
  }),
  providerInstanceBaseSchema.extend({
    typeId: z.literal('custom-openai-chat'),
    config: customCompatibleConfigSchema,
  }),
  providerInstanceBaseSchema.extend({
    typeId: z.literal('custom-openai-responses'),
    config: customCompatibleConfigSchema,
  }),
  providerInstanceBaseSchema.extend({
    typeId: z.literal('custom-google'),
    config: customCompatibleConfigSchema,
  }),
  providerInstanceBaseSchema.extend({
    typeId: z.literal('azure'),
    config: azureConfigSchema,
  }),
  providerInstanceBaseSchema.extend({
    typeId: z.literal('bedrock'),
    config: bedrockConfigSchema,
  }),
  providerInstanceBaseSchema.extend({
    typeId: z.literal('vertex'),
    config: vertexConfigSchema,
  }),
  providerInstanceBaseSchema.extend({
    typeId: z.literal('ollama'),
    config: ollamaConfigSchema,
  }),
  providerInstanceBaseSchema.extend({
    typeId: z.literal('openrouter'),
    config: openrouterConfigSchema,
  }),
]);
export type ProviderInstance = z.infer<typeof providerInstanceSchema>;

/**
 * The kind of credential input the settings detail page should render
 * for a provider instance type. This drives the declarative UI — the
 * detail page reads `credentialType` from `PROVIDER_TYPE_DISPLAY_INFO`
 * instead of pattern-matching on `typeId` strings.
 */
export type CredentialType =
  | 'none' // No credentials needed (stagewise)
  | 'api-key' // API key input + validation (vendor APIs, coding plans, openrouter)
  | 'base-url' // Base URL input + model discovery (ollama)
  | 'custom-endpoint'; // Full custom endpoint form (custom-*, azure, bedrock, vertex)

/**
 * Display metadata for each provider instance type, keyed by
 * `ProviderInstanceTypeId`. This is the single source of truth for UI
 * display names, descriptions, API key URLs, default base URLs, and
 * credential input type.
 *
 * Backend provider type implementations spread from this record to
 * populate their `displayName`, `description`, `getApiKeyUrl`, and
 * `defaultBaseUrl` fields, eliminating duplication.
 */
export const PROVIDER_TYPE_DISPLAY_INFO: Record<
  ProviderInstanceTypeId,
  {
    displayName: string;
    description: string;
    /** Short instruction shown next to the "Create key" link. */
    helpText?: string;
    getApiKeyUrl?: string;
    defaultBaseUrl?: string;
    /** Which credential input UI to render on the detail page. */
    credentialType: CredentialType;
  }
> = {
  stagewise: {
    displayName: 'Stagewise Inference',
    description: 'Managed inference through stagewise subscription',
    defaultBaseUrl: 'https://llm.stagewise.io',
    credentialType: 'none',
  },
  'anthropic-api': {
    displayName: 'Anthropic API',
    description: 'Claude models (Opus, Sonnet, Haiku)',
    helpText: 'Create one at console.anthropic.com → Settings → API Keys',
    getApiKeyUrl: 'https://console.anthropic.com/settings/keys',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    credentialType: 'api-key',
  },
  'openai-api': {
    displayName: 'OpenAI API',
    description: 'GPT and Codex models',
    helpText: 'Create one at platform.openai.com → API keys',
    getApiKeyUrl: 'https://platform.openai.com/api-keys',
    defaultBaseUrl: 'https://api.openai.com/v1',
    credentialType: 'api-key',
  },
  'google-api': {
    displayName: 'Google API',
    description: 'Gemini models',
    helpText: 'Create one at Google AI Studio → Get API key',
    getApiKeyUrl: 'https://aistudio.google.com/app/apikey',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    credentialType: 'api-key',
  },
  'moonshotai-api': {
    displayName: 'Moonshot AI API',
    description: 'Kimi models',
    helpText: 'Create one at platform.moonshot.ai → Console → API keys',
    getApiKeyUrl: 'https://platform.moonshot.ai/console/api-keys',
    defaultBaseUrl: 'https://api.moonshot.ai/v1',
    credentialType: 'api-key',
  },
  'alibaba-api': {
    displayName: 'Alibaba Cloud API',
    description: 'Qwen models',
    helpText: 'Create one at dashscope.console.aliyuncs.com → API-KEY',
    getApiKeyUrl: 'https://dashscope.console.aliyuncs.com/apiKey',
    defaultBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    credentialType: 'api-key',
  },
  'deepseek-api': {
    displayName: 'DeepSeek API',
    description: 'DeepSeek V-series models',
    helpText: 'Create one at platform.deepseek.com → API keys',
    getApiKeyUrl: 'https://platform.deepseek.com/api_keys',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    credentialType: 'api-key',
  },
  'z-ai-api': {
    displayName: 'Z.ai API',
    description: 'GLM models',
    helpText: 'Get your key at z.ai → Manage API keys',
    getApiKeyUrl: 'https://z.ai/manage-apikey/apikey-list',
    defaultBaseUrl: 'https://api.z.ai/api/paas/v4',
    credentialType: 'api-key',
  },
  'minimax-api': {
    displayName: 'MiniMax API',
    description: 'MiniMax M-series models',
    helpText:
      'Create one at platform.minimax.io → Basic Information → Interface Key',
    getApiKeyUrl:
      'https://platform.minimax.io/user-center/basic-information/interface-key',
    defaultBaseUrl: 'https://api.minimax.io/v1',
    credentialType: 'api-key',
  },
  'xiaomi-mimo-api': {
    displayName: 'Xiaomi MiMo API',
    description: 'MiMo V2.5-series models',
    helpText: 'Get your tp- key at platform.xiaomimimo.com → Subscription',
    getApiKeyUrl: 'https://platform.xiaomimimo.com/#/console/plan-manage',
    defaultBaseUrl: 'https://api.xiaomimimo.com/v1',
    credentialType: 'api-key',
  },
  'mistral-api': {
    displayName: 'Mistral API',
    description: 'Mistral AI models',
    helpText: 'Create one at console.mistral.ai → API Keys',
    getApiKeyUrl: 'https://console.mistral.ai/api-keys',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    credentialType: 'api-key',
  },
  'coding-plan': {
    displayName: 'Coding Plan',
    description: 'Bring-your-own-subscription coding plan',
    credentialType: 'api-key',
  },
  'custom-anthropic': {
    displayName: 'Custom Anthropic',
    description: 'Anthropic-compatible custom endpoint',
    credentialType: 'custom-endpoint',
  },
  'custom-openai-chat': {
    displayName: 'Custom OpenAI (Chat)',
    description: 'OpenAI Chat Completions-compatible custom endpoint',
    credentialType: 'custom-endpoint',
  },
  'custom-openai-responses': {
    displayName: 'Custom OpenAI (Responses)',
    description: 'OpenAI Responses API-compatible custom endpoint',
    credentialType: 'custom-endpoint',
  },
  'custom-google': {
    displayName: 'Custom Google',
    description: 'Google Generative AI-compatible custom endpoint',
    credentialType: 'custom-endpoint',
  },
  azure: {
    displayName: 'Azure OpenAI',
    description: 'Azure-hosted OpenAI models',
    credentialType: 'custom-endpoint',
  },
  bedrock: {
    displayName: 'Amazon Bedrock',
    description: 'AWS-hosted models via Bedrock',
    credentialType: 'custom-endpoint',
  },
  vertex: {
    displayName: 'Google Vertex AI',
    description: 'Google Cloud-hosted models via Vertex AI',
    credentialType: 'custom-endpoint',
  },
  ollama: {
    displayName: 'Ollama',
    description: 'Self-hosted local models via Ollama',
    defaultBaseUrl: 'http://localhost:11434',
    credentialType: 'base-url',
  },
  openrouter: {
    displayName: 'OpenRouter',
    description: 'Access 345+ models from all major vendors',
    helpText: 'Get your API key at openrouter.ai → Keys',
    getApiKeyUrl: 'https://openrouter.ai/keys',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    credentialType: 'api-key',
  },
};

export const thinkingProviderSchema = z.enum([
  'stagewise',
  'openai',
  'google',
  'anthropic',
  'openai-compatible',
]);
export type ThinkingProvider = z.infer<typeof thinkingProviderSchema>;

export const modelThinkingOverrideSchema = z.unknown().transform((value) => {
  if (!isPlainRecord(value)) return {};

  return {
    ...(typeof value.enabled === 'boolean' ? { enabled: value.enabled } : {}),
    ...(thinkingProviderSchema.safeParse(value.provider).success
      ? { provider: value.provider as ThinkingProvider }
      : {}),
    ...(typeof value.value === 'string' ? { value: value.value } : {}),
  };
});
export type ModelThinkingOverride = z.infer<typeof modelThinkingOverrideSchema>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * GLOBAL CONFIG CAPABILITIES
 */

export const openFilesInIdeSchema = z.enum([
  'vscode',
  'cursor',
  'zed',
  'windsurf',
  'trae',
  'kiro',
  'other',
]);

export type OpenFilesInIde = z.infer<typeof openFilesInIdeSchema>;

export const personalizationThemeIds = [
  'default',
  'fire',
  'forest',
  'bubblegum',
  'titanium',
] as const;
export const personalizationThemeIdSchema = z.enum(personalizationThemeIds);
export type PersonalizationThemeId = z.infer<
  typeof personalizationThemeIdSchema
>;

export const appColorSchemeSchema = z.enum(['system', 'light', 'dark']);
export type AppColorScheme = z.infer<typeof appColorSchemeSchema>;

export const globalConfigSchema = z
  .object({
    notificationSoundLoudness: z
      .enum(['off', 'subtle', 'default'])
      .default('subtle'),
    notificationSoundPack: z.string().default('bubble-pops'),
    dockBounceEnabled: z.boolean().default(true),
    blockAppSuspensionWhenAgentsActive: z.boolean().default(true),
    personalizationThemeId: personalizationThemeIdSchema
      .catch('default')
      .default('default'),
    appColorScheme: appColorSchemeSchema.catch('system').default('system'),
  })
  .loose();

export type GlobalConfig = z.infer<typeof globalConfigSchema>;

/**
 * USER PREFERENCES (stored in Preferences.json)
 */

/** Page setting that can be either stagewise home or a custom URL */
export const pageSettingSchema = z.object({
  type: z.enum(['home', 'custom']).default('home'),
  /** Custom URL (only used when type is 'custom') */
  customUrl: z.string().optional(),
});

export type PageSetting = z.infer<typeof pageSettingSchema>;

/** Per-workspace agent settings (keyed by workspace absolute path) */
export const workspaceAgentSettingsSchema = z.object({
  /** Whether the AGENTS.md file is included in the agent's system prompt */
  respectAgentsMd: z.boolean().default(true),
  /** Skill names that have been disabled by the user */
  disabledSkills: z.array(z.string()).default([]),
});

export type WorkspaceAgentSettings = z.infer<
  typeof workspaceAgentSettingsSchema
>;

export const workspaceGitActionSchema = z.enum([
  'create-worktree',
  'create-branch',
  'switch-branch',
  'switch-worktree',
]);
export type WorkspaceGitAction = z.infer<typeof workspaceGitActionSchema>;

const defaultWorkspaceGitActionPreferences = {
  general: {},
  repositories: {},
};

const workspaceGitActionPreferenceSchema = z
  .object({
    selectedAction: workspaceGitActionSchema.optional(),
  })
  .default({})
  .catch({});

const workspaceGitRepositoryActionPreferenceSchema = z
  .object({
    selectedAction: workspaceGitActionSchema.optional(),
    createWorktreeFrom: z.string().optional(),
    createBranchFrom: z.string().optional(),
    switchWorktreeTarget: z.string().optional(),
    switchBranchTarget: z.string().optional(),
  })
  .default({})
  .catch({});

export const workspaceGitActionPreferencesSchema = z
  .object({
    general: workspaceGitActionPreferenceSchema,
    repositories: z
      .record(z.string(), workspaceGitRepositoryActionPreferenceSchema)
      .default({}),
  })
  .default(defaultWorkspaceGitActionPreferences)
  .catch(defaultWorkspaceGitActionPreferences);

export type WorkspaceGitActionPreferences = z.infer<
  typeof workspaceGitActionPreferencesSchema
>;

const defaultWorkspaceGitCleanupPreferences = {
  dismissedCandidates: {},
};

const workspaceGitCleanupPreferencesSchema = z
  .object({
    dismissedCandidates: z
      .preprocess(
        (value) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
          }

          return Object.fromEntries(
            Object.entries(value).filter(([, entry]) => {
              return (
                entry &&
                typeof entry === 'object' &&
                !Array.isArray(entry) &&
                typeof (entry as { dismissedAt?: unknown }).dismissedAt ===
                  'number'
              );
            }),
          );
        },
        z.record(z.string(), z.object({ dismissedAt: z.number() })),
      )
      .default({}),
  })
  .default(defaultWorkspaceGitCleanupPreferences)
  .catch(defaultWorkspaceGitCleanupPreferences);

// Tool-approval enum / default were moved into `@stagewise/agent-core` so
// the core's persistence layer can validate them without a back-reference
// into this host-only contracts package. Re-exported here for callers that
// still import via `@shared/karton-contracts/ui/shared-types`.
export {
  toolApprovalModeSchema,
  DEFAULT_TOOL_APPROVAL_MODE,
  type ToolApprovalMode,
} from '@stagewise/agent-core/types/tool-approval';

/** Update channel for prerelease builds ('alpha' or 'beta') */
export const updateChannelSchema = z.enum(['alpha', 'beta']);
export type UpdateChannel = z.infer<typeof updateChannelSchema>;

const agentListGroupingModeSchema = z.enum(['age', 'workspace']);
export type AgentListGroupingMode = z.infer<typeof agentListGroupingModeSchema>;

const defaultSidebarPreferences = {
  showActiveAgents: true,
  pinnedAgentIds: [],
  agentListGroupingMode: 'age' as AgentListGroupingMode,
  workspaceGroupOrder: [],
  collapsedWorkspaceGroupKeys: [],
};

const sidebarPreferencesSchema = z
  .object({
    /** Whether to show the active agents grid in the sidebar */
    showActiveAgents: z.boolean().default(true),
    /** Ordered agent IDs pinned to the top of the sidebar */
    pinnedAgentIds: z.array(z.string()).default([]),
    /** How the unpinned agent list is grouped in the sidebar */
    agentListGroupingMode: agentListGroupingModeSchema.default('age'),
    /** Ordered workspace group keys in the sidebar workspace grouping mode */
    workspaceGroupOrder: z.array(z.string()).default([]),
    /** Collapsed workspace/worktree group keys in the sidebar workspace grouping mode */
    collapsedWorkspaceGroupKeys: z.array(z.string()).default([]),
  })
  .default(defaultSidebarPreferences)
  .catch(defaultSidebarPreferences);

export const userPreferencesSchema = z.object({
  privacy: z
    .object({
      telemetryLevel: z.enum(['off', 'anonymous', 'full']).default('anonymous'),
    })
    .default({ telemetryLevel: 'anonymous' }),
  search: z
    .object({
      /** ID of the default search engine (references keywords.id in Web Data DB) */
      defaultEngineId: z.number().default(1), // Google
    })
    .default({ defaultEngineId: 1 }),
  general: z
    .object({
      /** Default page opened when creating a new tab */
      newTabPage: pageSettingSchema.default({ type: 'home' }),
      /** Default page opened when the browser starts */
      startupPage: pageSettingSchema.default({ type: 'home' }),
      /** UI zoom percentage applied to the Stagewise interface (70-130) */
      uiZoomPercentage: z.number().min(70).max(130).default(100),
      /** Global terminal zoom percentage applied to all terminal tabs (50-150) */
      terminalZoomPercentage: z.number().min(50).max(150).default(100),
      /** Global file code editor zoom percentage applied to all file tabs (50-200) */
      fileCodeZoomPercentage: z.number().min(50).max(200).default(100),
      /** Whether file search includes gitignored files (global toggle) */
      fileSearchIncludeGitignored: z.boolean().default(false),
      /** Custom hex background color for SVG previews (without #) */
      svgCustomBackground: z
        .string()
        .regex(/^[0-9A-Fa-f]{6}$/, 'must be a 6-digit hex without #')
        .default('ffffff'),
      /** Custom hex foreground color for SVG previews (without #) */
      svgCustomForeground: z
        .string()
        .regex(/^[0-9A-Fa-f]{6}$/, 'must be a 6-digit hex without #')
        .default('8b5cf6'),
    })
    .default({
      newTabPage: { type: 'home' },
      startupPage: { type: 'home' },
      uiZoomPercentage: 100,
      terminalZoomPercentage: 100,
      fileCodeZoomPercentage: 100,
      fileSearchIncludeGitignored: false,
      svgCustomBackground: 'ffffff',
      svgCustomForeground: '8b5cf6',
    }),
  /** Website permission settings (defaults and host-specific overrides) */
  permissions: z.lazy(() => permissionsPreferencesSchema),
  /** Dev toolbar preferences (widget order and per-origin settings) */
  devToolbar: z
    .lazy(() => devToolbarPreferencesSchema)
    .default({
      widgetOrder: [
        'console',
        'dom-inspector',
        'color-scheme',
        'device-emulation',
        'color-tools',
        'font-tools',
        'performance-tools',
        'accessibility-tools',
        'image-generation-tools',
        'network-tools',
        'chrome-devtools',
      ],
      originSettings: {},
      lastUsedOrigin: null,
    }),
  /** Sidebar display preferences */
  sidebar: sidebarPreferencesSchema,
  /** Per-workspace agent settings (keyed by workspace absolute path) */
  agent: z
    .object({
      workspaceSettings: z
        .record(z.string(), workspaceAgentSettingsSchema)
        .default({}),
      /** Plugin IDs the user has chosen to disable */
      disabledPluginIds: z.array(z.string()).default([]),
      /** Last workspace Git action choices used to seed future selectors */
      workspaceGitActionPreferences: workspaceGitActionPreferencesSchema,
      /** Snoozed worktree cleanup candidates keyed by worktree path */
      workspaceGitCleanup: workspaceGitCleanupPreferencesSchema,
      /**
       * Per-model thinking overrides keyed by instance ID, then model ID.
       * Outer key = providerInstanceId, inner key = modelId.
       *
       * A preprocess step normalizes the legacy flat format
       * (`Record<modelId, override>`) by wrapping it under the
       * `stagewise-default` instance key.
       */
      modelThinkingOverrides: z
        .preprocess(
          (val) => {
            if (typeof val !== 'object' || val === null || Array.isArray(val))
              return {};
            const record = val as Record<string, unknown>;
            const entries = Object.entries(record);
            if (entries.length === 0) return {};
            // Current maps are two levels deep. Preserve the outer instance
            // key whenever its value looks like a model map, even if a nested
            // override is malformed; field-level sanitization handles it.
            const isCurrentNestedMap = entries.every(
              ([, instanceOverrides]) =>
                isPlainRecord(instanceOverrides) &&
                Object.values(instanceOverrides).some(isPlainRecord),
            );
            if (isCurrentNestedMap) return val;

            // A legacy flat map can contain malformed values. Recognize an
            // entry only when at least one override field has a valid type.
            const legacyEntries = entries.filter(([, value]) => {
              if (!isPlainRecord(value)) return false;
              return (
                typeof value.enabled === 'boolean' ||
                thinkingProviderSchema.safeParse(value.provider).success ||
                typeof value.value === 'string'
              );
            });
            if (legacyEntries.length > 0) {
              return {
                'stagewise-default': Object.fromEntries(legacyEntries),
              };
            }
            return val;
          },
          z.record(
            z.string(),
            z.record(z.string(), modelThinkingOverrideSchema),
          ),
        )
        .default({})
        .catch({}),
      /**
       * External global skill directories the user has opted in to.
       * Contains mount prefixes (e.g. `globalskills-codex`,
       * `globalskills-claude`). The built-in `globalskills-sw` and
       * `globalskills-agents` dirs are always enabled and never appear
       * here. Empty array = no external dirs loaded.
       */
      enabledGlobalSkillDirs: z.array(z.string()).default([]),
      /**
       * Skill names disabled at the global level (analogous to the
       * per-workspace `disabledSkills`). Applies to skills discovered
       * from any global skill directory.
       */
      disabledGlobalSkills: z.array(z.string()).default([]),
    })
    .default({
      workspaceSettings: {},
      disabledPluginIds: [],
      workspaceGitActionPreferences: defaultWorkspaceGitActionPreferences,
      workspaceGitCleanup: defaultWorkspaceGitCleanupPreferences,
      modelThinkingOverrides: {},
      enabledGlobalSkillDirs: [],
      disabledGlobalSkills: [],
    }),
  /** LLM provider endpoint configurations (API keys, custom URLs) */
  providerConfigs: providerConfigsSchema.default({
    anthropic: { mode: 'stagewise' },
    openai: { mode: 'stagewise' },
    google: { mode: 'stagewise' },
    moonshotai: { mode: 'stagewise' },
    alibaba: { mode: 'stagewise' },
    deepseek: { mode: 'stagewise' },
    'z-ai': { mode: 'stagewise' },
    minimax: { mode: 'stagewise' },
    'xiaomi-mimo': { mode: 'stagewise' },
    mistral: { mode: 'stagewise' },
  }),
  /** User-defined API endpoints */
  customEndpoints: z.array(customEndpointSchema).default([]),
  /** User-defined models */
  customModels: z.array(customModelSchema).default([]),
  /**
   * Provider instances — the single source of truth for provider routing.
   * Migrated from `providerConfigs` / `customEndpoints` on first load.
   */
  providerInstances: z.array(providerInstanceSchema).default([]),
  /** Preferred update channel for prerelease builds (alpha or beta). If not set, inferred from the installed version. */
  updateChannel: updateChannelSchema.optional(),
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;
export type TelemetryLevel = UserPreferences['privacy']['telemetryLevel'];

/** Default permissions preferences - defined inline to avoid circular reference issues */
const defaultPermissionsForUserPrefs = {
  defaults: {
    media: 0 as const, // PermissionSetting.Ask
    geolocation: 0 as const,
    notifications: 0 as const,
    fullscreen: 1 as const, // PermissionSetting.Allow
    bluetooth: 0 as const,
    hid: 0 as const,
    serial: 0 as const,
    usb: 0 as const,
    'clipboard-read': 0 as const,
    'display-capture': 0 as const,
    midi: 1 as const, // PermissionSetting.Allow
    'idle-detection': 0 as const,
    'speaker-selection': 0 as const,
    'storage-access': 0 as const,
  },
  exceptions: {
    media: {},
    geolocation: {},
    notifications: {},
    fullscreen: {},
    bluetooth: {},
    hid: {},
    serial: {},
    usb: {},
    'clipboard-read': {},
    'display-capture': {},
    midi: {},
    'idle-detection': {},
    'speaker-selection': {},
    'storage-access': {},
  },
};

/** Default dev toolbar preferences - defined inline to avoid circular reference issues */
const defaultDevToolbarForUserPrefs: DevToolbarPreferences = {
  widgetOrder: [
    'console',
    'dom-inspector',
    'color-scheme',
    'device-emulation',
    'color-tools',
    'font-tools',
    'performance-tools',
    'accessibility-tools',
    'image-generation-tools',
    'network-tools',
    'chrome-devtools',
  ],
  originSettings: {},
  lastUsedOrigin: null,
};

export const defaultUserPreferences: UserPreferences = {
  privacy: {
    telemetryLevel: 'anonymous',
  },
  search: {
    defaultEngineId: 1,
  },
  general: {
    newTabPage: { type: 'home' },
    startupPage: { type: 'home' },
    uiZoomPercentage: 100,
    terminalZoomPercentage: 100,
    fileCodeZoomPercentage: 100,
    fileSearchIncludeGitignored: false,
    svgCustomBackground: 'ffffff',
    svgCustomForeground: '8b5cf6',
  },
  permissions: defaultPermissionsForUserPrefs,
  devToolbar: defaultDevToolbarForUserPrefs,
  sidebar: defaultSidebarPreferences,
  agent: {
    workspaceSettings: {},
    disabledPluginIds: [],
    workspaceGitActionPreferences: defaultWorkspaceGitActionPreferences,
    workspaceGitCleanup: defaultWorkspaceGitCleanupPreferences,
    modelThinkingOverrides: {},
    enabledGlobalSkillDirs: [],
    disabledGlobalSkills: [],
  },
  providerConfigs: {
    anthropic: { mode: 'stagewise' },
    openai: { mode: 'stagewise' },
    google: { mode: 'stagewise' },
    moonshotai: { mode: 'stagewise' },
    alibaba: { mode: 'stagewise' },
    deepseek: { mode: 'stagewise' },
    'z-ai': { mode: 'stagewise' },
    minimax: { mode: 'stagewise' },
    'xiaomi-mimo': { mode: 'stagewise' },
    mistral: { mode: 'stagewise' },
  },
  customEndpoints: [],
  customModels: [],
  providerInstances: [],
};

/**
 * SEARCH ENGINE TYPES
 */

/** Search engine entry from Web Data database */
export const searchEngineSchema = z.object({
  id: z.number(),
  shortName: z.string(),
  keyword: z.string(),
  url: z.string(), // Internal format with {searchTerms}
  faviconUrl: z.string(),
  isBuiltIn: z.boolean(), // true for prepopulate_id > 0
});

export type SearchEngine = z.infer<typeof searchEngineSchema>;

/** Input for adding a new search engine. Placeholder is normalized to {searchTerms} on save. */
export const addSearchEngineInputSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  url: z
    .string()
    .min(1, 'URL is required')
    .refine((url) => url.includes('%s') || url.includes('{searchTerms}'), {
      message:
        'URL must contain {searchTerms} or %s placeholder for search terms',
    }),
  keyword: z.string().min(1, 'Keyword is required'),
});

export type AddSearchEngineInput = z.infer<typeof addSearchEngineInputSchema>;

// Re-export Patch type from immer for use in Karton contracts
export type { Patch } from 'immer';

/**
 * FILE PICKER CAPABILITIES
 */

export type FilePickerMode = 'file' | 'directory';

export type FilePickerRequest = {
  title?: string;
  description?: string;
  type: FilePickerMode;
  multiple?: boolean;
  allowCreateDirectory?: boolean;
};

// ============================================================================
// Permission Settings (Chrome-style model)
// ============================================================================

/**
 * Permission setting enum - maps to Chrome's numeric values:
 * - 0: Ask (default for most permissions - prompt user)
 * - 1: Allow (auto-grant without prompting)
 * - 2: Block (auto-deny without prompting)
 *
 * Using an enum provides type safety while maintaining Chrome compatibility.
 */
export enum PermissionSetting {
  Ask = 0,
  Allow = 1,
  Block = 2,
}

/**
 * Permission types that can be configured and persisted.
 * Excludes 'bluetooth-pairing' as it's a transient request type.
 */
export const configurablePermissionTypes = [
  'media',
  'geolocation',
  'notifications',
  'fullscreen',
  'bluetooth',
  'hid',
  'serial',
  'usb',
  'clipboard-read',
  'display-capture',
  'midi',
  'idle-detection',
  'speaker-selection',
  'storage-access',
] as const;

export type ConfigurablePermissionType =
  (typeof configurablePermissionTypes)[number];

/**
 * Schema for a single host exception (similar to Chrome's content_settings.exceptions).
 * Stores the permission setting for a specific origin.
 */
export const hostPermissionExceptionSchema = z.object({
  /** The permission setting for this origin */
  setting: z.enum(PermissionSetting),
  /** Unix timestamp when this exception was last modified */
  lastModified: z.number().optional(),
});

export type HostPermissionException = z.infer<
  typeof hostPermissionExceptionSchema
>;

/**
 * Default permission settings - global defaults for each permission type.
 * These are used when no host-specific exception exists.
 */
export const defaultPermissionSettingsSchema = z.object({
  media: z.enum(PermissionSetting).default(PermissionSetting.Ask),
  geolocation: z.enum(PermissionSetting).default(PermissionSetting.Ask),
  notifications: z.enum(PermissionSetting).default(PermissionSetting.Ask),
  fullscreen: z.enum(PermissionSetting).default(PermissionSetting.Allow),
  bluetooth: z.enum(PermissionSetting).default(PermissionSetting.Ask),
  hid: z.enum(PermissionSetting).default(PermissionSetting.Ask),
  serial: z.enum(PermissionSetting).default(PermissionSetting.Ask),
  usb: z.enum(PermissionSetting).default(PermissionSetting.Ask),
  'clipboard-read': z.enum(PermissionSetting).default(PermissionSetting.Ask),
  'display-capture': z.enum(PermissionSetting).default(PermissionSetting.Ask),
  midi: z.enum(PermissionSetting).default(PermissionSetting.Allow),
  'idle-detection': z.enum(PermissionSetting).default(PermissionSetting.Ask),
  'speaker-selection': z.enum(PermissionSetting).default(PermissionSetting.Ask),
  'storage-access': z.enum(PermissionSetting).default(PermissionSetting.Ask),
});

export type DefaultPermissionSettings = z.infer<
  typeof defaultPermissionSettingsSchema
>;

/**
 * Host-specific permission overrides.
 * Structure: { [permissionType]: { [origin]: { setting, lastModified? } } }
 * Similar to Chrome's profile.content_settings.exceptions.<type>
 */
export const hostPermissionOverridesSchema = z.object({
  media: z.record(z.string(), hostPermissionExceptionSchema).default({}),
  geolocation: z.record(z.string(), hostPermissionExceptionSchema).default({}),
  notifications: z
    .record(z.string(), hostPermissionExceptionSchema)
    .default({}),
  fullscreen: z.record(z.string(), hostPermissionExceptionSchema).default({}),
  bluetooth: z.record(z.string(), hostPermissionExceptionSchema).default({}),
  hid: z.record(z.string(), hostPermissionExceptionSchema).default({}),
  serial: z.record(z.string(), hostPermissionExceptionSchema).default({}),
  usb: z.record(z.string(), hostPermissionExceptionSchema).default({}),
  'clipboard-read': z
    .record(z.string(), hostPermissionExceptionSchema)
    .default({}),
  'display-capture': z
    .record(z.string(), hostPermissionExceptionSchema)
    .default({}),
  midi: z.record(z.string(), hostPermissionExceptionSchema).default({}),
  'idle-detection': z
    .record(z.string(), hostPermissionExceptionSchema)
    .default({}),
  'speaker-selection': z
    .record(z.string(), hostPermissionExceptionSchema)
    .default({}),
  'storage-access': z
    .record(z.string(), hostPermissionExceptionSchema)
    .default({}),
});

export type HostPermissionOverrides = z.infer<
  typeof hostPermissionOverridesSchema
>;

/** Default values for permission settings */
export const defaultPermissionSettings: DefaultPermissionSettings = {
  media: PermissionSetting.Ask,
  geolocation: PermissionSetting.Ask,
  notifications: PermissionSetting.Ask,
  fullscreen: PermissionSetting.Allow,
  bluetooth: PermissionSetting.Ask,
  hid: PermissionSetting.Ask,
  serial: PermissionSetting.Ask,
  usb: PermissionSetting.Ask,
  'clipboard-read': PermissionSetting.Ask,
  'display-capture': PermissionSetting.Ask,
  midi: PermissionSetting.Allow,
  'idle-detection': PermissionSetting.Ask,
  'speaker-selection': PermissionSetting.Ask,
  'storage-access': PermissionSetting.Ask,
};

/** Default empty host overrides */
export const defaultHostPermissionOverrides: HostPermissionOverrides = {
  media: {},
  geolocation: {},
  notifications: {},
  fullscreen: {},
  bluetooth: {},
  hid: {},
  serial: {},
  usb: {},
  'clipboard-read': {},
  'display-capture': {},
  midi: {},
  'idle-detection': {},
  'speaker-selection': {},
  'storage-access': {},
};

/**
 * Complete permissions preferences structure.
 */
export const permissionsPreferencesSchema = z
  .object({
    /** Global default settings per permission type */
    defaults: defaultPermissionSettingsSchema.default(
      defaultPermissionSettings,
    ),
    /** Per-origin overrides (exceptions) */
    exceptions: hostPermissionOverridesSchema.default(
      defaultHostPermissionOverrides,
    ),
  })
  .default({
    defaults: defaultPermissionSettings,
    exceptions: defaultHostPermissionOverrides,
  });

export type PermissionsPreferences = z.infer<
  typeof permissionsPreferencesSchema
>;

// ============================================================================
// Dev Toolbar Preferences
// ============================================================================

export const widgetIdSchema = z.enum([
  'console',
  'dom-inspector',
  'color-scheme',
  'device-emulation',
  'color-tools',
  'font-tools',
  'performance-tools',
  'accessibility-tools',
  'image-generation-tools',
  'network-tools',
  'chrome-devtools',
]);
export type WidgetId = z.infer<typeof widgetIdSchema>;

export const DEFAULT_WIDGET_ORDER: WidgetId[] = [
  'console',
  'dom-inspector',
  'color-scheme',
  'device-emulation',
  'color-tools',
  'font-tools',
  'performance-tools',
  'accessibility-tools',
  'image-generation-tools',
  'network-tools',
  'chrome-devtools',
];

export const devToolbarOriginSettingsSchema = z.object({
  // Use z.string() instead of widgetIdSchema for record keys since panels may only have some widgets configured
  panelOpenStates: z.record(z.string(), z.boolean()).default({}),
  toolbarWidth: z.number().nullable().default(null),
  lastAccessedAt: z.number(),
});
export type DevToolbarOriginSettings = z.infer<
  typeof devToolbarOriginSettingsSchema
>;

export const DEV_TOOLBAR_MAX_ORIGINS = 100;

export const devToolbarPreferencesSchema = z.object({
  widgetOrder: z.array(widgetIdSchema).default([...DEFAULT_WIDGET_ORDER]),
  originSettings: z
    .record(z.string(), devToolbarOriginSettingsSchema)
    .default({}),
  lastUsedOrigin: z.string().nullable().default(null),
});
export type DevToolbarPreferences = z.infer<typeof devToolbarPreferencesSchema>;

export const defaultDevToolbarPreferences: DevToolbarPreferences = {
  widgetOrder: [...DEFAULT_WIDGET_ORDER],
  originSettings: {},
  lastUsedOrigin: null,
};
