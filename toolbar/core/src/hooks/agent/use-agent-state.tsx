import { useContext, useEffect, useState } from 'preact/hooks';
import {
  type AgentState,
  AgentStateType,
} from '@stagewise/agent-interface/toolbar';

import { useAgent } from './use-agent-provider.tsx';
import { type ComponentChildren, createContext } from 'preact';

const fallbackState: AgentState = {
  state: AgentStateType.IDLE,
};

const agentStateContext = createContext<AgentState>(fallbackState);

export function AgentStateProvider({
  children,
}: {
  children?: ComponentChildren;
}) {
  const agent = useAgent().connected;
  const [state, setState] = useState<AgentState>(fallbackState);

  useEffect(() => {
    if (agent !== null) {
      agent.state.getState.subscribe(undefined, {
        onData: (value) => {
          setState(value);
        },
        onError: () => {
          setState(fallbackState);
        },
      });
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
