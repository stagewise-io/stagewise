import { useContext, useEffect, useState, useCallback } from 'react';
import { useAgents } from './use-agent-provider';
import { type ReactNode, createContext } from 'react';

interface AgentStateContextValue {
  isWorking: boolean;
  stateDescription?: string;
  stopAgent: () => Promise<void>;
  canStop: boolean;
}

const agentStateContext = createContext<AgentStateContextValue>({
  isWorking: false,
  stateDescription: undefined,
  stopAgent: async () => {},
  canStop: false,
});

export function AgentStateProvider({ children }: { children?: ReactNode }) {
  const agent = useAgents().connected;
  const [isWorking, setIsWorking] = useState(false);
  const [stateDescription, setStateDescription] = useState<
    string | undefined
  >();

  // Listen for state updates from chat
  useEffect(() => {
    if (agent?.chat?.getChatUpdates) {
      const subscription = agent.chat.getChatUpdates.subscribe(undefined, {
        onData: (update) => {
          if (update.type === 'agent-state') {
            setIsWorking(update.isWorking);
            setStateDescription(update.stateDescription);
          }
        },
        onError: () => {
          setIsWorking(false);
          setStateDescription(undefined);
        },
      });

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
      setIsWorking(false);
      setStateDescription(undefined);
    }
  }, [agent]);

  const stopAgent = useCallback(async () => {
    if (agent?.chat?.stop) {
      try {
        await agent.chat.stop.mutate();
      } catch (error) {
        console.error('[AgentStateProvider] Error stopping agent:', error);
        throw error;
      }
    }
  }, [agent]);

  const canStop = isWorking;

  const contextValue: AgentStateContextValue = {
    isWorking,
    stateDescription,
    stopAgent,
    canStop,
  };

  return (
    <agentStateContext.Provider value={contextValue}>
      {children}
    </agentStateContext.Provider>
  );
}

export const useAgentState = () => {
  const context = useContext(agentStateContext);
  return {
    isWorking: context.isWorking,
    stateDescription: context.stateDescription,
    stopAgent: context.stopAgent,
    canStop: context.canStop,
    // For backward compatibility with components expecting state.state
    state: {
      description: context.stateDescription,
    },
  };
};
