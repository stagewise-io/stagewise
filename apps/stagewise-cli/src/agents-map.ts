import { AgentTypes } from '@stagewise/agent-core/types/agent';
import type { ChatAgent } from '@stagewise/agent-core/agents';

declare module '@stagewise/agent-core/agents' {
  interface AgentTypeMap {
    [AgentTypes.CHAT]: typeof ChatAgent;
  }
}
