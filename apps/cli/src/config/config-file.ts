import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ConfigFile } from './types';

// Zod schema for plugin configuration
const pluginSchema = z.union([
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

// Zod schema for the config file
const configFileSchema = z.object({
  port: z
    .number()
    .int()
    .min(1)
    .max(65535)
    .optional()
    .describe('Port number for Stagewise server'),
  appPort: z
    .number()
    .int()
    .min(1)
    .max(65535)
    .optional()
    .describe('Port number for your development app'),
  appHttps: z
    .boolean()
    .optional()
    .describe('Whether the development app uses HTTPS'),
  autoPlugins: z.boolean().optional(),
  plugins: z.array(pluginSchema).optional(),
});

export const CONFIG_FILE_NAME = 'stagewise.json';

export interface ConfigLoadError {
  type: 'json' | 'validation' | 'other';
  message: string;
  details?: string;
}

export const loadConfigFile = async (
  dir: string,
): Promise<ConfigFile | null> => {
  const configPath = path.join(dir, CONFIG_FILE_NAME);

  try {
    const fileContent = await fs.readFile(configPath, 'utf-8');
    let parsedContent: ConfigFile;

    // Parse JSON with better error handling
    try {
      parsedContent = JSON.parse(fileContent);
    } catch (jsonError) {
      const error: ConfigLoadError = {
        type: 'json',
        message: `Failed to parse ${CONFIG_FILE_NAME}`,
        details:
          jsonError instanceof Error
            ? jsonError.message
            : 'Invalid JSON syntax',
      };
      throw error;
    }

    // Extract eddyMode before validation (keep it undocumented)
    const eddyMode = parsedContent.eddyMode;

    // Validate with zod
    try {
      const validatedConfig = configFileSchema.parse(parsedContent);
      // Add eddyMode back if it exists
      const result: ConfigFile = validatedConfig;
      if (eddyMode !== undefined) {
        result.eddyMode = eddyMode;
      }
      return result;
    } catch (zodError) {
      if (zodError instanceof z.ZodError) {
        const issues = zodError.errors.map((err) => {
          const path = err.path.join('.');
          const message = err.message;

          // Provide more helpful messages for common errors
          if (err.code === 'invalid_type') {
            if (path === 'port' || path === 'appPort') {
              return `${path}: Must be a number (e.g., ${path}: 3000)`;
            }
            return `${path ? `${path}: ` : ''}Expected ${err.expected}, but got ${err.received}`;
          } else if (
            err.code === 'too_small' &&
            (path === 'port' || path === 'appPort')
          ) {
            return `${path}: Port number must be between 1 and 65535`;
          } else if (
            err.code === 'too_big' &&
            (path === 'port' || path === 'appPort')
          ) {
            return `${path}: Port number must be between 1 and 65535`;
          } else if (path === 'plugins' && err.code === 'invalid_union') {
            return 'plugins: Each plugin must be either a string (e.g., "@my/plugin") or an object with name and either path or url';
          } else if (
            path.includes('plugins') &&
            message.includes('path or url')
          ) {
            return `${path}: Plugin must have either "path" or "url", but not both`;
          }

          return path ? `${path}: ${message}` : message;
        });

        const error: ConfigLoadError = {
          type: 'validation',
          message: `Invalid configuration in ${CONFIG_FILE_NAME}`,
          details: issues.join('\n'),
        };
        throw error;
      }
      throw zodError;
    }
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      // File doesn't exist - this is fine
      return null;
    }

    // Re-throw our custom errors
    if (error && typeof error === 'object' && 'type' in error) {
      throw error;
    }

    // Unknown error
    const unknownError: ConfigLoadError = {
      type: 'other',
      message: `Failed to load ${CONFIG_FILE_NAME}`,
      details: error instanceof Error ? error.message : 'Unknown error',
    };
    throw unknownError;
  }
};

export const saveConfigFile = async (
  dir: string,
  config: ConfigFile,
): Promise<void> => {
  const configPath = path.join(dir, CONFIG_FILE_NAME);

  // Validate before saving
  const validatedConfig = configFileSchema.parse(config);

  // Pretty print the JSON
  const content = JSON.stringify(validatedConfig, null, 2);

  await fs.writeFile(configPath, content, 'utf-8');
};

export const configFileExists = async (dir: string): Promise<boolean> => {
  const configPath = path.join(dir, CONFIG_FILE_NAME);

  try {
    await fs.access(configPath);
    return true;
  } catch {
    return false;
  }
};
