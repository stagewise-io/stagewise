import { z } from 'zod';

export const commandMetadataSchema = z.object({
  displayName: z.string(),
  description: z.string(),
});

export type CommandMetadata = z.infer<typeof commandMetadataSchema>;

/**
 * Full command definition used by the backend.
 * Includes `contentPath` for lazy content loading.
 */
export type CommandDefinition = {
  id: string;
  displayName: string;
  description: string;
  source: 'builtin';
  logoSvg: string | null;
  /** Absolute path to content.md — resolved lazily at injection time */
  contentPath: string;
};

/**
 * UI-facing command definition (excludes backend-only fields).
 * Pushed to Karton state at startup.
 */
export type CommandDefinitionUI = {
  id: string;
  displayName: string;
  description: string;
  source: 'builtin';
  logoSvg: string | null;
};
