import { tool } from 'ai';
import { z } from 'zod';

/* Due to an issue in zod schema conversion in the ai sdk,
   the schema descriptions are not properly used for the prompts -
   thus, we include them in the descriptions as well. */
export const DESCRIPTION = `Calling this tool will trigger an update of the stagewise.md file which is used to give [STAGE] early orientation about the project.

Parameters:
- reason (string, REQUIRED): Brief reason for triggering the stagewise.md update (5-50 characters).

Behavior: Use this tool when you have made changes to the workspace that are relevant to the stagewise.md file or you realize that the stagewise.md file is outdated or not present in the system context at all.`;

export const updateStagewiseMdParamsSchema = z.object({
  reason: z
    .string()
    .min(5)
    .max(50)
    .describe(
      'Brief reason for triggering the stagewise.md update (5-50 characters).',
    ),
});

export const updateStagewiseMdTool = (
  onUpdateStagewiseMd: ({ reason }: { reason: string }) => Promise<void>,
) =>
  tool({
    description: DESCRIPTION,
    inputSchema: updateStagewiseMdParamsSchema,
    execute: async ({ reason }) => {
      await onUpdateStagewiseMd({ reason });
      return {
        message: 'Successfully triggered stagewise.md update',
        reason,
      };
    },
  });
