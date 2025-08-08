import { useContext, useEffect, useState } from 'react';
import {
  AgentAvailabilityError,
  type AgentAvailability,
} from '@stagewise/agent-interface/toolbar';
import { useAgents } from './use-agent-provider.js';
import { type ReactNode, createContext } from 'react';

const agentAvailabilityContext = createContext<AgentAvailability>({
  isAvailable: false,
  error: AgentAvailabilityError.NO_CONNECTION,
});

export function AgentAvailabilityProvider({
  children,
}: {
  children?: ReactNode;
}) {
  const { connected: agent } = useAgents();
  const [availability, setAvailability] = useState<AgentAvailability>({
    isAvailable: false,
    error: AgentAvailabilityError.NO_CONNECTION,
  });

  useEffect(() => {
    if (agent) {
      const subscription = agent.agent.availability.getAvailability.subscribe(
        undefined,
        {
          onData: (value) => {
            // Double-check that agent is still available when data arrives
            setAvailability(value);
          },
          onError: () => {
            setAvailability({
              isAvailable: false,
              error: AgentAvailabilityError.NO_CONNECTION,
            });
          },
        },
      );

      // Cleanup function to unsubscribe when agent changes or component unmounts
      return () => {
        try {
          subscription.unsubscribe();
        } catch (error) {
          console.debug(
            '[AgentAvailabilityProvider] Error unsubscribing from availability:',
            error,
          );
        }
      };
    } else {
      setAvailability({
        isAvailable: false,
        error: AgentAvailabilityError.NO_CONNECTION,
      });
    }
  }, [agent]);

  return (
    <agentAvailabilityContext.Provider value={availability}>
      {children}
    </agentAvailabilityContext.Provider>
  );
}

export const useAgentAvailability = () => useContext(agentAvailabilityContext);
