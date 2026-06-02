import { AgentTypes } from '@stagewise/agent-core/types/agent';
import type { ChatAgent, WorkspaceMdAgent } from '@stagewise/agent-core/agents';

declare module '@stagewise/agent-core/agents' {
  interface AgentTypeMap {
    [AgentTypes.CHAT]: typeof ChatAgent;
    [AgentTypes.WORKSPACE_MD]: typeof WorkspaceMdAgent;
  }
}
