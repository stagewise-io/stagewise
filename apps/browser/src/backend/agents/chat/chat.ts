import { ChatAgent } from '@stagewise/agent-core/agents';

/**
 * Browser-host chat agent.
 *
 * Extends the host-agnostic {@link ChatAgent} from `@stagewise/agent-core`
 * by injecting the browser-specific tools (sandbox JS execution, shell,
 * library docs, linting, console logs, interactive user questions) on
 * top of the universal file-op baseline. Registered under
 * `AgentTypes.CHAT` in the browser's {@link AgentTypeRegistry}.
 */
export class BrowserChatAgent extends ChatAgent {
  // Return type uses `any` to bridge the `Tool` shape divergence between the
  // copy of `@ai-sdk/provider-utils` that `'ai'` resolves to at the host's
  // compile site and the copy `@stagewise/agent-core`'s `.d.ts` references
  // through its nested `ai` dependency. Runtime shape is identical; this
  // override is only relaxed at the type layer so pnpm's hoisted-duplicate
  // does not break the subclass signature check.
  protected async getAdditionalTools(): Promise<Record<string, any>> {
    const id = this.instanceId;
    const box = this.toolbox;
    return {
      executeSandboxJs: await box.getTool('executeSandboxJs', id),
      listLibraryDocs: await box.getTool('listLibraryDocs', id),
      searchInLibraryDocs: await box.getTool('searchInLibraryDocs', id),
      getLintingDiagnostics: await box.getTool('getLintingDiagnostics', id),
      readConsoleLogs: await box.getTool('readConsoleLogs', id),
      askUserQuestions: await box.getTool('askUserQuestions', id),
      createShellSession: await box.getTool('createShellSession', id),
      executeShellCommand: await box.getTool('executeShellCommand', id),
    };
  }
}
