import { ChatAgent } from '@stagewise/agent-core/agents';

/**
 * CLI-host chat agent.
 *
 * Extends the host-agnostic {@link ChatAgent} from `@stagewise/agent-core`
 * by injecting the shell tools on top of the universal file-op baseline.
 * Registered under `AgentTypes.CHAT` in the CLI's `AgentTypeRegistry`.
 */
export class CliChatAgent extends ChatAgent {
  // Return type uses `any` to bridge the `Tool` shape divergence between the
  // copy of `ai` that resolves at the CLI compile site and the copy that
  // `@stagewise/agent-core` / `@stagewise/agent-shell` reference through
  // their nested `ai` dependency. Runtime shape is identical; this override
  // is only relaxed at the type layer so pnpm's hoisted-duplicate does not
  // break the subclass signature check.
  protected async getAdditionalTools(): Promise<Record<string, any>> {
    const id = this.instanceId;
    const box = this.toolbox;
    return {
      createShellSession: await box.getTool('createShellSession', id),
      executeShellCommand: await box.getTool('executeShellCommand', id),
    };
  }
}
