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
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;
export type TelemetryLevel = UserPreferences['privacy']['telemetryLevel'];

export const defaultUserPreferences: UserPreferences = {
  privacy: {
    telemetryLevel: 'anonymous',
  },
  search: {
    defaultEngineId: 1,
  },
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
 * WORKSPACE CONFIG CAPABILITIES
 */

export const pluginSchema = z.union([
  z.string(),
  z
    .object({
      name: z.string(),
      path: z.string().optional(),
      url: z.string().optional(),
    })
    .refine((data) => (data.path && !data.url) || (!data.path && data.url), {
      message: 'Plugin must have either path or url, but not both',
    }),
]);

export const workspaceConfigSchema = z
  .object({
    agentAccessPath: z
      .string()
      .describe(
        'Relative path to the active workspace path that defines to which paths the agent has access.',
      )
      .default('{GIT_REPO_ROOT}'),
    appExecutionCommand: z
      .string()
      .optional()
      .describe('The command to execute the app'),
    eddyMode: z.enum(['flappy']).optional(),
    autoPlugins: z.boolean().optional(),
    plugins: z.array(pluginSchema).optional(),
  })
  .loose();

export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;

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
