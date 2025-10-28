import { z } from 'zod';

/**
 * GLOBAL CONFIG CAPABILITIES
 */

export const globalConfigSchema = z
  .object({
    telemetryLevel: z.enum(['off', 'anonymous', 'full']).default('anonymous'),
  })
  .loose();

export type GlobalConfig = z.infer<typeof globalConfigSchema>;

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
    appPort: z
      .number()
      .describe('The port on which the app dev server serves the app preview'),
    useAutoFoundAppPort: z
      .boolean()
      .optional()
      .describe(
        'Whether to use the automatically found app port. If true, stagewise will try to find the app port automatically and use that instead of the configured value.',
      )
      .default(true),
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
