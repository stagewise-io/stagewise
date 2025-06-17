import type { AgentV1 } from '@/agent-interface';

export const ClassicExtensionAgent: AgentV1 = {
  onGetAvailableSessions: () => Promise.resolve([]),
};
