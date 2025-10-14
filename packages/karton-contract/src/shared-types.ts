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
    projectRoot: z
      .string()
      .describe(
        'The root folder path of the web project in open_path (can be different from open_path, e.g. when the USER has opened a package inside a monorepo).',
      ),
    appPath: z
      .string()
      .describe(
        'The path of the app - can be different from the workspace path (e.g. in case of a monorepo)',
      ),
    appPort: z.number(),
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
