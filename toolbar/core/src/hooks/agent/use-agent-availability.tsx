import { useContext, useEffect, useState } from 'preact/hooks';
import type { AgentAvailabilityInfo } from '../../agent-interface.ts';
import { useAgent } from './use-agent-provider.tsx';
import { type ComponentChildren, createContext } from 'preact';

const agentAvailabilityContext = createContext<AgentAvailabilityInfo>({
  isAvailable: false,
});

export function AgentAvailabilityProvider({
  children,
}: {
  children?: ComponentChildren;
}) {
  const agent = useAgent();
  const [availability, setAvailability] = useState<AgentAvailabilityInfo>({
    isAvailable: false,
  });

  const handleAvailabilityChange = (availability: AgentAvailabilityInfo) => {
    setAvailability(availability);
  };

  useEffect(() => {
    agent.registerAgentAvailabilityHandler(handleAvailabilityChange);
    agent.onAgentAvailabilitySyncRequest().then((availability) => {
      setAvailability(availability);
    });
  }, [agent]);

  return (
    <agentAvailabilityContext.Provider value={availability}>
      {children}
    </agentAvailabilityContext.Provider>
  );
}

export const useAgentAvailability = () => useContext(agentAvailabilityContext);
