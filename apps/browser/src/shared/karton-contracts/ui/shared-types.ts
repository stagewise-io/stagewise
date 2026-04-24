import { z } from 'zod';
import type { ChangeObject, StructuredPatchHunk } from 'diff';
import type { AnthropicProviderOptions } from '@ai-sdk/anthropic';
import type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import type { GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';

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
]);
export type ModelProvider = z.infer<typeof modelProviderSchema>;

/** Endpoint mode for a provider */
export const providerEndpointModeSchema = z.enum([
  'stagewise',
  'official',
  'custom',
]);
export type ProviderEndpointMode = z.infer<typeof providerEndpointModeSchema>;

/** Configuration for a single provider endpoint */
export const providerConfigSchema = z.object({
  /** Which endpoint to route requests to */
  mode: providerEndpointModeSchema.default('stagewise'),
  /** Base64-encoded safeStorage-encrypted API key (encrypted on backend, opaque to UI) */
  encryptedApiKey: z.string().optional(),
  /** ID of a custom endpoint to use (only when mode is 'custom') */
  customProviderId: z.string().optional(),
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
  // Google Vertex-specific fields
  projectId: z.string().optional(),
  location: z.string().optional(),
  encryptedGoogleCredentials: z.string().optional(),
});
export type CustomEndpoint = z.infer<typeof customEndpointSchema>;

/** Per-modality constraint: accepted MIME types and max inline size */
const modalityConstraintSchema = z.object({
  mimeTypes: z.array(z.string()),
  /**
   * Maximum raw (decoded) file size in bytes. Providers enforce this against
   * the actual image/file data, not the base64-encoded transport representation.
   * The image processor compares raw buffer length against this value directly.
   */
  maxBytes: z.number(),
  /** Maximum pixels on a single axis (width or height). Images exceeding this are downscaled. */
  maxWidthPx: z.number().optional(),
  maxHeightPx: z.number().optional(),
  /** Maximum total pixel count (width × height). Applied after per-axis limits. */
  maxTotalPixels: z.number().optional(),
});
export type ModalityConstraint = z.infer<typeof modalityConstraintSchema>;

/** Capabilities that describe what a model can do */
export const modelCapabilitiesSchema = z.object({
  inputModalities: z
    .object({
      text: z.boolean().default(true),
      audio: z.boolean().default(false),
      image: z.boolean().default(false),
      video: z.boolean().default(false),
      file: z.boolean().default(false),
    })
    .default({
      text: true,
      audio: false,
      image: false,
      video: false,
      file: false,
    }),
  outputModalities: z
    .object({
      text: z.boolean().default(true),
      audio: z.boolean().default(false),
      image: z.boolean().default(false),
      video: z.boolean().default(false),
      file: z.boolean().default(false),
    })
    .default({
      text: true,
      audio: false,
      image: false,
      video: false,
      file: false,
    }),
  inputConstraints: z
    .object({
      image: modalityConstraintSchema.optional(),
      file: modalityConstraintSchema.optional(),
      video: modalityConstraintSchema.optional(),
      audio: modalityConstraintSchema.optional(),
    })
    .optional(),
  toolCalling: z.boolean().default(true),
});
export type ModelCapabilities = z.infer<typeof modelCapabilitiesSchema>;

/** A user-defined model that routes to a built-in provider or custom endpoint */
export const customModelSchema = z.object({
  modelId: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().default(''),
  contextWindowSize: z.number().int().positive().default(128000),
  endpointId: z.string(),
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
});
export type CustomModel = z.infer<typeof customModelSchema>;

/** Official API base URLs for each provider (for UI display) */
export const PROVIDER_OFFICIAL_URLS: Record<ModelProvider, string> = {
  anthropic: 'https://api.anthropic.com/v1',
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  moonshotai: 'https://api.moonshot.ai/v1',
  alibaba: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
};

/** Display info for each provider (for UI) */
export const PROVIDER_DISPLAY_INFO: Record<
  ModelProvider,
  { name: string; description: string }
> = {
  anthropic: {
    name: 'Anthropic',
    description: 'Claude models (Opus, Sonnet, Haiku)',
  },
  openai: {
    name: 'OpenAI',
    description: 'GPT and Codex models',
  },
  google: {
    name: 'Google',
    description: 'Gemini models',
  },
  moonshotai: {
    name: 'Moonshot AI',
    description: 'Kimi models',
  },
  alibaba: {
    name: 'Alibaba Cloud',
    description: 'Qwen models',
  },
};

