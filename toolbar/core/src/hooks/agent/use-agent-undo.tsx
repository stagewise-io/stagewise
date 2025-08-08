import { useContext, useMemo, useCallback } from 'react';
import type { UndoExecuteResult } from '@stagewise/agent-interface/toolbar';
import { type ReactNode, createContext } from 'react';
import { useAgents } from './use-agent-provider.tsx';

type UndoContext = {
  /** Request an undo operation from the configured agent */
  requestUndo: () => Promise<UndoExecuteResult>;
  /** Whether undo functionality is available (agent connected) */
  isUndoAvailable: boolean;
};

const agentUndoContext = createContext<UndoContext>({
  requestUndo: () =>
    Promise.resolve({ success: false, error: 'No agent connected' }),
  isUndoAvailable: false,
});

export const AgentUndoProvider = ({ children }: { children?: ReactNode }) => {
  const agent = useAgents().connected;

  const requestUndo = useCallback(async (): Promise<UndoExecuteResult> => {
    if (!agent) {
      console.debug('[AgentUndoProvider] No agent connected for undo request');
      return { success: false, error: 'No agent connected' };
    }

    try {
      console.debug('[AgentUndoProvider] Sending undo request to agent');
      const result = await agent.agent.undo.sendUndoRequest.mutate({});
      console.debug('[AgentUndoProvider] Undo request completed:', result);
      return result;
    } catch (error) {
      console.error('[AgentUndoProvider] Error sending undo request:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }, [agent]);

  const contextValue = useMemo(
    () => ({
      requestUndo,
      isUndoAvailable: agent !== null,
    }),
    [requestUndo, agent],
  );

  return (
    <agentUndoContext.Provider value={contextValue}>
      {children}
    </agentUndoContext.Provider>
  );
};

export const useAgentUndo = () => {
  return useContext(agentUndoContext);
};
