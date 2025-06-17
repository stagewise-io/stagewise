import type { AgentV1 } from '@/agent-interface';
import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import { useConfig } from '../use-config';
import { useContext, useMemo } from 'preact/hooks';
import { ClassicExtensionAgent } from '@/agents/classic_extension';
import { ClipboardAgent } from '@/agents/clipboard';

const agentContext = createContext<AgentV1 | null>(null);

export function AgentProvider({ children }: { children?: ComponentChildren }) {
  const config = useConfig();

  const agentDefinition = useMemo(
    () => config.config.agent ?? 'classic_extension',
    [config.config.agent],
  );

  const agent = useMemo(() => {
    if (agentDefinition === 'classic_extension') {
      return ClassicExtensionAgent;
    }
    if (agentDefinition === 'clipboard') {
      return ClipboardAgent;
    }
    return agentDefinition;
  }, [agentDefinition]);

  return (
    <agentContext.Provider value={agent}>{children}</agentContext.Provider>
  );
}

export const useAgent = () => useContext(agentContext);