export type StagewiseProviderOptions = {
  reasoning?: {
    enabled: boolean;
    effort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  };
  cache_control?: {
    type: 'ephemeral' | 'persistent';
  };
};

export type ModelSettings = {
  modelId: string;
  /** Which provider should be used for the official API option */
  officialProvider?: ModelProvider;
  modelDisplayName: string;
  modelDescription: string;
  modelContext: string;
  modelContextRaw: number;
  headers?: Record<string, string>;
  /**
   * Per-provider configuration options.
   */
  providerOptions: {
    stagewise?: StagewiseProviderOptions;
    google?: GoogleGenerativeAIProviderOptions;
    anthropic?: AnthropicProviderOptions;
    openai?: OpenAIResponsesProviderOptions;
  } & Record<string, unknown>;
  pricing?: {
    inputPerMillion: number;
    outputPerMillion: number;
    relativeMultiplier: number;
  };
  thinkingEnabled: boolean; // Shows an thinking icon in the model card
  capabilities: {
    inputModalities: {
      text: boolean;
      audio: boolean;
      image: boolean;
      video: boolean;
      file: boolean;
    };
    outputModalities: {
      text: boolean;
      audio: boolean;
      image: boolean;
      video: boolean;
      file: boolean;
    };
    inputConstraints?: {
      image?: ModalityConstraint;
      file?: ModalityConstraint;
      video?: ModalityConstraint;
      audio?: ModalityConstraint;
    };
    toolCalling: boolean;
  };
};

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

export const globalConfigSchema = z
  .object({
    telemetryLevel: z.enum(['off', 'anonymous', 'full']).default('anonymous'),
    openFilesInIde: openFilesInIdeSchema.default('other'),
    hasSetIde: z.boolean().default(false),
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
  respectAgentsMd: z.boolean().default(false),
  /** Skill names that have been disabled by the user */
  disabledSkills: z.array(z.string()).default([]),
});

export type WorkspaceAgentSettings = z.infer<
  typeof workspaceAgentSettingsSchema
>;

