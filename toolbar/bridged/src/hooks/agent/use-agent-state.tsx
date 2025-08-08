import { useContext, useEffect, useState } from 'react';
import {
  type AgentState,
  AgentStateType,
} from '@stagewise/agent-interface/toolbar';

import { useAgents } from './use-agent-provider.js';
import { type ReactNode, createContext } from 'react';

const fallbackState: AgentState = {
  state: AgentStateType.IDLE,
};

const agentStateContext = createContext<AgentState>(fallbackState);

export function AgentStateProvider({ children }: { children?: ReactNode }) {
  const agent = useAgents().connected;
  const [state, setState] = useState<AgentState>(fallbackState);

  useEffect(() => {
    if (agent) {
      const subscription = agent.agent.state.getState.subscribe(undefined, {
        onData: (value) => {
          // Double-check that agent is still available when data arrives
          setState(value);
        },
        onError: () => {
          setState(fallbackState);
        },
      });

      // Cleanup function to unsubscribe when agent changes or component unmounts
      return () => {
        try {
          subscription.unsubscribe();
        } catch (error) {
          console.debug(
            '[AgentStateProvider] Error unsubscribing from agent state:',
            error,
          );
        }
      };
    } else {
      setState(fallbackState);
    }
  }, [agent]);

  return (
    <agentStateContext.Provider value={state}>
      {children}
    </agentStateContext.Provider>
  );
}

export const useAgentState = () => useContext(agentStateContext);
