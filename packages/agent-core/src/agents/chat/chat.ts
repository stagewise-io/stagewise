import type { StepResult, Tool, ToolSet } from 'ai';
import { z } from 'zod';
import { BaseAgent, type BaseAgentConfig } from '../base-agent';
import { AgentTypes } from '../../types/agent';
import { isPlanPath } from '../../plans/ownership';
import type { WriteToolInput } from '../../types/tools';
import { buildChatSystemPrompt } from './system-prompt-builder/system-prompt-builder';

/**
 * Primary chat agent. Host registers this class on {@link AgentTypeRegistry}.
 */
export class ChatAgent extends BaseAgent<never, undefined> {
  public static readonly agentType = AgentTypes.CHAT;
  public static readonly config = {
    persistent: true,
    defaultModelId: 'claude-sonnet-4.6',
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
    return buildChatSystemPrompt({
      host: this.host,
      domainAdapterRegistry: this.domainAdapterRegistry,
    });
  };

  /**
   * Stop generation after the agent creates a new plan file.
   *
   * When the step contains a `write` tool result whose path matches `plans/*.md`
   * (i.e. the file was just created, not updated), we return `false`
   * so the agent goes idle and the plan-creation tool part is the
   * last visible element in the chat.
   */
  protected onStepFinished(result: StepResult<ToolSet>): boolean {
    for (const tr of result.toolResults) {
      if (tr.toolName !== 'write') continue;

      const input = tr.input as WriteToolInput;
      if (!isPlanPath(input.path)) continue;

      // Plan was created or updated — stop so the UI can present it cleanly.
      return false;
    }

    return true;
  }

  /**
   * Template hook for host-specific tools (browser, shell, sandbox, …).
   *
   * Subclasses override this to inject the tools their host implements
   * (e.g. `executeSandboxJs`, `executeShellCommand`). The base
   * {@link ChatAgent} returns an empty record so it remains
   * host-agnostic and works in headless hosts that ship only the
   * universal file-op toolset.
   *
   * Returned `null` entries (typical when the toolbox cannot satisfy a
   * tool name in the current context) are filtered out by
   * {@link ChatAgent.getTools} after merging.
   */
  protected async getAdditionalTools(): Promise<Record<string, Tool | null>> {
    return {};
  }

  protected async getTools(): Promise<Partial<ToolSet>> {
    const id = this.instanceId;
    const box = this.toolbox;
    const workspaceMdRelativePath = this.host.workspaceMdRelativePath();
    const baseline: Record<string, Tool | null> = {
      read: await box.getTool('read', id),
      write: await box.getTool('write', id),
      copy: await box.getTool('copy', id),
      multiEdit: await box.getTool('multiEdit', id),
      delete: await box.getTool('delete', id),
      glob: await box.getTool('glob', id),
      grepSearch: await box.getTool('grepSearch', id),
      updateWorkspaceMd: this.getSpawnChildAgentTool(
        `Triggers an update of the \`${workspaceMdRelativePath}\` file. Use this whenever you find that the content of the file \`${workspaceMdRelativePath}\` in the system context is outdated or needs to be updated. Provide a brief reason for the update. Most importantly, provide the mount prefix of the workspace to update.`,
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
    const extra = await this.getAdditionalTools();
    return Object.fromEntries(
      Object.entries({ ...baseline, ...extra }).filter(
        ([, tool]) => tool !== null,
      ),
    ) as Partial<ToolSet>;
  }
}
