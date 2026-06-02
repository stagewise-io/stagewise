import type { ToolSet } from 'ai';
import { z } from 'zod';
import { BaseAgent, type BaseAgentConfig } from '../base-agent';
import { AgentTypes } from '../../types/agent';
import filesystemPrimer from './prompts/filesystem.md?raw';
import systemPrompt from './prompts/system-prompt.md?raw';

const finishToolOutputSchema = z.object({
  message: z.string(),
});

export type WorkspaceMdInstanceConfig =
  | { updateReason: string; mountPrefix: string; parentAgentInstanceId: string }
  | { workspacePath: string }
  | undefined;

/**
 * Background agent that creates or updates the project WORKSPACE.md
 * file (default mount-relative path `.stagewise/WORKSPACE.md`; the
 * host can override via `AgentHost.workspaceMdRelativePath()`).
 * Host registers this class on {@link AgentTypeRegistry}.
 */
export class WorkspaceMdAgent extends BaseAgent<
  typeof finishToolOutputSchema,
  WorkspaceMdInstanceConfig
> {
  public static readonly agentType = AgentTypes.WORKSPACE_MD;
  public static readonly config = {
    persistent: false, // Background task, no persistence needed
    defaultModelId: 'claude-haiku-4.5',
    allowModelSelection: false, // Fixed model for consistency
    requiredCapabilities: {
      inputModalities: {
        text: true,
        image: false,
        video: false,
        audio: false,
        file: false,
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
    allowUserInput: false, // Autonomous agent - no user input
    generateTitles: false, // Background task - no title needed
    finishToolOutputSchema: finishToolOutputSchema,
    maxRetries: 2, // Retry on failure
  } satisfies BaseAgentConfig<typeof finishToolOutputSchema>;

  private get workspaceMdRelativePath(): string {
    return this.host.workspaceMdRelativePath();
  }

  protected getSystemPrompt = async (): Promise<string> => {
    const relativePath = this.workspaceMdRelativePath;
    const filesystem = filesystemPrimer.replaceAll(
      '{workspaceMdRelativePath}',
      relativePath,
    );
    const system = systemPrompt.replaceAll(
      '{workspaceMdRelativePath}',
      relativePath,
    );
    return `${filesystem}\n\n${system}`;
  };

  protected async onCreated(): Promise<void> {
    let reason: string | undefined;
    let workspacePath: string;

    if (this.instanceConfig && 'workspacePath' in this.instanceConfig) {
      workspacePath = this.instanceConfig.workspacePath;
      await this.toolbox.handleMountWorkspace(this.instanceId, workspacePath);
    } else {
      reason = this.instanceConfig?.updateReason;
      const parentMounts = this.toolbox.getMountedPathsForAgent(
        this.instanceConfig?.parentAgentInstanceId ?? '',
      );
      const mountPrefix = this.instanceConfig?.mountPrefix;
      const path = parentMounts.get(mountPrefix ?? '');
      if (!path)
        throw new Error(
          `Mount ${mountPrefix} not found for agent ${this.instanceConfig?.parentAgentInstanceId ?? ''}`,
        );
      workspacePath = path;
      await this.toolbox.handleMountWorkspace(this.instanceId, path);
    }

    // Resolve the mount prefix for the workspace we just mounted
    const mounts = this.toolbox.getMountedPathsForAgent(this.instanceId);
    let resolvedPrefix = '';
    for (const [prefix, mountedPath] of mounts) {
      if (mountedPath === workspacePath) {
        resolvedPrefix = prefix;
        break;
      }
    }

    const workspaceMdEntries = await this.toolbox.getWorkspaceMd(
      this.instanceId,
    );

    const relativePath = this.workspaceMdRelativePath;
    const workspaceMdParts = workspaceMdEntries
      .map(
        (e) =>
          `<file path="${e.mountPrefix}/${relativePath}">${e.content}</file>`,
      )
      .join('\n');

    await this.sendUserMessage({
      id: '',
      role: 'user',
      parts: [
        {
          type: 'text',
          text: `
Your workspace is mounted at prefix \`${resolvedPrefix}\`. Use \`${resolvedPrefix}/\` for all tool calls.

${reason ? `Update the file \`${resolvedPrefix}/${relativePath}\`. You need to update because of the following reason: ${reason}` : `Generate a new file \`${resolvedPrefix}/${relativePath}\` after analyzing the project.`}

${workspaceMdParts}`.trim(),
        },
      ],
    });
  }

  protected getTools = async () => {
    const id = this.instanceId;
    const box = this.toolbox;
    const tools = {
      read: await box.getTool('read', id),
      write: await box.getTool('write', id),
      multiEdit: await box.getTool('multiEdit', id),
      glob: await box.getTool('glob', id),
      grepSearch: await box.getTool('grepSearch', id),
    };
    // Filter out null tools that miss dependencies in the toolbox
    return Object.fromEntries(
      Object.entries(tools).filter(([_, tool]) => tool !== null),
    ) as Partial<ToolSet>;
  };
}
