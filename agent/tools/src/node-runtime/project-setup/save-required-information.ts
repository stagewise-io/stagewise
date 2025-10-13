import { tool } from 'ai';
import { validateToolOutput } from '../..';
import { z } from 'zod';

export const DESCRIPTION =
  'Save the required information for the project setup';

export const saveRequiredInformationParamsSchema = z.object({
  rootProjectPath: z.string().describe('The root project path'),
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
      rootProjectPath: params.rootProjectPath,
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
