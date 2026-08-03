import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { AgentAttentionEntry } from '../_lib/agent-attention';

const HistoryAttentionContext = createContext<readonly AgentAttentionEntry[]>(
  [],
);
const SetHistoryAttentionContext = createContext<Dispatch<
  SetStateAction<AgentAttentionEntry[]>
> | null>(null);

export function AgentAttentionProvider({ children }: { children: ReactNode }) {
  const [historyEntries, setHistoryEntries] = useState<AgentAttentionEntry[]>(
    [],
  );

  return (
    <SetHistoryAttentionContext.Provider value={setHistoryEntries}>
      <HistoryAttentionContext.Provider value={historyEntries}>
        {children}
      </HistoryAttentionContext.Provider>
    </SetHistoryAttentionContext.Provider>
  );
}

export function useHistoryAttentionEntries() {
  return useContext(HistoryAttentionContext);
}

export function useSetHistoryAttentionEntries() {
  const setEntries = useContext(SetHistoryAttentionContext);
  if (!setEntries) {
    throw new Error(
      'useSetHistoryAttentionEntries must be used inside AgentAttentionProvider',
    );
  }
  return setEntries;
}
