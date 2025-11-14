import { tool } from 'ai';
import { validateToolOutput } from '../..';
import { z } from 'zod';
import { rethrowCappedToolOutputError } from '../../utils/error';

export const DESCRIPTION = `Save workspace configuration to persist setup. Final step in setup process. IMPORTANT: MUST only be called after all required information is gathered.

Parameters:
- agentAccessPath (string, REQUIRED): Relative path defining agent's file access scope, relative to appPath. Values: "." for app-only access, "../.." to navigate up levels, "{GIT_REPO_ROOT}" for full git repository access (recommended). Must be valid relative path or special token.
- appPath (string, REQUIRED): Absolute filesystem path to the specific app/package directory (e.g., "/Users/user/project/apps/website"). In non-monorepos, typically equals workspace root. In monorepos, points to specific package directory. Must be valid absolute path.
- appPort (number, REQUIRED): Local development server port (e.g., 3000, 5173, 8080). Must be valid port number (1-65535).

Behavior: Persists configuration to workspace settings. Call only when setup is complete and all values validated.`;

export const saveRequiredInformationParamsSchema = z.object({
  agentAccessPath: z
    .string()
    .describe(
      'Relative path defining agent\'s file access scope, relative to appPath. Values: "." for app-only access, "../.." to navigate up levels, "{GIT_REPO_ROOT}" for full git repository access (recommended). Must be valid relative path or special token.',
    ),
  appPath: z
    .string()
    .describe(
      'Absolute filesystem path to the specific app/package directory (e.g., "/Users/user/project/apps/website"). In non-monorepos, typically equals workspace root. In monorepos, points to specific package directory. Must be valid absolute path.',
    ),
  appPort: z
    .number()
    .describe(
      'Local development server port (e.g., 3000, 5173, 8080). Must be valid port number (1-65535).',
    ),
});

export type SaveRequiredInformationParams = z.infer<
  typeof saveRequiredInformationParamsSchema
>;

/**
 * Save required information tool
 * Save the required information for the project setup
 * Returns the required information that was saved
 */
export async function saveRequiredInformationToolExecute(
  params: SaveRequiredInformationParams,
  onSaveInformation: (params: SaveRequiredInformationParams) => Promise<void>,
) {
  try {
    await onSaveInformation(params);
    return {
      success: true,
      message: `Required information saved`,
      result: {
        agentAccessPath: params.agentAccessPath,
        appPath: params.appPath,
        appPort: params.appPort,
      },
    };
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}

export const saveRequiredInformationTool = (
  onSaveInformation: (params: SaveRequiredInformationParams) => Promise<void>,
) =>
  tool({
    name: 'saveRequiredInformationTool',
    description: DESCRIPTION,
    inputSchema: saveRequiredInformationParamsSchema,
    execute: async (args) => {
      return validateToolOutput(
        await saveRequiredInformationToolExecute(args, onSaveInformation),
      );
    },
  });
