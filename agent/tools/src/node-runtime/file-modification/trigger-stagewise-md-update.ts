import { tool } from 'ai';
import { z } from 'zod';

export const DESCRIPTION = `Calling this tool will trigger an update of the stagewise.md file which is used to give [STAGE] early orientation about the project.

IMPORTANT:
Use this tool when you have made changes to the workspace that are relevant to the stagewise.md file or you realize that the stagewise.md file is outdated or not present in the system context at all.`;

export const updateStagewiseMdTool = (
  onUpdateStagewiseMd: () => Promise<void>,
) =>
  tool({
    name: 'updateStagewiseMdTool',
    description: DESCRIPTION,
    inputSchema: z.object({}),
    execute: async () => {
      await onUpdateStagewiseMd();
      return {
        message: 'Successfully triggered stagewise.md update',
      };
    },
  });
