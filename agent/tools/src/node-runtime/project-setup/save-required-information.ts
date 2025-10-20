import { tool } from 'ai';
import { validateToolOutput } from '../..';
import { z } from 'zod';

export const DESCRIPTION =
  'Save the required information for the project setup';

export const saveRequiredInformationParamsSchema = z.object({
  agentAccessPath: z
    .string()
    .describe(
      "The relative path to which the agent should have access. In monorepos, this could be a relative path that moves up one or more levels. The alias '{GIT_REPO_ROOT}' is the reocmmended default value and simply gives the agent access to the whole parent git repository.",
    ),
  appPath: z.string().describe('The app path'),
  appPort: z.number().describe('The app port'),
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