/** Update channel for prerelease builds ('alpha' or 'beta') */
export const updateChannelSchema = z.enum(['alpha', 'beta']);
export type UpdateChannel = z.infer<typeof updateChannelSchema>;

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
    })
    .default({
      newTabPage: { type: 'home' },
      startupPage: { type: 'home' },
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
  sidebar: z
    .object({
      /** Whether to show the active agents grid in the sidebar */
      showActiveAgents: z.boolean().default(true),
    })
    .default({ showActiveAgents: true }),
  /** Per-workspace agent settings (keyed by workspace absolute path) */
  agent: z
    .object({
      workspaceSettings: z
        .record(z.string(), workspaceAgentSettingsSchema)
        .default({}),
      /** Model IDs the user has chosen to hide from the model selector */
      disabledModelIds: z.array(z.string()).default([]),
      /** Plugin IDs the user has chosen to disable */
      disabledPluginIds: z.array(z.string()).default([]),
    })
    .default({
      workspaceSettings: {},
      disabledModelIds: [],
      disabledPluginIds: [],
    }),
  /** LLM provider endpoint configurations (API keys, custom URLs) */
  providerConfigs: providerConfigsSchema.default({
    anthropic: { mode: 'stagewise' },
    openai: { mode: 'stagewise' },
    google: { mode: 'stagewise' },
    moonshotai: { mode: 'stagewise' },
    alibaba: { mode: 'stagewise' },
  }),
  /** User-defined API endpoints */
  customEndpoints: z.array(customEndpointSchema).default([]),
  /** User-defined models */
  customModels: z.array(customModelSchema).default([]),
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
  },
  permissions: defaultPermissionsForUserPrefs,
  devToolbar: defaultDevToolbarForUserPrefs,
  sidebar: { showActiveAgents: true },
  agent: {
    workspaceSettings: {},
    disabledModelIds: ['claude-opus-4.6', 'kimi-k2.5', 'gpt-5.4'],
    disabledPluginIds: [],
  },
  providerConfigs: {
    anthropic: { mode: 'stagewise' },
    openai: { mode: 'stagewise' },
    google: { mode: 'stagewise' },
    moonshotai: { mode: 'stagewise' },
    alibaba: { mode: 'stagewise' },
  },
  customEndpoints: [],
  customModels: [],
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

/** Input for adding a new search engine (UI format with %s) */
export const addSearchEngineInputSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  url: z
    .string()
    .min(1, 'URL is required')
    .refine((url) => url.includes('%s'), {
      message: 'URL must contain %s placeholder for search terms',
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
  setting: z.nativeEnum(PermissionSetting),
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
  media: z.nativeEnum(PermissionSetting).default(PermissionSetting.Ask),
  geolocation: z.nativeEnum(PermissionSetting).default(PermissionSetting.Ask),
  notifications: z.nativeEnum(PermissionSetting).default(PermissionSetting.Ask),
  fullscreen: z.nativeEnum(PermissionSetting).default(PermissionSetting.Allow),
  bluetooth: z.nativeEnum(PermissionSetting).default(PermissionSetting.Ask),
  hid: z.nativeEnum(PermissionSetting).default(PermissionSetting.Ask),
  serial: z.nativeEnum(PermissionSetting).default(PermissionSetting.Ask),
  usb: z.nativeEnum(PermissionSetting).default(PermissionSetting.Ask),
  'clipboard-read': z
    .nativeEnum(PermissionSetting)
    .default(PermissionSetting.Ask),
  'display-capture': z
    .nativeEnum(PermissionSetting)
    .default(PermissionSetting.Ask),
  midi: z.nativeEnum(PermissionSetting).default(PermissionSetting.Allow),
  'idle-detection': z
    .nativeEnum(PermissionSetting)
    .default(PermissionSetting.Ask),
  'speaker-selection': z
    .nativeEnum(PermissionSetting)
    .default(PermissionSetting.Ask),
  'storage-access': z
    .nativeEnum(PermissionSetting)
    .default(PermissionSetting.Ask),
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

type AgentInstanceId = string;
type Contributor = 'user' | `agent-${AgentInstanceId}`;

export type BlamedLineChange = ChangeObject<string> & {
  hunkId: string | null; // null if the line change is not part of a hunk
  contributor: Contributor;
};

/**
 * A unified-diff hunk enriched with an ID and contributor tracking.
 *
 * Because hunks are computed from a single baseline→current diff, a single hunk
 * can span changes made by different contributors (e.g. an agent edits line 5
 * and the user edits adjacent line 6 — both land in one hunk). The `contributors`
 * array lists every distinct contributor whose added lines fall within this hunk,
 * derived from the per-line blame in `BlamedLineChange`.
 */
export type BlamedHunk = StructuredPatchHunk & {
  id: string;
  contributors: Contributor[];
};

type FileDiffBase = {
  isExternal: boolean;
  fileId: string;
  path: string;
};

export type TextFileDiff = FileDiffBase & {
  isExternal: false;
  baseline: string | null;
  current: string | null;
  baselineOid: string | null;
  currentOid: string | null;
  lineChanges: BlamedLineChange[];
  hunks: BlamedHunk[];
};

// External file diff - single atomic "hunk"
export type ExternalFileDiff = FileDiffBase & {
  isExternal: true;
  changeType: 'created' | 'deleted' | 'modified';
  baselineOid: string | null; // null = file didn't exist
  currentOid: string | null; // null = file was deleted
  contributor: Contributor; // who made this change
  hunkId: string; // single ID for accept/reject
};

export type FileDiff = TextFileDiff | ExternalFileDiff;

export const fileDiffSnapshotSchema = z.object({
  path: z.string(),
  fileId: z.string(),
  isExternal: z.boolean(),
  baselineOid: z.string().nullable(),
  currentOid: z.string().nullable(),
  hunkIds: z.array(z.string()),
  contributors: z.array(z.string()),
});

export type FileDiffSnapshot = z.infer<typeof fileDiffSnapshotSchema>;

export const environmentDiffSnapshotSchema = z.object({
  pending: z.array(fileDiffSnapshotSchema),
  summary: z.array(fileDiffSnapshotSchema),
});

export type EnvironmentDiffSnapshot = z.infer<
  typeof environmentDiffSnapshotSchema
>;

// Result types for acceptAndRejectHunks
export type TextFileResult = {
  isExternal: false;
  newBaseline?: string | null;
  newCurrent?: string | null;
};

export type ExternalFileResult = {
  isExternal: true;
  newBaselineOid?: string | null;
  newCurrentOid?: string | null;
};

export type FileResult = TextFileResult | ExternalFileResult;

export const MAX_DIFF_TEXT_FILE_SIZE = 2 * 1024 * 1024; // 2MB
