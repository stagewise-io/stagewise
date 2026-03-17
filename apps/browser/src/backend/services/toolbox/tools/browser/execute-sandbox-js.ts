import {
  type ExecuteSandboxJsToolInput,
  executeSandboxJsToolInputSchema,
} from '@shared/karton-contracts/ui/agent/tools/types';
import { tool } from 'ai';
import { rethrowCappedToolOutputError } from '../../utils';
import { capToolOutput } from '../../utils';
import type { SandboxService } from '@/services/sandbox';
import type { SandboxFileAttachment } from '@/agents/shared/base-agent/utils';

/* Due to an issue in zod schema conversion in the ai sdk,
   the schema descriptions are not properly used for the prompts -
   thus, we include them in the descriptions as well. */

export const DESCRIPTION = `Execute JavaScript in your persistent, sandboxed Node.js VM context.

Parameters:
- explanation (string, REQUIRED): Concise (max 5 words) human-readable description of what this script does. Examples: "Take a screenshot", "Read workspace files", "Query DOM elements", "Process API response", "Generate image thumbnail".
- script (string, REQUIRED): JavaScript code to execute in the sandbox.
`;

export const executeSandboxJs = (
  sandboxService: SandboxService,
  agentInstanceId: string,
) => {
  return tool({
    description: DESCRIPTION,
    inputSchema: executeSandboxJsToolInputSchema,
    execute: async (params, options) => {
      const { toolCallId } = options as { toolCallId: string };
      sandboxService.setAgentToolCallId(agentInstanceId, toolCallId);
      try {
        const result = await executeSandboxJsToolExecute(
          params,
          agentInstanceId,
          sandboxService,
        );
        const fileWriteCount =
          sandboxService.getAndClearFileWriteCount(agentInstanceId);
        if (fileWriteCount > 0)
          return { ...result, _hasFileWrites: true as const };

        return result;
      } finally {
        sandboxService.clearPendingOutputs(agentInstanceId, toolCallId);
        sandboxService.clearAgentToolCallId(agentInstanceId);
      }
    },
  });
};

async function executeSandboxJsToolExecute(
  params: ExecuteSandboxJsToolInput,
  agentInstanceId: string,
  sandboxService: SandboxService,
) {
  try {
    const { value, outputs, customFileAttachments } =
      await sandboxService.execute(agentInstanceId, params.script);

    const parts: string[] = [...outputs];
    if (value !== undefined && value !== null) {
      parts.push(typeof value === 'string' ? value : JSON.stringify(value));
    }
    const scriptResult = parts.join('\n');

    let validatedAttachments: SandboxFileAttachment[] | undefined;
    if (customFileAttachments.length > 0) {
      validatedAttachments = customFileAttachments.map((att) => ({
        id: att.id,
        mediaType: att.mediaType,
        fileName: att.fileName ?? 'attachment',
        sizeBytes: att.sizeBytes,
      }));
    }

    return {
      message: 'Successfully executed sandbox JavaScript',
      result: capToolOutput(scriptResult),
      _customFileAttachments: validatedAttachments,
    };
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}
