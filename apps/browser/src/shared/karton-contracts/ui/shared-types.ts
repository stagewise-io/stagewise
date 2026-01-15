import { z } from 'zod';
import type {
  AnthropicProvider,
  AnthropicProviderOptions,
} from '@ai-sdk/anthropic';
import type {
  OpenAIProvider,
  OpenAIResponsesProviderOptions,
} from '@ai-sdk/openai';
import type {
  GoogleGenerativeAIProvider,
  GoogleGenerativeAIProviderOptions,
} from '@ai-sdk/google';

type AllAnthropicModelIds = Parameters<AnthropicProvider['languageModel']>[0];
type AllOpenAIModelIds = Parameters<OpenAIProvider['languageModel']>[0];
type AllGoogleModelIds = Parameters<
  GoogleGenerativeAIProvider['languageModel']
>[0];

type AnthropicModelIds =
  | Extract<
      AllAnthropicModelIds,
      'claude-haiku-4-5' | 'claude-sonnet-4-5' | 'claude-opus-4-5'
    >
  | 'claude-opus-4-5';

type OpenAIModelIds = Extract<
  AllOpenAIModelIds,
  'gpt-5.2' | 'gpt-5.1-codex-max'
>;

type GoogleModelIds = Extract<AllGoogleModelIds, 'gemini-3-pro-preview'>;

type BaseSettings = {
  modelDisplayName: string;
  modelDescription: string;
  modelContext: string;
  headers?: Record<string, string>;
  thinkingEnabled?: boolean;
};

type AnthropicModelSettings = BaseSettings & {
  modelId: AnthropicModelIds;
  providerOptions: AnthropicProviderOptions;
};

type OpenAIModelSettings = BaseSettings & {
  modelId: OpenAIModelIds;
  providerOptions: OpenAIResponsesProviderOptions;
};

type GoogleModelSettings = BaseSettings & {
  modelId: GoogleModelIds;
  providerOptions: GoogleGenerativeAIProviderOptions;
};

export type ModelSettings =
  | AnthropicModelSettings
  | OpenAIModelSettings
  | GoogleModelSettings;

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
