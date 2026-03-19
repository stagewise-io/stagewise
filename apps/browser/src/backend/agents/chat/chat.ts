import { BaseAgent, type BaseAgentConfig } from '../shared/base-agent';
import { AgentTypes } from '@shared/karton-contracts/ui/agent';
import type { StagewiseToolSet } from '@shared/karton-contracts/ui/agent/tools/types';
import { buildChatSystemPrompt } from './system-prompt-builder/system-prompt-builder';
import z from 'zod';
export class ChatAgent extends BaseAgent<never, undefined> {
  public static readonly agentType = AgentTypes.CHAT;
  public static readonly config = {
    persistent: true,
    defaultModelId: 'claude-sonnet-4-6' as const,
    allowModelSelection: true,
    requiredCapabilities: {
      inputModalities: {
        text: true,
        image: true,
        video: false,
        audio: false,
        file: true,
      },
      outputModalities: {
        text: true,
        image: false,
        video: false,
        audio: false,
        file: false,
      },
      toolCalling: true,
    },
    finishToolOutputSchema: undefined,
    allowUserInput: true,
    generateTitles: true,
    updateTitlesEveryNUserMessages: 20,
    historyCompressionThreshold: 0.5,
    minUncompressedMessages: 12, // We keep this relatively high to ensure we always have enough turns for full context for the agent
  } satisfies BaseAgentConfig<never>;

  protected getSystemPrompt = (): string => {
    return buildChatSystemPrompt();
  };

  protected getTools = async () => {
    const id = this.instanceId;
    const box = this.toolbox;
    const tools = {
      executeSandboxJs: await box.getTool('executeSandboxJs', id),
      listLibraryDocs: await box.getTool('listLibraryDocs', id),
      searchInLibraryDocs: await box.getTool('searchInLibraryDocs', id),
      getLintingDiagnostics: await box.getTool('getLintingDiagnostics', id),
      deleteFile: await box.getTool('deleteFile', id),
      overwriteFile: await box.getTool('overwriteFile', id),
      readFile: await box.getTool('readFile', id),
      listFiles: await box.getTool('listFiles', id),
      glob: await box.getTool('glob', id),
      multiEdit: await box.getTool('multiEdit', id),
      grepSearch: await box.getTool('grepSearch', id),
      readConsoleLogs: await box.getTool('readConsoleLogs', id),
      askUserQuestions: await box.getTool('askUserQuestions', id),
      executeShellCommand: await box.getTool('executeShellCommand', id),
      // IMPORTANT: The type for this tool is defined in @apps/browser/src/shared/karton-contracts/ui/agent/tools/types.ts - update the type when you change this input schema.
      updateWorkspaceMd: this.getSpawnChildAgentTool(
        'Triggers an update of the `.stagewise/WORKSPACE.md` file. Use this whenever you find that the content of the file `.stagewise/WORKSPACE.md` in the system context is outdated or needs to be updated. Provide a brief reason for the update. Most importantly, provide the mount prefix of the workspace to update.',
        z.object({
          updateReason: z.string().min(5),
          mountPrefix: z.string().min(1),
        }),
        AgentTypes.WORKSPACE_MD,
        (input) => {
          return {
            updateReason: input.updateReason,
            mountPrefix: input.mountPrefix,
            parentAgentInstanceId: this.instanceId,
          };
        },
        'asynchronous',
      ),
    };
    // Filter out null tools that miss dependencies in the toolbox (e.g. no workspace connected)
    return Object.fromEntries(
      Object.entries(tools).filter(([_, tool]) => tool !== null),
    ) as Partial<StagewiseToolSet>;
  };
}
